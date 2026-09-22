# @deepseek-ai/dsh-kb-graph

English | [中文](README.zh.md)

The knowledge-graph capability seam (`ctx.kbGraph`): a store provider registry, the runtime ontology registry, and the read/write orchestration over the property graph. A sibling of the document seam (`ctx.kb`) — triples and retrieval hits have different contracts, so each owns its seam; both share the tenant isolation model.

## Registry (ontology v5)

Node types and relations are branded open-set ids (`KgNodeTypeId`/`KgRelationId`). Each class carries the constraint quartet on its props (`required`/`isArray`/`enumValues`/`pattern`), a `naturalKey` merge anchor, and FoodOn anchors (`foodonUri`/`foodonId` plus source-ontology `synonyms` for entity resolution). Sources: `builtin-ontology`, `builtin-food`, `foodon-imported`, `nocobase-derived`, `agent-defined`. Status gates writes vs. model visibility: `draft` accepts writes but stays out of model-facing enumerations; `deprecated` (KGCL NodeObsoletion) keeps instances and history but leaves every creation-facing surface. Plugins extend the registry with `registerNodeType`/`registerRelation`; `persistNodeType`/`persistRelation` write through the two-layer registry (runtime map + store rows). Closed-set validation lives at the registry boundary — unknown ids and direction violations fail loud (`KB_GRAPH_UNKNOWN_ENTITY_TYPE`, `KG_DIRECTION_VIOLATION`, …).

## Pure algorithm layer

- `kgcl.ts` — the closed KGCL op vocabularies: instance ops (`add_edge`/`remove_edge`/`set_node_props`) the `kg_edit` tool plans, schema-level ops (`add_node`/`rename_node`/`set_parent`/`deprecate_node`/`change_cardinality`), and the diff preview rendering both share.
- `shacl.ts` — registry→shapes compilation, candidate validation with per-violation paths, and the explanatory feedback string the extraction repair loop re-feeds.
- `kg-nl.ts` — the L0 template compiler (phrase→walk plan) and the L1 parameter-fill contract.
- `ppr.ts` — Personalized PageRank over flat adjacency (the L1.5 retrieval layer).
- `louvain.ts` — deterministic Louvain community detection over flat adjacency (`assignments` per node plus partition modularity; node order is the tie-breaker).

## Temporal ledger and write faces

`KgStore` providers carry the episode ledger (`putEpisode`/`linkMentions`/`listEpisodes`/`edgeMentions`/`edgeIdsOfEpisode`), record retirement (`expireEdges`/`restoreEdges`), contradiction reads (`liveEdgesBetween`), whole-graph adjacency (`liveAdjacency`, the PPR/louvain input), the time-point replay read (`snapshotAt(tenant, asOf)`), the FoodOn xref channel (`putOntologyXrefs`/`listOntologyXrefs`), and coreference reject tombstones (`putCorefRejects`/`listCorefRejects`); `kgCorefPairKey`/`kgCorefEdgeId` mint the shared pair keys and merge-edge ids.

The runtime adds three orchestration faces over the store:

- `applyOntologyOps(ops)` — the manual editor's write path: the whole op set validates first against the live registry overlaid with its own earlier ops (duplicate ids, parent cycles, illegal cardinality pairs reject before anything lands), then the touched rows persist and one ontology revision audit row records the set.
- `communities(tenant)` — the precomputed louvain partition for canvas coloring.
- `snapshotAt(tenant, asOf)` — the revision-replay read (live is the `asOf = now` special case).

## Model Experience

Indirectly, through the kb tool suite: this seam registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of graph queries and writes, materializing the registry's active entries into its tool descriptions at registration.

#### KV Cache effect

Independent of the model request stream: graph queries produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- Store selection is auto only: exactly one usable provider wins; multiple usable providers throw `KB_GRAPH_STORE_AMBIGUOUS` (configure by composing one).
- Community detection runs per request over `liveAdjacency`; materialized cluster tables arrive with the pipeline batch that needs them across runs.
- `applyOntologyOps` journals the revision and updates the registry; undo rides the caller's episode semantics (a reversing op set), not a dedicated registry-revision rollback.
