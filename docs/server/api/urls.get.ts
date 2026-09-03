import { snapshotArchives } from "@agntn/archives/tool-operations";

const TTL = 60 * 60 * 6;

/**
 * Archived URLs under a domain: one row per distinct URL, from the providers whose
 * index can collapse on the URL key. Others answer with their plain listing.
 */
export default defineCachedEventHandler(
  async (event) => {
    const query = getQuery(event);
    const provider = readString(query, "provider", LIMITS.parameter) ?? "wayback";
    const params = {
      target: requireString(query, "target", LIMITS.target),
      provider,
      limit: readInt(query, "limit", 1, 100) ?? 100,
      from: readString(query, "from", LIMITS.parameter),
      to: readString(query, "to", LIMITS.parameter),
      collection: readString(query, "collection", LIMITS.parameter),
      timeout: LIMITS.timeout,
      ...(provider === "wayback" || provider === "archiveIt" ? { collapse: "urlkey" } : {}),
    };
    try {
      const result = await snapshotArchives(params);
      const answer = toolAnswer(result, !result.details.response.success);
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
      return cacheKey("urls", {
        target: readString(query, "target", LIMITS.target)?.toLowerCase(),
        provider: readString(query, "provider", LIMITS.parameter) ?? "wayback",
        limit: readInt(query, "limit", 1, 100) ?? 100,
        from: readString(query, "from", LIMITS.parameter),
        to: readString(query, "to", LIMITS.parameter),
        collection: readString(query, "collection", LIMITS.parameter),
      });
    },
  },
);
