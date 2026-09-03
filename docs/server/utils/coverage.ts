import { snapshotArchives } from "@agntn/archives/tool-operations";
import type { ArchivedPage } from "@agntn/archives";
import { hash } from "ohash";

/** Providers that can list a domain without a collection, a user, or a key. */
export const COVERAGE_PROVIDERS = [
  "wayback",
  "arquivo",
  "webarchiv",
  "archiveToday",
  "commoncrawl",
  "memento",
  "webcite",
] as const;

export type CoverageState = "ok" | "empty" | "unsupported" | "failed";

export interface ProviderCoverage {
  provider: (typeof COVERAGE_PROVIDERS)[number];
  state: CoverageState;
  count: number;
  first?: string;
  last?: string;
  /** Captures per calendar year, from the listings this call could afford. */
  years: Record<string, number>;
  reason?: string;
  ms: number;
  /** Newest pages, enough to open the viewer straight from the dashboard. */
  sample: ArchivedPage[];
}

export interface Coverage {
  target: string;
  providers: ProviderCoverage[];
  fetchedAt: string;
}

const LIMIT = 100;
const TIMEOUT = 45_000;

function yearsOf(pages: readonly ArchivedPage[]): Record<string, number> {
  const years: Record<string, number> = {};
  for (const page of pages) {
    const year = page.timestamp.slice(0, 4);
    years[year] = (years[year] ?? 0) + 1;
  }
  return years;
}

async function listing(
  target: string,
  provider: ProviderCoverage["provider"],
  signal?: Readonly<AbortSignal>,
  extra: Readonly<Record<string, string>> = {},
) {
  return snapshotArchives({ target, provider, limit: LIMIT, timeout: TIMEOUT, ...extra }, signal);
}

/**
 * What one provider holds for a target.
 *
 * Wayback lists oldest first and collapses to one capture a year by default; a
 * second, recent window is asked for so `last` is the archive's last capture and
 * not the end of the first hundred rows.
 */
async function providerCoverage(
  target: string,
  provider: ProviderCoverage["provider"],
  signal?: Readonly<AbortSignal>,
): Promise<ProviderCoverage> {
  const started = Date.now();
  try {
    const calls = [listing(target, provider, signal)];
    if (provider === "wayback") {
      const recent = String(new Date().getUTCFullYear() - 1);
      calls.push(listing(target, provider, signal, { from: recent, collapse: "timestamp:6" }));
    }
    const settled = await Promise.allSettled(calls);
    const pages = new Map<string, ArchivedPage>();
    let unsupported: string | undefined;
    let failure: string | undefined;
    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        failure = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        continue;
      }
      const response = outcome.value.details.response;
      for (const page of response.pages) {
        pages.set(`${page.timestamp}|${page.url}`, page);
      }
      if (response.unsupported) {
        unsupported = response.unsupportedReason;
      } else if (!response.success && response.error) {
        failure = response.error;
      }
    }
    const list = [...pages.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const ms = Date.now() - started;
    if (list.length > 0) {
      return {
        provider,
        state: "ok",
        count: list.length,
        first: list[0]!.timestamp,
        last: list.at(-1)!.timestamp,
        years: yearsOf(list),
        ms,
        sample: list.slice(-5).reverse(),
      };
    }
    if (unsupported) {
      return { provider, state: "unsupported", count: 0, years: {}, reason: unsupported, ms, sample: [] };
    }
    if (failure) {
      return { provider, state: "failed", count: 0, years: {}, reason: failure, ms, sample: [] };
    }
    return { provider, state: "empty", count: 0, years: {}, ms, sample: [] };
  } catch (error) {
    return {
      provider,
      state: "failed",
      count: 0,
      years: {},
      reason: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
      sample: [],
    };
  }
}

const CACHE_SECONDS = 60 * 60 * 6;

interface CachedProviderCoverage {
  readonly value: ProviderCoverage;
  readonly expires: number;
}

function abortError(signal: Readonly<AbortSignal>): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The archive request was aborted", "AbortError");
}

/** Keeps cancellation local to each cache miss and stores only complete provider results. */
async function cachedProviderCoverage(
  target: string,
  provider: ProviderCoverage["provider"],
  signal?: Readonly<AbortSignal>,
): Promise<ProviderCoverage> {
  if (signal?.aborted) throw abortError(signal);
  const storage = useStorage("cache");
  const key = `docs:coverage:${provider}:${hash(target)}`;
  const cached = await storage.getItem<CachedProviderCoverage>(key).catch(() => null);
  if (signal?.aborted) throw abortError(signal);
  if (cached && cached.expires > Date.now()) return cached.value;

  const value = await providerCoverage(target, provider, signal);
  if (signal?.aborted) throw abortError(signal);
  if (value.state === "failed") throw new Error(value.reason ?? `${provider} failed`);
  await storage
    .setItem(key, { value, expires: Date.now() + CACHE_SECONDS * 1000 }, { ttl: CACHE_SECONDS })
    .catch(() => undefined);
  return value;
}

/** Coverage of one target across every provider that can answer unaided; shared with the warm up task. */
export async function coverage(target: string, signal?: Readonly<AbortSignal>): Promise<Coverage> {
  const settled = await Promise.allSettled(
    COVERAGE_PROVIDERS.map((provider) => cachedProviderCoverage(target, provider, signal)),
  );
  if (signal?.aborted) throw abortError(signal);
  const providers = settled.map((outcome, index): ProviderCoverage => {
    const provider = COVERAGE_PROVIDERS[index]!;
    if (outcome.status === "fulfilled") {
      return outcome.value;
    }
    return {
      provider,
      state: "failed",
      count: 0,
      years: {},
      reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      ms: 0,
      sample: [],
    };
  });
  return { target, providers, fetchedAt: new Date().toISOString() };
}
