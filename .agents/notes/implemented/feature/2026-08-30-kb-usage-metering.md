# Agent Note: Per-tenant usage metering in the kb seam

Status: implemented

English | [中文](2026-08-30-kb-usage-metering.zh.md)

## Problem

The subscription tier of the food-industry knowledge-base product prices usage (credits per search/analysis/report), so P1 needs per-tenant usage counters as infrastructure — observable counters only, no billing, quotas, or UI ([`plans/food-kb-agent-plan.md`](../../../../plans/food-kb-agent-plan.md), P1-5). P0 had no usage recording at all.

## Decision

Counters live in the kb store, owned through the capability seam's three roles:

- **`KbStore` grows `recordUsage(tenantId, delta)` and `usage(tenantId)`** — the store owns persistence, so every store implementation (and every test double) carries the counters. `KbUsage` counts `searches`, `ingestedDocuments`, `ingestedChunks`, `embedTexts`, `embedTokens`.
- **kb-sqlite persists them in a `usage_counters` table** (one row per tenant) and bumps `SCHEMA_VERSION` from 1 to 2 — pre-release stance: an old on-disk database is rejected, no migration shim. Increments are one `INSERT … ON CONFLICT(tenant_id) DO UPDATE SET x = x + excluded.x` statement inside `BEGIN IMMEDIATE`, so concurrent writers serialize on the write lock and no increment is lost.
- **The seam counts on success paths only**: ingest records one document, its chunk count, and the embedded text count (zero in degraded mode); search records one search plus the query embed text in hybrid mode. A failed operation records nothing. `ctx.kb.usage(tenantId)` reads a tenant's counters; a tenant with no row reads as all zeros.
- **A failed counter write never fails the data operation**: the seam's `meter()` logs one warning and returns. Metering is observability; the completed ingest or search already succeeded, and re-running it to fix a counter would double-count the data plane. The catch swallows only the store's `recordUsage` rejection.
- **`kb_stats` reports the counters** as a `usage` object in its canonical value and a cumulative-usage sentence in its model-facing text — one read surface, no separate meter tool.

`embedTokens` stays a reserved zero-valued counter: the MiniMax native wire returns vectors only (no usage block is decoded), so text counts are the metered unit until a provider reports token usage — the plan's "count per text when the provider reports none".

## Alternatives considered

- **A separate metering package with its own storage** — rejected: counters share the knowledge base's lifecycle (same database, same backup, same per-tenant dimension); a second persistence surface would add deployment weight without a second consumer.
- **Counting inside `putDocument`'s transaction** — rejected: it would bloat the storage method with metering semantics and still leave search counting as a separate path; the seam is the single point that knows an operation completed.
- **Failing the data operation when metering fails** — rejected: a lost counter is recoverable observability, a lost ingest is not; the warning log keeps the loss visible.

## Consequences

- Every `KbStore` implementation must implement the two methods; the runtime test double records calls for exactness assertions.
- Re-ingest replacements count again (each completed ingest is one usage event); quota consumers decide their own de-duplication policy later.
- Databases written by P0 builds (schema version 1) are refused at open — the documented pre-release compatibility stance.

## Verification

- `packages/kb/kb-sqlite/tests/usage.spec.ts` — upsert accumulation, zeroed reads for unknown tenants, per-tenant row isolation, 2×25 concurrent increments across two connections with no loss, schema-version downgrade rejection, and the table's presence in a fresh schema.
- `packages/kb/kb/tests/runtime.spec.ts` (`usage metering`) — exact deltas for hybrid/degraded ingest, hybrid/text search, no counting on failed search, ingest survives a metering-write failure, and the seam `usage()` read.
- Real-key smoke (`examples/kb-agent/scripts/real-key-smoke.mts`): after 2 ingests + 1 URL ingest + 2 searches, `kb_stats` reports `2 searches, 3 documents ingested (4 chunks), 6 embed texts` — 4 ingest embeds plus 2 query embeds, exactly.
