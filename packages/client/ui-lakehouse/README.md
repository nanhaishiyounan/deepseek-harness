# ui-lakehouse

English | [中文](README.zh.md)

The lakehouse workbench surface: a sidebar nav row (order 12.5, between connectors and kg) plus the hidden `lakehouse` conversation view — the table catalog grouped by schema with live row counts, the selected table's schema card (columns plus sample rows), and the read-only SQL editor with its result table. Data rides the gateway's `lakehouse.tables/query/schema` domain over the lakehouse engine (DuckDB + DuckLake); a deployment without the engine shows the structured refusal inline, and hostile statements surface the guard's rejection text in place.

## Model Experience

None, as this client page renders model-independent reads only; every prompt, schema, and tool surface lives in server packages.

#### KV Cache effect

Independent of the model request stream: client page reads never enter a request, so this package neither appends to nor invalidates any reusable request prefix.


## Known Limitations and Deferred Work

- Deferred: deeper lineage and quality surfaces ride the B6 catalog governance batch; the panel currently reads the lake snapshot per request.
