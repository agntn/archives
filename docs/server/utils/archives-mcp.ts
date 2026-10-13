import { sanitizeLine, type ToolDefinition, type ToolResult } from "@agntn/tools";
import { archivesTools } from "../../../src/tools.ts";
import { admitQueries, LIMITS, RATE_LIMIT } from "./query";
import { unreachableReason } from "./reach";

/** Where a refused call can still go: the same tools, run locally. */
const LOCAL_HINT = "or run npx -y @agntn/archives mcp, which asks the archives from your machine";

/**
 * Queries a call spends from {@link RATE_LIMIT}: one per target, none for the provider list.
 *
 * @param {string} name - The tool's name.
 * @param {Readonly<Record<string, unknown>>} args - The arguments the client sent.
 * @returns {number} How many queries to spend.
 */
function queryCost(name: string, args: Readonly<Record<string, unknown>>): number {
  if (name === "archives_providers") return 0;
  const target = args["target"];
  return Array.isArray(target) ? target.length : 1;
}

/**
 * Why this worker turns down a call `archives mcp` would run, if it does. `/mcp` skips
 * `cachedAnswer`, so this stands in for its limits.
 *
 * @param {string} name - The tool's name.
 * @param {Readonly<Record<string, unknown>>} args - The arguments the client sent.
 * @returns {Promise<string[] | undefined>} The refusal lines, or nothing when the call may run.
 */
async function siteRefusal(
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<string[] | undefined> {
  if (args["path"] !== undefined) {
    return [
      `${name} failed: this server has no disk to write path to`,
      `Drop path to read the capture as text, ${LOCAL_HINT}`,
    ];
  }
  const provider = args["provider"];
  const unreachable = typeof provider === "string" ? unreachableReason(provider) : undefined;
  if (unreachable !== undefined) {
    return [`${name} failed: ${unreachable}`, `Pick another provider, ${LOCAL_HINT}`];
  }
  const retries = args["retries"];
  if (typeof retries === "number" && retries > LIMITS.retries) {
    return [
      `${name} failed: this server retries an archive at most ${LIMITS.retries} time`,
      `Pass retries ${LIMITS.retries} or less, ${LOCAL_HINT}`,
    ];
  }
  if (!(await admitQueries(useEvent(), queryCost(name, args)))) {
    return [
      `${name} failed: more than ${RATE_LIMIT} new archive queries in a minute from one address, or one /64 on IPv6`,
      `Wait a minute and call again, ${LOCAL_HINT}`,
    ];
  }
  return undefined;
}

/**
 * The `archives mcp` tools with this worker's limits checked before each one runs.
 *
 * @returns {ToolDefinition[]} The tools in `archivesTools` order.
 */
export function siteTools(): ToolDefinition[] {
  return archivesTools.map((tool) => ({
    ...tool,
    execute: async (input, context) => {
      const refusal = await siteRefusal(tool.name, input);
      return refusal === undefined ? await tool.execute(input, context) : refusalResult(refusal);
    },
  }));
}

/**
 * A refusal as a result, worded and sanitized like the library's own errors.
 *
 * @param {readonly string[]} lines - The refusal lines.
 * @returns {ToolResult} The sanitized error, as `archives mcp` words one.
 */
function refusalResult(lines: readonly string[]): ToolResult {
  const text = lines.map(sanitizeLine).join("\n");
  return { content: [{ type: "text", text }], details: undefined, isError: true };
}
