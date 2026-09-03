import { snapshotArchives } from "@agntn/archives/tool-operations";

const TTL = 60 * 60 * 6;

/**
 * Archived URLs under a domain: one row per distinct URL, from the providers whose
 * index can collapse on the URL key. Others answer with their plain listing.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const provider = readString(query, "provider", LIMITS.parameter) ?? "wayback";
  const params = {
    target: requireString(query, "target", LIMITS.target),
    provider,
    limit: readInt(query, "limit", 1, 100) ?? 100,
    from: readString(query, "from", LIMITS.parameter),
    to: readString(query, "to", LIMITS.parameter),
    collection: readString(query, "collection", LIMITS.parameter),
    ...(provider === "wayback" || provider === "archiveIt" ? { collapse: "urlkey" } : {}),
  };
  try {
    return await cachedAnswer(event, "urls", params, TTL, async () => {
      const result = await snapshotArchives({ ...params, timeout: LIMITS.timeout });
      const response = result.details.response;
      const errors = response._meta?.errors;
      return { value: toolAnswer(result, !response.success), degraded: Array.isArray(errors) && errors.length > 0 };
    });
  } catch (error) {
    return toHttpError(error);
  }
});
