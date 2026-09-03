# @deepseek-ai/dsh-kb-graph-sqlite

English | [中文](README.zh.md)

The SQLite `GraphStore` provider for the knowledge-graph seam: one `node:sqlite` database (application id "DSHG", schema version 1) holding tenant-isolated triples with idempotent writes, one-hop neighbor expansion, two-hop path joins, and entity search over the entities projection.

## Model Experience

Indirectly, through the kb tool suite: the store registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of graph queries and writes.

#### KV Cache effect

None: this provider never reaches a model request; it answers seam queries with local SQLite reads.

## Known Limitations and Deferred Work

- Two-hop path joins scan both edge directions without an index hint beyond the two `(tenant, endpoint)` indexes; large graphs may need a materialized adjacency table.
- Entity search filters in JS after a UNION scan; a dedicated entities table with an FTS index is the scale-out path.
- No WAL-specific backup guidance beyond the shared kb-sqlite conventions.
