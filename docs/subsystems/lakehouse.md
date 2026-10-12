# Lakehouse

English | [中文](lakehouse.zh.md)

The lakehouse seam makes customer-uploaded tabular data queryable with real SQL. [`ctx.lakehouse`](#ctxlakehouse--lakehouseruntime) owns the catalog and engine provider registries and the load/query orchestration: loading a `(tenantId, tableName)` identity writes one Parquet file under the data root and registers it in the catalog; queries expose exactly the querying tenant's tables to the engine and cap rows at `maxRows`.

`tenantId` is the hard isolation key: it scopes catalog listings and the engine's visible table set, so a reference to another tenant's table fails as an unknown table. Table names must be plain SQL identifiers and tenant ids must be free of path separators — both become file and view names. Catalog and engine selection each resolve at execution time with one error code per failure shape (`*_CONFIGURED_MISSING`, `*_CONFIGURED_UNAVAILABLE`, `*_AMBIGUOUS`, `*_UNAVAILABLE`); with no usable engine the catalog surface keeps answering while `load` and `query` fail loud with `LAKEHOUSE_ENGINE_UNAVAILABLE`.

Every completed load and query records per-tenant usage counters (`loadedTables`, `lakehouseQueries`) through the catalog; a failed counter write logs a warning and never fails the data operation. `ctx.lakehouse.usage(tenantId)` reads a tenant's cumulative counters, and `stats` adds engine observability (`engineAvailable`, `engineId`).

Source: [`packages/lakehouse/lakehouse/src/index.ts`](../../packages/lakehouse/lakehouse/src/index.ts)

## Provider contracts

```ts type-equiv
/**
 * In-memory row-set handed to the seam by loaders: column metadata plus
 * row-major cell values. Cell values are the JSON-shaped scalars `null`,
 * `boolean`, `number`, and `string`.
 */
interface TabularData {
  readonly columns: readonly LakehouseColumn[]
  readonly rows: readonly (readonly unknown[])[]
}
```

```ts type-equiv
/**
 * One registered lakehouse table. `(tenantId, tableName)` is the table
 * identity: loading the same pair replaces the previous registration.
 * `location` is the workspace-relative data-file path (presentation and
 * provenance identity), never a resolved absolute path.
 */
interface LakehouseTable {
  /** Owning tenant slug; the hard isolation key for both catalog and engine. */
  readonly tenantId: string
  /** SQL identifier naming the table in queries. */
  readonly tableName: string
  readonly columns: readonly LakehouseColumn[]
  readonly format: LakehouseFormat
  /** Workspace-relative data-file location (`<dataRoot>/<tenantId>/<tableName>.<ext>`). */
  readonly location: string
  /** Row count at load time; queries see the current data file, not this count. */
  readonly rowCount: number
  /** Data-space provenance, when the load carried it. */
  readonly provenance?: LakehouseProvenance
  /** ISO-8601 timestamp of the first registration of this identity. */
  readonly createdAt: string
  /** ISO-8601 timestamp of the replacing registration. */
  readonly updatedAt: string
}
```

```ts type-equiv
/**
 * A SQL execution backend. Registered with
 * `ctx.lakehouse.registerQueryProvider`. An unavailable engine (native module
 * missing) is the documented degraded-mode trigger: catalog operations keep
 * working while `load` and `query` fail loud with `LAKEHOUSE_ENGINE_UNAVAILABLE`.
 */
interface QueryProvider {
  /** Stable string, unique among registered engines. */
  readonly id: string
  /** Cheap local usability check; must not perform I/O. */
  available(): boolean
  /**
   * Execute one SQL query over the tenant's visible tables.
   * @param tenantId - tenant identity, for diagnostics.
   * @param sql - single-statement SQL text the engine wraps with its row cap.
   * @param tables - the tenant's registered tables; the engine must expose
   *   exactly these table names and no others, so cross-tenant references
   *   fail as unknown tables.
   * @param options - resolved execution options (result cap).
   * @param signal - cancellation signal checked before execution.
   */
  query(
    tenantId: string,
    sql: string,
    tables: readonly EngineTableRef[],
    options: EngineQueryOptions,
    signal?: AbortSignal,
  ): Promise<LakehouseQueryResult>
  /**
   * Write one tabular dataset as a Parquet file (the load path).
   * @param location - absolute output path; the runtime created its parent directory.
   * @param tabular - column metadata plus row-major cell values.
   * @param signal - cancellation signal checked before and between rows.
   */
  writeParquet(location: string, tabular: TabularData, signal?: AbortSignal): Promise<void>
}
```

A `CatalogStore` implements transactional overwrite-shaped registration (`registerTable`, `listTables`, `describeTable`, `dropTable`), appends the connector transfer trail (`recordTransfer`), and owns the per-tenant usage counters (`recordUsage`, `usage`).

Backends:

- Catalog: [`packages/lakehouse/lakehouse-sqlite-catalog`](../../packages/lakehouse/lakehouse-sqlite-catalog/README.md) — one `node:sqlite` database (`SCHEMA_VERSION = 1`, application id `"DSHL"`) holding the table registry, transfer records, and usage counters.
- Engine: [`packages/lakehouse/lakehouse-duckdb`](../../packages/lakehouse/lakehouse-duckdb/README.md) — in-process DuckDB over Parquet (and CSV) files through the official `@duckdb/node-api` prebuilt; the native module loads in the plugin's probe, and a missing binding degrades to an unavailable engine with the recorded cause.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxlakehouse--lakehouseruntime"></a>

### `ctx.lakehouse` — `LakehouseRuntime`

The lakehouse service. Registered as `ctx.lakehouse` (one instance per context).

Catalog selection (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that catalog.
- A configured id not registered → `LAKEHOUSE_CATALOG_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `LAKEHOUSE_CATALOG_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable catalog → that catalog.
- No id configured, multiple usable catalogs → `LAKEHOUSE_CATALOG_AMBIGUOUS`.
- No id configured, no usable catalog → `LAKEHOUSE_CATALOG_UNAVAILABLE`.

Engine selection mirrors those five branches with `LAKEHOUSE_ENGINE_*` codes. The engine has no degraded substitution: with no usable engine the catalog surface (`listTables`, `stats`, `usage`) keeps working while `load` and `query` fail loud with `LAKEHOUSE_ENGINE_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register a catalog store. Throws {@link LakehouseError}
 * `LAKEHOUSE_DUPLICATE_PROVIDER` if its id is already registered. Returns a
 * disposer; disposed with the calling fiber.
 * @param store - the catalog store; its `id` is the registry key.
 * @returns the disposer that unregisters the store.
 */
registerCatalogStore(store: CatalogStore): () => void

/**
 * Register a query engine. Throws {@link LakehouseError}
 * `LAKEHOUSE_DUPLICATE_PROVIDER` if its id is already registered. Returns a
 * disposer; disposed with the calling fiber.
 * @param provider - the query engine; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerQueryProvider(provider: QueryProvider): () => void

/**
 * Write one tabular dataset as a Parquet file under the data root and
 * register it in the catalog. Loading the same `(tenantId, tableName)`
 * replaces the prior registration and its data file.
 * @param request - table identity, content, and optional provenance.
 * @param signal - cancellation signal forwarded to the engine and catalog.
 * @returns the registered table and whether it replaced a prior one.
 */
async load(request: LakehouseLoadRequest, signal?: AbortSignal): Promise<LakehouseLoadResult>

/**
 * Run one SQL query over the tenant's registered tables. The engine sees
 * exactly that tenant's tables, so references to another tenant's tables
 * fail as unknown tables.
 * @param tenantId - owning tenant; scopes every visible table.
 * @param sql - single-statement SQL text.
 * @param signal - cancellation signal checked before provider work.
 * @returns result columns, rows cut to `maxRows`, and the truncation marker.
 */
async query(tenantId: string, sql: string, signal?: AbortSignal): Promise<LakehouseQueryResult>

/**
 * List one tenant's registered tables through the resolved catalog.
 * @param tenantId - owning tenant.
 * @param signal - cancellation signal.
 * @returns the tenant's registrations, ordered by table name.
 */
async listTables(tenantId: string, signal?: AbortSignal): Promise<readonly LakehouseTable[]>

/**
 * Drop one registration and best-effort delete its data file. The catalog
 * record is the authority: once deleted, a leftover file cannot be queried.
 * A file-delete failure (other than the file already being gone) is logged
 * for the operator and does not fail the drop.
 * @param tenantId - owning tenant.
 * @param tableName - table identity within the tenant.
 * @param signal - cancellation signal.
 * @returns whether a registration was deleted.
 */
async dropTable(tenantId: string, tableName: string, signal?: AbortSignal): Promise<boolean>

/**
 * Report table counts plus engine observability for stats tooling. A
 * missing engine degrades to `engineAvailable: false` instead of throwing,
 * so the catalog side stays observable in the degraded mode.
 * @param tenantId - owning tenant.
 * @param signal - cancellation signal.
 * @returns table counts plus engine availability and identity.
 */
async stats(tenantId: string, signal?: AbortSignal): Promise<LakehouseStats>

/**
 * Read one tenant's cumulative usage counters through the resolved catalog.
 * @param tenantId - owning tenant.
 * @param signal - cancellation signal.
 * @returns the tenant's counters; all zeros when none were recorded.
 */
async usage(tenantId: string, signal?: AbortSignal): Promise<LakehouseUsage>

/**
 * Append one connector transfer record through the resolved catalog — the
 * confirm step of the connector seam's transfer orchestration, registering
 * where a dataset landed regardless of destination.
 * @param record - the transfer trail entry.
 * @param signal - cancellation signal.
 * @returns the stored record's id.
 */
async recordTransfer(record: LakehouseTransferRecord, signal?: AbortSignal): Promise<{ transferId: number }>

/**
 * Read the stored transfer trail through the resolved catalog, newest first —
 * the delivery-tracking read behind the connector page's timeline.
 * @param limit - maximum number of records to return.
 * @param signal - cancellation signal.
 * @returns the most recent transfer entries.
 */
async listTransfers(limit: number, signal?: AbortSignal): Promise<readonly LakehouseTransferEntry[]>
```

Source: [`packages/lakehouse/lakehouse/src/index.ts`](../../packages/lakehouse/lakehouse/src/index.ts)

<a id="ctxlakehouseengine--lakehouseengineservice"></a>

### `ctx.lakehouseEngine` — `LakehouseEngineService`

The lakehouse engine service. One instance per context; the DuckDB native module loads in LakehouseEngineService.open, never at module top level, so a missing binding degrades to `available() === false` (every surface method then fails loud with `LAKEHOUSE_ENGINE_UNAVAILABLE`) instead of breaking composition load.

```ts cordis-catalog
/**
 * True when the DuckDB instance is live and the catalog is attached.
 * @returns the liveness check over the instance handle and disposal flag.
 */
available(): boolean

/**
 * The recorded native-module or open failure, for diagnostics.
 * @returns the failure message, or undefined when open succeeded or never ran.
 */
openFailure(): string | undefined

/**
 * Load the native module, create the `:memory:` instance, and attach the
 * configured catalog. Idempotent and concurrency-safe: concurrent callers
 * share one open. A missing native module leaves the engine unavailable
 * (degraded mode); a catalog attach failure on a working instance is a
 * configuration error and fails loud.
 */
async open(): Promise<void>

/** Close the shared instance; idempotent. Pending connections close with it. */
close(): void

/**
 * Run one read-only SQL statement over the attached lakehouse catalog. The
 * SQL guard rejects anything that is not a single read statement; the row
 * cap and time budget bound the result; references use
 * `lake.<schema>.<table>`.
 * @param sql - the statement text.
 * @param overrides - per-call row/time budget overrides (never above the configured caps).
 * @param signal - cancellation signal checked before and during execution.
 * @returns the columns, JSON-scalar rows cut to the row cap, and the truncation flag.
 */
async query(sql: string, overrides?: Partial<QueryOptions>, signal?: AbortSignal): Promise<LakehouseQueryOutcome>

/**
 * List every lakehouse table with its live row count, ordered by schema
 * then table. System schemas stay hidden.
 * @param signal - cancellation signal.
 * @returns one summary per visible table with its live row count.
 */
async listTables(signal?: AbortSignal): Promise<readonly LakehouseTableSummary[]>

/**
 * Describe one lakehouse table: ordered column names and DuckDB types.
 * @param schema - the table's schema inside the lakehouse catalog.
 * @param table - the table name.
 * @param signal - cancellation signal.
 * @returns the ordered column descriptors.
 */
async describeTable(schema: string, table: string, signal?: AbortSignal): Promise<readonly LakehouseColumnDesc[]>

/**
 * Read up to `limit` sample rows from one lakehouse table, in stable
 * storage order.
 * @param schema - the table's schema inside the lakehouse catalog.
 * @param table - the table name.
 * @param limit - the sample size, cut to the configured row cap.
 * @param signal - cancellation signal.
 * @returns the sample rows as one query outcome.
 */
async sampleRows(schema: string, table: string, limit: number, signal?: AbortSignal): Promise<LakehouseQueryOutcome>

/**
 * Create a schema inside the lakehouse catalog when absent.
 * @param schema - the schema name (a validated identifier).
 * @param signal - cancellation signal.
 */
async createSchema(schema: string, signal?: AbortSignal): Promise<void>

/**
 * Replace one lakehouse table with the contents of a Parquet file (the
 * legacy ingest path). Same-table re-runs replace, so the operation is
 * idempotent.
 * @param schema - target schema inside the lakehouse catalog.
 * @param table - target table name.
 * @param parquetPath - the Parquet file to read (workspace-relative or absolute).
 * @param signal - cancellation signal.
 */
async ingestParquet(schema: string, table: string, parquetPath: string, signal?: AbortSignal): Promise<void>

/**
 * Create one schema-only (zero-row) table from explicit column definitions
 * — the legacy path for source tables that export no data file.
 * @param schema - target schema inside the lakehouse catalog.
 * @param table - target table name.
 * @param columns - ordered name/type pairs.
 * @param signal - cancellation signal.
 */
async createSchemaOnlyTable(schema: string, table: string, columns: readonly LakehouseColumnDesc[], signal?: AbortSignal): Promise<void>

/**
 * Attach a PostgreSQL database read-only under one alias, for the sync
 * pipeline's source reads. The attach is `READ_ONLY`, so no statement on
 * this alias can mutate the source.
 * @param alias - the attach alias (a validated identifier).
 * @param dsn - the libpq connection string.
 * @param signal - cancellation signal.
 */
async attachPostgres(alias: string, dsn: string, signal?: AbortSignal): Promise<void>

/**
 * Drop one attached source alias; a missing alias is a no-op.
 * @param alias - the attached source alias.
 * @param signal - caller cancellation.
 */
async detach(alias: string, signal?: AbortSignal): Promise<void>

/**
 * Replace one lakehouse table with the full current contents of one
 * attached source table (the full-replace sync mode).
 * @param schema - target schema inside the lakehouse catalog.
 * @param table - target table name.
 * @param source - the structured source reference.
 * @param signal - cancellation signal.
 */
async replaceTableFromSource(schema: string, table: string, source: SourceTableRef, signal?: AbortSignal): Promise<void>

/**
 * Append the source rows whose watermark column exceeds `fromValue` into
 * one lakehouse table, returning the appended row count. The comparison is
 * type-implicit: the literal is parsed as the column's type.
 * @param schema - target schema inside the lakehouse catalog.
 * @param table - target table name.
 * @param source - the structured source reference.
 * @param watermarkColumn - the source column holding the change cursor.
 * @param fromValue - the exclusive lower bound (the persisted watermark).
 * @param signal - cancellation signal.
 * @returns the number of appended rows.
 */
async appendIncremental( schema: string, table: string, source: SourceTableRef, watermarkColumn: string, fromValue: string | null, signal?: AbortSignal, ): Promise<number>

/**
 * Read the maximum value of one source table's watermark column (the next
 * watermark to persist after a sync pass).
 * @param source - the structured source reference.
 * @param watermarkColumn - the source column holding the change cursor.
 * @param signal - cancellation signal.
 * @returns the maximum value in its DuckDB text form, or null on an empty source.
 */
async readSourceWatermark(source: SourceTableRef, watermarkColumn: string, signal?: AbortSignal): Promise<string | null>

/**
 * Read one persisted sync-state value from the lakehouse-internal state
 * table, creating the table on first use.
 * @param key - the state key (the sync pipeline namespaces its own keys).
 * @param signal - cancellation signal.
 * @returns the stored value, or null when the key has no entry.
 */
async readState(key: string, signal?: AbortSignal): Promise<string | null>

/**
 * Persist one sync-state value (upsert by key).
 * @param key - the state key.
 * @param value - the value to persist.
 * @param signal - cancellation signal.
 */
async writeState(key: string, value: string, signal?: AbortSignal): Promise<void>

/**
 * Run one engine-internal read (metadata listings, column probing). The
 * statement is constructed exclusively by this package and the sync
 * pipeline — never from model or UI input — so the read-only row cap does
 * not apply; the internal safety cap stays at 100000 rows.
 * @param sql - the statement text.
 * @param signal - cancellation signal.
 * @returns the columns and full JSON-scalar row set.
 */
async readInternal( sql: string, signal?: AbortSignal, ): Promise<{ columns: LakehouseColumnDesc[]; rows: (null | boolean | number | string)[][] }>

/**
 * Run one engine-internal maintenance statement. These statements are
 * constructed exclusively by this package and the sync pipeline — never
 * from model or UI input — so no read-only guard applies.
 * @param sql - the statement text.
 * @param signal - cancellation signal.
 */
async execInternal(sql: string, signal?: AbortSignal): Promise<void>
```

Source: [`packages/lakehouse/lakehouse-engine/src/engine.ts`](../../packages/lakehouse/lakehouse-engine/src/engine.ts)

<a id="ctxlakehousesync--lakehousesyncservice"></a>

### `ctx.lakehouseSync` — `LakehouseSyncService`

The sync service. One instance per context; every method opens by attaching the source read-only and detaches it at the end, so runs never leave attach state behind.

```ts cordis-catalog
/**
 * The most recent completed run, for status surfaces.
 * @returns the last run's result, or undefined before the first completion.
 */
lastRun(): SyncRunResult | undefined

/**
 * Land the legacy B0 export into the lakehouse: every Parquet file becomes
 * a table (same-table re-runs replace — idempotent), and every business
 * table without an export file becomes a schema-only table from the
 * source's column metadata, so the resulting table set matches the B0
 * reconciliation exactly.
 * @param signal - cancellation signal.
 * @returns the ingest outcome with per-table row counts.
 */
async ingestLegacy(signal?: AbortSignal): Promise<LegacyIngestResult>

/**
 * Sync every configured table once. Watermark tables append the source
 * rows beyond the persisted cursor and advance it to the source's current
 * maximum; replace tables land the full current contents.
 * @param signal - cancellation signal.
 * @returns the run outcome with per-table modes and watermark movement.
 */
async runOnce(signal?: AbortSignal): Promise<SyncRunResult>
```

Source: [`packages/lakehouse/lakehouse-sync/src/sync.ts`](../../packages/lakehouse/lakehouse-sync/src/sync.ts)
<!-- END GENERATED cordis-surface -->
