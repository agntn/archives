# WebMCP client plugins

## Scope

Nuxt integration that runs only in the client and uses agent APIs provided by the browser. Parent `docs/AGENTS.md` remains authoritative.

## Constraints

- WebMCP is progressive enhancement: unsupported browsers must keep the site fully functional.
- Register against canonical `document.modelContext`; no deprecated navigator fallback.
- Tie every registration to an `AbortController` and pass execution cancellation into network calls.
- Do not expose tools cross-origin. Archived content remains untrusted data.
