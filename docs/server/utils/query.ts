import type { H3Event } from "h3";
import { hash } from "ohash";

type Query = Record<string, unknown>;

/** Caps every public parameter well below the library's own ceilings. */
export const LIMITS = {
  target: 2048,
  parameter: 64,
  snapshots: 50,
  /** Source view of a whole page; the library's own ceiling. */
  contentChars: 200_000,
  diffChars: 20_000,
  diffContext: 20,
  /** A Wayback prefix listing from Cloudflare often needs more than 25 seconds. */
  timeout: 45_000,
  bodyTimeout: 45_000,
} as const;

function raw(query: Query, key: string): string | undefined {
  const value = query[key];
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

export function readString(query: Query, key: string, max: number): string | undefined {
  const value = raw(query, key)?.trim();
  if (!value) {
    return undefined;
  }
  if (value.length > max) {
    throw createError({ statusCode: 400, statusMessage: `${key} must be at most ${max} characters` });
  }
  return value;
}

export function requireString(query: Query, key: string, max: number): string {
  const value = readString(query, key, max);
  if (!value) {
    throw createError({ statusCode: 400, statusMessage: `${key} is required` });
  }
  return value;
}

export function readInt(query: Query, key: string, min: number, max: number): number | undefined {
  const value = raw(query, key);
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw createError({ statusCode: 400, statusMessage: `${key} must be an integer between ${min} and ${max}` });
  }
  return parsed;
}

export function readBoolean(query: Query, key: string): boolean | undefined {
  const value = raw(query, key);
  if (value === undefined) {
    return undefined;
  }
  return value === "true" || value === "1";
}

/** Stable cache key from the parameters that reach the library, so two spellings of one query share an entry. */
export function cacheKey(prefix: string, params: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `${prefix}:${JSON.stringify(entries)}`;
}

/** Turns a library error into the 4xx the browser can show. */
export function toHttpError(error: unknown): never {
  if (error && typeof error === "object" && "statusCode" in error) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  throw createError({ statusCode: 400, statusMessage: message.slice(0, 300) });
}

export function markPublic(event: H3Event, seconds: number): void {
  setResponseHeader(event, "Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`);
}

/** A tool answer as the docs API returns it. */
export interface ToolAnswer<TDetails> {
  text: string;
  details: TDetails;
  fetchedAt: string;
}

/**
 * Turns an executor result into the API answer, refusing to cache a failure.
 *
 * The executors report a failed query as a normal result with `isError`, which is
 * right for an agent transcript. Cached for hours it would pin a provider timeout
 * to every later visitor, so a failure becomes a 502 that carries the same text.
 */
export function toolAnswer<TDetails>(
  result: { content: Array<{ type: "text"; text: string }>; details: TDetails; isError?: boolean },
  failed: boolean,
): ToolAnswer<TDetails> {
  const answer = { text: result.content[0]?.text ?? "", details: result.details, fetchedAt: new Date().toISOString() };
  if (result.isError || failed) {
    throw createError({ statusCode: 502, statusMessage: "The archive query did not produce a usable answer", data: answer });
  }
  return answer;
}

/** Uncached archive queries one client may start per minute; cache hits are free. */
export const RATE_LIMIT = 30;

/**
 * Counts the archive queries a client starts in the current minute and refuses the ones past the limit.
 *
 * Only a cache miss counts, so a demo that replays warmed answers never trips it, and
 * the archives behind the worker see at most this many new questions from one address.
 */
export async function assertRateLimit(event: H3Event): Promise<void> {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? getRequestHeader(event, "cf-connecting-ip") ?? "unknown";
  const minute = Math.floor(Date.now() / 60_000);
  const key = `docs:rate:${hash(ip)}:${minute}`;
  const storage = useStorage("cache");
  const count = Number((await storage.getItem<number>(key).catch(() => 0)) ?? 0) + 1;
  await storage.setItem(key, count, { ttl: 120 }).catch(() => undefined);
  if (count > RATE_LIMIT) {
    setResponseHeader(event, "Retry-After", String(60 - (Math.floor(Date.now() / 1000) % 60)));
    throw createError({
      statusCode: 429,
      statusMessage: `More than ${RATE_LIMIT} new archive queries in a minute from one address; cached answers are not counted. Wait a moment.`,
    });
  }
}

/** How long an answer with a failed provider stays cached; long enough to absorb a burst, short enough to forget an outage. */
export const DEGRADED_TTL = 60 * 5;

interface CachedEntry<T> {
  value: T;
  expires: number;
}

/**
 * Serves an answer from the cache or produces and stores it.
 *
 * A produced answer that carries a provider failure is kept for {@link DEGRADED_TTL}
 * only, so a transient outage never pins a bad listing for the full window, and a
 * thrown failure is not stored at all. The key is the exact parameter set: URL paths
 * are case sensitive, so nothing is lowercased on the way in.
 */
export async function cachedAnswer<T>(
  event: H3Event,
  prefix: string,
  params: Readonly<Record<string, unknown>>,
  ttl: number,
  produce: () => Promise<{ value: T; degraded: boolean }>,
): Promise<T> {
  const storage = useStorage("cache");
  const key = `docs:${prefix}:${hash(cacheKey(prefix, params))}`;
  const hit = await storage.getItem<CachedEntry<T>>(key).catch(() => null);
  if (hit && typeof hit.expires === "number" && hit.expires > Date.now()) {
    markPublic(event, Math.max(1, Math.floor((hit.expires - Date.now()) / 1000)));
    return hit.value;
  }
  await assertRateLimit(event);
  const { value, degraded } = await produce();
  const seconds = degraded ? DEGRADED_TTL : ttl;
  await storage.setItem(key, { value, expires: Date.now() + seconds * 1000 }).catch(() => undefined);
  markPublic(event, seconds);
  return value;
}
