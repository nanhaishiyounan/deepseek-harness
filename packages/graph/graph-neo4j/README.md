# dsh-graph-neo4j

English | [中文](README.zh.md)

Neo4j graph store capability: a bolt-connected storage service for the knowledge graph (ontology versions stored as append-only JSON-LD documents, a read-only Cypher guard for model-facing queries, the business lakehouse-to-graph ETL manifest, and the pure LLM schema-induction pipeline)

See the B5 batch evidence in `research/2026-10-09-w24-rebuild/b5-ontology/`.

## Model Experience

Indirectly, through the graph tool suite's own registrations: this store only carries the bolt capability; every prompt, schema, and tool surface lives in dsh-tool-graph.

#### KV Cache effect

Independent of the model request stream: graph queries produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- Islands <100 target not reached (375 after bridges; corpus singleton Concept/Dataset nodes have no business-table names to bridge) — next: crossSource v2 over carbon sources + WeKnora entity channel.
- The ETL clears the graph per run for reproducibility; incremental watermark sync into Neo4j is deferred.
- Line tables + customer ride a READ_ONLY postgres attach while the DuckLake catalog is web-locked; folding them into the lake snapshot is deferred.
