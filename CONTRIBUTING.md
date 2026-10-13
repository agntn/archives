# Contributing

## Setup

Run `pnpm install`, then `pnpm --dir docs install`: `test/docs-mcp.test.ts` loads the `/mcp` helper and its toolkit from `docs/node_modules`. `pnpm test` runs lint, the type checks and the suite with coverage.

## Adding a provider

- Copy `src/providers/wayback.ts`, register the factory in `src/providers/index.ts` and put its option types in `src/_providers.ts`, not beside the implementation.
- Answer through `createSuccessResponse`, `createErrorResponse` and `createUnsupportedResponse`, never a raw object. Convert timestamps to ISO 8601 and keep the native one in `_meta`.
- `unsupported` means the archive's API has no such endpoint, and callers read the reason to decide whether to try elsewhere. A missing implementation is not that.
- Read a capture raw or not at all: `id_` playback or a WARC byte range. An archive that only serves its own rendition returns `createUnsupportedContentResponse` with the reason.
- A factory may cache its module-load promise, never a configured instance, and a failed import stays retryable.
- `providers.all()` leaves out providers that need a key or a collection, and Memento, which already fans out across archives. Its JSDoc says why for each.
- Add `test/<provider>.test.ts`, offline and deterministic, and its page under `docs/content/2.providers/`.

## Tools

- What a tool does lives in `src/tool-operations.ts`, and its definition in `src/tools.ts`. MCP, Pi and OMP register those definitions, so a fix never goes into one surface only.
- A new tool also needs its file in `docs/server/mcp/tools/`; `test/docs-mcp.test.ts` fails without it.
- An MCP client sees only `content[].text`, so anything the next call needs is there, and `details` never carries a second, longer copy of the body.
- Archived bodies and provider fields are untrusted: bound every read and render them as text.
