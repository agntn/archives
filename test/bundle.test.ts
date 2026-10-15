import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite-plus";
import { describe, expect, it } from "vite-plus/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const entry = join(root, "dist/index.mjs");

/* Bundles `names` from the built package into a Vite app and lists the packages that came along. */
async function bundledPackages(names: readonly string[]): Promise<string[]> {
  const app = mkdtempSync(join(tmpdir(), "archives-consumer-"));
  try {
    const main = join(app, "main.js");
    writeFileSync(main, `export { ${names.join(", ")} } from ${JSON.stringify(entry)};\n`);
    const result = await build({
      root: app,
      configFile: false,
      logLevel: "silent",
      build: {
        write: false,
        lib: { entry: main, formats: ["es"] },
        rolldownOptions: { external: [/^@agntn\//u, /^node:/u] },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((bundle) =>
      "output" in bundle ? bundle.output : [],
    );
    const packages = outputs.flatMap((chunk) =>
      "modules" in chunk
        ? Object.keys(chunk.modules).map(
            (id) => /.*\/node_modules\/((?:@[^/]+\/)?[^/]+)/u.exec(id)?.[1],
          )
        : [],
    );
    return [...new Set(packages.filter((name) => name !== undefined))].sort();
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
}

describe.skipIf(!existsSync(entry))("a Vite app bundling the package", () => {
  it("leaves the diff engine out when it never compares captures", async () => {
    const packages = await bundledPackages(["createArchive", "providers"]);

    expect(packages).toContain("unstorage");
    expect(packages).not.toContain("diff");
  });

  it("compares captures without pulling in the archive and its storage", async () => {
    const packages = await bundledPackages(["diffArchivedContent"]);

    expect(packages).toContain("diff");
    expect(packages).not.toContain("unstorage");
  });
});
