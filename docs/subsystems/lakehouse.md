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
<!-- END GENERATED cordis-surface -->
