import { toToolkitTools } from "@agntn/tools/toolkit";
import { defineMcpHandler, getMcpTools } from "@nuxtjs/mcp-toolkit/server";
import { serverInfo } from "../../../src/server-info.ts";
import { siteTools } from "../utils/archives-mcp";

const archiveTools = toToolkitTools({ name: "archives" }, siteTools());

/** Introduces itself like `archives mcp`, and serves its tools after the Docus page tools. */
export default defineMcpHandler({
  ...serverInfo,
  tools: async (event) => [...(await getMcpTools({ event })), ...archiveTools],
});
