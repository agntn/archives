import { $fetch } from "ofetch";
import type { ArchiveOptions, ArchiveResponse, ArchivedPage } from "../types";
import type { WaybackOptions } from "../_providers";
import {
  normalizeDomain,
  createSuccessResponse,
  createErrorResponse,
  createFetchOptions,
  mapCdxRows,
} from "../utils";
import { BaseProvider } from "./base-provider";

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
   */
  async snapshots(domain: string, reqOptions: WaybackOptions = {}): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);
      const baseUrl = "https://web.archive.org";
      const snapshotUrl = "https://web.archive.org/web";
      const urlPattern = normalizeDomain(domain);
      const params: Record<string, string> = {
        url: urlPattern,
        output: "json",
        fl: "original,timestamp,statuscode",
        collapse: options.collapse ?? "timestamp:4",
        limit: String(options.limit ?? 1000),
      };

      if (options.filter !== undefined) params.filter = options.filter;

      const fetchOptions = await createFetchOptions(baseUrl, params, {
        retries: options.retries,
        timeout: options.timeout,
      });

      type WaybackResponse = [string[], ...string[][]];
      const response = (await $fetch("/cdx/search/cdx", fetchOptions)) as WaybackResponse;

      if (!Array.isArray(response) || response.length <= 1) {
        return createSuccessResponse([], "wayback", { queryParams: fetchOptions.params || {} });
      }

      const dataRows = response.slice(1);
      const pages: ArchivedPage[] = await mapCdxRows(
        dataRows,
        snapshotUrl,
        "wayback",
        options,
      );

      return createSuccessResponse(pages, "wayback", { queryParams: fetchOptions.params || {} });
    } catch (error) {
      return createErrorResponse(error, "wayback");
    }
  }
}

export default function wayback(initOptions: WaybackOptions = {}): WaybackProvider {
  return new WaybackProvider(initOptions);
}
