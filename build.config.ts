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
  hooks: {
    // typebox stays inline: resolving and parsing it from node_modules costs the
    // MCP server more at every spawn than the bundled copy does. obuild marks
    // every dependency and peer dependency external, so the entries the default
    // adds for typebox are filtered back out here.
    rolldownConfig(config) {
      const externals = Array.isArray(config.external) ? config.external : [];
      config.external = externals.filter(
        (entry) => entry !== "typebox" && !(entry instanceof RegExp && entry.test("typebox/value")),
      );
    },
  },
});
