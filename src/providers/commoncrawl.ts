import { consola } from "consola";
import { $fetch } from "ofetch";
import { cleanDoubleSlashes } from "ufo";
import type { ArchiveResponse, ArchivedPage, CommonCrawlMetadata } from "../types";
import type { CommonCrawlOptions } from "../_providers";
import {
  waybackTimestampToISO,
  normalizeDomain,
  createSuccessResponse,
  createErrorResponse,
  createFetchOptions,
} from "../utils";
import { BaseProvider } from "./base-provider";

/**
 * Common Crawl archive provider.
 */
export class CommonCrawlProvider extends BaseProvider {
  readonly name = "Common Crawl";
  readonly slug = "commoncrawl";

  constructor(readonly options: Partial<CommonCrawlOptions> = {}) {
    super(options);
  }

  /**
   * Cache key extension that separates storage entries by collection.
   */
  cacheKey(options?: import("../types").ArchiveOptions): string | undefined {
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
    const baseURL = "https://index.commoncrawl.org";
    const dataBaseURL = "https://data.commoncrawl.org";
    let collectionName: string | undefined;

    try {
      const options = await this.resolveOptions<CommonCrawlOptions>(reqOptions);

      // resolve collection: explicit option, or latest via collinfo.json
      collectionName = options.collection as string | undefined;
      let indexName: string;
      if (!collectionName || collectionName === "CC-MAIN-latest") {
        let apiPath: string | undefined;
        try {
          const collinfoOpts = await createFetchOptions(
            baseURL,
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
              apiPath = collectionName.endsWith("-index")
                ? collectionName
                : `${collectionName}-index`;
            }
          }
        } catch (collinfoError) {
          consola.debug("[commoncrawl] collinfo.json fetch failed, using fallback:", collinfoError);
        }
        if (!collectionName) collectionName = "CC-MAIN-latest";
        if (!apiPath) {
          apiPath = collectionName.endsWith("-index") ? collectionName : `${collectionName}-index`;
        }
        indexName = apiPath;
      } else {
        indexName = collectionName.endsWith("-index") ? collectionName : `${collectionName}-index`;
      }

      const urlPattern = normalizeDomain(domain);
      const params: Record<string, string> = {
        url: urlPattern,
        output: "json",
        fl: "url,timestamp,status,mime,length,offset,filename,digest",
        collapse: "digest",
        limit: String(options.limit ?? 1000),
      };

      const fetchOptions = await createFetchOptions(baseURL, params, {
        retries: options.retries,
        timeout: options.timeout ?? 60_000,
        responseType: "text",
      });
      const raw = await $fetch(`/${indexName}`, fetchOptions);
      const text = typeof raw === "string" ? raw : String(raw);
      const lines = text.split("\n").filter((line) => line.trim());

      if (lines.length === 0) {
        return createSuccessResponse([], "commoncrawl", {
          collection: collectionName,
          queryParams: fetchOptions.params,
        });
      }

      const records = lines.map((line) => JSON.parse(line) as Record<string, string>);
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
        const snapUrl = `${dataBaseURL}/${record.filename}`;
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
}

export default function commonCrawl(
  initOptions: Partial<CommonCrawlOptions> = {},
): CommonCrawlProvider {
  return new CommonCrawlProvider(initOptions);
}
