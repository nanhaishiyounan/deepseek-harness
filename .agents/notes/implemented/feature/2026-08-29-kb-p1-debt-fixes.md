# Agent Note: kb P1 debt fixes — configurable embed backoff, dual-connection sqlite tests

Status: implemented

English | [中文](2026-08-29-kb-p1-debt-fixes.zh.md)

## Problem

The P0 closed-loop verification passed twice but named three mechanical debts: the kb-agent closed-loop fixture's header comment pointed at the deleted `examples/kb-agent/cordis.yml` through a `../..//` typo, the kb-sqlite store's WAL + busy-timeout + BEGIN IMMEDIATE concurrency machinery had no explicit dual-connection test (only single-connection `:memory:` specs), and both embed providers hardcoded `RETRY_BACKOFF_BASE_MS = 100` as a module constant while `maxRetries` sat configurable beside it — an asymmetry with the `BackoffConfig` pattern in `dsh-llm`.

## Decision

### F1: the fixture comment names the live entry

`examples/kb-agent/tests/fixtures/kb-closed-loop.cordis.yml` now points at `../../cordis.patch.yml`, the real entry since D4 deleted the standalone example config; no other file under `examples/kb-agent` references the deleted path.

### F2: dual-connection concurrency is pinned by a worker-held lock

`packages/kb/kb-sqlite/tests/concurrency.spec.ts` opens two `SqliteKbStore` instances on one temp file and covers: WAL cross-connection visibility of a committed write; busy-timeout resolution, where a `worker_threads` lock holder runs `BEGIN IMMEDIATE` on another thread and commits 150 ms later while the second connection's `putDocument` waits inside its 5 s busy timeout and succeeds; busy-timeout exhaustion failing loud with SQLITE_BUSY, then recovery once `terminate()` releases the lock; and 12 interleaved `putDocument` calls across both connections with exact stats counts and per-document retrieval. The lock holder must be a worker: the store's SQLite calls are synchronous, so the main thread can never release a lock while a second connection waits on it. The eval-string worker speaks CommonJS, so vitest needs no TypeScript transform inside it.

### F3: backoff constants became Config fields, defaults unchanged

Both embed providers expose `backoffBaseMs` (default 100, the former constant) and `backoffMaxMs` (default 2,147,483,647 — Node's largest schedulable `setTimeout` delay, so the default leaves exponential growth unbounded) as schemastery fields with `step(1).min(1)` validation; `backoffMaxMs` also caps at that platform ceiling. One backoff slot is `min(base × 2^attempt, max)`; the uniform 50–100% jitter and per-retry debug log from the [P0 fixes note](../bug-fix/2026-08-29-kb-agent-p0-fixes.md) are unchanged. The resolved-options interfaces and `apply` wiring mirror `maxRetries` field for field.

## Alternatives considered

- **A nested `BackoffConfig` object mirroring `dsh-llm` exactly** — the llm policy also carries `jitterRatio` and mode semantics the embed seam has no use for; two flat fields name everything configurable here without importing a policy vocabulary.
- **Capping `backoffMaxMs` at a small default such as 30 s** — changes shipped behavior for large `maxRetries`, breaking the debt's default-preserving contract; the `setTimeout` ceiling is the only default that behaves as "no cap".
- **Testing busy resolution with two same-thread stores** — impossible: single-threaded synchronous SQLite serializes `putDocument` calls, so no connection ever observes another's held lock; the worker thread is the minimal honest harness.
- **Fake timers for the backoff timing assertions** — the retry loop interleaves real HTTP against a local mock server; stubbing `Math.random` at 0.99 pins each delay exactly while real timers keep the request path genuine.

## Consequences

- Deployments can slow embed retry storms (`backoffBaseMs`) or bound worst-case retry latency (`backoffMaxMs`) from `cordis.yml`; defaults reproduce the previous timing exactly.
- The concurrency spec is the first kb-sqlite test against a file-backed WAL database from two connections; it found no src defect — the machinery was already correct, only untested.
- `docs/config-catalog.md` and its Chinese twin carry the new fields (the generator writes only the English file; the zh side's code blocks are verbatim English and were synced by hand), and both embed README triplets document the fields.

## Verification

- `pnpm vitest run packages/kb examples/kb-agent`: 259 tests green across 19 files.
- `pnpm vitest run packages/kb --coverage.enabled --coverage.include='packages/kb/*/src/**'`: every src file at 100% statements, branches, functions, and lines.
- `pnpm run typecheck`, `pnpm run lint` (0 warnings, 0 errors), and `pnpm run doc-sync` (28/28 gates) all green.
