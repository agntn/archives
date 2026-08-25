import { consola } from "consola";
import { $fetch } from "ofetch";
import { cleanDoubleSlashes, withoutTrailingSlash } from "ufo";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveResponse,
  ArchivedPage,
  ArchiveTodayMetadata,
} from "../types";
import type { ArchiveTodayOptions } from "../_providers";
import {
  createSuccessResponse,
  createErrorResponse,
  createUnsupportedContentResponse,
  normalizeDomain,
  waybackTimestampToISO,
} from "../utils";
import { BaseProvider } from "./base-provider";

const UNSUPPORTED_CONTENT_REASON =
  "Archive.today has no raw-capture endpoint. A snapshot is served only as a rendered page inside the site's own frame and behind bot protection, so its bytes are not the response the site returned.";

/**
 * Archive.today archive provider. Uses the Memento timemap endpoint.
 */
export class ArchiveTodayProvider extends BaseProvider<ArchiveTodayOptions> {
  readonly name = "Archive.today";
  readonly slug = "archive-today";

  /**
   * Fetch archived snapshots from Archive.today.
   *
   * A memento's `datetime` is not always something `Date` can read, but the
   * snapshot URL names the same instant, so its stamp is the fallback. Stamping
   * "now" instead would push the row above every real capture once a merged
   * response sorts newest-first; a row with no readable time at all is dropped.
   *
   * The timemap labels its newest row `last memento` and a lone capture
   * `first last memento`, so the match takes any first/last qualifiers;
   * requiring a bare `memento` would drop the newest capture from every
   * listing.
   */
  async snapshots(domain: string, reqOptions: ArchiveTodayOptions = {}): Promise<ArchiveResponse> {
    const cleanDomain = normalizeDomain(domain, false);

    try {
      const options = await this.resolveOptions(reqOptions);
      const baseURL = "https://archive.is";
      // Memento timemap: https://archive.is/timemap/http://example.com
      const fullUrl = cleanDomain.includes("://") ? cleanDomain : `http://${cleanDomain}`;
      const timemapUrl = `/timemap/${fullUrl}`;

      const timemapResponse = await $fetch(timemapUrl, {
        baseURL,
        signal: options.signal,
        retry: options.retries ?? 5,
        timeout: options.timeout ?? 60000,
        responseType: "text",
      });

      // Memento link header format:
      // <http://archive.md/20140101030405/https://example.com/>; rel="memento"; datetime="Wed, 01 Jan 2014 03:04:05 GMT"
      const pages: ArchivedPage[] = [];
      const mementoRegex =
        /<(https?:\/\/archive\.(?:is|today|md|ph)\/([0-9]{8,14})\/(?:https?:\/\/)?([^>]+))>;\s*rel="(?:(?:first|last)\s+)*memento";\s*datetime="([^"]+)"/g;

      let mementoMatch;
      let index = 0;

      while ((mementoMatch = mementoRegex.exec(timemapResponse)) !== null) {
        const [, snapshotUrl, timestamp, origUrl, datetime] = mementoMatch;

        if (origUrl.includes(cleanDomain)) {
          try {
            // The snapshot URL carries the capture stamp too, so a datetime the
            // regex matched but `Date` cannot read falls back to those digits.
            // Fabricating the current time instead would sort the capture above
            // every real one in a merged, newest-first response, and the cache
            // would then repeat that answer for days.
            const parsedDate = new Date(datetime);
            const isoTimestamp = Number.isNaN(parsedDate.getTime())
              ? waybackTimestampToISO(timestamp)
              : parsedDate.toISOString();
            if (!isoTimestamp) {
              consola.debug("[archive-today] Dropping memento with unreadable capture time", {
                datetime,
                snapshot: snapshotUrl,
              });
              continue;
            }
            const cleanedUrl = withoutTrailingSlash(
              cleanDoubleSlashes(origUrl.includes("://") ? origUrl : `https://${origUrl}`),
            );
            const cleanedSnapshotUrl = withoutTrailingSlash(snapshotUrl);

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
  }

  /**
   * Archive.today lists captures but never hands out their bytes, so a content
   * request is answered as unsupported rather than with the wrapper page that a
   * snapshot URL actually returns.
   */
  override content(
    _url: string,
    _options: ArchiveContentOptions = {},
  ): Promise<ArchiveContentResponse> {
    return Promise.resolve(
      createUnsupportedContentResponse(UNSUPPORTED_CONTENT_REASON, "archive-today", {
        operation: "content",
      }),
    );
  }
}

export default function archiveToday(initOptions: ArchiveTodayOptions = {}): ArchiveTodayProvider {
  return new ArchiveTodayProvider(initOptions);
}
