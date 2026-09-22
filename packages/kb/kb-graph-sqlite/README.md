# @deepseek-ai/dsh-kb-graph-sqlite

English | [中文](README.zh.md)

The SQLite `KgStore` provider for the knowledge-graph seam: one `node:sqlite` database (application id "DSHG", `SCHEMA_VERSION` 5) holding the property graph — node-type and relation registries (FoodOn anchor columns, synonyms, cardinality-carrying constraint JSON), nodes with an FTS5 name index, quad-temporal provenance-carrying edges, aliases, source-run watermarks, the ontology-revision and build-run ledgers, the `kg_episode`/`kg_mention` temporal ledger, the `ontology_xref` mapping channel, and the `kg_align_rejects` coreference tombstones. Writes are merge-shaped and idempotent (the seven-column anchor `tenant/src/dst/relation/source_system/source_id`); tombstones write `valid_until`, rollbacks mark `expired_at`, and live means both are NULL — the `idx_edge_live` partial index serves every live read. K-hop subgraph walks run as a cycle-safe recursive CTE; `snapshotAt(tenant, asOf)` freezes the graph for revision replay (nodes created at or before the instant, edges recorded at or before it that were neither tombstoned nor retired before it). The v1 `GraphStore` face survives unchanged: `putTriples` translates internally onto the node/edge merges. Registry persistence is two-layer: database creation materializes the built-in ontology, `upsertNodeType`/`upsertRelation` refresh derived and edited entries (the kg-build and ontology-editor write paths), and plugin load re-registers persisted rows into the runtime registry (parents before children; orphan rows fail loud; a stored `deprecated` status round-trips). A v1–v4 database is rejected with a rebuild instruction — the graph is derived, provenance-traceable data, so a full pipeline run restores it.

## Model Experience

Indirectly, through the kb tool suite: the store registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of graph queries and writes.

#### KV Cache effect

None: this provider never reaches a model request; it answers seam queries with local SQLite reads.

## Known Limitations and Deferred Work

- Registry upserts refresh whole rows but carry no schema-drift diff — the pipeline's revision audit owns that comparison at run start.
- Two-hop path joins on the v1 face scan both edge directions without an index hint beyond the two `(tenant, endpoint)` indexes; large graphs may need a materialized adjacency table.
- Node embeddings (the `embedding` BLOB column) have no writer yet; the entity-alignment batch will fill them through the kb embed channel.
- `snapshotAt` compares ISO strings lexically; callers pass `Date.now()`-shaped instants (the episode ledger's own timestamps), which order correctly.
