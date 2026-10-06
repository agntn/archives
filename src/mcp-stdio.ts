import { homedir } from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { consola, LogLevels } from "consola";
import { setConfigCwd } from "./config.ts";
import { createMcpServer } from "./mcp.ts";

/**
 * Serves the tools over stdio. consola stays at warn because stdout carries the frames, and
 * config comes from home, not from whatever checkout the client started the server in.
 * @returns {Promise<void>} Once the server is connected.
 */
export async function serveStdio(): Promise<void> {
  consola.level = LogLevels.warn;
  setConfigCwd(homedir());
  await createMcpServer().connect(new StdioServerTransport());
}
