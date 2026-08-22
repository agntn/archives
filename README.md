# @agntn/archives

[![npm version](https://img.shields.io/npm/v/%40agntn%2Farchives?style=flat&colorA=130f40&colorB=474787)](https://npmjs.com/package/@agntn/archives)
[![npm downloads](https://img.shields.io/npm/dm/%40agntn%2Farchives?style=flat&colorA=130f40&colorB=474787)](https://npm.chart.dev/@agntn/archives)
[![license](https://img.shields.io/github/license/agntn/archives?style=flat&colorA=130f40&colorB=474787)](https://github.com/agntn/archives/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/agntn/archives)

Unified TypeScript interface for querying web archive providers. One API, multiple sources, consistent output.

## Features

- 🔍 **Multiple providers** - Wayback Machine, Archive-It, Conifer, Archive.today, Common Crawl, Perma.cc, WebCite
- 📄 **Reads captures, not just lists them** - `content()` returns what an archived page said, decoded from the original response
- 🌳 **Tree-shakable** - providers are lazy-loaded via dynamic imports, bundle only what you use
- 📦 **Caching built in** - pluggable storage layer via [unstorage](https://github.com/unjs/unstorage) with configurable TTL
- ⚡ **Parallel queries** - concurrency control, batching, automatic retries, configurable timeouts
- 🔧 **Config files** - supports `archives.config.ts`, `.archives`, and `package.json` via [c12](https://github.com/unjs/c12)
- 🏷️ **Fully typed** - TypeScript definitions for all responses, options, and provider-specific metadata
- 🔌 **Agent surfaces** - an MCP server plus native OMP and Pi extensions, all answering from the same executors

## Install

```bash
pnpm add @agntn/archives
```

## Usage

```ts
import { createArchive, providers } from "@agntn/archives";

const archive = createArchive(providers.wayback());
const response = await archive.snapshots("example.com", { limit: 100 });

if (response.success) {
  for (const page of response.pages) {
    console.log(page.url, page.timestamp, page.snapshot);
  }
}
```

Query all providers at once with `providers.all()` (excludes Archive-It and Conifer because they need collection-specific identifiers, and Perma.cc because it needs an API key):

```ts
const archive = createArchive(providers.all());
const response = await archive.snapshots("example.com");
```

To pick specific providers, wrap them in `Promise.all`:

```ts
const archive = createArchive(
  Promise.all([providers.wayback(), providers.archiveToday(), providers.commoncrawl()]),
);
```

### Time window

`snapshots()` takes `from` and `to` bounds, as archive digits (`2019`, `201903`, up to `20190301120000`) or ISO 8601 dates. Both are inclusive, and a partial value covers the whole period it names, so `from: '2019', to: '2019'` is the entire year:

```ts
const response = await archive.snapshots("example.com", { from: "2019", to: "2019-06" });
```

Providers whose index takes a window (Wayback, Archive-It) narrow the query itself; for the rest the listing is filtered after it returns, so captures outside the window never mix into a fan-out. A filtered listing can come back shorter than `limit` - raise it when a sparse window needs more of the archive.

### Perma.cc

Perma.cc requires an API key and searches archives accessible to that account by exact submitted URL:

```ts
const archive = createArchive(providers.permacc({ apiKey: "YOUR_API_KEY" }));
const response = await archive.snapshots("https://example.com/page");
```

A bare domain such as `example.com` is normalized to `https://example.com/`. It does not match every path on that domain.

### Archive-It

Archive-It queries one public collection at a time through its CDX/C API. Pass the numeric collection ID when creating the provider:

```ts
const archive = createArchive(providers.archiveIt({ collection: 4399 }));
const response = await archive.snapshots("archive-it.org");
```

Archive-It’s all-collections endpoint is temporarily blocked, so `providers.archiveIt()` requires a collection and is not included in `providers.all()`.

### Conifer

Conifer searches one existing public collection at a time. Pass its user and collection slugs:

```ts
const archive = createArchive(providers.conifer({ user: "imamuseum", collection: "imamuseumorg" }));
const response = await archive.snapshots("imamuseum.org");
```

Conifer disabled new captures and collection editing ahead of its June 2026 discontinuation, but Rhizome continues to host existing collections in read-only form. The provider is therefore not included in `providers.all()`.

### Error handling

`snapshots()` returns a response object with a `success` flag. If you prefer throwing on failure, use `getPages()`:

```ts
// safe - check success flag yourself
const response = await archive.snapshots("example.com");

// throws on failure, returns pages array directly
const pages = await archive.getPages("example.com");
```

`getPages()` distinguishes runtime failures from structural ones. When every queried provider is _unsupported_ for the operation (see below), it throws `UnsupportedOperationError` with the per-provider reasons attached:

```ts
import { UnsupportedOperationError } from "@agntn/archives";

try {
  const pages = await archive.getPages("example.com");
} catch (error) {
  if (error instanceof UnsupportedOperationError) {
    // error.providers: [{ provider, reason }, ...]
  } else {
    // generic Error: network failure, parse error, etc.
  }
}
```

## Reading archived content

`snapshots()` says which captures exist; `content()` returns what one of them said:

```ts
const archive = createArchive(providers.wayback());

// Newest capture
const response = await archive.content("example.com");
response.content?.content; // the archived page body
response.content?.timestamp; // when it was captured
response.content?.snapshot; // the playback URL it came from

// The page as it stood in March 2019
const older = await archive.content("https://example.com/page", { timestamp: "2019-03-01" });
```

`timestamp` takes an ISO 8601 date or archive digits (`2019`, `201903`, up to `20190301120000`), and selects the newest capture at or before it. When the archive only holds later ones, it reads the closest capture after it. A snapshot URL works as the target as well, in which case the capture it names is the one read:

```ts
await archive.content("https://web.archive.org/web/20190301120000/https://example.com/");
```

Bodies are read through each archive's raw-capture endpoint, never its playback UI: Wayback and Archive-It replay the original response under the `id_` modifier, and Common Crawl serves the byte range of the WARC record the index points at. Fetching a snapshot URL by hand returns the archive's own framing of the page instead.

Providers are tried in order and the first body wins, because there is one page to read rather than a set to merge. The ones that could not answer are reported next to the body:

```ts
const response = await createArchive(providers.all()).content("example.com");
response._meta?.errors; // ["wayback: ..."] when an archive failed
response._meta?.unsupportedProviders; // [{ provider: "archive-today", reason: "..." }]
```

`content()` reads at most `maxBytes` (2 MiB by default) and reports `truncated: true` when it stopped early, so an archived video or disk image cannot be pulled into memory by accident. `getContent()` is the throwing variant, mirroring `getPages()`.

## Providers

| Provider        | Factory                    | `content()` | Notes                                                                                              |
| --------------- | -------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Wayback Machine | `providers.wayback()`      | yes         | web.archive.org CDX API; captures replayed under `id_`                                             |
| Archive-It      | `providers.archiveIt()`    | yes         | Requires a numeric `collection`; collection-specific CDX/C API                                     |
| Conifer         | `providers.conifer()`      | no          | Requires `user` and `collection`; searches an existing public collection                           |
| Archive.today   | `providers.archiveToday()` | no          | archive.ph via Memento timemap; no raw-capture endpoint                                            |
| Common Crawl    | `providers.commoncrawl()`  | yes         | Defaults to latest collection; bodies read from the WARC byte range                                |
| Perma.cc        | `providers.permacc()`      | no          | Requires `apiKey`; exact URL lookup only; API returns metadata only                                |
| WebCite         | `providers.webcite()`      | no          | No list-by-domain API; `snapshots()` returns unsupported. New archives no longer accepted (~2019). |
| All             | `providers.all()`          | n/a         | Wayback, Archive.today, Common Crawl, and WebCite                                                  |

A provider that cannot serve bodies answers `content()` as unsupported with the reason, exactly as it does for a listing it has no endpoint for.

You can add providers dynamically after creation:

```ts
const archive = createArchive(providers.wayback());
await archive.use(providers.archiveToday());
await archive.useAll([providers.commoncrawl(), providers.webcite()]);
```

## MCP server

```bash
archives mcp
```

Speaks MCP over stdio and exposes three tools: `archives_snapshots`, `archives_content` and `archives_providers`. Point a client at it:

```json
{
  "mcpServers": {
    "archives": { "command": "npx", "args": ["-y", "@agntn/archives", "mcp"] }
  }
}
```

An MCP client sees the text a tool returns and nothing else, so the text carries the whole answer: the provider that was queried, every snapshot with its timestamp and original URL, and the providers that could not answer, named with their reason instead of silently dropped. `archives_providers` is there for the same reason — without it the only way to learn which providers exist, which ones `provider=all` covers, and whether Perma.cc has a key is to send a value you expect to fail.

`archives_content` returns the capture's original URL, its date, the snapshot it was read from, and the body, with markup stripped to readable text unless `format=raw` and clipped to `maxChars` (20 000 by default) with a note saying so. The body is fenced and labelled as untrusted data: it is a recording of a web page, not a message to the caller. A capture that is not text is described instead of decoded.

`archives_snapshots` is annotated read-only and open-world: it leaves the machine on every call, and archives keep growing, so two identical calls may legitimately differ. An answer replayed from the response cache is marked `; cached` in its header. A provider that returns no snapshots is an answer, not a tool error. Only a rejected argument or a failed query sets `isError`. `from` and `to` bound the listing to a time window, and the applied window is echoed in the header so a narrowed answer never reads as the archive's whole holdings.

The Perma.cc key is read from `PERMA_CC_API_KEY` or `PERMACC_API_KEY` and never accepted as a tool argument; it is redacted before the options reach any result.

An MCP client starts the server in whatever directory it has open, so `archives mcp` resolves `archives.config.ts`, `.archives` and `package.json#archives` from the **home directory of the account running it**, not from that project. A config file belonging to a repository you are merely browsing is code you did not choose to run. The library keeps resolving from `process.cwd()`, unchanged.

`createMcpServer()` is exported from `@agntn/archives/mcp` for hosts that bring their own transport.

## Agent extensions

`@agntn/archives` ships native extensions for [OMP](https://omp.sh) and [Pi](https://pi.dev). Install the package directly from GitHub with the matching host:

```bash
omp install github:agntn/archives
pi install git:github.com/agntn/archives
```

Tools:

- `archives` — query archived snapshots for a domain or URL. Use `provider="all"` for broad coverage or `provider="wayback"` for a fast Wayback-only lookup.
- `archives_content` - read the body of one archived capture. Pass `timestamp` for a point in time, or a snapshot URL to read the capture it names.
- `archives_providers` — list built-in archive providers and Perma.cc API-key environment status.

Commands:

- `/archive [domain-or-url]` — search Wayback snapshots interactively and paste the selected snapshot URL into the editor.
- `/archive-providers` — show provider availability notes.

All three surfaces call the executors in `src/tool-operations.ts`, so the MCP server and the two extensions answer identically. The extensions add the structured details the harnesses render; MCP drops them and keeps the text. The extensions read the executors from source in a working tree and from `dist/` inside an installed package, so run `pnpm build` before loading an extension from a checkout.

## Response format

Every provider normalizes its output to the same shape:

```ts
interface ArchiveResponse {
  success: boolean;
  pages: ArchivedPage[];
  error?: string;
  unsupported?: boolean; // provider does not implement this operation
  unsupportedReason?: string;
  _meta?: ResponseMetadata;
  fromCache?: boolean;
}

interface ArchivedPage {
  url: string; // original URL
  timestamp: string; // ISO 8601
  snapshot: string; // direct link to the archived version
  _meta: Record<string, unknown>;
}
```

A read capture has its own shape:

```ts
interface ArchivedContent {
  url: string; // original URL, as the archive recorded it
  timestamp: string; // ISO 8601 date of the capture returned
  snapshot: string; // playback URL the body came from
  content: string; // decoded body of the archived response
  mime?: string; // content type the archive reports
  bytes: number; // bytes read, after any cap
  truncated: boolean; // body was cut off at maxBytes
  _meta: Record<string, unknown>;
}
```

The `_meta` object on each page carries provider-specific fields. Wayback includes `status` and `timestamp` in its raw format. Common Crawl adds `digest`, `mime`, `collection`. Perma.cc has `guid`, `title`, `created_by`. Archive.today provides `hash` and `raw_date`.

### Unsupported operations

Not every provider implements every operation. WebCite, for example, exposes no list-by-domain API — it only resolves snapshots by ID. When a provider cannot answer a call, it returns `success: false` with `unsupported: true` and a human-readable `unsupportedReason`, instead of fabricating data.

For multi-provider calls, the combined response surfaces unsupported providers under `_meta.unsupportedProviders` regardless of how the rest behaved. The top-level `unsupported` flag has stricter semantics:

| Scenario                                                   | `success` | `error`       | `unsupported` | `_meta.unsupportedProviders` |
| ---------------------------------------------------------- | --------- | ------------- | ------------- | ---------------------------- |
| Some providers succeed, others are unsupported             | `true`    | —             | —             | populated                    |
| Some providers error, others are unsupported, none succeed | `false`   | joined errors | —             | populated                    |
| Every queried provider is unsupported                      | `false`   | —             | `true`        | populated                    |

Example:

```ts
const archive = createArchive(providers.all());
const response = await archive.snapshots("example.com");

response.pages; // results from Wayback, Archive.today, Common Crawl
response._meta?.unsupportedProviders;
// [{ provider: "webcite", reason: "WebCite has no list-by-domain API. ..." }]
```

To treat unsupported providers as a _whole-call_ failure, check the top-level flag explicitly: `if (!response.success && response.unsupported) { ... }`.

## Configuration

Archives loads configuration through [c12](https://github.com/unjs/c12), which means you can configure it via config files, environment overrides, or `package.json`:

```ts
// archives.config.ts
export default {
  storage: {
    cache: true,
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    prefix: "archives",
  },
  performance: {
    concurrency: 3,
    batchSize: 20,
    timeout: 10_000,
    retries: 1,
  },
};
```

Environment-specific overrides work with `$development`, `$production`, and `$test` keys.

### Custom storage driver

The caching layer is backed by [unstorage](https://github.com/unjs/unstorage), so any unstorage driver works:

```ts
import { configureStorage } from "@agntn/archives";
import fsDriver from "unstorage/drivers/fs";

await configureStorage({
  driver: fsDriver({ base: "./cache" }),
  ttl: 24 * 60 * 60 * 1000, // 1 day
});
```

Per-request cache control is also supported:

```ts
// skip cache for this request
await archive.snapshots("example.com", { cache: false });
```

## API

### `createArchive(providers, options?)`

Creates an archive client. Accepts a single provider, a `Promise<ArchiveProvider>`, or a `Promise<ArchiveProvider[]>`.

Returns:

- `snapshots(domain, options?)` - returns full `ArchiveResponse` with success flag
- `getPages(domain, options?)` - returns `ArchivedPage[]`, throws on failure
- `content(url, options?)` - returns `ArchiveContentResponse` with the archived body
- `getContent(url, options?)` - returns `ArchivedContent`, throws on failure
- `use(provider)` - add a provider to the instance
- `useAll(providers)` - add multiple providers at once

### Options

All methods accept `ArchiveOptions`:

| Option        | Type      | Default     | Description                          |
| ------------- | --------- | ----------- | ------------------------------------ |
| `limit`       | `number`  | `1000`      | Maximum results to return            |
| `cache`       | `boolean` | `true`      | Enable/disable caching               |
| `ttl`         | `number`  | `604800000` | Cache TTL in milliseconds (7 days)   |
| `concurrency` | `number`  | `3`         | Max parallel requests                |
| `batchSize`   | `number`  | `20`        | Items per processing batch           |
| `timeout`     | `number`  | `10000`     | Request timeout in ms                |
| `retries`     | `number`  | `1`         | Retry attempts on failure            |
| `apiKey`      | `string`  | -           | API key for providers that need auth |

`content()` takes two more, in `ArchiveContentOptions`:

| Option      | Type     | Default   | Description                                                    |
| ----------- | -------- | --------- | -------------------------------------------------------------- |
| `timestamp` | `string` | -         | Capture to read: ISO 8601 date or archive digits               |
| `maxBytes`  | `number` | `2097152` | Cap on the bytes read from the body; sets `truncated` when hit |

Options can be set at three levels: config file (global defaults), `createArchive` call (instance defaults), and individual method calls (per-request). Each level overrides the previous one.

### Storage utilities

- `configureStorage(options?)` - configure the cache driver and settings
- `clearProviderStorage(provider)` - clear cached responses for a specific provider
- `storage` - direct access to the underlying unstorage instance

## Roadmap

**Providers:** —

**Features:** Page archiving API for creating archives, not just reading them

## License

MIT
