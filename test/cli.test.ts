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
  writeFileSync,
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
  /** OMP rewrites a bare typebox import, so schemas take `Type` from @agntn/tools. */
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

/* Runs the built bin with no stdin; `input` feeds `mcp` its JSON-RPC lines. */
function bin(
  args: readonly string[],
  options: Readonly<{ cwd?: string; env?: Readonly<Record<string, string>>; input?: string }> = {},
) {
  return spawnSync(process.execPath, [join(root, "dist/cli.mjs"), ...args], {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: { ...env, ...options.env },
    input: options.input ?? "",
    timeout: 20_000,
  });
}

describe.skipIf(!existsSync(join(root, "dist/cli.mjs")))("archives commands", () => {
  it("lists a command per tool, and mcp", () => {
    const { status, stdout } = bin(["--help"]);

    expect(status).toBe(0);
    for (const command of ["snapshots", "content", "diff", "providers", "mcp"]) {
      expect(stdout).toMatch(new RegExp(`^ {2}${command} `, "mu"));
    }
  });

  it("takes a snapshot target as a plain word, not JSON", () => {
    const { status, stderr } = bin(["snapshots", "example.com", "--provider", "webcite"]);

    expect(stderr).toContain('0 snapshot(s) for "example.com"');
    expect(stderr).toContain("Unsupported: WebCite has no list-by-domain API.");
    expect(status).toBe(1);
  });

  it("takes the diff target and periods as words and refuses on one line", () => {
    const { status, stderr } = bin(["diff", "example.com", "2019", "2018"]);

    expect(stderr).toBe("before must name a period earlier than after\n");
    expect(status).toBe(1);
  });
});

describe.skipIf(!existsSync(join(root, "dist/cli.mjs")))("archives mcp config", () => {
  const call = [
    initialize,
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "archives_snapshots",
        arguments: { target: "example.com", provider: "webcite" },
      },
    })}\n`,
  ].join("");

  /* Serves one tool call from `browsed` and returns the roots whose config ran. */
  function configRoots(dist: boolean, args: readonly string[] = ["mcp"]): string[] {
    const sandbox = mkdtempSync(join(tmpdir(), "archives-mcp-"));
    const log = join(sandbox, "runs.log");
    try {
      for (const dir of ["home", "browsed"]) {
        mkdirSync(join(sandbox, dir));
        writeFileSync(
          join(sandbox, dir, "archives.config.ts"),
          `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(log)}, ${JSON.stringify(`${dir}\n`)});\nexport default {};\n`,
        );
      }
      const { status, stdout } = bin(args, {
        cwd: join(sandbox, "browsed"),
        env: { HOME: join(sandbox, "home"), ...(dist ? { ARCHIVES_DIST: "1" } : {}) },
        input: call,
      });
      expect(status).toBe(0);
      expect(stdout).toContain('"id":2');
      return existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }

  it("runs the home config from the bundle, never the client's cwd", () => {
    expect(configRoots(true)).toEqual(["home"]);
  });

  it.skipIf(!stripsTypes)("runs the home config from the source too", () => {
    expect(configRoots(false)).toEqual(["home"]);
  });

  it("runs the home config after an option terminator", () => {
    expect(configRoots(true, ["mcp", "--"])).toEqual(["home"]);
  });
});

describe.skipIf(!existsSync(join(root, "dist/mcp.mjs")))("a host embedding the bundle", () => {
  it("runs the config of the root it pinned, not of its cwd", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "archives-host-"));
    const pinned = join(sandbox, "pinned");
    const browsed = join(sandbox, "browsed");
    try {
      for (const dir of [pinned, browsed]) {
        mkdirSync(dir);
        writeFileSync(
          join(dir, "archives.config.ts"),
          `(globalThis.configRuns ??= []).push(${JSON.stringify(dir)});\nexport default {};\n`,
        );
      }
      const entry = (file: string): string => JSON.stringify(pathToFileURL(join(root, file)).href);
      const host = `
        import { setConfigCwd } from ${entry("dist/index.mjs")};
        import { callTool } from ${entry("dist/mcp.mjs")};
        setConfigCwd(${JSON.stringify(pinned)});
        await callTool("archives_snapshots", { target: "example.com", provider: "webcite" });
        process.stdout.write(JSON.stringify(globalThis.configRuns ?? []));
      `;

      const { stdout, stderr, status } = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", host],
        { cwd: browsed, env, encoding: "utf8" },
      );

      expect(stderr).toBe("");
      expect(status).toBe(0);
      expect(stdout).toBe(JSON.stringify([pinned]));
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
