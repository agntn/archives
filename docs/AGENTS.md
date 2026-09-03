# docs/

Docus site for `@agntn/archives`. Markdown lives in `content/`. The timeline explorer is a Vue page in the Nuxt app backed by Nitro routes, not a `playground/` script.

## Layout

```
docs/
├── nuxt.config.ts                 # extends: ['docus'], cloudflare_module preset
├── app/app.config.ts              # title, github, theme
├── app/app.css                    # theme tokens (light + .dark), shared `archives-*` classes
├── app/components/                # Docus overrides: AppHeaderLogo, AppHeaderCTA (nav), AppFooterLeft
├── app/components/content/        # MDC components (`::landing-home`, `::provider-facts`, `::timeline-explorer`)
├── app/composables/               # useLandingArchive (one clock for every live panel), useSubNavigation
├── app/utils/                     # providers table, timeline grouping, formatting, recorded landing samples
├── app/pages/timeline.vue         # explorer, own route outside the docs layout
├── server/api/                    # snapshots, content, diff, providers over @agntn/archives/tool-operations
├── content/index.md               # landing
├── content/1.guide/               # getting started, snapshots, content, diff, configuration, agents, custom
└── content/2.providers/           # one page per provider
```

`playground/` at the repo root stays a bare Nitro app with the sample routes.

## Commands

```bash
pnpm install          # from docs/, after pnpm build in the repo root
pnpm dev              # http://localhost:3000
pnpm build            # Cloudflare Workers output in .output/, content routes prerendered
pnpm deploy           # build, then wrangler deploy to archives.agntn.dev
pnpm generate         # static output only; the /api routes need the worker
```

Deployment: Nitro preset `cloudflare_module`. Nuxt Content needs a D1 binding named `DB`; `wrangler.jsonc` carries the binding and the `NUXT_SITE_URL` var, Nitro merges it into the generated `.output/server/wrangler.json`. Create the database once with `wrangler d1 create agntn-archives` and put its id in `wrangler.jsonc`.

The site imports `@agntn/archives` from `file:..`. Build the parent package first.

Resolution traps, both caused by the repo root being a separate pnpm workspace with its own Nuxt playground:

- `pnpm-workspace.yaml` sets `shamefullyHoist: true`. Without it `docs/node_modules` holds only direct dependencies, Node walks up to the root `node_modules`, and the server bundle gets a second copy of Vue (`Cannot read properties of null (reading 'ce')` on every SSR route).
- `nuxt.config.ts` pins `workspaceDir` to `docs/` and disables devtools and telemetry, which would otherwise be resolved from the root.
- `nitro.alias.c12` points at `server/stubs/c12.ts`: the library discovers config files through c12, and a Worker has no filesystem. The stub returns the library defaults.

## Live data

- `server/api/*.get.ts` call `snapshotArchives`, `contentArchives`, `diffArchives` and `listArchiveProviders`, the executors behind the MCP server and the agent extensions. The page shows what an agent would get, including the tool text.
- Every route is a `defineCachedEventHandler` with a key built from the normalized parameters. Do not bypass the cache: the archives behind it are public services.
- Parameters are capped in `server/utils/query.ts` below the library's ceilings (limit 50, content 8 000 chars, diff 20 000 chars). Raise them there, not per route.
- No Perma.cc key is configured on the worker. `provider=permacc` answers with the library's own error.
- `app/utils/landing-fixtures.ts` holds answers recorded through the library so the landing paints before the worker answers. Regenerate it through the executors; never hand-edit the recorded text.

## Constraints

- Archived bodies are untrusted data. Render them in `<pre>` as text; never `v-html`, never evaluate.
- Provider names, icons and factory signatures live once in `app/utils/providers.ts`. The sidebar, the landing grid, the explorer and `::provider-facts` read from it.
- Keep Node demos in `playground/`.
