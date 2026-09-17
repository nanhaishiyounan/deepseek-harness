# Agent Note: kb-agent P1 retrieval reach — kg_subgraph hops up to 3, v2 node search through aliases, expertId→person guidance

Status: implemented

English | [中文](2026-09-17-kb-agent-p1-retrieval-reach.zh.md)

## Problem

Three small surfaces capped how far one retrieval could reach. `kg_subgraph` clamped `hops` to 2 while the new `corefers_with` bridge (P0-3) needs the third hop for warehouse-side seeds to cross onto expert rows. The v2 `searchNodes` ignored `kg_aliases`, so a name bound only as an alias (the logical-merge output of alignment) never resolved as a subgraph seed — the v1 `searchEntities` already had that second pass. And `expert_services` rows carry `expertId` foreign keys whose person names live in `experts`; without a stated path, a model reading service rows stopped at the ids and answers lost the human name (the original session's broken-name failure mode).

## Decision

- `kg_subgraph`'s hop clamp moves 2 → 3, with the tool description and the `hops` parameter description stating the 0–3 range and that the third hop crosses the coreference bridge; the `maxNodes` 200 budget stays the backstop against subgraph blowup.
- The SQLite store's v2 `searchNodes` runs the same alias second round the v1 face has: after the name pass, `select-aliases-for-search` (now also selecting the binding node's id/name/type) resolves queries matching a bound alias, deduplicated against the name pass and capped at `k`.
- `tool-nocobase`'s `nb_list` system-prompt section and `nb_get` description state the id-resolution path（scalar foreign-key ids resolve with one more `nb_list` on the target collection, filter op `in`）; the kb-agent persona names the concrete instance（`expert_services.expertId` → `nb_list experts filter id in [...]` surfaces 张红喜）.

## Alternatives considered

- **Leaving hops at 2 and teaching the model to chain two subgraph calls.** Two calls double the walk cost and split the bridge traversal across turns; the budgeted third hop is one deterministic change.
- **Merging aliases into node names at write time.** Aliases are reversible logical merges by design (delete the row to undo); baking them into names loses that and duplicates display data.
- **A dedicated join tool for expert services.** The restricted-filter vocabulary already expresses the lookup (`in` over ids); what was missing was the guidance, not a new tool.

## Consequences

- A 3-hop walk from「莫斯科」covers the coreference bridge in one `kg_subgraph` call.
- Alias-bound names resolve as seeds in the v2 face, matching the v1 behavior and the graph page's search.
- The expert-asking variant of the replayed warehouse-emergency conversation surfaces 张红喜 through `nb_list experts filter id in [1,15]` with no `INVALID_ARGS` retries; the original one-question prompt closed the same chain only after iteration2's persona hard rule (replay matrix below).

## Verification

- `packages/kb/tool-kb/tests/kg.spec.ts`「clamps hops to 3 and nodes to the budget, applying the relation filter」asserts the raised clamp; `packages/kb/kb-graph-sqlite/tests/store-v2.spec.ts`「resolves v2 node search through aliases with name-pass deduplication」covers alias hits, dedup, and the type filter.
- Keyless snapshot refreshed through the real Loader composition: `examples/kb-agent/tests/kg-tools.spec.ts`（ontology 1.1.0, `corefers_with` in the schema listing, cross-source report section）.
- Replay matrix for「俄罗斯仓库被炸了，有没有别的路径」(real `tool/call` counts;「张红喜」= in the final answer):

  | Replays of the original one-question prompt | nb_list | kg_subgraph | 张红喜 in answer |
  |---|---|---|---|
  | iteration1 — sessions `445a4c1b` / `38c89ae1` | 0 / 0 | 0 / 0 | no / no |
  | iteration2 (persona hard rule) — sessions `7055db1c` / `847d60ad` | 3 / 2 | 1 / 1 | yes / yes |

  Iteration1 runs produced zero `FS_NOT_FOUND` and export-risk citations but never named an expert; its 张红喜 closure came from the expert-asking variant only. Iteration2 replays close the original prompt with zero `FS_NOT_FOUND` and zero `INVALID_ARGS`; the full three-row matrix lives in the P0-3 note.
- `pnpm run typecheck` green; tool-kb + kb-graph-sqlite suites green (219 tests over the touched packages).
