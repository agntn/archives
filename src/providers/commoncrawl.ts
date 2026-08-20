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

/**
 * Common Crawl archive provider.
 */
export class CommonCrawlProvider extends BaseProvider<CommonCrawlOptions> {
  readonly name = "Common Crawl";
  readonly slug = "commoncrawl";

  /**
   * Cache key extension that separates storage entries by collection.
   */
  override cacheKey(options?: ArchiveOptions): string | undefined {
    const collection =
      (options as Partial<CommonCrawlOptions> | undefined)?.collection ?? this.options.collection;
    return collection === undefined ? undefined : `collection=${encodeURIComponent(collection)}`;
  }

  /**
   * Fetch archived snapshots from Common Crawl.
   */
  async snapshots(
    domain: string,
    reqOptions: Partial<CommonCrawlOptions> = {},
  ): Promise<ArchiveResponse> {
    let collectionName: string | undefined;

    try {
      const options = await this.resolveOptions(reqOptions);
      const index = await this.resolveIndex(options);
      collectionName = index.collectionName;

      const urlPattern = normalizeDomain(domain);
      const params: Record<string, string> = {
        url: urlPattern,
        output: "json",
        fl: "url,timestamp,status,mime,length,offset,filename,digest",
        collapse: "digest",
        limit: String(options.limit ?? 1000),
      };

      const fetchOptions = await createFetchOptions(BASE_URL, params, {
        retries: options.retries,
        timeout: options.timeout ?? 60_000,
        responseType: "text",
      });
      const raw = await $fetch(`/${index.indexName}`, fetchOptions);
      const records = parseIndexRecords(raw);

      if (records.length === 0) {
        return createSuccessResponse([], "commoncrawl", {
          collection: collectionName,
          queryParams: fetchOptions.params,
        });
      }

      const pages: ArchivedPage[] = [];

      for (const record of records) {
        const isoTimestamp = waybackTimestampToISO(record.timestamp || "");
        if (!isoTimestamp) {
          consola.debug("[commoncrawl] Dropping record with invalid timestamp", {
            timestamp: record.timestamp,
            url: record.url,
          });
          continue;
        }

        const cleanedUrl = cleanDoubleSlashes(record.url || "");
        const snapUrl = `${DATA_BASE_URL}/${record.filename}`;
        pages.push({
          url: cleanedUrl,
          timestamp: isoTimestamp,
          snapshot: snapUrl,
          _meta: {
            timestamp: record.timestamp,
            status: Number.parseInt(record.status || "0", 10),
            digest: record.digest,
            mime: record.mime,
            length: record.length,
            offset: record.offset,
            filename: record.filename,
            collection: collectionName,
            provider: "commoncrawl",
          } as CommonCrawlMetadata,
        });
      }

      return createSuccessResponse(pages, "commoncrawl", {
        collection: collectionName,
        count: pages.length,
        queryParams: fetchOptions.params,
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
   */
  override async content(
    url: string,
    reqOptions: Partial<CommonCrawlOptions> & ArchiveContentOptions = {},
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

      const maxBytes = resolveMaxBytes(options);
      const record = await this.readRecord(capture, options, maxBytes);
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
            collection: collectionName,
            filename: capture.filename,
            offset: capture.offset,
            length: capture.length,
            ...(capture.digest ? { digest: capture.digest } : {}),
          },
        },
        "commoncrawl",
        { collection: collectionName, requestedTimestamp: wanted || undefined },
      );
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
   */
  private async resolveIndex(
    options: Partial<CommonCrawlOptions>,
  ): Promise<{ collectionName: string; indexName: string }> {
    let collectionName = options.collection as string | undefined;

    if (collectionName && collectionName !== "CC-MAIN-latest") {
      return {
        collectionName,
        indexName: collectionName.endsWith("-index") ? collectionName : `${collectionName}-index`,
      };
    }

    let apiPath: string | undefined;
    try {
      const collinfoOpts = await createFetchOptions(
        BASE_URL,
        {},
        {
          retries: options.retries,
          timeout: options.timeout ?? 60_000,
        },
      );
      interface CollinfoEntry {
        name?: string;
        "cdx-api"?: string;
        cdxApi?: string;
      }
      const collinfo = (await $fetch("/collinfo.json", collinfoOpts)) as CollinfoEntry[];
      if (Array.isArray(collinfo) && collinfo.length > 0) {
        const first = collinfo[0];
        const cdxApiProp = first["cdx-api"] || first.cdxApi;
        if (typeof cdxApiProp === "string") {
          let raw = cdxApiProp.startsWith("http") ? new URL(cdxApiProp).pathname : cdxApiProp;
          raw = raw.startsWith("/") ? raw.slice(1) : raw;
          apiPath = raw;
          collectionName = raw.endsWith("-index") ? raw.slice(0, -"-index".length) : raw;
        } else if (typeof first.name === "string") {
          collectionName = first.name;
          apiPath = collectionName.endsWith("-index") ? collectionName : `${collectionName}-index`;
        }
      }
    } catch (collinfoError) {
      consola.debug("[commoncrawl] collinfo.json fetch failed, using fallback:", collinfoError);
    }

    if (!collectionName) collectionName = "CC-MAIN-latest";
    if (!apiPath) {
      apiPath = collectionName.endsWith("-index") ? collectionName : `${collectionName}-index`;
    }

    return { collectionName, indexName: apiPath };
  }

  /** Lists the indexed captures of one exact URL, with their WARC coordinates. */
  private async findCaptures(
    indexName: string,
    target: string,
    wanted: string,
    options: ArchiveContentOptions,
  ): Promise<CrawlCapture[]> {
    const params: Record<string, string> = {
      url: target,
      output: "json",
      fl: "url,timestamp,status,mime,length,offset,filename,digest",
      limit: String(CONTENT_CAPTURE_LIMIT),
    };

    // The row cap is what makes this matter: a URL crawled more often than the
    // cap would otherwise be answered from an arbitrary slice of its captures.
    // Both parameters are the index's own, and a deployment that ignores them
    // leaves the choice where it already is, in `selectCapture`.
    if (wanted) {
      params.closest = timestampUpperBound(wanted);
      params.sort = "closest";
    } else {
      params.sort = "reverse";
    }

    const fetchOptions = await createFetchOptions(BASE_URL, params, {
      retries: options.retries,
      timeout: options.timeout ?? 60_000,
      responseType: "text",
    });
    const raw = await $fetch(`/${indexName}`, fetchOptions);

    const captures: CrawlCapture[] = [];
    for (const record of parseIndexRecords(raw)) {
      const timestamp = toWaybackTimestamp(record.timestamp ?? "");
      if (!timestamp || !record.filename || !record.offset || !record.length) continue;

      const status = Number.parseInt(record.status ?? "", 10);
      captures.push({
        url: record.url ?? target,
        timestamp,
        filename: record.filename,
        offset: record.offset,
        length: record.length,
        ...(Number.isFinite(status) ? { status } : {}),
        ...(record.mime ? { mime: record.mime } : {}),
        ...(record.digest ? { digest: record.digest } : {}),
      });
    }

    return captures;
  }

  /** Fetches one WARC record by byte range and unwraps the HTTP response inside it. */
  private async readRecord(
    capture: CrawlCapture,
    options: ArchiveContentOptions,
    maxBytes: number,
  ): Promise<{
    text: string;
    bytes: number;
    truncated: boolean;
    status?: number;
    mime?: string;
  }> {
    const start = Number.parseInt(capture.offset, 10);
    const length = Number.parseInt(capture.length, 10);
    if (!Number.isFinite(start) || !Number.isFinite(length) || length <= 0) {
      throw new Error("Common Crawl index gave no usable byte range for this capture");
    }

    const fetchOptions = await createFetchOptions(
      DATA_BASE_URL,
      {},
      {
        responseType: "stream",
        retries: options.retries,
        timeout: options.timeout ?? 60_000,
        headers: { range: `bytes=${start}-${start + length - 1}` },
      },
    );
    const segment = await $fetch(`/${capture.filename}`, fetchOptions);

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

    // A compressed entity cut off by the outer cap is not a shorter page, it is
    // a broken member the decoder cannot finish. Say which cap to raise instead
    // of failing inside the decompressor.
    if (record.truncated && contentEncoding) {
      throw new Error(
        `The capture is ${contentEncoding}-encoded and larger than the ${maxBytes} byte cap; raise it to read this record`,
      );
    }

    const decoded = await decodeContentEncoding(framed, contentEncoding, maxBytes);

    const overflowed = decoded.bytes.byteLength > maxBytes;
    const body = overflowed ? decoded.bytes.subarray(0, maxBytes) : decoded.bytes;

    return {
      text: decodeArchivedBody(body, contentType),
      bytes: body.byteLength,
      truncated: record.truncated || decoded.truncated || overflowed,
      ...(status === undefined ? {} : { status }),
      ...(contentType ? { mime: contentType.split(";")[0]?.trim().toLowerCase() } : {}),
    };
  }
}

/** Parses the newline-delimited JSON the CDX index answers with. */
function parseIndexRecords(raw: unknown): Array<Record<string, string>> {
  const text = typeof raw === "string" ? raw : String(raw);
  const records: Array<Record<string, string>> = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    records.push(JSON.parse(trimmed) as Record<string, string>);
  }

  return records;
}

export default function commonCrawl(
  initOptions: Partial<CommonCrawlOptions> = {},
): CommonCrawlProvider {
  return new CommonCrawlProvider(initOptions);
}
