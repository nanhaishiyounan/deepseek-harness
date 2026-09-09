# @deepseek-ai/dsh-lakehouse

English | [中文](README.zh.md)

Lakehouse capability seam (`ctx.lakehouse`): catalog and engine provider registries plus the load/query orchestration over Parquet-backed tables. Loading a `(tenantId, tableName)` pair writes one Parquet file under the data root and registers it in the catalog; queries expose exactly the tenant's tables to the engine and cap rows.

## Orchestration

`load` resolves both providers, computes the data-file location `<dataRoot>/<tenantId>/<tableName>.parquet`, creates its parent directory, hands the tabular dataset to the engine's `writeParquet`, and registers the outcome in the catalog. Re-loading the same identity replaces the prior registration and keeps the original `createdAt`. Table names must be plain SQL identifiers (`[A-Za-z_][A-Za-z0-9_]*`) and tenant ids must be free of path separators, because both become file and view names.

`query` lists the tenant's registrations, resolves each workspace-relative location to an absolute path, and executes the SQL with the resolved `maxRows`. Tenant isolation rides the table set: the engine sees only that tenant's tables, so a reference to another tenant's table fails as an unknown table. Usage metering (`loadedTables` / `lakehouseQueries`) records after success through the catalog; a metering failure logs and never fails the data operation.

## Provider selection

The `./data-router` sub-export is the shared upload-routing discriminator: a pure `resolveDataRoute(filename, bytes, mime?)` that classifies one uploaded file as a lakehouse load (csv/xlsx/json) or a kb document (md/txt/pdf/docx) from its extension whitelist, its declared mime type when the name carries no known extension, and a magic-number agreement gate (pdf/zip/json-array signatures; csv and plain text have none). Refusals carry a machine-routable reason — `unsupported-type`, `type-mismatch`, `empty-file` — so the apiproxy `data` domain and (from the connector batch on) the transfer pipeline map them onto their own wire codes. The discriminator lives on this package because both consumers already depend on the seam, keeping one routing truth with no new package.

Both registries resolve at execution time, never in registration order. For each role, a configured id that is registered and `available()` wins; a configured id that is missing or unavailable throws its own code (`*_CONFIGURED_MISSING`, `*_CONFIGURED_UNAVAILABLE`); with nothing configured, exactly one usable provider auto-selects while multiple throw `*_AMBIGUOUS` and none throw `*_UNAVAILABLE`. The engine has no degraded substitute: with no usable engine the catalog surface (`listTables`, `stats`, `usage`, `dropTable`) keeps working while `load` and `query` fail loud with `LAKEHOUSE_ENGINE_UNAVAILABLE`; `stats` reports `engineAvailable: false` instead of throwing.

## Configuration (schemastery)

```ts
interface Config {
  catalogStore?: string   // explicit catalog id; omitted = auto-select when exactly one usable
  queryProvider?: string  // explicit engine id; omitted = auto-select when exactly one usable
  dataRoot?: string       // workspace-relative (or absolute) data root; default 'workspace/lakehouse'
  maxRows?: number        // query result cap; default 200
}
```

## Model Experience

Indirectly, through a consumer tool package: this seam registers no prompt, schema, or tool of its own; a later consumer owns every model-facing projection of loaded tables and query results.

#### KV Cache effect

Independent of the model request stream: loads and queries produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- **Parquet-only load path** — `load` always writes Parquet; the `csv` format value exists for engine reads and future direct csv loads.
- **No row-level authorization** — isolation is per tenant through the visible table set; column or row masking is out of scope for the seam.
- **Metering best-effort** — usage counters live in the catalog and a failed increment never fails the data operation, so counters can lag a succeeded operation.
