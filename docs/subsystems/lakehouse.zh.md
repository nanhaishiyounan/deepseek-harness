# 湖仓

[English](lakehouse.md) | 中文

湖仓缝让客户上传的表格数据可用真实 SQL 查询。[`ctx.lakehouse`](#ctxlakehouse--lakehouseruntime) 拥有 catalog 与引擎 provider 注册表及 load/query 编排：加载一个 `(tenantId, tableName)` 身份会在数据根目录下写出一个 Parquet 文件并在 catalog 登记；查询时只把查询租户的表暴露给引擎，并按 `maxRows` 截断行数。

`tenantId` 是硬隔离键：它约束 catalog 列举与引擎可见表集合，引用另一租户的表会以未知表失败。表名必须是纯 SQL 标识符，租户 id 不得含路径分隔符——两者都会成为文件名与视图名。catalog 与引擎的选择都在执行时解析，每种失败形态有专属错误码（`*_CONFIGURED_MISSING`、`*_CONFIGURED_UNAVAILABLE`、`*_AMBIGUOUS`、`*_UNAVAILABLE`）；无可用引擎时 catalog 面继续应答，而 `load` 与 `query` 以 `LAKEHOUSE_ENGINE_UNAVAILABLE` 显式失败。

每次完成的 load 与 query 都经 catalog 记录每租户用量计数（`loadedTables`、`lakehouseQueries`）；计数写失败只记警告，绝不连累数据操作。`ctx.lakehouse.usage(tenantId)` 读取租户累计计数，`stats` 附加引擎可观测性（`engineAvailable`、`engineId`）。

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

`CatalogStore` 实现事务性覆盖式登记（`registerTable`、`listTables`、`describeTable`、`dropTable`），追加连接器传输轨迹（`recordTransfer`），并持有每租户用量计数器（`recordUsage`、`usage`）。

后端：

- Catalog：[`packages/lakehouse/lakehouse-sqlite-catalog`](../../packages/lakehouse/lakehouse-sqlite-catalog/README.zh.md) — 单个 `node:sqlite` 数据库（`SCHEMA_VERSION = 1`、application id `"DSHL"`），承载表登记、传输记录与用量计数器。
- 引擎：[`packages/lakehouse/lakehouse-duckdb`](../../packages/lakehouse/lakehouse-duckdb/README.zh.md) — 经官方 `@duckdb/node-api` prebuilt 对 Parquet（与 CSV）文件做进程内 DuckDB；原生模块在插件探测时加载，绑定缺失降级为不可用引擎并记录原因。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
