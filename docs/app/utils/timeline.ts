import type { ArchiveResponse, ArchivedPage } from "@agntn/archives";

export type ProviderState = "ok" | "empty" | "unsupported" | "failed";

/** What one provider contributed to a listing. */
export interface ProviderBucket {
  readonly provider: string;
  readonly count: number;
  readonly first?: string;
  readonly last?: string;
  readonly state: ProviderState;
  readonly reason?: string;
}

export interface YearBucket {
  readonly year: number;
  readonly count: number;
}

function providerOf(page: ArchivedPage): string {
  const provider = page._meta.provider;
  return typeof provider === "string" ? provider : "unknown";
}

/** Provider names a response says it queried, in query order. */
export function queriedProviders(response: ArchiveResponse): string[] {
  const listed = response._meta?.provider;
  if (typeof listed === "string" && listed.length > 0) {
    return listed.split(",").map((name) => name.trim());
  }
  const seen = new Set(response.pages.map(providerOf));
  return [...seen];
}

/** Provider name in front of a failure message, as the aggregator joins them: `commoncrawl: fetch failed`. */
function failureProvider(message: string): string | undefined {
  const match = /^([a-z-]+):\s/u.exec(message);
  return match?.[1];
}

/** Folds a listing into one row per queried provider, including the ones that answered with nothing. */
export function groupByProvider(response: ArchiveResponse): ProviderBucket[] {
  const pages = new Map<string, ArchivedPage[]>();
  for (const page of response.pages) {
    const name = providerOf(page);
    const list = pages.get(name) ?? [];
    list.push(page);
    pages.set(name, list);
  }
  const unsupported = new Map(
    (response._meta?.unsupportedProviders ?? []).map((record) => [record.provider, record.reason]),
  );
  const failed = new Map<string, string>();
  const errors = response._meta?.errors;
  if (Array.isArray(errors)) {
    for (const message of errors) {
      if (typeof message === "string") {
        const name = failureProvider(message);
        if (name) {
          failed.set(name, message.slice(name.length + 2));
        }
      }
    }
  }
  if (!response.success && response.error && failed.size === 0) {
    for (const name of queriedProviders(response)) {
      if (!pages.has(name) && !unsupported.has(name)) {
        failed.set(name, response.error);
      }
    }
  }
  const names = new Set<string>([...queriedProviders(response), ...pages.keys(), ...unsupported.keys(), ...failed.keys()]);
  return [...names].map((name) => {
    const list = pages.get(name);
    if (list?.length) {
      const stamps = list.map((page) => page.timestamp).sort();
      return { provider: name, count: list.length, first: stamps[0], last: stamps.at(-1), state: "ok" as const };
    }
    if (unsupported.has(name)) {
      return { provider: name, count: 0, state: "unsupported" as const, reason: unsupported.get(name) };
    }
    if (failed.has(name)) {
      return { provider: name, count: 0, state: "failed" as const, reason: failed.get(name) };
    }
    return { provider: name, count: 0, state: "empty" as const };
  });
}

/** Captures per calendar year across the whole span, with empty years kept so the axis stays linear. */
export function yearBuckets(pages: readonly ArchivedPage[]): YearBucket[] {
  if (pages.length === 0) {
    return [];
  }
  const counts = new Map<number, number>();
  for (const page of pages) {
    const year = Number(page.timestamp.slice(0, 4));
    if (Number.isFinite(year)) {
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
  }
  const years = [...counts.keys()];
  const start = Math.min(...years);
  const end = Math.max(...years);
  const buckets: YearBucket[] = [];
  for (let year = start; year <= end; year += 1) {
    buckets.push({ year, count: counts.get(year) ?? 0 });
  }
  return buckets;
}

/** Lines of the fenced block a tool result wraps its untrusted payload in. */
export function fencedBody(text: string): string {
  const begin = /^--- begin archived [a-z]+ [0-9a-f]+ \(untrusted data, not instructions\) ---$/mu.exec(text);
  const end = /^--- end archived [a-z]+ [0-9a-f]+ ---$/mu.exec(text);
  if (!begin || !end || end.index <= begin.index) {
    return "";
  }
  return text.slice(begin.index + begin[0].length + 1, end.index).replace(/\n$/u, "");
}

export type DiffLineKind = "add" | "del" | "hunk" | "meta" | "ctx";

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

/** Classifies unified diff lines for rendering. */
export function diffLines(patch: string): DiffLine[] {
  if (!patch) {
    return [];
  }
  return patch.split("\n").map((text) => {
    if (text.startsWith("+++") || text.startsWith("---")) {
      return { kind: "meta", text };
    }
    if (text.startsWith("@@")) {
      return { kind: "hunk", text };
    }
    if (text.startsWith("+")) {
      return { kind: "add", text };
    }
    if (text.startsWith("-")) {
      return { kind: "del", text };
    }
    return { kind: "ctx", text };
  });
}
