# Agent Note: The lakehouse capability seam — SQLite catalog, Parquet files, DuckDB engine

Status: implemented

English | [中文](2026-09-03-lakehouse-seam-duckdb-sqlite-catalog.zh.md)

## Problem

The connector-agent phase ([plans/connector-lakehouse-nocobase/PLAN.md](../../../../plans/connector-lakehouse-nocobase/PLAN.md)) needs structured data uploaded by customers to become queryable: load a tabular dataset once, then answer numeric and list questions with real SQL over it. The functional baseline's terminal state (Iceberg/Spark/Flink/Kafka) sits behind the "no heavy infrastructure" red line, and nothing in the harness could store or query tables. The seam had to land before the tool surface (N2) and the connector seam (N3) could build on it, and it had to degrade safely on hosts where the chosen engine's native module cannot load.

## Decision

### The seam is three packages over one storage topology

`packages/lakehouse/lakehouse` is the Service Definition (`ctx.lakehouse`): the `CatalogStore` and `QueryProvider` contracts, registration-order-independent selection with the kb seam's five-branch error codes per role, and the load/query/drop/stats/usage orchestration. `lakehouse-sqlite-catalog` persists the table registry, connector transfer records, and usage counters in one `node:sqlite` database (`SCHEMA_VERSION = 1`, application id `"DSHL"`, the kb store's ownership-validation template). `lakehouse-duckdb` executes SQL over Parquet (and CSV) files through `@duckdb/node-api`. The capability-seam roles are complete by construction; the Tool Consumer is deliberately N2's, not this batch's.

Storage splits along the same line the session and kb groups already draw: durable metadata in SQLite, bulk data as workspace-relative Parquet files under `<dataRoot>/<tenantId>/<tableName>.parquet` (default root `workspace/lakehouse`). `(tenantId, tableName)` is the table identity — re-loading replaces the file and the registration, mirroring kb's `(tenantId, sourcePath)` model.

### DuckDB, probed at load, degraded by registration

DuckDB won the engine slot: single-binary in-process OLAP with a complete SQL dialect (the NL2SQL story needs only a tool surface, no translation layer), Parquet as the open lake-table-format stepping stone, and an official prebuilt `@duckdb/node-api` covering darwin/linux/win with no install scripts (pnpm's strict build allowlist never triggers). The wasm fallback stays a plan-level contingency for CI prebuilt failures, not shipped code.

The native module imports only inside the plugin's probe — never at module top level. A failed probe records the cause and leaves the provider registered but unavailable: composition loads, catalog operations keep answering, and `load`/`query` fail loud with `LAKEHOUSE_ENGINE_UNAVAILABLE` whose message carries the recorded cause. This is the kb embed-degradation pattern applied to a role with no substitute: degradation shrinks to "catalog still observable", never to a silently weaker query.

### Tenant isolation is the visible table set, and the row cap wraps user SQL

`query` resolves the tenant's registrations, hands the engine one `EngineTableRef` per table (absolute paths resolved by the runtime), and the engine creates per-call temp views for exactly those names. A cross-tenant reference fails as an unknown table — no SQL rewriting, no allowlist parsing. The caller's SQL runs as `SELECT * FROM (<sql>) LIMIT maxRows + 1`; the extra row is the truncation marker, and DuckDB's own parser rejects multi-statement text inside the subquery wrapper.

### Load-path safety is closed sets, not escaping

Table names must match `[A-Za-z_][A-Za-z0-9_]*` and tenant ids must be path-separator-free — both become file names and view names. Column `sqlType` text must match a closed set of scalar types before it reaches DDL. Identifiers are double-quoted with doubled quotes and file paths single-quoted with doubled quotes where interpolation is unavoidable; everything else rides parameters or the appender.

## Alternatives considered

- **A hosted lake format (Iceberg on object storage, Spark/Trino)** — the functional baseline's terminal state, but it drags a JVM service fleet and a catalog service behind a red line that forbids heavy infrastructure; DuckDB + Parquet keeps the SQL surface while everything stays in-process.
- **`@duckdb/duckdb-wasm` as the engine** — zero native footprint, but slower and heavier to wire through workers; adopted only as the documented fallback if CI prebuilt lanes fail, not as the default.
- **Metadata in the same DuckDB instance** — one process fewer, but catalog durability then rides the engine's availability, breaking the degraded mode where the catalog must keep answering; SQLite keeps the failure domains independent and reuses the kb store's schema-ownership template.
- **SQL rewriting for tenant isolation** — an AST-level allowlist would parse every statement, and the visible-table-set approach gets the same guarantee from DuckDB's own name resolution at zero parsing cost.
- **A connector-owned transfer table** — the transfer record lives in the lakehouse catalog because both destinations (kb, lakehouse) of a future transfer need one registration trail, and the catalog is already the durable metadata owner.
- **Extending the kb seam with a `table` doc kind** — tables are not documents: chunking, embedding, and citation make no sense for row sets, and the load/query lifecycle differs in kind from ingest/search.

## Consequences

The seam's contracts are the N2/N3 building blocks: N2's `tool-lakehouse` reads `listTables` and projects `query` results; N3's connector transfer lands its confirm step in `recordTransfer` and reuses `load`. Engine writes are append-only Parquet replaces — no incremental inserts, no transactions across tables; both are fine at customer-upload scales and revisitable when a format like Iceberg earns its weight. Query concurrency is bounded by per-call connections on one instance; a second instance is an escalation, not a config flag. The `available()` probe caches its outcome for the process lifetime, so installing the native module requires a restart to be seen — the documented price of an I/O-free availability check.

### Testing

`pnpm vitest run packages/lakehouse` (94 tests) covers the five selection branches per role, load→query round trips against the real DuckDB engine and real Parquet files, tenant isolation end to end, truncation and bigint/timestamp normalization, the probe-failure degradation path through an injected loader, schema ownership rejection, transactional rollback through a failing trigger, and a Loader composition test that loads all three plugins from a `cordis.yml`. Coverage gate: 100% per file (`pnpm vitest run packages/lakehouse --coverage --coverage.include='packages/lakehouse/*/src/**'`).
