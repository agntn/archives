import { readdirSync, readFileSync } from "node:fs";
import { Client as SiteClient } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport as SiteTransport } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { McpServer } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js";
import type { CallToolResult } from "../docs/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { callTool, toolListings } from "../src/mcp.ts";
import { RATE_LIMIT } from "../docs/server/utils/query";

/* The toolkit's entry pulls in Nitro, and `defineMcpTool` only hands its input back. */
vi.mock(
  "../docs/node_modules/@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/definitions/index.js",
  () => ({
    defineMcpTool: (definition: unknown) => definition,
  }),
);

const toolsDir = new URL("../docs/server/mcp/tools/", import.meta.url);

const openConnections: Array<{ close(): Promise<void> }> = [];

/** Queries the fake `ARCHIVE_LIMIT` binding has counted, and how many it still lets through. */
const limiter = { spent: 0, allowance: RATE_LIMIT };

beforeEach(() => {
  limiter.spent = 0;
  limiter.allowance = RATE_LIMIT;
  const env = {
    ARCHIVE_LIMIT: {
      limit: async () => {
        limiter.spent++;
        return { success: limiter.spent <= limiter.allowance };
      },
    },
  };
  const event = {
    headers: { "cf-connecting-ip": "203.0.113.7" },
    context: { cloudflare: { env } },
  };
  vi.stubGlobal("useEvent", () => event);
  vi.stubGlobal(
    "getRequestHeader",
    (request: Readonly<{ headers: Readonly<Record<string, string>> }>, name: string) =>
      request.headers[name.toLowerCase()],
  );
  vi.stubGlobal("getRequestIP", () => undefined);
});

afterEach(async () => {
  await Promise.all(openConnections.splice(0).map((connection) => connection.close()));
  vi.unstubAllGlobals();
});

/* An SDK client on every docs tool, through the same SDK copy the worker runs. */
async function siteClient(): Promise<SiteClient> {
  const { archivesMcpTool } = await import("../docs/server/utils/archives-mcp.ts");
  const server = new McpServer({ name: "archives-docs", version: "0.0.0" });
  for (const listing of toolListings) {
    const tool = archivesMcpTool(listing.name);
    const handler = tool.handler as (
      args: Readonly<Record<string, unknown>>,
    ) => Promise<CallToolResult>;
    server.registerTool(listing.name, tool, handler);
  }
  const [clientTransport, serverTransport] = SiteTransport.createLinkedPair();
  const client = new SiteClient({ name: "archives-docs-test", version: "0.0.0" });
  openConnections.push(client, server);
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

/* The first text block of a tool answer. */
function firstText(result: Readonly<{ content?: unknown }>): string {
  return (result.content as ReadonlyArray<{ text?: string }>)[0]?.text ?? "";
}

describe("docs MCP tools", () => {
  it("serves every tool `archives mcp` lists, one file each", () => {
    const files = readdirSync(toolsDir).sort();
    expect(files).toEqual(
      toolListings.map((tool) => `${tool.name.replaceAll("_", "-")}.ts`).sort(),
    );
    for (const file of files) {
      const name = file.slice(0, -".ts".length).replaceAll("-", "_");
      expect(readFileSync(new URL(file, toolsDir), "utf8")).toBe(
        `export default archivesMcpTool(${JSON.stringify(name)});\n`,
      );
    }
  });

  it("lists the schemas `archives mcp` lists, under the draft the SDK names", async () => {
    const client = await siteClient();
    const listed = (await client.listTools()).tools;
    for (const listing of toolListings) {
      expect(listed.find((tool) => tool.name === listing.name)?.inputSchema).toEqual({
        $schema: "http://json-schema.org/draft-07/schema#",
        ...listing.inputSchema,
      });
    }
  });

  it("reads a call without arguments as `{}`, like `archives mcp`", async () => {
    const client = await siteClient();
    const served = await client.callTool({ name: "archives_providers" });
    expect(served.isError).toBeFalsy();
    expect(served.content).toEqual((await callTool("archives_providers", {})).content);

    const required = await client.callTool({ name: "archives_content" });
    expect(required.isError).toBe(true);
    expect(required.content).toEqual((await callTool("archives_content", {})).content);
  });

  it("turns down a file write, Archive.today and extra retries before spending the allowance", async () => {
    const client = await siteClient();
    const written = await client.callTool({
      name: "archives_content",
      arguments: { target: "example.com", path: "page.html" },
    });
    expect(written.isError).toBe(true);
    expect(firstText(written)).toMatch(/^archives_content failed: this server has no disk/u);

    const retried = await client.callTool({
      name: "archives_snapshots",
      arguments: { target: "example.com", retries: 5 },
    });
    expect(retried.isError).toBe(true);
    expect(firstText(retried)).toContain("npx -y @agntn/archives mcp");

    const unreachable = await client.callTool({
      name: "archives_snapshots",
      arguments: { target: "example.com", provider: "archive-today" },
    });
    expect(unreachable.isError).toBe(true);
    expect(firstText(unreachable)).toMatch(
      /^archives_snapshots failed: Archive\.today doesn't answer/u,
    );
    expect(limiter.spent).toBe(0);
  });

  it("spends one query per target, capped, and none on the provider list", async () => {
    const client = await siteClient();
    await client.callTool({ name: "archives_providers", arguments: {} });
    expect(limiter.spent).toBe(0);

    await client.callTool({
      name: "archives_snapshots",
      arguments: { target: ["a.example", "b.example", "c.example"], limit: 0 },
    });
    expect(limiter.spent).toBe(3);

    await client.callTool({
      name: "archives_snapshots",
      arguments: { target: Array.from({ length: 5000 }, () => "a.example") },
    });
    expect(limiter.spent).toBe(13);
  });

  it("answers a call past the limit with a tool error, not a thrown 429", async () => {
    limiter.allowance = 0;
    const client = await siteClient();
    const refused = await client.callTool({
      name: "archives_snapshots",
      arguments: { target: "example.com", limit: 0 },
    });
    expect(refused.isError).toBe(true);
    expect(firstText(refused)).toBe(
      `archives_snapshots failed: more than ${RATE_LIMIT} new archive queries in a minute from one address, or one /64 on IPv6\n` +
        "Wait a minute and call again, or run npx -y @agntn/archives mcp, which asks the archives from your machine",
    );
  });
});
