import { createStorage, type Storage, type Driver } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { consola } from "consola";
import type { ArchiveOptions, ArchiveResponse } from "./types";
import { getConfig } from "./config";

export const storage: Storage = createStorage({
  driver: memoryDriver(),
});

let storagePrefix = "archives";
let storageInitialized = false;

interface StoredArchiveResponse {
  response: ArchiveResponse;
  expiresAt?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArchiveResponse(value: unknown): value is ArchiveResponse {
  return isRecord(value) && typeof value.success === "boolean" && Array.isArray(value.pages);
}

function isStoredArchiveResponse(value: unknown): value is StoredArchiveResponse {
  return isRecord(value) && isArchiveResponse(value.response);
}

interface CacheKeyProvider {
  name: string;
  slug?: string;
  cacheKey?: (options?: ArchiveOptions) => string | undefined;
}

function getExpiresAt(ttl: ArchiveOptions["ttl"]): number | undefined {
  if (typeof ttl !== "number" || !Number.isFinite(ttl)) {
    return undefined;
  }

  return Date.now() + Math.max(0, ttl);
}

function getCacheKeyParts(provider: CacheKeyProvider, options?: ArchiveOptions): string[] {
  const parts: string[] = [];

  if (options?.limit !== undefined) parts.push(`limit=${options.limit}`);

  const providerKey = provider.cacheKey?.(options);
  if (providerKey) parts.push(providerKey);

  return parts;
}

/**
 * Initialize storage with configuration values
 * This is called internally when needed
 */
export async function initStorage(): Promise<void> {
  const config = await getConfig();

  if (config.storage.driver) {
    Object.assign(
      storage,
      createStorage({
        driver: config.storage.driver,
      }),
    );
  }

  if (config.storage.prefix) {
    storagePrefix = config.storage.prefix;
  }

  storageInitialized = true;
}

/**
 * Generate a storage key for a domain request
 */
export function generateStorageKey(
  provider: CacheKeyProvider,
  domain: string,
  options?: ArchiveOptions,
): string {
  const providerKey = provider.slug ?? provider.name;
  const keyParts = [providerKey, domain, ...getCacheKeyParts(provider, options)];

  return `${storagePrefix}:${JSON.stringify(keyParts)}`;
}

/**
 * Get stored response if available
 */
export async function getStoredResponse(
  provider: CacheKeyProvider,
  domain: string,
  options?: ArchiveOptions,
): Promise<ArchiveResponse | undefined> {
  if (options?.cache === false) {
    return undefined;
  }

  if (!storageInitialized) {
    await initStorage();
  }

  const key = generateStorageKey(provider, domain, options);

  try {
    const cachedData = await storage.getItem(key);
    if (!cachedData) return undefined;

    const parsedData = typeof cachedData === "string" ? JSON.parse(cachedData) : cachedData;

    if (isArchiveResponse(parsedData)) {
      return {
        ...parsedData,
        fromCache: true,
      };
    }

    if (!isStoredArchiveResponse(parsedData)) return undefined;

    if (parsedData.expiresAt !== undefined && parsedData.expiresAt <= Date.now()) {
      await storage.removeItem(key);
      return undefined;
    }

    return {
      ...parsedData.response,
      fromCache: true,
    };
  } catch (error) {
    consola.error(`Storage read/parse error for ${key}:`, error);
  }

  return undefined;
}

/**
 * Store response in storage
 */
export async function storeResponse(
  provider: CacheKeyProvider,
  domain: string,
  response: ArchiveResponse,
  options?: ArchiveOptions,
): Promise<void> {
  // Skip caching when caching is opted out or the response is not a success.
  // The success filter naturally excludes both runtime errors and unsupported
  // operations, which the providers signal via success=false.
  if (options?.cache === false || !response.success) {
    return;
  }

  if (!storageInitialized) {
    await initStorage();
  }

  const key = generateStorageKey(provider, domain, options);

  try {
    const { fromCache: _fromCache, ...storableResponse } = response;
    const storedResponse: StoredArchiveResponse = {
      response: storableResponse,
      expiresAt: getExpiresAt(options?.ttl),
    };

    await storage.setItem(key, JSON.stringify(storedResponse));
  } catch (error) {
    consola.error(`Storage write error for ${key}:`, error);
  }
}

/**
 * Clear stored responses for a specific provider
 */
export async function clearProviderStorage(
  provider: string | { name: string; slug?: string },
): Promise<void> {
  try {
    if (!storageInitialized) {
      await initStorage();
    }

    const providerKey = typeof provider === "string" ? provider : (provider.slug ?? provider.name);
    const providerPrefix = `${storagePrefix}:[${JSON.stringify(providerKey)},`;
    const keys = await storage.getKeys();

    for (const key of keys) {
      if (key.startsWith(providerPrefix)) {
        await storage.removeItem(key);
      }
    }
  } catch (error) {
    const providerName = typeof provider === "string" ? provider : provider.name;
    consola.error(`Failed to clear storage for provider ${providerName}:`, error);
  }
}

/**
 * Configure storage options and driver
 * @deprecated Use config file or options passed to createArchive instead
 */
export async function configureStorage(
  options: {
    driver?: Driver;
    ttl?: number;
    cache?: boolean;
    prefix?: string;
  } = {},
): Promise<void> {
  const config = await getConfig();

  if (options.driver) {
    config.storage.driver = options.driver;
  }

  if (options.ttl !== undefined) {
    config.storage.ttl = options.ttl;
  }

  if (options.cache !== undefined) {
    config.storage.cache = options.cache;
  }

  if (options.prefix !== undefined) {
    storagePrefix = options.prefix;
  }

  if (options.driver) {
    Object.assign(
      storage,
      createStorage({
        driver: options.driver,
      }),
    );
  }

  storageInitialized = true;
}
