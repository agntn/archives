import { contentArchives } from "@agntn/archives/tool-operations";

const TTL = 60 * 60 * 6;

/** Reads one archived body and returns the tool text plus the slice bookkeeping. */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const params = {
    target: requireString(query, "target", LIMITS.target),
    provider: readString(query, "provider", LIMITS.parameter) ?? "all",
    timestamp: readString(query, "timestamp", LIMITS.parameter),
    format: readString(query, "format", LIMITS.parameter) ?? "text",
    maxChars: readInt(query, "maxChars", 100, LIMITS.contentChars) ?? 4000,
    offset: readInt(query, "offset", 0, 2_000_000) ?? 0,
    collection: readString(query, "collection", LIMITS.parameter),
    user: readString(query, "user", LIMITS.parameter),
  };
  try {
    return await cachedAnswer(event, "content", params, TTL, async () => {
      const result = await contentArchives({ ...params, timeout: LIMITS.bodyTimeout });
      return { value: toolAnswer(result, !result.details.response.success), degraded: false };
    });
  } catch (error) {
    return toHttpError(error);
  }
});
