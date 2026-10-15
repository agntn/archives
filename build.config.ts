import { defineBuildConfig } from "obuild/config";

export default defineBuildConfig({
  entries: [
    {
      /** One bundle, so every entry answers from the same provider and executor modules in `_chunks/`. */
      type: "bundle",
      input: [
        "./src/index.ts",
        "./src/cli.ts",
        "./src/mcp.ts",
        "./src/tool-operations.ts",
        "./src/tools.ts",
        "./src/config-discovery.ts",
        "./src/config-discovery.browser.ts",
      ],
    },
  ],
  hooks: {
    /**
     * `diff` has no `sideEffects` flag, so in a chunk with `Archive` it rode into every bundle.
     * @param config - Output options obuild built; what `diff.ts` imports stays in its own chunks.
     */
    rolldownOutput(config) {
      if (typeof config.codeSplitting !== "object") return;
      config.codeSplitting.groups = [
        ...(config.codeSplitting.groups ?? []),
        { name: "diff", test: /\/src\/diff\.ts$/u, includeDependenciesRecursively: false },
      ];
    },
  },
});
