# @deepseek-ai/dsh-lakehouse-duckdb

English | [中文](README.zh.md)

DuckDB query provider for the lakehouse seam: in-process OLAP over Parquet (and CSV) files through `@duckdb/node-api`, with load-time availability probing and clean degradation. Registered on `ctx.lakehouse` at load.

## Engine model

One `:memory:` DuckDB instance serves the process; every `query` and `writeParquet` call opens its own connection. A query creates one temporary view per handed table (`read_parquet` / `read_csv` by the format discriminator), wraps the caller's SQL as `SELECT * FROM (<sql>) LIMIT maxRows + 1`, and reports `truncated` from the extra row. Views and connections die with the call, so two tenants' queries never see each other's tables. Multi-statement SQL is rejected by the wrapper itself; a trailing semicolon is accepted.

`writeParquet` builds a fixed-name temp table, appends rows through DuckDB's appender, and `COPY`s to the target path as Parquet. Table and column names are double-quoted with doubled inner quotes; column `sqlType` text must match a closed set of scalar types (`LAKEHOUSE_INVALID_SQL_TYPE` otherwise) because it reaches DDL; cell values accept the JSON-scalar domain (`null`, `boolean`, `number`, `bigint`, `string`) and fail loud with `LAKEHOUSE_WRITE_FAILED` outside it. Result cells normalize for JSON consumers: `bigint` narrows to `number` inside the safe range and to its decimal string outside, timestamps become ISO strings.

## Availability and degradation

The module import and instance creation happen in the plugin's probe — never at module top level. A missing native binding records the load failure and leaves the engine registered but unavailable: composition still loads, catalog operations keep working, and `load`/`query` fail loud with `LAKEHOUSE_ENGINE_UNAVAILABLE`, whose message carries the recorded cause. The `available()` check reads that cached state and performs no I/O.

## Configuration (schemastery)

```ts
interface Config {
  memoryLimitMb?: number   // DuckDB memory limit in MB; omitted = DuckDB's own default
  threads?: number         // DuckDB worker-thread count; omitted = DuckDB's own default
}
```

## Model Experience

Indirectly, through a consumer tool package: this engine registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of query results.

#### KV Cache effect

Independent of the model request stream: queries produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- **Per-query view recreation** — every query re-creates its temp views; at MVP table counts this is noise, and a view cache becomes interesting only with many wide tables.
- **No cancellation mid-statement** — abort signals are checked before execution and between written rows; a running DuckDB statement is not interrupted (`connection.interrupt()` is the documented escalation path).
- **Native module required** — the official prebuilt covers darwin/linux/win; hosts where it cannot load run degraded (catalog-only) rather than failing composition.
