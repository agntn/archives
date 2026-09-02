# OMP extension scope

## Scope

Distributable OMP extension for `@agntn/archives`. Root `../../../AGENTS.md` remains authoritative.

## Conventions

- Delegate behavior to `src/tool-operations.ts`; keep this file to OMP schemas, registration, call previews, and TUI commands.
- Keep loader imports literal so OMP can rewrite bare dependencies.
- Build schemas with the TypeBox facade injected by OMP.
- Keep local schema constants synchronized with the shared executor contract and cover drift in `test/omp-extension.test.ts`.

## Verification

Run `test/omp-extension.test.ts`, `pnpm test:types`, and a package build.
