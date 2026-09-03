import { diffArchives } from "@agntn/archives/tool-operations";
import { archiveRequestAbort } from "../utils/query";

const TTL = 60 * 60 * 6;

/** Compares two captures from one provider and returns the unified diff text. */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const params = {
    target: requireString(query, "target", LIMITS.target),
    before: requireString(query, "before", LIMITS.parameter),
    after: requireString(query, "after", LIMITS.parameter),
    provider: readString(query, "provider", LIMITS.parameter) ?? "all",
    format: readString(query, "format", LIMITS.parameter) ?? "text",
    context: readInt(query, "context", 0, LIMITS.diffContext) ?? 3,
    maxChars: readInt(query, "maxChars", 100, LIMITS.diffChars) ?? 8000,
    offset: readInt(query, "offset", 0, 8_004_096) ?? 0,
    digest: readString(query, "digest", 80),
    collection: readString(query, "collection", LIMITS.parameter),
    timeout: readInt(query, "timeout", 1_000, LIMITS.bodyTimeout) ?? LIMITS.bodyTimeout,
    retries: readInt(query, "retries", 0, LIMITS.retries) ?? LIMITS.retries,
    budget: readInt(query, "budget", 1_000, LIMITS.operationBudget),
  };
  try {
    return await cachedAnswer(event, "diff", params, TTL, async () => {
      const { budget, ...request } = params;
      const abort = archiveRequestAbort(event, budget);
      try {
        const result = await diffArchives(request, abort.signal);
        return {
          value: toolAnswer(result, !result.details.success),
          degraded: result.details.attempts.length > 0,
        };
      } finally {
        abort.dispose();
      }
    });
  } catch (error) {
    return toHttpError(error);
  }
});
