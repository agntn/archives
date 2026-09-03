import { snapshotArchives } from "@agntn/archives/tool-operations";
import { archiveRequestAbort } from "../utils/query";

const TTL = 60 * 30;

/** Lists captures through the same executor the MCP server and the agent extensions use. */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const params = {
    target: requireString(query, "target", LIMITS.target),
    provider: readString(query, "provider", LIMITS.parameter) ?? "all",
    limit: readInt(query, "limit", 1, LIMITS.snapshots) ?? 12,
    from: readString(query, "from", LIMITS.parameter),
    to: readString(query, "to", LIMITS.parameter),
    collection: readString(query, "collection", LIMITS.parameter),
    user: readString(query, "user", LIMITS.parameter),
    timeout: readInt(query, "timeout", 1_000, LIMITS.timeout) ?? LIMITS.timeout,
    retries: readInt(query, "retries", 0, LIMITS.retries) ?? LIMITS.retries,
  };
  try {
    return await cachedAnswer(event, "snapshots", params, TTL, async () => {
      const abort = archiveRequestAbort(event);
      try {
        const result = await snapshotArchives(params, abort.signal);
        const response = result.details.response;
        const errors = response._meta?.errors;
        return {
          value: toolAnswer(result, !response.success),
          degraded: Array.isArray(errors) && errors.length > 0,
        };
      } finally {
        abort.dispose();
      }
    });
  } catch (error) {
    return toHttpError(error);
  }
});
