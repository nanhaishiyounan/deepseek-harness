# dsh-tool-graph

English | [中文](README.zh.md)

Model-facing graph tool suite over `ctx.neo4jGraph`: `kg_graph_query` (one read-only Cypher statement under the statement-shape guard) and `kg_ontology` (the append-only ontology version chain)

See the B5 batch evidence in `research/2026-10-09-w24-rebuild/b5-ontology/`.

## Model Experience

### System prompt

#### What the model sees

Two guidance sections ride the system prompt while the tools are enabled, verbatim below.

##### kg-graph-query guidance

```markdown
Use the kg_graph_query tool to run one read-only Cypher statement over the Neo4j graph when a question needs entity neighborhoods, multi-hop relationships, or graph counts. Nodes carry gid/name/nodeType; relationships are typed (e.g. orderedBy, orderedFrom, orderedItem, purchasedItem, MENTIONS). Only single read statements starting with MATCH/OPTIONAL MATCH/WITH/UNWIND and containing RETURN are accepted — writes (CREATE/MERGE/DELETE/SET/REMOVE/CALL) are rejected. For lakehouse table aggregates use lakehouse_query instead; for the ontology schema census use kg_ontology.
```

##### kg-ontology guidance

```markdown
Use the kg_ontology tool to read the stored ontology version chain and the head document's class/relation census before planning kg_graph_query traversals. Ontology versions are append-only (LLM induction drafts pass the SHACL gate before storage); the census lists the legal class ids and relation ids.
```

#### Token effect

Two fixed-cost guidance sections (~130 tokens), registered once per composition — negligible against the tools' own schemas.

#### KV Cache effect

Static prompt text ahead of the dynamic session body; cache-stable.

### Tool schemas

#### What the model sees

The model sees the generated [`kg_graph_query` and `kg_ontology` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-graph). `kg_graph_query` declares one required `cypher` string; `kg_ontology` declares no arguments.

#### Token effect

~50 tokens for both schemas — among the smallest in a composition.

#### KV Cache effect

Static schema text; cache-stable.

### Query result

#### What the model sees

`kg_graph_query` returns the result columns, row set, and a truncation marker, plus a source attribution naming the Neo4j graph; `kg_ontology` returns the version-chain table and the head census.

#### Token effect

Proportional to result rows, capped by the store's row budget.

#### KV Cache effect

Independent of the model request stream: query results are tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- Islands <100 target not reached (375 after bridges; corpus singleton Concept/Dataset nodes have no business-table names to bridge) — next: crossSource v2 over carbon sources + WeKnora entity channel.
- The ETL clears the graph per run for reproducibility; incremental watermark sync into Neo4j is deferred.
- Line tables + customer ride a READ_ONLY postgres attach while the DuckLake catalog is web-locked; folding them into the lake snapshot is deferred.
