import {
  serveStdio as serveEras,
  type StdioServerHandle,
} from "@modelcontextprotocol/server/stdio";
import { createMcpServer } from "./mcp.ts";

/**
 * Serves 2025 and 2026 clients over stdio, with config from home, not from whatever checkout the
 * client started the server in. Every connection and the SDK's discover probe get a fresh server.
 * @returns {StdioServerHandle} What closes the connection.
 */
export function serveStdio(): StdioServerHandle {
  return serveEras(() => createMcpServer());
}
