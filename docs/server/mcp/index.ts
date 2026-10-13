import { toToolkitTools } from "@agntn/tools/toolkit";
import { defineMcpHandler, getMcpTools } from "@nuxtjs/mcp-toolkit/server";
import { version } from "../../../src/version.ts";
import { siteTools } from "../utils/archives-mcp";

const archiveTools = toToolkitTools({ name: "archives" }, siteTools());

/** Named like `archives mcp`, and serves its tools after the Docus page tools. */
export default defineMcpHandler({
  name: "archives",
  version,
  tools: async (event) => [...(await getMcpTools({ event })), ...archiveTools],
});
