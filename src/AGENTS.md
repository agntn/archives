# Source scope

## Scope

Core public API, archive orchestration, shared tool executors, configuration, storage, and MCP transport. Root `../AGENTS.md` remains authoritative.

## Conventions

- Keep behavior independent of providers outside `providers/`.
- Put shared operation logic in `tool-operations.ts`; MCP, Pi, and OMP own only schemas and rendering.
- Export public library contracts through `types.ts` and `index.ts`.
- Treat archived bodies and provider fields as untrusted input. Bound network reads, expensive transforms, and rendered output.
- Preserve provider and capture provenance in every derived result.
- `diff.ts` requires provider provenance and one underlying archive host for Memento pairs; it also owns chronology, textual MIME, newline, time, and edit distance validation.
- Derived diff pagination belongs in `tool-operations.ts`. A continuation pins the complete patch SHA-256, and a nonzero offset without that digest is invalid.

## Verification

Run focused Vitest coverage, `pnpm test:types`, and the full suite for public API or changes across surfaces.
