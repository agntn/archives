import { defineBuildConfig } from "obuild/config";

export default defineBuildConfig({
  // One bundle, four inputs: the entries share the chunks that hold the provider
  // factory and the tool executors. Separate bundles would each carry their own
  // copy, so the MCP server and the package entrypoint would answer from two
  // different module instances.
  entries: [
    {
      type: "bundle",
      input: ["./src/index.ts", "./src/cli.ts", "./src/mcp.ts", "./src/tool-operations.ts"],
    },
  ],
});
