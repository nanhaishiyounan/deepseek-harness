# ui-lakehouse

English | [中文](README.zh.md)

The lakehouse workbench surface: a sidebar nav row (order 12.5, between connectors and kg) plus the hidden `lakehouse` conversation view — the table catalog grouped by schema with live row counts, the selected table's schema card (columns plus sample rows), and the read-only SQL editor with its result table. Data rides the gateway's `lakehouse.tables/query/schema` domain over the lakehouse engine (DuckDB + DuckLake); a deployment without the engine shows the structured refusal inline, and hostile statements surface the guard's rejection text in place.

## Model Experience

The workbench shares the lakehouse's model-facing vocabulary: tables list as `lake.<schema>.<table>` reference forms, the SQL editor accepts exactly what `lakehouse_query` accepts (single read statements), and rejected writes render the same reason text the model sees.
