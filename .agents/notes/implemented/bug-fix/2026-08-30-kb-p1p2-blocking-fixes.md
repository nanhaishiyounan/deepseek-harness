# Agent Note: kb-agent P1/P2 verification blocking fixes — doc_kind discrimination, two-hop direction, gate closure

Status: implemented

English | [中文](2026-08-30-kb-p1p2-blocking-fixes.zh.md)

## Problem

The unified verification of the P1/P2 kb-agent work scored 76/100 FAIL with four blocking classes. Two were correctness bugs with a shared root cause — a type-level lie the compiler could not challenge — one was a quality-gate debt cluster, and one was an honesty cluster (numbers and files claimed in the report that the tree did not back).

## Decision

### H1: doc_kind narrowing discriminated, not unioned

`parseKbWorkbenchDocKind` returned `KbDocKind | string`, and since `KbDocKind` is itself a string-literal union, the callers' `typeof kind === 'string'` refusal check was always true: every browser workbench ingest and doc-kind-filtered search was refused, valid values included. The fix follows the closed-union convention: the parse now returns `{ ok: true; value: KbDocKind } | { ok: false; value: string }`, callers branch on `result.ok`, and the refusal message lists `KB_DOC_KINDS` while genuinely accepting every member. The same change removed the three `oxlint` type-soundness errors the old signature caused (`no-redundant-type-constituents`, `no-unnecessary-type-assertion`, `no-unnecessary-condition` — lint had been flagging the bug the verifier found).

Acceptance ran red-to-green: `apps/web/tests/kb-workbench.e2e.ts` failed on the ingest refusal before the fix and passed after (the web lane loads the gateway from built `lib/`, so `build:lib:host` runs between fix and re-test).

### H2: two-hop paths constrained by direction, not endpoint sharing

The old `twoHopPaths` SQL accepted any edge pair whose endpoint sets intersect anywhere — a 4-way OR. That admits spur edges sharing the start, fan-in edges sharing the target, and a target self-loop as the "second hop" (false positives), while a lone direct edge matches nothing because `e2.id <> e1.id` excludes pairing it with itself (a false negative against the `at most two edges` contract). The rewrite pins one direction combination per branch — `e1` touches the start, `e2` touches the target, and the middle endpoint is fixed by a single equality per branch and required to be neither endpoint — then folds direct edges (either direction) into the result, which the contract's "at most two edges" always allowed. Four regression tests lock the classes: a clean bridge in both edge directions, a spur beside a direct edge, fan-in without a shared bridge, and a target self-loop; plus the direct-edge-only return.

### H3: gates closed by rerunning them, not by claiming them

- The four lint errors fell out of H1 plus the `jscpd:ignore-end` indentation in `kb-graph-sqlite/src/store.ts` and two stale `oxlint-disable` directives in `ui-kb/src/client/index.ts`.
- `gen-tool-catalog.spec.ts` expected 64 tools; the kb graph/url additions make 67 (`kb_graph_add`, `kb_graph_query`, `kb_ingest_url`).
- `docs/config-catalog.md` was stale (the kb packages' Config blocks had never been generated); `gen-config-catalog` rewrote both language sides and the pairing record was re-recorded with `verify-translation-pairing --write`.
- Coverage gaps closed to per-file 100% on the focused set: `kb-graph-sqlite` (store branches — rollback, closed-store refusals, dedup/cap, tenant-less stats; schema gates — unversioned-with-identity, foreign application id, reopen; the invariant companion; the plugin apply fallback branch, following the kb-sqlite precedent of calling `apply` directly), `tool-kb/graph.ts` (argument-validation refusals, output formatting, presentation wrappers, the seam-absent refusals), and `ui-kb` (the entry mount, panel branches, host half). Two dead defensive branches were simplified away rather than ignored: the id-refetch existence check (ids come from the same synchronous connection) and the entity-map duplicate check (the SQL `UNION` already deduplicates).

### H7: honesty corrections

The plan's citation-validity number now reads the measured 96% (`eval/results-hybrid-answers.json`: `citationValidRate = 96`, `top5HitRate = 99`), both role-preset directories carry a README describing their actual files, and the workbench e2e header states plainly that there is no fixture file — the kb stack mounts in-process through `ctx.plugin` and writes are opted in through the scenario overlay.

## Alternatives considered

- **H1 via `KbDocKind | undefined`** (undefined = invalid): rejected because the search path already uses undefined for "filter not provided", so the two meanings would collide in one variable; the discriminated result keeps every call site total.
- **H2 as a graph traversal in JS** (load neighbors, walk): rejected — the store contract is SQL-side filtering per tenant, and the direction constraints express exactly as four SQL branches with one middle-endpoint equality each.
- **Dead defensive branches via `v8 ignore`**: rejected where the invariant is provable (same-connection ids, UNION deduplication) — simplifying removes the branch instead of documenting an unreachable path.

## Consequences

- `packages/host/apiproxy/src/api-proxy.ts`, `src/api/rpc.ts`, `src/api/rpc.schema.ts` — discriminated doc_kind parse, new `kb-tenant-unbound`/`kb-write-disabled` error codes (the latter with H5).
- `packages/kb/kb-graph-sqlite/src/store.ts` — direction-constrained two-hop SQL with direct-edge folding; two dead defenses simplified.
- `packages/kb/kb-graph-sqlite/tests/store.spec.ts`, `tests/invariant.spec.ts`; `packages/kb/tool-kb/tests/graph.spec.ts`, `tests/presentation.spec.ts`; `packages/core/tools/tests/gen-tool-catalog.spec.ts`; `apps/web/tests/kb-workbench.e2e.ts`.
- `docs/config-catalog.{md,zh.md}` regenerated; `plans/food-kb-agent-plan.md` corrected.
