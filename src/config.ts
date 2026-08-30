import { loadConfig } from "c12";
import type { Driver } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";

/**
 * Configuration options for Archives
 */
export interface ArchivesConfig {
  // Storage configuration
  storage: {
    // Storage driver to use (default: memoryDriver)
    driver?: Driver;
    // Enable caching of responses (default: true)
    cache?: boolean;
    // TTL in milliseconds (default: 7 days)
    ttl?: number;
    // Prefix for storage keys (default: 'archives')
    prefix?: string;
  };

  // Performance options
  performance: {
    // Max concurrent requests (default: 3)
    concurrency?: number;
    // Items per batch (default: 20)
    batchSize?: number;
    // Request timeout in ms (default: 10000)
    timeout?: number;
    // Number of retries (default: 1)
    retries?: number;
  };

  // Environment-specific configurations
  $env?: Record<string, ArchivesConfig>;
  $development?: ArchivesConfig;
  $production?: ArchivesConfig;
  $test?: ArchivesConfig;
}

// Default configuration
const getDefaultConfig = () =>
  ({
    storage: {
      driver: memoryDriver(),
      cache: true,
      ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
      prefix: "archives",
    },
    performance: {
      concurrency: 3,
      batchSize: 20,
      timeout: 10000,
      retries: 1,
    },
  }) as ArchivesConfig;

type ConfigLayer = Readonly<{
  storage?: Readonly<ArchivesConfig["storage"]>;
  performance?: Readonly<ArchivesConfig["performance"]>;
  $env?: Readonly<Record<string, ConfigLayer>>;
  $development?: ConfigLayer;
  $production?: ConfigLayer;
  $test?: ConfigLayer;
}>;

type ResolveConfigOptions = Readonly<{
  cwd?: string;
  defaults?: ConfigLayer;
  overrides?: ConfigLayer;
  envName?: string | false;
  configFile?: string;
  rcFile?: string;
}>;

// Cache for resolved config
let cachedConfig: ArchivesConfig | undefined;

// Directory c12 searches when a caller does not pass its own `cwd`.
let configCwd: string | undefined;

/**
 * Pins config discovery to `cwd` for every later call that passes none.
 *
 * A long-lived server is started by whoever spawns it, in whatever directory
 * that caller happens to be in. Leaving discovery on `process.cwd()` there means
 * the first request executes an `archives.config.ts` belonging to a checkout the
 * server never chose. Library consumers are unaffected: without this call the
 * default stays `process.cwd()`.
 *
 * @param cwd - Directory to resolve `archives.config.ts`, `.archives` and `package.json` from
 */
export function setConfigCwd(cwd: string): void {
  configCwd = cwd;
  cachedConfig = undefined;
}

/**
 * Load Archives configuration from all available sources

 *
 * @param options - Options.
 * @returns {Promise<ArchivesConfig>} A promise resolving to the operation result.
 */
export async function resolveConfig(options: ResolveConfigOptions = {}): Promise<ArchivesConfig> {
  const shouldCache = Object.values(options).every((value) => value === undefined);
  if (shouldCache && cachedConfig) {
    return cachedConfig;
  }

  const defaults = getDefaultConfig();

  // Load config using c12
  const { config } = await loadArchivesConfig(options, defaults);

  // Apply post-processing
  const resolvedConfig = await postProcessConfig(config as ArchivesConfig, defaults);

  if (shouldCache) {
    cachedConfig = resolvedConfig;
  }

  return resolvedConfig;
}

async function loadArchivesConfig(options: ResolveConfigOptions, defaults: ArchivesConfig) {
  return loadConfig({
    name: "archives",
    defaults,
    defaultConfig: options.defaults ?? undefined,
    overrides: options.overrides ?? undefined,
    envName: options.envName ?? process.env.NODE_ENV,
    cwd: options.cwd ?? configCwd,
    configFile: options.configFile,
    rcFile: options.rcFile ?? ".archives",
    packageJson: true,
  });
}

/*
 * Apply additional configuration processing and validation
 */
async function postProcessConfig(
  config: ArchivesConfig,
  defaults: ArchivesConfig,
): Promise<ArchivesConfig> {
  const storage = {
    ...defaults.storage,
    ...config.storage,
    driver: config.storage?.driver ?? defaults.storage.driver ?? memoryDriver(),
    prefix: config.storage?.prefix || defaults.storage.prefix,
  };

  return {
    ...config,
    storage,
    performance: { ...defaults.performance, ...config.performance },
  };
}

/**
 * Reset the cached configuration
 */
export function resetConfig(): void {
  cachedConfig = undefined;
}

/**
 * Get the current configuration or resolve it if not already loaded

 *
 * @param options - Options.
 * @returns {Promise<ArchivesConfig>} A promise resolving to the operation result.
 */
export async function getConfig(options?: ResolveConfigOptions): Promise<ArchivesConfig> {
  return resolveConfig(options);
}
