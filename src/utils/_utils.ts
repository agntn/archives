import { FetchOptions } from "ofetch";
import { version } from "../version";
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
  items: readonly T[],
  processFunction: (item: T) => Promise<R>,
  options: Readonly<{ concurrency?: number; batchSize?: number }> = {},
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
  async function processBatch(batch: readonly T[], limit: number): Promise<R[]> {
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

interface WaybackDateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function waybackDateParts(value: string): WaybackDateParts {
  return {
    year: value.slice(0, 4),
    month: value.length >= 6 ? value.slice(4, 6) : "01",
    day: value.length >= 8 ? value.slice(6, 8) : "01",
    hour: value.length >= 10 ? value.slice(8, 10) : "00",
    minute: value.length >= 12 ? value.slice(10, 12) : "00",
    second: value.length >= 14 ? value.slice(12, 14) : "00",
  };
}

function validWaybackDateParts(parts: Readonly<Record<keyof WaybackDateParts, number>>): boolean {
  return !(
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31 ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    parts.second > 59
  );
}

function sameUtcDate(
  parsed: Readonly<Date>,
  parts: Readonly<Record<keyof WaybackDateParts, number>>,
): boolean {
  return (
    parsed.getUTCFullYear() === parts.year &&
    parsed.getUTCMonth() + 1 === parts.month &&
    parsed.getUTCDate() === parts.day &&
    parsed.getUTCHours() === parts.hour &&
    parsed.getUTCMinutes() === parts.minute &&
    parsed.getUTCSeconds() === parts.second
  );
}

/**
 * Converts a Wayback Machine timestamp to ISO8601 format
 * Supports CDX precisions: YYYY, YYYYMM, YYYYMMDD, YYYYMMDDhh,
 * YYYYMMDDhhmm, YYYYMMDDhhmmss.
 * @param timestamp Wayback timestamp
 * @returns {string} ISO8601 formatted timestamp, or empty string if invalid
 */
export function waybackTimestampToISO(timestamp: string): string {
  const value = timestamp.trim();

  if (!/^\d+$/.test(value)) {
    return "";
  }

  if (!ALLOWED_WAYBACK_TIMESTAMP_LENGTHS.has(value.length)) {
    return "";
  }

  const parts = waybackDateParts(value);
  const numbers = {
    year: Number.parseInt(parts.year, 10),
    month: Number.parseInt(parts.month, 10),
    day: Number.parseInt(parts.day, 10),
    hour: Number.parseInt(parts.hour, 10),
    minute: Number.parseInt(parts.minute, 10),
    second: Number.parseInt(parts.second, 10),
  };
  if (!validWaybackDateParts(numbers)) return "";

  const iso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`;
  const parsed = new Date(
    Date.UTC(
      numbers.year,
      numbers.month - 1,
      numbers.day,
      numbers.hour,
      numbers.minute,
      numbers.second,
    ),
  );
  return sameUtcDate(parsed, numbers) ? iso : "";
}

/**
 * Normalizes a domain string for search queries
 * @param domain The domain or URL to normalize
 * @param appendWildcard Whether a bare host should use prefix matching
 * @returns {string} Normalized domain string
 */
export function normalizeDomain(domain: string, appendWildcard = true): string {
  // Normalize domain input using ufo
  const normalizedDomain = hasProtocol(domain) ? withoutProtocol(domain) : domain;

  // Create URL pattern for search if requested
  if (!appendWildcard || domain.includes("*")) {
    return normalizedDomain;
  }

  const suffixStart = normalizedDomain.search(/[/?#]/);
  const isBareHost = suffixStart === -1 || /^\/+$/u.test(normalizedDomain.slice(suffixStart));

  return isBareHost ? withTrailingSlash(normalizedDomain) + "*" : normalizedDomain;
}

/**
 * Creates a standardized success response object
 * @param pages Array of archived pages
 * @param source Source identifier for the provider
 * @param metadata Additional metadata to include
 * @returns {ArchiveResponse} Standardized ArchiveResponse object
 */
export function createSuccessResponse(
  pages: readonly ArchivedPage[],
  source: string,
  metadata: Readonly<Record<string, unknown>> = {},
): ArchiveResponse {
  return {
    success: true,
    pages: pages.map((page) => ({
      ...page,
      _meta: { ...page._meta, provider: source },
    })),
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

 *
 * @returns {ArchiveResponse} The operation result.
 */
export function createUnsupportedResponse(
  reason: string,
  source: string,
  metadata: Readonly<Record<string, unknown>> = {},
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
 * @returns {ArchiveResponse} Standardized ArchiveResponse error object
 */
export function createErrorResponse(
  error: unknown,
  source: string,
  metadata: Readonly<Record<string, unknown>> = {},
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

 *
 * @param error - Error.
 * @returns {string} The resulting string.
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

 *
 * @returns {ArchiveContentResponse} The operation result.
 */
export function createContentResponse(
  content: ArchivedContent,
  source: string,
  metadata: Readonly<Record<string, unknown>> = {},
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

 *
 * @returns {ArchiveContentResponse} The operation result.
 */
export function createUnsupportedContentResponse(
  reason: string,
  source: string,
  metadata: Readonly<Record<string, unknown>> = {},
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

 *
 * @returns {ArchiveContentResponse} The operation result.
 */
export function createContentErrorResponse(
  error: unknown,
  source: string,
  metadata: Readonly<Record<string, unknown>> = {},
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

function requestLabel(request: unknown): string {
  if (typeof request === "string") return request;
  if (typeof request === "object" && request !== null && "url" in request) {
    return typeof request.url === "string" ? request.url : "<request>";
  }
  return "<request>";
}

/**
 * Creates common fetch options with standard defaults
 * @param baseURL Base URL for the API
 * @param params Query parameters
 * @param options Additional options
 * @returns {Promise<FetchOptions>} FetchOptions object
 */
export async function createFetchOptions(
  baseURL: string,
  params: Readonly<Record<string, unknown>> = {},
  options: FetchOptions & ArchiveOptions = {},
): Promise<FetchOptions> {
  const config = await getConfig();

  return {
    method: "GET",
    baseURL,
    params,
    retry: options.retries ?? config.performance.retries,
    timeout: options.timeout ?? config.performance.timeout,
    signal: options.signal,
    retryDelay: 300, // Add delay between retries
    retryStatusCodes: [408, 409, 425, 429, 500, 502, 503, 504], // Standard retry status codes
    onResponseError: ({ request, response, options }) => {
      consola.error(
        `[fetch error] ${options.method} ${requestLabel(request)} failed with status ${response.status}`,
      );
    },
    ...options,
    headers: withUserAgent(
      options.headers as Readonly<Record<string, string>> | Headers | undefined,
    ),
  };
}

/** How every request introduces itself; the Wayback CDX API answers 400 to a request without one. */
export const USER_AGENT = `@agntn/archives/${version} (+https://github.com/agntn/archives)`;

/**
 * Adds the package User-Agent to a header set unless the caller chose one.
 *
 * Node and browsers send a default User-Agent; Cloudflare Workers and other
 * fetch runtimes send none, and some archives refuse such requests outright.
 * Caller keys keep their spelling, so a provider's `Authorization` stays as written.
 *
 * @param headers - Headers the caller already set
 * @returns {Record<string, string>} The same headers with a User-Agent guaranteed
 */
export function withUserAgent(
  headers?: Readonly<Record<string, string>> | Headers,
): Record<string, string> {
  const merged: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      merged[key] = value;
    });
  } else if (headers) {
    Object.assign(merged, headers);
  }
  if (!Object.keys(merged).some((key) => key.toLowerCase() === "user-agent")) {
    merged["user-agent"] = USER_AGENT;
  }
  return merged;
}

/**
 * Merges initial options with request options, preferring request options
 * @param initOptions Initial options provided during provider creation
 * @param reqOptions Request-specific options
 * @returns {Promise<T>} Merged options object
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
 * @returns {Promise<ArchivedPage[]>} Array of ArchivedPage objects.
 */
export async function mapCdxRows(
  dataRows: readonly (readonly string[])[],
  snapshotBaseUrl: string,
  providerSlug = "wayback",
  options: Readonly<ArchiveOptions> = {},
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
  function rowToArchivedPage([rawUrl, rawTimestamp, rawStatus]: readonly string[]):
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
