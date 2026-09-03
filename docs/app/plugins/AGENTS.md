# WebMCP client plugins

## Scope

Nuxt integration that runs only in the client and uses agent APIs provided by the browser. Parent `docs/AGENTS.md` remains authoritative.

## Constraints

- WebMCP only enhances the site: unsupported browsers must keep every manual action.
- Register against canonical `document.modelContext`. Do not add a navigator fallback.
- Tie every registration to an `AbortController` and pass execution cancellation into network calls.
- Do not expose tools cross-origin. Archived content remains untrusted data.
