# lakehouse/ — lakehouse capability family

English | [中文](README.zh.md)

The lakehouse capability seam and its providers: tenant-scoped tabular tables stored as Parquet under a data root, a SQLite catalog for registration metadata, the DuckDB query engine, the model-facing tool suite, and the shared upload-routing discriminator the `data` domain and connector transfers consume. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`lakehouse/`](lakehouse/README.md) | Capability seam: provider registries and load/query orchestration; `./data-router` sub-export classifies uploads | `ctx.lakehouse` |
| [`lakehouse-sqlite-catalog/`](lakehouse-sqlite-catalog/README.md) | Catalog provider over `node:sqlite` | registers `ctx.lakehouse` |
| [`lakehouse-duckdb/`](lakehouse-duckdb/README.md) | Query engine over `@duckdb/node-api` (degrades when the native module is missing) | registers `ctx.lakehouse` |
| [`tool-lakehouse/`](tool-lakehouse/README.md) | Model-facing `lakehouse_tables`/`lakehouse_query` tools | consumes `ctx.lakehouse` |

The seam keeps the classic three roles: the Service Definition owns selection and orchestration, providers register catalog/engine implementations, and the tool suite is a pure Consumer. Uploads reach the load path through the apiproxy `data` domain, which shares the `./data-router` discriminator with the connector transfer pipeline.
