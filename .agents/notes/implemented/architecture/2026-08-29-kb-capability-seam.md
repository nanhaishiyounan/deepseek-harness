# Agent Note: Knowledge-base capability seam (dsh-kb + dsh-kb-sqlite)

Status: implemented

English | [中文](2026-08-29-kb-capability-seam.zh.md)

## Problem

The food-industry knowledge-base product needs RAG over ingested visit notes, company profiles, and regulations, with numbered citations and offline-capable retrieval. The harness had no knowledge-base capability, and a parallel session left behind build residue (compiled `lib/` without sources) whose `.d.ts` files form a complete, repository-conformant API specification. The full plan and the frozen specification live in [`plans/food-kb-agent-plan.md`](../../../../plans/food-kb-agent-plan.md) and [`plans/kb-frozen-spec.md`](../../../../plans/kb-frozen-spec.md).

## Decision

Build the capability as a standard three-role seam, reconstructed from the frozen residual specification rather than redesigned:

- **`@deepseek-ai/dsh-kb`** (Service Definition) — `ctx.kb` with store/embed provider registries (fiber-scoped disposers, `KB_DUPLICATE_PROVIDER` on collision), execution-time store selection with one dedicated error code per failure mode (`KB_STORE_CONFIGURED_MISSING` / `_UNAVAILABLE` / `KB_STORE_AMBIGUOUS` / `KB_STORE_UNAVAILABLE`), and ingest/search/stats/delete orchestration: chunk → embed → store, text path always runs, vector path adds a second ranking, reciprocal-rank fusion merges them.
- **`@deepseek-ai/dsh-kb-sqlite`** (Store Provider) — one `node:sqlite` database, FTS5 `trigram` full-text index with a quoted-literal MATCH expression (query syntax cannot inject) and a LIKE fallback below three Unicode code points, embeddings as raw `Float32Array` BLOBs scanned in JS with cosine ranking, transactional overwrite-shaped `putDocument`, and a monotonic `SCHEMA_VERSION = 1` plus reserved application id that reject foreign on-disk databases at composition load.

Degradation semantics split by cause: a structurally missing embed provider (never configured, or registered/configured but unavailable) degrades search to text-only with an observable `mode: 'text'` and one log line per transition; a runtime embed failure throws `KbError` `KB_EMBED_FAILED` with the provider failure as `cause`. Degradation is a configuration state, never a swallowed fault.

`tenantId` is the hard isolation key on every retrieval path and count; `(tenantId, sourcePath)` is the document identity for citation and overwrite. No `SessionEventMap` member is added: retrieval reaches the model only through a tool consumer's tool result, which the session log already records.

## Alternatives considered

- **sqlite-vec or another native vector extension** — needs `loadExtension` binaries per platform (macOS/Linux/Windows+wine CI); a JS cosine scan is adequate at MVP corpus sizes (<100k chunks). Deferred as the documented escalation path.
- **A dedicated vector database** — operationally heavier than the single-file SQLite the repository already uses for session persistence; the seam's `KbStore` contract keeps the swap possible later.
- **Silent text-only fallback on runtime embed faults** — rejected: a network failure during embedding is a fault the caller must see, not a mode; conflating it with configuration degradation would hide provider outages behind plausible-but-unvectorized results.

## Consequences

- Embed providers (DashScope, MiniMax) and the model-facing tool suite (`kb_search` / `kb_ingest` / `kb_stats`) are the next packages on the seam; their contracts are already frozen in the residual specification.
- Vector search cost grows linearly with embedded chunk count; a store that cannot accept that owns its indexing.
- The chunker is Markdown-first (heading chains, intact table rows, CJK-aware separators, tail overlap); other formats need an upstream parsing provider.
- Reconstructing from the frozen `.d.ts` kept the residual API surface verbatim; deviations are limited to internal guards (embed vector-count checks) and test-only ergonomics.

## Verification

- `pnpm vitest run packages/kb` — 95 tests across both packages (registries, all six store-selection rules, both embed-degradation paths, RRF fusion, chunker structure, SQLite round-trips, overwrite and delete cascades, schema-version rejection, rollback on mid-transaction failure, closed-store rejection).
- `pnpm vitest run packages/kb --coverage.enabled --coverage.include='packages/kb/*/src/**'` — per-file 100% (CI gate form).
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run build` — green.
