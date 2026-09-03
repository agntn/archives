import { snapshotArchives } from "@agntn/archives/tool-operations";
import type { ArchivedPage } from "@agntn/archives";

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
const TIMEOUT = 25_000;

function yearsOf(pages: readonly ArchivedPage[]): Record<string, number> {
  const years: Record<string, number> = {};
  for (const page of pages) {
    const year = page.timestamp.slice(0, 4);
    years[year] = (years[year] ?? 0) + 1;
  }
  return years;
}

async function listing(target: string, provider: ProviderCoverage["provider"], extra: Record<string, string> = {}) {
  return snapshotArchives({ target, provider, limit: LIMIT, timeout: TIMEOUT, ...extra });
}

/**
 * What one provider holds for a target.
 *
 * Wayback lists oldest first and collapses to one capture a year by default; a
 * second, recent window is asked for so `last` is the archive's last capture and
 * not the end of the first hundred rows.
 */
async function providerCoverage(target: string, provider: ProviderCoverage["provider"]): Promise<ProviderCoverage> {
  const started = Date.now();
  try {
    const calls = [listing(target, provider)];
    if (provider === "wayback") {
      const recent = String(new Date().getUTCFullYear() - 1);
      calls.push(listing(target, provider, { from: recent, collapse: "timestamp:6" }));
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

/** Coverage of one target across every provider that can answer unaided; cached for six hours, shared with the warm-up task. */
export const coverage = defineCachedFunction(
  async (target: string): Promise<Coverage> => {
    const providers = await Promise.all(COVERAGE_PROVIDERS.map((provider) => providerCoverage(target, provider)));
    return { target, providers, fetchedAt: new Date().toISOString() };
  },
  {
    name: "coverage",
    maxAge: 60 * 60 * 6,
    swr: true,
    getKey: (target: string) => target.toLowerCase(),
  },
);
