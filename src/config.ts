import { loadConfig } from "c12";
import type { Driver } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";

/**
 * Configuration options for Omnichron
 */
export interface OmnichronConfig {
  // Storage configuration
  storage: {
    // Storage driver to use (default: memoryDriver)
    driver?: Driver;
    // Enable caching of responses (default: true)
    cache?: boolean;
    // TTL in milliseconds (default: 7 days)
    ttl?: number;
    // Prefix for storage keys (default: 'omnichron')
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
  $env?: Record<string, OmnichronConfig>;
  $development?: OmnichronConfig;
  $production?: OmnichronConfig;
  $test?: OmnichronConfig;
}

// Default configuration
const getDefaultConfig = () =>
  ({
    storage: {
      driver: memoryDriver(),
      cache: true,
      ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
      prefix: "omnichron",
    },
    performance: {
      concurrency: 3,
      batchSize: 20,
      timeout: 10000,
      retries: 1,
    },
  }) as OmnichronConfig;

// Cache for resolved config
let cachedConfig: OmnichronConfig | undefined;

/**
 * Load Omnichron configuration from all available sources
 */
export async function resolveConfig(
  options: {
    cwd?: string;
    defaults?: Partial<OmnichronConfig>;
    overrides?: Partial<OmnichronConfig>;
    envName?: string | false;
    configFile?: string;
    rcFile?: string;
  } = {},
): Promise<OmnichronConfig> {
  const shouldCache = Object.values(options).every((value) => value === undefined);
  if (shouldCache && cachedConfig) {
    return cachedConfig;
  }

  const defaults = getDefaultConfig();

  // Load config using c12
  const { config } = await loadConfig({
    name: "omnichron",
    defaults,
    defaultConfig: options.defaults || undefined,
    overrides: options.overrides || undefined,
    envName: options.envName ?? process.env.NODE_ENV,
    cwd: options.cwd,
    configFile: options.configFile,
    rcFile: options.rcFile === undefined ? ".omnichron" : options.rcFile,
    packageJson: true,
  });

  // Apply post-processing
  const resolvedConfig = await postProcessConfig(config as OmnichronConfig, defaults);

  if (shouldCache) {
    cachedConfig = resolvedConfig;
  }

  return resolvedConfig;
}

/**
 * Apply additional configuration processing and validation
 */
async function postProcessConfig(
  config: OmnichronConfig,
  defaults: OmnichronConfig,
): Promise<OmnichronConfig> {
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
): Promise<OmnichronConfig> {
  return resolveConfig(options);
}
