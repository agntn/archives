import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  extends: ["docus"],
  /**
   * The repo root is its own pnpm workspace with a Nuxt playground, so Nuxt must not
   * treat it as this site's workspace. Dependency hoisting in pnpm-workspace.yaml keeps
   * every Nuxt runtime package resolvable from docs/ for the same reason.
   */
  workspaceDir: fileURLToPath(new URL("./", import.meta.url)),
  devtools: { enabled: false },
  telemetry: false,
  site: {
    url: "https://archives.agntn.dev",
    name: "@agntn/archives",
  },
  llms: {
    domain: "https://archives.agntn.dev",
  },
  icon: {
    clientBundle: {
      icons: [
        "lucide:archive",
        "lucide:arrow-right",
        "lucide:arrow-up-right",
        "lucide:book-open",
        "lucide:bot",
        "lucide:check",
        "lucide:chevron-left",
        "lucide:chevron-right",
        "lucide:copy",
        "lucide:database",
        "lucide:code",
        "lucide:diff",
        "lucide:external-link",
        "lucide:eye",
        "lucide:file-text",
        "lucide:globe",
        "lucide:history",
        "lucide:landmark",
        "lucide:layers",
        "lucide:library",
        "lucide:link",
        "lucide:loader-circle",
        "lucide:lock",
        "lucide:play",
        "lucide:plus",
        "lucide:search",
        "lucide:settings-2",
        "lucide:shield-alert",
        "lucide:x",
        "simple-icons:github",
        "simple-icons:internetarchive",
        "simple-icons:npm",
        "vscode-icons:file-type-js",
        "vscode-icons:file-type-typescript",
        "vscode-icons:file-type-json",
        "vscode-icons:file-type-shell",
      ],
    },
  },
  colorMode: {
    preference: "dark",
  },
  /** Docus ships an MCP endpoint that needs the Cloudflare Agents SDK on Workers. The docs do not need it. */
  mcp: {
    enabled: false,
  },
  nitro: {
    preset: "cloudflare_module",
    /** The library reads config files through c12; the worker has no filesystem and no config files. */
    alias: {
      c12: fileURLToPath(new URL("./server/stubs/c12.ts", import.meta.url)),
    },
    compatibilityDate: "2026-09-03",
    prerender: {
      crawlLinks: true,
      routes: ["/", "/sitemap.xml", "/robots.txt", "/llms.txt", "/llms-full.txt"],
      ignore: ["/api"],
    },
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
  compatibilityDate: "2026-09-03",
  fonts: {
    families: [
      { name: "Space Grotesk", weights: [400, 500, 600] },
      { name: "Space Mono", weights: [400, 700] },
    ],
  },
  content: {
    database: {
      type: "d1",
      bindingName: "DB",
    },
    build: {
      markdown: {
        highlight: {
          theme: {
            default: "vitesse-light",
            light: "vitesse-light",
            dark: "vesper",
          },
        },
      },
    },
  },
});
