# docs/

Cloudflare Workers Builds deploys this site to archives.agntn.dev. It runs `pnpm install` in `docs/`, which installs the whole workspace from the root lockfile, and takes Node.js from the root `.node-version`, never from `engines`; without that file it falls back to its own default, which was 24.

Resources on the Cloudflare account, bound by id in `wrangler.jsonc`:

- D1 `agntn-archives` as `DB`, KV as `CACHE`
- D1 and KV `agntn-archives-preview` for branch previews
- Rate limiting binding `ARCHIVE_LIMIT`, shared by production and previews, since both read the same public archives

The worker has no Perma.cc key, so `provider=permacc` answers with the library's own error. Archive.today never answers a connection from Workers (522), which is why `server/utils/reach.ts` lists it as unreachable.
