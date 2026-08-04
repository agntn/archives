// Import necessary dependencies
import type {
  ArchiveOptions,
  ArchiveResponse,
  ArchiveProvider,
  ArchivedPage,
  ArchiveInterface,
  UnsupportedProviderRecord,
} from "./types";
import { getStoredResponse, storeResponse } from "./storage";
import { mergeOptions, processInParallel } from "./utils";

/**
 * Thrown by `archive.getPages()` when the only-or-all-queried providers do not
 * implement the requested operation. Lets callers distinguish a structural
 * "this provider has no such API" from a runtime fetch failure.
 */
export class UnsupportedOperationError extends Error {
  readonly providers: UnsupportedProviderRecord[];

  constructor(reason: string, providers: UnsupportedProviderRecord[] = []) {
    super(reason);
    this.name = "UnsupportedOperationError";
    this.providers = providers;
  }
}

type ProviderInput =
  | ArchiveProvider
  | ArchiveProvider[]
  | Promise<ArchiveProvider>
  | Promise<ArchiveProvider[]>;

/**
 * Combine per-provider responses into a single merged ArchiveResponse.
 *
 * Merges pages (deduping nothing – duplicates are the caller's filter problem),
 * joins errors, and propagates the unsupported-operations list into `_meta`.
 * The combined response is marked `unsupported` only when *every* queried
 * provider was structurally unsupported.
 *
 * @param responses - Array of per-provider responses (possibly mixed success/failure).
 * @param limit - Optional cap on the number of pages in the merged result.
 */
export function combineResults(
  responses: ArchiveResponse[],
  limit?: number,
): ArchiveResponse {
  const allPages: ArchivedPage[] = [];
  const errors: string[] = [];
  const unsupportedProviders: UnsupportedProviderRecord[] = [];
  let anySuccess = false;

  for (const response of responses) {
    const providerSlug = response._meta?.provider ?? "unknown";
    if (response.success) {
      anySuccess = true;
      allPages.push(...response.pages);
    } else if (response.unsupported) {
      unsupportedProviders.push({
        provider: providerSlug,
        reason: response.unsupportedReason ?? "operation not supported",
      });
    } else if (response.error) {
      errors.push(response.error);
    }
  }

  // newest first
  allPages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const limitedPages =
    typeof limit === "number" && Number.isFinite(limit)
      ? allPages.slice(0, Math.max(0, limit))
      : allPages;

  const providersList = responses.map((r) => r._meta?.provider || "unknown").filter(Boolean);

  // Combined response is unsupported only when every queried provider was
  // unsupported and none produced pages or errors.
  const allUnsupported =
    responses.length > 0 &&
    unsupportedProviders.length === responses.length &&
    !anySuccess &&
    errors.length === 0;

  return {
    success: anySuccess,
    pages: limitedPages,
    error: anySuccess || allUnsupported ? undefined : errors.join("; ") || undefined,
    unsupported: allUnsupported || undefined,
    unsupportedReason: allUnsupported
      ? unsupportedProviders.map((u) => `${u.provider}: ${u.reason}`).join("; ")
      : undefined,
    _meta: {
      source: "multiple",
      provider: providersList.join(","),
      providerCount: providersList.length,
      errors: errors.length > 0 ? errors : undefined,
      unsupportedProviders:
        unsupportedProviders.length > 0 ? unsupportedProviders : undefined,
    },
  };
}

/**
 * Unified archive client aggregating one or more `ArchiveProvider`s.
 *
 * Use `createArchive()` for the functional entry point; the class exists so
 * consumers preferring OOP can instantiate it directly and subclass it.
 */
export class Archive implements ArchiveInterface {
  /**
   * Default options applied to every query unless overridden per-request.
   * Readonly from the outside – mutate by creating a new `Archive` instead.
   */
  readonly options?: ArchiveOptions;

  private readonly providersInput: ProviderInput;
  private resolvedProviders: ArchiveProvider[] | undefined;

  constructor(providers: ProviderInput, options?: ArchiveOptions) {
    this.providersInput = providers;
    this.options = options;
  }

  /**
   * Force-resolve providers immediately. Normally resolution is deferred
   * until the first query so `createArchive(providers.all())` stays cheap
   * even when never called. Public for consumers that want eager init.
   */
  async resolveProviders(): Promise<ArchiveProvider[]> {
    if (this.resolvedProviders) {
      return this.resolvedProviders;
    }

    const result = await Promise.resolve(this.providersInput);
    this.resolvedProviders = Array.isArray(result) ? result : [result];
    return this.resolvedProviders;
  }

  /**
   * Fetch from a single provider, honoring cache and error-normalization.
   */
  private async fetchFromProvider(
    provider: ArchiveProvider,
    domain: string,
    requestOptions: ArchiveOptions,
  ): Promise<ArchiveResponse> {
    // Try cache first
    if (requestOptions.cache !== false) {
      const cached = await getStoredResponse(provider, domain, requestOptions);
      if (cached) return cached;
    }

    try {
      const response = await provider.snapshots(domain, requestOptions);

      // Cache successful responses
      if (response.success && requestOptions.cache !== false) {
        await storeResponse(provider, domain, response, requestOptions);
      }

      return response;
    } catch (error) {
      // Return error response if provider fails
      return {
        success: false,
        pages: [],
        error: error instanceof Error ? error.message : String(error),
        _meta: {
          source: provider.name,
          provider: provider.name,
          errorDetails: error,
        },
      };
    }
  }

  /**
   * Fetch archived snapshots for a domain.
   * Returns a full response object with pages, metadata, and cache status.
   *
   * @param domain - The domain to search for in archive services (e.g., "example.com")
   * @param listOptions - Request-specific options that override the default options
   * @returns Promise resolving to ArchiveResponse with pages, metadata and status
   *
   * @example
   * ```js
   * // Basic usage
   * const response = await archive.snapshots('example.com')
   *
   * // With request-specific options
   * const response = await archive.snapshots('example.com', {
   *   limit: 5,
   *   cache: false // Skip cache for this request
   * })
   * ```
   */
  async snapshots(domain: string, listOptions?: ArchiveOptions): Promise<ArchiveResponse> {
    const mergedOptions = await mergeOptions(this.options, listOptions);
    const providerArray = await this.resolveProviders();

    // For a single provider, use direct approach
    if (providerArray.length === 1) {
      return this.fetchFromProvider(providerArray[0], domain, mergedOptions);
    }

    // For multiple providers, fetch in parallel with concurrency control
    const responses = await processInParallel(
      providerArray,
      (provider) => this.fetchFromProvider(provider, domain, mergedOptions),
      {
        concurrency: mergedOptions.concurrency,
        batchSize: mergedOptions.batchSize,
      },
    );

    return combineResults(responses, mergedOptions.limit);
  }

  /**
   * Fetch archived pages for a domain, returning only the pages array.
   * Throws an error if the request fails (unlike snapshots which returns a success flag).
   *
   * @param domain - The domain to search for in archive services
   * @param listOptions - Request-specific options that override the defaults
   * @returns Promise resolving to array of ArchivedPage objects
   * @throws Error if the request fails
   *
   * @example
   * ```js
   * try {
   *   // Get pages directly
   *   const pages = await archive.getPages('example.com', { limit: 10 })
   *
   *   // Work with pages array
   *   pages.forEach(page => console.log(page.snapshot))
   * } catch (error) {
   *   console.error('Failed to fetch pages:', error.message)
   * }
   * ```
   */
  async getPages(domain: string, listOptions?: ArchiveOptions): Promise<ArchivedPage[]> {
    const res = await this.snapshots(domain, listOptions);
    if (res.success) {
      return res.pages;
    }

    // Whole call was structurally unsupported: throw the dedicated subclass.
    // Synthesize `.providers` from the raw single-provider response when
    // `combineResults` was bypassed (`_meta.unsupportedProviders` only exists
    // for multi-provider runs).
    if (res.unsupported) {
      const providers =
        res._meta?.unsupportedProviders ??
        (res._meta?.provider
          ? [
              {
                provider: res._meta.provider,
                reason: res.unsupportedReason ?? "operation not supported",
              },
            ]
          : []);
      throw new UnsupportedOperationError(
        res.unsupportedReason ?? "operation not supported by any queried provider",
        providers,
      );
    }

    // Mixed runtime error + partial unsupported, or pure runtime error.
    // Surface both layers in the message so callers see the full picture
    // even though the throw type is generic Error.
    const messageParts: string[] = [];
    if (res.error) messageParts.push(res.error);
    if (res._meta?.unsupportedProviders?.length) {
      messageParts.push(
        "unsupported: " +
          res._meta.unsupportedProviders
            .map((u) => `${u.provider} (${u.reason})`)
            .join(", "),
      );
    }
    throw new Error(
      messageParts.length > 0 ? messageParts.join("; ") : "Failed to fetch archive snapshots",
    );
  }

  /**
   * Add a new provider to this archive instance.
   * Allows for dynamically extending the archive with additional providers.
   *
   * @param provider - The provider or Promise resolving to a provider to add
   * @returns The archive instance for method chaining
   *
   * @example
   * ```js
   * // Create archive with one provider
   * const archive = createArchive(providers.wayback())
   *
   * // Add another provider later
   * await archive.use(providers.archiveToday())
   *
   * // Chain calls
   * await archive
   *   .use(providers.webcite())
   *   .use(providers.commoncrawl())
   * ```
   */
  async use(provider: ArchiveProvider | Promise<ArchiveProvider>): Promise<ArchiveInterface> {
    const resolvedProvider = await Promise.resolve(provider);
    const currentProviders = await this.resolveProviders();
    this.resolvedProviders = [...currentProviders, resolvedProvider];
    return this;
  }

  /**
   * Add multiple providers to this archive instance at once.
   * More efficient than calling use() multiple times.
   *
   * @param newProviders - Array of providers or Promises resolving to providers
   * @returns The archive instance for method chaining
   *
   * @example
   * ```js
   * // Create archive with one provider
   * const archive = createArchive(providers.wayback())
   *
   * // Add multiple providers at once
   * await archive.useAll([
   *   providers.archiveToday(),
   *   providers.webcite(),
   *   providers.commoncrawl()
   * ])
   * ```
   */
  async useAll(
    newProviders: (ArchiveProvider | Promise<ArchiveProvider>)[],
  ): Promise<ArchiveInterface> {
    const resolvedNewProviders = await Promise.all(newProviders.map((p) => Promise.resolve(p)));
    const currentProviders = await this.resolveProviders();
    this.resolvedProviders = [...currentProviders, ...resolvedNewProviders];
    return this;
  }
}

/**
 * Create a unified archive client that wraps one or multiple providers.
 * Supports lazy loading and asynchronous provider initialization.
 *
 * Backwards-compatible functional factory; prefer `new Archive(providers, options)`.
 *
 * @param providers - Single provider, array of providers, or Promise(s) resolving to provider(s)
 * @param options - Default options applied to all queries (limit, cache, ttl, concurrency, etc.)
 * @returns Archive client with methods for fetching and managing archive data
 *
 * @example
 * ```js
 * // Single provider
 * const waybackArchive = createArchive(providers.wayback())
 *
 * // Multiple providers
 * const multiArchive = createArchive([
 *   providers.wayback(),
 *   providers.archiveToday()
 * ])
 *
 * // With options
 * const archive = createArchive(providers.all(), {
 *   limit: 10,
 *   cache: true,
 *   ttl: 3600000, // 1 hour cache TTL
 *   concurrency: 3
 * })
 * ```
 */
export function createArchive(
  providers:
    | ArchiveProvider
    | ArchiveProvider[]
    | Promise<ArchiveProvider>
    | Promise<ArchiveProvider[]>,
  options?: ArchiveOptions,
): ArchiveInterface {
  return new Archive(providers, options);
}
