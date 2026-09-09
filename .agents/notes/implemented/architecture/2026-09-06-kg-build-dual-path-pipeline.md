# Agent Note: kg-build dual-path pipeline and the agent graph tool face (V4)

Status: implemented

English | [中文](2026-09-06-kg-build-dual-path-pipeline.zh.md)

## Problem

Batch V4 (plans/nocobase-native-integration/03-batches.md): connect the V3 property-graph store to the three data sources (NocoBase collections, lakehouse catalog, connector discovery, plus the KB corpus) and feed the graph to the agent — deterministic mapping as the primary path, closed-set LLM extraction as the auxiliary path, with incremental updates that stay idempotent.

## Decision

1. **The structured path carries zero LLM; LLM work lives only in the pipeline plugin.** R01–R13 deterministic mapping (`kg-build/src/mappers.ts`, rule ids mirror the research §1.3 checklist verbatim) maps NocoBase collections, the lakehouse catalog, and connector discovery straight into the property graph. Cost stance: NocoBase direct mapping costs zero tokens; MiniMax only handles the corpus's supplementary semantics (the research's "structured-first, LLM-auxiliary" position). The kb-graph seam stays a pure storage/query face.
2. **Cross-collection references on the seeded track ride explicit FkLink config, never column-name inference.** The seeded schema stores references as scalar columns (`expert_services.expertId` as a bare integer; `orders.serviceId` as an address string like `expert_services/1`) with no declared belongsTo, so R06 sees no relation fields. Ruling: deployments declare `fkLinks` explicitly (`plain-id` and `collection-address` value shapes) — fail-loud, zero guessing; this extends R06 for address-style foreign keys rather than replacing it (the declared-relation path is implemented and tested alongside).
3. **An `updatedAt` watermark is unusable on the seeded track (probed live); the reconcile channel carries updates and deletes.** Probe facts: the seeded collections were created with `timestamps` off — registering a date field afterwards (fields:create works) still never backfills values (rows stay NULL after create/update), and `sort=-updatedAt`/`filter.updatedAt` are rejected by the resourcer ("Invalid SQL column or table reference"). The landed semantics equal PLAN C-4's documented fallback: **every run takes a full paged fetch and compares SHA-256 snapshot fingerprints** (unchanged → zero-write skip; changed → idempotent full MERGE, updates flow naturally) plus an **id watermark** recording the new-row high-water mark, and disappeared primary keys tombstone (`run_config.knownIds` bookkeeping, sized to this track). `tombstoneBySource` kills edges, never nodes (bitemporal).
4. **Closed-set two-level validation plus the degradation bucket: hallucinations never enter the graph.** JSON parse → structural shape → registry closed-set/direction; parse or shape failures retry once with feedback; closed-set violations do not retry — unknown entity types degrade into the `Concept` bucket (the summary records the claimed type), unknown or direction-violating predicates drop with counted reasons (`droppedRelations`). Live evidence: 20 corpus documents, 344 entities, 11 degradations, 32 dropped predicates, 7 alignment merges — the defense holds on real MiniMax output.
5. **Entity alignment stays within one type; NocoBase rows are the authority.** Normalization (NFKC/company suffixes/parentheticals) → `searchNodes` exact hit → Jaro-Winkler ≥ 0.9 auto-merge (binding kg_aliases — logical, reversible) → the 0.8–0.9 gray zone goes to LLM adjudication (without an LLM the name stays unmerged). Cross-type merging (Expert↔experts hierarchy compatibility) is recorded as a known limitation.
6. **The two-layer registry closes in V4.** Runtime `persistNodeType`/`persistRelation` (ancestor chains persist first — FK ordering drives it) + persistent `kg_node_types`/`kg_relations` rows + a kb-graph-sqlite boot-time fixpoint re-registration (parents before children; orphan rows fail loud with `KB_GRAPH_SQLITE_REGISTRY_CORRUPT`). Derived types carry `status:'draft'` (draft joins the extraction closed set but stays out of the kb_graph tools' model-visible enumeration; kg_schema lists everything with the status marked).
7. **The kg_* consumption face: k-hop reads with aggregated YAML; free-form Text2Cypher is absent by design.** `kg_subgraph` resolves seeds through `searchNodes` (the new seam primitive: name/alias → minted id, shared by alignment and tools), clamps `hops≤2/max_nodes≤200`, and emits entity-aggregated YAML plus provenance sources and the truncation signal (the empirically best encoding, research §4.3).
8. **The corpus source reads workspace/data files, not the kb seam.** The kb seam exposes no document/chunk read face (ingest/search/deleteDocument but no listing); V4 reads files directly under `corpus.root` (recursive md/txt) with content-hash watermarks, and `tombstoneBySource('kb', path)` runs before re-extraction (delete-then-re-extract). A kb-seam read face is deferred.

## Evidence

- Seam: `KgStore` gains `upsertNodeType`/`upsertRelation`/`listStoredNodeTypes`/`listStoredRelations`/`searchNodes`; `KbGraphRuntime` gains the v2 forwarding (upsertNode/Edges, subgraph/expand, tombstone, alias, watermarks, persistNodeType/persistRelation/storedRegistry, searchNodes). The runtime validates predicate closed-set on v2 writes (endpoint closed-set stays enforced authoritatively by the store's registry foreign keys).
- Tools: tool-kb `kg_schema`/`kg_subgraph` (registered by default, the kb_graph tool-family precedent); the persona gains the fourth routing sentence (relation questions → kg_subgraph).
- Live run (2026-09-06, real NC :13000 + MINIMAX key): `examples/kb-agent/scripts/kg-build.mts` all green — 5 collections (10/3/3/3/49 rows), 1 lakehouse table, 16 connector datasets, 20 corpus documents; graph 384 nodes/254 edges; 张红喜 connected experts → services → orders (2 hops reach 49 orders); watermark experts=10; the second run skips every scope with unchanged counts; create → new node connected → delete → tombstoned.
- Tests: kb-graph 66/66, kb-graph-sqlite incl. registry.spec, kg-build 34/34 (mock NC + fake LLM full pipeline), tool-kb 170/170 (kg.spec added); the examples keyless snapshot `kg-tools.spec` (real Loader composition) and the with-key/with-NC e2e `kg-pipeline.e2e` (real closed-set extraction + tool-face answers + increment + tombstone, self-skipping).

## Consequences

- The graph's freshness now follows manual or scheduled pipeline runs; conversations between runs see the last built snapshot (the kg tools never trigger ingestion).
- Registry rows gain a second writer (the pipeline) beside the constructor seed; re-running a pipeline refreshes derived rows in place, so hand-edited derived labels are overwritten on the next run.
- Corpus kb-nodes mint from corpus-relative scopes, keeping ids stable across machines and snapshot runs.

## Alternatives considered

- Column-name-convention FK inference (`expertId` → `experts`) — rejected: silent guessing at business semantics; the explicit `fkLinks` config keeps every cross-collection edge auditable and fails loud on typos.
- Registering a `updatedAt` field on the seeded collections to revive watermark polling — probed live and rejected: the resourcer accepts the field registration but Sequelize never backfills values (`create`/`update` leave NULL), so the poll would silently see nothing; the fingerprint reconcile is honest about the track's actual capability.
- Per-chunk provenance with absolute corpus paths — rejected during the keyless snapshot: ids leaked the machine's tmp directory into expected outputs; corpus-relative scopes keep the graph portable.
- Dropping direction-violating relations into a degradation bucket alongside unknown-type entities — rejected: an unknown type is recoverable by later alignment, while a direction violation is a semantic error the caller must see; counting and dropping is the observable contract.

## Known limitations and deferred work

- The event-callback channel (NocoBase workflow → /kg-ingest) and the apiproxy `kg` domain were cut by batch scope: the former awaits the low-latency batch (the reconcile channel's minute-level cadence suffices for the track), the latter lands with V6's ui-kg (the batch's core list omits it).
- Reconcile bookkeeping (`run_config.knownIds`) grows linearly with row count; past ~10k rows it needs chunked reconciliation or hash bucketing (this track stays under 1k).
- Connector discover's merged output carries no providerId, so `connector:<id>` nodes risk cross-provider id collisions; the sourced_via edge waits for per-provider attribution on the seam.
- Cross-type (hierarchy-compatible) alignment and the embedding-cosine second signal (research §3.4's dual metric) are not done — Jaro-Winkler plus LLM gray-zone adjudication meets the track's precision, with the threshold conservatively raised to 0.9 (from the research's 0.85) in the absence of the vector conjunction.
