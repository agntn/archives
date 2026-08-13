# PROJECT KNOWLEDGE BASE

**Last reviewed:** 2026-04-27
**Branch:** main

> Verify against current HEAD: `git rev-parse HEAD`. Code map line numbers reflect the snapshot above; rerun `grep -n` if they look stale.

## OVERVIEW

Unified TypeScript interface for querying web archive providers (Wayback Machine, Archive.today, Common Crawl, Perma.cc, WebCite). Built on the unjs ecosystem: ofetch, unstorage, c12, consola, ufo, obuild, changelogen.

## STRUCTURE

```
archives/
├── src/
│   ├── index.ts          # barrel - public API surface
│   ├── archive.ts        # createArchive factory + combineResults
│   ├── types.ts          # all public interfaces/types
│   ├── _providers.ts     # provider-specific option types (internal)
│   ├── config.ts         # c12-based config loading with caching
│   ├── storage.ts        # unstorage caching layer
│   ├── providers/        # one file per archive source + barrel
│   └── utils/            # parallel processing, response helpers, domain normalization
├── test/                 # mirrors src/ structure, one .test.ts per module
├── packages/pi/extensions/
│   └── archives.ts       # Pi tool/command surface shipped via package.json pi.extensions
├── playground/           # Nuxt app (Cloudflare preset) for manual provider testing
└── .github/workflows/    # ci.yml + autofix.yml
```

## WHERE TO LOOK

| Task                      | Location                                                | Notes                                                                              |
| ------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Add a provider            | `src/providers/` + register in `src/providers/index.ts` | Copy wayback.ts as template. Default export factory fn returning `ArchiveProvider` |
| Provider-specific options | `src/_providers.ts`                                     | Extend `ArchiveOptions`, add to `ProviderOptions` map                              |
| Change public API         | `src/index.ts`                                          | Barrel re-exports only. Types via `export type *`                                  |
| Modify caching            | `src/storage.ts`                                        | Key format: `{prefix}:{providerSlug}:{domain}:{limit?}`                            |
| Config defaults           | `src/config.ts` → `getDefaultConfig()`                  | c12 loads from `.archives`, `archives.config.ts`, `package.json`                   |
| Response helpers          | `src/utils/_utils.ts`                                   | `createSuccessResponse`, `createErrorResponse`, `mergeOptions`                     |
| Parallel processing       | `src/utils/_utils.ts` → `processInParallel`             | Concurrency + batch control                                                        |
| CDX row mapping           | `src/utils/_utils.ts` → `mapCdxRows`                    | Wayback/CommonCrawl share CDX format                                               |
| Test a provider           | `test/{provider}.test.ts`                               | Uses vitest, mocks with `vi.fn()`                                                  |
| Manual testing            | `playground/server/api/snapshots/`                      | One Nuxt endpoint per provider                                                     |
| Extend Pi extension       | `packages/pi/extensions/archives.ts` + `tsconfig.extensions.json` | Keep it distributable through `package.json` `pi.extensions` like askweb            |
| Integration test          | `test.sh`                                               | Builds lib, then builds playground against it                                      |

## CODE MAP

| Symbol                      | Type      | Location              | Role                                                                                        |
| --------------------------- | --------- | --------------------- | ------------------------------------------------------------------------------------------- |
| `createArchive`             | function  | archive.ts:56         | Core factory. Accepts provider(s) + options, returns `ArchiveInterface`.                    |
| `UnsupportedOperationError` | class     | archive.ts:18         | Thrown by `getPages()` when every queried provider is unsupported. Carries `providers` list. |
| `providers`                 | object    | providers/index.ts:14 | Lazy-loading factory. Each method returns `Promise<ArchiveProvider>`.                       |
| `ArchiveInterface`          | interface | types.ts:127          | Public API: `snapshots()`, `getPages()`, `use()`, `useAll()`.                               |
| `ArchiveProvider`           | interface | types.ts:117          | Provider contract: `name`, `slug?`, `snapshots()`.                                          |
| `ArchiveResponse`           | interface | types.ts:100          | `{ success, pages, error?, unsupported?, unsupportedReason?, _meta?, fromCache? }`.         |
| `ArchivedPage`              | interface | types.ts:61           | `{ url, timestamp, snapshot, _meta }`.                                                      |
| `UnsupportedProviderRecord` | interface | types.ts:84           | `{ provider, reason }` row used in `_meta.unsupportedProviders`.                            |
| `ArchivesConfig`            | interface | config.ts:8           | Config shape: `storage` + `performance` + env overrides.                                    |
| `processInParallel`         | function  | utils/_utils.ts:16    | Generic parallel executor with concurrency + batching.                                      |
| `createSuccessResponse`     | function  | utils/_utils.ts       | Build a normalized success `ArchiveResponse`.                                               |
| `createErrorResponse`       | function  | utils/_utils.ts       | Build a normalized runtime-error `ArchiveResponse`.                                         |
| `createUnsupportedResponse` | function  | utils/_utils.ts:184   | Build a response signalling the operation is outside the provider's API surface.            |
| `configureStorage`          | function  | storage.ts:147        | **@deprecated** – use config files or `createArchive` options.                              |
| `archives`                  | Pi tool   | packages/pi/extensions/archives.ts | Query archive snapshots through Pi; dynamic-imports package dist with source fallback.       |
| `archives_providers`        | Pi tool   | packages/pi/extensions/archives.ts | List provider status and Perma.cc env configuration.                                        |

## CONVENTIONS

- **Underscore prefix** = internal module (`_utils.ts`, `_providers.ts`). Not for direct import by consumers.
- **Provider pattern**: default export factory fn → returns `{ name, slug, snapshots() }`. Always async via `Promise<ArchiveProvider>`.
- **Lazy loading**: providers loaded via `await import('./provider')` in `providers/index.ts`. Enables tree-shaking.
- **Response normalization**: all providers must return `ArchiveResponse` via `createSuccessResponse` / `createErrorResponse` / `createUnsupportedResponse` helpers — never construct a raw object.
- **Unsupported operations are first-class**: when an operation is outside a provider's API surface (e.g. WebCite has no list-by-domain endpoint), return `createUnsupportedResponse(reason, slug)`, not a fake page or a fake error. `combineResults` propagates these into `_meta.unsupportedProviders`. `getPages()` throws `UnsupportedOperationError` (with `.providers`) when the whole call is unsupported, so callers can distinguish structural mismatches from runtime failures.
- **Timestamp format**: providers convert native timestamps to ISO 8601. Raw format preserved in `_meta`.
- **Option merging**: three-level cascade: config defaults → init options → request options. Via `mergeOptions()`.
- **Linting**: `oxlint` only; ESLint was removed intentionally.
- **Build**: `obuild src/index.ts` → `dist/`. Single entry point.
- **Pi extension packaging**: distributable extension lives under `packages/pi/extensions/*.ts`; `package.json` `pi.extensions` points there and `files` includes the directory.
- **Release**: `pnpm test && changelogen --release --push && pnpm publish`.

## ANTI-PATTERNS (THIS PROJECT)

- **Do not suppress types**: no `as any`, `@ts-ignore`. The codebase has zero instances.
- **Do not call `configureStorage` in new code**: it's `@deprecated`. Use config files or pass options to `createArchive`.
- **Do not pass `Promise[]` to `createArchive`**: `createArchive([providers.wayback(), ...])` is a type error. Use `Promise.all()` wrapper or `providers.all()`.
- **Do not add Perma.cc to `providers.all()`**: requires API key. Excluded intentionally.
- **Do not put provider types in `providers/`**: provider-specific option types live in `src/_providers.ts`, not alongside implementations.
- **Do not add deployable Pi package extensions under `.pi/extensions/`**: this project ships its Pi surface from `packages/pi/extensions/` via `package.json` `pi.extensions`, following askweb.

## COMMANDS

```bash
pnpm install          # install deps
pnpm dev              # vitest watch mode
pnpm test             # lint + type-check + vitest with coverage
pnpm test:types       # tsc lib + packages/pi/extensions type checks
pnpm lint             # oxlint
pnpm lint:fix         # oxlint --fix
pnpm build            # obuild src/index.ts → dist/
pnpm release          # test + changelogen + publish
bash test.sh          # build lib + build playground (integration)
```

## NOTES

- **Config is async**: `getConfig()`, `resolveConfig()`, `mergeOptions()`, `createFetchOptions()` are all async because c12 config loading is async. This propagates throughout.
- **Defaults**: concurrency=3, batchSize=20, timeout=10000ms, retries=1, cache TTL=7 days. README and code must match.
- **WebCite has no list-by-domain API**: `webcite.snapshots(domain)` returns `unsupported: true` with a `unsupportedReason`. Direct snapshot retrieval (`webcitation.org/<id>`) is planned via a future `getById` API. New archives have not been accepted since ~2019.
- **Archive.today uses Memento API**: parses timemap link headers with regex. Fragile if format changes.
- **Playground targets Cloudflare**: `nitro.preset = 'cloudflare_module'` with `nodeCompat: true`.
- **CI runs coverage separately**: `pnpm vitest --coverage` as its own step, not via `pnpm test`.
- **Autofix CI**: PRs get auto-committed lint fixes via `autofix-ci/action`.
- **Renovate**: extends `github>unjs/renovate-config` for dependency updates.
- **coverage/ is committed**: HTML coverage reports are in git (not in .gitignore despite `dist` being ignored).
