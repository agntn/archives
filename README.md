# @agntn/archives

[![npm version](https://npmx.dev/api/registry/badge/version/@agntn/archives)](https://npmx.dev/package/@agntn/archives)
[![npm downloads](https://npmx.dev/api/registry/badge/downloads/@agntn/archives)](https://npmx.dev/package/@agntn/archives)
[![license](https://npmx.dev/api/registry/badge/license/@agntn/archives)](https://npmx.dev/package/@agntn/archives)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/agntn/archives)

🗄️ One interface over a pile of web archives. Ask what a page said in 2002, you get what it said.

## Why?

Every web archive has its own idea of an API. Wayback speaks CDX. Archive.today speaks Memento link headers. Common Crawl gives you a byte range inside a WARC file and wishes you luck. Now hand all three to an agent and see how long it keeps them apart. Not long.

So this is one `createArchive()` in front of all of them, and the same page object comes back from each.

Docs and a live timeline explorer: [archives.agntn.dev](https://archives.agntn.dev).

## ✨ Features

- 🗂️ **Every provider, one shape.** Wayback Machine, Arquivo.pt, Webarchiv Österreich, Vefsafn, OSZK Webarchívum, Archive-It, Conifer, Archive.today, Memento, Common Crawl, Perma.cc and WebCite. Dates come back as ISO 8601 from every one of them.
- 📄 **Reads captures, not just lists them.** `content()` goes through the raw `id_` replay or a WARC range where the archive has one. No toolbar, no rewritten links.
- 🔀 **Diffs two versions of a page.** Both from the same archive, with the real capture dates on top.
- 🕰️ **Time windows.** `from` and `to` take `2019`, `201903` or an ISO date. Both ends inclusive.
- 🙅 **"Unsupported" is an answer.** A provider without the endpoint says so and tells you why. No fake empty list.
- 🧯 **Survives a bad archive day.** One provider times out, the rest still answer. The failure lands in `_meta.errors`.
- 🌳 **Tree-shakable.** Every provider sits behind a dynamic import. Ask for Wayback, get Wayback.
- 🤖 **MCP, Pi and OMP.** Four tools, and every surface answers the same.

## 📦 Install

```bash
pnpm add @agntn/archives
```

Node.js 26 or newer.

## 🚀 First call

```ts
import { createArchive, providers } from "@agntn/archives";

const archive = createArchive(providers.wayback());

const { pages } = await archive.snapshots("example.com", { limit: 3 });
for (const page of pages) console.log(page.timestamp, page.snapshot);

const page = await archive.getContent("example.com", { timestamp: "2002" });
console.log(page.content);
```

```
2002-01-20T14:25:10Z https://web.archive.org/web/20020120142510/http://example.com:80/
2003-02-07T05:52:28Z https://web.archive.org/web/20030207055228/http://www.example.com:80/
2004-01-05T04:55:15Z https://web.archive.org/web/20040105045515/http://www.example.com/
<HTML>
<HEAD>
  <TITLE>Example Web Page</TITLE>
</HEAD>
<body>
<p>You have reached this web page by typing &quot;example.com&quot;,
&quot;example.net&quot;,
  or &quot;example.org&quot; into your web browser.</p>
<p>These domain names are reserved for use in documentation and are not
available
  for registration.</p>
</BODY>
</HTML>
```

No key, no config. That's the HTML example.com served in 2002. Still not for sale, by the way.

Wayback keeps one capture per year by default, so three rows are three years. Its index is in no hurry. Lookups close to a minute happen, so Wayback waits 60 seconds. So do Common Crawl, whose index likes to think it over, and Archive.today. The rest get ten. More on listings and reading: [Snapshots](https://archives.agntn.dev/guide/snapshots), [Reading content](https://archives.agntn.dev/guide/content).

## 🔍 What changed?

```ts
import { createArchive, diffArchivedContent, providers } from "@agntn/archives";

const archive = createArchive(providers.wayback());
const before = await archive.getContent("https://example.com/", { timestamp: "2020" });
const after = await archive.getContent("https://example.com/", { timestamp: "2026" });

console.log(diffArchivedContent(before, after).patch);
```

```
--- before	2020-12-31T23:59:42Z
+++ after	2026-09-29T05:56:21Z
@@ -1,8 +1,2 @@
-Example Domain
-
-Example Domain
-
-This domain is for use in illustrative examples in documents. You may use this
-domain in literature without prior coordination or asking for permission.
-
-More information...
\ No newline at end of file
+Example Domain This domain is for use in documentation examples without needing permission. This is not a service, avoid relying on it for testing and monitoring purposes.
+Learn more
\ No newline at end of file
```

Even example.com rewrites its homepage. You asked for years, the header shows the captures you actually got.

Pass the full URL here. A bare `example.com` can be `http://example.com:80/` one year and `http://www.example.com/` the next. The diff refuses to compare two different URLs. Want the markup, scripts and comments too? `{ format: "raw" }`. That's where the fun stuff hides anyway ;) More: [Comparing captures](https://archives.agntn.dev/guide/diff).

## 🧠 Library

```ts
const archive = createArchive(providers.all());
const response = await archive.snapshots("example.com");

response.pages; // everything the archives found
response._meta?.errors; // ["wayback: ...timeout", ...]
response._meta?.unsupportedProviders; // [{ provider: "webcite", reason: "..." }]
```

On a bad day three archives timed out here and it still came back with 1145 pages. `snapshots()` and `content()` don't throw. Check `success`. `getPages()` and `getContent()` throw instead.

Want a few providers, not all? `createArchive(Promise.all([providers.wayback(), providers.arquivo()]))`. Cache, config files and every option: [Configuration](https://archives.agntn.dev/guide/configuration).

## 🗺️ Providers

| Provider             | Factory                    | Reads bodies  | Needs                   | In `all()` |
| -------------------- | -------------------------- | ------------- | ----------------------- | ---------- |
| Wayback Machine      | `providers.wayback()`      | yes           | nothing                 | yes        |
| Arquivo.pt           | `providers.arquivo()`      | yes           | nothing                 | yes        |
| Webarchiv Österreich | `providers.webarchiv()`    | yes           | an exact URL            | yes        |
| Vefsafn              | `providers.vefsafn()`      | yes           | an exact URL            | yes        |
| OSZK Webarchívum     | `providers.oszk()`         | yes           | nothing                 | yes        |
| Archive.today        | `providers.archiveToday()` | rendered page | nothing                 | yes        |
| Common Crawl         | `providers.commoncrawl()`  | yes           | nothing                 | yes        |
| WebCite              | `providers.webcite()`      | no            | no listing API at all   | yes        |
| Archive-It           | `providers.archiveIt()`    | yes           | a `collection` ID       | no         |
| Conifer              | `providers.conifer()`      | no            | `user` and `collection` | no         |
| Memento              | `providers.memento()`      | yes           | nothing                 | no         |
| Perma.cc             | `providers.permacc()`      | no            | an `apiKey`             | no         |

Memento goes through ODU's MemGator, which already asks several archives. Put it in `all()` and you'd get everything twice. Archive.today has no raw endpoint, so you get the page as it renders it. Running your own MemGator? `providers.memento({ baseUrl })` takes it, over HTTPS unless it's local.

Some of these are history themselves. The original Memento Time Travel is gone. WebCite stopped taking new pages around 2019. Conifer only serves existing collections, read-only. Quirks per archive: [Providers](https://archives.agntn.dev/providers).

## 🤖 Agents

```bash
archives mcp
omp install github:agntn/archives
pi install git:github.com/agntn/archives
```

```json
{
  "mcpServers": {
    "archives": { "command": "npx", "args": ["-y", "@agntn/archives", "mcp"] }
  }
}
```

Four tools: snapshots, content, diff and providers. Only content writes, and only when you give it a `path`. That file stays inside `ARCHIVES_CAPTURE_DIR`, or the working directory without it. An archived body comes back fenced as untrusted data. It's a recording of a web page, not a message for the model. The Perma.cc key lives in `PERMA_CC_API_KEY`, never in a tool argument.

One thing to know. `archives mcp` reads its config from your home directory, not from the project your client has open. Browsing someone's repo shouldn't run their `archives.config.ts`. [Agents guide](https://archives.agntn.dev/guide/agents).

Can't install anything? The docs site runs the same four tools at [archives.agntn.dev/mcp](https://archives.agntn.dev/guide/agents#remote-mcp):

```bash
claude mcp add --transport http archives https://archives.agntn.dev/mcp
```

Same answers, a few house rules. No `path`, no Archive.today, 30 new queries a minute. The worker is borrowed, after all.

The docs site also has the [Evidence Room](https://archives.agntn.dev/evidence), the same idea over WebMCP in the browser. [WebMCP guide](https://archives.agntn.dev/guide/webmcp).

## 🚫 What this does not do

It doesn't archive anything. You read what others saved, you can't ask for a new capture. And the live web is [@agntn/web](https://github.com/agntn/web)'s job.

## 🧩 Adding a provider

An eleventh? Extend `BaseProvider`, answer `snapshots()`, pass it to `createArchive()`. That's it. The full contract: [Custom providers](https://archives.agntn.dev/guide/custom).

## 🛠️ Development

```bash
pnpm install
pnpm dev          # vp test in watch mode
pnpm lint         # builds first, then vp lint and vp fmt --check
pnpm test:types   # tsc over the library and both extensions
pnpm test         # lint, types, tests with coverage
pnpm build        # obuild
pnpm docs         # docs site and timeline explorer on :3000
```

## 💛 Thanks

Anthropic and OpenAI back this package through their open source programs, [Claude for Open Source](https://claude.com/contact-sales/claude-for-oss) and [Codex for Open Source](https://developers.openai.com/community/codex-for-oss). Much appreciated <3

## 📄 License

[MIT](./LICENSE)
