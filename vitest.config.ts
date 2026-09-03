import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "#shared": fileURLToPath(new URL("./docs/shared", import.meta.url)),
      "@agntn/archives/tool-operations": fileURLToPath(
        new URL("./src/tool-operations.ts", import.meta.url),
      ),
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
});
