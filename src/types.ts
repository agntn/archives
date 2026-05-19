export interface ArchiveOptions {
  // Pagination option
  limit?: number; // Maximum number of results to return

  // Caching options
  cache?: boolean; // Enable/disable caching
  ttl?: number; // Cache TTL in milliseconds

  // Performance options
  concurrency?: number; // Maximum number of concurrent requests (default: 3)
  batchSize?: number; // Number of items to process in a single batch (default: 20)
  timeout?: number; // Request timeout in milliseconds (default: 10000)
  retries?: number; // Number of retry attempts for failed requests (default: 1)

  // Provider-specific authentication (can be overridden in provider-specific options)
  apiKey?: string; // Optional API key for providers that require authentication
}

// Base metadata interface with common properties
export interface ArchiveMetadata {
  [key: string]: unknown;
  timestamp?: string; // Original timestamp format from the provider
  status?: number; // HTTP status code of the archived page
}

// Provider-specific metadata definitions
export interface WaybackMetadata extends ArchiveMetadata {
  timestamp: string;
  status: number;
  provider: string;
}

export interface CommonCrawlMetadata extends ArchiveMetadata {
  timestamp: string;
  status: number;
  digest?: string;
  mime?: string;
  length?: string;
  collection: string;
  provider: string;
}

export interface PermaccMetadata extends Omit<ArchiveMetadata, "status"> {
  guid: string;
  title?: string;
  status?: string; // Status for Permacc is string
  created_by?: string;
}

export interface ArchiveTodayMetadata extends ArchiveMetadata {
  hash: string;
  raw_date?: string;
  position?: number;
}

export interface WebCiteMetadata extends ArchiveMetadata {
  requestId: string;
  position?: number;
}

export interface ArchivedPage {
  // Common fields for all providers
  url: string; // Original URL of the page
  timestamp: string; // ISO 8601 date format (YYYY-MM-DDTHH:mm:ss.sssZ)
  snapshot: string; // Direct URL to the archived version

  // Provider-specific metadata with improved typing
  _meta: ArchivedPageMetadata;
}

export interface ArchivedPageMetadata {
  // Common metadata fields
  timestamp?: string;
  status?: number | string;
  provider?: string;
  source?: string;

  // Allow additional provider-specific metadata
  [key: string]: unknown;
}

// Per-provider record surfaced in combined responses when a provider does not
// implement the requested operation.
export interface UnsupportedProviderRecord {
  provider: string;
  reason: string;
}

// Type for response metadata
export interface ResponseMetadata {
  source: string;
  provider: string;
  errorDetails?: unknown;
  errorName?: string;
  queryParams?: Record<string, string>;
  unsupportedProviders?: UnsupportedProviderRecord[];
  [key: string]: unknown;
}

export interface ArchiveResponse {
  success: boolean;
  pages: ArchivedPage[];
  error?: string;

  // Set when the provider does not implement the requested operation
  // (e.g. WebCite has no list-by-domain API).
  unsupported?: boolean;
  unsupportedReason?: string;

  // Provider-specific metadata
  _meta?: ResponseMetadata;

  // Cache info
  fromCache?: boolean;
}

export interface ArchiveProvider {
  name: string;
  slug?: string;
  cacheKey?: (options?: ArchiveOptions) => string | undefined;
  snapshots: (domain: string, options?: ArchiveOptions) => Promise<ArchiveResponse>;
}

/**
 * Interface for Archive instances
 * Defines the public API that all archive implementations must provide
 */
export interface ArchiveInterface {
  // Configuration options
  readonly options?: ArchiveOptions;

  // Core methods
  snapshots(domain: string, options?: ArchiveOptions): Promise<ArchiveResponse>;
  getPages(domain: string, options?: ArchiveOptions): Promise<ArchivedPage[]>;

  // Provider management
  use(provider: ArchiveProvider | Promise<ArchiveProvider>): Promise<ArchiveInterface>;
  useAll(providers: (ArchiveProvider | Promise<ArchiveProvider>)[]): Promise<ArchiveInterface>;
}
