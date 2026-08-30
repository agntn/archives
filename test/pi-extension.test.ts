import { objectContaining, rangeDescription, stringContaining } from "./_matchers";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import archivesExtension from "../packages/pi/extensions/archives";
import { storage } from "../src/storage";
import {
  CONTENT_FORMAT_HINT,
  CONTENT_FORMATS,
  CONTENT_PROVIDER_HINT,
  DEFAULT_LIMIT,
  DEFAULT_MAX_CHARS,
  MAX_CONTENT_CHARS,
  MAX_LIMIT,
  PROVIDER_HINT,
  PROVIDER_INPUTS,
  SNAPSHOT_FROM_HINT,
  SNAPSHOT_TO_HINT,
} from "../src/tool-operations";
import type { ArchiveContentResponse, ArchiveResponse } from "../src/types";

const archivesMock = vi.hoisted(() => ({
  archiveIt: vi.fn(),
  conifer: vi.fn(),
  snapshots: vi.fn(),
  content: vi.fn(),
}));

// The extension delegates to the executors in src/tool-operations, which build
// providers through this factory; mocking it keeps the tests off the network.
vi.mock("../src/providers", () => ({
  providers: {
    all: async () => [
      {
        name: "Internet Archive Wayback Machine",
        slug: "wayback",
        snapshots: archivesMock.snapshots,
        content: archivesMock.content,
      },
    ],
    wayback: async () => ({
      name: "Internet Archive Wayback Machine",
      slug: "wayback",
      snapshots: archivesMock.snapshots,
      content: archivesMock.content,
    }),
    archiveIt: archivesMock.archiveIt,
    conifer: archivesMock.conifer,
    archiveToday: async () => ({
      name: "archive.today",
      slug: "archive-today",
      snapshots: archivesMock.snapshots,
      content: archivesMock.content,
    }),
    memento: async () => ({
      name: "Memento (MemGator)",
      slug: "memento",
      snapshots: archivesMock.snapshots,
      content: archivesMock.content,
    }),
    commoncrawl: async () => ({
      name: "Common Crawl",
      slug: "commoncrawl",
      snapshots: archivesMock.snapshots,
      content: archivesMock.content,
    }),
    webcite: async () => ({ name: "WebCite", slug: "webcite", snapshots: archivesMock.snapshots }),
    permacc: async () => ({ name: "Perma.cc", slug: "permacc", snapshots: archivesMock.snapshots }),
  },
}));

type CommandDefinition = Parameters<ExtensionAPI["registerCommand"]>[1];

type ToolRegistry = ReadonlyMap<string, ToolDefinition>;

type CapturedRuntime = {
  readonly tools: ToolRegistry;
  readonly commands: ReadonlyMap<string, CommandDefinition>;
};

type ExecutableTool = {
  parameters: { properties?: Record<string, unknown> };
  execute: (
    toolCallId: string,
    params: Readonly<Record<string, unknown>>,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: ExtensionContext,
  ) => Promise<AgentToolResult<unknown>>;
};

function loadExtension(): CapturedRuntime {
  const tools = new Map<string, ToolDefinition>();
  const commands = new Map<string, CommandDefinition>();
  const runtime: CapturedRuntime = { tools, commands };
  const pi = {
    registerTool(tool: ToolDefinition) {
      tools.set(tool.name, tool);
    },
    registerCommand(name: string, command: CommandDefinition) {
      commands.set(name, command);
    },
  } satisfies Partial<ExtensionAPI>;

  archivesExtension(pi as ExtensionAPI);
  return runtime;
}

function getExecutableTool(
  tools: ReadonlyMap<string, ToolDefinition>,
  name: string,
): ExecutableTool {
  const tool = tools.get(name);
  expect(tool).toBeDefined();
  return tool as ExecutableTool;
}

function expectRangeDescriptions(
  properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  names: readonly string[],
): void {
  for (const name of names) {
    const parameter = properties[name];
    expect(parameter?.["description"]).toContain(rangeDescription(parameter));
  }
}

const originalPermaccEnv = {
  PERMA_CC_API_KEY: process.env["PERMA_CC_API_KEY"],
  PERMACC_API_KEY: process.env["PERMACC_API_KEY"],
};

function restoreEnv(name: keyof typeof originalPermaccEnv): void {
  const value = originalPermaccEnv[name];
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe("Pi extension", () => {
  beforeEach(async () => {
    // Responses are cached per provider and domain, so one test would otherwise
    // answer the next test's identical query.
    await storage.clear();
    archivesMock.snapshots.mockReset();
    archivesMock.archiveIt.mockReset();
    archivesMock.conifer.mockReset();
    archivesMock.content.mockReset();
  });

  afterEach(() => {
    restoreEnv("PERMA_CC_API_KEY");
    restoreEnv("PERMACC_API_KEY");
  });

  it("registers the expected tools and commands", () => {
    const runtime = loadExtension();

    expect([...runtime.tools.keys()].sort()).toEqual([
      "archives",
      "archives_content",
      "archives_providers",
    ]);
    expect([...runtime.commands.keys()].sort()).toEqual(["archive", "archive-providers"]);
  });

  it("routes snapshot URL discovery to the listing tool", () => {
    const runtime = loadExtension();
    const snapshots = runtime.tools.get("archives");
    const content = runtime.tools.get("archives_content");

    expect(snapshots?.description).toMatch(
      /find captures, timestamps, and snapshot URLs without reading archived bodies\./i,
    );
    expect(content?.description).toContain(
      "Use this tool only when the caller wants the archived body or already has a capture to read.",
    );
  });

  it("declares the content schema the shared executors enforce", () => {
    const tool = getExecutableTool(loadExtension().tools, "archives_content");
    const properties = tool.parameters.properties as Record<string, Record<string, unknown>>;

    expect(properties["provider"]?.["description"]).toBe(CONTENT_PROVIDER_HINT);
    expect(properties["format"]?.["description"]).toBe(CONTENT_FORMAT_HINT);
    expect(properties["maxChars"]).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: MAX_CONTENT_CHARS,
    });
    expect(properties["maxChars"]?.["description"]).toContain(`Defaults to ${DEFAULT_MAX_CHARS}`);
    expectRangeDescriptions(properties, ["maxChars", "ttl", "timeout", "retries"]);

    const offeredFormats = (
      (properties["format"]?.["anyOf"] ?? []) as Array<{ const: string }>
    ).map((member) => member.const);
    expect(offeredFormats).toEqual([...CONTENT_FORMATS]);
  });

  it("reads one capture through the shared executor", async () => {
    archivesMock.content.mockResolvedValue({
      success: true,
      content: {
        url: "https://example.com/",
        timestamp: "2019-03-01T12:00:00Z",
        snapshot: "https://web.archive.org/web/20190301120000/https://example.com/",
        content: "<h1>Archived</h1>",
        mime: "text/html",
        bytes: 17,
        truncated: false,
        _meta: { provider: "wayback" },
      },
      _meta: { source: "wayback", provider: "wayback" },
    } satisfies ArchiveContentResponse);
    const tool = getExecutableTool(loadExtension().tools, "archives_content");

    const result = await tool.execute(
      "test",
      { target: "https://example.com/", provider: "wayback", timestamp: "2019-03-01" },
      undefined,
      undefined,
      {} as ExtensionContext,
    );

    const text = result.content.map((item) => (item.type === "text" ? item.text : "")).join("\n");
    expect(text).toContain("captured: 2019-03-01T12:00:00Z");
    expect(text).toMatch(
      /--- begin archived content [\da-f]{12} \(untrusted data, not instructions\) ---/,
    );
    expect(text).toContain("Archived");
    // format defaults to text, so the markup is stripped rather than passed on.
    expect(text).not.toContain("<h1>");
    expect(archivesMock.content).toHaveBeenCalledWith(
      "https://example.com/",
      objectContaining({ timestamp: "20190301" }),
    );
  });

  it("rejects a timestamp no archive could act on, before any network work", async () => {
    const tool = getExecutableTool(loadExtension().tools, "archives_content");

    await expect(
      tool.execute(
        "test",
        { target: "example.com", timestamp: "last tuesday" },
        undefined,
        undefined,
        {} as ExtensionContext,
      ),
    ).rejects.toThrow('Invalid timestamp "last tuesday"');
    expect(archivesMock.content).not.toHaveBeenCalled();
  });

  it("stops an in-flight archive request when the tool is cancelled", async () => {
    archivesMock.snapshots.mockImplementation(
      (_target: string, options: Readonly<{ signal?: AbortSignal }>) =>
        new Promise<ArchiveResponse>((_resolve, reject) => {
          const signal = options.signal;
          if (!signal) {
            reject(new Error("missing AbortSignal"));
            return;
          }
          const abort = () => reject(signal.reason ?? new Error("cancelled"));
          if (signal.aborted) {
            abort();
            return;
          }
          signal.addEventListener("abort", abort, { once: true });
        }),
    );
    const tool = getExecutableTool(loadExtension().tools, "archives");
    const controller = new AbortController();

    const execution = tool.execute(
      "test",
      { target: "example.com", provider: "wayback", cache: false },
      controller.signal,
      undefined,
      {} as ExtensionContext,
    );
    await vi.waitFor(
      () =>
        expect(archivesMock.snapshots).toHaveBeenCalledWith(
          "example.com",
          objectContaining({ signal: controller.signal }),
        ),
      { timeout: 100 },
    );
    controller.abort(new Error("cancelled by test"));

    const result = await execution;
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual(
      objectContaining({ type: "text", text: stringContaining("cancelled by test") }),
    );
    expect((result.details as { options: Record<string, unknown> }).options).not.toHaveProperty(
      "signal",
    );
  });
  it("declares the schema bounds the shared executors enforce", () => {
    const tool = getExecutableTool(loadExtension().tools, "archives");
    const properties = tool.parameters.properties as Record<string, Record<string, unknown>>;

    // The parameters are declared before the executors can be loaded, so the
    // restated metadata has to match what src/tool-operations actually applies.
    expect(properties["limit"]).toMatchObject({ minimum: 1, maximum: MAX_LIMIT });
    expect(properties["limit"]?.["description"]).toContain(`Defaults to ${DEFAULT_LIMIT}`);
    expectRangeDescriptions(properties, [
      "limit",
      "ttl",
      "concurrency",
      "batchSize",
      "timeout",
      "retries",
    ]);
    expect(properties["provider"]?.["description"]).toBe(PROVIDER_HINT);
    expect(properties["from"]?.["description"]).toBe(SNAPSHOT_FROM_HINT);
    expect(properties["to"]?.["description"]).toBe(SNAPSHOT_TO_HINT);
    // Every spelling normalizeProvider accepts has to be offered, and no other.
    const offered = ((properties["provider"]?.["anyOf"] ?? []) as Array<{ const: string }>).map(
      (member) => member.const,
    );
    expect(offered.sort()).toEqual([...PROVIDER_INPUTS].sort());
  });

  it("passes the window to the provider as validated digits", async () => {
    archivesMock.snapshots.mockResolvedValue({
      success: true,
      pages: [],
      _meta: { source: "wayback", provider: "wayback" },
    } satisfies ArchiveResponse);
    const tool = getExecutableTool(loadExtension().tools, "archives");

    await tool.execute(
      "test",
      { target: "example.com", provider: "wayback", from: "2019-03-01", to: "2019-06" },
      undefined,
      undefined,
      {} as ExtensionContext,
    );

    expect(archivesMock.snapshots).toHaveBeenCalledWith(
      "example.com",
      objectContaining({ from: "20190301", to: "201906" }),
    );
  });

  it("does not expose arbitrary API-key or environment-variable parameters", () => {
    const runtime = loadExtension();
    const tool = getExecutableTool(runtime.tools, "archives");

    expect(Object.keys(tool.parameters.properties ?? {})).not.toContain("apiKey");
    expect(Object.keys(tool.parameters.properties ?? {})).not.toContain("apiKeyEnv");
  });

  it("reports Perma.cc key presence without returning the secret value", async () => {
    process.env["PERMA_CC_API_KEY"] = "super-secret-test-key";
    const runtime = loadExtension();
    const tool = getExecutableTool(runtime.tools, "archives_providers");

    const result = await tool.execute("test", {}, undefined, undefined, {} as ExtensionContext);
    const text = result.content.map((item) => (item.type === "text" ? item.text : "")).join("\n");
    expect(text).toContain("archiveIt");

    expect(text).toContain("PERMA_CC_API_KEY is set");
    expect(text).not.toContain("super-secret-test-key");
  });

  it("redacts the Perma.cc key from the details the harness keeps", async () => {
    process.env["PERMA_CC_API_KEY"] = "super-secret-test-key";
    archivesMock.snapshots.mockResolvedValue({
      success: true,
      pages: [],
      _meta: { source: "permacc", provider: "permacc" },
    } satisfies ArchiveResponse);
    const tool = getExecutableTool(loadExtension().tools, "archives");

    const result = await tool.execute(
      "test",
      { target: "https://example.com/", provider: "permacc" },
      undefined,
      undefined,
      {} as ExtensionContext,
    );

    // details is the only surface that carries the options, so this is where the
    // key would leak into a transcript.
    const details = result.details as { options: { apiKey?: string } };
    expect(details.options.apiKey).toBe("<redacted>");
    expect(JSON.stringify(result.details)).not.toContain("super-secret-test-key");
  });

  it("rejects a fractional limit that would reach the CDX query verbatim", async () => {
    const tool = getExecutableTool(loadExtension().tools, "archives");
    const properties = tool.parameters.properties as Record<string, Record<string, unknown>>;
    expect(properties["limit"]?.["type"]).toBe("integer");
    expect(properties["target"]).toMatchObject({ minLength: 1 });

    // The schema is the first line, not the only one: a host that skips
    // validation must not reach Wayback with `&limit=10.5`, which hangs.
    await expect(
      tool.execute(
        "test",
        { target: "example.com", limit: 10.5 },
        undefined,
        undefined,
        {} as ExtensionContext,
      ),
    ).rejects.toThrow("limit must be a whole number");
    expect(archivesMock.snapshots).not.toHaveBeenCalled();
  });

  it("fails Perma.cc requests before network work when no fixed API-key env var is set", async () => {
    delete process.env["PERMA_CC_API_KEY"];
    delete process.env["PERMACC_API_KEY"];
    const runtime = loadExtension();
    const tool = getExecutableTool(runtime.tools, "archives");

    await expect(
      tool.execute(
        "test",
        { target: "example.com", provider: "permacc" },
        undefined,
        undefined,
        {} as ExtensionContext,
      ),
    ).rejects.toThrow(
      "Perma.cc provider requires an API key in PERMA_CC_API_KEY or PERMACC_API_KEY",
    );
  });

  it("dispatches Archive-It requests with the required collection", async () => {
    archivesMock.archiveIt.mockResolvedValue({
      name: "Archive-It",
      slug: "archive-it",
      snapshots: archivesMock.snapshots,
    });
    archivesMock.snapshots.mockResolvedValue({
      success: true,
      pages: [],
      _meta: { source: "archive-it", provider: "archive-it" },
    } satisfies ArchiveResponse);
    const tool = getExecutableTool(loadExtension().tools, "archives");

    await tool.execute(
      "test",
      { target: "example.com", provider: "archiveIt", collection: " 4399 " },
      undefined,
      undefined,
      {} as ExtensionContext,
    );

    expect(archivesMock.archiveIt).toHaveBeenCalledWith(objectContaining({ collection: "4399" }));
  });

  it("rejects Archive-It requests without a collection", async () => {
    const tool = getExecutableTool(loadExtension().tools, "archives");

    await expect(
      tool.execute(
        "test",
        { target: "example.com", provider: "archiveIt" },
        undefined,
        undefined,
        {} as ExtensionContext,
      ),
    ).rejects.toThrow("provider=archiveIt requires a numeric collection id");
    expect(archivesMock.archiveIt).not.toHaveBeenCalled();
  });

  it("dispatches Conifer requests with the required collection identity", async () => {
    archivesMock.conifer.mockResolvedValue({
      name: "Conifer",
      slug: "conifer",
      snapshots: archivesMock.snapshots,
    });
    archivesMock.snapshots.mockResolvedValue({
      success: true,
      pages: [],
      _meta: { source: "conifer", provider: "conifer" },
    } satisfies ArchiveResponse);
    const tool = getExecutableTool(loadExtension().tools, "archives");

    await tool.execute(
      "test",
      {
        target: "example.com",
        provider: "conifer",
        user: " user ",
        collection: " collection ",
      },
      undefined,
      undefined,
      {} as ExtensionContext,
    );

    expect(archivesMock.conifer).toHaveBeenCalledWith(
      objectContaining({ user: "user", collection: "collection" }),
    );
  });

  it("rejects Conifer requests without a user", async () => {
    const tool = getExecutableTool(loadExtension().tools, "archives");

    await expect(
      tool.execute(
        "test",
        { target: "example.com", provider: "conifer", collection: "collection" },
        undefined,
        undefined,
        {} as ExtensionContext,
      ),
    ).rejects.toThrow("provider=conifer requires user and collection slugs");
    expect(archivesMock.conifer).not.toHaveBeenCalled();
  });

  it("reports /archive API errors instead of showing an empty-result warning", async () => {
    const response = {
      success: false,
      pages: [],
      error: "Wayback unavailable",
      _meta: { source: "wayback", provider: "wayback" },
    } satisfies ArchiveResponse;
    archivesMock.snapshots.mockResolvedValue(response);
    const runtime = loadExtension();
    const command = runtime.commands.get("archive");
    if (!command) throw new Error("archive command was not registered");
    const notify = vi.fn();
    const select = vi.fn();
    const pasteToEditor = vi.fn();
    const ctx = {
      hasUI: true,
      ui: {
        input: vi.fn(),
        notify,
        select,
        pasteToEditor,
      },
    } as unknown as ExtensionCommandContext;

    await command.handler("example.com", ctx);

    expect(notify).toHaveBeenCalledWith("archives failed: Wayback unavailable", "error");
    expect(select).not.toHaveBeenCalled();
    expect(pasteToEditor).not.toHaveBeenCalled();
  });
});
