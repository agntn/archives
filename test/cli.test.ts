import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const root = fileURLToPath(new URL("..", import.meta.url));
/** Node 22 before 22.18 strips types only with a flag; the bin keeps the bundle there. */
const stripsTypes = Boolean(process.features.typescript);

const { ARCHIVES_DIST: _inherited, ...env } = process.env;

/** Prints every module URL the child loaded to stderr as it exits. */
const recordLoads = `data:text/javascript,${encodeURIComponent(`
  import { registerHooks } from "node:module";
  const loaded = [];
  registerHooks({
    load(url, context, nextLoad) {
      loaded.push(url);
      return nextLoad(url, context);
    },
  });
  process.on("exit", () => process.stderr.write("\\nLOADED " + JSON.stringify(loaded) + "\\n"));
`)}`;

const initialize = `${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "archives-test", version: "1.0.0" },
  },
})}\n`;

/**
 * Tells where the server came from by the module URLs the child loaded.
 * @param base - Package root the bin sits in.
 * @param stderr - Child stderr ending with the `LOADED` line.
 * @returns {"bundle" | "source" | "unknown"} Which copy of `mcp` answered.
 */
function origin(base: string, stderr: string): "bundle" | "source" | "unknown" {
  const marker = stderr.lastIndexOf("\nLOADED ");
  const loaded: unknown = marker === -1 ? [] : JSON.parse(stderr.slice(marker + 8));
  const urls = Array.isArray(loaded) ? loaded.filter((url) => typeof url === "string") : [];
  const source = urls.includes(pathToFileURL(join(base, "src/mcp.ts")).href);
  const bundle = urls.includes(pathToFileURL(join(base, "dist/_chunks/mcp.mjs")).href);
  if (source && !bundle) return "source";
  if (bundle && !source) return "bundle";
  return "unknown";
}

/**
 * Runs `mcp` from a built bin, answers one initialize request and tells where the server came
 * from. stdin closes after the request, so the server exits on its own.
 * @param base - Package root the bin sits in.
 * @param options - Extra environment and Node flags for the child.
 * @param options.env - Environment on top of the inherited one.
 * @param options.flags - Node flags placed before the bin.
 * @returns {{ code: number | null, from: string, name: string | undefined, stderr: string }} The
 * exit code, where the server came from, the server name from the reply and stderr.
 */
function serve(
  base: string,
  options: Readonly<{ env?: Readonly<Record<string, string>>; flags?: readonly string[] }> = {},
) {
  const { status, stderr, stdout } = spawnSync(
    process.execPath,
    [...(options.flags ?? []), "--import", recordLoads, join(base, "dist/cli.mjs"), "mcp"],
    { encoding: "utf8", env: { ...env, ...options.env }, input: initialize, timeout: 20_000 },
  );
  const name = /"serverInfo":\{"name":"([^"]+)"/.exec(stdout)?.[1];
  return { code: status, from: origin(base, stderr), name, stderr };
}

/**
 * A run that answered the initialize request.
 * @param from - Where the server has to come from.
 * @returns {{ code: number, from: string, name: string }} The fields `serve` has to match.
 */
function served(from: "bundle" | "source") {
  return { code: 0, from, name: "archives" };
}

describe("src under plain Node", () => {
  it.skipIf(!stripsTypes)("imports every module without a loader", () => {
    const modules = globSync("src/**/*.ts", { cwd: root }).filter(
      (file) => file !== join("src", "cli.ts"),
    );
    const script = modules
      .map((file) => `await import(${JSON.stringify(pathToFileURL(join(root, file)).href)});`)
      .join("\n");
    const { status, stderr } = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: root,
      encoding: "utf8",
      env,
    });

    expect(modules.length).toBeGreaterThan(0);
    expect(stderr).toBe("");
    expect(status).toBe(0);
  });
});

describe.skipIf(!existsSync(join(root, "dist/cli.mjs")))("archives mcp from the built bin", () => {
  // typebox is only an optional peer, so the CLI, the MCP server and their types carry their own copy.
  it("bundles typebox instead of importing it", () => {
    const importers = globSync("dist/**/*.{mjs,d.mts}", { cwd: root }).filter((file) =>
      /(?:from|import)\s*\(?\s*["']typebox(?:\/[^"']*)?["']/u.test(
        readFileSync(join(root, file), "utf8"),
      ),
    );

    expect(importers).toEqual([]);
  });

  it.skipIf(!stripsTypes)("serves the live source inside a checkout", () => {
    expect(serve(root)).toMatchObject(served("source"));
  });

  it("keeps the bundle under ARCHIVES_DIST=1", () => {
    expect(serve(root, { env: { ARCHIVES_DIST: "1" } })).toMatchObject(served("bundle"));
  });

  it("keeps the bundle on a Node that does not strip types", () => {
    const run = serve(root, { flags: ["--no-experimental-strip-types"] });

    expect(run).toMatchObject(served("bundle"));
  });

  it("keeps the bundle when the package sits under node_modules", () => {
    // Node refuses to strip types there, so a copy that ships `src` still takes the bundle.
    const cache = join(root, "node_modules/.cache");
    mkdirSync(cache, { recursive: true });
    const nested = mkdtempSync(join(cache, "archives-cli-"));
    try {
      for (const entry of ["dist", "src", "package.json"]) {
        cpSync(join(root, entry), join(nested, entry), { recursive: true });
      }
      expect(serve(nested)).toMatchObject(served("bundle"));
    } finally {
      rmSync(nested, { recursive: true, force: true });
    }
  });

  it("keeps the bundle in a package that ships no src", () => {
    const packaged = mkdtempSync(join(tmpdir(), "archives-cli-"));
    try {
      for (const entry of ["dist", "packages", "package.json"]) {
        cpSync(join(root, entry), join(packaged, entry), { recursive: true });
      }
      symlinkSync(join(root, "node_modules"), join(packaged, "node_modules"), "dir");
      expect(serve(packaged)).toMatchObject(served("bundle"));
    } finally {
      rmSync(packaged, { recursive: true, force: true });
    }
  });
});
