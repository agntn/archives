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
      ],
    },
  ],
});
