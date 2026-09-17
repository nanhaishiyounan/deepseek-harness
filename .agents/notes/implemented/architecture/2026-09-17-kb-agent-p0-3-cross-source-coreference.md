# Agent Note: kb-agent P0-3 cross-source coreference — the `corefers_with` bridge between document entities and business rows

Status: implemented

English | [中文](2026-09-17-kb-agent-p0-3-cross-source-coreference.zh.md)

## Problem

The knowledge graph held two disconnected families. Corpus-extracted entities (`kb:` ids, 708 nodes) land on built-in ontology types (Region/Warehouse/Process/company…); NocoBase rows (`nocobase:` ids, 207+ nodes) land on collection-name types. `alignEntity` restricts candidates to the same type, so the two type sets never intersect and no merge ever fires — and kg-build had no pass that builds edges across its four legs. The result was structural: a graph walk from「莫斯科主仓」could never reach `nocobase:experts:1`（张红喜，the expert whose 中亚货运动线方案/海外仓风险应对咨询/食品出海合规咨询 services are exactly the answer to a warehouse-emergency question）even though `customs_export:1` is literally named「中亚」like the document Region.

## Decision

A fifth pipeline leg wires coreference edges without merging anything. The builtin ontology registers `corefers_with`（共指, `builtin-ontology`, endpoints unrestricted because the pair spans ontology layers — a doc Region is a Concept, a NocoBase row is an Object; version bumped 1.0.0 → 1.1.0）. `KgStore.listNodes(tenant, k)` is the new bulk-enumeration primitive (store + runtime forwarding); the kg-build `crossSourceAlign` leg pulls the tenant's nodes, splits them by the id prefixes its own mappers minted (`kb:` documents vs `nocobase:` rows), and applies deterministic rules from `src/cross-source.ts`: normalized-name equality wires an edge at confidence 1, row-name-contains-doc-name wires one at 0.75, names shorter than two normalized characters and the person-name `Expert` type are excluded, containment is one-directional (row names carry doc topics as substrings, not the reverse). Each edge asserts `sourceSystem: 'kg-align'` with the doc node id as `sourceId`, so the seven-column anchor keeps reruns idempotent; a rerun tombstones each surviving doc entity's prior assertions before rebuilding, which drops edges whose row partner was renamed. `crossSourceAlign: { enabled, exactOnly }` are validated config fields（`exactOnly` drops containment matches for noise-sensitive deployments）; the enumeration cap fails loud rather than aligning a partial graph.

## Alternatives considered

- **Relaxing `alignEntity` to cross-type merging.** Merges rewrite id ownership and are only reversible by alias surgery; a wrong cross-family merge is costlier than a wrong edge, and the gray-zone LLM adjudication path exists precisely for same-type merges.
- **LLM-judged cross-source pairs.** The salient matches are exact-normalized or containment relations over short topical names; deterministic rules need no key, no prompt drift, and are unit-testable.
- **A blanket tombstone of all `kg-align` edges per run (one fixed scope).** Per-doc-entity scoping keeps the provenance address meaningful (`sourceId` = the doc entity) and exercises the same seven-column anchor the other legs use.

## Consequences

- The two families are one graph for walking purposes: document entities reach expert services and experts through one coreference edge plus existing fk edges, without either side losing its identity or provenance.
- 134 live cross-family edges on the rebuilt tenant graph (was 0); a recursive-CTE check in `examples/kb-agent/scripts/kg-build.mts` asserts「莫斯科主仓 ↔ nocobase:experts:1」reachability with no hop limit, plus the doc「中亚」corefers onto 中亚货运动线方案.
- `kg_query`「张红喜的供货链」（hops 2）now returns export-risk community nodes（食品出海 etc.）— the cross-community answer the original session could not produce.
- Containment edges are topical by construction（「中亚」connects 中亚-related services/datasets）; deployments wanting only exact matches set `exactOnly: true`.

## Verification

- Failing tests first, all green after: `packages/kb/kg-build/tests/cross-source.spec.ts`（rule matrix: exact/containment confidences, normalization, `exactOnly`, short-name and Expert exclusion, wrong-side id filtering; pipeline integration — the doc Region reaches `nocobase:experts:1` in 2 hops through a `corefers_with` edge, count-stable reruns, `enabled`/`exactOnly` switches）、`packages/kb/kb-graph/tests/ontology.spec.ts`（`corefers_with` registered unrestricted, version 1.1.0）、`packages/kb/kb-graph-sqlite/tests/store-v2.spec.ts`（`listNodes` tenancy and cap）.
- Real rebuild against the live NocoBase + MiniMax: cross-source align reports `docCandidates=708 nocobaseNodes=222 edgesCreated=134`; the acceptance script's recursive CTE proves the 莫斯科主仓 ↔ experts:1 path;「张红喜的供货链」walk returns export-risk nodes; idempotent second run changes no counts (1110 nodes / 814 edges stable).
- Replay matrix (headless replays; `nb_list`/`kg_subgraph` count real `tool/call` events;「张红喜」means the name appears in the final answer):

  | Prompt | nb_list | kg_subgraph | 张红喜 in answer |
  |---|---|---|---|
  | 「俄罗斯仓库被炸了，有没有别的路径」— iteration1, sessions `445a4c1b` / `38c89ae1` | 0 / 0 | 0 / 0 | no / no |
  | 「…有没有别的路径？另外有没有能出海外仓风险应对方案的专家？」— iteration1, expert-asking variant | ≥1 | — | yes |
  | 「俄罗斯仓库被炸了，有没有别的路径」— iteration2, persona hard rule, sessions `7055db1c` / `847d60ad` | 3 / 2 | 1 / 1 | yes / yes |

  Iteration1's closure came from the expert-asking variant, not the original one-question prompt: both original-prompt replays ended with reroute facts, zero `nb_list`, zero `kg_subgraph`, and no named expert. The original prompt closes in iteration2 after the kb-agent persona's emergency-class hard rule — both replays name 张红喜 with `expert_services/2`（¥6,800, PDF deliverable）, zero `FS_NOT_FOUND`, zero `INVALID_ARGS`.
- `pnpm run typecheck` green; kg-build, kb-graph, kb-graph-sqlite, tool-kb suites green (170 + 219 tests over the touched packages).
