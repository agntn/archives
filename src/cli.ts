#!/usr/bin/env node

/** Archives CLI: a command per archive tool, plus `mcp`, which pins its config to home. */
import { existsSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "@agntn/tools/cli";
import { snapshotsCommand } from "./cli-commands.ts";
import type { serveStdio } from "./mcp-stdio.ts";
import { archivesTools } from "./tools.ts";
import { version } from "./version.ts";

/** The same file from `src/cli.ts` and `dist/cli.mjs`; the npm package ships only `dist`. */
const sourceStdio = new URL("../src/mcp-stdio.ts", import.meta.url);
const sourceStdioPath = fileURLToPath(sourceStdio);

/**
 * Narrows the module a runtime URL import returned, which TypeScript types as `any`.
 * @param value - The imported module namespace.
 * @returns {value is { serveStdio: typeof serveStdio }} Whether it exports the server.
 */
function isStdioModule(value: unknown): value is { serveStdio: typeof serveStdio } {
  return typeof value === "object" && value !== null && "serveStdio" in value;
}

/**
 * Inside a checkout the server comes from `src/`, so a change needs a restart, not `pnpm build`.
 * `node_modules`, a Node without type stripping and `ARCHIVES_DIST=1` keep the bundle.
 * @returns {Promise<typeof serveStdio>} What starts the stdio server.
 */
async function loadServer(): Promise<typeof serveStdio> {
  const fromSource =
    !import.meta.url.endsWith(".ts") &&
    process.env["ARCHIVES_DIST"] !== "1" &&
    Boolean(process.features.typescript) &&
    !sourceStdioPath.includes(`${sep}node_modules${sep}`) &&
    existsSync(sourceStdioPath);
  if (!fromSource) return (await import("./mcp-stdio.ts")).serveStdio;
  const module: unknown = await import(sourceStdio.href);
  if (!isStdioModule(module)) throw new TypeError(`${sourceStdioPath} has no serveStdio`);
  return module.serveStdio;
}

/**
 * Every refusal the executors make is an `Error` with a message meant for the caller.
 * @param error - What a command threw.
 * @returns {boolean} Whether it prints as one line instead of a stack trace.
 */
function isRefusal(error: unknown): boolean {
  return error instanceof Error;
}

/**
 * A bare `mcp` skips the one `runCli` adds, which reads the config of the client's cwd.
 * @param args - Every argument after the bin.
 * @returns {boolean} Whether the line is a bare `mcp`.
 */
function servesStdio(args: readonly string[]): boolean {
  return args.length === 1 && args[0] === "mcp";
}

const argv = process.argv.slice(2);
if (servesStdio(argv)) {
  await (
    await loadServer()
  )();
} else {
  await runCli(
    {
      name: "archives",
      version,
      description: "Unified interface for web archive providers",
      tools: archivesTools,
      commands: [snapshotsCommand],
      mcp: true,
      expected: isRefusal,
    },
    argv,
  );
}
