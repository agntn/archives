# Pi extension scope

## Scope

Distributable Pi extension for `@agntn/archives`. Root `../../../AGENTS.md` remains authoritative.

## Conventions

- Delegate behavior to `src/tool-operations.ts`; keep this file to schemas, registration, call previews, and TUI commands.
- Prefer source executors in a checkout and built executors in an installed package.
- Keep local schema constants synchronized with the shared executor contract and cover drift in `test/pi-extension.test.ts`.
- Every tool that reads the network is read only, passes cancellation through, and renders untrusted fields safely.

## Verification

Run `test/pi-extension.test.ts`, `pnpm test:types`, and a package build.
