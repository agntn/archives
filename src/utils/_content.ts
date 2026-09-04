/**
 * Reading the body of one archived capture.
 *
 * `snapshots()` answers which captures exist; these helpers answer what the page
 * said. The two are separate because every provider lists captures through a
 * CDX-shaped index, while the bytes come from a per-provider endpoint whose only
 * shared requirement is that it must not return the archive's own UI: Wayback and
 * Archive-It replay the original response under the `id_` modifier, Common Crawl
 * serves a byte range of a WARC file.
 */

import { consola } from "consola";
import { $fetch, type FetchResponse } from "ofetch";
import type { ArchiveContentOptions, ArchivedContent } from "../types";
import { createFetchOptions, waybackTimestampToISO } from "./_utils";

/** Bytes read from one archived body when the caller sets no cap. */
export const DEFAULT_MAX_CONTENT_BYTES = 2 * 1024 * 1024;

/** Header block a WARC record may carry before the HTTP response it wraps. */
const WARC_HEADER_SLACK = 16 * 1024;

const WAYBACK_TIMESTAMP_LENGTHS = new Set([4, 6, 8, 10, 12, 14]);
// Anchored at both ends: a prefix match would read `2019-03-01junk` as March 1st
// and send a real lookup for a period the caller never asked about.
const ISO_LIKE_TIMESTAMP =
  /^(\d{4})-(\d{2})(?:-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2}))?)?)?)?$/;
// An ISO instant that names its offset means a different instant than its digits
// read literally, and archives index captures in UTC.
const ZONED_ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)$/i;

// A playback URL is `<prefix>/<timestamp><modifier?>/<original>`; the two-letter
// modifiers (`id_`, `if_`, `im_`, …) select which rendition the archive replays.
const PLAYBACK_URL =
  /^https?:\/\/(?:web\.archive\.org\/web|wayback\.archive-it\.org\/\d+)\/(\d{4,14})(?:[a-z]{2}_)?\/(\S+)$/i;
const ARCHIVE_TODAY_URL = /^https?:\/\/archive\.(?:is|today|md|ph|li|vn)\/(\d{4,14})\/(\S+)$/i;
/** Matches nested Memento URLs without mistaking an ordinary dated path for playback. */
const GENERIC_MEMENTO_URL =
  /^https?:\/\/[^/\s]+\/(?:[^/\s]+\/)*(\d{4,14})(?:[a-z]{2}_)?\/(https?:\/\/\S+)$/i;

const CHARSET_PARAMETER = /charset\s*=\s*"?([\w-]+)"?/i;
const META_CHARSET = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i;
const HTTP_STATUS_LINE = /^HTTP\/[\d.]+\s+(\d{3})/i;

/**
 * Effective byte cap for one content request.
 *
 * @param options - Options.
 * @returns {number} The resulting number.
 */
export function resolveMaxBytes(options: Readonly<ArchiveContentOptions> = {}): number {
  const requested = options.maxBytes;
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return DEFAULT_MAX_CONTENT_BYTES;
  }
  return Math.max(1, Math.floor(requested));
}

/**
 * Normalizes a caller-supplied instant to the digits a CDX `to=` bound takes.
 *
 * Partial stamps stay partial: CDX reads `to=2019` as "through the end of 2019",
 * so padding it to `20190101000000` would silently ask for the opposite window.
 *
 * @param value - Wayback-style digits or an ISO 8601 date
 * @returns {string} Validated timestamp digits, or an empty string when unusable
 */
export function toWaybackTimestamp(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  const digits = /^\d+$/.test(raw) ? raw : isoToWaybackDigits(raw);
  if (!WAYBACK_TIMESTAMP_LENGTHS.has(digits.length)) return "";

  return waybackTimestampToISO(digits) ? digits : "";
}

function isoToWaybackDigits(value: string): string {
  const trimmed = value.trim();

  const zoned = ZONED_ISO_TIMESTAMP.exec(trimmed);
  if (zoned) {
    const [, year, month, day, hour, minute, second = "00", offset] = zoned;
    // `Date` rolls February 30th forward to March 2nd rather than refusing it,
    // so the literal fields are checked as a stamp of their own first.
    if (!waybackTimestampToISO(`${year}${month}${day}${hour}${minute}${second}`)) return "";

    // `-05` is a valid ISO 8601 offset that `Date` refuses; the minutes it wants
    // are the ones the format leaves implicit.
    const parsable = /^[+-]\d{2}$/.test(offset) ? `${trimmed}:00` : trimmed;
    const instant = new Date(parsable);
    if (Number.isNaN(instant.getTime())) return "";
    return instant.toISOString().replaceAll(/\D/g, "").slice(0, 14);
  }

  const match = ISO_LIKE_TIMESTAMP.exec(trimmed);
  if (!match) return "";
  return match
    .slice(1)
    .filter((part): part is string => part !== undefined)
    .join("");
}

/**
 * Validates a caller-supplied instant before it reaches a provider's index query.
 *
 * @param timestamp - Requested capture time, or nothing for the newest capture
 * @param name - Which option the value came from, for the error message
 * @returns {string} Validated timestamp digits, empty when none was requested
 * @throws {Error} When the value is not a timestamp any archive could act on
 */
export function resolveRequestedTimestamp(
  timestamp: string | undefined,
  name = "timestamp",
): string {
  if (timestamp === undefined || timestamp.trim() === "") return "";

  const normalized = toWaybackTimestamp(timestamp);
  if (!normalized) {
    throw new Error(
      `Invalid ${name} "${timestamp}": use archive digits (YYYY to YYYYMMDDhhmmss) or an ISO 8601 date`,
    );
  }

  return normalized;
}

/**
 * Pads a possibly partial timestamp to the upper edge of the period it names,
 * so `2019` compares as the last instant of 2019 rather than its first.

 *
 * @param timestamp - Timestamp.
 * @returns {string} The resulting string.
 */
export function timestampUpperBound(timestamp: string): string {
  return timestamp.length >= 14 ? timestamp : timestamp + "9".repeat(14 - timestamp.length);
}

/**
 * Pads a possibly partial timestamp to the lower edge of the period it names.
 * The counterpart of {@link timestampUpperBound}, for the `from` side of a window.

 *
 * @param timestamp - Timestamp.
 * @returns {string} The resulting string.
 */
export function timestampLowerBound(timestamp: string): string {
  return timestamp.length >= 14 ? timestamp : timestamp + "0".repeat(14 - timestamp.length);
}

/**
 * Splits an archive playback URL back into the original URL and capture stamp.
 *
 * `snapshots()` prints playback URLs, so they are what a caller holds when it
 * asks to read one. Left wrapped, the archive gets searched for a capture *of
 * itself*, and that query answers with something, which is worse than failing.
 *
 * @param input - Any URL, archived or not
 * @returns {{ url: string; timestamp?: string }} The original URL, plus the capture timestamp when the input carried one
 */
export function unwrapSnapshotUrl(input: string): { url: string; timestamp?: string } {
  const raw = input.trim();
  const match =
    PLAYBACK_URL.exec(raw) ?? ARCHIVE_TODAY_URL.exec(raw) ?? GENERIC_MEMENTO_URL.exec(raw);
  if (!match) return { url: raw };

  const [, stamp, original] = match;
  return { url: original, timestamp: stamp };
}

/**
 * Names why a target cannot be read, when it points at where a capture is stored
 * rather than at a page.
 *
 * `snapshots()` prints one of these for Common Crawl, and the documented flow
 * invites a caller to hand a snapshot URL straight back. Left alone, the archives
 * get searched for a copy of the WARC file itself and answer, confidently, that
 * no capture exists.
 *
 * @param url - Target as the caller supplied it

 *
 * @returns {string | undefined} The operation result.
 */
export function unreadableTargetReason(url: string): string | undefined {
  if (/^https?:\/\/data\.commoncrawl\.org\//i.test(url.trim())) {
    return "A Common Crawl snapshot URL names the WARC file a capture is stored in, not a page. Pass the original URL, with provider=commoncrawl to stay on that crawl.";
  }
  return undefined;
}

/**
 * Narrows candidates to the captures actually recorded under the requested URL.
 *
 * A CDX index matches on a canonicalized key, so asking for `example.com` also
 * returns captures of `http://sample@example.com/`. The archive considers them
 * the same page; a caller does not, and replaying one reports a URL that was
 * never asked about. They stay as a fallback for when nothing matches exactly.
 *
 * @param captures - Candidates from the index
 * @param target - URL the caller asked for
 * @param urlOf - Reads the URL a candidate was recorded under

 *
 * @returns {T[]} The resulting values.
 */
export function preferSameUrl<T>(
  captures: readonly T[],
  target: string,
  urlOf: (capture: T) => string,
): T[] {
  const wanted = canonicalUrlKey(target);
  const sameUrl = captures.filter((capture) => canonicalUrlKey(urlOf(capture)) === wanted);
  if (sameUrl.length === 0) return [...captures];

  // A CDX key drops the scheme too, so the index answers a request for the HTTPS
  // page with the HTTP captures beside it. Narrow to the scheme the caller wrote,
  // and only when they wrote one; a site that was only ever archived over HTTP
  // still answers a request that asks for HTTPS.
  const wantedScheme = schemeOf(target);
  if (!wantedScheme) return sameUrl;

  const sameScheme = sameUrl.filter((capture) => schemeOf(urlOf(capture)) === wantedScheme);
  return sameScheme.length > 0 ? sameScheme : sameUrl;
}

function schemeOf(value: string): string {
  return /^(https?):\/\//i.exec(value.trim())?.[1].toLowerCase() ?? "";
}

/* Reduces a URL to the differences that matter when comparing two spellings of it. */
function canonicalUrlKey(value: string): string {
  return (
    value
      .trim()
      .replace(/^[a-z][\w+.-]*:\/\//i, "")
      // Archives canonicalize `www.` away, so a capture under it answers a request
      // without it; a userinfo prefix is left in place, being a different URL.
      .replace(/^www\./i, "")
      .replace(/\/+$/, "")
      .toLowerCase()
  );
}

/**
 * Picks the capture a `timestamp` request means: the newest one at or before it,
 * or, when the archive only holds later captures, the oldest one after it.
 * Without a requested timestamp the newest capture wins.
 *
 * @param captures - Candidates carrying Wayback-style timestamp digits
 * @param timestamp - Validated timestamp digits, possibly partial

 *
 * @returns {T | undefined} The operation result.
 */
export function selectCapture<T extends { timestamp: string; status?: number }>(
  captures: readonly T[],
  timestamp?: string,
): T | undefined {
  if (captures.length === 0) return undefined;

  const ordered = [...captures].sort((a, b) => compareTimestamps(a.timestamp, b.timestamp));
  const newestFirst = [...ordered].reverse();
  if (!timestamp) return pickPreferred(newestFirst);

  // A request that names the instant exactly names one capture, and it outranks
  // the preference for a successful one: a playback URL for a 404 asks for that
  // 404, not for the working page before it.
  const exact = ordered.find((capture) => capture.timestamp === timestamp);
  if (exact) return exact;

  const bound = timestampUpperBound(timestamp);
  const atOrBefore = newestFirst.filter(
    (capture) => compareTimestamps(capture.timestamp, bound) <= 0,
  );

  // Closest means closest in whichever direction the archive can answer: newest
  // first while reading at or before the request, oldest first when everything
  // it holds came later.
  return atOrBefore.length > 0 ? pickPreferred(atOrBefore) : pickPreferred(ordered);
}

/*
 * Takes the first candidate that recorded a successful response, and the most
 * preferred one when none did.
 *
 * Replaying a 404 or a redirect capture returns the stub the archive recorded
 * for it, not the page the caller asked for.
 *
 * @param preferred - Candidates, most preferred first
 */
function pickPreferred<T extends { status?: number }>(preferred: readonly T[]): T | undefined {
  return (
    preferred.find((capture) => capture.status === undefined || isOkStatus(capture.status)) ??
    preferred[0]
  );
}

/* Orders timestamp digits chronologically, with a partial stamp before what it prefixes. */
function compareTimestamps(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/** What one archived body read produced. */
export interface FetchedBody {
  text: string;
  bytes: number;
  truncated: boolean;
  mime?: string;
  status: number;
  /** URL the archive finally served, after any redirect. */
  url: string;
  /** Capture date from the `Memento-Datetime` header, when the archive sends one. */
  capturedAt?: string;
}

/** Optional validation for each URL in a playback redirect chain. */
export interface FetchBodyPolicy {
  assertURL(url: URL): void;
  maxRedirects?: number;
  /** Return the redirect response itself when its destination fails validation. */
  returnRejectedRedirect?: boolean;
}

type FetchBodyOptions = Readonly<ArchiveContentOptions> & {
  readonly headers?: Readonly<Record<string, string>>;
};

type PlaybackCaptureRequest = Readonly<{
  baseURL: string;
  prefix: string;
  original: string;
  stamp: string;
  provider: string;
  captureStatus?: number;
  options: Readonly<ArchiveContentOptions>;
  meta?: Readonly<Record<string, unknown>>;
  policy?: Readonly<FetchBodyPolicy>;
}>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RAW_CAPTURE_PATH = /^\d{4,14}id_\/https?:\/\//iu;

function rawPlaybackPolicy(baseURL: string, prefix: string): FetchBodyPolicy {
  const origin = new URL(baseURL).origin;
  const pathPrefix = `${prefix.replace(/\/$/u, "")}/`;

  return {
    assertURL(url: URL) {
      const capturePath = url.pathname.startsWith(pathPrefix)
        ? url.pathname.slice(pathPrefix.length)
        : "";
      if (
        url.origin !== origin ||
        url.username ||
        url.password ||
        !RAW_CAPTURE_PATH.test(capturePath)
      ) {
        throw new Error("Archive playback left its raw capture endpoint");
      }
    },
    // A redirect outside the playback endpoint is the response the archived
    // site sent. Return that historical stub instead of visiting it today.
    returnRejectedRedirect: true,
  };
}

/* Converts one final raw response into the bounded body contract. */
async function decodeFetchedResponse(
  response: FetchResponse<unknown>,
  maxBytes: number,
  fallbackURL: string,
): Promise<FetchedBody> {
  const contentType = headerValue(response.headers, "content-type");
  const { bytes, truncated } = await readCappedBytes(response._data, maxBytes);

  return {
    text: decodeBytes(bytes, charsetOf(contentType, bytes)),
    bytes: bytes.byteLength,
    truncated,
    mime: baseMime(contentType),
    status: typeof response.status === "number" ? response.status : 200,
    url: typeof response.url === "string" && response.url ? response.url : fallbackURL,
    capturedAt: parseMementoDatetime(headerValue(response.headers, "memento-datetime")),
  };
}

async function fetchUnredirectedBody(
  baseURL: string,
  path: string,
  options: Readonly<FetchBodyOptions>,
  maxBytes: number,
): Promise<FetchedBody> {
  const fetchOptions = await createFetchOptions(
    baseURL,
    {},
    {
      responseType: "stream",
      redirect: "manual",
      retries: options.retries,
      signal: options.signal,
      timeout: options.timeout,
      ...(options.headers ? { headers: options.headers } : {}),
    },
  );
  const response = await $fetch.raw(path, fetchOptions);
  return decodeFetchedResponse(response, maxBytes, `${baseURL}${path}`);
}

async function cancelResponseBody(response: FetchResponse<unknown>): Promise<void> {
  if (isReadableStream(response._data)) {
    await response._data.cancel().catch(() => undefined);
  }
}

function redirectDestination(response: FetchResponse<unknown>, current: URL): URL {
  const location = headerValue(response.headers, "location");
  if (!location) throw new Error("Archive playback redirected without a Location header");
  return new URL(location, current);
}

async function fetchPolicyBody(
  baseURL: string,
  path: string,
  options: Readonly<FetchBodyOptions>,
  policy: Readonly<FetchBodyPolicy>,
  maxBytes: number,
): Promise<FetchedBody> {
  const maxRedirects = policy.maxRedirects ?? 5;
  let current = new URL(path, baseURL);
  for (let redirectCount = 0; ; redirectCount++) {
    policy.assertURL(current);
    const fetchOptions = await createFetchOptions(
      current.origin,
      {},
      {
        responseType: "stream",
        redirect: "manual",
        retries: options.retries,
        signal: options.signal,
        timeout: options.timeout,
        ...(options.headers ? { headers: options.headers } : {}),
      },
    );
    const response = await $fetch.raw(`${current.pathname}${current.search}`, fetchOptions);
    if (!REDIRECT_STATUSES.has(response.status)) {
      return decodeFetchedResponse(response, maxBytes, current.href);
    }
    if (redirectCount >= maxRedirects) {
      await cancelResponseBody(response);
      throw new Error(`Archive playback exceeded ${maxRedirects} redirects`);
    }

    let destination: URL;
    try {
      destination = redirectDestination(response, current);
      policy.assertURL(destination);
    } catch (error) {
      if (policy.returnRejectedRedirect) {
        return decodeFetchedResponse(response, maxBytes, current.href);
      }
      await cancelResponseBody(response);
      throw error;
    }
    await cancelResponseBody(response);
    current = destination;
  }
}

/**
 * GETs one URL and decodes at most `maxBytes` of its body.
 *
 * The body is streamed rather than buffered so the cap is a real one: an
 * archived 60 MB video must not be pulled into memory to be thrown away.
 * Redirects are never followed implicitly. Without a policy the recorded
 * redirect response is returned; with one, every destination is checked before
 * its network request.
 *
 * @param baseURL - Origin of the archive endpoint
 * @param path - Path to request, already URL-shaped
 * @param options - Byte cap plus the shared timeout and retry options
 * @param policy - Optional validation applied before the initial request and every redirect

 *
 * @returns {Promise<FetchedBody>} A promise resolving to the operation result.
 */
export async function fetchBody(
  baseURL: string,
  path: string,
  options: FetchBodyOptions = {},
  policy?: Readonly<FetchBodyPolicy>,
): Promise<FetchedBody> {
  const maxBytes = resolveMaxBytes(options);
  return policy
    ? fetchPolicyBody(baseURL, path, options, policy, maxBytes)
    : fetchUnredirectedBody(baseURL, path, options, maxBytes);
}

/**
 * Reads one capture from a Wayback-style playback endpoint.
 *
 * The `id_` modifier is the whole point: without it the archive returns the
 * capture wrapped in its own toolbar and rewrites every link in the page, so the
 * caller reads the archive's rendition instead of what the site served.
 *
 * @param params - Playback location, the capture to replay, and the read options

 *
 * @returns {Promise<ArchivedContent>} A promise resolving to the operation result.
 */
export async function readPlaybackCapture(
  params: PlaybackCaptureRequest,
): Promise<ArchivedContent> {
  const { baseURL, prefix, original, stamp, provider, options } = params;
  const capturedRedirect =
    params.captureStatus !== undefined && REDIRECT_STATUSES.has(params.captureStatus);
  const policy = capturedRedirect
    ? undefined
    : (params.policy ?? rawPlaybackPolicy(baseURL, prefix));
  const body = await fetchBody(baseURL, `${prefix}/${stamp}id_/${original}`, options, policy);

  // A playback request for a timestamp the archive does not hold redirects to
  // the capture it does hold, so the served URL is the honest one to report.
  const servedStamp = unwrapSnapshotUrl(body.url).timestamp ?? stamp;
  // `waybackTimestampToISO` reports an unusable stamp as an empty string, so the
  // fallbacks chain on truthiness rather than on nullishness.
  const timestamp =
    body.capturedAt || waybackTimestampToISO(servedStamp) || waybackTimestampToISO(stamp);

  return {
    url: original,
    timestamp,
    snapshot: `${baseURL}${prefix}/${servedStamp}/${original}`,
    content: body.text,
    ...(body.mime ? { mime: body.mime } : {}),
    bytes: body.bytes,
    truncated: body.truncated,
    _meta: {
      timestamp: servedStamp,
      status: body.status,
      provider,
      rawSnapshot: body.url,
      ...params.meta,
    },
  };
}

/**
 * Decompresses one compressed member, stopping at `maxBytes`.
 *
 * The payload is streamed rather than buffered first: a WARC record is as large
 * as whatever the crawler stored, and buffering it to then throw most of it away
 * is exactly the download the cap exists to prevent.
 *
 * @param source - Compressed payload, as a stream or as bytes
 * @param maxBytes - Cap on the decompressed size
 * @param format - Compression the payload carries
 * @throws {Error} When the runtime has no `DecompressionStream`

 *
 * @returns {Promise<{ bytes: Uint8Array; truncated: boolean }>} A promise resolving to the operation result.
 */
export async function decompress(
  source: unknown,
  maxBytes: number,
  format: CompressionFormat = "gzip",
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (typeof DecompressionStream !== "function") {
    throw new TypeError(
      "Reading Common Crawl records requires DecompressionStream in this runtime",
    );
  }

  return readCappedBytes(
    toByteStream(source).pipeThrough(new DecompressionStream(format)),
    maxBytes,
  );
}

/**
 * Undoes the `Content-Encoding` a capture was served with.
 *
 * A WARC record holds the response as it travelled, so a page sent compressed is
 * stored compressed. Decoding it as text without this produces bytes that look
 * like a broken charset and read like nothing at all.
 *
 * @throws {Error} For an encoding this runtime cannot undo, rather than returning noise

 *
 * @param body - Body.
 * @param encoding - Encoding.
 * @param maxBytes - Max Bytes.
 * @returns {Promise<{ bytes: Uint8Array; truncated: boolean }>} A promise resolving to the operation result.
 */
export async function decodeContentEncoding(
  body: Uint8Array,
  encoding: string | undefined,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const format = encoding?.trim().toLowerCase() ?? "";
  if (!format || format === "identity") return { bytes: body, truncated: false };

  const compression = format === "gzip" || format === "x-gzip" ? "gzip" : format;
  if (compression !== "gzip" && compression !== "deflate") {
    throw new Error(`The capture is ${format}-encoded, which this client cannot decode`);
  }

  // A member cut short by the read cap cannot reach the decoder as an error:
  // decompression only expands, so a compressed prefix already past this cap
  // decodes past it too and the cap ends the read cleanly. An error here is a
  // corrupt member, and it belongs to the caller.
  return decompress(body, maxBytes, compression);
}

/**
 * Reassembles a body that was sent with `Transfer-Encoding: chunked`.
 *
 * The framing travelled with the response, so the size lines sit inside the
 * stored bytes and would otherwise be read as part of the page.

 *
 * @param body - Body.
 * @returns {Uint8Array} The operation result.
 */
export function dechunkHttpBody(body: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const lineEnd = indexOfCrlf(body, cursor);
    if (lineEnd === undefined) break;

    const header = decodeBytes(body.subarray(cursor, lineEnd), "utf-8");
    const size = Number.parseInt(header.split(";")[0].trim(), 16);
    if (!Number.isInteger(size) || size <= 0) break;

    const start = lineEnd + 2;
    const end = Math.min(start + size, body.length);
    chunks.push(body.subarray(start, end));
    cursor = end + 2;
  }

  return concatBytes(chunks);
}

function indexOfCrlf(bytes: Uint8Array, from: number): number | undefined {
  for (let index = from; index < bytes.length - 1; index++) {
    if (bytes[index] === 13 && bytes[index + 1] === 10) return index;
  }
  return undefined;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/*
 * Presents a fetched payload as a stream, so the cap applies while the bytes
 * arrive rather than after they are all in memory.
 */
function toByteStream(source: unknown) {
  if (isReadableStream(source) || source instanceof Uint8Array || source instanceof ArrayBuffer) {
    // `Response` passes a stream through untouched and wraps bytes without a
    // copy, and its body carries the chunk type the decompressor expects.
    const body = new Response(source as BodyInit).body;
    if (body) return body;
  }

  throw new Error("Archive returned a record body this client cannot read");
}

/**
 * Splits a WARC response record into its HTTP header block and body.
 *
 * A record is the WARC headers, a blank line, the HTTP status line and headers,
 * another blank line, and then the bytes the server sent.
 *
 * @param record - One decompressed WARC record

 *
 * @returns {{ httpHeaders: string; body: Uint8Array } | undefined} The operation result.
 */
export function splitWarcRecord(
  record: Uint8Array,
): { httpHeaders: string; body: Uint8Array } | undefined {
  const warcHeaderEnd = indexOfBlankLine(record, 0);
  if (!warcHeaderEnd) return undefined;

  const httpHeaderEnd = indexOfBlankLine(record, warcHeaderEnd.end);
  if (!httpHeaderEnd) return undefined;

  return {
    httpHeaders: decodeBytes(record.subarray(warcHeaderEnd.end, httpHeaderEnd.start), "utf-8"),
    body: record.subarray(httpHeaderEnd.end),
  };
}

/** What an archived HTTP response says about itself. */
export interface HttpHead {
  status?: number;
  contentType?: string;
  contentEncoding?: string;
  transferEncoding?: string;
}

/**
 * Reads the status line and the headers that decide how to read the body.
 *
 * @param headers - Headers.
 * @returns {HttpHead} The operation result.
 */
export function parseHttpHeaders(headers: string): HttpHead {
  const lines = headers.split(/\r?\n/);
  const statusMatch = HTTP_STATUS_LINE.exec(lines[0] ?? "");
  const header = (name: string): string | undefined => {
    const pattern = new RegExp(`^${name}\\s*:`, "i");
    const line = lines.find((candidate) => pattern.test(candidate));
    return line?.split(":").slice(1).join(":").trim() || undefined;
  };

  const contentType = header("content-type");
  const contentEncoding = header("content-encoding");
  const transferEncoding = header("transfer-encoding");

  return {
    ...(statusMatch ? { status: Number.parseInt(statusMatch[1], 10) } : {}),
    ...(contentType ? { contentType } : {}),
    ...(contentEncoding ? { contentEncoding } : {}),
    ...(transferEncoding ? { transferEncoding } : {}),
  };
}

/**
 * Slack to add to a byte cap so a record's headers do not eat the caller's budget.
 *
 * @param maxBytes - Max Bytes.
 * @returns {number} The resulting number.
 */
export function withHeaderSlack(maxBytes: number): number {
  return maxBytes + WARC_HEADER_SLACK;
}

/**
 * Reduces a content type to its media type, dropping `; charset=…`.
 *
 * @param contentType - Content Type.
 * @returns {string | undefined} The operation result.
 */
export function baseMime(contentType: string | undefined): string | undefined {
  if (!contentType) return undefined;
  const mime = contentType.split(";")[0]?.trim().toLowerCase();
  return mime || undefined;
}

const TEXTUAL_APPLICATION_MIMES = new Set([
  "application/json",
  "application/xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/x-javascript",
  "application/ecmascript",
]);

/**
 * True for the media types whose bodies are text a caller can read.
 *
 * @param mime - Mime.
 * @returns {boolean} Whether the condition is met.
 */
export function isTextualMime(mime: string | undefined): boolean {
  if (!mime) return true; // Unknown type: the decoded body is the only evidence either way.
  return (
    mime.startsWith("text/") ||
    mime.endsWith("+xml") ||
    mime.endsWith("+json") ||
    TEXTUAL_APPLICATION_MIMES.has(mime)
  );
}

interface HtmlChunk {
  text: string;
  cursor: number;
}

function commentChunk(lower: string, open: number): HtmlChunk | undefined {
  const end = lower.indexOf("-->", open + 4);
  return end === -1 ? undefined : { text: " ", cursor: end + 3 };
}

function opensMarkupAt(lower: string, open: number): boolean {
  const value = lower.codePointAt(open + 1) ?? Number.NaN;
  return isNameByte(value) || value === 47 || value === 33 || value === 63;
}

function noiseTagChunk(lower: string, tag: Readonly<TagName>, open: number): HtmlChunk | undefined {
  const closeStart = indexOfClosingTag(lower, tag.name, open + tag.name.length + 1);
  if (closeStart === -1) return undefined;
  const closeEnd = indexOfTagEnd(lower, closeStart);
  return closeEnd === -1 ? undefined : { text: " ", cursor: closeEnd + 1 };
}

function markupChunk(lower: string, open: number): HtmlChunk | undefined {
  if (!opensMarkupAt(lower, open)) return { text: "<", cursor: open + 1 };
  const tag = readTagName(lower, open);
  if (!tag.closing && NOISE_TAGS.has(tag.name)) return noiseTagChunk(lower, tag, open);
  const tagEnd = indexOfTagEnd(lower, open);
  return tagEnd === -1 ? undefined : { text: endsLine(tag) ? "\n" : " ", cursor: tagEnd + 1 };
}

/**
 * Reduces an archived HTML document to the text a reader would see.
 *
 * Deliberately lossy and dependency-free: scripts, styles and markup carry none
 * of the answer a caller asked for, and they are most of the bytes.
 *
 * One forward scan rather than a chain of `replace()` calls, because every
 * unterminated-construct pattern that job needs (`<!--…-->`, `<script>…</script>`,
 * `<[^>]*>`) backtracks quadratically over an input that never terminates them,
 * and an archived page is an input an attacker picks. Measured before the
 * rewrite: 128 KiB of bare `<` took 9.8 seconds of one CPU. An unterminated
 * construct is treated as markup cut off by truncation, not reader-visible text.
 *
 * @param html - Archived markup

 *
 * @returns {string} The resulting string.
 */
export function htmlToText(html: string): string {
  // Searches run against an ASCII-lowered copy so tag names match whatever case
  // the document used; `[A-Z]` preserves length, so the indices still address the
  // original and slices come out unchanged.
  const lower = html.replaceAll(/[A-Z]/g, (letter) => letter.toLowerCase());
  const parts: string[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const open = lower.indexOf("<", cursor);
    if (open === -1) {
      parts.push(html.slice(cursor));
      break;
    }
    parts.push(html.slice(cursor, open));

    const chunk = lower.startsWith("<!--", open)
      ? commentChunk(lower, open)
      : markupChunk(lower, open);
    if (!chunk) break;
    parts.push(chunk.text);
    cursor = chunk.cursor;
  }

  return decodeEntities(parts.join(""))
    .split("\n")
    .map((line) => line.replaceAll(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

/** Elements whose contents are markup machinery rather than anything a reader sees. */
const NOISE_TAGS = new Set(["script", "style", "noscript", "template", "svg"]);
/** Closing these ends a line of text; so does the opening of the void ones below. */
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "li",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
]);
const BREAK_TAGS = new Set(["br", "hr", "tr"]);

interface TagName {
  name: string;
  closing: boolean;
}

/* Reads the element name at a `<` position, lowercased and without its slash. */
function readTagName(lower: string, open: number): TagName {
  let index = open + 1;
  const closing = lower[index] === "/";
  if (closing) index++;

  const start = index;
  while (index < lower.length && isNameByte(lower.codePointAt(index) ?? Number.NaN)) index++;

  return { name: lower.slice(start, index), closing };
}

/*
 * Finds where a tag ends, ignoring a `>` inside a quoted attribute value.
 *
 * `<div title="1 > 0">` is valid markup, and stopping at the first `>` leaks the
 * rest of the attribute into the text as if it were the page.
 */
function indexOfTagEnd(source: string, open: number): number {
  let quote = "";

  for (let index = open + 1; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return index;
  }

  return -1;
}

/*
 * Finds the closing tag for one element name.
 *
 * The name has to end where the match ends: `</scripture>` inside a script is
 * not the end of that script, and treating it as one resumes reading in the
 * middle of the source and emits the rest of it as text.
 */
function indexOfClosingTag(lower: string, name: string, from: number): number {
  let cursor = from;

  while (cursor < lower.length) {
    const found = lower.indexOf(`</${name}`, cursor);
    if (found === -1) return -1;

    const after = lower.codePointAt(found + name.length + 2) ?? Number.NaN;
    // End of input, `>`, `/` or whitespace all close the name.
    if (Number.isNaN(after) || after === 62 || after === 47 || after <= 32) return found;
    cursor = found + 1;
  }

  return -1;
}

function isNameByte(code: number): boolean {
  // a-z (the copy is already lowered) or 0-9
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function endsLine(tag: Readonly<TagName>): boolean {
  return tag.closing ? BLOCK_TAGS.has(tag.name) : BREAK_TAGS.has(tag.name);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};

function decodeEntities(text: string): string {
  return text.replaceAll(/&(#x?[\da-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lowered = entity.toLowerCase();
    if (lowered.startsWith("#")) {
      const codePoint = lowered.startsWith("#x")
        ? Number.parseInt(lowered.slice(2), 16)
        : Number.parseInt(lowered.slice(1), 10);
      if (!Number.isInteger(codePoint) || codePoint < 1 || codePoint > 0x10_ff_ff) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[lowered] ?? match;
  });
}

/**
 * Decodes archived bytes with the capture's declared character set, falling back
 * to the one the document declares about itself.
 *
 * @param bytes - Body of the archived response
 * @param contentType - Content type the archive recorded for it

 *
 * @returns {string} The resulting string.
 */
export function decodeArchivedBody(bytes: Uint8Array, contentType?: string): string {
  return decodeBytes(bytes, charsetOf(contentType, bytes));
}

/* Picks the character set to decode with: the declared one, then the document's own. */
function charsetOf(contentType: string | undefined, bytes: Uint8Array): string | undefined {
  const declared = contentType ? CHARSET_PARAMETER.exec(contentType)?.[1] : undefined;
  if (declared) return declared;

  // Captures from before UTF-8 won routinely declare their encoding only in a
  // <meta> tag, and decoding those as UTF-8 mangles every accented character.
  const head = decodeBytes(bytes.subarray(0, 4096), "windows-1252");
  return META_CHARSET.exec(head)?.[1];
}

function decodeBytes(bytes: Uint8Array, charset?: string): string {
  if (charset) {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      consola.debug(`[content] Unknown charset "${charset}", decoding as UTF-8`);
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function parseMementoDatetime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // Second precision, like every other timestamp this library reports: archives
  // record captures to the second, and a field that sometimes carries
  // milliseconds is a field callers have to normalize themselves.
  return parsed.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/* Reads a header from either a `Headers` instance or a plain record. */
function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;

  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === "function") {
    const value = (getter as (key: string) => string | null).call(headers, name);
    return value ?? undefined;
  }

  const record = headers as Record<string, unknown>;
  const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name);
  const value = key === undefined ? undefined : record[key];
  return typeof value === "string" ? value : undefined;
}

/*
 * Reads at most `maxBytes` from whatever ofetch produced for the body.
 *
 * A stream is the normal case; the buffer and string branches keep the helper
 * usable against hosts (and test doubles) that hand back an already-read body.
 */
async function readCappedBytes(
  data: unknown,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (typeof data === "string") {
    return sliceBytes(new TextEncoder().encode(data), maxBytes);
  }
  if (data instanceof Uint8Array) {
    return sliceBytes(data, maxBytes);
  }
  if (data instanceof ArrayBuffer) {
    return sliceBytes(new Uint8Array(data), maxBytes);
  }
  if (isReadableStream(data)) {
    return readStream(data, maxBytes);
  }
  if (data === undefined || data === null) {
    return { bytes: new Uint8Array(0), truncated: false };
  }
  throw new Error("Archive returned a body in a form this client cannot read");
}

function sliceBytes(
  bytes: Uint8Array,
  maxBytes: number,
): { bytes: Uint8Array; truncated: boolean } {
  return bytes.byteLength <= maxBytes
    ? { bytes, truncated: false }
    : { bytes: bytes.subarray(0, maxBytes), truncated: true };
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReadableStream<Uint8Array>).getReader === "function"
  );
}

async function readStream(
  stream: Readonly<ReadableStream<Uint8Array>>,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        truncated = true;
        break;
      }

      chunks.push(value);
      total += value.byteLength;
    }

    // A body that ends exactly on the cap is complete; one with a further chunk
    // waiting is not, and only a read tells the two apart.
    if (!truncated && total >= maxBytes) {
      const { done } = await reader.read();
      truncated = !done;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return { bytes: concatBytes(chunks), truncated };
}

/* Locates the blank line separating a header block from what follows it. */
function indexOfBlankLine(
  bytes: Uint8Array,
  from: number,
): { start: number; end: number } | undefined {
  for (let index = from; index < bytes.length - 1; index++) {
    if (bytes[index] !== 10) continue; // \n

    if (bytes[index + 1] === 10) {
      return { start: index, end: index + 2 };
    }
    if (bytes[index + 1] === 13 && bytes[index + 2] === 10) {
      return { start: index - (bytes[index - 1] === 13 ? 1 : 0), end: index + 3 };
    }
  }
  return undefined;
}
