import { defineConfig } from "oxfmt";
import oxfmt from "@agntn/ox/oxfmt";

export default defineConfig({
  ...oxfmt,
  ignorePatterns: ["dist", "coverage", ".nuxt", ".output"],
});
