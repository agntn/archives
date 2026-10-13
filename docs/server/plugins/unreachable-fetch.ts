import { refuseUnreachable } from "../utils/reach";

/**
 * Every route and MCP tool fans out through `fetch`, so Archive.today fails fast for all of them.
 * Without it every default call waited about 30 s for Cloudflare's 522.
 */
export default defineNitroPlugin(() => {
  globalThis.fetch = refuseUnreachable(globalThis.fetch);
});
