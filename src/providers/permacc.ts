import { $fetch } from "ofetch";
import { cleanDoubleSlashes } from "ufo";
import type { ArchiveResponse, ArchivedPage } from "../types";
import type { PermaccOptions } from "../_providers";
import {
  createSuccessResponse,
  createErrorResponse,
  createFetchOptions,
  normalizeDomain,
} from "../utils";
import { BaseProvider } from "./base-provider";

/**
 * Perma.cc archive provider.
 *
 * Perma.cc requires an API key. When neither init-time nor request-time
 * `apiKey` is provided, `snapshots()` returns an error response.
 */
export class PermaccProvider extends BaseProvider<PermaccOptions> {
  readonly name = "Perma.cc";
  readonly slug = "permacc";

  /**
   * Fetch archived snapshots from Perma.cc.
   */
  async snapshots(
    domain: string,
    reqOptions: Partial<PermaccOptions> = {},
  ): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);

      if (!options.apiKey) {
        throw new Error("API key is required for Perma.cc");
      }

      const baseUrl = "https://api.perma.cc";
      const snapshotUrl = "https://perma.cc";
      const { apiKey } = options;
      const cleanDomain = normalizeDomain(domain, false);

      const fetchOptions = await createFetchOptions(
        baseUrl,
        {
          limit: options.limit ?? 100,
          url: cleanDomain,
        },
        {
          headers: {
            Authorization: `ApiKey ${apiKey}`,
          },
          retries: options.retries,
          timeout: options.timeout,
        },
      );

      interface PermaccArchive {
        guid: string;
        url: string;
        title: string;
        creation_timestamp: string;
        status: string;
        created_by: {
          id: string;
        };
      }

      interface PermaccResponse {
        objects: PermaccArchive[];
        meta: {
          limit: number;
          offset: number;
          total_count: number;
        };
      }

      const response = (await $fetch("/v1/public/archives/", fetchOptions)) as PermaccResponse;

      if (!response.objects || response.objects.length === 0) {
        return createSuccessResponse([], "permacc", { queryParams: fetchOptions.params });
      }

      const pages: ArchivedPage[] = response.objects
        .filter((item) => item.url && item.url.includes(cleanDomain))
        .map((item) => {
          const cleanedUrl = cleanDoubleSlashes(item.url);
          const snapUrl = `${snapshotUrl}/${item.guid}`;
          const timestamp = item.creation_timestamp ?? new Date().toISOString();

          const page: ArchivedPage = {
            url: cleanedUrl,
            timestamp,
            snapshot: snapUrl,
            _meta: {
              guid: item.guid,
              title: item.title,
              status: item.status,
              created_by: item.created_by?.id,
            },
          };

          return page;
        });

      return createSuccessResponse(pages, "permacc", {
        queryParams: fetchOptions.params,
        meta: response.meta ?? {},
      });
    } catch (error) {
      return createErrorResponse(error, "permacc");
    }
  }
}

export default function permacc(initOptions: Partial<PermaccOptions> = {}): PermaccProvider {
  return new PermaccProvider(initOptions);
}
