// Import necessary dependencies
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
  ArchiveProvider,
  ArchivedContent,
  ArchivedPage,
  ArchiveInterface,
  ProviderReference,
  UnsupportedProviderRecord,
} from "./types";
import { getStoredContent, getStoredResponse, storeContent, storeResponse } from "./storage";
import {
  mergeOptions,
  processInParallel,
  resolveRequestedTimestamp,
  timestampLowerBound,
  timestampUpperBound,
  toErrorMessage,
  toWaybackTimestamp,
  unreadableTargetReason,
  unwrapSnapshotUrl,
} from "./utils";

/**
 * Thrown by `archive.getPages()` when the only-or-all-queried providers do not
 * implement the requested operation. Lets callers distinguish a structural
 * "this provider has no such API" from a runtime fetch failure.
 */
export class UnsupportedOperationError extends Error {
  readonly providers: UnsupportedProviderRecord[];

  constructor(reason: string, providers: readonly Readonly<UnsupportedProviderRecord>[] = []) {
    super(reason);
    this.name = "UnsupportedOperationError";
    this.providers = [...providers];
  }
}

type ProviderInput =
  | ProviderReference
  | readonly ArchiveProvider[]
  | Promise<readonly ArchiveProvider[]>;

function isProviderArray(providers: ProviderInput): providers is readonly ArchiveProvider[] {
  return Array.isArray(providers);
}

interface ListingMergeState {
  pages: ArchivedPage[];
  priorPageKeys: Set<string>;
  failures: Array<{ provider: string; message: string }>;
  unsupportedProviders: UnsupportedProviderRecord[];
  anySuccess: boolean;
}

function mergeResponsePages(response: ArchiveResponse, state: ListingMergeState): void {
  const responsePageKeys = new Set<string>();
  const responseCaptureKeys = new Set<string>();
  for (const page of response.pages) {
    const pageKey = JSON.stringify([page.url, page.timestamp]);
    const digest = page._meta.digest;
    const captureIdentity =
      typeof digest === "string" && digest.length > 0 ? digest : page.snapshot;
    const captureKey = JSON.stringify([page.url, page.timestamp, captureIdentity]);
    if (state.priorPageKeys.has(pageKey) || responseCaptureKeys.has(captureKey)) continue;
    responsePageKeys.add(pageKey);
    responseCaptureKeys.add(captureKey);
    state.pages.push(page);
  }
  for (const pageKey of responsePageKeys) state.priorPageKeys.add(pageKey);
}

function collectListingResponse(response: ArchiveResponse, state: ListingMergeState): void {
  const provider = response._meta?.provider ?? "unknown";
  if (response.success) {
    state.anySuccess = true;
    mergeResponsePages(response, state);
  } else if (response.unsupported) {
    state.unsupportedProviders.push({
      provider,
      reason: response.unsupportedReason ?? "operation not supported",
    });
  } else if (response.error) {
    state.failures.push({ provider, message: response.error });
  }
}

function prefixedFailures(
  failures: readonly Readonly<{ provider: string; message: string }>[],
): string[] {
  return failures.map((failure) => `${failure.provider}: ${failure.message}`);
}

function unsupportedReason(records: readonly Readonly<UnsupportedProviderRecord>[]): string {
  return records.map((record) => `${record.provider}: ${record.reason}`).join("; ");
}

function buildCombinedListingResponse(
  responses: readonly ArchiveResponse[],
  state: ListingMergeState,
  pages: readonly ArchivedPage[],
): ArchiveResponse {
  const providers = responses.map((response) => response._meta?.provider || "unknown");
  const allUnsupported =
    responses.length > 0 &&
    state.unsupportedProviders.length === responses.length &&
    !state.anySuccess &&
    state.failures.length === 0;
  const result: ArchiveResponse = {
    success: state.anySuccess,
    pages: [...pages],
    _meta: {
      source: "multiple",
      provider: providers.join(","),
      providerCount: providers.length,
      errors: state.failures.length > 0 ? prefixedFailures(state.failures) : undefined,
      unsupportedProviders:
        state.unsupportedProviders.length > 0 ? state.unsupportedProviders : undefined,
    },
  };
  if (allUnsupported) {
    result.unsupported = true;
    result.unsupportedReason = unsupportedReason(state.unsupportedProviders);
  } else if (!state.anySuccess) {
    result.error = state.failures.map((failure) => failure.message).join("; ") || undefined;
  }
  return result;
}

/**
 * Combine per-provider responses into a single merged ArchiveResponse.
 *
 * Merges pages, deduplicates matching URLs and timestamps across provider
 * responses, collapses repeated captures within each response, joins errors,
 * and propagates unsupported operations into `_meta`.
 * The combined response is marked `unsupported` only when *every* queried
 * provider was structurally unsupported.
 *
 * @param responses - Array of per-provider responses (possibly mixed success/failure).
 * @param limit - Optional cap on the number of pages in the merged result.

 *
 * @returns {ArchiveResponse} The operation result.
 */
export function combineResults(
  responses: readonly ArchiveResponse[],
  limit?: number,
): ArchiveResponse {
  const state: ListingMergeState = {
    pages: [],
    priorPageKeys: new Set<string>(),
    failures: [],
    unsupportedProviders: [],
    anySuccess: false,
  };
  for (const response of responses) collectListingResponse(response, state);
  state.pages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return buildCombinedListingResponse(responses, state, limitPages(state.pages, limit));
}

interface ContentMergeState {
  failures: Array<{ provider: string; message: string }>;
  unsupportedProviders: UnsupportedProviderRecord[];
}

function collectContentResponse(
  response: ArchiveContentResponse,
  state: ContentMergeState,
): ArchiveContentResponse | undefined {
  const provider = response._meta?.provider ?? "unknown";
  if (response.success && response.content) return response;
  if (response.unsupported) {
    state.unsupportedProviders.push({
      provider,
      reason: response.unsupportedReason ?? "operation not supported",
    });
  } else if (response.error) {
    state.failures.push({ provider, message: response.error });
  }
  return undefined;
}

function combineContentWinner(
  winner: ArchiveContentResponse,
  state: ContentMergeState,
): ArchiveContentResponse {
  return {
    ...winner,
    _meta: {
      ...(winner._meta ?? { source: "multiple", provider: "unknown" }),
      errors: state.failures.length > 0 ? prefixedFailures(state.failures) : undefined,
      unsupportedProviders:
        state.unsupportedProviders.length > 0 ? state.unsupportedProviders : undefined,
    },
  };
}

function combinedContentFailure(
  responses: readonly ArchiveContentResponse[],
  state: ContentMergeState,
): ArchiveContentResponse {
  const allUnsupported =
    responses.length > 0 && state.unsupportedProviders.length === responses.length;
  const result: ArchiveContentResponse = {
    success: false,
    _meta: {
      source: "multiple",
      provider: responses.map((response) => response._meta?.provider || "unknown").join(","),
      providerCount: responses.length,
      errors: state.failures.length > 0 ? prefixedFailures(state.failures) : undefined,
      unsupportedProviders:
        state.unsupportedProviders.length > 0 ? state.unsupportedProviders : undefined,
    },
  };
  if (allUnsupported) {
    result.unsupported = true;
    result.unsupportedReason = unsupportedReason(state.unsupportedProviders);
  } else {
    result.error = state.failures.map((failure) => failure.message).join("; ") || undefined;
  }
  return result;
}

/**
 * Combine per-provider content responses into a single response.
 *
 * A content query wants one body, not a merged set, so the first provider that
 * returns one wins and the others are reported beside it: which archive answered
 * decides how much the bytes can be trusted, and a caller that reads only the
 * body would never learn that its preferred archive was the one that failed.
 *
 * @param responses - Per-provider responses, in the order they were tried

 *
 * @returns {ArchiveContentResponse} The operation result.
 */
export function combineContentResults(
  responses: readonly ArchiveContentResponse[],
): ArchiveContentResponse {
  if (responses.length <= 1) {
    return responses[0] ?? { success: false, error: "No providers were queried" };
  }

  const state: ContentMergeState = { failures: [], unsupportedProviders: [] };
  let winner: ArchiveContentResponse | undefined;
  for (const response of responses) {
    const candidate = collectContentResponse(response, state);
    winner ??= candidate;
  }
  return winner ? combineContentWinner(winner, state) : combinedContentFailure(responses, state);
}

/*
 * Drops the pages outside the requested window.
 *
 * Providers that can narrow their own index query already have; this is the
 * guarantee for the ones that cannot, so a fan-out never mixes in-window
 * listings with out-of-window ones. A capture whose date cannot be read cannot
 * be placed inside the window, so it drops with them.
 */
function windowPages(response: ArchiveResponse, from: string, to: string): ArchiveResponse {
  if (!response.success) return response;

  const lower = from ? timestampLowerBound(from) : "";
  const upper = to ? timestampUpperBound(to) : "";
  const pages = response.pages.filter((page) => {
    const stamp = toWaybackTimestamp(page.timestamp);
    if (!stamp) return false;
    return (!lower || stamp >= lower) && (!upper || stamp <= upper);
  });

  return pages.length === response.pages.length ? response : { ...response, pages };
}

/* One shared clamp, so the merge and the windowed paths cannot drift on limit semantics. */
function limitPages(pages: readonly ArchivedPage[], limit: number | undefined): ArchivedPage[] {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return [...pages];
  return pages.length <= limit ? [...pages] : pages.slice(0, Math.max(0, limit));
}

/* Caps the pages of one filtered response, the way the lifted provider limit would have. */
function capPages(response: ArchiveResponse, limit: number | undefined): ArchiveResponse {
  const pages = limitPages(response.pages, limit);
  return pages === response.pages ? response : { ...response, pages };
}

type FailedArchiveResponse = ArchiveResponse | ArchiveContentResponse;

function responseUnsupportedProviders(
  response: FailedArchiveResponse,
): UnsupportedProviderRecord[] {
  if (response._meta?.unsupportedProviders) return [...response._meta.unsupportedProviders];
  if (!response._meta?.provider) return [];
  return [
    {
      provider: response._meta.provider,
      reason: response.unsupportedReason ?? "operation not supported",
    },
  ];
}

function archiveFailureMessage(response: FailedArchiveResponse, fallback: string): string {
  const parts: string[] = [];
  if (response.error) parts.push(response.error);
  const unsupported = response._meta?.unsupportedProviders;
  if (unsupported?.length) {
    parts.push(
      `unsupported: ${unsupported.map((record) => `${record.provider} (${record.reason})`).join(", ")}`,
    );
  }
  return parts.length > 0 ? parts.join("; ") : fallback;
}

function throwArchiveFailure(response: FailedArchiveResponse, fallback: string): never {
  if (response.unsupported) {
    throw new UnsupportedOperationError(
      response.unsupportedReason ?? "operation not supported by any queried provider",
      responseUnsupportedProviders(response),
    );
  }
  throw new Error(archiveFailureMessage(response, fallback));
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

  constructor(providers: ProviderInput, options?: Readonly<ArchiveOptions>) {
    this.providersInput = isProviderArray(providers) ? [...providers] : providers;
    this.options = options;
    this.resolveProviders = this.resolveProviders.bind(this);
    this.snapshots = this.snapshots.bind(this);
    this.getPages = this.getPages.bind(this);
    this.content = this.content.bind(this);
    this.getContent = this.getContent.bind(this);
    this.use = this.use.bind(this);
    this.useAll = this.useAll.bind(this);
  }

  /**
   * Force-resolve providers immediately. Normally resolution is deferred
   * until the first query so `createArchive(providers.all())` stays cheap
   * even when never called. Public for consumers that want eager init.

   *
   * @returns {Promise<ArchiveProvider[]>} A promise resolving to the operation result.
   */
  async resolveProviders(): Promise<ArchiveProvider[]> {
    if (this.resolvedProviders) {
      return [...this.resolvedProviders];
    }

    const result = await Promise.resolve(this.providersInput);
    this.resolvedProviders = isProviderArray(result) ? [...result] : [result];
    return [...this.resolvedProviders];
  }

  /**
   * Fetch from a single provider, honoring cache and error-normalization.

   *
   * @param provider - Provider.
   * @param domain - Domain.
   * @param requestOptions - Request Options.
   * @returns {Promise<ArchiveResponse>} A promise resolving to the operation result.
   */
  private async fetchFromProvider(
    provider: Readonly<ArchiveProvider>,
    domain: string,
    requestOptions: Readonly<ArchiveOptions>,
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
   * A `from`/`to` window is validated once here, normalized to digits, and
   * completed per provider, because init-level bounds count too and a provider
   * without a window-aware index cannot apply them itself. A windowed fetch
   * runs with the provider limits lifted; every cap returns after the filter,
   * the caller's after the newest-first merge, since a cap taken earlier turns
   * a tight limit into a false "nothing captured in this window". An inverted
   * window throws before the fan-out, where the parallel runner would swallow
   * the error.
   *
   * @param domain - The domain to search for in archive services (e.g., "example.com")
   * @param listOptions - Request-specific options that override the default options
   * @returns {Promise<ArchiveResponse>} Promise resolving to ArchiveResponse with pages, metadata and status
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
   *
   * // Only the captures from the first half of 2019
   * const response = await archive.snapshots('example.com', {
   *   from: '2019',
   *   to: '2019-06'
   * })
   * ```
   */
  async snapshots(
    domain: string,
    listOptions?: Readonly<ArchiveOptions>,
  ): Promise<ArchiveResponse> {
    const {
      from: rawFrom,
      to: rawTo,
      ...restOptions
    } = await mergeOptions(this.options, listOptions);

    const from = resolveRequestedTimestamp(rawFrom, "from");
    const to = resolveRequestedTimestamp(rawTo, "to");

    const providerArray = await this.resolveProviders();

    /** Effective per-provider window: request and archive bounds win per edge, init bounds complete the cascade, and an inverted result throws ahead of the fan-out. */
    const windowed = providerArray.map((provider) => {
      const windowFrom = from || resolveRequestedTimestamp(provider.options?.from, "from");
      const windowTo = to || resolveRequestedTimestamp(provider.options?.to, "to");
      if (
        windowFrom &&
        windowTo &&
        timestampLowerBound(windowFrom) > timestampUpperBound(windowTo)
      ) {
        throw new Error(`Window is inverted: from "${windowFrom}" is later than to "${windowTo}"`);
      }
      return { provider, windowFrom, windowTo };
    });

    /*
     * One provider's windowed listing. The fetch runs with every limit lifted,
     * as an explicit undefined so the provider's own cascade cannot restore an
     * init-level value, and with the validated digits in the request options,
     * so a pushdown index never sees a raw init-level date and the cache key
     * separates this fetch from a naturally capped one. The provider's own cap
     * comes back after the filter, but only while the request names no limit of
     * its own: a request limit outranks the init level, and in a fan-out it is
     * applied after the newest-first merge rather than here, where it would cut
     * in the provider's order.
     */
    const fetchWindowed = async ({
      provider,
      windowFrom,
      windowTo,
    }: Readonly<(typeof windowed)[number]>): Promise<ArchiveResponse> => {
      if (!windowFrom && !windowTo) {
        return this.fetchFromProvider(provider, domain, restOptions);
      }

      const bounded: ArchiveOptions = {
        ...restOptions,
        limit: undefined,
        ...(windowFrom ? { from: windowFrom } : {}),
        ...(windowTo ? { to: windowTo } : {}),
      };
      const response = await this.fetchFromProvider(provider, domain, bounded);
      return capPages(
        windowPages(response, windowFrom, windowTo),
        restOptions.limit === undefined ? provider.options?.limit : undefined,
      );
    };

    // For a single provider, use direct approach
    if (providerArray.length === 1) {
      const [single] = windowed;
      const response = await fetchWindowed(single);
      return single.windowFrom || single.windowTo
        ? capPages(response, restOptions.limit)
        : response;
    }

    // For multiple providers, fetch in parallel with concurrency control
    const responses = await processInParallel(windowed, fetchWindowed, {
      concurrency: restOptions.concurrency,
      batchSize: restOptions.batchSize,
    });

    return combineResults(responses, restOptions.limit);
  }

  /**
   * Fetch archived pages for a domain, returning only the pages array.
   * Throws an error if the request fails (unlike snapshots which returns a success flag).
   *
   * @param domain - The domain to search for in archive services
   * @param listOptions - Request-specific options that override the defaults
   * @returns {Promise<ArchivedPage[]>} Promise resolving to array of ArchivedPage objects
   * @throws {Error} Error if the request fails
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
  async getPages(domain: string, listOptions?: Readonly<ArchiveOptions>): Promise<ArchivedPage[]> {
    const res = await this.snapshots(domain, listOptions);
    if (res.success) {
      return res.pages;
    }

    throwArchiveFailure(res, "Failed to fetch archive snapshots");
  }

  /**
   * Read one archived capture's body from a single provider, honoring the cache.

   *
   * @param provider - Provider.
   * @param url - Url.
   * @param requestOptions - Request Options.
   * @returns {Promise<ArchiveContentResponse>} A promise resolving to the operation result.
   */
  private async readContentFromProvider(
    provider: Readonly<ArchiveProvider>,
    url: string,
    requestOptions: Readonly<ArchiveContentOptions>,
  ): Promise<ArchiveContentResponse> {
    const providerSlug = provider.slug ?? provider.name;

    // A provider without the method is the same answer as one that declares the
    // operation unsupported, and saying so by name beats a generic failure.
    if (typeof provider.content !== "function") {
      return {
        success: false,
        unsupported: true,
        unsupportedReason: `${provider.name} does not implement reading archived content`,
        _meta: { source: provider.name, provider: providerSlug },
      };
    }

    if (requestOptions.cache !== false) {
      const cached = await getStoredContent(provider, url, requestOptions);
      if (cached) return cached;
    }

    try {
      const response = await provider.content(url, requestOptions);

      if (response.success && requestOptions.cache !== false) {
        await storeContent(provider, url, response, requestOptions);
      }

      return response;
    } catch (error) {
      return {
        success: false,
        error: toErrorMessage(error),
        _meta: {
          source: provider.name,
          provider: providerSlug,
          errorDetails: error,
        },
      };
    }
  }

  /**
   * Read the body of one archived capture.
   *
   * Providers are tried in order and the first body wins, because there is one
   * page to read rather than a set to merge. Passing a playback URL works as
   * well as passing the original: the capture it names is unwrapped out of it.
   *
   * @param url - Original URL, or a playback URL printed by `snapshots()`
   * @param contentOptions - Request options; `timestamp` selects the capture
   * @returns {Promise<ArchiveContentResponse>} Promise resolving to the capture, or to the reasons nobody had it
   *
   * @example
   * ```js
   * // Newest capture
   * const response = await archive.content('example.com')
   *
   * // The page as it stood in March 2019
   * const response = await archive.content('https://example.com/page', {
   *   timestamp: '2019-03-01'
   * })
   * ```
   */
  async content(
    url: string,
    contentOptions?: Readonly<ArchiveContentOptions>,
  ): Promise<ArchiveContentResponse> {
    const mergedOptions = await mergeOptions<ArchiveContentOptions>(this.options, contentOptions);
    const providerArray = await this.resolveProviders();

    // An explicit timestamp wins over one embedded in a playback URL: the caller
    // asking for a different capture than the URL names is asking on purpose.
    const unwrapped = unwrapSnapshotUrl(url);
    const unreadable = unreadableTargetReason(unwrapped.url);
    if (unreadable) {
      return {
        success: false,
        error: unreadable,
        _meta: { source: "archives", provider: "archives" },
      };
    }

    const timestamp = mergedOptions.timestamp ?? unwrapped.timestamp;
    const options: ArchiveContentOptions = {
      ...mergedOptions,
      ...(timestamp === undefined ? {} : { timestamp }),
    };

    const responses: ArchiveContentResponse[] = [];
    for (const provider of providerArray) {
      const response = await this.readContentFromProvider(provider, unwrapped.url, options);
      responses.push(response);
      if (response.success && response.content) break;
    }

    return combineContentResults(responses);
  }

  /**
   * Read one archived capture, returning the capture itself.
   * Throws when no provider could produce it (unlike `content`, which reports).
   *
   * @param url - Original URL, or a playback URL printed by `snapshots()`
   * @param contentOptions - Request options; `timestamp` selects the capture
   * @returns {Promise<ArchivedContent>} Promise resolving to the archived capture
   * @throws {Error} `UnsupportedOperationError` when every queried provider lacks the
   * operation, and a generic `Error` when the read failed for any other reason
   */
  async getContent(
    url: string,
    contentOptions?: Readonly<ArchiveContentOptions>,
  ): Promise<ArchivedContent> {
    const res = await this.content(url, contentOptions);
    if (res.success && res.content) {
      return res.content;
    }

    throwArchiveFailure(res, "Failed to read archived content");
  }

  /**
   * Add a new provider to this archive instance.
   * Allows for dynamically extending the archive with additional providers.
   *
   * @param provider - The provider or Promise resolving to a provider to add
   * @returns {Promise<ArchiveInterface>} The archive instance for method chaining
   *
   * @example
   * ```js
   * // Create archive with one provider
   * const archive = createArchive(providers.wayback())
   *
   * // Add another provider later
   * await archive.use(providers.archiveToday())
   *
   * // Await each addition
   * await archive.use(providers.webcite())
   * await archive.use(providers.commoncrawl())
   * ```
   */
  async use(provider: ProviderReference): Promise<ArchiveInterface> {
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
   * @returns {Promise<ArchiveInterface>} The archive instance for method chaining
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
  async useAll(newProviders: readonly ProviderReference[]): Promise<ArchiveInterface> {
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
 * @returns {ArchiveInterface} Archive client with methods for fetching and managing archive data
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
  providers: ProviderInput,
  options?: Readonly<ArchiveOptions>,
): ArchiveInterface {
  return new Archive(providers, options);
}
