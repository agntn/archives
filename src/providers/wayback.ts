import { $fetch } from "ofetch";
import type { ArchiveProvider, ArchiveResponse, ArchivedPage } from "../types";
import type { WaybackOptions } from "../_providers";
import {
  normalizeDomain,
  createSuccessResponse,
  createErrorResponse,
  createFetchOptions,
  mergeOptions,
  mapCdxRows,
} from "../utils";

/**
 * Create a Wayback Machine archive provider.
 *
 * @param initOptions - Initial archive options for Wayback queries.
 * @returns ArchiveProvider instance for fetching snapshots from the Wayback Machine.
 */
export default function wayback(initOptions: WaybackOptions = {}): ArchiveProvider {
  return {
    name: "Internet Archive Wayback Machine",
    slug: "wayback",

    /**
     * Fetch archived snapshots from the Internet Archive Wayback Machine.
     *
     * @param domain - The domain to search for archived snapshots.
     * @param reqOptions - Request-specific options overriding initial settings.
     * @returns Promise resolving to ArchiveResponse containing pages and metadata.
     */
    async snapshots(domain: string, reqOptions: WaybackOptions = {}): Promise<ArchiveResponse> {
      try {
        const options = await mergeOptions(initOptions, reqOptions);
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

        // first row is the header
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
    },
  };
}
