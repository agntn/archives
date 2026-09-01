# PROJECT KNOWLEDGE BASE

**Last reviewed:** 2026-09-01
**Branch:** main

> Verify against current HEAD: `git rev-parse HEAD`. Code map line numbers reflect the snapshot above; rerun `grep -n` if they look stale.

## OVERVIEW

Unified TypeScript interface for querying web archive providers (Wayback Machine, Arquivo.pt, Webarchiv Österreich, Archive.today, Memento/MemGator, Common Crawl, Perma.cc, WebCite). Built on the unjs ecosystem: ofetch, unstorage, c12, consola, ufo, obuild, changelogen.

## STRUCTURE

```
archives/
├── src/
│   ├── index.ts          # barrel - public API surface
│   ├── archive.ts        # createArchive factory + combineResults/combineContentResults
│   ├── types.ts          # all public interfaces/types
│   ├── _providers.ts     # provider-specific option types (internal)
│   ├── config.ts         # c12-based config loading with caching
│   ├── storage.ts        # unstorage caching layer
│   ├── tool-operations.ts # executors shared by MCP, Pi and OMP
│   ├── mcp.ts            # createMcpServer() over the shared executors
│   ├── cli.ts            # citty entry (bin: archives), lazy `mcp` subcommand
│   ├── commands/mcp.ts   # `archives mcp` - stdio transport
│   ├── version.ts        # package.json version, single source
│   ├── providers/        # one file per archive source + barrel
│   └── utils/            # _utils.ts: parallel work, response helpers, domain/timestamp
│                         # _content.ts: capture reading, WARC, charset, html-to-text
├── build.config.ts       # obuild: one bundle, four inputs (shared chunks)
├── test/                 # mirrors src/ structure, one .test.ts per module
├── packages/pi/extensions/
│   └── archives.ts       # Pi tool/command surface shipped via package.json pi.extensions
├── packages/omp/extensions/
│   └── archives.ts       # OMP tool/command surface shipped via package.json omp.extensions
├── playground/           # Nuxt app (Cloudflare preset) for manual provider testing
└── .github/workflows/    # ci.yml + autofix.yml
```

## WHERE TO LOOK

| Task                       | Location                                                          | Notes                                                                                             |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Add a provider             | `src/providers/` + register in `src/providers/index.ts`           | Copy wayback.ts as template. Default export factory fn returning `ArchiveProvider`                |
| Provider-specific options  | `src/_providers.ts`                                               | Extend `ArchiveOptions`, add to `ProviderOptions` map                                             |
| Change public API          | `src/index.ts`                                                    | Barrel re-exports only. Types via `export type *`                                                 |
| Modify caching             | `src/storage.ts`                                                  | Key format: `{prefix}:{providerSlug}:{domain}:{limit?}`                                           |
| Config defaults            | `src/config.ts` → `getDefaultConfig()`                            | c12 loads from `.archives`, `archives.config.ts`, `package.json`                                  |
| Response helpers           | `src/utils/_utils.ts`                                             | `createSuccessResponse`, `createErrorResponse`, `mergeOptions`                                    |
| Read an archived body      | `src/utils/_content.ts`                                           | Capture selection, `id_` playback, WARC ranges, transfer/content encodings, charset, `htmlToText` |
| Add content to a provider  | provider file → `override content()`                              | Optional on `ArchiveProvider`; a provider that cannot serve bodies says so instead                |
| Parallel processing        | `src/utils/_utils.ts` → `processInParallel`                       | Concurrency + batch control                                                                       |
| CDX row mapping            | `src/utils/_utils.ts` → `mapCdxRows`                              | Wayback/CommonCrawl share CDX format                                                              |
| Test a provider            | `test/{provider}.test.ts`                                         | Uses vitest, mocks with `vi.fn()`                                                                 |
| Manual testing             | `playground/server/api/snapshots/`                                | One Nuxt endpoint per provider                                                                    |
| Extend Pi extension        | `packages/pi/extensions/archives.ts` + `tsconfig.extensions.json` | Keep it distributable through `package.json` `pi.extensions` like askweb                          |
| Change what a tool does    | `src/tool-operations.ts`                                          | One implementation for MCP, Pi and OMP. Never fix a tool in one surface only                      |
| Add/change an MCP tool     | `src/mcp.ts` + `test/mcp.test.ts`                                 | Executor in tool-operations first, then the TypeBox schema and annotations here                   |
| Verify the shipped package | `pnpm pack` + install the tarball elsewhere                       | Catches missing `files`, a wrong `exports` map and absent runtime deps                            |

## CODE MAP

| Symbol                      | Type      | Location                           | Role                                                                                                                   |
| --------------------------- | --------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `createArchive`             | function  | archive.ts:56                      | Core factory. Accepts provider(s) + options, returns `ArchiveInterface`.                                               |
| `UnsupportedOperationError` | class     | archive.ts:18                      | Thrown by `getPages()` when every queried provider is unsupported. Carries `providers` list.                           |
| `providers`                 | object    | providers/index.ts:14              | Lazy-loading factory. Each method returns `Promise<ArchiveProvider>`.                                                  |
| `ArquivoProvider`           | class     | providers/arquivo.ts               | Public Arquivo.pt CDX index and raw `noFrame/replay` capture reads.                                                    |
| `WebarchivProvider`         | class     | providers/webarchiv.ts             | Austrian National Library public CDXJ index and raw `id_` replay for exact URLs.                                       |
| `MementoProvider`           | class     | providers/memento.ts               | JSON TimeMap from several archives via ODU MemGator; reads exact Memento URI, then proxy fallback.                     |
| `ArchiveInterface`          | interface | types.ts:127                       | Public API: `snapshots()`, `getPages()`, `use()`, `useAll()`.                                                          |
| `ArchiveProvider`           | interface | types.ts:117                       | Provider contract: `name`, `slug?`, `snapshots()`.                                                                     |
| `ArchiveResponse`           | interface | types.ts:100                       | `{ success, pages, error?, unsupported?, unsupportedReason?, _meta?, fromCache? }`.                                    |
| `ArchivedPage`              | interface | types.ts:61                        | `{ url, timestamp, snapshot, _meta }`.                                                                                 |
| `UnsupportedProviderRecord` | interface | types.ts:84                        | `{ provider, reason }` row used in `_meta.unsupportedProviders`.                                                       |
| `ArchivesConfig`            | interface | config.ts:8                        | Config shape: `storage` + `performance` + env overrides.                                                               |
| `processInParallel`         | function  | utils/_utils.ts:16                 | Generic parallel executor with concurrency + batching.                                                                 |
| `createSuccessResponse`     | function  | utils/_utils.ts                    | Build a normalized success `ArchiveResponse`.                                                                          |
| `createErrorResponse`       | function  | utils/_utils.ts                    | Build a normalized runtime-error `ArchiveResponse`.                                                                    |
| `createUnsupportedResponse` | function  | utils/_utils.ts:184                | Build a response signalling the operation is outside the provider's API surface.                                       |
| `configureStorage`          | function  | storage.ts:147                     | **@deprecated** - use config files or `createArchive` options.                                                         |
| `archives`                  | Pi tool   | packages/pi/extensions/archives.ts | Query archive snapshots through Pi; delegates to the shared executors (source first, `dist/` in an installed package). |
| `archives_providers`        | Pi tool   | packages/pi/extensions/archives.ts | List provider status and Perma.cc env configuration.                                                                   |
| `snapshotArchives`          | function  | tool-operations.ts                 | Shared executor behind the snapshot tool on every surface. Throws on bad provider/prereqs.                             |
| `listArchiveProviders`      | function  | tool-operations.ts                 | Shared executor listing providers, `provider=all` membership and Perma.cc key state.                                   |
| `waybackSnapshots`          | function  | tool-operations.ts                 | Wayback-only lookup behind the interactive `/archive` command.                                                         |
| `createMcpServer`           | function  | mcp.ts                             | Unconnected MCP server exposing `archives_snapshots`, `archives_content`, `archives_providers`.                        |
| `Archive.content`           | method    | archive.ts                         | Reads one capture. Tries providers in order; the first body wins.                                                      |
| `Archive.getContent`        | method    | archive.ts                         | Throwing variant of `content()`, mirroring `getPages()`.                                                               |
| `combineContentResults`     | function  | archive.ts                         | Picks the winning body and keeps the other providers' outcomes in `_meta`.                                             |
| `ArchivedContent`           | interface | types.ts                           | `{ url, timestamp, snapshot, content, mime?, bytes, truncated, _meta }`.                                               |
| `ArchiveContentOptions`     | interface | types.ts                           | `ArchiveOptions` + `timestamp` (capture to read) + `maxBytes` (read cap).                                              |
| `readPlaybackCapture`       | function  | utils/_content.ts                  | Reads a Wayback-style `<prefix>/<stamp>id_/<url>` capture into `ArchivedContent`.                                      |
| `selectCapture`             | function  | utils/_content.ts                  | An exact stamp names one capture; otherwise newest at or before, else closest after, preferring a 2xx one.             |
| `preferSameUrl`             | function  | utils/_content.ts                  | Keeps candidates recorded under the requested URL, and the scheme when the caller named one.                           |
| `unwrapSnapshotUrl`         | function  | utils/_content.ts                  | Splits a playback URL back into original URL + capture stamp.                                                          |
| `htmlToText`                | function  | utils/_content.ts                  | Lossy markup stripping, applied by the surfaces, never by the library response.                                        |
| `contentArchives`           | function  | tool-operations.ts                 | Shared executor behind the content tool on every surface.                                                              |

## CONVENTIONS

- **Underscore prefix** = internal module (`_utils.ts`, `_providers.ts`). Not for direct import by consumers.
- **Provider pattern**: default export factory fn → returns `{ name, slug, snapshots() }`. Always async via `Promise<ArchiveProvider>`.
- **Lazy loading**: providers loaded via `await import('./provider')` in `providers/index.ts`. Enables tree-shaking.
- **Response normalization**: all providers must return `ArchiveResponse` via `createSuccessResponse` / `createErrorResponse` / `createUnsupportedResponse` helpers — never construct a raw object.
- **Unsupported operations are first-class**: when an operation is outside a provider's API surface (e.g. WebCite has no list-by-domain endpoint), return `createUnsupportedResponse(reason, slug)`, not a fake page or a fake error. `combineResults` propagates these into `_meta.unsupportedProviders`. `getPages()` throws `UnsupportedOperationError` (with `.providers`) when the whole call is unsupported, so callers can distinguish structural mismatches from runtime failures.
- **Timestamp format**: providers convert native timestamps to ISO 8601. Raw format preserved in `_meta`.
- **Option merging**: three-level cascade: config defaults → init options → request options. Via `mergeOptions()`.
- **Quality config**: `oxlint` and `oxfmt` spread the shared `@agntn/ox` policies. Linting is type-aware; ESLint was removed intentionally.
- **Build**: `obuild` reads `build.config.ts` → `dist/`. Four inputs in **one** bundle entry so the entrypoint, the CLI, the MCP server and the executors share chunks instead of each carrying a private copy of the provider factory.
- **One executor per operation**: MCP, Pi and OMP all call `src/tool-operations.ts`. A surface owns only its schema, its call rendering and its result envelope. Schema metadata (`PROVIDER_HINT`, limits) is restated per surface because parameters are declared before the executors can be loaded — the extension tests guard it against drift.
- **OMP loader imports stay literal**: `existsSync(src)` chooses between `import("../../../src/tool-operations.ts")` and `import("../../../dist/tool-operations.mjs")`. Never `import(url.href)`. `tsc` resolves that dist specifier, so `test:types` builds before it type-checks.
- **MCP result is text only**: `details` never reaches an MCP client, so anything a caller needs for the next call belongs in `content[].text`.
- **Listing fans out, reading falls back**: `snapshots()` queries providers in parallel and merges; `content()` walks them in order and stops at the first body, because there is one page to read rather than a set to merge. Providers that failed or cannot read are reported beside the body in `_meta`.
- **A capture is read raw or not at all**: bodies come from `id_` playback (Wayback, Arquivo.pt, Webarchiv Österreich, Archive-It) or a WARC byte range (Common Crawl). An archive that only serves its own rendition of a page returns `createUnsupportedContentResponse` with the reason instead.
- **A stored capture is the response as it travelled**: a WARC record keeps the chunked framing and the `Content-Encoding` the server used, so reading its text means undoing both before the charset is applied. Playback endpoints do it for you, which is why only the Common Crawl path carries this.
- **The library decodes, a surface renders**: charset decoding, WARC unwrapping and transfer/content encodings are library work, and the body it returns is text; `htmlToText`, clipping to `maxChars` and the untrusted-data fence are applied in `tool-operations.ts`, so a library consumer keeps the whole document rather than a reader's view of it. Text is the contract, not the raw bytes: a capture that is not text decodes lossily and its bytes stay behind `_meta.rawSnapshot` or the WARC coordinates.
- **The MCP process does not trust its own cwd**: `src/commands/mcp.ts` calls `setConfigCwd(homedir())` because a client spawns the server in an arbitrary checkout, and c12 executes the `archives.config.ts` it finds. `consola.level` is pinned there too — stdout carries the JSON-RPC frames.
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
- **Do not reimplement a tool inside a surface**: MCP, Pi and OMP delegate to `src/tool-operations.ts`. A fix applied in one extension only is a drift bug waiting to happen.
- **Do not fetch a playback URL without `id_`**: without the modifier the archive returns the capture inside its own toolbar with every link rewritten, which is the archive's rendition and not what the site served.
- **Do not report a missing implementation as `unsupported`**: that flag means the provider's API has no such endpoint, and the reason string is read by callers deciding whether to try elsewhere.
- **Do not put the whole body in a tool's `details`**: `content[].text` is the answer, and a second, longer copy in the transcript disagrees with what the caller was handed.
- **Do not put `dist/` first in the extension loader**: the extensions prefer `src/` so a working tree (and vitest) runs the code under test; `dist/` is the installed-package fallback.

## COMMANDS

```bash
pnpm install          # install deps
pnpm dev              # vitest watch mode
pnpm test             # lint + type-check + vitest with coverage
pnpm test:types       # build + tsc over lib and both extension surfaces
pnpm lint             # build + Nuxt types + type-aware oxlint + oxfmt check
pnpm lint:fix         # build + Nuxt types + oxlint fixes + oxfmt write
pnpm build            # obuild (build.config.ts) → dist/
node dist/cli.mjs mcp # run the MCP server over stdio (bin: archives mcp)
pnpm release          # test + changelogen + publish
```

## NOTES

- **Config is async**: `getConfig()`, `resolveConfig()`, `mergeOptions()`, `createFetchOptions()` are all async because c12 config loading is async. This propagates throughout.
- **Defaults**: concurrency=3, batchSize=20, timeout=10000ms, retries=1, cache TTL=7 days. README and code must match.
- **Memento Time Travel is gone**: `mementoweb.org` remains a static documentation site after LANL discontinued the aggregator in 2025. `providers.memento()` defaults to the live public ODU MemGator endpoint and may be pointed at another compatible instance with `baseUrl`.
- **Arquivo.pt is a direct provider**: query `https://arquivo.pt/wayback/cdx` as newline-delimited JSON and read raw bodies from `noFrame/replay/<timestamp>id_/<url>`. It belongs in `providers.all()` even though MemGator may also return Arquivo.pt captures, because Memento stays outside that fan-out.
- **Webarchiv Österreich uses CDXJ for one URL at a time**: query `https://webarchiv.onb.ac.at/web/cdx` with the URL written as HTTP, because the index canonicalizes schemes but the HTTPS version can fail upstream. `from`, `to`, `limit` and `reverse=true` are supported; wildcard and `sort` queries are not. Read raw bodies from `/web/<timestamp>id_/<url>`. It requires no credentials and belongs in `providers.all()`.
- **WebCite has no list-by-domain API**: `webcite.snapshots(domain)` returns `unsupported: true` with a `unsupportedReason`. Direct snapshot retrieval (`webcitation.org/<id>`) is planned via a future `getById` API. New archives have not been accepted since ~2019.
- **Archive.today uses Memento API**: parses timemap link headers with regex. Fragile if format changes.
- **Playground targets Cloudflare**: `nitro.preset = 'cloudflare_module'` with `nodeCompat: true`.
- **CI runs coverage separately**: `pnpm vitest --coverage` as its own step, not via `pnpm test`.
- **Autofix CI**: PRs get auto-committed lint fixes via `autofix-ci/action`.
- **Renovate**: extends `github>unjs/renovate-config` for dependency updates.
- **coverage/ is committed**: HTML coverage reports are in git (not in .gitignore despite `dist` being ignored).
