# Agent Note: kb-agent iteration2 — corpus-ghost tombstone protocol, align-scope filter, and the emergency expert chain

Status: implemented

English | [中文](2026-09-17-kb-agent-iter2-ghost-corpus-tombstone-and-emergency-chain.zh.md)

## Problem

Iteration1 verification failed three blockers. The kg-build corpus leg had no disappeared→tombstone protocol (the nocobase leg had one), so `kb:connector-files/sample-export-compliance.md` from a whole-root-scan era survived as ghost state: `kg_source_runs` counted kb=47 against the KB's 46 documents, 17 ghost nodes held 35 live edges, and the cross-source align pass re-paired the ghosts every run because it took doc candidates by bare `kb:` prefix. Separately, the original one-question prompt「俄罗斯仓库被炸了，有没有别的路径」never reached the expert chain: both iteration1 replays (sessions `445a4c1b` / `38c89ae1`) closed with zero `nb_list` and zero `kg_subgraph` calls — the persona's soft guidance lost to route-answer momentum.

## Decision

- The corpus leg gains the manifest-diff sweep, mirroring the nocobase leg's `plan.disappeared` protocol: after each run, kb source runs whose scope is not under a manifest directory lose their live edges (`tombstoneBySource('kb', scope)`) and their watermark row. Two `KgStore` primitives back it — `listSourceRuns(system)` and `deleteSourceRun(system, scope)` (seam types, sqlite store + sql resources, runtime forwarding).
- The align pass filters doc candidates by manifest scope (`kbScopeOfNodeId` reads the scope back out of `kb:<scope>#<name>`); the stale-edge tombstone loop still covers every `kb:` node, so a ghost's coreferences die and never re-assert. `CorpusReport.tombstonedScopes` records the sweep.
- The kb-agent persona carries an emergency-class hard rule scoped to force-majeure questions (warehouse destroyed, war, closed crossings, strikes): map the disruption with `kg_subgraph`, then `nb_list` expert_services, resolve expertId→experts, and name the expert in the answer — an answer ending with only KG/rate/document facts is incomplete.
- Pre-release convergence by delete-and-rebuild of the tenant graph, which also restores the `corefers_with` registry row's `builtin-ontology` source after iteration1's `agent-defined` drift.

## Alternatives considered

- **Deleting ghost nodes outright.** The graph has no node deletion anywhere; the nocobase protocol keeps disappeared rows' nodes and kills their edges. Mirroring it keeps one lifecycle model.
- **The optional kb_search-tail hardening hint.** Both persona-only replays closed the chain, so the hint stays off — adding it anyway would be over-engineering.
- **Sweeping by node-id prefix instead of source runs.** A ghost scope can hold edges with all entities merged onto canonical rows (no `kb:` nodes left); only the watermark rows enumerate scopes truthfully.

## Consequences

- Ghost corpus is self-healing without a rebuild: a scope retired from the manifest loses its edges and watermark on the next run (`tombstonedScopes=1` then 0, count-stable reruns).
- The rebuilt graph converges: `kg_source_runs(kb)`=46=KB documents, zero live edges or nodes under `kb:connector-files/*`, 莫斯科主仓↔`nocobase:experts:1` connected (recursive CTE), 张红喜's 2-hop supply chain still returns export-risk nodes, idempotent second run stable (1157 nodes / 853 edges).
- The original emergency prompt closes end-to-end without variant help; iteration1's variant-only closure is now recorded as such in the P0-3 and P1 replay matrices.

## Verification

- Failing tests first, then green: `packages/kb/kg-build/tests/pipeline.spec.ts`「tombstones manifest-external kb scopes, deletes their watermarks, and stays idempotent」、`packages/kb/kg-build/tests/cross-source.spec.ts`「excludes manifest-external kb nodes from alignment and drops their stale coreferences」、`packages/kb/kb-graph-sqlite/tests/store-v2.spec.ts`「lists source runs per system and deletes retired scopes」、`packages/kb/kb-graph/tests/runtime-v2.spec.ts`「forwards source-run listing and deletion to the v2 store」; the kg-build / kb-graph / kb-graph-sqlite / tool-kb suites pass (321 tests).
- Real rebuild (`examples/kb-agent/scripts/kg-build.mts` against live NocoBase + MiniMax): ALL CHECKS PASSED; SQL asserts 46=46, zero connector-files live edges and nodes, recursive-CTE CONNECTED, `corefers_with|builtin-ontology`, and idempotent second-run counts.
- Two independent replays of the locked prompt「俄罗斯仓库被炸了，有没有别的路径」(sessions `7055db1c` / `847d60ad`): zero `FS_NOT_FOUND`, `nb_list` 3/2 with zero `INVALID_ARGS`, `kg_subgraph` 1/1, 张红喜 named in both final answers with `expert_services/2`（¥6,800, PDF deliverable）.
- `pnpm run typecheck` green; `pnpm run lint` green.

## Iteration-3 closeout additions

- `normalizeCorpusDir` (corpus-manifest.ts) canonicalizes every manifest `dir` at parse time — leading `./` and trailing `/` stripped, case untouched so a wrong directory name stays visible — and duplicate detection keys on the canonical form; the align-scope prefix lookup consumes the same exported function. A raw-string prefix match against a `./kb/`-spelled entry can never hit a `kb/...` node scope, which silently zeroed the cross-source doc candidates.
- `parseCorpusManifest` also rejects dirs that would escape the corpus root: a `..` segment or a leading `/` fails with `KG_BUILD_CORPUS_MANIFEST_INVALID` naming the offending value, so a trusted manifest cannot carry `dir: ../secrets` past the parse into the KB seed and KG scan scope prefixes.
- `tombstoneBySource` runs inside the store's `write()` transaction, symmetric with `deleteSourceRun`. A forced mid-statement failure (`AFTER UPDATE … RAISE(FAIL)`) leaves the first swept edge tombstoned when the statement runs bare; the write-parity pair in store-v2.spec pins both methods fail-closed with no partial state.
- Mechanical closeout (no separate note): the api-catalog CorpusReport projection refreshed to carry `tombstonedScopes`, two misplaced JSDoc blocks relocated in store.ts, and seed-kb.mts reads paths through `fileURLToPath` behind an `existsSync` guard.
