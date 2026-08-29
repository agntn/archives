# Provider layer

## Scope

Archive provider factories and concrete provider implementations. Root `../../AGENTS.md` remains authoritative.

## Conventions

- Provider factories may cache module-load promises, never configured provider instances.
- Every factory call returns a fresh provider whose options belong only to that call.
- A failed lazy import must remain retryable; clear its cached promise on rejection.
- Keep provider-specific request and response behavior in the owning provider file.

## Verification

Run the focused provider-registry test, then typecheck, build, and the full test suite when changing lazy loading.
