# Agent Note: Coverage close-out batch for the M1/M2/M3 touch surface

Status: implemented

English | [中文](2026-09-19-coverage-closeout-m1-m2-m3.zh.md)

## Problem

The M1 (UI/UX redesign), M2 (ontology + KG + AI rebuild), and M3 (mobile client) batches landed without their unit-coverage close-out: the per-file 100% CI gate would reject the touched packages. The baseline measured with the repo's own partitioned-coverage harness (statements per file): tool-kb 65.71% (kg-edit 0.43), ui-mobile client ~0%, kg-build 91.23%, kb-graph 93.53%, kb-graph-sqlite store 96.41%, plus tail gaps in ui-kg, ui-kb, ui-business, and apiproxy fetch.

## Decision

- **tool-kb → 100/100/100/100**: new `tests/kg-edit.spec.ts` (planning-parse rejection matrix, propose→apply→rollback→episodes round trips over the real SQLite store with a fake LLM, SHACL precheck retries, contradiction retirement, presentation) and `tests/kg-query-fill.spec.ts` (the L1 fill-parameter layer over a fake LLM, PPR two-hop walk, unresolved-seed note, presentation wrappers, the shared `completeViaLlm` helper). Three unreachable arms carry `v8 ignore` with reasons (JSON.parse never throws non-Error; an applied op relation is always registered; a retried constraint pair is legal by construction).
- **ui-mobile → 100/100/100/100**: new `tests/services.client.spec.ts` (rpc wire failure modes, sessions-service wrappers and projections, useAsync/usePoll state machines including late answers after unmount), `tests/views.client.spec.tsx` (login gate with countdown, app shell routing, the four tabs, chat view with task cards and push receipts, KG evidence cards, data tab walks, entry mount), and `tests/fold-branches.client.spec.ts` (fold wire-shape guards, form-draft rejection shapes).
- **Product bug found and fixed by that batch**: `WorkbenchView` passed an inline fetcher to `useAsync`, whose identity-change refetch contract turned every render into a refetch — an unbounded fetch loop under jsdom (maximum update depth) and on-device battery drain. The fetcher is now a module-level constant.
- **kg-build 91.23 → 96.95**: new `tests/close-out.spec.ts` (mappings/corpus-manifest/OLS rejection branches, cross-source v2 judge layers, latestRun/runIncremental, the FoodOn leg inside run(), the disabled-align report, instruct-kgc protocol over the full composition).
- **kb-graph 93.53 → 96.77**: new `tests/gaps-close.spec.ts` (validateOntology referential throws, louvain/PPR boundary graphs, SHACL optional prop shapes and unregistered relations, KGCL previews, the runtime ontology-edit rejection matrix, xref/reject round-trips, PPR neighborhoods). Defense-only arms in kg-nl/ppr/louvain carry `v8 ignore` (mandatory regex groups; pre-sized adjacency arrays).
- kg-build's align report field arm: `v8 ignore` (runCrossSourceAlign answers on both paths).

## Alternatives considered

Registering the touched packages in vitest.config.ts's coverage exclude instead of writing tests was rejected: the gaps were real behavior surfaces of this iteration, not browser-grade-harness debt. Shipping on the single-package criterion alone was rejected because CI judges the merged partitioned inventory; the per-file close-out had to target that bar.
## Consequences

After this batch the partitioned per-file gate (4 partitions, timeout 180s) still reported ~200 threshold errors across ~25 packages. This batch closed **tool-kb and ui-mobile to the gate bar** (no threshold errors for either). kg-build (91→~97% statements; index/extract/mappings/validate/cross-source/corpus-manifest tails), kb-graph (93.5→~98%; index/kg-nl/shacl tails), and kb-graph-sqlite (store/schema tails) converged but retained double-digit error counts — the follow-up batch (2026-09-19-coverage-closeout-final.md) closed those. The never-touched surfaces kept their full gaps until that follow-up: ui-kg `client/index.ts` (34%), ui-view-context, ui-kb hero band, ui-business, ui-assets, ui-agent-preset, ui-mobile-preview, connector/tool-nocobase, tool-connector, connector-nocobase, expert-orders, apiproxy `fetch/*`, and more. The M1-era kb-agent kg-tools snapshot was refreshed for ontology 1.2.0 (packaging class). Three load-sensitive tests (hmr-config, tools-catalog round-trip, gen-client-catalog slots) flaked under 4-way partition contention but passed serially; apiproxy's SQLite-variable-limit search case gained an explicit 30s timeout.

## Verification

Per-package `CI=1 vitest run --coverage --coverage.thresholds=false` with the uncovered-locations reporter; each batch re-ran green before moving on. Final gate evidence: `pnpm run test:gui` 4552 passed (up from 4483 — the batch added ~136 cases), `pnpm run typecheck` green, oxlint 0 errors across the touched packages (tool-kb, ui-mobile, kg-build, kb-graph, kb-graph-sqlite, ui-kg, ui-kb, ui-business, apiproxy).
