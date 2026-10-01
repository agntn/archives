# Pi extension scope

## Scope

Distributable Pi extension for `@agntn/archives`. Root `../../../AGENTS.md` remains authoritative.

## Conventions

- Register the definitions from `src/tools.ts` through `registerPiTools`; keep this file to registration, call previews, and TUI commands.
- Prefer the source definitions in a checkout and the built ones in an installed package.
- Every tool that reads the network passes cancellation through and renders untrusted fields safely. It stays read only, except `archives_content` with a `path`, which also writes that file.

## Verification

Run `test/pi-extension.test.ts`, `pnpm test:types`, and a package build.
