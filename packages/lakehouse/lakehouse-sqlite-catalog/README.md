# @deepseek-ai/dsh-lakehouse-sqlite-catalog

English | [中文](README.zh.md)

SQLite catalog provider for the lakehouse seam: one `node:sqlite` database holding the table registry, connector transfer records, and usage counters, registered on `ctx.lakehouse` at load.

## Storage model

Schema 1 keeps three structures: `lakehouse_tables` (identity `UNIQUE (tenant_id, table_name)`, column metadata as a JSON array, provenance triple, timestamps), `lakehouse_transfers` (append-only connector transfer trail), and `usage_counters` (one row per tenant, atomically upserted increments). Every statement and fixed pragma lives in a packaged `.sql` resource; values use SQLite parameters and runtime code never assembles query text.

A pristine database initializes inside one `BEGIN IMMEDIATE` transaction that also stamps `user_version = 1` and the reserved application id (`"DSHL"`). Any other on-disk version (older or newer), a foreign application identity, or an unversioned database that already owns tables rejects; this pre-release provider supplies no migration. Connection setup applies `trusted_schema = OFF`, `foreign_keys = ON`, `synchronous = FULL`, and WAL journaling for file-backed paths.

`registerTable` overwrites transactionally: the upsert replaces every mutable field of an existing identity and preserves its `created_at`; the outcome reports whether a prior registration was replaced. Reading a registration parses its columns record and fails loud with `LAKEHOUSE_CATALOG_CORRUPT` when the stored text is not a JSON array of `{name, sqlType}` entries.

## Configuration (schemastery)

```ts
interface Config {
  path: string             // database path (":memory:" supported); relative resolves against cwd
  busyTimeoutMs?: number   // wait for another SQLite connection's lock; default 5,000 ms
}
```

The open is eager: an unwritable path or a foreign on-disk schema fails composition load instead of the first call. Disposing the plugin unregisters the catalog and closes the owned connection (idempotent).

## Model Experience

Indirectly, through a consumer tool package: this store registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of registered tables.

#### KV Cache effect

Independent of the model request stream: registry reads produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- **Single connection per store instance** — concurrent writers contend through SQLite's lock and the configured busy timeout; no connection pool is provided.
- **Columns as JSON text** — column metadata rides a JSON `TEXT` column instead of a normalized table; queries never filter on column fields, so the simpler representation wins until one does.
- **No transfer-record reads** — the provider appends transfer records and returns their ids; a listing API waits for the consumer that needs it.
