# lakehouse-sync

English | [中文](README.zh.md)

The lakehouse sync pipeline (`ctx.lakehouseSync`): scheduled watermark-incremental sync from a read-only PostgreSQL attach into the DuckLake catalog, plus the idempotent legacy ingest that lands the B0 Parquet export (138 NocoBase business tables) as the permanent lakehouse history.

## Sync modes

Each configured table syncs one of two ways, probed per run:

- **Watermark append** — when the source carries one of the configured change-cursor candidates (`updatedAt`, `updated_at`), the pipeline appends rows beyond the persisted cursor and advances it to the source's current maximum. The cursor lives in the lakehouse's internal state table (`lake.main._dsh_lake_state`), so watermarks persist with the data they describe; the maximum is read `::VARCHAR` so timestamp cursors survive the engine's epoch-bigint representation.
- **Full replace** — tables without a cursor column land the full current contents (`CREATE OR REPLACE TABLE AS SELECT`), the w6b1 semantics for legacy tables that never had `updated_at`.

## Legacy ingest

`ingestLegacy()` scans the B0 export directory: every `<table>.parquet` becomes a lakehouse table (same-table re-runs replace — idempotent), and every business table without an export file becomes a schema-only table from the source's column metadata (PG types map to DuckDB DDL; JSON/UUID/arrays land as TEXT, matching the B0 export's serialized cells). The resulting table set matches the B0 reconciliation exactly: 128 data tables plus 10 schema-only tables.

## Configuration

All `Config` fields (cordis.yml): `dsn` (defaults to the nocobase PostgreSQL source; carbon lands in B3), `sourceSchema`, `targetSchema` (`synced_nocobase`), `tables`, `watermarkCandidates`, `scheduleIntervalMs` (0 disables the schedule), and `legacyIngest` (enabled / parquetDir / targetSchema `legacy_nocobase` / sourceDsn / prefixes / standaloneTables — the B0 business-table set by default). A startup ingest failure fails composition; a scheduled run failure logs and keeps the service ready for the next tick.

## Model Experience

Indirectly, through the lakehouse tool suite registrations: synced rows reach the model only through later reads; this package owns no prompt, schema, or tool of its own.

#### KV Cache effect

Independent of the model request stream: results reach a later request as tool results, so this package neither appends to nor invalidates any reusable request prefix.


## Known Limitations and Deferred Work

- Deferred: true CDC (delete propagation) beyond watermark append; SeaTunnel Zeta line remains the reference.
