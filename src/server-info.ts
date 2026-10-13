import type { McpServerInfo } from "@agntn/tools/mcp";
import { version } from "./version.ts";

/** How both MCP servers introduce themselves, so a connector card isn't just a name. */
export const serverInfo = {
  name: "archives",
  version,
  description:
    "Find a URL's captures in the Wayback Machine, Archive.today, Common Crawl and a shelf of national web archives, then read them or diff two dates. Ask what a page said in 2002, you get what it said.",
  icons: [
    { src: "https://archives.agntn.dev/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
    { src: "https://archives.agntn.dev/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
  ],
} satisfies McpServerInfo;
