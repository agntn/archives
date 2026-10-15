import { homedir } from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { setConfigCwd } from "./config.ts";
import { createMcpServer } from "./mcp.ts";

/**
 * Serves the tools over stdio, with config from home, not from whatever checkout the client
 * started the server in.
 * @returns {Promise<void>} Once the server is connected.
 */
export async function serveStdio(): Promise<void> {
  setConfigCwd(homedir());
  await createMcpServer().connect(new StdioServerTransport());
}
