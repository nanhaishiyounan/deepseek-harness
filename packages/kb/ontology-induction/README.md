# dsh-ontology-induction

English | [中文](README.zh.md)

LLM schema-induction pipeline (the automatic ontology path): corpus chunking, OntoGPT-style structured-output prompts, candidate merging, the SHACL-shaped ontology gate with a bounded repair loop, and deterministic JSON-LD serialization — the model emits JSON, code serializes RDF.

See the B5 batch evidence in `research/2026-10-09-w24-rebuild/b5-ontology/`.

## Model Experience

None, as this pure library registers no plugin, prompt, schema, or tool of its own; pipeline scripts own every model-facing effect of corpus induction.

#### KV Cache effect

Independent of the model request stream: library functions never enter a request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- Islands <100 target not reached (375 after bridges; corpus singleton Concept/Dataset nodes have no business-table names to bridge) — next: crossSource v2 over carbon sources + WeKnora entity channel.
- The ETL clears the graph per run for reproducibility; incremental watermark sync into Neo4j is deferred.
- Line tables + customer ride a READ_ONLY postgres attach while the DuckLake catalog is web-locked; folding them into the lake snapshot is deferred.
