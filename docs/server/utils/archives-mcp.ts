import { callTool, toolListings } from "@agntn/archives/mcp";
import { MAX_SNAPSHOT_TARGETS } from "@agntn/archives/tool-operations";
import { errorResult } from "@agntn/tools/mcp";
import {
  defineMcpTool,
  type McpToolDefinition,
  type McpToolDefinitionListItem,
} from "@nuxtjs/mcp-toolkit/server";
import { z } from "zod";
import { admitQueries, LIMITS, RATE_LIMIT } from "./query";
import { unreachableReason } from "./reach";

/** Where a refused call can still go: the same tools, run locally. */
const LOCAL_HINT = "or run npx -y @agntn/archives mcp, which asks the archives from your machine";

/**
 * Queries a call spends from {@link RATE_LIMIT}: one per target, none for the provider list.
 * A longer list than the tool takes costs the cap, so a junk array can't keep the binding busy.
 *
 * @param {string} name - The tool's name.
 * @param {Readonly<Record<string, unknown>>} args - The arguments the client sent.
 * @returns {number} How many queries to spend.
 */
function queryCost(name: string, args: Readonly<Record<string, unknown>>): number {
  if (name === "archives_providers") return 0;
  const target = args["target"];
  return Array.isArray(target) ? Math.min(Math.max(1, target.length), MAX_SNAPSHOT_TARGETS) : 1;
}

/**
 * Why this worker turns down a call `archives mcp` would run, if it does.
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
 * An `archives mcp` tool for Docus: its own schema in `tools/list`, its own checks on the call.
 *
 * @param {string} name - The tool's name, such as `archives_snapshots`.
 * @returns {McpToolDefinitionListItem} The tool definition for `server/mcp/tools/`.
 */
export function archivesMcpTool(name: string): McpToolDefinitionListItem {
  const listing = toolListings.find((candidate) => candidate.name === name);
  if (listing === undefined) {
    throw new Error(`Unknown archives tool: ${name}`);
  }
  /** Any object passes Zod, so `callTool` refuses a bad one in the library's words, sanitized. */
  const schema = z.looseObject({});
  schema._zod.toJSONSchema = () => ({ ...listing.inputSchema });
  /** The SDK hands Zod a missing `arguments` untouched, so read it as the `{}` stdio gets. */
  const run = schema._zod.run.bind(schema._zod);
  schema._zod.run = (payload, context) =>
    run(payload.value === undefined ? { ...payload, value: {} } : payload, context);
  /** The toolkit types a raw shape only, and the SDK behind it takes a whole object too. */
  const inputSchema = schema as unknown as NonNullable<McpToolDefinition["inputSchema"]>;
  return defineMcpTool({
    name: listing.name,
    title: listing.title,
    description: listing.description,
    annotations: listing.annotations,
    inputSchema,
    handler: async (args: Readonly<Record<string, unknown>>, extra) => {
      const refusal = await siteRefusal(name, args);
      return refusal === undefined ? callTool(name, args, extra.signal) : errorResult(...refusal);
    },
  });
}
