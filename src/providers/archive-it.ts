import { $fetch } from "ofetch";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
} from "../types";
import type { ArchiveItOptions } from "../_providers";
import {
  createContentErrorResponse,
  createContentResponse,
  createErrorResponse,
  createFetchOptions,
  createSuccessResponse,
  mapCdxRows,
  normalizeDomain,
  preferSameUrl,
  readPlaybackCapture,
  resolveRequestedTimestamp,
  selectCapture,
  timestampUpperBound,
  toWaybackTimestamp,
} from "../utils";
import { BaseProvider } from "./base-provider";

const BASE_URL = "https://wayback.archive-it.org";

/**
 * Captures pulled for one URL before the closest is picked locally.
 *
 * Collection-scoped indexes answer with the captures they hold in index order,
 * so the choice is made here rather than asked for in the query: a bound the
 * server silently ignores would otherwise hand back the wrong capture with no
 * sign that anything went wrong.
 */
const CONTENT_CAPTURE_LIMIT = 200;

interface ArchiveItCacheOptions {
  collection: string;
  collapse?: string;
  filter?: string;
  limit?: number;
}

function effectiveCacheOptions(
  request: Readonly<Partial<ArchiveItOptions>> | undefined,
  defaults: Readonly<Partial<ArchiveItOptions>>,
): ArchiveItCacheOptions {
  return {
    collection: String(request?.collection ?? defaults.collection).trim(),
    collapse: request?.collapse ?? defaults.collapse,
    filter: request?.filter ?? defaults.filter,
    limit: request?.limit === undefined ? defaults.limit : undefined,
  };
}

function archiveItCacheKey(options: Readonly<ArchiveItCacheOptions>): string {
  const parts = [`collection=${encodeURIComponent(options.collection)}`];
  if (options.collapse !== undefined)
    parts.push(`collapse=${encodeURIComponent(options.collapse)}`);
  if (options.filter !== undefined) parts.push(`filter=${encodeURIComponent(options.filter)}`);
  if (options.limit !== undefined) parts.push(`limit=${options.limit}`);
  return parts.join(":");
}

/**
 * Archive-It collection archive provider.
 */
export class ArchiveItProvider extends BaseProvider<ArchiveItOptions> {
  readonly name = "Archive-It";
  readonly slug = "archive-it";

  constructor(options: Readonly<ArchiveItOptions>) {
    super(options);
  }

  /**
   * Cache key extension for the collection and filters that change the CDX result set.

   *
   * @param options - Options.
   * @returns {string} The resulting string.
   */
  override cacheKey(options?: Readonly<ArchiveOptions>): string {
    const requestOptions = options as Partial<ArchiveItOptions> | undefined;
    return archiveItCacheKey(effectiveCacheOptions(requestOptions, this.options));
  }

  /**
   * Fetch archived snapshots from one Archive-It collection.
   *
   * The window bounds are normalized here too, not only in `Archive.snapshots`:
   * the provider is a public export, and the CDX index does not read a raw ISO
   * date as an instant.

   *
   * @param domain - Domain.
   * @param reqOptions - Req Options.
   * @returns {Promise<ArchiveResponse>} A promise resolving to the operation result.
   */
  async snapshots(
    domain: string,
    reqOptions: Readonly<Partial<ArchiveItOptions>> = {},
  ): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);
      const collection = requireCollection(options.collection);
      const baseUrl = BASE_URL;
      const urlPattern = normalizeDomain(domain);
      const params: Record<string, string> = {
        url: urlPattern,
        fl: "original,timestamp,statuscode",
        limit: String(options.limit ?? 1000),
      };

      if (options.collapse !== undefined) params.collapse = options.collapse;
      if (options.filter !== undefined) params.filter = options.filter;
      const from = resolveRequestedTimestamp(options.from, "from");
      const to = resolveRequestedTimestamp(options.to, "to");
      if (from) params.from = from;
      if (to) params.to = to;

      const fetchOptions = await createFetchOptions(baseUrl, params, {
        retries: options.retries,
        signal: options.signal,
        timeout: options.timeout,
      });
      const response: string = await $fetch(`/${collection}/timemap/cdx`, {
        ...fetchOptions,
        responseType: "text",
      });
      const rows = response
        .trim()
        .split("\n")
        .map((line) => line.trim().split(/\s+/))
        .filter((row) => row.length >= 3);
      const pages = await mapCdxRows(rows, `${baseUrl}/${collection}`, "archive-it", options);

      return createSuccessResponse(pages, "archive-it", {
        collection,
        queryParams: fetchOptions.params ?? {},
      });
    } catch (error) {
      return createErrorResponse(error, "archive-it");
    }
  }

  /**
   * Read the body of one archived capture from the configured collection.
   *
   * Archive-It replays captures through the same Wayback machinery as the
   * Internet Archive, so the `id_` modifier returns the original response here
   * too. Only the host and the collection segment differ.

   *
   * @param url - Url.
   * @param reqOptions - Req Options.
   * @returns {Promise<ArchiveContentResponse>} A promise resolving to the operation result.
   */
  override async content(
    url: string,
    reqOptions: Readonly<Partial<ArchiveItOptions> & ArchiveContentOptions> = {},
  ): Promise<ArchiveContentResponse> {
    try {
      const options = await this.resolveContentOptions(reqOptions);
      const collection = requireCollection(options.collection);
      const target = normalizeDomain(url, false);
      if (target.includes("*")) {
        throw new Error("Reading archived content requires one exact URL, not a wildcard pattern");
      }

      const wanted = resolveRequestedTimestamp(options.timestamp);
      const captures = await this.findCaptures(collection, target, wanted, options);
      const capture = selectCapture(
        preferSameUrl(captures, url, (candidate) => candidate.original),
        wanted,
      );
      if (!capture) {
        return createContentErrorResponse(
          `No Archive-It capture for ${target} in collection ${collection}${wanted ? ` near ${wanted}` : ""}`,
          "archive-it",
          { collection, requestedTimestamp: wanted || undefined },
        );
      }

      const content = await readPlaybackCapture({
        baseURL: BASE_URL,
        prefix: `/${collection}`,
        original: capture.original,
        stamp: capture.timestamp,
        provider: "archive-it",
        captureStatus: capture.status,
        options,
        meta: { collection },
      });

      return createContentResponse(content, "archive-it", {
        collection,
        requestedTimestamp: wanted || undefined,
      });
    } catch (error) {
      return createContentErrorResponse(error, "archive-it");
    }
  }

  private async findCaptures(
    collection: string,
    target: string,
    wanted: string,
    options: Readonly<ArchiveContentOptions>,
  ): Promise<Array<{ original: string; timestamp: string; status?: number }>> {
    const params: Record<string, string> = {
      url: target,
      fl: "original,timestamp,statuscode",
      limit: String(CONTENT_CAPTURE_LIMIT),
    };

    // `closest` asks the collection for the captures nearest the instant, from
    // both sides, which is what a timestamp request means. A `to` bound looked
    // equivalent and was not: the collection honors it, so a request older than
    // its first capture came back empty and the later ones stayed unreachable.
    // Without an instant, ask for the newest rows rather than the oldest ones.
    if (wanted) {
      params.closest = timestampUpperBound(wanted);
      params.sort = "closest";
    } else {
      params.sort = "reverse";
    }

    const fetchOptions = await createFetchOptions(BASE_URL, params, {
      retries: options.retries,
      signal: options.signal,
      timeout: options.timeout,
    });
    const response: string = await $fetch(`/${collection}/timemap/cdx`, {
      ...fetchOptions,
      responseType: "text",
    });

    const captures: Array<{ original: string; timestamp: string; status?: number }> = [];
    for (const line of response.trim().split("\n")) {
      const [original, rawTimestamp, statuscode] = line.trim().split(/\s+/);
      const timestamp = toWaybackTimestamp(rawTimestamp ?? "");
      if (!timestamp || !original) continue;

      const status = Number.parseInt(statuscode ?? "", 10);
      captures.push({
        original,
        timestamp,
        ...(Number.isFinite(status) ? { status } : {}),
      });
    }

    return captures;
  }
}

/* Archive-It queries are collection-scoped; a missing or non-numeric id has no endpoint. */
function requireCollection(collection: ArchiveItOptions["collection"] | undefined): string {
  const value = String(collection ?? "").trim();
  if (!/^\d+$/.test(value)) {
    throw new Error("Archive-It collection must be a numeric collection ID");
  }
  return value;
}

export default function archiveIt(options: Readonly<ArchiveItOptions>): ArchiveItProvider {
  return new ArchiveItProvider(options);
}
