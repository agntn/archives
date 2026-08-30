import { consola } from "consola";
import { $fetch } from "ofetch";
import { cleanDoubleSlashes } from "ufo";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
  ArchivedPage,
  CommonCrawlMetadata,
} from "../types";
import type { CommonCrawlOptions } from "../_providers";
import {
  waybackTimestampToISO,
  normalizeDomain,
  createContentErrorResponse,
  createContentResponse,
  createSuccessResponse,
  createErrorResponse,
  createFetchOptions,
  dechunkHttpBody,
  decodeArchivedBody,
  decodeContentEncoding,
  decompress,
  parseHttpHeaders,
  preferSameUrl,
  resolveMaxBytes,
  resolveRequestedTimestamp,
  selectCapture,
  splitWarcRecord,
  timestampUpperBound,
  toWaybackTimestamp,
  withHeaderSlack,
} from "../utils";
import { BaseProvider } from "./base-provider";

const BASE_URL = "https://index.commoncrawl.org";
const DATA_BASE_URL = "https://data.commoncrawl.org";

/**
 * Captures pulled for one URL before the closest is picked locally.
 *
 * Wide enough that a URL crawled repeatedly in one crawl still arrives whole:
 * the ordering parameters below decide which rows come back, and this decides
 * whether the answer depends on them at all.
 */
const CONTENT_CAPTURE_LIMIT = 100;

/** One indexed capture, with the WARC coordinates its body is read from. */
interface CrawlCapture {
  url: string;
  timestamp: string;
  status?: number;
  mime?: string;
  digest?: string;
  filename: string;
  offset: string;
  length: string;
}

interface CrawlIndex {
  collectionName: string;
  indexName: string;
}

interface CrawlRecordBody {
  text: string;
  bytes: number;
  truncated: boolean;
  status?: number;
  mime?: string;
}

interface CollinfoEntry {
  name?: string;
  "cdx-api"?: string;
  cdxApi?: string;
}

function indexName(collection: string): string {
  return collection.endsWith("-index") ? collection : `${collection}-index`;
}

function listingQuery(
  domain: string,
  options: Readonly<CommonCrawlOptions>,
): Record<string, string> {
  return {
    url: normalizeDomain(domain),
    output: "json",
    fl: "url,timestamp,status,mime,length,offset,filename,digest",
    collapse: "digest",
    limit: String(options.limit ?? 1000),
  };
}

function listingPage(
  record: Readonly<Record<string, string>>,
  collection: string,
): ArchivedPage | undefined {
  const isoTimestamp = waybackTimestampToISO(record["timestamp"] ?? "");
  if (!isoTimestamp) {
    consola.debug("[commoncrawl] Dropping record with invalid timestamp", {
      timestamp: record["timestamp"],
      url: record["url"],
    });
    return undefined;
  }
  const filename = record["filename"] ?? "";
  return {
    url: cleanDoubleSlashes(record["url"] ?? ""),
    timestamp: isoTimestamp,
    snapshot: `${DATA_BASE_URL}/${filename}`,
    _meta: {
      timestamp: record["timestamp"],
      status: Number.parseInt(record["status"] || "0", 10),
      digest: record["digest"],
      mime: record["mime"],
      length: record["length"],
      offset: record["offset"],
      filename,
      collection,
      provider: "commoncrawl",
    } as CommonCrawlMetadata,
  };
}

function contentQuery(target: string, wanted: string): Record<string, string> {
  const params: Record<string, string> = {
    url: target,
    output: "json",
    fl: "url,timestamp,status,mime,length,offset,filename,digest",
    limit: String(CONTENT_CAPTURE_LIMIT),
  };
  if (wanted) {
    params.closest = timestampUpperBound(wanted);
    params.sort = "closest";
  } else {
    params.sort = "reverse";
  }
  return params;
}

function optionalCaptureFields(record: Readonly<Record<string, string>>): Partial<CrawlCapture> {
  const result: Partial<CrawlCapture> = {};
  const status = Number.parseInt(record["status"] ?? "", 10);
  if (Number.isFinite(status)) result.status = status;
  if (record["mime"]) result.mime = record["mime"];
  if (record["digest"]) result.digest = record["digest"];
  return result;
}

function crawlCapture(
  record: Readonly<Record<string, string>>,
  target: string,
): CrawlCapture | undefined {
  const timestamp = toWaybackTimestamp(record["timestamp"] ?? "");
  const filename = record["filename"];
  const offset = record["offset"];
  const length = record["length"];
  if (!timestamp || !filename || !offset || !length) return undefined;

  return {
    url: record["url"] ?? target,
    timestamp,
    filename,
    offset,
    length,
    ...optionalCaptureFields(record),
  };
}

function normalizeCdxApi(value: string): string {
  const path = value.startsWith("http") ? new URL(value).pathname : value;
  return path.startsWith("/") ? path.slice(1) : path;
}

function collinfoApi(entry: Readonly<CollinfoEntry>): string | undefined {
  const primary = entry["cdx-api"];
  return typeof primary === "string" && primary ? primary : entry.cdxApi;
}

function parseCollinfo(value: unknown): CrawlIndex | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const first: unknown = value[0];
  if (typeof first !== "object" || first === null) return undefined;
  const entry = first as CollinfoEntry;
  const api = collinfoApi(entry);
  if (typeof api === "string") {
    const path = normalizeCdxApi(api);
    const collectionName = path.endsWith("-index") ? path.slice(0, -"-index".length) : path;
    return { collectionName, indexName: path };
  }
  if (typeof entry.name !== "string") return undefined;
  return { collectionName: entry.name, indexName: indexName(entry.name) };
}

function commonCrawlContentResponse(
  capture: Readonly<CrawlCapture>,
  record: Readonly<CrawlRecordBody>,
  collection: string,
  wanted: string,
): ArchiveContentResponse {
  const mime = record.mime ?? capture.mime;
  return createContentResponse(
    {
      url: cleanDoubleSlashes(capture.url),
      timestamp: waybackTimestampToISO(capture.timestamp),
      snapshot: `${DATA_BASE_URL}/${capture.filename}`,
      content: record.text,
      ...(mime ? { mime } : {}),
      bytes: record.bytes,
      truncated: record.truncated,
      _meta: {
        timestamp: capture.timestamp,
        status: record.status ?? capture.status,
        provider: "commoncrawl",
        collection,
        filename: capture.filename,
        offset: capture.offset,
        length: capture.length,
        ...(capture.digest ? { digest: capture.digest } : {}),
      },
    },
    "commoncrawl",
    { collection, requestedTimestamp: wanted || undefined },
  );
}

async function fetchIndexRecords(
  path: string,
  params: Readonly<Record<string, string>>,
  options: Readonly<ArchiveOptions>,
): Promise<{ records: Array<Record<string, string>>; queryParams: unknown }> {
  const fetchOptions = await createFetchOptions(BASE_URL, params, {
    retries: options.retries,
    signal: options.signal,
    timeout: options.timeout ?? 60_000,
    responseType: "text",
  });
  try {
    const raw: unknown = await $fetch(`/${path}`, fetchOptions);
    return { records: parseIndexRecords(raw), queryParams: fetchOptions.params };
  } catch (error) {
    if (!isNoCapturesError(error)) throw error;
    return { records: [], queryParams: fetchOptions.params };
  }
}

function decodedCrawlRecord(
  bytes: Uint8Array,
  decodedTruncated: boolean,
  recordTruncated: boolean,
  maxBytes: number,
  status: number | undefined,
  contentType: string | undefined,
): CrawlRecordBody {
  const overflowed = bytes.byteLength > maxBytes;
  const body = overflowed ? bytes.subarray(0, maxBytes) : bytes;
  return {
    text: decodeArchivedBody(body, contentType),
    bytes: body.byteLength,
    truncated: recordTruncated || decodedTruncated || overflowed,
    ...(status === undefined ? {} : { status }),
    ...(contentType ? { mime: contentType.split(";")[0]?.trim().toLowerCase() } : {}),
  };
}

function parseByteRange(capture: Readonly<CrawlCapture>): { start: number; length: number } {
  const start = Number.parseInt(capture.offset, 10);
  const length = Number.parseInt(capture.length, 10);
  if (!Number.isFinite(start) || !Number.isFinite(length) || length <= 0) {
    throw new Error("Common Crawl index gave no usable byte range for this capture");
  }
  return { start, length };
}

/**
 * Common Crawl archive provider.
 */
export class CommonCrawlProvider extends BaseProvider<CommonCrawlOptions> {
  readonly name = "Common Crawl";
  readonly slug = "commoncrawl";

  /**
   * Cache key extension that separates storage entries by collection.

   *
   * @param options - Options.
   * @returns {string | undefined} The operation result.
   */
  override cacheKey(options?: Readonly<ArchiveOptions>): string | undefined {
    const collection =
      (options as Partial<CommonCrawlOptions> | undefined)?.collection ?? this.options.collection;
    return collection === undefined ? undefined : `collection=${encodeURIComponent(collection)}`;
  }

  /**
   * Fetch archived snapshots from Common Crawl.

   *
   * @param domain - Domain.
   * @param reqOptions - Req Options.
   * @returns {Promise<ArchiveResponse>} A promise resolving to the operation result.
   */
  async snapshots(
    domain: string,
    reqOptions: Readonly<Partial<CommonCrawlOptions>> = {},
  ): Promise<ArchiveResponse> {
    let collectionName: string | undefined;

    try {
      const options = await this.resolveOptions(reqOptions);
      const index = await this.resolveIndex(options);
      const collection = index.collectionName;
      collectionName = collection;

      const { records, queryParams } = await fetchIndexRecords(
        index.indexName,
        listingQuery(domain, options),
        options,
      );
      const pages = records
        .map((record) => listingPage(record, collection))
        .filter((page): page is ArchivedPage => page !== undefined);

      return createSuccessResponse(pages, "commoncrawl", {
        collection,
        count: pages.length,
        queryParams,
      });
    } catch (error) {
      return createErrorResponse(error, "commoncrawl", { collection: collectionName });
    }
  }

  /**
   * Read the body of one archived capture from Common Crawl.
   *
   * Common Crawl has no playback host: the index gives the WARC file plus the
   * byte range of the record inside it, so the body is a range request against
   * that file, gzip-decoded, with the WARC and HTTP header blocks stripped off.

   *
   * @param url - Url.
   * @param reqOptions - Req Options.
   * @returns {Promise<ArchiveContentResponse>} A promise resolving to the operation result.
   */
  override async content(
    url: string,
    reqOptions: Readonly<Partial<CommonCrawlOptions> & ArchiveContentOptions> = {},
  ): Promise<ArchiveContentResponse> {
    let collectionName: string | undefined;

    try {
      const options = await this.resolveContentOptions(reqOptions);
      const target = normalizeDomain(url, false);
      if (target.includes("*")) {
        throw new Error("Reading archived content requires one exact URL, not a wildcard pattern");
      }

      const wanted = resolveRequestedTimestamp(options.timestamp);
      const index = await this.resolveIndex(options);
      collectionName = index.collectionName;

      const captures = await this.findCaptures(index.indexName, target, wanted, options);
      const capture = selectCapture(
        preferSameUrl(captures, url, (candidate) => candidate.url),
        wanted,
      );
      if (!capture) {
        return createContentErrorResponse(
          `No Common Crawl capture for ${target} in ${collectionName}${wanted ? ` near ${wanted}` : ""}`,
          "commoncrawl",
          { collection: collectionName, requestedTimestamp: wanted || undefined },
        );
      }

      const record = await this.readRecord(capture, options, resolveMaxBytes(options));
      return commonCrawlContentResponse(capture, record, collectionName, wanted);
    } catch (error) {
      return createContentErrorResponse(error, "commoncrawl", { collection: collectionName });
    }
  }

  /**
   * Resolves which crawl to query: the configured collection, or the newest one
   * `collinfo.json` advertises.
   *
   * The endpoint names differ from the collection ids by an `-index` suffix, and
   * the two are reported separately because the collection id is what a caller
   * sees in the response while the endpoint name is what the query needs.

   *
   * @param options - Options.
   * @returns {Promise<{ collectionName: string; indexName: string }>} A promise resolving to the operation result.
   */
  private async resolveIndex(options: Readonly<Partial<CommonCrawlOptions>>): Promise<CrawlIndex> {
    const configured = options.collection;
    if (configured && configured !== "CC-MAIN-latest") {
      return { collectionName: configured, indexName: indexName(configured) };
    }
    return this.fetchLatestIndex(options);
  }

  private async fetchLatestIndex(
    options: Readonly<Partial<CommonCrawlOptions>>,
  ): Promise<CrawlIndex> {
    const fetchOptions = await createFetchOptions(
      BASE_URL,
      {},
      {
        retries: options.retries,
        signal: options.signal,
        timeout: options.timeout ?? 60_000,
      },
    );
    const response: unknown = await $fetch("/collinfo.json", fetchOptions);
    const index = parseCollinfo(response);
    if (!index) throw new Error("Common Crawl collinfo.json returned no usable collection");
    return index;
  }

  /**
   * Lists the indexed captures of one exact URL, with their WARC coordinates.
   * The row cap leaves enough captures to sort frequently crawled URLs before selection.
   *
   * @param indexName - Index Name.
   * @param target - Target.
   * @param wanted - Wanted.
   * @param options - Options.
   * @returns {Promise<CrawlCapture[]>} A promise resolving to the operation result.
   */
  private async findCaptures(
    indexName: string,
    target: string,
    wanted: string,
    options: Readonly<ArchiveContentOptions>,
  ): Promise<CrawlCapture[]> {
    const { records } = await fetchIndexRecords(indexName, contentQuery(target, wanted), options);
    return records
      .map((record) => crawlCapture(record, target))
      .filter((capture): capture is CrawlCapture => capture !== undefined);
  }

  /**
   * Fetches one WARC record by byte range and unwraps the HTTP response inside it.
   *
   * @param capture - Capture.
   * @param options - Options.
   * @param maxBytes - Max Bytes.
   * @returns {Promise<{
    text: string;
    bytes: number;
    truncated: boolean;
    status?: number;
    mime?: string;
  }>} A promise resolving to the operation result.
   */
  private async readRecord(
    capture: Readonly<CrawlCapture>,
    options: Readonly<ArchiveContentOptions>,
    maxBytes: number,
  ): Promise<CrawlRecordBody> {
    const { start, length } = parseByteRange(capture);

    const fetchOptions = await createFetchOptions(
      DATA_BASE_URL,
      {},
      {
        responseType: "stream",
        retries: options.retries,
        signal: options.signal,
        timeout: options.timeout ?? 60_000,
        headers: { range: `bytes=${start}-${start + length - 1}` },
      },
    );
    const segment: unknown = await $fetch(`/${capture.filename}`, fetchOptions);

    // The record's own headers sit in front of the body, so the decompression
    // cap has to leave room for them or a small body would come back empty.
    const record = await decompress(segment, withHeaderSlack(maxBytes));
    const parts = splitWarcRecord(record.bytes);
    if (!parts) {
      throw new Error("Common Crawl returned a record without a readable HTTP response");
    }

    const { status, contentType, contentEncoding, transferEncoding } = parseHttpHeaders(
      parts.httpHeaders,
    );

    // A record keeps the response as it travelled: framing first, then whatever
    // encoding the server applied. Reading the text means undoing both, in that
    // order, or the page comes back as noise that looks like a charset problem.
    const framed = /chunked/i.test(transferEncoding ?? "")
      ? dechunkHttpBody(parts.body)
      : parts.body;

    const decoded = await decodeContentEncoding(framed, contentEncoding, maxBytes);
    return decodedCrawlRecord(
      decoded.bytes,
      decoded.truncated,
      record.truncated,
      maxBytes,
      status,
      contentType,
    );
  }
}

/*
 * Whether a thrown index error is the CDX way of saying the URL was never
 * captured: the endpoint answers 404 with a JSON `No Captures found` message
 * instead of an empty body, so a missing page would otherwise read as an
 * outage. Every other 404 keeps meaning failure.
 */
function isNoCapturesError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { status, statusCode, data } = error as {
    status?: unknown;
    statusCode?: unknown;
    data?: unknown;
  };
  if (status !== 404 && statusCode !== 404) return false;
  const body = typeof data === "string" ? data : data ? JSON.stringify(data) : "";
  return body.includes("No Captures found");
}

/* Parses the newline-delimited JSON the CDX index answers with. */
function parseIndexRecord(line: string): Record<string, string> {
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("Common Crawl index returned a non-object JSON record");
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") record[key] = value;
  }
  return record;
}

function parseIndexRecords(raw: unknown): Array<Record<string, string>> {
  const text = typeof raw === "string" ? raw : String(raw);
  const records: Array<Record<string, string>> = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) records.push(parseIndexRecord(trimmed));
  }
  return records;
}

export default function commonCrawl(
  initOptions: Readonly<Partial<CommonCrawlOptions>> = {},
): CommonCrawlProvider {
  return new CommonCrawlProvider(initOptions);
}
