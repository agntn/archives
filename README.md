# omnichron

[![npm version](https://img.shields.io/npm/v/omnichron?style=flat&colorA=130f40&colorB=474787)](https://npmjs.com/package/omnichron)
[![npm downloads](https://img.shields.io/npm/dm/omnichron?style=flat&colorA=130f40&colorB=474787)](https://npm.chart.dev/omnichron)
[![license](https://img.shields.io/github/license/oritwoen/omnichron?style=flat&colorA=130f40&colorB=474787)](https://github.com/oritwoen/omnichron/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/oritwoen/omnichron)

Unified TypeScript interface for querying web archive providers. One API, multiple sources, consistent output.

## Features

- 🔍 **Multiple providers** - Wayback Machine, Archive.today, Common Crawl, Perma.cc, WebCite
- 🌳 **Tree-shakable** - providers are lazy-loaded via dynamic imports, bundle only what you use
- 📦 **Caching built in** - pluggable storage layer via [unstorage](https://github.com/unjs/unstorage) with configurable TTL
- ⚡ **Parallel queries** - concurrency control, batching, automatic retries, configurable timeouts
- 🔧 **Config files** - supports `omnichron.config.ts`, `.omnichron`, and `package.json` via [c12](https://github.com/unjs/c12)
- 🏷️ **Fully typed** - TypeScript definitions for all responses, options, and provider-specific metadata

## Install

```bash
pnpm add omnichron
```

## Usage

```ts
import { createArchive, providers } from "omnichron";

const archive = createArchive(providers.wayback());
const response = await archive.snapshots("example.com", { limit: 100 });

if (response.success) {
  for (const page of response.pages) {
    console.log(page.url, page.timestamp, page.snapshot);
  }
}
```

Query all providers at once with `providers.all()` (excludes Perma.cc since it needs an API key):

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

### Perma.cc

Perma.cc requires an API key and searches archives accessible to that account by exact submitted URL:

```ts
const archive = createArchive(providers.permacc({ apiKey: "YOUR_API_KEY" }));
const response = await archive.snapshots("https://example.com/page");
```

A bare domain such as `example.com` is normalized to `https://example.com/`. It does not match every path on that domain.

### Error handling

`snapshots()` returns a response object with a `success` flag. If you prefer throwing on failure, use `getPages()`:

```ts
// safe - check success flag yourself
const response = await archive.snapshots("example.com");

// throws on failure, returns pages array directly
const pages = await archive.getPages("example.com");
```

`getPages()` distinguishes runtime failures from structural ones. When every queried provider is *unsupported* for the operation (see below), it throws `UnsupportedOperationError` with the per-provider reasons attached:

```ts
import { UnsupportedOperationError } from "omnichron";

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

## Providers

| Provider        | Factory                    | Notes                                     |
| --------------- | -------------------------- | ----------------------------------------- |
| Wayback Machine | `providers.wayback()`      | web.archive.org CDX API                   |
| Archive.today   | `providers.archiveToday()` | archive.ph via Memento timemap            |
| Common Crawl    | `providers.commoncrawl()`  | Defaults to latest collection             |
| Perma.cc        | `providers.permacc()`      | Requires `apiKey`; exact URL lookup only  |
| WebCite         | `providers.webcite()`      | No list-by-domain API; `snapshots()` returns unsupported. New archives no longer accepted (~2019). |
| All             | `providers.all()`          | All of the above except Perma.cc          |

You can add providers dynamically after creation:

```ts
const archive = createArchive(providers.wayback());
await archive.use(providers.archiveToday());
await archive.useAll([providers.commoncrawl(), providers.webcite()]);
```

## Pi extension

`omnichron` ships with a [pi](https://pi.dev) extension. Install the package from GitHub:

```bash
pi install git:github.com/oritwoen/omnichron
```

Tools:

- `omnichron` — query archived snapshots for a domain or URL. Use `provider="all"` for broad coverage or `provider="wayback"` for a fast Wayback-only lookup.
- `omnichron_providers` — list built-in archive providers and Perma.cc API-key environment status.

Commands:

- `/archive [domain-or-url]` — search Wayback snapshots interactively and paste the selected snapshot URL into the editor.
- `/archive-providers` — show provider availability notes.

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

The `_meta` object on each page carries provider-specific fields. Wayback includes `status` and `timestamp` in its raw format. Common Crawl adds `digest`, `mime`, `collection`. Perma.cc has `guid`, `title`, `created_by`. Archive.today provides `hash` and `raw_date`.

### Unsupported operations

Not every provider implements every operation. WebCite, for example, exposes no list-by-domain API — it only resolves snapshots by ID. When a provider cannot answer a call, it returns `success: false` with `unsupported: true` and a human-readable `unsupportedReason`, instead of fabricating data.

For multi-provider calls, the combined response surfaces unsupported providers under `_meta.unsupportedProviders` regardless of how the rest behaved. The top-level `unsupported` flag has stricter semantics:

| Scenario                                                  | `success` | `error`        | `unsupported` | `_meta.unsupportedProviders` |
| --------------------------------------------------------- | --------- | -------------- | ------------- | ---------------------------- |
| Some providers succeed, others are unsupported            | `true`    | —              | —             | populated                    |
| Some providers error, others are unsupported, none succeed | `false`   | joined errors  | —             | populated                    |
| Every queried provider is unsupported                     | `false`   | —              | `true`         | populated                    |

Example:

```ts
const archive = createArchive(providers.all());
const response = await archive.snapshots("example.com");

response.pages; // results from Wayback, Archive.today, Common Crawl
response._meta?.unsupportedProviders;
// [{ provider: "webcite", reason: "WebCite has no list-by-domain API. ..." }]
```

To treat unsupported providers as a *whole-call* failure, check the top-level flag explicitly: `if (!response.success && response.unsupported) { ... }`.

## Configuration

omnichron loads configuration through [c12](https://github.com/unjs/c12), which means you can configure it via config files, environment overrides, or `package.json`:

```ts
// omnichron.config.ts
export default {
  storage: {
    cache: true,
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    prefix: "omnichron",
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
import { configureStorage } from "omnichron";
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

Options can be set at three levels: config file (global defaults), `createArchive` call (instance defaults), and individual method calls (per-request). Each level overrides the previous one.

### Storage utilities

- `configureStorage(options?)` - configure the cache driver and settings
- `clearProviderStorage(provider)` - clear cached responses for a specific provider
- `storage` - direct access to the underlying unstorage instance

## Roadmap

**Providers:** Archive-It, Conifer (formerly Webrecorder)

**Features:** Page archiving API for creating archives, not just reading them

## License

MIT
