import { diffArchives } from "@agntn/archives/tool-operations";

const TTL = 60 * 60 * 6;

/** Compares two captures from one provider and returns the unified diff text. */
export default defineCachedEventHandler(
  async (event) => {
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
      timeout: LIMITS.bodyTimeout,
    };
    try {
      const result = await diffArchives(params);
      const answer = toolAnswer(result, !result.details.success);
      markPublic(event, TTL);
      return answer;
    } catch (error) {
      return toHttpError(error);
    }
  },
  {
    maxAge: TTL,
    swr: true,
    getKey: (event) => {
      const query = getQuery(event);
      return cacheKey("diff", {
        target: readString(query, "target", LIMITS.target),
        before: readString(query, "before", LIMITS.parameter),
        after: readString(query, "after", LIMITS.parameter),
        provider: readString(query, "provider", LIMITS.parameter) ?? "all",
        format: readString(query, "format", LIMITS.parameter) ?? "text",
        context: readInt(query, "context", 0, LIMITS.diffContext) ?? 3,
        maxChars: readInt(query, "maxChars", 100, LIMITS.diffChars) ?? 8000,
        offset: readInt(query, "offset", 0, 8_004_096) ?? 0,
        digest: readString(query, "digest", 80),
        collection: readString(query, "collection", LIMITS.parameter),
      });
    },
  },
);
