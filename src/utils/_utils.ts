import { FetchOptions } from "ofetch";
import { hasProtocol, withTrailingSlash, withoutProtocol, cleanDoubleSlashes } from "ufo";
import { consola } from "consola";
import type {
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
  ArchivedContent,
  ArchivedPage,
  WaybackMetadata,
  ResponseMetadata,
} from "../types";
import { getConfig } from "../config";

const ALLOWED_WAYBACK_TIMESTAMP_LENGTHS = new Set([4, 6, 8, 10, 12, 14]);

// Utility for parallel processing with concurrency control
export async function processInParallel<T, R>(
  items: T[],
  processFunction: (item: T) => Promise<R>,
  options: { concurrency?: number; batchSize?: number } = {},
): Promise<R[]> {
  const config = await getConfig();
  const concurrency = options.concurrency ?? config.performance.concurrency ?? 3;
  const batchSize = options.batchSize ?? config.performance.batchSize ?? 20;

  // Process small datasets directly
  if (items.length <= concurrency) {
    return Promise.all(items.map((item) => processFunction(item)));
  }

  // Process larger datasets with concurrency control
  const results: R[] = [];

  // Process in batches for better memory management
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processBatch(batch, concurrency);
    results.push(...batchResults);
  }

  return results;

  // Helper function to process a batch with concurrency limit
  async function processBatch(batch: T[], limit: number): Promise<R[]> {
    const FAILED = Symbol("failed");
    const batchResults: Array<R | typeof FAILED> = Array.from(
      { length: batch.length },
      () => FAILED,
    );
    const executing: Set<Promise<void>> = new Set();

    for (let idx = 0; idx < batch.length; idx++) {
      const i = idx;
      const promise = processFunction(batch[i])
        .then((result) => {
          batchResults[i] = result;
        })
        .catch((error) => {
          consola.error("Parallel processing error:", error);
        })
        .finally(() => {
          executing.delete(promise);
        });

      executing.add(promise);

      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);

    return batchResults.filter((r): r is R => r !== FAILED);
  }
}

/**
 * Converts a Wayback Machine timestamp to ISO8601 format
 * Supports CDX precisions: YYYY, YYYYMM, YYYYMMDD, YYYYMMDDhh,
 * YYYYMMDDhhmm, YYYYMMDDhhmmss.
 * @param timestamp Wayback timestamp
 * @returns ISO8601 formatted timestamp, or empty string if invalid
 */
export function waybackTimestampToISO(timestamp: string): string {
  const value = timestamp.trim();

  if (!/^\d+$/.test(value)) {
    return "";
  }

  if (!ALLOWED_WAYBACK_TIMESTAMP_LENGTHS.has(value.length)) {
    return "";
  }

  const month = value.length >= 6 ? value.slice(4, 6) : "01";
  const day = value.length >= 8 ? value.slice(6, 8) : "01";
  const hour = value.length >= 10 ? value.slice(8, 10) : "00";
  const minute = value.length >= 12 ? value.slice(10, 12) : "00";
  const second = value.length >= 14 ? value.slice(12, 14) : "00";

  const yearNum = Number.parseInt(value.slice(0, 4), 10);
  const monthNum = Number.parseInt(month, 10);
  const dayNum = Number.parseInt(day, 10);
  const hourNum = Number.parseInt(hour, 10);
  const minuteNum = Number.parseInt(minute, 10);
  const secondNum = Number.parseInt(second, 10);

  if (
    monthNum < 1 ||
    monthNum > 12 ||
    dayNum < 1 ||
    dayNum > 31 ||
    hourNum > 23 ||
    minuteNum > 59 ||
    secondNum > 59
  ) {
    return "";
  }

  const iso = `${value.slice(0, 4)}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const parsed = new Date(Date.UTC(yearNum, monthNum - 1, dayNum, hourNum, minuteNum, secondNum));
  const isSameDateParts =
    parsed.getUTCFullYear() === yearNum &&
    parsed.getUTCMonth() + 1 === monthNum &&
    parsed.getUTCDate() === dayNum &&
    parsed.getUTCHours() === hourNum &&
    parsed.getUTCMinutes() === minuteNum &&
    parsed.getUTCSeconds() === secondNum;

  return isSameDateParts ? iso : "";
}

/**
 * Normalizes a domain string for search queries
 * @param domain The domain or URL to normalize
 * @param appendWildcard Whether to append a wildcard for prefix matching
 * @returns Normalized domain string
 */
export function normalizeDomain(domain: string, appendWildcard = true): string {
  // Normalize domain input using ufo
  const normalizedDomain = hasProtocol(domain) ? withoutProtocol(domain) : domain;

  // Create URL pattern for search if requested
  if (domain.includes("*")) {
    return normalizedDomain;
  }

  return appendWildcard ? withTrailingSlash(normalizedDomain) + "*" : normalizedDomain;
}

/**
 * Creates a standardized success response object
 * @param pages Array of archived pages
 * @param source Source identifier for the provider
 * @param metadata Additional metadata to include
 * @returns Standardized ArchiveResponse object
 */
export function createSuccessResponse(
  pages: ArchivedPage[],
  source: string,
  metadata: Record<string, unknown> = {},
): ArchiveResponse {
  return {
    success: true,
    pages,
    _meta: {
      source,
      provider: source,
      ...metadata,
    } as ResponseMetadata,
  };
}

/**
 * Creates a standardized response object signalling that the provider does
 * not implement the requested operation. Use when the operation is outside
 * the provider's API surface (e.g. WebCite has no list-by-domain endpoint),
 * not when the operation failed at runtime.
 *
 * @param reason - Human-readable explanation of why the operation is unsupported.
 * @param source - Provider slug (mirrored to `_meta.source` and `_meta.provider`).
 * @param metadata - Extra fields merged into `_meta`.
 */
export function createUnsupportedResponse(
  reason: string,
  source: string,
  metadata: Record<string, unknown> = {},
): ArchiveResponse {
  return {
    success: false,
    pages: [],
    unsupported: true,
    unsupportedReason: reason,
    _meta: {
      source,
      provider: source,
      ...metadata,
    } as ResponseMetadata,
  };
}

/**
 * Creates a standardized error response object
 * @param error Error object, message, or unknown value
 * @param source Source identifier for the provider
 * @param metadata Additional metadata to include
 * @returns Standardized ArchiveResponse error object
 */
export function createErrorResponse(
  error: unknown,
  source: string,
  metadata: Record<string, unknown> = {},
): ArchiveResponse {
  return {
    success: false,
    pages: [],
    error: toErrorMessage(error),
    _meta: {
      source,
      provider: source,
      errorDetails: error,
      errorName: error instanceof Error ? error.name : "UnknownError",
      ...metadata,
    } as ResponseMetadata,
  };
}

/**
 * Reduces a thrown value of unknown shape to one message.
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/**
 * Creates a standardized success response for a read archived body.
 *
 * @param content - The capture that was read
 * @param source - Provider slug (mirrored to `_meta.source` and `_meta.provider`)
 * @param metadata - Extra fields merged into `_meta`
 */
export function createContentResponse(
  content: ArchivedContent,
  source: string,
  metadata: Record<string, unknown> = {},
): ArchiveContentResponse {
  return {
    success: true,
    content,
    _meta: {
      source,
      provider: source,
      ...metadata,
    } as ResponseMetadata,
  };
}

/**
 * Creates a content response signalling that the provider has no endpoint
 * returning archived page bodies. Use for a structural gap in the provider's
 * API surface, not for a body that failed to load.
 *
 * @param reason - Human-readable explanation of why the operation is unsupported
 * @param source - Provider slug
 * @param metadata - Extra fields merged into `_meta`
 */
export function createUnsupportedContentResponse(
  reason: string,
  source: string,
  metadata: Record<string, unknown> = {},
): ArchiveContentResponse {
  return {
    success: false,
    unsupported: true,
    unsupportedReason: reason,
    _meta: {
      source,
      provider: source,
      ...metadata,
    } as ResponseMetadata,
  };
}

/**
 * Creates a standardized error response for a body that could not be read.
 *
 * @param error - Error object, message, or unknown value
 * @param source - Provider slug
 * @param metadata - Extra fields merged into `_meta`
 */
export function createContentErrorResponse(
  error: unknown,
  source: string,
  metadata: Record<string, unknown> = {},
): ArchiveContentResponse {
  return {
    success: false,
    error: toErrorMessage(error),
    _meta: {
      source,
      provider: source,
      errorDetails: error,
      errorName: error instanceof Error ? error.name : "UnknownError",
      ...metadata,
    } as ResponseMetadata,
  };
}

/**
 * Creates common fetch options with standard defaults
 * @param baseURL Base URL for the API
 * @param params Query parameters
 * @param options Additional options
 * @returns FetchOptions object
 */
export async function createFetchOptions(
  baseURL: string,
  params: Record<string, any> = {},
  options: Partial<FetchOptions & ArchiveOptions> = {},
): Promise<FetchOptions> {
  const config = await getConfig();

  return {
    method: "GET",
    baseURL,
    params,
    retry: options.retries ?? config.performance.retries,
    timeout: options.timeout ?? config.performance.timeout,
    retryDelay: 300, // Add delay between retries
    retryStatusCodes: [408, 409, 425, 429, 500, 502, 503, 504], // Standard retry status codes
    onResponseError: ({ request, response, options }) => {
      consola.error(
        `[fetch error] ${options.method} ${request} failed with status ${response.status}`,
      );
    },
    ...options,
  };
}

/**
 * Merges initial options with request options, preferring request options
 * @param initOptions Initial options provided during provider creation
 * @param reqOptions Request-specific options
 * @returns Merged options object
 */
export async function mergeOptions<T extends ArchiveOptions>(
  initOptions: Partial<T> = {},
  reqOptions: Partial<T> = {},
): Promise<T> {
  const config = await getConfig();
  const defaultOptions = {
    concurrency: config.performance.concurrency,
    batchSize: config.performance.batchSize,
    timeout: config.performance.timeout,
    retries: config.performance.retries,
    cache: config.storage.cache,
    ttl: config.storage.ttl,
  };

  // Create merged options with all properties preserved
  return {
    ...defaultOptions,
    ...initOptions,
    ...reqOptions,
  } as T;
}

/**
 * Maps CDX server API response rows to ArchivedPage objects.
 * @param dataRows Array of rows from CDX API, excluding header.
 * @param snapshotBaseUrl Base URL for snapshot (including path segment).
 * @param providerSlug Provider identifier used for metadata typing.
 * @param options Performance options for processing.
 * @returns Array of ArchivedPage objects.
 */
export async function mapCdxRows(
  dataRows: string[][],
  snapshotBaseUrl: string,
  providerSlug = "wayback",
  options: ArchiveOptions = {},
): Promise<ArchivedPage[]> {
  const config = await getConfig();

  const batchSize = options.batchSize ?? config.performance.batchSize ?? 20;

  // For small datasets, process directly without batching
  if (dataRows.length <= batchSize) {
    return dataRows
      .map((row) => rowToArchivedPage(row))
      .filter((page): page is ArchivedPage => page !== undefined);
  }

  // For larger datasets, process in batches for better memory usage
  const results: ArchivedPage[] = [];

  for (let i = 0; i < dataRows.length; i += batchSize) {
    const batch = dataRows.slice(i, i + batchSize);
    results.push(
      ...batch
        .map((row) => rowToArchivedPage(row))
        .filter((page): page is ArchivedPage => page !== undefined),
    );
  }

  return results;

  // Helper function to convert a row to an ArchivedPage
  function rowToArchivedPage([rawUrl, rawTimestamp, rawStatus]: string[]):
    | ArchivedPage
    | undefined {
    const originalUrl = cleanDoubleSlashes(rawUrl ?? "");
    const timestampRaw = rawTimestamp ?? "";
    const isoTimestamp = waybackTimestampToISO(timestampRaw);
    if (!isoTimestamp) {
      consola.debug("[cdx] Dropping row with invalid timestamp", {
        provider: providerSlug,
        timestamp: timestampRaw,
        url: originalUrl,
      });
      return undefined;
    }

    const snapUrl = `${snapshotBaseUrl}/${timestampRaw}/${originalUrl}`;
    return {
      url: originalUrl,
      timestamp: isoTimestamp,
      snapshot: snapUrl,
      _meta: {
        timestamp: timestampRaw,
        status: Number.parseInt(rawStatus ?? "0", 10),
        provider: providerSlug,
      } as WaybackMetadata,
    };
  }
}
