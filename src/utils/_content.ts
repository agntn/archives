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
import { $fetch } from "ofetch";
import type { ArchiveContentOptions, ArchivedContent } from "../types";
import { createFetchOptions, waybackTimestampToISO } from "./_utils";

/** Bytes read from one archived body when the caller sets no cap. */
export const DEFAULT_MAX_CONTENT_BYTES = 2 * 1024 * 1024;

/** Header block a WARC record may carry before the HTTP response it wraps. */
const WARC_HEADER_SLACK = 16 * 1024;

const WAYBACK_TIMESTAMP_LENGTHS = new Set([4, 6, 8, 10, 12, 14]);
const ISO_LIKE_TIMESTAMP =
  /^(\d{4})-(\d{2})(?:-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2}))?)?)?)?/;

// A playback URL is `<prefix>/<timestamp><modifier?>/<original>`; the two-letter
// modifiers (`id_`, `if_`, `im_`, …) select which rendition the archive replays.
const PLAYBACK_URL =
  /^https?:\/\/(?:web\.archive\.org\/web|wayback\.archive-it\.org\/\d+)\/(\d{4,14})(?:[a-z]{2}_)?\/(\S+)$/i;
const ARCHIVE_TODAY_URL = /^https?:\/\/archive\.(?:is|today|md|ph|li|vn)\/(\d{4,14})\/(\S+)$/i;

const CHARSET_PARAMETER = /charset\s*=\s*"?([\w-]+)"?/i;
const META_CHARSET = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i;
const HTTP_STATUS_LINE = /^HTTP\/[\d.]+\s+(\d{3})/i;

/** Effective byte cap for one content request. */
export function resolveMaxBytes(options: ArchiveContentOptions = {}): number {
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
 * @returns Validated timestamp digits, or an empty string when unusable
 */
export function toWaybackTimestamp(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  const digits = /^\d+$/.test(raw) ? raw : isoToWaybackDigits(raw);
  if (!WAYBACK_TIMESTAMP_LENGTHS.has(digits.length)) return "";

  return waybackTimestampToISO(digits) ? digits : "";
}

function isoToWaybackDigits(value: string): string {
  const match = ISO_LIKE_TIMESTAMP.exec(value.trim());
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
 * @returns Validated timestamp digits, empty when none was requested
 * @throws When the value is not a timestamp any archive could act on
 */
export function resolveRequestedTimestamp(timestamp: string | undefined): string {
  if (timestamp === undefined || timestamp.trim() === "") return "";

  const normalized = toWaybackTimestamp(timestamp);
  if (!normalized) {
    throw new Error(
      `Invalid timestamp "${timestamp}": use archive digits (YYYY to YYYYMMDDhhmmss) or an ISO 8601 date`,
    );
  }

  return normalized;
}

/**
 * Pads a possibly partial timestamp to the upper edge of the period it names,
 * so `2019` compares as the last instant of 2019 rather than its first.
 */
export function timestampUpperBound(timestamp: string): string {
  return timestamp.length >= 14 ? timestamp : timestamp + "9".repeat(14 - timestamp.length);
}

/**
 * Splits an archive playback URL back into the original URL and capture stamp.
 *
 * `snapshots()` prints playback URLs, so they are what a caller holds when it
 * asks to read one. Left wrapped, the archive gets searched for a capture *of
 * itself* — a query that answers with something, which is worse than failing.
 *
 * @param input - Any URL, archived or not
 * @returns The original URL, plus the capture timestamp when the input carried one
 */
export function unwrapSnapshotUrl(input: string): { url: string; timestamp?: string } {
  const raw = input.trim();
  const match = PLAYBACK_URL.exec(raw) ?? ARCHIVE_TODAY_URL.exec(raw);
  if (!match) return { url: raw };

  const [, stamp, original] = match;
  return { url: original, timestamp: stamp };
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
 */
export function preferSameUrl<T>(
  captures: T[],
  target: string,
  urlOf: (capture: T) => string,
): T[] {
  const wanted = canonicalUrlKey(target);
  const exact = captures.filter((capture) => canonicalUrlKey(urlOf(capture)) === wanted);
  return exact.length > 0 ? exact : captures;
}

/** Reduces a URL to the differences that matter when comparing two spellings of it. */
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
 */
export function selectCapture<T extends { timestamp: string; status?: number }>(
  captures: T[],
  timestamp?: string,
): T | undefined {
  if (captures.length === 0) return undefined;

  const ordered = [...captures].sort((a, b) => compareTimestamps(a.timestamp, b.timestamp));
  const newestFirst = [...ordered].reverse();
  if (!timestamp) return pickPreferred(newestFirst);

  const bound = timestampUpperBound(timestamp);
  const atOrBefore = newestFirst.filter(
    (capture) => compareTimestamps(capture.timestamp, bound) <= 0,
  );

  // Closest means closest in whichever direction the archive can answer: newest
  // first while reading at or before the request, oldest first when everything
  // it holds came later.
  return atOrBefore.length > 0 ? pickPreferred(atOrBefore) : pickPreferred(ordered);
}

/**
 * Takes the first candidate that recorded a successful response, and the most
 * preferred one when none did.
 *
 * Replaying a 404 or a redirect capture returns the stub the archive recorded
 * for it, not the page the caller asked for.
 *
 * @param preferred - Candidates, most preferred first
 */
function pickPreferred<T extends { status?: number }>(preferred: T[]): T | undefined {
  return (
    preferred.find((capture) => capture.status === undefined || isOkStatus(capture.status)) ??
    preferred[0]
  );
}

/** Orders timestamp digits chronologically, with a partial stamp before what it prefixes. */
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

/**
 * GETs one URL and decodes at most `maxBytes` of its body.
 *
 * The body is streamed rather than buffered so the cap is a real one: an
 * archived 60 MB video must not be pulled into memory to be thrown away.
 *
 * @param baseURL - Origin of the archive endpoint
 * @param path - Path to request, already URL-shaped
 * @param options - Byte cap plus the shared timeout and retry options
 */
export async function fetchBody(
  baseURL: string,
  path: string,
  options: ArchiveContentOptions & { headers?: Record<string, string> } = {},
): Promise<FetchedBody> {
  const maxBytes = resolveMaxBytes(options);
  const fetchOptions = await createFetchOptions(
    baseURL,
    {},
    {
      responseType: "stream",
      retries: options.retries,
      timeout: options.timeout,
      ...(options.headers ? { headers: options.headers } : {}),
    },
  );

  const response = await $fetch.raw(path, fetchOptions);
  const contentType = headerValue(response.headers, "content-type");
  const { bytes, truncated } = await readCappedBytes(response._data, maxBytes);

  return {
    text: decodeBytes(bytes, charsetOf(contentType, bytes)),
    bytes: bytes.byteLength,
    truncated,
    mime: baseMime(contentType),
    status: typeof response.status === "number" ? response.status : 200,
    url: typeof response.url === "string" && response.url ? response.url : `${baseURL}${path}`,
    capturedAt: parseMementoDatetime(headerValue(response.headers, "memento-datetime")),
  };
}

/**
 * Reads one capture from a Wayback-style playback endpoint.
 *
 * The `id_` modifier is the whole point: without it the archive returns the
 * capture wrapped in its own toolbar and rewrites every link in the page, so the
 * caller reads the archive's rendition instead of what the site served.
 *
 * @param params - Playback location, the capture to replay, and the read options
 */
export async function readPlaybackCapture(params: {
  /** Origin of the playback host. */
  baseURL: string;
  /** Path segment before the timestamp, such as `/web` or `/4399`. */
  prefix: string;
  /** Original URL as the archive recorded it. */
  original: string;
  /** Capture timestamp digits. */
  stamp: string;
  provider: string;
  options: ArchiveContentOptions;
  meta?: Record<string, unknown>;
}): Promise<ArchivedContent> {
  const { baseURL, prefix, original, stamp, provider, options } = params;
  const body = await fetchBody(baseURL, `${prefix}/${stamp}id_/${original}`, options);

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
 * Decompresses one gzip member, stopping at `maxBytes`.
 *
 * @param bytes - Compressed payload
 * @param maxBytes - Cap on the decompressed size
 * @throws When the runtime has no `DecompressionStream`
 */
export async function gunzip(
  bytes: Uint8Array,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (typeof DecompressionStream !== "function") {
    throw new Error("Reading Common Crawl records requires DecompressionStream in this runtime");
  }

  const compressed = new Response(bytes as BodyInit).body;
  if (!compressed) throw new Error("Empty Common Crawl record");

  return readCappedBytes(compressed.pipeThrough(new DecompressionStream("gzip")), maxBytes);
}

/**
 * Splits a WARC response record into its HTTP header block and body.
 *
 * A record is the WARC headers, a blank line, the HTTP status line and headers,
 * another blank line, and then the bytes the server sent.
 *
 * @param record - One decompressed WARC record
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

/** Reads the status code and content type out of an HTTP header block. */
export function parseHttpHeaders(headers: string): { status?: number; contentType?: string } {
  const lines = headers.split(/\r?\n/);
  const statusMatch = HTTP_STATUS_LINE.exec(lines[0] ?? "");
  const contentTypeLine = lines.find((line) => /^content-type\s*:/i.test(line));

  return {
    ...(statusMatch ? { status: Number.parseInt(statusMatch[1], 10) } : {}),
    ...(contentTypeLine
      ? { contentType: contentTypeLine.split(":").slice(1).join(":").trim() }
      : {}),
  };
}

/** Slack to add to a byte cap so a record's headers do not eat the caller's budget. */
export function withHeaderSlack(maxBytes: number): number {
  return maxBytes + WARC_HEADER_SLACK;
}

/** Reduces a content type to its media type, dropping `; charset=…`. */
export function baseMime(contentType: string | undefined): string | undefined {
  if (!contentType) return undefined;
  const mime = contentType.split(";")[0]?.trim().toLowerCase();
  return mime || undefined;
}

/** True for the media types whose bodies are text a caller can read. */
export function isTextualMime(mime: string | undefined): boolean {
  if (!mime) return true; // Unknown type: the decoded body is the only evidence either way.
  return (
    mime.startsWith("text/") ||
    mime.endsWith("+xml") ||
    mime.endsWith("+json") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/xhtml+xml" ||
    mime === "application/javascript" ||
    mime === "application/x-javascript" ||
    mime === "application/ecmascript"
  );
}

/**
 * Reduces an archived HTML document to the text a reader would see.
 *
 * Deliberately lossy and dependency-free: scripts, styles and markup carry none
 * of the answer a caller asked for, and they are most of the bytes.
 *
 * One forward scan rather than a chain of `replace()` calls, because every
 * unterminated-construct pattern that job needs (`<!--…-->`, `<script>…</script>`,
 * `<[^>]*>`) backtracks quadratically over an input that never terminates them —
 * and an archived page is an input an attacker picks. Measured before the
 * rewrite: 128 KiB of bare `<` took 9.8 seconds of one CPU.
 *
 * @param html - Archived markup
 */
export function htmlToText(html: string): string {
  // Searches run against an ASCII-lowered copy so tag names match whatever case
  // the document used; `[A-Z]` preserves length, so the indices still address the
  // original and slices come out unchanged.
  const lower = html.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const parts: string[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const open = lower.indexOf("<", cursor);
    if (open === -1) {
      parts.push(html.slice(cursor));
      break;
    }
    parts.push(html.slice(cursor, open));

    if (lower.startsWith("<!--", open)) {
      const commentEnd = lower.indexOf("-->", open + 4);
      // An unterminated construct means truncation cut the document mid-markup,
      // and what follows is its source rather than anything a reader would see.
      if (commentEnd === -1) break;
      parts.push(" ");
      cursor = commentEnd + 3;
      continue;
    }

    const tag = readTagName(lower, open);
    if (!tag.closing && NOISE_TAGS.has(tag.name)) {
      const closeStart = lower.indexOf(`</${tag.name}`, open + tag.name.length + 1);
      if (closeStart === -1) break;
      const closeEnd = lower.indexOf(">", closeStart);
      if (closeEnd === -1) break;
      parts.push(" ");
      cursor = closeEnd + 1;
      continue;
    }

    const tagEnd = lower.indexOf(">", open);
    if (tagEnd === -1) break;
    parts.push(endsLine(tag) ? "\n" : " ");
    cursor = tagEnd + 1;
  }

  return decodeEntities(parts.join(""))
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
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

/** Reads the element name at a `<` position, lowercased and without its slash. */
function readTagName(lower: string, open: number): TagName {
  let index = open + 1;
  const closing = lower[index] === "/";
  if (closing) index++;

  const start = index;
  while (index < lower.length && isNameByte(lower.charCodeAt(index))) index++;

  return { name: lower.slice(start, index), closing };
}

function isNameByte(code: number): boolean {
  // a-z (the copy is already lowered) or 0-9
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function endsLine(tag: TagName): boolean {
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
  return text.replace(/&(#x?[\da-f]+|[a-z]+);/gi, (match, entity: string) => {
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
 */
export function decodeArchivedBody(bytes: Uint8Array, contentType?: string): string {
  return decodeBytes(bytes, charsetOf(contentType, bytes));
}

/** Picks the character set to decode with: the declared one, then the document's own. */
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

/** Reads a header from either a `Headers` instance or a plain record. */
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

/**
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
  stream: ReadableStream<Uint8Array>,
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

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { bytes, truncated };
}

/** Locates the blank line separating a header block from what follows it. */
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
