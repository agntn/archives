# OMP extension scope

## Scope

Distributable OMP extension for `@agntn/archives`. Root `../../../AGENTS.md` remains authoritative.

## Conventions

- Register the definitions from `src/tools.ts` through `registerOmpTools`; keep this file to registration, call previews, and TUI commands.
- Keep loader imports literal so OMP can rewrite bare dependencies.
- Pass the host `Text` from `pi.pi`: compiled OMP injects only the package root.

## Verification

Run `test/omp-extension.test.ts`, `pnpm test:types`, and a package build.
