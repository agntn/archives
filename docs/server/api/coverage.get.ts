import { archiveRequestAbort } from "../utils/query";

const TTL = 60 * 60;

/** Coverage across archives for one domain or URL. */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const target = requireString(query, "target", LIMITS.target);
  try {
    return await cachedAnswer(event, "coverage", { target }, TTL, async () => {
      const abort = archiveRequestAbort(event);
      try {
        const value = await coverage(target, abort.signal);
        return {
          value,
          degraded: value.providers.some((provider) => provider.state === "failed"),
        };
      } finally {
        abort.dispose();
      }
    });
  } catch (error) {
    return toHttpError(error);
  }
});
