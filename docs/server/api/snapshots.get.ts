import { snapshotArchives } from "@agntn/archives/tool-operations";

const TTL = 60 * 30;

/** Lists captures through the same executor the MCP server and the agent extensions use. */
export default defineCachedEventHandler(
  async (event) => {
    const query = getQuery(event);
    const params = {
      target: requireString(query, "target", LIMITS.target),
      provider: readString(query, "provider", LIMITS.parameter) ?? "all",
      limit: readInt(query, "limit", 1, LIMITS.snapshots) ?? 12,
      from: readString(query, "from", LIMITS.parameter),
      to: readString(query, "to", LIMITS.parameter),
      collection: readString(query, "collection", LIMITS.parameter),
      user: readString(query, "user", LIMITS.parameter),
      timeout: LIMITS.timeout,
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
      return cacheKey("snapshots", {
        target: readString(query, "target", LIMITS.target)?.toLowerCase(),
        provider: readString(query, "provider", LIMITS.parameter) ?? "all",
        limit: readInt(query, "limit", 1, LIMITS.snapshots) ?? 12,
        from: readString(query, "from", LIMITS.parameter),
        to: readString(query, "to", LIMITS.parameter),
        collection: readString(query, "collection", LIMITS.parameter),
        user: readString(query, "user", LIMITS.parameter),
      });
    },
  },
);
