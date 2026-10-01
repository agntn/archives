import { objectContaining, rangeDescription } from "./_matchers";
import { $fetch } from "ofetch";
import { Value } from "typebox/value";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import archivesOmpExtension from "../packages/omp/extensions/archives.js";
import {
  CONTENT_FORMAT_HINT,
  MAX_CONTENT_CHARS,
  MAX_CONTENT_OFFSET,
  MAX_DIFF_CONTEXT,
  MAX_DIFF_OFFSET,
  MAX_LIMIT,
  MAX_SNAPSHOT_TARGETS,
  PROVIDER_INPUTS,
  SNAPSHOT_TARGET_HINT,
} from "../src/tool-operations";

vi.mock("ofetch", () => ({
  $fetch: vi.fn(),
}));

class TestText {
  constructor(private readonly text: string) {}

  render(): readonly string[] {
    return this.text.split("\n");
  }
}

interface RegisteredExtension {
  label: string | undefined;
  tools: Map<string, ToolDefinition>;
  commands: string[];
}

async function registerExtension(): Promise<RegisteredExtension> {
  const tools = new Map<string, ToolDefinition>();
  const commands: string[] = [];
  let label: string | undefined;
  const api = {
    pi: { Text: TestText },
    /** The adapter wraps the JSON Schema in `Type.Unsafe`; the host hands it back as it came. */
    typebox: { Type: { Unsafe: (schema: unknown) => schema } },
    setLabel(value: string) {
      label = value;
    },
    registerTool(tool: ToolDefinition) {
      tools.set(tool.name, tool);
    },
    registerCommand(name: string) {
      commands.push(name);
    },
  };

  // SAFETY: the test host implements every registration-time capability used by the extension.
  await archivesOmpExtension(api as unknown as ExtensionAPI);
  return { label, tools, commands };
}

function requireTool(tools: Readonly<Map<string, ToolDefinition>>, name: string): ToolDefinition {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}
function accepts(tool: ToolDefinition, value: unknown): boolean {
  return Value.Check(tool.parameters, value);
}

function schemaProperties(tool: ToolDefinition): Record<string, Record<string, unknown>> {
  return (tool.parameters as unknown as { properties: Record<string, Record<string, unknown>> })
    .properties;
}

// SAFETY: archives_providers does not read ExtensionContext.
const unusedContext = {} as ExtensionContext;

describe("archives OMP extension", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("registers read-only tools and interactive commands", async () => {
    const { label, tools, commands } = await registerExtension();

    expect(label).toBe("Archives");
    expect([...tools.keys()]).toEqual([
      "archives_snapshots",
      "archives_content",
      "archives_diff",
      "archives_providers",
    ]);
    expect(commands).toEqual(["archive", "archive-providers"]);
    for (const tool of tools.values()) expect(tool.approval).toBe("read");
  });

  it("routes snapshot URL discovery to the listing tool", async () => {
    const { tools } = await registerExtension();
    const snapshots = requireTool(tools, "archives_snapshots");
    const content = requireTool(tools, "archives_content");
    const diff = requireTool(tools, "archives_diff");

    expect(snapshots.description).toMatch(
      /find captures, timestamps, and snapshot URLs without reading archived bodies\./i,
    );
    expect(content.description).toContain(
      "Use this tool only when the caller wants the archived body or already has a capture to read.",
    );
    expect(content.description).toContain("format=raw keeps markup");
    expect(diff.description).toContain(
      "two chronological captures of one URL from the same archive provider",
    );
  });

  it("declares the diff bounds the shared executor enforces", async () => {
    const tool = requireTool((await registerExtension()).tools, "archives_diff");
    const properties = schemaProperties(tool);

    expect(accepts(tool, { target: "example.com", before: "2019", after: "2020" })).toBe(true);
    expect(accepts(tool, { target: "example.com", before: "2019" })).toBe(false);
    expect(
      accepts(tool, {
        target: "example.com",
        before: "2019",
        after: "2020",
        context: MAX_DIFF_CONTEXT + 1,
      }),
    ).toBe(false);
    expect(
      accepts(tool, {
        target: "example.com",
        before: "2019",
        after: "2020",
        offset: MAX_DIFF_OFFSET,
        digest: "a".repeat(64),
      }),
    ).toBe(true);
    expect(
      accepts(tool, {
        target: "example.com",
        before: "2019",
        after: "2020",
        digest: "not-a-digest",
      }),
    ).toBe(false);
    // OMP fills every property, so a first slice arrives with the digest left blank.
    expect(
      accepts(tool, {
        target: "example.com",
        before: "2019",
        after: "2020",
        offset: 0,
        digest: "",
      }),
    ).toBe(true);
    expect(properties).not.toHaveProperty("timestamp");
    for (const name of ["context", "maxChars", "offset", "ttl", "timeout", "retries"]) {
      expect(properties[name]?.["description"]).toContain(rangeDescription(properties[name]));
    }
  });

  it("declares the content bounds the shared executors enforce", async () => {
    const tool = requireTool((await registerExtension()).tools, "archives_content");
    const properties = schemaProperties(tool);

    for (const parameterName of ["maxChars", "offset", "ttl", "timeout", "retries"]) {
      const parameter = properties[parameterName];
      expect(parameter?.["description"]).toContain(rangeDescription(parameter));
    }
    expect(properties["format"]?.["description"]).toBe(CONTENT_FORMAT_HINT);
    expect(accepts(tool, { target: "example.com" })).toBe(true);
    expect(accepts(tool, { target: "example.com", format: "text" })).toBe(true);
    expect(accepts(tool, { target: "example.com", format: "raw" })).toBe(true);
    expect(accepts(tool, { target: "example.com", format: "markdown" })).toBe(false);
    expect(accepts(tool, { target: "example.com", maxChars: MAX_CONTENT_CHARS })).toBe(true);
    expect(accepts(tool, { target: "example.com", maxChars: MAX_CONTENT_CHARS + 1 })).toBe(false);
    expect(accepts(tool, { target: "example.com", maxChars: 10.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", offset: MAX_CONTENT_OFFSET })).toBe(true);
    expect(accepts(tool, { target: "example.com", offset: MAX_CONTENT_OFFSET + 1 })).toBe(false);
    expect(accepts(tool, { target: "example.com", offset: 0.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", timestamp: "2019-03-01" })).toBe(true);
    for (const provider of PROVIDER_INPUTS) {
      expect(accepts(tool, { target: "example.com", provider })).toBe(true);
    }
  });
  it("rejects fractional numeric parameters", async () => {
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");

    expect(accepts(tool, { target: "example.com", limit: 1 })).toBe(true);
    expect(accepts(tool, { target: "example.com", limit: 1.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", concurrency: 1.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", batchSize: 1.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", retries: 0.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", ttl: 0.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", timeout: 1.5 })).toBe(false);
  });

  it("bounds limit where the shared executors reject it", async () => {
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");
    const properties = schemaProperties(tool);

    // The parameters are declared before the executors can be loaded, so the
    // restated bound has to match what src/tool-operations actually enforces.
    for (const parameterName of [
      "limit",
      "ttl",
      "concurrency",
      "batchSize",
      "timeout",
      "retries",
    ]) {
      const parameter = properties[parameterName];
      expect(parameter?.["description"]).toContain(rangeDescription(parameter));
    }
    expect(accepts(tool, { target: "example.com", limit: MAX_LIMIT })).toBe(true);
    expect(accepts(tool, { target: "example.com", limit: MAX_LIMIT + 1 })).toBe(false);
    for (const provider of PROVIDER_INPUTS) {
      expect(accepts(tool, { target: "example.com", provider })).toBe(true);
    }
    expect(accepts(tool, { target: "example.com", provider: "waybackmachine" })).toBe(false);
  });

  it("takes a batch of targets up to the shared executor cap", async () => {
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");
    const properties = schemaProperties(tool);
    const batch = (length: number) => Array.from({ length }, (_, index) => `${index}.example`);

    expect(properties["target"]?.["description"]).toBe(SNAPSHOT_TARGET_HINT);
    expect(accepts(tool, { target: batch(MAX_SNAPSHOT_TARGETS) })).toBe(true);
    expect(accepts(tool, { target: batch(MAX_SNAPSHOT_TARGETS + 1) })).toBe(false);
    expect(accepts(tool, { target: [] })).toBe(false);
    expect(accepts(tool, { target: ["example.com", ""] })).toBe(false);
  });

  it("answers a batch with one block per target", async () => {
    vi.mocked($fetch)
      .mockResolvedValueOnce([
        ["original", "timestamp", "statuscode"],
        ["https://example.com/", "20200101000000", "200"],
      ])
      .mockResolvedValueOnce([["original", "timestamp", "statuscode"]]);
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");

    const result = await tool.execute(
      "test",
      { target: ["example.com", "example.org"], provider: "wayback", cache: false, concurrency: 1 },
      undefined,
      undefined,
      unusedContext,
    );

    const answer = result.content.map((part) => (part.type === "text" ? part.text : "")).join("");
    expect(answer).toContain('[provider=wayback] 1 snapshot(s) for "example.com"');
    expect(answer).toContain(
      '\n\n[provider=wayback] 0 snapshot(s) for "example.org"\nNo snapshots.',
    );
  });

  it("narrows a Wayback query to the requested window", async () => {
    vi.mocked($fetch).mockResolvedValueOnce([["original", "timestamp", "statuscode"]]);
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");

    expect(accepts(tool, { target: "example.com", from: "2019", to: "2019-06" })).toBe(true);

    await tool.execute(
      "test",
      {
        target: "example.com",
        provider: "wayback",
        from: "2019-03-01",
        to: "2019-06",
        cache: false,
      },
      undefined,
      undefined,
      unusedContext,
    );

    expect($fetch).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      objectContaining({
        params: objectContaining({ from: "20190301", to: "201906" }),
      }),
    );
  });

  it("dispatches Archive-It requests with the required collection", async () => {
    vi.mocked($fetch).mockResolvedValueOnce("https://example.com/ 20220101000000 200");
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");

    const result = await tool.execute(
      "test",
      { target: "example.com", provider: "archiveIt", collection: " 4399 ", cache: false },
      undefined,
      undefined,
      unusedContext,
    );

    expect($fetch).toHaveBeenCalledWith(
      "/4399/timemap/cdx",
      objectContaining({ baseURL: "https://wayback.archive-it.org" }),
    );
    expect(result.details).toMatchObject({
      provider: "archiveIt",
      response: { success: true, _meta: { provider: "archive-it" } },
    });
  });

  it("rejects Archive-It requests without a collection", async () => {
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");

    await expect(
      tool.execute(
        "test",
        { target: "example.com", provider: "archiveIt" },
        undefined,
        undefined,
        unusedContext,
      ),
    ).rejects.toThrow("provider=archiveIt requires a numeric collection id");
    expect($fetch).not.toHaveBeenCalled();
  });

  it("dispatches Conifer requests with the required collection identity", async () => {
    vi.mocked($fetch).mockResolvedValueOnce({ results: [] });
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");

    const result = await tool.execute(
      "test",
      {
        target: "example.com",
        provider: "conifer",
        user: " user ",
        collection: " collection ",
        cache: false,
      },
      undefined,
      undefined,
      unusedContext,
    );

    expect($fetch).toHaveBeenCalledWith(
      "/api/v1/url_search",
      objectContaining({
        baseURL: "https://conifer.rhizome.org",
        params: { user: "user", coll: "collection", url: "example.com" },
      }),
    );
    expect(result.details).toMatchObject({
      provider: "conifer",
      response: { success: true, _meta: { provider: "conifer" } },
    });
  });

  it("rejects Conifer requests without a user", async () => {
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");

    await expect(
      tool.execute(
        "test",
        { target: "example.com", provider: "conifer", collection: "collection" },
        undefined,
        undefined,
        unusedContext,
      ),
    ).rejects.toThrow("provider=conifer requires user and collection slugs");
    expect($fetch).not.toHaveBeenCalled();
  });

  it("removes terminal control bytes from rendered untrusted arguments", async () => {
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");
    const renderCall = tool.renderCall;
    if (!renderCall) throw new Error("archives_snapshots has no call renderer");

    type RenderCall = NonNullable<ToolDefinition["renderCall"]>;
    type RenderTheme = Parameters<RenderCall>[2];
    const theme = {
      fg: (_color: string, text: string) => text,
      styledSymbol: (symbol: string) => symbol,
    } as unknown as RenderTheme;
    const component = renderCall(
      { target: "safe\u001B]52;c;SGVsbG8=\u0007.example" },
      { expanded: false, isPartial: false },
      theme,
    );
    const rendered = component.render(120).join("\n");

    expect(rendered).toContain("safe.example");
    expect(rendered).not.toContain("SGVsbG8=");
    expect(rendered.split("\n")).toHaveLength(1);
    // oxlint-disable-next-line no-control-regex -- This assertion proves the terminal boundary.
    expect(rendered).not.toMatch(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/u);
  });

  /** A windowed call must not preview like a full-archive scan. */
  it("shows the requested window in the call preview", async () => {
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");
    const renderCall = tool.renderCall;
    if (!renderCall) throw new Error("archives_snapshots has no call renderer");

    type RenderCall = NonNullable<ToolDefinition["renderCall"]>;
    type RenderTheme = Parameters<RenderCall>[2];
    const theme = {
      fg: (_color: string, text: string) => text,
      styledSymbol: (symbol: string) => symbol,
    } as unknown as RenderTheme;
    const component = renderCall(
      { target: "example.com", from: "2019", to: "2019-06" },
      { expanded: false, isPartial: false },
      theme,
    );
    const rendered = component.render(200).join("\n");

    expect(rendered).toContain("from=2019");
    expect(rendered).toContain("to=2019-06");
  });

  it("keeps a newline in an argument from opening a second preview line", async () => {
    const tool = requireTool((await registerExtension()).tools, "archives_snapshots");
    const renderCall = tool.renderCall;
    if (!renderCall) throw new Error("archives_snapshots has no call renderer");

    type RenderCall = NonNullable<ToolDefinition["renderCall"]>;
    type RenderTheme = Parameters<RenderCall>[2];
    const theme = {
      fg: (_color: string, text: string) => text,
      styledSymbol: (symbol: string) => symbol,
    } as unknown as RenderTheme;
    const component = renderCall(
      { target: "example.com", collection: "4399\nforged: value" },
      { expanded: false, isPartial: false },
      theme,
    );

    // Control bytes are not the only way to forge a line.
    expect(component.render(200).join("\n").split("\n")).toHaveLength(1);
  });

  it("lists provider status without network access", async () => {
    const tool = requireTool((await registerExtension()).tools, "archives_providers");

    const result = await tool.execute("test", {}, undefined, undefined, unusedContext);
    const text = result.content.find((part) => part.type === "text")?.text;

    expect(text).toContain("wayback");
    expect(text).toContain("archiveIt");
    expect(text).toContain("permacc");
  });
});
