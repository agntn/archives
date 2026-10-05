import { consola } from "consola";
import { fetchData } from "../utils/_fetch.ts";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
  ArchivedPage,
  OszkMetadata,
} from "../types.ts";
import type { OszkOptions } from "../_providers.ts";
import {
  createContentErrorResponse,
  createContentResponse,
  createErrorResponse,
  createFetchOptions,
  createSuccessResponse,
  normalizeDomain,
  preferSameUrl,
  readPlaybackCapture,
  resolveRequestedTimestamp,
  selectCapture,
  toWaybackTimestamp,
  waybackTimestampToISO,
} from "../utils/index.ts";
import { BaseProvider } from "./base-provider.ts";

const BASE_URL = "https://webadmin.oszk.hu";
const PREFIX = "/pywb";
const CDX_FIELDS = "url,timestamp,status,mime,digest,length";
const CONTENT_CAPTURE_LIMIT = 200;

interface OszkCapture {
  url: string;
  timestamp: string;
  status?: number;
  mime?: string;
  digest?: string;
  length?: string;
}

function queryWindow(options: Readonly<OszkOptions>): Record<string, string> {
  const result: Record<string, string> = {};
  const from = resolveRequestedTimestamp(options.from, "from");
  const to = resolveRequestedTimestamp(options.to, "to");
  if (from) result.from = from;
  if (to) result.to = to;
  return result;
}

function contentQuery(
  target: string,
  bound?: Readonly<{ edge: "from" | "to"; timestamp: string }>,
): Record<string, string> {
  const params: Record<string, string> = { url: target, matchType: "exact" };
  if (bound) params[bound.edge] = bound.timestamp;
  if (!bound || bound.edge === "to") params.sort = "reverse";
  return params;
}

/**
 * Reads one CDX field. pywb writes "-" for one it doesn't know, and that's no value.
 * @param value - The field as parsed from the row.
 * @returns {string} The field, or an empty string.
 */
function field(value: unknown): string {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return text === "-" ? "" : text;
}

function optionalCaptureFields(record: Readonly<Record<string, unknown>>): Partial<OszkCapture> {
  const result: Partial<OszkCapture> = {};
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

function parseCapture(line: string): OszkCapture | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("OSZK Webarchívum returned a malformed CDX record");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("OSZK Webarchívum returned a malformed CDX record");
  }

  const record = value as Readonly<Record<string, unknown>>;
  const url = field(record["url"]);
  const timestamp = toWaybackTimestamp(field(record["timestamp"]));
  if (!url || !timestamp) {
    consola.debug("[oszk] Dropping CDX record without a usable URL and timestamp", record);
    return undefined;
  }
  return { url, timestamp, ...optionalCaptureFields(record) };
}

function parseCaptures(raw: unknown): OszkCapture[] {
  const text = typeof raw === "string" ? raw : "";
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseCapture(line))
    .filter((capture): capture is OszkCapture => capture !== undefined);
}

function supplementalMetadata(
  capture: Readonly<OszkCapture>,
): Pick<OszkMetadata, "mime" | "digest" | "length"> {
  return {
    ...(capture.mime ? { mime: capture.mime } : {}),
    ...(capture.digest ? { digest: capture.digest } : {}),
    ...(capture.length ? { length: capture.length } : {}),
  };
}

function page(capture: Readonly<OszkCapture>): ArchivedPage {
  const metadata: OszkMetadata = {
    provider: "oszk",
    timestamp: capture.timestamp,
    ...(capture.status === undefined ? {} : { status: capture.status }),
    ...supplementalMetadata(capture),
  };
  return {
    url: capture.url,
    timestamp: waybackTimestampToISO(capture.timestamp),
    snapshot: `${BASE_URL}${PREFIX}/${capture.timestamp}/${capture.url}`,
    _meta: metadata,
  };
}

function exactContentTarget(url: string): string {
  const target = normalizeDomain(url, false).trim();
  if (!target) throw new Error("OSZK Webarchívum target must not be empty");
  if (target.includes("*")) {
    throw new Error("Reading archived content requires one exact URL, not a wildcard pattern");
  }
  return target;
}

async function fetchCaptures(
  params: Readonly<Record<string, string>>,
  limit: number,
  options: Readonly<OszkOptions>,
): Promise<{ captures: OszkCapture[]; queryParams: unknown }> {
  const fetchOptions = await createFetchOptions(
    BASE_URL,
    { ...params, output: "json", fl: CDX_FIELDS, limit: String(limit) },
    {
      retries: options.retries,
      signal: options.signal,
      timeout: options.timeout,
      responseType: "text",
    },
  );
  const raw: unknown = await fetchData(`${PREFIX}/cdx`, fetchOptions);
  return { captures: parseCaptures(raw), queryParams: fetchOptions.params };
}

/** OSZK Webarchívum, the Hungarian web archive run by the National Széchényi Library. */
export class OszkProvider extends BaseProvider<OszkOptions> {
  readonly name = "OSZK Webarchívum";
  readonly slug = "oszk";

  override cacheKey(options?: Readonly<ArchiveOptions>): string {
    const requestedLimit =
      options && Object.hasOwn(options, "limit") ? options.limit : this.options.limit;
    return `oszkLimit=${requestedLimit ?? 1000}`;
  }

  /**
   * Lists captures under a domain or URL. pywb reads limit=0 as "everything", so it never goes out.
   * @param domain - Domain, URL or URL prefix to list.
   * @param reqOptions - Per call options.
   * @returns {Promise<ArchiveResponse>} The captures, oldest first.
   */
  async snapshots(
    domain: string,
    reqOptions: Readonly<OszkOptions> = {},
  ): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);
      const target = domain.trim();
      if (!target) throw new Error("OSZK Webarchívum target must not be empty");

      const limit = options.limit ?? 1000;
      if (limit <= 0) return createSuccessResponse([], "oszk");

      const { captures, queryParams } = await fetchCaptures(
        { url: normalizeDomain(target), ...queryWindow(options) },
        limit,
        options,
      );
      return createSuccessResponse(captures.map(page), "oszk", { queryParams });
    } catch (error) {
      return createErrorResponse(error, "oszk");
    }
  }

  override async content(
    url: string,
    reqOptions: Readonly<OszkOptions & ArchiveContentOptions> = {},
  ): Promise<ArchiveContentResponse> {
    try {
      const options = await this.resolveContentOptions(reqOptions);
      const target = exactContentTarget(url);
      const wanted = resolveRequestedTimestamp(options.timestamp);
      const captures = await this.findCaptures(target, wanted, options);
      const capture = selectCapture(
        preferSameUrl(captures, url, (candidate) => candidate.url),
        wanted,
      );
      if (!capture) {
        return createContentErrorResponse(
          `No OSZK Webarchívum capture for ${target}${wanted ? ` near ${wanted}` : ""}`,
          "oszk",
          { requestedTimestamp: wanted || undefined },
        );
      }

      const content = await readPlaybackCapture({
        baseURL: BASE_URL,
        prefix: PREFIX,
        original: capture.url,
        stamp: capture.timestamp,
        provider: "oszk",
        captureStatus: capture.status,
        options,
      });
      const served =
        content._meta.timestamp === capture.timestamp
          ? { ...content, _meta: { ...content._meta, ...supplementalMetadata(capture) } }
          : content;
      return createContentResponse(served, "oszk", { requestedTimestamp: wanted || undefined });
    } catch (error) {
      return createContentErrorResponse(error, "oszk");
    }
  }

  private async findCaptures(
    target: string,
    wanted: string,
    options: Readonly<OszkOptions>,
  ): Promise<OszkCapture[]> {
    const firstBound = wanted ? { edge: "to" as const, timestamp: wanted } : undefined;
    const { captures } = await fetchCaptures(
      contentQuery(target, firstBound),
      CONTENT_CAPTURE_LIMIT,
      options,
    );
    if (captures.length > 0 || !wanted) return captures;

    const later = await fetchCaptures(
      contentQuery(target, { edge: "from", timestamp: wanted }),
      CONTENT_CAPTURE_LIMIT,
      options,
    );
    return later.captures;
  }
}

export default function oszk(initOptions: Readonly<OszkOptions> = {}): OszkProvider {
  return new OszkProvider(initOptions);
}
