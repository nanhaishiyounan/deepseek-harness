# Agent Note: duplication gate green — kb-embed-shared extraction, jscpd ignore annotations, deleteDocument transaction

Status: implemented

English | [中文](2026-08-29-duplication-gate-intentional-symmetry.zh.md)

## Problem

The FIX-F verification left `pnpm run duplication` red with 29 cross-package clones against a HEAD baseline of 0: llm-deepseek↔llm-minimax 19, kb-embed-minimax↔kb-embed-dashscope 8, kb-sqlite↔session-persistence-sqlite 2. The red gate blocked the kb merge. Two named Minor defects waited beside it: the embed backoff window had no inverted-range guard (`backoffBaseMs > backoffMaxMs` silently produces a capped nonsense schedule), and kb-sqlite's `deleteDocument` ran its existence SELECT outside the `BEGIN IMMEDIATE` transaction — a TOCTOU window where a competing deleter committing between the SELECT and the DELETE makes the method report `true` while deleting zero rows.

## Decision

### The verbatim embed transport core moved to `dsh-kb-embed-shared`

The new `packages/kb/kb-embed-shared` package owns `HttpEmbedError`, `isRetryable`, `backoffDelay` (the uniform 50–100% jitter over `min(base × 2^attempt, max)`), `backoff`, the retry loop `withEmbedRetries`, the `EmbedRetryOptions` slice, and the two backoff default constants. Both embed providers consume it; their `Config` fields, defaults (100 / 2^31−1), jitter, and debug log format are unchanged, and each provider's options interface now extends `EmbedRetryOptions`. The extraction removed the one clone pair that was byte-identical transport code; the remaining seven kb-embed pairs are vendor-template symmetry (below).

### `assertBackoffOrdered` fails loud at provider construction

`backoffBaseMs > backoffMaxMs` throws `[kb-embed] backoffBaseMs (1000) must be less than or equal to backoffMaxMs (500)` from each provider's constructor, mirroring the resolve-time validation of `resolveBackoff` in `dsh-llm` (packages/llm/llm/src/retry-policy.ts). Construction is the earliest point where both values coexist, so a misconfigured cordis.yml fails at plugin load instead of at the first retry; both providers carry a dedicated 1000/500 unit test.

### Intentional template symmetry is marked with jscpd ignore annotations, not extracted

jscpd's mild mode normalizes string literals and identifiers, so any two structurally identical stretches of ≥6 lines / ≥60 tokens clone regardless of vendor values — extraction cannot deduplicate a vendor template without a shared base class that couples vendor timelines. The repository's existing mechanism (every package's `invariant.ts` companion) applies: `/* jscpd:ignore-start */` … reason comment … `/* jscpd:ignore-end */` wraps each accepted segment on BOTH sides. Wrapped segments and reasons:

- llm-deepseek↔llm-minimax, 19 pairs across adapter.ts (httpErrorCode, the adapter shell methods, the watchdog block, the fetch block), index.ts (catalog schema, catalog normalization, the memoized options resolver, the registration tail), serialize.ts (flattenText/assertTextOnly, serializeAssistant, serializeMessages, the request-body tail), sse.ts (parseSse), translate.ts (the shared translation vocabulary), types.ts (the wire types) — the skeleton every vendor LLM adapter reproduces per docs/cookbook/adding-an-llm-adapter.md while evolving independently.
- kb-sqlite↔session-persistence-sqlite, 2 pairs — the isomorphic node:sqlite experimental-warning-filter loader and the closed sql-resource loader; the kb and session groups stay cross-dependency-free.
- kb-embed-minimax↔kb-embed-dashscope, 7 residual pairs — the Config surface, provider class shell, requestOnce skeleton, and apply wiring; the extracted transport core lives in dsh-kb-embed-shared.

### `deleteDocument` mirrors `putDocument`'s transaction shape

The existence SELECT now runs inside `BEGIN IMMEDIATE`: BEGIN → select → (miss: rollback, return false) → delete → COMMIT, failure rolls back. A competing-deleter worker (BEGIN IMMEDIATE, delete the identity, hold 150 ms, commit) makes the second connection's `deleteDocument` wait for the lock, then observe the identity gone in-transaction and report `false` with zero rows deleted; the pre-fix shape observed the row before BEGIN and wrongly reported `true`. The regression test fails on the pre-fix store shape (verified by temporarily reverting) and passes on the shipped one.

## Alternatives considered

- **A shared LLM adapter base class** — couples vendor timelines; one adapter package per vendor is the established pattern, and the symmetric segments interleave with genuinely vendor-specific logic (files API, think-tag splitting, usage envelopes).
- **Raising jscpd thresholds or adding path ignores to .jscpd.json** — masks new genuine duplication repo-wide; per-segment annotations name each accepted clone and its reason, and any duplicate outside the wraps still fails the gate.
- **The backoff guard inside `backoffDelay` only** — would fire on the first retry instead of plugin load; construction-time validation reaches the earliest resolvable point.
- **Extracting the whole embed provider into a shared base** — the Config surface and wire decode must stay per-package, and schema-factory call sites would clone anyway under literal normalization.

## Consequences

- `pnpm run duplication` reports 0 clones (exit 0), restoring the HEAD baseline and unblocking the kb merge.
- The ignore annotations are the registry of accepted symmetry: a new vendor adapter copies the template plus its annotations, while genuinely new duplication outside the wraps still fails the gate.
- `dsh-kb-embed-shared` is a published dependency of both embed providers; the [kb P1 debt fixes note](../feature/2026-08-29-kb-p1-debt-fixes.md) still owns the Config fields themselves.
- `deleteDocument` takes the write lock before its existence check, so a same-identity delete reports `true` exactly when it deleted rows.

## Verification

- `pnpm run duplication`: 0 clones, exit 0 (baseline before this change: 29, exit 1).
- `pnpm vitest run packages/kb packages/llm examples/kb-agent`: 68 files / 1299 tests green, including the competing-deleter regression.
- Per-file 100% coverage: `packages/kb` (all src, including kb-embed-shared) and `packages/llm/llm-minimax` via `--coverage.include`.
- `pnpm run typecheck`, `pnpm run lint` (0 warnings / 0 errors), `pnpm run build`, `pnpm run doc-sync`, `pnpm run hygiene` all green.
