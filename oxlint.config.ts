import { defineConfig } from "oxlint";
import oxlint from "@agntn/ox/oxlint";

export default defineConfig({
  ...oxlint,
  rules: {
    ...oxlint.rules,
    "typescript/prefer-readonly-parameter-types": [
      "error",
      {
        allow: [
          // Public/provider DTOs stay mutable for compatibility; call sites use
          // shallow readonly views instead of changing the exported shapes.
          {
            from: "file",
            name: [
              "ArchiveContentOptions",
              "ArchiveContentResponse",
              "ArchiveInterface",
              "ArchiveItOptions",
              "ArchiveOptions",
              "ArchiveProvider",
              "ArchiveResponse",
              "ArchiveTodayOptions",
              "ArchivedContent",
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
          // These internal accumulators are intentionally mutated while folding results.
          { from: "file", name: ["ContentMergeState", "ListingMergeState"] },
          // Platform and dependency contracts are not owned by this package.
          {
            from: "lib",
            name: ["AbortSignal", "ReadableStream", "ReadonlyMap", "RegExp", "Uint8Array", "URL"],
          },
          {
            from: "package",
            name: ["FetchOptions", "FetchResponse"],
            package: "ofetch",
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
  ignorePatterns: ["dist", "coverage", ".nuxt", ".output"],
});
