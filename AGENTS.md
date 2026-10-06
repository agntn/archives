# PROJECT KNOWLEDGE BASE

**Last reviewed:** 2026-09-02
**Branch:** main

> Verify against current HEAD: `git rev-parse HEAD`. Code map line numbers reflect the snapshot above; rerun `grep -n` if they look stale.

## OVERVIEW

Unified TypeScript interface for querying web archive providers (Wayback Machine, Arquivo.pt, Webarchiv Österreich, Vefsafn, OSZK Webarchívum, New Zealand Web Archive, Archive.today, Memento/MemGator, Common Crawl, Perma.cc, WebCite). Requests go through native `fetch` (`src/utils/_fetch.ts`); built on the unjs ecosystem: unstorage, c12, consola, ufo, changelogen, with obuild for the build and Vite+ (`vite-plus`) for lint, format and tests.

## STRUCTURE

```
archives/
├── src/
│   ├── index.ts          # barrel - public API surface
│   ├── archive.ts        # createArchive factory + combineResults/combineContentResults
│   ├── diff.ts           # bounded capture comparisons with checked provenance
│   ├── types.ts          # all public interfaces/types
│   ├── _providers.ts     # provider-specific option types (internal)
│   ├── config.ts         # c12-based config loading with caching
│   ├── storage.ts        # unstorage caching layer
│   ├── tool-operations.ts # executors shared by MCP, Pi and OMP
│   ├── tools.ts          # one @agntn/tools definition per tool, for every surface
│   ├── tool-contract.ts  # provider spellings, hints and bounds the tools declare
│   ├── mcp.ts            # createMcpServer(), plus toolListings/callTool for the docs /mcp
│   ├── cli.ts            # runCli entry (bin: archives): a command per tool, plus `mcp`
│   ├── cli-commands.ts   # `snapshots` for the CLI alone: the target is a word, not JSON
│   ├── mcp-stdio.ts      # `archives mcp` - stdio transport, config pinned to home
│   ├── version.ts        # package.json version, single source
│   ├── providers/        # one file per archive source + barrel
│   └── utils/            # _utils.ts: parallel work, response helpers, domain/timestamp
│                         # _content.ts: capture reading, WARC, charset, html-to-text
│                         # _fetch.ts: native fetch, retries, a deadline per attempt
│                         # _capture-file.ts: archives_content `path` writes, Node only, loaded lazily
├── build.config.ts       # obuild: one bundle, five inputs
├── vite.config.ts        # Vite+: lint, fmt, test
├── test/                 # mirrors src/ structure, one .test.ts per module
├── packages/pi/extensions/
│   └── archives.ts       # Pi tool/command surface shipped via package.json pi.extensions
├── packages/omp/extensions/
│   └── archives.ts       # OMP tool/command surface shipped via package.json omp.extensions
├── playground/           # Nuxt app (Cloudflare preset) for manual provider testing
├── docs/                 # Docus site: guide, provider pages, live timeline explorer and /mcp on Workers
└── .github/workflows/    # ci.yml + autofix.yml
```

## WHERE TO LOOK

| Task                       | Location                                                          | Notes                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Add a provider             | `src/providers/` + register in `src/providers/index.ts`           | Copy wayback.ts as template. Default export factory fn returning `ArchiveProvider`                                      |
| Provider-specific options  | `src/_providers.ts`                                               | Extend `ArchiveOptions`, add to `ProviderOptions` map                                                                   |
| Change public API          | `src/index.ts`                                                    | Barrel re-exports only. Types via `export type *`                                                                       |
| Modify caching             | `src/storage.ts`                                                  | Key format: `{prefix}:{providerSlug}:{domain}:{limit?}`                                                                 |
| Config defaults            | `src/config.ts` → `getDefaultConfig()`                            | c12 loads from `.archives`, `archives.config.ts`, `package.json`                                                        |
| Response helpers           | `src/utils/_utils.ts`                                             | `createSuccessResponse`, `createErrorResponse`, `mergeOptions`                                                          |
| Read an archived body      | `src/utils/_content.ts`                                           | Capture selection, `id_` playback, WARC ranges, transfer/content encodings, charset, `htmlToText`                       |
| Compare two captures       | `src/diff.ts` + `src/tool-operations.ts`                          | Pure bounded diff, retrieval from one provider, and paged tool rendering                                                |
| Add content to a provider  | provider file → `override content()`                              | Optional on `ArchiveProvider`; a provider that cannot serve bodies says so instead                                      |
| Parallel processing        | `src/utils/_utils.ts` → `processInParallel`                       | Concurrency + batch control                                                                                             |
| CDX row mapping            | `src/utils/_utils.ts` → `mapCdxRows`                              | Wayback/CommonCrawl share CDX format                                                                                    |
| Test a provider            | `test/{provider}.test.ts`                                         | Uses vitest, mocks with `vi.fn()`                                                                                       |
| Manual testing             | `playground/server/api/snapshots/`                                | One Nuxt endpoint per provider                                                                                          |
| Docs / timeline UI         | `docs/`                                                           | Docus: `content/` markdown, `server/api/` over tool-operations, explorer in `app/`                                      |
| Extend Pi extension        | `packages/pi/extensions/archives.ts` + `tsconfig.extensions.json` | Keep it distributable through `package.json` `pi.extensions` like askweb                                                |
| Change what a tool does    | `src/tool-operations.ts`                                          | One implementation for MCP, Pi and OMP. Never fix a tool in one surface only                                            |
| Add/change a tool          | `src/tools.ts` + `test/mcp.test.ts`                               | Executor in tool-operations first, then its definition here; a new tool also needs its file in `docs/server/mcp/tools/` |
| Verify the shipped package | `pnpm pack` + install the tarball elsewhere                       | Catches missing `files`, a wrong `exports` map and absent runtime deps                                                  |

## CODE MAP

| Symbol                      | Type      | Location               | Role                                                                                                         |
| --------------------------- | --------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `createArchive`             | function  | archive.ts:56          | Core factory. Accepts provider(s) + options, returns `ArchiveInterface`.                                     |
| `UnsupportedOperationError` | class     | archive.ts:18          | Thrown by `getPages()` when every queried provider is unsupported. Carries `providers` list.                 |
| `providers`                 | object    | providers/index.ts:14  | Lazy-loading factory. Each method returns `Promise<ArchiveProvider>`.                                        |
| `ArquivoProvider`           | class     | providers/arquivo.ts   | Public Arquivo.pt CDX index and raw `noFrame/replay` capture reads.                                          |
| `WebarchivProvider`         | class     | providers/webarchiv.ts | Austrian National Library public CDXJ index and raw `id_` replay for exact URLs.                             |
| `VefsafnProvider`           | class     | providers/vefsafn.ts   | Icelandic web archive NDJSON CDX index, capped while streaming, and raw `id_` replay for exact URLs.         |
| `OszkProvider`              | class     | providers/oszk.ts      | Hungarian web archive pywb CDX index with domain prefixes, and raw `id_` replay under `/pywb`.               |
| `NlnzProvider`              | class     | providers/nlnz.ts      | New Zealand Web Archive pywb CDX index with domain prefixes; `content()` is unsupported behind Imperva.      |
| `MementoProvider`           | class     | providers/memento.ts   | JSON TimeMap from several archives via ODU MemGator; reads exact Memento URI, then proxy fallback.           |
| `ArchiveInterface`          | interface | types.ts               | Public API: `snapshots()`, `getPages()`, `content()`, `getContent()`, `use()`, `useAll()`.                   |
| `ArchiveProvider`           | interface | types.ts:117           | Provider contract: `name`, `slug?`, `snapshots()`.                                                           |
| `ArchiveResponse`           | interface | types.ts:100           | `{ success, pages, error?, unsupported?, unsupportedReason?, _meta?, fromCache? }`.                          |
| `ArchivedPage`              | interface | types.ts:61            | `{ url, timestamp, snapshot, _meta }`.                                                                       |
| `UnsupportedProviderRecord` | interface | types.ts:84            | `{ provider, reason }` row used in `_meta.unsupportedProviders`.                                             |
| `ArchivesConfig`            | interface | config.ts:8            | Config shape: `storage` + `performance` + env overrides.                                                     |
| `processInParallel`         | function  | utils/_utils.ts:16     | Generic parallel executor with concurrency + batching.                                                       |
| `createSuccessResponse`     | function  | utils/_utils.ts        | Build a normalized success `ArchiveResponse`.                                                                |
| `createErrorResponse`       | function  | utils/_utils.ts        | Build a normalized runtime-error `ArchiveResponse`.                                                          |
| `createUnsupportedResponse` | function  | utils/_utils.ts:184    | Build a response signalling the operation is outside the provider's API surface.                             |
| `configureStorage`          | function  | storage.ts:147         | **@deprecated** - use config files or `createArchive` options.                                               |
| `setConfig`                 | function  | config.ts              | Config without c12 discovery, for hosts with no filesystem. `resetConfig()` brings discovery back.           |
| `setConfigCwd`              | function  | config.ts              | Pins c12 discovery to one directory: home for `archives mcp`, its own root for an embedding host.            |
| `archivesTools`             | const     | tools.ts               | The four tool definitions (`archives_snapshots`, `_content`, `_diff`, `_providers`) every surface registers. |
| `loadOperations`            | function  | tools.ts               | Cached lazy import of the executors; a failed load is not kept.                                              |
| `snapshotArchives`          | function  | tool-operations.ts     | Shared executor behind the snapshot tool on every surface. Throws on bad provider/prereqs.                   |
| `snapshotBatchArchives`     | function  | tool-operations.ts     | Executor behind the snapshot tool: one target, or up to 10 answered as one block each in input order.        |
| `listArchiveProviders`      | function  | tool-operations.ts     | Shared executor listing providers, `provider=all` membership and Perma.cc key state.                         |
| `waybackSnapshots`          | function  | tool-operations.ts     | Wayback-only lookup behind the interactive `/archive` command.                                               |
| `createMcpServer`           | function  | mcp.ts                 | Unconnected MCP server exposing snapshot, content, diff and provider tools.                                  |
| `toolListings` / `callTool` | const/fn  | mcp.ts                 | `tools/list` entries and one `tools/call`, errors as results; the docs `/mcp` serves the tools through them. |
| `Archive.content`           | method    | archive.ts             | Reads one capture. Tries providers in order; the first body wins.                                            |
| `Archive.getContent`        | method    | archive.ts             | Throwing variant of `content()`, mirroring `getPages()`.                                                     |
| `combineContentResults`     | function  | archive.ts             | Picks the winning body and keeps the other providers' outcomes in `_meta`.                                   |
| `ArchivedContent`           | interface | types.ts               | `{ url, timestamp, snapshot, content, mime?, bytes, truncated, _meta }`.                                     |
| `ArchiveContentOptions`     | interface | types.ts               | `ArchiveOptions` + `timestamp` (capture to read) + `maxBytes` (read cap).                                    |
| `readPlaybackCapture`       | function  | utils/_content.ts      | Reads a Wayback-style `<prefix>/<stamp>id_/<url>` capture into `ArchivedContent`.                            |
| `selectCapture`             | function  | utils/_content.ts      | An exact stamp names one capture; otherwise newest at or before, else closest after, preferring a 2xx one.   |
| `preferSameUrl`             | function  | utils/_content.ts      | Keeps candidates under the requested URL, the caller's scheme when named, exact spelling first.              |
| `unwrapSnapshotUrl`         | function  | utils/_content.ts      | Splits a playback URL back into original URL + capture stamp.                                                |
| `htmlToText`                | function  | utils/_content.ts      | Lossy markup stripping, applied by the surfaces, never by the library response.                              |
| `contentArchives`           | function  | tool-operations.ts     | Shared executor behind the content tool on every surface.                                                    |
| `diffArchivedContent`       | function  | diff.ts                | Bounded unified diff for two chronological textual captures with matching URL/provider provenance.           |
| `diffArchives`              | function  | tool-operations.ts     | Reads both captures from one provider and renders a pageable diff for MCP, Pi and OMP.                       |

## CONVENTIONS

- **Underscore prefix** = internal module (`_utils.ts`, `_providers.ts`). Not for direct import by consumers.
- **Provider pattern**: default export factory fn → returns `{ name, slug, snapshots() }`. Always async via `Promise<ArchiveProvider>`.
- **Lazy loading**: providers loaded via `await import('./provider.ts')` in `providers/index.ts`. Enables tree-shaking.
- **Response normalization**: all providers must return `ArchiveResponse` via `createSuccessResponse` / `createErrorResponse` / `createUnsupportedResponse` helpers — never construct a raw object.
- **Unsupported operations are first-class**: when an operation is outside a provider's API surface (e.g. WebCite has no list-by-domain endpoint), return `createUnsupportedResponse(reason, slug)`, not a fake page or a fake error. `combineResults` propagates these into `_meta.unsupportedProviders`. `getPages()` throws `UnsupportedOperationError` (with `.providers`) when the whole call is unsupported, so callers can distinguish structural mismatches from runtime failures.
- **Timestamp format**: providers convert native timestamps to ISO 8601. Raw format preserved in `_meta`.
- **Option merging**: three-level cascade: config defaults → init options → request options. Via `mergeOptions()`. `createArchive` hands a provider only the performance options that its own options or the call named, so a provider's factory options are not overwritten by config defaults.
- **Quality config**: the `lint` and `fmt` blocks of `vite.config.ts` spread the shared `@agntn/ox` policies; `vp lint` and `vp fmt` run them. Linting is type-aware; ESLint was removed intentionally.
- **`src/` runs under plain Node type stripping**: relative imports end in `.ts` (a directory as `./dir/index.ts`), type-only imports use `import type`, and no `enum`, `namespace` or parameter properties. `erasableSyntaxOnly` and `verbatimModuleSyntax` enforce the syntax, `test/cli.test.ts` the imports. `moduleResolution` stays `Bundler`: under `NodeNext` the `unstorage` driver types import a directory and `Driver` turns into an error type.
- **A local MCP server serves `src/`**: inside a checkout, `dist/cli.mjs mcp` loads `serveStdio` from `src/mcp-stdio.ts`, like the Pi and OMP extensions, so a change needs a server restart, not `pnpm build`. The npm package, a copy under `node_modules` and a Node that does not strip types keep the bundle; `ARCHIVES_DIST=1` forces it. A change to `src/cli.ts` itself still needs `pnpm build`.
- **Build**: `obuild` reads `build.config.ts` → `dist/`. Five inputs in **one** bundle so the entrypoint, the CLI, the MCP server, the tool list and the executors share chunks instead of each carrying a private copy of the provider factory. obuild names chunks `dist/_chunks/<name>.mjs`, which `test/cli.test.ts` relies on, and strips comments and `//#region` markers from the runtime files.
- **One definition per tool**: `src/tools.ts` declares each tool once with `defineTool` from `@agntn/tools`, and MCP, Pi, OMP and the CLI register that list through its adapters, which validate every call in the core. The executors stay in `src/tool-operations.ts` behind a lazy import, so the extensions register tools without loading the library. A surface owns only its call preview and its commands.
- **OMP loader imports stay literal**: `existsSync(src)` chooses between `import("../../../src/tools.ts")` and `import("../../../dist/tools.mjs")`. Never `import(url.href)`. `tsc` resolves that dist specifier, so `test:types` builds before it type-checks.
- **MCP result is text only**: `details` never reaches an MCP client, so anything a caller needs for the next call belongs in `content[].text`.
- **Listing fans out, reading falls back**: `snapshots()` queries providers in parallel and merges; `content()` walks them in order and stops at the first body, because there is one page to read rather than a set to merge. Providers that failed or cannot read are reported beside the body in `_meta`.
- **A diff never mixes archives**: `archives_diff` tries providers sequentially until one returns both chronological captures of the same original URL. Memento requires the same underlying archive host on both sides. It reports actual selected timestamps, preserves truncation as `partial`, and pages only the derived patch. Continuation carries a SHA-256 of the complete patch and aborts if replay produces different bytes.
- **A capture is read raw or not at all**: bodies come from `id_` playback (Wayback, Arquivo.pt, Webarchiv Österreich, Vefsafn, OSZK Webarchívum, Archive-It) or a WARC byte range (Common Crawl). An archive that only serves its own rendition of a page returns `createUnsupportedContentResponse` with the reason instead.
- **A stored capture is the response as it travelled**: a WARC record keeps the chunked framing and the `Content-Encoding` the server used, so reading its text means undoing both before the charset is applied. Playback endpoints do it for you, which is why only the Common Crawl path carries this. The decoders (gzip, zlib, raw deflate, brotli, zstd) come from `@agntn/compressions` subpaths through a dynamic `import()` each, never `DecompressionStream` and never the package root, which loads every format. Its `LimitError` is matched by `name`, because only that root exports the class. A read decodes a compressed prefix with `partial: true`, starting at `maxBytes` and doubling until it decodes past the cap, the record ends or the prefix reaches the index `length`. Recent crawls mostly store the body decoded under `X-Crawler-Content-Encoding`, so the `Content-Encoding` step serves the odd record.
- **The library decodes, a surface renders**: charset decoding, WARC unwrapping and transfer/content encodings are library work, and the body it returns is text; `htmlToText`, slicing by `offset` and `maxChars`, and the untrusted-data fence are applied in `tool-operations.ts`, so a library consumer keeps the whole document rather than a reader's view of it. A truncated first read is expanded to the fixed tool byte ceiling before rendering, and the continuation line pins the answering provider, collection, capture timestamp and rendering format so later slices read that same prefix; offsets into separately selected or rendered captures are unstable. Text is the contract, and the raw bytes come only on request: `body: true` adds them as `ArchivedContent.body` (the bytes `sha256` hashes) and skips the cache, since a JSON storage driver cannot hold a `Uint8Array`.
- **A capture file stays in its directory**: `archives_content` with `path` writes under `ARCHIVES_CAPTURE_DIR` (default: the process cwd), refuses `..`, absolute paths elsewhere and symlinks out before any request, never overwrites (`wx`), and writes nothing for a truncated body. `src/utils/_capture-file.ts` imports `node:fs`, so it stays out of the barrel and loads by dynamic `import()`: the docs worker imports `tool-operations.ts`. The optional write is why the tool's effect is `write`.
- **The MCP process does not trust its own cwd**: `src/mcp-stdio.ts` calls `setConfigCwd(homedir())` because a client spawns the server in an arbitrary checkout, and c12 executes the `archives.config.ts` it finds. `consola.level` is pinned there too, since stdout carries the JSON-RPC frames.
- **The CLI comes from the tool list**: `src/cli.ts` hands `archivesTools` to `runCli` from `@agntn/tools/cli`, so commands, flags and `--help` come from the schemas, and a `cli` hint on `defineTool` names positionals and the summary line. `archives mcp`, alone or followed by `--`, skips the `mcp` that `runCli` adds, because that one reads the config of whatever directory the client started it in, and any other `mcp` line gets the home config before `runCli` sees it; `test/cli.test.ts` holds the source, the bundle and the terminator to the home config.
- **Pi extension packaging**: distributable extension lives under `packages/pi/extensions/*.ts`; `package.json` `pi.extensions` points there and `files` includes the directory.
- **Release**: `pnpm test && changelogen --release --push`; the pushed `v*` tag triggers `.github/workflows/publish.yml`, which publishes to npm through OIDC.

## ANTI-PATTERNS (THIS PROJECT)

- **Do not suppress types**: no `as any`, `@ts-ignore`. The codebase has zero instances.
- **Do not call `configureStorage` in new code**: it's `@deprecated`. Use config files or pass options to `createArchive`.
- **Do not pass `Promise[]` to `createArchive`**: `createArchive([providers.wayback(), ...])` is a type error. Use `Promise.all()` wrapper or `providers.all()`.
- **Do not add Perma.cc to `providers.all()`**: requires API key. Excluded intentionally.
- **Do not add Memento to `providers.all()`**: MemGator already fans out across archives, so nesting it duplicates results and multiplies upstream traffic.
- **Do not put provider types in `providers/`**: provider-specific option types live in `src/_providers.ts`, not alongside implementations.
- **Do not add deployable Pi package extensions under `.pi/extensions/`**: this project ships its Pi surface from `packages/pi/extensions/` via `package.json` `pi.extensions`, following askweb.
- **Do not reimplement a tool inside a surface**: MCP, Pi and OMP register the definitions from `src/tools.ts`. A fix applied in one extension only is a drift bug waiting to happen.
- **Do not import `Type` from `typebox`**: build schemas with `Type` from `@agntn/tools`. OMP rewrites a bare `typebox` import to its own facade, and validation then accepts any value.
- **Do not fetch a playback URL without `id_`**: without the modifier the archive returns the capture inside its own toolbar with every link rewritten, which is the archive's rendition and not what the site served.
- **Do not report a missing implementation as `unsupported`**: that flag means the provider's API has no such endpoint, and the reason string is read by callers deciding whether to try elsewhere.
- **Do not put the whole body in a tool's `details`**: `content[].text` is the answer, and a second, longer copy in the transcript disagrees with what the caller was handed.
- **Do not put `dist/` first in the extension loader**: the extensions prefer `src/` so a working tree (and vitest) runs the code under test; `dist/` is the installed-package fallback.

## COMMANDS

```bash
pnpm install          # install deps
pnpm dev              # vp test in watch mode
pnpm test             # lint + type-check + vp test with coverage; needs `pnpm --dir docs install` for test/docs-mcp.test.ts
pnpm test:types       # build + tsc over lib and both extension surfaces
pnpm lint             # build + Nuxt types + type-aware vp lint + vp fmt check
pnpm lint:fix         # build + Nuxt types + vp lint fixes + vp fmt write
pnpm build            # obuild (build.config.ts) → dist/
pnpm docs             # Docus site + timeline explorer on :3000
node dist/cli.mjs mcp # run the MCP server over stdio (bin: archives mcp); serves src/ in a checkout
pnpm release          # test + changelogen + publish
```

## NOTES

- **Config is async**: `getConfig()`, `resolveConfig()`, `mergeOptions()`, `createFetchOptions()` are all async because c12 config loading is async. This propagates throughout.
- **Defaults**: concurrency=3, batchSize=20, timeout=10000ms, retries=1, cache TTL=7 days. Wayback, Common Crawl and Archive.today raise an unnamed timeout to 60000ms through `BaseProvider.defaultTimeout`. README and code must match.
- **Memento Time Travel is gone**: `mementoweb.org` remains a static documentation site after LANL discontinued the aggregator in 2025. `providers.memento()` defaults to the live public ODU MemGator endpoint and may be pointed at another compatible instance with `baseUrl`.
- **Arquivo.pt is a direct provider**: query `https://arquivo.pt/wayback/cdx` as newline-delimited JSON and read raw bodies from `noFrame/replay/<timestamp>id_/<url>`. It belongs in `providers.all()` even though MemGator may also return Arquivo.pt captures, because Memento stays outside that fan-out.
- **Webarchiv Österreich uses CDXJ for one URL at a time**: query `https://webarchiv.onb.ac.at/web/cdx` with the URL written as HTTP, because the index canonicalizes schemes but the HTTPS version can fail upstream. `from`, `to`, `limit` and `reverse=true` are supported; wildcard and `sort` queries are not. Read raw bodies from `/web/<timestamp>id_/<url>`. It requires no credentials and belongs in `providers.all()`.
- **Vefsafn ignores `limit`**: `https://vefsafn.is/cdx?output=json` streams every row it holds for a URL, tens of MB for a busy front page, so the provider sends `limit` but stops reading at it and cancels the stream. Prefix queries on a large host answered nothing within 25 s, so it takes exact URLs only, written as HTTP; the index canonicalizes schemes. Read raw bodies from `/<timestamp>id_/<url>` at the root. It requires no credentials and belongs in `providers.all()`.
- **OSZK Webarchívum is plain pywb**: `https://webadmin.oszk.hu/pywb/cdx` answers NDJSON, honours `limit`, `from`, `to`, `sort=reverse` and domain prefixes, and the provider asks only for the six fields it maps through `fl`. `limit=0` means every row to pywb, so the provider never sends it. A capture that redirects to its own URL key (`oszk.hu` to `www.oszk.hu`) is skipped on replay without a redirect, and only `Memento-Datetime` names the capture served; `readPlaybackCapture` reads it there. Raw bodies come from `/pywb/<timestamp>id_/<url>`. It requires no credentials and belongs in `providers.all()`.
- **The New Zealand Web Archive lists but never reads**: `https://ndhadeliver.natlib.govt.nz/webarchive/cdx` is pywb behind Imperva, answers NDJSON with domain prefixes, `limit`, `from` and `to`, and the provider asks for five fields through `fl`. `length` stays out because the index writes `"0"` for almost every record. Replay under `/webarchive/<timestamp>id_/<url>` answers a script, and headless Chromium, with an Imperva challenge page and status 200, so `content()` returns `createUnsupportedContentResponse` instead of reading that page as the capture. A challenge in place of the index fails the listing as a malformed CDX record. It requires no credentials and belongs in `providers.all()`.
- **WebCite has no list-by-domain API**: `webcite.snapshots(domain)` returns `unsupported: true` with a `unsupportedReason`. Direct snapshot retrieval (`webcitation.org/<id>`) is planned via a future `getById` API. New archives have not been accepted since ~2019.
- **Archive.today uses Memento API**: parses timemap link headers with regex. Fragile if format changes.
- **Playground targets Cloudflare**: `nitro.preset = 'cloudflare_module'` with `nodeCompat: true`.
- **CI runs coverage separately**: `pnpm exec vp test run --coverage` as its own step, not via `pnpm test`.
- **Autofix CI**: PRs get auto-committed lint fixes via `autofix-ci/action`.
- **Renovate**: extends `github>unjs/renovate-config` for dependency updates.
- **coverage/ is committed**: HTML coverage reports are in git (not in .gitignore despite `dist` being ignored).
