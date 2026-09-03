import { defineConfig } from "vitest/config";

export default defineConfig({
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
