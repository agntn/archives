# docs/

Docus site for `@agntn/archives`. Markdown lives in `content/`. The timeline explorer is a Vue page in the Nuxt app backed by Nitro routes, not a `playground/` script.

## Layout

```
docs/
├── nuxt.config.ts                 # extends: ['docus'], cloudflare_module preset (Workers), local fonts, Shiki theme, icon bundle
├── shiki-theme.ts                 # code block theme, every colour a `--shiki-token-*` variable from app.css
├── DESIGN.md                      # what this site owns on top of the agntn design system, and where it departs
├── app/app.config.ts              # title, github, Nuxt UI variants in the instrument grammar
├── app/app.css                    # tokens, the shared `console-*` grammar, docs chrome, variant classes, `archives-*` parts
├── app/components/                # Docus overrides (header, sidebar, toc, page links, surround), ExplorerPanel, ProviderCells, OG templates
├── app/components/content/        # MDC components (`::landing-home`, `::provider-facts`, `::provider-roster`), Prose* overrides, explorer parts
├── app/composables/               # useLandingArchive (one clock for every live panel), useSubNavigation, useCopied, useRosterFlip
├── app/utils/                     # providers table, timeline grouping, formatting, tokens, roster classes, recorded landing samples
├── app/pages/                     # explorer routes outside the docs layout: timeline, compare, site, capture, urls, history, evidence, agent, status, shelf
├── server/api/                    # snapshots, content, diff, providers, coverage, urls, history, status over tool-operations
├── server/plugins/                # setConfig() at startup instead of config discovery, error stacks for the Workers logs
├── server/tasks/warm/demo.ts      # cron task: warm the coverage cache for DEMO_TARGETS
├── content/index.md               # landing
├── content/1.guide/               # getting started, snapshots, content, diff, configuration, agents, custom
└── content/2.providers/           # one page per provider
```

`playground/` at the repo root stays a bare Nitro app with the sample routes.

## Commands

```bash
pnpm install          # from docs/
pnpm dev              # http://localhost:3000
pnpm build            # Cloudflare Workers output in .output/, content routes prerendered
pnpm deploy           # build, then wrangler deploy to archives.agntn.dev
pnpm generate         # static output only; the /api routes need the worker
```

Deployment: Nitro preset `cloudflare_module`, which is the Cloudflare Workers preset in Nitro 2.13 (its standard name `cloudflare_workers` is not resolvable from the config and og-image does not know it). Nuxt Content needs a D1 binding named `DB`; `wrangler.jsonc` carries the binding and the `NUXT_SITE_URL` var, Nitro merges it into the generated `.output/server/wrangler.json`. Create the database once with `wrangler d1 create agntn-archives` and put its id in `wrangler.jsonc`.

The site bundles `@agntn/archives` from `../src` through the aliases in `nuxt.config.ts`, so it needs neither `dist/` nor a build of the parent package. Workers Builds installs only `docs/`, so every npm package the executors import (`c12`, `consola`, `diff`, `ohash`, `ufo`, `unstorage`) is a dependency here, pinned to the root version. A new package import under `src/` needs the same entry, or the deploy fails while a local build still passes.

Workers Builds never reads `engines`: it takes Node from the root `.node-version` and falls back to its own default without it, which was 24 while `engines` asked for 26. Keep that file on the major `engines` names.

Resolution traps, both caused by the repo root being a separate pnpm workspace with its own Nuxt playground:

- `pnpm-workspace.yaml` sets `shamefullyHoist: true`. Without it `docs/node_modules` holds only direct dependencies, Node walks up to the root `node_modules`, and the server bundle gets a second copy of Vue (`Cannot read properties of null (reading 'ce')` on every SSR route).
- `nuxt.config.ts` pins `workspaceDir` to `docs/` and disables devtools and telemetry, which would otherwise be resolved from the root.

## Live data

- `server/api/*.get.ts` call `snapshotArchives`, `contentArchives`, `diffArchives` and `listArchiveProviders`, the executors behind the MCP server and the agent extensions. The page shows what an agent would get, including the tool text.
- Every route goes through `cachedAnswer` in `server/utils/query.ts`: exact parameters as the key, the full TTL for a clean answer, five minutes for one with a provider failure, nothing for a thrown one. Do not bypass it: the archives behind it are public services. A cache miss also counts against `RATE_LIMIT` (30 new queries a minute per address, 429 past it); cache hits are free. The count runs on the Workers Rate Limiting binding `ARCHIVE_LIMIT` (`ratelimits` in `wrangler.jsonc`, same number), keyed by `CF-Connecting-IP`: never by `X-Forwarded-For`, whose first entry the caller writes, and never by a KV counter, which parallel misses race past. A cached answer is written with its `ttl` so KV drops it.
- Parameters are capped in `server/utils/query.ts` below the library's ceilings (limit 50, content 8 000 chars, diff 20 000 chars). Raise them there, not per route.
- Archive.today never answers a connection from Cloudflare Workers (522), so `server/utils/reach.ts` lists it as unreachable: routes refuse it before the cache and the rate limit, coverage and status report it as `unreachable` without a fetch, and its error line in a `provider=all` listing doesn't shorten the TTL.
- No Perma.cc key is configured on the worker. `provider=permacc` answers with the library's own error.
- `app/utils/landing-fixtures.ts` holds answers recorded through the library so the landing paints before the worker answers. Regenerate it through the executors; never edit the recorded text by hand.
- In production the cache lives in the KV binding `CACHE` (`$production.nitro.storage.cache`); locally it is in memory. `coverage()` in `server/utils/coverage.ts` caches one entry per provider and never a failed probe; the API route and the cron task share those entries, so warming fills what the page reads.
- Every explorer page applies its deep link through a `watch(route.query)` that fires once: a prerendered page hydrates with an empty query and Nuxt restores the address after mount.
- `CaptureViewer.vue` is the only place archived bodies are rendered. Pages pass it a page and, when they have one, the chronological list around it.

## Constraints

- Archived bodies are untrusted data. Render them in `<pre>` as text; never `v-html`, never evaluate.
- The viewer's Replay mode frames the archive's own playback URL and only for hosts known to allow it (`frame` in `providers.ts`, `canFrame`). Source mode draws the archived markup in an iframe with `sandbox=""` (no scripts, no origin), a CSP that admits only images, styles, fonts and media from the archive host, and a `<base>` on the capture. Keep both; never load archived markup into the page's own DOM.
- Provider names, icons, hosts, factory signatures and the roster sentence live once in `app/utils/providers.ts`. The sidebar, the landing, the explorer, `::provider-facts` and `::provider-roster` read from it.
- The look follows the agntn design system; `DESIGN.md` lists what this site owns and where it departs. Explorer instruments stand on `ExplorerPanel`; actions, chips, tabs and fields are Nuxt UI components with their variant in `app.config.ts`, never a hand-built `<button>`.
- Keep Node demos in `playground/`.
