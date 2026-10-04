import { refuseUnreachable } from "../utils/reach";

/** Every route and MCP tool fans out through `fetch`, so Archive.today fails fast for all of them. */
export default defineNitroPlugin(() => {
  globalThis.fetch = refuseUnreachable(globalThis.fetch);
});
