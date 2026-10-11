# lakehouse-engine

English | [中文](README.zh.md)

The lakehouse engine service (`ctx.lakehouseEngine`): one in-process DuckDB instance with the configured table catalog attached — DuckLake at Tier 0 (a single SQLite-backed catalog file plus Parquet data files, zero external services). Consumers are the model-facing tool suite (`tool-lakehouse`), the sync pipeline (`lakehouse-sync`), and the gateway's lakehouse domain (`lakehouse.tables/query/schema`).

## Read-only defense

The model-facing surface (`query`, `listTables`, `describeTable`, `sampleRows`) enforces three layers before anything reaches DuckDB:

1. **Statement-shape guard** — one single-statement read only (`SELECT`, `WITH … SELECT`, `PRAGMA`, `DESCRIBE`); DML, DDL, `ATTACH`/`INSTALL`/`COPY`, `SET`, `SELECT … INTO`, assignment `PRAGMA`, and multi-statement text are rejected with structured codes (`LAKEHOUSE_SQL_NOT_READONLY`, `LAKEHOUSE_SQL_MULTI_STATEMENT`, `LAKEHOUSE_SQL_EMPTY`). String literals and comments are masked before the checks, so payload text cannot smuggle a second statement.
2. **Source-side READ_ONLY** — the sync source attaches with `(TYPE postgres, READ_ONLY)`, so no statement on the source alias can mutate it.
3. **Resource budgets** — the row cap wraps `SELECT`/`WITH` in `LIMIT cap + 1` and cuts `PRAGMA`/`DESCRIBE` afterwards; the time budget races the connection and interrupts DuckDB on expiry.

The write surface is a set of structured operations (ingest Parquet, schema-only tables, watermark append, state upsert) — never free-form SQL from model or UI input. DuckLake rejects key constraints, so the internal state table upserts as delete-then-insert, and the append count comes from a bounded pre-count (DuckLake has no `INSERT … RETURNING`).

## Tier 1 upgrade face

The catalog attachment is a discriminated config (`kind: 'ducklake'` today); Tier 1 (B6) extends the union with an Iceberg REST member (Gravitino + MinIO) — same config shape, different attach SQL. No Tier 1 member is declared here because an unrealized member would be dead code.

## Configuration

Every deployment-varying choice is a validated `Config` field (cordis.yml): `catalog.catalogPath` / `catalog.dataPath` (defaults `workspace/lakehouse/ducklake/…`), `memoryLimitMb`, `threads`, `maxRows` (200), `queryTimeoutMs` (30000), and `extensionAutoinstall` (true). DuckDB pins at 1.5.6 (`@duckdb/node-api` 1.5.6-r.1); the DuckLake/postgres community extensions load with an `INSTALL` retry when missing.

## Model Experience

Indirectly, through the lakehouse tool suite registrations: query outcomes and their guard rejections surface only through the tools; this package owns no prompt, schema, or tool of its own.

#### KV Cache effect

Independent of the model request stream: results reach a later request as tool results, so this package neither appends to nor invalidates any reusable request prefix.


## Known Limitations and Deferred Work

- Deferred: Gravitino/MinIO Tier1 attach (B6) and the write-side sync expansion beyond the watermark append.
