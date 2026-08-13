import { $fetch } from "ofetch";
import type { ArchiveOptions, ArchiveResponse } from "../types";
import type { ArchiveItOptions } from "../_providers";
import {
  createErrorResponse,
  createFetchOptions,
  createSuccessResponse,
  mapCdxRows,
  normalizeDomain,
} from "../utils";
import { BaseProvider } from "./base-provider";

/**
 * Archive-It collection archive provider.
 */
export class ArchiveItProvider extends BaseProvider<ArchiveItOptions> {
  readonly name = "Archive-It";
  readonly slug = "archive-it";

  constructor(options: ArchiveItOptions) {
    super(options);
  }

  /**
   * Cache key extension for the collection and filters that change the CDX result set.
   */
  override cacheKey(options?: ArchiveOptions): string {
    const requestOptions = options as Partial<ArchiveItOptions> | undefined;
    const collection = String(requestOptions?.collection ?? this.options.collection).trim();
    const collapse = requestOptions?.collapse ?? this.options.collapse;
    const filter = requestOptions?.filter ?? this.options.filter;
    const from = requestOptions?.from ?? this.options.from;
    const to = requestOptions?.to ?? this.options.to;
    const limit = requestOptions?.limit ?? this.options.limit;
    const parts = [`collection=${encodeURIComponent(collection)}`];

    if (collapse !== undefined) parts.push(`collapse=${encodeURIComponent(collapse)}`);
    if (filter !== undefined) parts.push(`filter=${encodeURIComponent(filter)}`);
    if (from !== undefined) parts.push(`from=${encodeURIComponent(from)}`);
    if (to !== undefined) parts.push(`to=${encodeURIComponent(to)}`);
    if (limit !== undefined) parts.push(`limit=${limit}`);

    return parts.join(":");
  }

  /**
   * Fetch archived snapshots from one Archive-It collection.
   */
  async snapshots(
    domain: string,
    reqOptions: Partial<ArchiveItOptions> = {},
  ): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);
      const collection = String(options.collection).trim();
      if (!/^\d+$/.test(collection)) {
        throw new Error("Archive-It collection must be a numeric collection ID");
      }

      const baseUrl = "https://wayback.archive-it.org";
      const urlPattern = normalizeDomain(domain);
      const params: Record<string, string> = {
        url: urlPattern,
        fl: "original,timestamp,statuscode",
        limit: String(options.limit ?? 1000),
      };

      if (options.collapse !== undefined) params.collapse = options.collapse;
      if (options.filter !== undefined) params.filter = options.filter;
      if (options.from !== undefined) params.from = options.from;
      if (options.to !== undefined) params.to = options.to;

      const fetchOptions = await createFetchOptions(baseUrl, params, {
        retries: options.retries,
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
        queryParams: fetchOptions.params || {},
      });
    } catch (error) {
      return createErrorResponse(error, "archive-it");
    }
  }
}

export default function archiveIt(options: ArchiveItOptions): ArchiveItProvider {
  return new ArchiveItProvider(options);
}
