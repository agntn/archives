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
  createContentErrorResponse,
  createContentResponse,
  fetchBody,
  normalizeDomain,
  preferSameUrl,
  resolveRequestedTimestamp,
  selectCapture,
  waybackTimestampToISO,
} from "../utils";
import { BaseProvider } from "./base-provider";

/**
 * Archive.today archive provider. Uses the Memento timemap endpoint.
 */
export class ArchiveTodayProvider extends BaseProvider<ArchiveTodayOptions> {
  readonly name = "Archive.today";
  readonly slug = "archive-today";

  /**
   * Fetch archived snapshots from Archive.today.
   */
  async snapshots(domain: string, reqOptions: ArchiveTodayOptions = {}): Promise<ArchiveResponse> {
    const cleanDomain = normalizeDomain(domain, false);

    try {
      const options = await this.resolveOptions(reqOptions);
      const pages = await this.fetchMementos(cleanDomain, options);

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
   * Read the body of one archived capture from Archive.today.
   *
   * There is no raw-playback endpoint here: a snapshot URL serves the page as
   * Archive.today rendered it, so the body is that wrapper HTML rather than the
   * bytes the original site sent. The capture is chosen locally from the
   * timemap, the same way the other providers choose from their index.
   *
   * A capture answers with a `Memento-Datetime` header and the rate-limit and
   * CAPTCHA pages do not, so a body without one is refused as an error instead
   * of being cached for days as the page's content.
   *
   * Any `#fragment` is dropped from the URL up front: a fragment never travels
   * to the server, so the timemap answers for the bare URL, and a fragment kept
   * on this side would make every returned capture fail the match and read as
   * never archived. The same fragment-free form feeds the same-url narrowing,
   * which still wants the caller's scheme, so it is not the timemap target.
   */
  override async content(
    url: string,
    reqOptions: Partial<ArchiveTodayOptions> & ArchiveContentOptions = {},
  ): Promise<ArchiveContentResponse> {
    try {
      const options = await this.resolveContentOptions(reqOptions);
      const page = url.split("#", 1)[0];
      const target = normalizeDomain(page, false);
      if (target.includes("*")) {
        throw new Error("Reading archived content requires one exact URL, not a wildcard pattern");
      }

      const wanted = resolveRequestedTimestamp(options.timestamp);
      const mementos = await this.fetchMementos(target, options);
      const captures = mementos.map((page) => ({
        url: page.url,
        snapshot: page.snapshot,
        timestamp: (page._meta as ArchiveTodayMetadata).hash,
      }));
      const capture = selectCapture(
        preferSameUrl(captures, page, (candidate) => candidate.url),
        wanted,
      );
      if (!capture) {
        return createContentErrorResponse(
          `No Archive.today capture for ${target}${wanted ? ` near ${wanted}` : ""}`,
          "archive-today",
          { requestedTimestamp: wanted || undefined },
        );
      }

      const snapshotUrl = new URL(capture.snapshot);
      const body = await fetchBody(
        snapshotUrl.origin,
        `${snapshotUrl.pathname}${snapshotUrl.search}`,
        options,
      );
      if (!body.capturedAt) {
        throw new Error(
          "Archive.today answered without a Memento-Datetime header, which every capture carries; this is its bot-protection page, not the archived one",
        );
      }

      return createContentResponse(
        {
          url: capture.url,
          timestamp: body.capturedAt,
          snapshot: capture.snapshot,
          content: body.text,
          ...(body.mime ? { mime: body.mime } : {}),
          bytes: body.bytes,
          truncated: body.truncated,
          _meta: {
            timestamp: capture.timestamp,
            status: body.status,
            provider: "archive-today",
            rawSnapshot: body.url,
          },
        },
        "archive-today",
        { requestedTimestamp: wanted || undefined },
      );
    } catch (error) {
      return createContentErrorResponse(error, "archive-today");
    }
  }

  /**
   * Fetch and parse the Memento timemap for one domain or URL.
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
  private async fetchMementos(
    target: string,
    options: ArchiveTodayOptions & ArchiveContentOptions,
  ): Promise<ArchivedPage[]> {
    const baseURL = "https://archive.is";
    // Memento timemap: https://archive.is/timemap/http://example.com
    const fullUrl = target.includes("://") ? target : `http://${target}`;
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

      if (origUrl.includes(target)) {
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

    return pages;
  }
}

export default function archiveToday(initOptions: ArchiveTodayOptions = {}): ArchiveTodayProvider {
  return new ArchiveTodayProvider(initOptions);
}
