# Agent Note: M2-P2 KG workbench — ontology editing, change feed, semantic coloring, replay

Status: implemented

English | [中文](2026-09-18-m2-p2-kg-workbench.zh.md)

## Problem

M2a delivered the workbench's backend spine (registry v5, episode ledger, kg_edit, cross-source v2) but the product's four capabilities still had no human surface: manual ontology editing existed only as a "planned for a later surface" comment on `KgOntologyChangeOp`; the episode ledger and the gray-zone review queue (0.5–0.9 pairs) were invisible; the canvas colored nodes by per-type hash (ontology structure invisible); and there was no way to see what the graph looked like before a given change. The P2 plan section also prescribed `@xyflow/react` for the tree and `graphology-communities-louvain` for clustering, both pending a dependency-policy review.

## Decision

**No new dependencies.** The OntoTree renders the subClassOf hierarchy as a two-level `<ul>` recursion the legend already owns — a tree library would buy drag-and-drop the workbench spec never asked for. Louvain lives as a pure function ([louvain.ts](../../../../packages/kb/kb-graph/src/louvain.ts)) beside the existing ppr.ts: `graphology-communities-louvain` is a browser-canvas dependency graph, and pulling it into the server package couples host builds to the canvas stack for ~150 lines of algorithm. The seam computes the partition (`communities(tenant)`), the browser consumes precomputed assignments — the main thread never runs detection.

**Ontology CRUD as one validated write path.** `applyOntologyOps` validates the whole op set first against the live registry overlaid with the set's own earlier ops (a later op may target a class an earlier op added), then commits: duplicates, parent cycles, illegal cardinality pairs, and deprecated parents reject before anything lands. New classes land `draft`/`agent-defined` through the effectful registration path; renames/re-parents/deprecations replace runtime map entries and persist through the two-layer registry. `deprecate_node` introduces the `deprecated` status (KGCL NodeObsoletion): instances and history survive, creation-facing enumerations drop the class. The wire rides one new RPC (`kg.ontologyEdit`) which also books the human-edit episode; the revision audit row is the seam's, the episode is the RPC's.

**Change feed, review queue, replay as reads over authoritative streams.** `kg.episodes` feeds the timeline (instruction verbatim, source badge, mention counts, rollback per episode via the M2a `kg.rollback` chain). The review queue derives from the newest align episode's review metadata minus decided pairs — a live merge edge, a reject tombstone, or a recorded decision episode — no new table. Verdicts (`kg.reviewDecide`) land as human-edit episodes; merges write the `corefers_with` edge on the shared `kg-align:<doc>:<row>` anchor so re-deciding stays idempotent. Revision replay rides `kg.history` → `snapshotAt(tenant, asOf)`: nodes created at or before the instant plus edges recorded at or before it that were neither tombstoned nor record-retired before it (live is the `asOf = now` special case).

**Semantic coloring from the registry, not the hash.** `semanticRootOf` walks the extends chain to the root class and the whole family shares the root's ladder hue; editing the class tree re-derives colors on the legend reload in the same paint (a last-ready legend ref keeps the tree mounted during the refresh instead of blinking away). A three-way color switch (type hash / ontology semantic / louvain community) rides one canvas prop (`nodeColor`) — the sigma canvas itself is untouched beyond that injection.

**One stub convention for louvain.** Every adjacency slot stores directed stubs: a non-self pair writes one stub each way, a self-loop writes both stubs into its single slot. With `2m`, degrees, Σin, and the quotient's self-loops all counting the same stubs, modularity stays invariant across aggregation levels (an earlier mixed convention inflated it — the two-cliques fixture reported 0.51 where the true optimum is 0.426).

## Consequences

- Reusing a response schema by extension inherits its required fields: `kg.history` initially extended the subgraph value schema and failed client validation on the missing `seeds_resolved` — replay built from the shared projections instead.
- Playwright `hasText` matching is case-insensitive substring; the ontology-row anchor must be the `<code>id</code>` chip with an exact regex (Product rows match 'product'), and legend-row assertions need exact-label regexes because FoodOn labels embed each other. A test fixture whose per-type hash happens to equal the semantic hue (`FrozenSoy` → 9) silently passes the semantic assertion and fails only the type-mode one — assert both directions with collision-free ids.
- Snapshot timing in tests must advance the wall clock strictly past captures (same-millisecond `expired_at > asOf` ties drop edges).
- Coverage: louvain/ontology-edit/snapshot unit suites, ui-kg workbench component suite, and the keyless browser e2e (kg-workbench-p2: gateway partition + queue reads, KGCL edit with revision/episode receipts, semantic-vs-type legend coloring over a freshly added subclass, rollback retiring the live edge, merge verdict draining the queue, replay banner + empty-instant history) — 6/6 green alongside the pre-existing kg-graph-page e2e.
- M2a leftovers fixed in passing: four packages' test stubs missed the new kg API members (episodes/rollback included), kg-build test configs missed `foodon`/quarantine fields, and the M2a agent note predated the note-format grammar (restructured into the Problem/Decision form with fixed relative-link depth and a bilingual pair).

## Alternatives considered

- `@xyflow/react` for the ontology tree — rejected (bundle + license review for interactions the spec never required; the recursion renders the same hierarchy).
- `graphology-communities-louvain` — rejected per the stub-convention decision above; revisitable if detection needs weighted/multigraph features the hand-rolled pass lacks.
- A materialized `kg_cluster` table (the plan's P2-4) — deferred: per-request detection over `liveAdjacency` answers 1159 nodes in milliseconds and stays fresh after every edit; materialization pays off only when cross-run consumers arrive.
- Deriving the review queue from a dedicated pending-pairs table — rejected: the episode ledger plus tombstones already answer "what is undecided" from authoritative streams.
