import { indexTools, invokeTool, ToolInputError, wireSchema } from "@agntn/tools";
import {
  createMcpServer as createToolServer,
  errorResult,
  toolAnnotations,
} from "@agntn/tools/mcp";
import type { CallToolResult, Server, Tool } from "@modelcontextprotocol/server";
import { archivesTools } from "./tools.ts";
import { version } from "./version.ts";

/** The `tools/list` entries shared by `archives mcp` and the MCP server of the docs site. */
export const toolListings: readonly Tool[] = archivesTools.map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: { ...wireSchema(tool), type: "object" },
  annotations: toolAnnotations(tool),
}));

const toolsByName = indexTools(archivesTools);

/**
 * Runs one tool the way `tools/call` of `archives mcp` does, errors as results, never as a throw.
 *
 * @param {string} name - The tool's name, such as `archives_snapshots`.
 * @param {Readonly<Record<string, unknown>>} args - The arguments the client sent.
 * @param {Readonly<AbortSignal>} [signal] - The request's signal, which stops the archive requests.
 * @returns {Promise<CallToolResult>} The tool's text, or the sanitized error.
 */
export async function callTool(
  name: string,
  args: Readonly<Record<string, unknown>>,
  signal?: Readonly<AbortSignal>,
): Promise<CallToolResult> {
  const tool = toolsByName.get(name);
  if (!tool) return errorResult(`Unknown archives tool: ${JSON.stringify(name)}`);
  try {
    const result = await invokeTool(tool, args, signal === undefined ? {} : { signal });
    return {
      content: result.content,
      ...(result.isError === undefined ? {} : { isError: result.isError }),
    };
  } catch (error) {
    if (error instanceof ToolInputError) return errorResult(...error.lines);
    return errorResult(
      `${tool.name} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Creates an unconnected MCP server exposing archive snapshot, content, diff and provider tools.
 *
 * @returns {Server} Unconnected MCP server.
 */
export function createMcpServer(): Server {
  return createToolServer({ name: "archives", version }, archivesTools);
}
