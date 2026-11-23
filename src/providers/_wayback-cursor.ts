/** Continuation of Wayback CDX listings through the index's own `resumeKey`. */
import { sha256 } from "@agntn/hashes/sha2";

/** Where a listing stopped: the last row's key, and the rows at that key already listed. */
interface Position {
  readonly v: 1;
  /** Hash of the query the cursor continues. */
  readonly q: string;
  /** `urlkey timestamp` of the last listed row. */
  readonly k: string;
  /** Short hashes of the rows listed at `k`, each with its count. */
  readonly t: Readonly<Record<string, number>>;
}

/** The CDX query for one page, with what reading its answer needs. */
export interface PageRequest {
  readonly params: Readonly<Record<string, string>>;
  readonly limit: number;
  readonly binding: string;
  readonly position?: Position;
}

/** A CDX row, read only. */
type Row = readonly string[];

/** Reads `urlkey timestamp` from a row. */
type KeyOf = (row: Row) => string;

/** One page of a listing. */
export interface Page {
  rows: Row[];
  cursor?: string;
  exhausted: boolean;
}

/** Most rows a cursor may count at one key, so a forged one can't inflate the CDX limit. */
const MAX_TIES = 1000;

/** Parameters a cursor is bound to. `limit` isn't one, so the page size may change. */
const BOUND_PARAMS = ["url", "collapse", "filter", "from", "to"] as const;

const INVALID = "Invalid Wayback cursor: pass the cursor a previous page returned, unchanged";
const MISMATCH =
  "Wayback cursor belongs to another listing: repeat the target, collapse, filter, from and to it came with";
const STALE =
  "Wayback cursor is stale: a capture it listed is gone from the index, so list again without it";

/**
 * Short hex SHA-256 of some text.
 * @param text - Text to hash
 * @param length - Hex digits to keep
 * @returns {string} The digest prefix
 */
function shortHash(text: string, length: number): string {
  return sha256(new TextEncoder().encode(text)).toHex().slice(0, length);
}

/**
 * The key one second before `key`. CDX resumes after a key, and this brings back every row at it.
 * @param key - `urlkey timestamp` of a listed row
 * @returns {string} The key to resume after
 */
function keyBefore(key: string): string {
  const split = key.lastIndexOf(" ");
  const stamp = key.slice(split + 1);
  if (!/^\d{14}$/u.test(stamp) || /^0+$/u.test(stamp)) return key;
  return `${key.slice(0, split)} ${(BigInt(stamp) - 1n).toString().padStart(14, "0")}`;
}

/**
 * Packs a key the way CDX prints its own: zlib, then unpadded base64url.
 * @param key - `urlkey timestamp`
 * @returns {Promise<string>} The `resumeKey` value
 */
async function packKey(key: string): Promise<string> {
  const { deflate } = await import("@agntn/compressions/deflate");
  const bytes = deflate.compress(new TextEncoder().encode(key), { container: "zlib" });
  return bytes.toBase64({ alphabet: "base64url", omitPadding: true });
}

/**
 * Unpacks a `resumeKey` CDX printed.
 * @param packed - The key as printed
 * @returns {Promise<string | undefined>} `urlkey timestamp`, or nothing for a key it can't read
 */
async function unpackKey(packed: string): Promise<string | undefined> {
  try {
    const { deflate } = await import("@agntn/compressions/deflate");
    const bytes = Uint8Array.fromBase64(packed, { alphabet: "base64url" });
    const { bytes: key } = deflate.decompress(bytes, { container: "zlib", limit: 8192 });
    return new TextDecoder("utf-8", { fatal: true }).decode(key) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Checks that every tie count is a positive integer.
 * @param ties - Decoded `t` field
 * @returns {boolean} Whether the counts are usable
 */
function validTies(ties: unknown): ties is Record<string, number> {
  if (typeof ties !== "object" || ties === null || Array.isArray(ties)) return false;
  const counts = Object.values(ties);
  if (!counts.every((count) => Number.isSafeInteger(count) && Number(count) > 0)) return false;
  return counts.reduce((sum: number, count) => sum + Number(count), 0) <= MAX_TIES;
}

/**
 * Checks the shape a cursor decodes to.
 * @param value - Decoded JSON
 * @returns {boolean} Whether it names a position
 */
function isPosition(value: unknown): value is Position {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Readonly<Record<string, unknown>>;
  const key = record["k"];
  if (record["v"] !== 1 || typeof record["q"] !== "string") return false;
  return typeof key === "string" && key !== "" && validTies(record["t"]);
}

/**
 * Reads a cursor, refusing a malformed one or one from another query.
 * @param cursor - Cursor a previous page returned
 * @param binding - Hash of the current query
 * @returns {Position} The position it names
 * @throws {Error} When it can't continue this query
 */
function readCursor(cursor: string, binding: string): Position {
  let value: unknown;
  try {
    const bytes = Uint8Array.fromBase64(cursor, { alphabet: "base64url" });
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(INVALID);
  }
  if (!isPosition(value)) throw new Error(INVALID);
  if (value.q !== binding) throw new Error(MISMATCH);
  return value;
}

/**
 * Packs a position into the cursor a caller passes back.
 * @param position - Where the next page starts
 * @returns {string} The cursor
 */
function writeCursor(position: Position): string {
  return new TextEncoder()
    .encode(JSON.stringify(position))
    .toBase64({ alphabet: "base64url", omitPadding: true });
}

/**
 * Turns a listing query into the query for one page of it.
 *
 * It asks for one row past the page, so a full page can tell more rows from none.
 *
 * @param params - CDX query, `limit` aside
 * @param options - Page size, and the cursor to continue from
 * @returns {Promise<PageRequest>} The query, with what reading its answer needs
 * @throws {Error} When the cursor can't continue this query
 */
export async function pageRequest(
  params: Readonly<Record<string, string>>,
  options: Readonly<{ limit: number; cursor?: string }>,
): Promise<PageRequest> {
  const binding = shortHash(JSON.stringify(BOUND_PARAMS.map((name) => params[name] ?? "")), 16);
  const position = options.cursor === undefined ? undefined : readCursor(options.cursor, binding);
  const listed = Object.values(position?.t ?? {}).reduce((sum, count) => sum + count, 0);
  return {
    params: {
      ...params,
      limit: String(listed + options.limit + 1),
      showResumeKey: "true",
      ...(position ? { resumeKey: await packKey(keyBefore(position.k)) } : {}),
    },
    limit: options.limit,
    binding,
    ...(position ? { position } : {}),
  };
}

/**
 * Splits a JSON answer into its header, its rows and the resume key printed after them.
 * @param response - Parsed `output=json` body
 * @returns {{ header: Row; rows: Row[]; resumeKey?: string }} The parts
 */
function splitAnswer(response: unknown): { header: Row; rows: Row[]; resumeKey?: string } {
  if (!Array.isArray(response) || response.length === 0) return { header: [], rows: [] };
  const [header, ...rest] = response as Row[];
  const gap = rest.findIndex((row) => Array.isArray(row) && row.length === 0);
  const key = gap === -1 ? undefined : rest[gap + 1]?.[0];
  return {
    header: Array.isArray(header) ? header : [],
    rows: gap === -1 ? rest : rest.slice(0, gap),
    ...(typeof key === "string" && key !== "" ? { resumeKey: key } : {}),
  };
}

/**
 * Reads `urlkey timestamp` from a row by the answer's header.
 * @param header - Field names of the answer
 * @returns {KeyOf} The reader, empty for a row without both
 */
function keyReader(header: Row): KeyOf {
  const urlkey = header.indexOf("urlkey");
  const timestamp = header.indexOf("timestamp");
  return (row) => {
    const surt = urlkey === -1 ? undefined : row[urlkey];
    const stamp = timestamp === -1 ? undefined : row[timestamp];
    return surt && stamp ? `${surt} ${stamp}` : "";
  };
}

/**
 * How many leading rows sit at `key`.
 * @param rows - Rows of an answer
 * @param keyOf - Key reader
 * @param key - The key
 * @returns {number} The count
 */
function leadingAt(rows: readonly Row[], keyOf: KeyOf, key: string): number {
  const after = rows.findIndex((row) => keyOf(row) !== key);
  return after === -1 ? rows.length : after;
}

/**
 * Drops the rows at the cursor's key that an earlier page listed.
 *
 * Rows are told apart by hash, not place, so the same row listed twice drops twice.
 *
 * @param rows - Rows of the resumed answer
 * @param keyOf - Key reader
 * @param position - The cursor's position
 * @param cut - CDX stopped the answer early, so rows at the key may be missing
 * @returns {Row[]} The rows no earlier page listed
 * @throws {Error} When a listed row is gone, so the index changed under the cursor
 */
function dropListed(
  rows: readonly Row[],
  keyOf: KeyOf,
  position: Position | undefined,
  cut: boolean,
): Row[] {
  if (!position) return [...rows];
  const tied = leadingAt(rows, keyOf, position.k);
  const complete = tied < rows.length || !cut;
  const left = { ...position.t };
  const fresh = rows.slice(0, tied).filter((row) => {
    const hash = shortHash(JSON.stringify(row), 8);
    const count = left[hash] ?? 0;
    if (count === 0) return true;
    left[hash] = count - 1;
    return false;
  });
  if (complete && Object.values(left).some((count) => count > 0)) throw new Error(STALE);
  return [...fresh, ...rows.slice(tied)];
}

/**
 * The cursor that continues after the last row of a page.
 * @param page - Rows of the page
 * @param keyOf - Key reader
 * @param request - The page's request
 * @returns {string | undefined} The cursor, or nothing when the last row has no key
 */
function cursorAfter(page: readonly Row[], keyOf: KeyOf, request: PageRequest): string | undefined {
  const key = keyOf(page.at(-1) ?? []);
  if (!key) return undefined;
  const ties: Record<string, number> = request.position?.k === key ? { ...request.position.t } : {};
  for (const row of page.toReversed().slice(0, leadingAt(page.toReversed(), keyOf, key))) {
    const hash = shortHash(JSON.stringify(row), 8);
    ties[hash] = (ties[hash] ?? 0) + 1;
  }
  if (!validTies(ties)) throw new Error(`Wayback lists over ${MAX_TIES} captures at ${key}`);
  return writeCursor({ v: 1, q: request.binding, k: key, t: ties });
}

/**
 * An empty page CDX cut short: its scan cap hit before a match, and the printed key says where.
 * @param resumeKey - The key CDX printed
 * @param request - The page's request
 * @returns {Promise<Page>} No rows, with a cursor at that key when it moves the listing on
 */
async function stoppedPage(resumeKey: string, request: PageRequest): Promise<Page> {
  const stopped = await unpackKey(resumeKey);
  if (!stopped || (request.position && stopped <= request.position.k)) {
    return { rows: [], exhausted: false };
  }
  return {
    rows: [],
    exhausted: false,
    cursor: writeCursor({ v: 1, q: request.binding, k: stopped, t: {} }),
  };
}

/**
 * Cuts one page out of the answer to a {@link pageRequest} and says where the next one starts.
 * @param response - Parsed `output=json` body
 * @param request - The request it answered
 * @returns {Promise<Page>} The page, the cursor after it, and whether the listing ended
 * @throws {Error} When the index changed under the cursor
 */
export async function readPage(response: unknown, request: PageRequest): Promise<Page> {
  const { header, rows, resumeKey } = splitAnswer(response);
  const keyOf = keyReader(header);
  const fresh = dropListed(rows, keyOf, request.position, resumeKey !== undefined);
  const page = fresh.slice(0, request.limit);
  if (fresh.length > request.limit) {
    const cursor = cursorAfter(page, keyOf, request);
    return { rows: page, exhausted: false, ...(cursor ? { cursor } : {}) };
  }
  if (!resumeKey) return { rows: page, exhausted: true };
  if (page.length === 0) return stoppedPage(resumeKey, request);
  const cursor = cursorAfter(page, keyOf, request);
  return { rows: page, exhausted: false, ...(cursor ? { cursor } : {}) };
}
