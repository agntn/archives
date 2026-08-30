import { $fetch } from "ofetch";
import type { ConiferOptions } from "../_providers";
import type { ArchiveOptions, ArchiveResponse, ArchivedPage } from "../types";
import {
  createErrorResponse,
  createFetchOptions,
  createSuccessResponse,
  normalizeDomain,
  waybackTimestampToISO,
} from "../utils";
import { BaseProvider } from "./base-provider";

interface ConiferResult {
  id?: string;
  rec?: string;
  timestamp?: string;
  title?: string;
  url?: string;
}

interface ConiferSearchResponse {
  results?: ConiferResult[];
}

interface ConiferRequest {
  user: string;
  collection: string;
  query: string;
  limit: number;
}

function resolveConiferRequest(domain: string, options: Readonly<ConiferOptions>): ConiferRequest {
  const user = String(options.user).trim();
  const collection = String(options.collection).trim();
  if (!user || !collection) throw new Error("Conifer user and collection are required");

  const query = normalizeDomain(domain, false).trim();
  if (!query) throw new Error("Conifer target must not be empty");

  return { user, collection, query, limit: Math.max(0, Math.trunc(options.limit ?? 1000)) };
}

function mapConiferResults(
  results: readonly Readonly<ConiferResult>[],
  request: Readonly<ConiferRequest>,
  baseUrl: string,
): ArchivedPage[] {
  const pages: ArchivedPage[] = [];
  for (const result of results) {
    if (pages.length >= request.limit) break;
    if (!result.url || !result.timestamp) continue;

    const timestamp = waybackTimestampToISO(result.timestamp);
    if (!timestamp) continue;
    pages.push({
      url: result.url,
      timestamp,
      snapshot: `${baseUrl}/${encodeURIComponent(request.user)}/${encodeURIComponent(request.collection)}/${result.timestamp}/${result.url}`,
      _meta: {
        provider: "conifer",
        timestamp: result.timestamp,
        id: result.id,
        recording: result.rec,
        title: result.title,
      },
    });
  }
  return pages;
}

/**
 * Read-only access to pages in an existing public Conifer collection.
 */
export class ConiferProvider extends BaseProvider<ConiferOptions> {
  readonly name = "Conifer";
  readonly slug = "conifer";

  constructor(options: Readonly<ConiferOptions>) {
    super(options);
  }

  override cacheKey(options?: Readonly<ArchiveOptions>): string {
    const requestOptions = options as Partial<ConiferOptions> | undefined;
    const user = String(requestOptions?.user ?? this.options.user).trim();
    const collection = String(requestOptions?.collection ?? this.options.collection).trim();
    const limit = requestOptions?.limit === undefined ? this.options.limit : undefined;
    const parts = [
      `user=${encodeURIComponent(user)}`,
      `collection=${encodeURIComponent(collection)}`,
    ];

    if (limit !== undefined) parts.push(`limit=${limit}`);

    return parts.join(":");
  }

  async snapshots(
    domain: string,
    reqOptions: Readonly<Partial<ConiferOptions>> = {},
  ): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);
      const request = resolveConiferRequest(domain, options);
      const { collection, limit, query, user } = request;
      const baseUrl = "https://conifer.rhizome.org";
      const params = { user, coll: collection, url: query };
      if (limit === 0) {
        return createSuccessResponse([], "conifer", { user, collection, queryParams: params });
      }
      const fetchOptions = await createFetchOptions(baseUrl, params, {
        retries: options.retries,
        signal: options.signal,
        timeout: options.timeout,
      });
      const response = await $fetch<ConiferSearchResponse>("/api/v1/url_search", {
        ...fetchOptions,
        responseType: "json",
      });

      const pages = mapConiferResults(response.results ?? [], request, baseUrl);
      return createSuccessResponse(pages, "conifer", {
        user,
        collection,
        queryParams: fetchOptions.params ?? {},
      });
    } catch (error) {
      return createErrorResponse(error, "conifer");
    }
  }
}

export default function conifer(options: Readonly<ConiferOptions>): ConiferProvider {
  return new ConiferProvider(options);
}
