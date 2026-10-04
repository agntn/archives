import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { archivesTheme } from "./shiki-theme";

/** Bundled from the checkout's sources: a deploy needs neither dist/ nor the root node_modules. */
const librarySource = resolve(import.meta.dirname, "../src");

export default defineNuxtConfig({
  extends: ["docus"],
  /**
   * The repo root is its own pnpm workspace with a Nuxt playground, so Nuxt must not
   * treat it as this site's workspace. Dependency hoisting in pnpm-workspace.yaml keeps
   * every Nuxt runtime package resolvable from docs/ for the same reason.
   */
  workspaceDir: fileURLToPath(new URL("./", import.meta.url)),
  alias: {
    "@agntn/archives/tool-operations": resolve(librarySource, "tool-operations.ts"),
    /** The tool listings and the executor `archives mcp` serves, for the MCP server at /mcp. */
    "@agntn/archives/mcp": resolve(librarySource, "mcp.ts"),
    "@agntn/archives": resolve(librarySource, "index.ts"),
  },
  devtools: { enabled: false },
  telemetry: false,
  site: {
    url: "https://archives.agntn.dev",
    name: "@agntn/archives",
  },
  llms: {
    domain: "https://archives.agntn.dev",
    sections: [
      {
        title: "MCP Server",
        description: "The tools of `archives mcp` and the page tools of this site over Streamable HTTP.",
        links: [
          {
            title: "MCP endpoint",
            href: "https://archives.agntn.dev/mcp",
            description:
              "Add it to any MCP client as an HTTP server, for example `claude mcp add --transport http archives https://archives.agntn.dev/mcp`.",
          },
        ],
      },
    ],
  },
  /** Docus pages define their own OG images; the alt text is the one thing they leave unset. */
  ogImage: {
    defaults: {
      alt: "@agntn/archives: one query, every archive",
    },
  },
  icon: {
    clientBundle: {
      icons: [
        "lucide:archive",
        "lucide:arrow-down",
        "lucide:arrow-left",
        "lucide:arrow-right",
        "lucide:arrow-up",
        "lucide:arrow-up-right",
        "lucide:book-open",
        "lucide:bookmark",
        "lucide:bookmark-check",
        "lucide:bot",
        "lucide:braces",
        "lucide:check",
        "lucide:check-circle",
        "lucide:chevron-down",
        "lucide:chevron-left",
        "lucide:chevron-right",
        "lucide:chevrons-up-down",
        "lucide:circle-alert",
        "lucide:circle-stop",
        "lucide:circle-x",
        "lucide:code",
        "lucide:columns-2",
        "lucide:copy",
        "lucide:database",
        "lucide:diff",
        "lucide:download",
        "lucide:expand",
        "lucide:external-link",
        "lucide:eye",
        "lucide:file-text",
        "lucide:git-compare",
        "lucide:git-compare-arrows",
        "lucide:globe",
        "lucide:history",
        "lucide:info",
        "lucide:landmark",
        "lucide:layers",
        "lucide:library",
        "lucide:lightbulb",
        "lucide:link",
        "lucide:list",
        "lucide:loader-circle",
        "lucide:lock",
        "lucide:map",
        "lucide:microscope",
        "lucide:pin",
        "lucide:play",
        "lucide:plus",
        "lucide:quote",
        "lucide:radar",
        "lucide:rotate-ccw",
        "lucide:rotate-cw",
        "lucide:scan-search",
        "lucide:search",
        "lucide:settings-2",
        "lucide:terminal",
        "lucide:trash-2",
        "lucide:triangle-alert",
        "lucide:x",
        "simple-icons:anthropic",
        "simple-icons:cursor",
        "simple-icons:github",
        "simple-icons:internetarchive",
        "simple-icons:markdown",
        "simple-icons:npm",
        "simple-icons:openai",
        "vscode-icons:file-type-js",
        "vscode-icons:file-type-json",
        "vscode-icons:file-type-shell",
        "vscode-icons:file-type-typescript",
      ],
    },
  },
  colorMode: {
    preference: "dark",
  },
  app: {
    head: {
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
      ],
      meta: [
        { name: "theme-color", content: "#0b0d10" },
        { name: "apple-mobile-web-app-title", content: "archives" },
      ],
    },
  },
  nitro: {
    preset: "cloudflare_module",
    /** One MCP SDK copy, or `agents` fails the toolkit's server on its `instanceof` check. */
    alias: {
      "@modelcontextprotocol/sdk": resolve(
        import.meta.dirname,
        "node_modules/@modelcontextprotocol/sdk/dist/esm",
      ),
    },
    compatibilityDate: "2026-09-03",
    experimental: {
      /** The warm-up task runs from the cron trigger in wrangler.jsonc. */
      tasks: true,
      /** An MCP tool gets no event, so the rate limit reads it through `useEvent()`. */
      asyncContext: true,
    },
    scheduledTasks: {
      "17 */6 * * *": ["warm:demo"],
    },
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
  /** In production the response cache lives in KV, so it survives isolates and the cron can warm it. */
  $production: {
    nitro: {
      storage: {
        cache: {
          driver: "cloudflare-kv-binding",
          binding: "CACHE",
        },
      },
    },
  },
  /** Fonts live in public/fonts and app/assets/fonts.css, which is the only place nuxt-og-image reads them from. */
  css: ["~/assets/fonts.css"],
  fonts: {
    families: [
      { name: "Figtree", provider: "local", weights: [400, 500] },
      { name: "Fira Code", provider: "local", weights: [400, 500] },
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
            default: archivesTheme,
            light: archivesTheme,
            dark: archivesTheme,
          },
        },
      },
    },
  },
});
