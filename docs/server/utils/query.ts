import { createError, getRequestHeader, getRequestIP, isNuxtError, type RequestEvent } from "nuxt/server";
import { hash } from "ohash";

type Query = Record<string, unknown>;

export interface ArchiveRequestAbort {
  readonly signal: AbortSignal;
  dispose(): void;
}

/** Combines a client disconnect (`event.req.signal`, which `nuxt dev` never aborts) with an optional deadline. */
export function archiveRequestAbort(event: Pick<RequestEvent, "req">, timeout?: number): ArchiveRequestAbort {
  const controller = new AbortController();
  const clientSignal = event.req.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  const abortFromClient = () => abort(clientSignal.reason);

  if (clientSignal.aborted) abortFromClient();
  else clientSignal.addEventListener("abort", abortFromClient, { once: true });
  if (timeout !== undefined) {
    timer = setTimeout(
      () => abort(new DOMException("The archive operation timed out", "TimeoutError")),
      timeout,
    );
  }

  return {
    signal: controller.signal,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      clientSignal.removeEventListener("abort", abortFromClient);
    },
  };
}

/** Caps every public parameter well below the library's own ceilings. */
export const LIMITS = {
  target: 2048,
  parameter: 64,
  snapshots: 50,
  /** Source view of a whole page; the library's own ceiling. */
  contentChars: 200_000,
  diffChars: 20_000,
  diffContext: 20,
  retries: 1,
  operationBudget: 60_000,
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
    throw createError({ status: 400, statusText: `${key} must be at most ${max} characters` });
  }
  return value;
}

export function requireString(query: Query, key: string, max: number): string {
  const value = readString(query, key, max);
  if (!value) {
    throw createError({ status: 400, statusText: `${key} is required` });
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
    throw createError({ status: 400, statusText: `${key} must be an integer between ${min} and ${max}` });
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
  if (isNuxtError(error)) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  throw createError({ status: 400, statusText: message.slice(0, 300) });
}

export function markPublic(event: Pick<RequestEvent, "res">, seconds: number): void {
  event.res.headers.set("Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`);
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
    throw createError({ status: 502, statusText: "The archive query did not produce a usable answer", data: answer });
  }
  return answer;
}

/** What the rate limit reads from a request: its headers, its address and the worker's bindings. */
type QueryEvent = Pick<RequestEvent, "req" | "context">;

/** Uncached archive queries one client may start per minute; `ratelimits` in wrangler.jsonc carries the same number. */
export const RATE_LIMIT = 30;

/** The Workers Rate Limiting binding: Cloudflare keeps the count, so concurrent misses can't race it. */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Fallback for `nuxt dev` without the binding: one counter per isolate, incremented synchronously. */
const localCounts = new Map<string, number>();

/**
 * The address a request came from, as Cloudflare saw it. `X-Forwarded-For` is left out: its first
 * entry is whatever the caller sent, so it would let one client rotate its own key.
 */
function clientAddress(event: QueryEvent): string {
  return getRequestHeader(event, "cf-connecting-ip") ?? getRequestIP(event) ?? "unknown";
}

/** `::ffff:1.2.3.4` after the URL parser: one IPv4 client, not a /64 shared by all of them. */
const IPV4_MAPPED = /^::ffff:[\da-f]{1,4}:[\da-f]{1,4}$/;

/** The eight groups of a canonical IPv6 address, `::` filled with zeros. */
function ipv6Groups(host: string): string[] {
  const [head = "", tail] = host.split("::");
  const left = head === "" ? [] : head.split(":");
  if (tail === undefined) return left;
  const right = tail === "" ? [] : tail.split(":");
  return [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
}

/** An IPv6 address as the URL parser spells it, or undefined for anything else. */
function canonicalIPv6(address: string): string | undefined {
  try {
    const { hostname } = new URL(`http://[${address}]/`);
    return hostname.startsWith("[") ? hostname.slice(1, -1) : undefined;
  } catch {
    return undefined;
  }
}

/** IPv4 counts by address, IPv6 by its /64: one routed prefix hands out 2^64 fresh addresses. */
function rateLimitSubject(address: string): string {
  const host = address.includes(":") ? canonicalIPv6(address) : undefined;
  if (host === undefined) return address;
  if (IPV4_MAPPED.test(host)) return host;
  return `${ipv6Groups(host).slice(0, 4).join(":")}::/64`;
}

/**
 * Spends `count` queries from the client's allowance; false once this minute's is gone.
 *
 * Only a cache miss counts, so a demo that replays warmed answers never trips it, and
 * the archives behind the worker see at most {@link RATE_LIMIT} new questions from one client.
 */
export async function admitQueries(event: QueryEvent, count = 1): Promise<boolean> {
  const key = hash(rateLimitSubject(clientAddress(event)));
  const cloudflare = event.context["cloudflare"] as { env?: { ARCHIVE_LIMIT?: RateLimiter } } | undefined;
  const limiter = cloudflare?.env?.ARCHIVE_LIMIT;
  if (limiter) {
    for (let spent = 0; spent < count; spent++) {
      if (!(await limiter.limit({ key })).success) return false;
    }
    return true;
  }
  const minute = Math.floor(Date.now() / 60_000);
  const slot = `${key}:${minute}`;
  if (!localCounts.has(slot)) {
    for (const stale of localCounts.keys()) if (!stale.endsWith(`:${minute}`)) localCounts.delete(stale);
  }
  const total = (localCounts.get(slot) ?? 0) + count;
  localCounts.set(slot, total);
  return total <= RATE_LIMIT;
}

/** Refuses an archive query over its address's allowance for this minute with a 429. */
export async function assertRateLimit(event: Pick<RequestEvent, "req" | "res" | "context">): Promise<void> {
  if (!(await admitQueries(event))) {
    event.res.headers.set("Retry-After", "60");
    throw createError({
      status: 429,
      statusText: `More than ${RATE_LIMIT} new archive queries in a minute from one address, or one /64 on IPv6; cached answers are not counted. Wait a moment.`,
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
 * are case sensitive, so nothing is lowercased on the way in. Every route goes through it, since
 * the archives behind it are public services.
 */
export async function cachedAnswer<T>(
  event: RequestEvent,
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
  await storage.setItem(key, { value, expires: Date.now() + seconds * 1000 }, { ttl: seconds }).catch(() => undefined);
  markPublic(event, seconds);
  return value;
}
