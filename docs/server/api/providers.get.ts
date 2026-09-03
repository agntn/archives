import { listArchiveProviders } from "@agntn/archives/tool-operations";

/** The provider table as `archives_providers` renders it; no key is configured on the docs worker. */
export default defineEventHandler((event) => {
  const result = listArchiveProviders();
  markPublic(event, 60 * 60);
  return { text: result.content[0]?.text ?? "", details: result.details };
});
