import { fileURLToPath } from "node:url";
import oxfmt from "@agntn/ox/oxfmt";
import oxlint from "@agntn/ox/oxlint";
import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: {
    alias: {
      "#shared": fileURLToPath(new URL("./docs/shared", import.meta.url)),
      "@agntn/archives/tool-operations": fileURLToPath(
        new URL("./src/tool-operations.ts", import.meta.url),
      ),
      "@agntn/archives/mcp": fileURLToPath(new URL("./src/mcp.ts", import.meta.url)),
    },
  },
  /**
   * The docs tests import from `docs/`, whose tsconfig only references files that
   * `nuxt prepare` generates, so a fresh checkout has nothing there for the
   * transformer to load. Nothing in the tests needs those settings.
   */
  oxc: {
    tsconfig: false,
  },
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      reporter: ["text", "json", "html"],
    },
  },
  fmt: {
    ...oxfmt,
    /** changelogen writes CHANGELOG.md after the release checks, in a shape oxfmt rejects. */
    ignorePatterns: ["dist", "coverage", ".nuxt", ".output", "docs", "CHANGELOG.md"],
  },
  lint: {
    ...oxlint,
    rules: {
      ...oxlint.rules,
      "typescript/prefer-readonly-parameter-types": [
        "error",
        {
          allow: [
            /**
             * Public/provider DTOs stay mutable for compatibility; call sites use shallow readonly
             * views instead of changing the exported shapes.
             */
            {
              from: "file",
              name: [
                "ArchiveContentOptions",
                "ArchiveContentResponse",
                "ArchiveDiffOptions",
                "ArchiveInterface",
                "ArchiveItOptions",
                "ArchiveOptions",
                "ArchiveProvider",
                "ArchiveResponse",
                "ArchiveTodayOptions",
                "ArchivedContent",
                "ArchivedContentDiff",
                "ArchivedContentSummary",
                "ArchivedPage",
                "ArchivesConfig",
                "CommonCrawlOptions",
                "ConiferOptions",
                "MementoOptions",
                "PermaccOptions",
                "ProviderInput",
                "ProviderReference",
                "ResolveConfigOptions",
                "ToolResult",
                "WaybackOptions",
                "WebCiteOptions",
              ],
            },
            /** These internal accumulators are intentionally mutated while folding results. */
            { from: "file", name: ["ContentMergeState", "DiffWinner", "ListingMergeState"] },
            /** Platform and dependency contracts are not owned by this package. */
            {
              from: "lib",
              name: [
                "AbortSignal",
                "Headers",
                "ReadableStream",
                "ReadonlyMap",
                "Response",
                "RegExp",
                "Uint8Array",
                "URL",
              ],
            },
            { from: "package", name: "Driver", package: "unstorage" },
            {
              from: "package",
              name: ["ExtensionAPI", "ExtensionContext", "ToolDefinition"],
              package: "@earendil-works/pi-coding-agent",
            },
            {
              from: "package",
              name: ["ExtensionAPI", "ExtensionContext", "ToolDefinition"],
              package: "@oh-my-pi/pi-coding-agent",
            },
          ],
          ignoreInferredTypes: true,
        },
      ],
    },
    ignorePatterns: ["dist", "coverage", ".nuxt", ".output", "docs"],
  },
});
