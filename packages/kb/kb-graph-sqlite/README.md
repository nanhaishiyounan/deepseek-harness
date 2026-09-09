# @deepseek-ai/dsh-kb-graph-sqlite

English | [中文](README.zh.md)

The SQLite `KgStore` provider for the knowledge-graph seam: one `node:sqlite` database (application id "DSHG", schema version 2) holding the seven-table property graph — node-type and relation registries, nodes with an FTS5 name index, provenance-carrying bitemporal edges, aliases, source-run watermarks, and usage counters. Writes are merge-shaped and idempotent (the seven-column anchor `tenant/src/dst/relation/source_system/source_id`), tombstones replace deletes, and k-hop subgraph walks run as a cycle-safe recursive CTE. The v1 `GraphStore` face survives unchanged: `putTriples` translates internally onto the node/edge merges. Registry persistence is two-layer: database creation materializes the built-in ontology, `upsertNodeType`/`upsertRelation` refresh derived entries (the kg-build write path), and plugin load re-registers persisted rows into the runtime registry (parents before children; orphan rows fail loud). A v1 `triples` database is rejected with a rebuild instruction — the graph is derived, provenance-traceable data, so a full pipeline run restores it.

## Model Experience

Indirectly, through the kb tool suite: the store registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of graph queries and writes.

#### KV Cache effect

None: this provider never reaches a model request; it answers seam queries with local SQLite reads.

## Known Limitations and Deferred Work

- Registry upserts refresh whole rows but carry no schema-drift diff (derived-type changes vs a new `listMeta` pass) — the pipeline batch owns that comparison later.
- Two-hop path joins on the v1 face scan both edge directions without an index hint beyond the two `(tenant, endpoint)` indexes; large graphs may need a materialized adjacency table.
- Node embeddings (the `embedding` BLOB column) have no writer yet; the entity-alignment batch will fill them through the kb embed channel.
- No WAL-specific backup guidance beyond the shared kb-sqlite conventions.
