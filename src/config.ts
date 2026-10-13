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

export type ConfigLayer = Readonly<{
  storage?: Readonly<ArchivesConfig["storage"]>;
  performance?: Readonly<ArchivesConfig["performance"]>;
  $env?: Readonly<Record<string, ConfigLayer>>;
  $development?: ConfigLayer;
  $production?: ConfigLayer;
  $test?: ConfigLayer;
}>;

export type ResolveConfigOptions = Readonly<{
  cwd?: string;
  defaults?: ConfigLayer;
  overrides?: ConfigLayer;
  envName?: string | false;
  configFile?: string;
  rcFile?: string;
}>;

// Cache for resolved config
let cachedConfig: ArchivesConfig | undefined;

/** Bumped on every cache change, so a discovery that started earlier can't overwrite it. */
let configGeneration = 0;

/**
 * Replaces the cached config.
 *
 * @param config - The new config, or `undefined` to discover again
 */
function replaceCachedConfig(config?: ArchivesConfig): void {
  configGeneration += 1;
  cachedConfig = config;
}

// Directory c12 searches when a caller does not pass its own `cwd`.
let configCwd: string | undefined;

type Discovery = typeof import("#config-discovery");

let discovery: Promise<Discovery> | undefined;

/**
 * Tells a loaded discovery module from anything else a computed import can return.
 *
 * @param value - The imported module
 * @returns {boolean} Whether it has `discoverConfig`
 */
function isDiscovery(value: unknown): value is Discovery {
  return typeof value === "object" && value !== null && "discoverConfig" in value;
}

/**
 * `#config-discovery` maps into `dist/`, so `src/` run straight from Node imports its sibling.
 *
 * @returns {Promise<Discovery>} The discovery module
 */
async function importDiscovery(): Promise<Discovery> {
  if (!import.meta.url.endsWith(".ts")) return import("#config-discovery");
  const module: unknown = await import(
    import.meta.url.replace(/config\.ts$/u, "config-discovery.ts")
  );
  if (!isDiscovery(module)) throw new TypeError("config-discovery.ts has no discoverConfig");
  return module;
}

/**
 * Loads discovery once: c12 under Node, a version with no disk access under `browser` or `workerd`.
 *
 * @returns {Promise<Discovery>} The discovery module
 */
function loadDiscovery(): Promise<Discovery> {
  discovery ??= importDiscovery().catch((error: unknown) => {
    discovery = undefined;
    throw error;
  });
  return discovery;
}

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
  replaceCachedConfig();
}

/**
 * Uses `config` instead of config files until `resetConfig()` or `setConfigCwd()`.
 *
 * @param config - Storage and performance settings over the defaults, without `$env` layers
 * @returns {ArchivesConfig} The config every later `getConfig()` returns
 */
export function setConfig(
  config: Pick<ConfigLayer, "storage" | "performance"> = {},
): ArchivesConfig {
  const settings = { storage: { ...config.storage }, performance: { ...config.performance } };
  const resolved = postProcessConfig(settings, getDefaultConfig());
  replaceCachedConfig(resolved);
  return resolved;
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

  const generation = configGeneration;
  const defaults = getDefaultConfig();

  const { discoverConfig } = await loadDiscovery();
  const config = await discoverConfig({ ...options, cwd: options.cwd ?? configCwd }, defaults);

  // Apply post-processing
  const resolvedConfig = postProcessConfig(config, defaults);

  if (shouldCache && generation === configGeneration) {
    cachedConfig = resolvedConfig;
  }

  return resolvedConfig;
}

/*
 * Apply additional configuration processing and validation
 */
function postProcessConfig(config: ArchivesConfig, defaults: ArchivesConfig): ArchivesConfig {
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
  replaceCachedConfig();
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
