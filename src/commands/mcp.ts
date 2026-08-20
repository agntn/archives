import { homedir } from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { defineCommand } from "citty";
import { consola, LogLevels } from "consola";
import { setConfigCwd } from "../config";
import { createMcpServer } from "../mcp";

export default defineCommand({
  meta: {
    name: "mcp",
    description: "Run the archives MCP server over stdio",
  },
  async run() {
    // stdout carries the JSON-RPC frames. consola's default reporter sends
    // anything at log level or below to that same descriptor, and `DEBUG` in the
    // environment raises the level on import, so one provider warning would
    // corrupt the stream. Warnings and errors still reach stderr.
    consola.level = LogLevels.warn;

    // An MCP client spawns this process in the directory it happens to have open,
    // so config discovery is pinned to the account that runs the server instead:
    // otherwise the first tool call executes an archives.config.ts from whatever
    // repository the user is browsing.
    setConfigCwd(homedir());

    await createMcpServer().connect(new StdioServerTransport());
  },
});
