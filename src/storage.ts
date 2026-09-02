import { createStorage, type Storage, type Driver } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { consola } from "consola";
import { digest } from "ohash/crypto";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
} from "./types";
import { getConfig } from "./config";

export const storage: Storage = createStorage({
  driver: memoryDriver(),
});

let storagePrefix = "archives";
let storageInitialized = false;

function serializeStorageKey(providerKey: string, parts: readonly string[]): string {
  return `${storagePrefix}:${digest(providerKey)}:${digest(JSON.stringify(parts))}`;
}

type StorageConfigOptions = Readonly<{
  driver?: Driver;
  ttl?: number;
  cache?: boolean;
  prefix?: string;
}>;

interface StoredArchiveResponse {
  response: ArchiveResponse;
  expiresAt?: number;
}

interface StoredArchiveContent {
  response: ArchiveContentResponse;
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

// Only successful reads are stored, so an entry that does not say so is corrupt
// or written by an older version, and the provider is the better answer.
function isStoredArchiveContent(value: unknown): value is StoredArchiveContent {
  return (
    isRecord(value) &&
    isRecord(value.response) &&
    value.response.success === true &&
    isRecord(value.response.content) &&
    typeof value.response.content.content === "string"
  );
}

function isExpired(expiresAt: number | undefined): boolean {
  return expiresAt !== undefined && expiresAt <= Date.now();
}

interface CacheKeyProvider {
  name: string;
  slug?: string;
  cacheKey?: (options?: Readonly<ArchiveOptions>) => string | undefined;
}

function getExpiresAt(ttl: ArchiveOptions["ttl"]): number | undefined {
  if (typeof ttl !== "number" || !Number.isFinite(ttl)) {
    return undefined;
  }

  return Date.now() + Math.max(0, ttl);
}

/*
 * Option-derived parts of one listing cache key.
 *
 * The window bounds belong here: a windowed fetch is served with the provider's
 * limit lifted, so its stored response has a different shape than a naturally
 * capped one under the same provider and domain, and the bounds keep the two
 * entries apart.
 */
function getCacheKeyParts(
  provider: Readonly<CacheKeyProvider>,
  options?: Readonly<ArchiveOptions>,
): string[] {
  const parts: string[] = [];

  if (options?.limit !== undefined) parts.push(`limit=${options.limit}`);
  if (options?.from !== undefined) parts.push(`from=${encodeURIComponent(options.from)}`);
  if (options?.to !== undefined) parts.push(`to=${encodeURIComponent(options.to)}`);

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

 *
 * @param provider - Provider.
 * @param domain - Domain.
 * @param options - Options.
 * @returns {string} The resulting string.
 */
export function generateStorageKey(
  provider: Readonly<CacheKeyProvider>,
  domain: string,
  options?: Readonly<ArchiveOptions>,
): string {
  const providerKey = provider.slug ?? provider.name;
  const keyParts = [providerKey, domain, ...getCacheKeyParts(provider, options)];

  return serializeStorageKey(providerKey, keyParts);
}

async function restoreStoredResponse(
  key: string,
  cachedData: unknown,
): Promise<ArchiveResponse | undefined> {
  const parsedData: unknown = typeof cachedData === "string" ? JSON.parse(cachedData) : cachedData;
  if (isArchiveResponse(parsedData)) return { ...parsedData, fromCache: true };
  if (!isStoredArchiveResponse(parsedData)) return undefined;
  if (isExpired(parsedData.expiresAt)) {
    await storage.removeItem(key);
    return undefined;
  }
  return { ...parsedData.response, fromCache: true };
}

/**
 * Get stored response if available

 *
 * @param provider - Provider.
 * @param domain - Domain.
 * @param options - Options.
 * @returns {Promise<ArchiveResponse | undefined>} A promise resolving to the operation result.
 */
export async function getStoredResponse(
  provider: Readonly<CacheKeyProvider>,
  domain: string,
  options?: Readonly<ArchiveOptions>,
): Promise<ArchiveResponse | undefined> {
  if (options?.cache === false) {
    return undefined;
  }

  if (!storageInitialized) {
    await initStorage();
  }

  const key = generateStorageKey(provider, domain, options);

  try {
    const cachedData: unknown = await storage.getItem(key);
    if (!cachedData) return undefined;
    return await restoreStoredResponse(key, cachedData);
  } catch (error) {
    consola.error(`Storage read/parse error for ${key}:`, error);
  }

  return undefined;
}

/**
 * Store response in storage

 *
 * @param provider - Provider.
 * @param domain - Domain.
 * @param response - Response.
 * @param options - Options.
 */
export async function storeResponse(
  provider: Readonly<CacheKeyProvider>,
  domain: string,
  response: ArchiveResponse,
  options?: Readonly<ArchiveOptions>,
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
 * Generate a storage key for one archived body.
 *
 * The `content` segment keeps these entries out of the snapshot listings' key
 * space, and both the requested capture and the byte cap are part of the key:
 * a caller asking for a different capture, or for more of the same one, is
 * asking a different question.

 *
 * @param provider - Provider.
 * @param url - Url.
 * @param options - Options.
 * @returns {string} The resulting string.
 */
export function generateContentStorageKey(
  provider: Readonly<CacheKeyProvider>,
  url: string,
  options?: Readonly<ArchiveContentOptions>,
): string {
  const providerKey = provider.slug ?? provider.name;
  const keyParts = [providerKey, "content", url];

  if (options?.timestamp) keyParts.push(`timestamp=${options.timestamp}`);
  if (options?.maxBytes !== undefined) keyParts.push(`maxBytes=${options.maxBytes}`);

  const providerCacheKey = provider.cacheKey?.(options);
  if (providerCacheKey) keyParts.push(providerCacheKey);

  return serializeStorageKey(providerKey, keyParts);
}

/**
 * Get a stored archived body if one is cached and still fresh

 *
 * @param provider - Provider.
 * @param url - Url.
 * @param options - Options.
 * @returns {Promise<ArchiveContentResponse | undefined>} A promise resolving to the operation result.
 */
export async function getStoredContent(
  provider: Readonly<CacheKeyProvider>,
  url: string,
  options?: Readonly<ArchiveContentOptions>,
): Promise<ArchiveContentResponse | undefined> {
  if (options?.cache === false) {
    return undefined;
  }

  if (!storageInitialized) {
    await initStorage();
  }

  const key = generateContentStorageKey(provider, url, options);

  try {
    const cachedData: unknown = await storage.getItem(key);
    if (!cachedData) return undefined;

    const parsedData: unknown =
      typeof cachedData === "string" ? JSON.parse(cachedData) : cachedData;
    if (!isStoredArchiveContent(parsedData)) return undefined;

    if (isExpired(parsedData.expiresAt)) {
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
 * Store an archived body in storage

 *
 * @param provider - Provider.
 * @param url - Url.
 * @param response - Response.
 * @param options - Options.
 */
export async function storeContent(
  provider: Readonly<CacheKeyProvider>,
  url: string,
  response: ArchiveContentResponse,
  options?: Readonly<ArchiveContentOptions>,
): Promise<void> {
  if (options?.cache === false || !response.success || !response.content) {
    return;
  }

  if (!storageInitialized) {
    await initStorage();
  }

  const key = generateContentStorageKey(provider, url, options);

  try {
    const { fromCache: _fromCache, ...storableResponse } = response;
    const storedResponse: StoredArchiveContent = {
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

 *
 * @param provider - Provider.
 */
export async function clearProviderStorage(
  provider: Readonly<string | { name: string; slug?: string }>,
): Promise<void> {
  try {
    if (!storageInitialized) {
      await initStorage();
    }

    const providerKey = typeof provider === "string" ? provider : (provider.slug ?? provider.name);
    const providerPrefix = `${storagePrefix}:${digest(providerKey)}:`;
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

 *
 * @param options - Options.
 */
export async function configureStorage(options: StorageConfigOptions = {}): Promise<void> {
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
