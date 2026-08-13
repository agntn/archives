import type {
	AgentToolResult,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import archivesExtension from "../packages/pi/extensions/archives";
import type { ArchiveResponse } from "../src/types";

const archivesMock = vi.hoisted(() => ({
	snapshots: vi.fn(),
}));

vi.mock("@agntn/archives", () => ({
	createArchive: () => ({ snapshots: archivesMock.snapshots }),
	providers: {
		wayback: async () => ({ name: "Internet Archive Wayback Machine", slug: "wayback", snapshots: archivesMock.snapshots }),
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
	beforeEach(() => {
		archivesMock.snapshots.mockReset();
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

		expect(text).toContain("PERMA_CC_API_KEY is set");
		expect(text).not.toContain("super-secret-test-key");
	});

	it("fails Perma.cc requests before network work when no fixed API-key env var is set", async () => {
		delete process.env["PERMA_CC_API_KEY"];
		delete process.env["PERMACC_API_KEY"];
		const runtime = loadExtension();
		const tool = getExecutableTool(runtime, "archives");

		await expect(
			tool.execute("test", { target: "example.com", provider: "permacc" }, undefined, undefined, {} as ExtensionContext),
		).rejects.toThrow("Perma.cc provider requires an API key in PERMA_CC_API_KEY or PERMACC_API_KEY");
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
