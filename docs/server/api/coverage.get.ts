/** Cross-archive coverage of one domain or URL. */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const target = requireString(query, "target", LIMITS.target);
  const result = await coverage(target);
  markPublic(event, 60 * 60);
  return result;
});
