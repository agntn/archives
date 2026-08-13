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

// Cache for resolved config
let cachedConfig: ArchivesConfig | undefined;

/**
 * Load Archives configuration from all available sources
 */
export async function resolveConfig(
  options: {
    cwd?: string;
    defaults?: Partial<ArchivesConfig>;
    overrides?: Partial<ArchivesConfig>;
    envName?: string | false;
    configFile?: string;
    rcFile?: string;
  } = {},
): Promise<ArchivesConfig> {
  const shouldCache = Object.values(options).every((value) => value === undefined);
  if (shouldCache && cachedConfig) {
    return cachedConfig;
  }

  const defaults = getDefaultConfig();

  // Load config using c12
  const { config } = await loadConfig({
    name: "archives",
    defaults,
    defaultConfig: options.defaults || undefined,
    overrides: options.overrides || undefined,
    envName: options.envName ?? process.env.NODE_ENV,
    cwd: options.cwd,
    configFile: options.configFile,
    rcFile: options.rcFile === undefined ? ".archives" : options.rcFile,
    packageJson: true,
  });

  // Apply post-processing
  const resolvedConfig = await postProcessConfig(config as ArchivesConfig, defaults);

  if (shouldCache) {
    cachedConfig = resolvedConfig;
  }

  return resolvedConfig;
}

/**
 * Apply additional configuration processing and validation
 */
async function postProcessConfig(
  config: ArchivesConfig,
  defaults: ArchivesConfig,
): Promise<ArchivesConfig> {
  // Ensure required properties exist
  if (!config.storage) {
    config.storage = { ...defaults.storage };
  }

  if (!config.performance) {
    config.performance = { ...defaults.performance };
  }

  // Default storage prefix
  if (!config.storage.prefix) {
    config.storage.prefix = defaults.storage.prefix;
  }

  // Default storage driver
  if (!config.storage.driver) {
    config.storage.driver = memoryDriver();
  }

  return config;
}

/**
 * Reset the cached configuration
 */
export function resetConfig(): void {
  cachedConfig = undefined;
}

/**
 * Get the current configuration or resolve it if not already loaded
 */
export async function getConfig(
  options?: Parameters<typeof resolveConfig>[0],
): Promise<ArchivesConfig> {
  return resolveConfig(options);
}
