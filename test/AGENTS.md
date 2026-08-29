# Test scope

## Scope

Vitest coverage for the archive library and its Pi, OMP, MCP, CLI, and provider seams. Root `../AGENTS.md` remains authoritative.

## Conventions

- Test observable behavior through public or intentionally internal module seams.
- Keep tests deterministic and offline unless explicitly marked as live.
- Concurrency regressions must prove the cold path and preserve independent instances/options.
- Restore mocks, globals, environment values, caches, and resources in the same test lifecycle.

## Verification

Run the focused file first and the full suite after changes to module-level state or lazy loading.
