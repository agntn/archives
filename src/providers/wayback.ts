import { $fetch } from "ofetch";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
  ArchivedPage,
} from "../types";
import type { WaybackOptions } from "../_providers";
import {
  normalizeDomain,
  createContentErrorResponse,
  createContentResponse,
  createSuccessResponse,
  createErrorResponse,
  createFetchOptions,
  mapCdxRows,
  preferSameUrl,
  readPlaybackCapture,
  resolveRequestedTimestamp,
  selectCapture,
  toWaybackTimestamp,
} from "../utils";
import { BaseProvider } from "./base-provider";

/** One capture as the CDX index describes it. */
interface CdxCapture {
  original: string;
  timestamp: string;
  status?: number;
}

const BASE_URL = "https://web.archive.org";

/**
 * Wayback Machine archive provider.
 */
export class WaybackProvider extends BaseProvider<WaybackOptions> {
  readonly name = "Internet Archive Wayback Machine";
  readonly slug = "wayback";

  /**
   * Cache key extension for options that change the CDX result set.
   */
  override cacheKey(options?: ArchiveOptions): string {
    const waybackOptions = options as Partial<WaybackOptions> | undefined;
    const collapse = waybackOptions?.collapse ?? this.options.collapse ?? "timestamp:4";
    const filter = waybackOptions?.filter ?? this.options.filter;
    const parts = [`collapse=${encodeURIComponent(collapse)}`];

    if (filter !== undefined) parts.push(`filter=${encodeURIComponent(filter)}`);

    return parts.join(":");
  }

  /**
   * Fetch archived snapshots from the Internet Archive Wayback Machine.
   *
   * The window bounds are normalized here too, not only in `Archive.snapshots`:
   * the provider is a public export, and CDX does not read a raw ISO date as an
   * instant.
   */
  async snapshots(domain: string, reqOptions: WaybackOptions = {}): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);
      const baseUrl = BASE_URL;
      const snapshotUrl = `${BASE_URL}/web`;
      const urlPattern = normalizeDomain(domain);
      const params: Record<string, string> = {
        url: urlPattern,
        output: "json",
        fl: "original,timestamp,statuscode",
        collapse: options.collapse ?? "timestamp:4",
        limit: String(options.limit ?? 1000),
      };

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

      type WaybackResponse = [string[], ...string[][]];
      const response = (await $fetch("/cdx/search/cdx", fetchOptions)) as WaybackResponse;

      if (!Array.isArray(response) || response.length <= 1) {
        return createSuccessResponse([], "wayback", { queryParams: fetchOptions.params || {} });
      }

      const dataRows = response.slice(1);
      const pages: ArchivedPage[] = await mapCdxRows(dataRows, snapshotUrl, "wayback", options);

      return createSuccessResponse(pages, "wayback", { queryParams: fetchOptions.params || {} });
    } catch (error) {
      return createErrorResponse(error, "wayback");
    }
  }

  /**
   * Read the body of one archived capture from the Wayback Machine.
   *
   * Two steps, because the archive answers them at different endpoints: CDX says
   * which capture exists at the requested instant, and the playback endpoint
   * replays that capture's original bytes.
   */
  override async content(
    url: string,
    reqOptions: Partial<WaybackOptions> & ArchiveContentOptions = {},
  ): Promise<ArchiveContentResponse> {
    try {
      const options = await this.resolveContentOptions(reqOptions);
      const target = normalizeDomain(url, false);
      if (target.includes("*")) {
        throw new Error("Reading archived content requires one exact URL, not a wildcard pattern");
      }

      const wanted = resolveRequestedTimestamp(options.timestamp);
      const captures = await this.findCaptures(target, wanted, options);
      const capture = selectCapture(
        preferSameUrl(captures, url, (candidate) => candidate.original),
        wanted,
      );
      if (!capture) {
        return createContentErrorResponse(
          `No Wayback capture for ${target}${wanted ? ` near ${wanted}` : ""}`,
          "wayback",
          { requestedTimestamp: wanted || undefined },
        );
      }

      const content = await readPlaybackCapture({
        baseURL: BASE_URL,
        prefix: "/web",
        original: capture.original,
        stamp: capture.timestamp,
        provider: "wayback",
        options,
      });

      return createContentResponse(content, "wayback", {
        requestedTimestamp: wanted || undefined,
      });
    } catch (error) {
      return createContentErrorResponse(error, "wayback");
    }
  }

  /**
   * Lists the captures worth considering for one URL.
   *
   * `limit=-5` asks CDX for the newest few rather than the oldest, which is what
   * an unqualified request means; the second query runs only when the archive
   * holds nothing at or before the requested instant, and finds the closest
   * capture after it.
   */
  private async findCaptures(
    target: string,
    wanted: string,
    options: ArchiveContentOptions,
  ): Promise<CdxCapture[]> {
    const params: Record<string, string> = {
      url: target,
      output: "json",
      fl: "original,timestamp,statuscode",
      limit: "-5",
    };
    if (wanted) params.to = wanted;

    const captures = await this.queryCaptures(params, options);
    if (captures.length > 0 || !wanted) return captures;

    // Without dropping `to`, the second query asks for the window that just came
    // back empty and the later capture is never found.
    const { to: _bounded, ...unbounded } = params;
    return this.queryCaptures({ ...unbounded, from: wanted, limit: "5" }, options);
  }

  private async queryCaptures(
    params: Record<string, string>,
    options: ArchiveContentOptions,
  ): Promise<CdxCapture[]> {
    const fetchOptions = await createFetchOptions(BASE_URL, params, {
      retries: options.retries,
      signal: options.signal,
      timeout: options.timeout,
    });

    type WaybackResponse = [string[], ...string[][]];
    const response = (await $fetch("/cdx/search/cdx", fetchOptions)) as WaybackResponse;
    if (!Array.isArray(response) || response.length <= 1) return [];

    const captures: CdxCapture[] = [];
    for (const [original, timestamp, statuscode] of response.slice(1)) {
      const stamp = toWaybackTimestamp(timestamp ?? "");
      if (!stamp || !original) continue;

      const status = Number.parseInt(statuscode ?? "", 10);
      captures.push({
        original,
        timestamp: stamp,
        ...(Number.isFinite(status) ? { status } : {}),
      });
    }

    return captures;
  }
}

export default function wayback(initOptions: WaybackOptions = {}): WaybackProvider {
  return new WaybackProvider(initOptions);
}
