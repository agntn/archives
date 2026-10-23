import { resolveRequestedTimestamp, toWaybackTimestamp } from "./_content.ts";

/** One capture as a pywb CDX index lists it, with only the fields the row knows. */
export interface PywbCapture {
  url: string;
  timestamp: string;
  status?: number;
  mime?: string;
  digest?: string;
  length?: string;
}

/**
 * The `from` and `to` a CDX query takes, as archive digits; an unset edge stays out.
 * @param options - Request options with the caller's window
 * @returns {Record<string, string>} The window parameters
 */
export function requestedWindow(
  options: Readonly<{ from?: string; to?: string }>,
): Record<string, string> {
  const result: Record<string, string> = {};
  const from = resolveRequestedTimestamp(options.from, "from");
  const to = resolveRequestedTimestamp(options.to, "to");
  if (from) result.from = from;
  if (to) result.to = to;
  return result;
}

/**
 * Reads one CDX field. pywb writes "-" for one it doesn't know, and that's no value.
 * @param value - The field as parsed from the row
 * @returns {string} The field, or an empty string
 */
function field(value: unknown): string {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return text === "-" ? "" : text;
}

function optionalFields(record: Readonly<Record<string, unknown>>): Partial<PywbCapture> {
  const result: Partial<PywbCapture> = {};
  const status = Number.parseInt(field(record["status"]), 10);
  if (Number.isFinite(status)) result.status = status;
  const mime = field(record["mime"]);
  if (mime) result.mime = mime;
  const digest = field(record["digest"]);
  if (digest) result.digest = digest;
  const length = field(record["length"]);
  if (length) result.length = length;
  return result;
}

/**
 * Parses the JSON object of one pywb index row.
 * @param json - The row's JSON text
 * @param malformed - Error message for a row that isn't an object, naming the archive
 * @returns {Readonly<Record<string, unknown>>} The row's fields
 * @throws {Error} When the row isn't a JSON object
 */
export function pywbRow(json: string, malformed: string): Readonly<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(malformed);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(malformed);
  }
  return value as Readonly<Record<string, unknown>>;
}

/**
 * Turns a row's fields into a capture. A row without a URL or a valid stamp names none.
 * @param record - The row's fields
 * @param timestamp - The capture stamp, which CDXJ keeps outside the JSON
 * @returns {PywbCapture | undefined} The capture, or nothing
 */
export function pywbCapture(
  record: Readonly<Record<string, unknown>>,
  timestamp: unknown,
): PywbCapture | undefined {
  const url = typeof record["url"] === "string" ? field(record["url"]) : "";
  const stamp = toWaybackTimestamp(field(timestamp));
  if (!url || !stamp) return undefined;
  return { url, timestamp: stamp, ...optionalFields(record) };
}

/**
 * Parses one `output=json` row of a pywb index.
 * @param json - The row's JSON text
 * @param malformed - Error message for a row that isn't an object, naming the archive
 * @returns {PywbCapture | undefined} The capture, or nothing for a row missing its URL or stamp
 * @throws {Error} When the row isn't a JSON object
 */
export function parsePywbCapture(json: string, malformed: string): PywbCapture | undefined {
  const record = pywbRow(json, malformed);
  return pywbCapture(record, record["timestamp"]);
}

/**
 * Parses a whole `output=json` answer, one row per line.
 * @param raw - The response body
 * @param malformed - Error message for a broken row, naming the archive
 * @returns {PywbCapture[]} The captures, without rows that name no URL or stamp
 * @throws {Error} When a row isn't a JSON object
 */
export function parsePywbCaptures(raw: unknown, malformed: string): PywbCapture[] {
  const text = typeof raw === "string" ? raw : "";
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parsePywbCapture(line, malformed))
    .filter((capture): capture is PywbCapture => capture !== undefined);
}
