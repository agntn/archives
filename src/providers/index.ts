import type { ArchiveOptions, ArchiveProvider } from "../types";
import type {
  WaybackOptions,
  ArchiveItOptions,
  ConiferOptions,
  ArchiveTodayOptions,
  MementoOptions,
  PermaccOptions,
  CommonCrawlOptions,
  WebCiteOptions,
} from "../_providers";
import { createRetryableLazyImport } from "./_lazy-import";

const loadWaybackModule = createRetryableLazyImport(() => import("./wayback"));
const loadArchiveItModule = createRetryableLazyImport(() => import("./archive-it"));
const loadConiferModule = createRetryableLazyImport(() => import("./conifer"));
const loadArchiveTodayModule = createRetryableLazyImport(() => import("./archive-today"));
const loadMementoModule = createRetryableLazyImport(() => import("./memento"));
const loadPermaccModule = createRetryableLazyImport(() => import("./permacc"));
const loadCommonCrawlModule = createRetryableLazyImport(() => import("./commoncrawl"));
const loadWebCiteModule = createRetryableLazyImport(() => import("./webcite"));

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
    const { WaybackProvider } = await loadWaybackModule();
    return new WaybackProvider(options);
  },

  /**
   * Creates an Archive-It provider for one collection.
   * @param options - Configuration including the required Archive-It collection ID
   * @returns The Archive-It provider
   * @example
   * ```js
   * const archiveItProvider = providers.archiveIt({ collection: 4399 })
   * ```
   */
  async archiveIt(options: ArchiveItOptions): Promise<ArchiveProvider> {
    const { ArchiveItProvider } = await loadArchiveItModule();
    return new ArchiveItProvider(options);
  },

  /**
   * Creates a Conifer provider for one existing public collection.
   * @param options - Configuration including the required user and collection slugs
   * @returns The Conifer provider
   * @example
   * ```js
   * const coniferProvider = providers.conifer({ user: 'imamuseum', collection: 'imamuseumorg' })
   * ```
   */
  async conifer(options: ConiferOptions): Promise<ArchiveProvider> {
    const { ConiferProvider } = await loadConiferModule();
    return new ConiferProvider(options);
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
    const { ArchiveTodayProvider } = await loadArchiveTodayModule();
    return new ArchiveTodayProvider(options);
  },

  /** Creates a lazily loaded Memento provider that uses MemGator. */
  async memento(options?: MementoOptions): Promise<ArchiveProvider> {
    const { MementoProvider } = await loadMementoModule();
    return new MementoProvider(options);
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
    const { PermaccProvider } = await loadPermaccModule();
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
    const { CommonCrawlProvider } = await loadCommonCrawlModule();
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
    const { WebCiteProvider } = await loadWebCiteModule();
    return new WebCiteProvider(options);
  },

  /**
   * Helper to initialize all commonly used providers at once.
   * Note: Archive-It is excluded because it requires a collection ID; Perma.cc requires an API key.
   * Memento is excluded because it already aggregates many of the same archives.
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
      // Archive-It requires a collection ID; Perma.cc requires an API key.
    ]);
  },
};

// Export provider types
export type * from "../_providers";
