import type { ArchiveOptions, ArchiveProvider } from "../types";
import type {
  WaybackOptions,
  ArchiveTodayOptions,
  PermaccOptions,
  CommonCrawlOptions,
  WebCiteOptions,
} from "../_providers";

/**
 * Provider factory with lazy-loading for optimized tree-shaking.
 * Only loads the providers that are actually used.
 */
export const providers = {
  /**
   * Creates a Wayback Machine provider.
   * @param options - Configuration options for the Wayback Machine provider
   * @returns The Wayback Machine provider
   * @example
   * ```js
   * const waybackProvider = providers.wayback({ limit: 100 })
   * ```
   */
  async wayback(options?: WaybackOptions): Promise<ArchiveProvider> {
    const { WaybackProvider } = await import("./wayback");
    return new WaybackProvider(options);
  },

  /**
   * Creates an Archive.today provider.
   * @param options - Configuration options for the Archive.today provider
   * @returns The Archive.today provider
   * @example
   * ```js
   * const archiveTodayProvider = providers.archiveToday({ timeout: 15000 })
   * ```
   */
  async archiveToday(options?: ArchiveTodayOptions): Promise<ArchiveProvider> {
    const { ArchiveTodayProvider } = await import("./archive-today");
    return new ArchiveTodayProvider(options);
  },

  /**
   * Creates a Perma.cc provider.
   * @param options - Configuration options for the Perma.cc provider (requires apiKey)
   * @returns The Perma.cc provider
   * @example
   * ```js
   * const permaccProvider = providers.permacc({ apiKey: 'your-api-key' })
   * ```
   */
  async permacc(options?: Partial<PermaccOptions>): Promise<ArchiveProvider> {
    const { PermaccProvider } = await import("./permacc");
    return new PermaccProvider(options);
  },

  /**
   * Creates a Common Crawl provider.
   * @param options - Configuration options for the Common Crawl provider
   * @returns The Common Crawl provider
   * @example
   * ```js
   * const commoncrawlProvider = providers.commoncrawl({ collection: 'CC-MAIN-2023-50' })
   * ```
   */
  async commoncrawl(options?: CommonCrawlOptions): Promise<ArchiveProvider> {
    const { CommonCrawlProvider } = await import("./commoncrawl");
    return new CommonCrawlProvider(options);
  },

  /**
   * Creates a WebCite provider.
   * @param options - Configuration options for the WebCite provider
   * @returns The WebCite provider
   * @example
   * ```js
   * const webciteProvider = providers.webcite({ timeout: 10000 })
   * ```
   */
  async webcite(options?: WebCiteOptions): Promise<ArchiveProvider> {
    const { WebCiteProvider } = await import("./webcite");
    return new WebCiteProvider(options);
  },

  /**
   * Helper to initialize all commonly used providers at once.
   * Note: Perma.cc is excluded as it requires an API key.
   * @param options - Common configuration options for all providers
   * @returns An array of all common providers
   * @example
   * ```js
   * const allProviders = providers.all({ timeout: 15000 })
   * const archive = createArchive(allProviders)
   * ```
   */
  async all(options?: ArchiveOptions): Promise<ArchiveProvider[]> {
    return Promise.all([
      this.wayback(options),
      this.archiveToday(options),
      this.commoncrawl(options),
      this.webcite(options),
      // permacc excluded as it requires API key
    ]);
  },
};

// Export provider types
export type * from "../_providers";
