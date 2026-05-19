import { $fetch } from "ofetch";
import { cleanDoubleSlashes } from "ufo";
import { consola } from "consola";
import type {
  ArchiveProvider,
  ArchiveResponse,
  ArchivedPage,
  ArchiveTodayMetadata,
} from "../types";
import type { ArchiveTodayOptions } from "../_providers";
import {
  createSuccessResponse,
  createErrorResponse,
  mergeOptions,
  normalizeDomain,
} from "../utils";

/**
 * Create an Archive.today archive provider.
 *
 * @param initOptions - Initial archive options for Archive.today.
 * @returns ArchiveProvider instance for fetching snapshots from Archive.today.
 */
export default function archiveToday(initOptions: ArchiveTodayOptions = {}): ArchiveProvider {
  return {
    name: "Archive.today",
    slug: "archive-today",

    /**
     * Fetch archived snapshots from Archive.today.
     *
     * @param domain - The domain to fetch archives for.
     * @param reqOptions - Request-specific options overriding initial settings.
     * @returns Promise resolving to ArchiveResponse containing pages and metadata.
     */
    async snapshots(domain: string, reqOptions: ArchiveTodayOptions = {}): Promise<ArchiveResponse> {
      const cleanDomain = normalizeDomain(domain, false);

      try {
        const options = await mergeOptions(initOptions, reqOptions);
        const baseURL = "https://archive.is";
        // Memento timemap: https://archive.is/timemap/http://example.com
        const fullUrl = cleanDomain.includes("://") ? cleanDomain : `http://${cleanDomain}`;
        const timemapUrl = `/timemap/${fullUrl}`;

        const timemapResponse = await $fetch(timemapUrl, {
          baseURL,
          retry: options.retries ?? 5,
          timeout: options.timeout ?? 60000,
          responseType: "text",
        });

        // Memento link header format:
        // <http://archive.md/20140101030405/https://example.com/>; rel="memento"; datetime="Wed, 01 Jan 2014 03:04:05 GMT"
        const pages: ArchivedPage[] = [];
        const mementoRegex =
          /<(https?:\/\/archive\.(?:is|today|md|ph)\/([0-9]{8,14})\/(?:https?:\/\/)?([^>]+))>;\s*rel="(?:first\s+)?memento";\s*datetime="([^"]+)"/g;

        let mementoMatch;
        let index = 0;

        while ((mementoMatch = mementoRegex.exec(timemapResponse)) !== null) {
          const [, snapshotUrl, timestamp, origUrl, datetime] = mementoMatch;

          if (origUrl.includes(cleanDomain)) {
            try {
              const parsedDate = new Date(datetime);
              const isoTimestamp = Number.isNaN(parsedDate.getTime())
                ? new Date().toISOString()
                : parsedDate.toISOString();

              let cleanedUrl = cleanDoubleSlashes(
                origUrl.includes("://") ? origUrl : `https://${origUrl}`,
              );
              // strip trailing slash for test compatibility
              cleanedUrl = cleanedUrl.endsWith("/") ? cleanedUrl.slice(0, -1) : cleanedUrl;

              let cleanedSnapshotUrl = snapshotUrl;
              cleanedSnapshotUrl = cleanedSnapshotUrl.endsWith("/")
                ? cleanedSnapshotUrl.slice(0, -1)
                : cleanedSnapshotUrl;

              pages.push({
                url: cleanedUrl,
                timestamp: isoTimestamp,
                snapshot: cleanedSnapshotUrl,
                _meta: {
                  hash: timestamp,
                  raw_date: datetime,
                  position: index,
                } as ArchiveTodayMetadata,
              });

              index++;
            } catch (error) {
              consola.error("Error parsing archive.today snapshot:", error);
            }
          }
        }

        const limitedPages =
          typeof options.limit === "number" ? pages.slice(0, Math.max(0, options.limit)) : pages;

        return createSuccessResponse(limitedPages, "archive-today", {
          domain: cleanDomain,
          page: 1,
          empty: limitedPages.length === 0,
        });
      } catch (error) {
        return createErrorResponse(error, "archive-today", {
          domain: cleanDomain,
        });
      }
    },
  };
}
