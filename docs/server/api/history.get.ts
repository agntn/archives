import { diffArchives, snapshotArchives } from "@agntn/archives/tool-operations";
import type { ArchivedPage } from "@agntn/archives";

const TTL = 60 * 60 * 6;
const MAX_STEPS = 8;

export interface HistoryStep {
  before: ArchivedPage;
  after: ArchivedPage;
  additions: number;
  deletions: number;
  identical: boolean;
  partial: boolean;
  error?: string;
}

/**
 * How a page changed capture by capture: consecutive pairs from one provider,
 * each compared with the diff executor. Bodies are read at most twice thanks to
 * the library's own content cache, and the pairs run one after another so a
 * throttling archive sees one reader, not eight.
 */
export default defineCachedEventHandler(
  async (event) => {
    const query = getQuery(event);
    const target = requireString(query, "target", LIMITS.target);
    const provider = readString(query, "provider", LIMITS.parameter) ?? "wayback";
    const limit = readInt(query, "limit", 2, MAX_STEPS + 1) ?? 6;
    const from = readString(query, "from", LIMITS.parameter);
    const to = readString(query, "to", LIMITS.parameter);
    try {
      const listing = await snapshotArchives({ target, provider, limit, from, to, timeout: LIMITS.timeout });
      // The archive's prefix listing also brings neighbours and URL variants; a history follows one resource.
      const seen = new Set<string>();
      const pages = [...listing.details.response.pages]
        .filter((page) => sameResource(page.url, target))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .filter((page) => {
          if (seen.has(page.timestamp)) {
            return false;
          }
          seen.add(page.timestamp);
          return true;
        });
      const steps: HistoryStep[] = [];
      for (let index = 1; index < pages.length; index += 1) {
        const before = pages[index - 1]!;
        const after = pages[index]!;
        try {
          const diff = await diffArchives({
            target,
            provider,
            before: before.timestamp,
            after: after.timestamp,
            format: "text",
            context: 0,
            maxChars: 200,
            timeout: LIMITS.bodyTimeout,
          });
          const result = diff.details.result;
          steps.push({
            before,
            after,
            additions: result?.additions ?? 0,
            deletions: result?.deletions ?? 0,
            identical: result?.identical ?? false,
            partial: result?.partial ?? false,
            error: diff.details.success ? undefined : diff.content[0]?.text.split("\n").at(-1),
          });
        } catch (error) {
          steps.push({
            before,
            after,
            additions: 0,
            deletions: 0,
            identical: false,
            partial: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      markPublic(event, TTL);
      return { target, provider, pages, steps, text: listing.content[0]?.text ?? "", fetchedAt: new Date().toISOString() };
    } catch (error) {
      return toHttpError(error);
    }
  },
  {
    maxAge: TTL,
    swr: true,
    getKey: (event) => {
      const query = getQuery(event);
      return cacheKey("history", {
        target: readString(query, "target", LIMITS.target),
        provider: readString(query, "provider", LIMITS.parameter) ?? "wayback",
        limit: readInt(query, "limit", 2, MAX_STEPS + 1) ?? 6,
        from: readString(query, "from", LIMITS.parameter),
        to: readString(query, "to", LIMITS.parameter),
      });
    },
  },
);
