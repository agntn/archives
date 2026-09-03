import type { H3Event } from "h3";

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
  timeout: 25_000,
  /** Replaying one capture can take Wayback longer than listing a domain. */
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
