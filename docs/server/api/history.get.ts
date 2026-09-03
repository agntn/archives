import { diffArchives, snapshotArchives } from "@agntn/archives/tool-operations";
import type { ArchivedPage } from "@agntn/archives";

const TTL = 60 * 60 * 6;
const MAX_STEPS = 6;

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
 * each compared with the diff executor. The listing is a prefix search, so it
 * also brings neighbours and URL variants; only the requested resource stays.
 * The pairs run one after another so a throttling archive sees one reader.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const params = {
    target: requireString(query, "target", LIMITS.target),
    provider: readString(query, "provider", LIMITS.parameter) ?? "wayback",
    limit: readInt(query, "limit", 2, MAX_STEPS + 1) ?? 6,
    from: readString(query, "from", LIMITS.parameter),
    to: readString(query, "to", LIMITS.parameter),
  };
  const { target, provider } = params;
  try {
    return await cachedAnswer(event, "history", params, TTL, async () => {
      const listing = await snapshotArchives({ ...params, timeout: LIMITS.timeout });
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
      return {
        value: { target, provider, pages, steps, text: listing.content[0]?.text ?? "", fetchedAt: new Date().toISOString() },
        degraded: steps.some((step) => Boolean(step.error)),
      };
    });
  } catch (error) {
    return toHttpError(error);
  }
});
