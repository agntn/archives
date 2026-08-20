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
import { DEFAULT_LIMIT, MAX_LIMIT, PROVIDER_HINT, PROVIDER_INPUTS } from "../src/tool-operations";
import type { ArchiveResponse } from "../src/types";

const archivesMock = vi.hoisted(() => ({
  archiveIt: vi.fn(),
  snapshots: vi.fn(),
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
      },
    ],
    wayback: async () => ({
      name: "Internet Archive Wayback Machine",
      slug: "wayback",
      snapshots: archivesMock.snapshots,
    }),
    archiveIt: archivesMock.archiveIt,
    archiveToday: async () => ({
      name: "archive.today",
      slug: "archive-today",
      snapshots: archivesMock.snapshots,
    }),
    commoncrawl: async () => ({
      name: "Common Crawl",
      slug: "commoncrawl",
      snapshots: archivesMock.snapshots,
    }),
    webcite: async () => ({ name: "WebCite", slug: "webcite", snapshots: archivesMock.snapshots }),
    permacc: async () => ({ name: "Perma.cc", slug: "permacc", snapshots: archivesMock.snapshots }),
  },
}));

type CommandDefinition = Parameters<ExtensionAPI["registerCommand"]>[1];

type CapturedRuntime = {
  tools: Map<string, ToolDefinition>;
  commands: Map<string, CommandDefinition>;
};

type ExecutableTool = {
  parameters: { properties?: Record<string, unknown> };
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: ExtensionContext,
  ) => Promise<AgentToolResult<unknown>>;
};

function loadExtension(): CapturedRuntime {
  const runtime: CapturedRuntime = {
    tools: new Map(),
    commands: new Map(),
  };
  const pi = {
    registerTool(tool: ToolDefinition) {
      runtime.tools.set(tool.name, tool);
    },
    registerCommand(name: string, command: CommandDefinition) {
      runtime.commands.set(name, command);
    },
  } satisfies Partial<ExtensionAPI>;

  archivesExtension(pi as ExtensionAPI);
  return runtime;
}

function getExecutableTool(runtime: CapturedRuntime, name: string): ExecutableTool {
  const tool = runtime.tools.get(name);
  expect(tool).toBeDefined();
  return tool as ExecutableTool;
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
  });

  afterEach(() => {
    restoreEnv("PERMA_CC_API_KEY");
    restoreEnv("PERMACC_API_KEY");
  });

  it("registers the expected tools and commands", () => {
    const runtime = loadExtension();

    expect([...runtime.tools.keys()].sort()).toEqual(["archives", "archives_providers"]);
    expect([...runtime.commands.keys()].sort()).toEqual(["archive", "archive-providers"]);
  });

  it("declares the schema bounds the shared executors enforce", () => {
    const tool = getExecutableTool(loadExtension(), "archives");
    const properties = tool.parameters.properties as Record<string, Record<string, unknown>>;

    // The parameters are declared before the executors can be loaded, so the
    // restated metadata has to match what src/tool-operations actually applies.
    expect(properties["limit"]).toMatchObject({ minimum: 1, maximum: MAX_LIMIT });
    expect(properties["limit"]?.["description"]).toContain(`Defaults to ${DEFAULT_LIMIT}.`);
    expect(properties["provider"]?.["description"]).toBe(PROVIDER_HINT);
    // Every spelling normalizeProvider accepts has to be offered, and no other.
    const offered = ((properties["provider"]?.["anyOf"] ?? []) as Array<{ const: string }>).map(
      (member) => member.const,
    );
    expect(offered.sort()).toEqual([...PROVIDER_INPUTS].sort());
  });

  it("does not expose arbitrary API-key or environment-variable parameters", () => {
    const runtime = loadExtension();
    const tool = getExecutableTool(runtime, "archives");

    expect(Object.keys(tool.parameters.properties ?? {})).not.toContain("apiKey");
    expect(Object.keys(tool.parameters.properties ?? {})).not.toContain("apiKeyEnv");
  });

  it("reports Perma.cc key presence without returning the secret value", async () => {
    process.env["PERMA_CC_API_KEY"] = "super-secret-test-key";
    const runtime = loadExtension();
    const tool = getExecutableTool(runtime, "archives_providers");

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
    const tool = getExecutableTool(loadExtension(), "archives");

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

  it("rejects a fractional limit that would reach the CDX query verbatim", () => {
    const tool = getExecutableTool(loadExtension(), "archives");
    const properties = tool.parameters.properties as Record<string, Record<string, unknown>>;

    expect(properties["limit"]?.["type"]).toBe("integer");
    expect(properties["target"]).toMatchObject({ minLength: 1 });
  });

  it("fails Perma.cc requests before network work when no fixed API-key env var is set", async () => {
    delete process.env["PERMA_CC_API_KEY"];
    delete process.env["PERMACC_API_KEY"];
    const runtime = loadExtension();
    const tool = getExecutableTool(runtime, "archives");

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
    const tool = getExecutableTool(loadExtension(), "archives");

    await tool.execute(
      "test",
      { target: "example.com", provider: "archiveIt", collection: " 4399 " },
      undefined,
      undefined,
      {} as ExtensionContext,
    );

    expect(archivesMock.archiveIt).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "4399" }),
    );
  });

  it("rejects Archive-It requests without a collection", async () => {
    const tool = getExecutableTool(loadExtension(), "archives");

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
