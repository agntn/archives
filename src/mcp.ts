import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Type, type TSchema } from "typebox";
import { Value } from "typebox/value";
import {
  DEFAULT_LIMIT,
  listArchiveProviders,
  MAX_LIMIT,
  PROVIDER_HINT,
  PROVIDER_INPUTS,
  sanitizeTerminalText,
  snapshotArchives,
  type SnapshotParams,
  type ToolResult,
} from "./tool-operations";
import { version } from "./version";

const MAX_TARGET_LENGTH = 2048;
const MAX_PARAMETER_LENGTH = 256;
const MAX_TTL = 30 * 24 * 60 * 60 * 1000;
const MAX_RETRIES = 10;

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: TSchema;
  annotations: Tool["annotations"];
  execute(args: Record<string, unknown>): ToolResult<unknown> | Promise<ToolResult<unknown>>;
}

const tools: ToolDefinition[] = [
  {
    name: "archives_snapshots",
    title: "Archive Snapshots",
    description:
      "Query web archive providers for archived snapshots of a domain or URL. Returns one line per snapshot with its timestamp, the archived copy, and the original URL. Omit provider to fan out to Wayback Machine, Archive.today, Common Crawl, and WebCite; providers that cannot answer the query are named in the answer instead of dropped. A fan-out is merged newest first, while a single provider answers in its own order — Wayback returns a domain's oldest captures first, so ask for a larger limit when you need recent ones.",
    inputSchema: Type.Object(
      {
        target: Type.String({
          description: "Domain or URL to search for archived snapshots.",
          minLength: 1,
          maxLength: MAX_TARGET_LENGTH,
        }),
        // Enumerated rather than free-form: the caller sees every accepted
        // spelling and a typo is rejected before any network work.
        provider: Type.Optional(
          Type.Union(
            PROVIDER_INPUTS.map((name) => Type.Literal(name)),
            { description: PROVIDER_HINT },
          ),
        ),
        limit: Type.Optional(
          Type.Integer({
            description: `Maximum snapshots to return. Defaults to ${DEFAULT_LIMIT}.`,
            minimum: 1,
            maximum: MAX_LIMIT,
          }),
        ),
        cache: Type.Optional(
          Type.Boolean({ description: "Enable or disable archives response caching." }),
        ),
        ttl: Type.Optional(
          Type.Integer({ description: "Cache TTL in milliseconds.", minimum: 0, maximum: MAX_TTL }),
        ),
        concurrency: Type.Optional(
          Type.Integer({
            description: "Maximum parallel provider requests.",
            minimum: 1,
            maximum: 10,
          }),
        ),
        batchSize: Type.Optional(
          Type.Integer({
            description: "Provider batch size for parallel work.",
            minimum: 1,
            maximum: 100,
          }),
        ),
        timeout: Type.Optional(
          Type.Integer({ description: "Request timeout in milliseconds.", minimum: 1 }),
        ),
        retries: Type.Optional(
          Type.Integer({
            description: "Retry attempts for failed requests.",
            minimum: 0,
            maximum: MAX_RETRIES,
          }),
        ),
        collection: Type.Optional(
          Type.String({
            description:
              "Archive-It numeric collection id, or Common Crawl collection id such as CC-MAIN-latest.",
            minLength: 1,
            maxLength: MAX_PARAMETER_LENGTH,
          }),
        ),
        collapse: Type.Optional(
          Type.String({
            description: "Wayback CDX collapse parameter, for example timestamp:4.",
            minLength: 1,
            maxLength: MAX_PARAMETER_LENGTH,
          }),
        ),
        filter: Type.Optional(
          Type.String({
            description: "Wayback CDX filter parameter.",
            minLength: 1,
            maxLength: MAX_PARAMETER_LENGTH,
          }),
        ),
      },
      // An unknown argument is a mistake worth naming: `apiKey` would be silently
      // ignored (the key comes from the environment) and a misspelled `limit`
      // would quietly fall back to the default fan-out.
      { additionalProperties: false },
    ),
    // Every call leaves the machine for a third-party archive, so the answer is
    // read-only but open-world: a repeat can legitimately return more snapshots.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: (args) => snapshotArchives(args as unknown as SnapshotParams),
  },
  {
    name: "archives_providers",
    title: "Archive Providers",
    description:
      "List the built-in archive providers, which of them the default fan-out queries, and whether Perma.cc has an API key in the environment. Use this before archives_snapshots instead of guessing a provider name.",
    inputSchema: Type.Object({}, { additionalProperties: false }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: () => listArchiveProviders(),
  },
];

/** Formats the first TypeBox validation failure for an MCP client. */
function validationError(schema: TSchema, value: unknown): string {
  const first = Value.Errors(schema, value)[0];
  if (!first) return "Invalid arguments";
  const path = first.instancePath || "/";
  const allowed = allowedValues(schema, first.instancePath);
  // TypeBox reports a rejected literal union as "must be equal to constant",
  // which tells the caller nothing about what it should have sent.
  const detail = allowed ? `must be one of: ${allowed}` : first.message;
  return `Invalid arguments at ${path}: ${detail}`;
}

/** Lists the literals a union at `instancePath` accepts, when that is what failed. */
function allowedValues(schema: TSchema, instancePath: string): string | undefined {
  let node = schema as Record<string, unknown>;
  for (const segment of instancePath.split("/").filter(Boolean)) {
    const properties = node["properties"] as Record<string, Record<string, unknown>> | undefined;
    const next = properties?.[segment];
    if (!next) return undefined;
    node = next;
  }

  const members = node["anyOf"];
  if (!Array.isArray(members)) return undefined;
  const literals = members.map((member) => (member as { const?: unknown }).const);
  if (literals.some((literal) => literal === undefined)) return undefined;
  return literals.map((literal) => String(literal)).join(", ");
}

/**
 * Converts a shared tool result to the MCP text-result contract.
 *
 * `details` is dropped and `structuredContent` is never set: clients that see
 * structured output prefer it over `content` and would hide the readable answer.
 */
function toCallToolResult(result: ToolResult<unknown>): CallToolResult {
  return { content: result.content, ...(result.isError ? { isError: true } : {}) };
}

/** Error text is model- or provider-controlled, so it crosses the same boundary. */
function errorResult(text: string): CallToolResult {
  return { content: [{ type: "text", text: sanitizeTerminalText(text) }], isError: true };
}

/**
 * Creates an unconnected MCP server exposing the archive snapshot and provider tools.
 *
 * Built on the low-level `Server` even though the SDK marks it `@deprecated`,
 * because `McpServer.registerTool` accepts Standard Schema (Zod) only. TypeBox 1.x
 * does not implement Standard Schema, and this package's tool schemas are TypeBox,
 * shared in shape with the Pi and OMP extensions. The high-level API would force a
 * second definition of every parameter.
 */
export function createMcpServer(): Server {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const server = new Server({ name: "archives", version }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((tool): Tool => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema as Tool["inputSchema"],
      annotations: tool.annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolsByName.get(request.params.name);
    if (!tool) return errorResult(`Unknown archives tool: ${request.params.name}`);

    const args = request.params.arguments ?? {};
    if (!Value.Check(tool.inputSchema, args)) {
      return errorResult(validationError(tool.inputSchema, args));
    }

    try {
      return toCallToolResult(await tool.execute(args));
    } catch (error) {
      return errorResult(
        `${tool.name} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  return server;
}
