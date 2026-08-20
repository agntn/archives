import * as TypeBox from "@oh-my-pi/omptype/typebox";
import { $fetch } from "ofetch";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import archivesOmpExtension from "../packages/omp/extensions/archives.js";
import { MAX_CONTENT_CHARS, MAX_LIMIT, PROVIDER_INPUTS } from "../src/tool-operations";

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

function registerExtension(): RegisteredExtension {
  const tools = new Map<string, ToolDefinition>();
  const commands: string[] = [];
  let label: string | undefined;
  const api = {
    pi: { Text: TestText },
    typebox: TypeBox,
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
  archivesOmpExtension(api as unknown as ExtensionAPI);
  return { label, tools, commands };
}

function requireTool(tools: Map<string, ToolDefinition>, name: string): ToolDefinition {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}
function accepts(tool: ToolDefinition, value: unknown): boolean {
  // SAFETY: the test host injects OMP's TypeBox facade, which creates this schema.
  return (tool.parameters as unknown as TypeBox.TSchema).safeParse(value).success;
}

// SAFETY: archives_providers does not read ExtensionContext.
const unusedContext = {} as ExtensionContext;

describe("archives OMP extension", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("registers read-only tools and interactive commands", () => {
    const { label, tools, commands } = registerExtension();

    expect(label).toBe("Archives");
    expect([...tools.keys()]).toEqual(["archives", "archives_content", "archives_providers"]);
    expect(commands).toEqual(["archive", "archive-providers"]);
    for (const tool of tools.values()) expect(tool.approval).toBe("read");
  });

  it("declares the content bounds the shared executors enforce", () => {
    const tool = requireTool(registerExtension().tools, "archives_content");

    expect(accepts(tool, { target: "example.com" })).toBe(true);
    expect(accepts(tool, { target: "example.com", format: "text" })).toBe(true);
    expect(accepts(tool, { target: "example.com", format: "raw" })).toBe(true);
    expect(accepts(tool, { target: "example.com", format: "markdown" })).toBe(false);
    expect(accepts(tool, { target: "example.com", maxChars: MAX_CONTENT_CHARS })).toBe(true);
    expect(accepts(tool, { target: "example.com", maxChars: MAX_CONTENT_CHARS + 1 })).toBe(false);
    expect(accepts(tool, { target: "example.com", maxChars: 10.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", timestamp: "2019-03-01" })).toBe(true);
    for (const provider of PROVIDER_INPUTS) {
      expect(accepts(tool, { target: "example.com", provider })).toBe(true);
    }
  });
  it("rejects fractional numeric parameters", () => {
    const tool = requireTool(registerExtension().tools, "archives");

    expect(accepts(tool, { target: "example.com", limit: 1 })).toBe(true);
    expect(accepts(tool, { target: "example.com", limit: 1.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", concurrency: 1.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", batchSize: 1.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", retries: 0.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", ttl: 0.5 })).toBe(false);
    expect(accepts(tool, { target: "example.com", timeout: 1.5 })).toBe(false);
  });

  it("bounds limit where the shared executors reject it", () => {
    const tool = requireTool(registerExtension().tools, "archives");

    // The parameters are declared before the executors can be loaded, so the
    // restated bound has to match what src/tool-operations actually enforces.
    expect(accepts(tool, { target: "example.com", limit: MAX_LIMIT })).toBe(true);
    expect(accepts(tool, { target: "example.com", limit: MAX_LIMIT + 1 })).toBe(false);
    for (const provider of PROVIDER_INPUTS) {
      expect(accepts(tool, { target: "example.com", provider })).toBe(true);
    }
    expect(accepts(tool, { target: "example.com", provider: "waybackmachine" })).toBe(false);
  });

  it("dispatches Archive-It requests with the required collection", async () => {
    vi.mocked($fetch).mockResolvedValueOnce("https://example.com/ 20220101000000 200");
    const tool = requireTool(registerExtension().tools, "archives");

    const result = await tool.execute(
      "test",
      { target: "example.com", provider: "archiveIt", collection: " 4399 ", cache: false },
      undefined,
      undefined,
      unusedContext,
    );

    expect($fetch).toHaveBeenCalledWith(
      "/4399/timemap/cdx",
      expect.objectContaining({ baseURL: "https://wayback.archive-it.org" }),
    );
    expect(result.details).toMatchObject({
      provider: "archiveIt",
      response: { success: true, _meta: { provider: "archive-it" } },
    });
  });

  it("rejects Archive-It requests without a collection", async () => {
    const tool = requireTool(registerExtension().tools, "archives");

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

  it("removes terminal control bytes from rendered untrusted arguments", () => {
    const tool = requireTool(registerExtension().tools, "archives");
    const renderCall = tool.renderCall;
    if (!renderCall) throw new Error("archives has no call renderer");

    type RenderCall = NonNullable<ToolDefinition["renderCall"]>;
    type RenderTheme = Parameters<RenderCall>[2];
    const theme = {
      bold: (text: string) => text,
      fg: (_color: string, text: string) => text,
    } as unknown as RenderTheme;
    const component = renderCall(
      { target: "safe\u001b]52;c;SGVsbG8=\u0007.example" },
      { expanded: false, isPartial: false },
      theme,
    );
    const rendered = component.render(120).join("\n");

    expect(rendered).toContain("safe]52;c;SGVsbG8=.example");
    expect(rendered.split("\n")).toHaveLength(1);
    // oxlint-disable-next-line no-control-regex -- This assertion proves the terminal boundary.
    expect(rendered).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u);
  });

  it("keeps a newline in an argument from opening a second preview line", () => {
    const tool = requireTool(registerExtension().tools, "archives");
    const renderCall = tool.renderCall;
    if (!renderCall) throw new Error("archives has no call renderer");

    type RenderCall = NonNullable<ToolDefinition["renderCall"]>;
    type RenderTheme = Parameters<RenderCall>[2];
    const theme = {
      bold: (text: string) => text,
      fg: (_color: string, text: string) => text,
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
    const tool = requireTool(registerExtension().tools, "archives_providers");

    const result = await tool.execute("test", {}, undefined, undefined, unusedContext);
    const text = result.content.find((part) => part.type === "text")?.text;

    expect(text).toContain("wayback");
    expect(text).toContain("archiveIt");
    expect(text).toContain("permacc");
  });
});
