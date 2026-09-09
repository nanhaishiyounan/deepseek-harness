/**
 * Vocabulary for the lakehouse capability seam (`ctx.lakehouse`): tabular
 * datasets, registered tables, the `CatalogStore` and `QueryProvider`
 * provider contracts, and the `LakehouseError` taxonomy.
 * @module @deepseek-ai/dsh-lakehouse/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/** One column of a tabular dataset, a registered table, or a query result. */
export interface LakehouseColumn {
  /** Column name as SQL presents it. */
  readonly name: string
  /** DuckDB SQL type name (for example `TEXT`, `INTEGER`, `DOUBLE`, `BOOLEAN`). */
  readonly sqlType: string
}

/**
 * In-memory row-set handed to the seam by loaders: column metadata plus
 * row-major cell values. Cell values are the JSON-shaped scalars `null`,
 * `boolean`, `number`, and `string`.
 */
export interface TabularData {
  readonly columns: readonly LakehouseColumn[]
  readonly rows: readonly (readonly unknown[])[]
}

/** Closed union of on-disk data-file formats. */
export type LakehouseFormat = 'parquet' | 'csv'

/** Every member of {@link LakehouseFormat}, for boundary validation loops. */
export const LAKEHOUSE_FORMATS: readonly LakehouseFormat[] = ['parquet', 'csv']

/**
 * Closed union of authorization scopes, isomorphic to the kb seam's
 * `KbScope`: `search` keeps a table inside its own tenant's queries, `derive`
 * additionally allows derived work products inside the tenant, `share` lets
 * other tenants query the table too. Consumers `switch` on the value ending
 * in `assertNever`.
 */
export type LakehouseScope = 'search' | 'derive' | 'share'

/** Every member of {@link LakehouseScope}, for boundary validation loops. */
export const LAKEHOUSE_SCOPES: readonly LakehouseScope[] = ['search', 'derive', 'share']

/**
 * Trusted-data-space provenance carried on a registered table, isomorphic to
 * the kb seam's `KbProvenance`: the provider/consumer/scope triple that backs
 * later attribution claims.
 */
export interface LakehouseProvenance {
  /** Data provider identity (the party that contributed the table). */
  readonly provider: string
  /** How far queries may spread; defaults to `search` when omitted. */
  readonly scope?: LakehouseScope
  /** Where the table was collected from (upload, connector transfer, system). */
  readonly collectedSource?: string
}

/**
 * One registered lakehouse table. `(tenantId, tableName)` is the table
 * identity: loading the same pair replaces the previous registration.
 * `location` is the workspace-relative data-file path (presentation and
 * provenance identity), never a resolved absolute path.
 */
export interface LakehouseTable {
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

/**
 * One transfer record — the resource-registration trail a connector leaves
 * when it lands a dataset in the lakehouse (or hands one to the kb).
 */
export interface LakehouseTransferRecord {
  /** Source provider id (for example `connector-nocobase`). */
  readonly source: string
  /** Destination the dataset landed in. */
  readonly destination: 'kb' | 'lakehouse'
  /** Source-side dataset identity. */
  readonly datasetId: string
  /** Row count transferred (document count for kb destinations). */
  readonly rows: number
  /** ISO-8601 completion timestamp. */
  readonly transferredAt: string
}

/**
 * One stored transfer record — the append trail's read shape: the record plus
 * the id its append returned. Delivery-tracking surfaces (the connector page)
 * read this; nothing mutates it.
 */
export interface LakehouseTransferEntry extends LakehouseTransferRecord {
  /** Append-assigned record id. */
  readonly transferId: number
}

/** One tenant's cumulative usage counters — the metering seam behind quota and billing projections. */
export interface LakehouseUsage {
  /** Completed `load` operations (replacing loads count again). */
  readonly loadedTables: number
  /** Completed `query` operations. */
  readonly lakehouseQueries: number
}

/** Usage increments for one completed operation; omitted fields add zero. */
export interface LakehouseUsageDelta {
  readonly loadedTables?: number
  readonly lakehouseQueries?: number
}

/** Complete `stats` projection: table counts plus engine observability. */
export interface LakehouseStats {
  /** Registered tables (tenant-filtered when requested). */
  readonly tables: number
  /** False when no usable query engine is registered (degraded mode). */
  readonly engineAvailable: boolean
  /** Engine identity in use, when a usable engine is registered. */
  readonly engineId?: string
}

/** One query outcome: result columns, rows, and the truncation marker. */
export interface LakehouseQueryResult {
  readonly columns: readonly LakehouseColumn[]
  readonly rows: readonly (readonly unknown[])[]
  /** True when more than `maxRows` rows matched; `rows` is already cut to `maxRows`. */
  readonly truncated: boolean
}

/**
 * Typed lakehouse error with a machine-routable, open-string `code` and
 * chained `cause`. Shared codes cover provider selection (missing,
 * unavailable, ambiguous, configured-missing, configured-unavailable,
 * duplicate), name rejection, and engine write/query failures.
 */
export class LakehouseError extends HarnessError {}

/**
 * One tenant-visible table handed to the query engine for one query. The
 * runtime resolves the catalog's workspace-relative `location` to an absolute
 * path here; engines never resolve paths themselves.
 */
export interface EngineTableRef {
  readonly tableName: string
  /** Absolute data-file path, resolved by the runtime against the data root. */
  readonly location: string
  readonly format: LakehouseFormat
}

/** Query execution options the runtime resolves for each call. */
export interface EngineQueryOptions {
  /** Result cap; the engine fetches one extra row to detect truncation. */
  readonly maxRows: number
}

/**
 * A SQL execution backend. Registered with
 * `ctx.lakehouse.registerQueryProvider`. An unavailable engine (native module
 * missing) is the documented degraded-mode trigger: catalog operations keep
 * working while `load` and `query` fail loud with `LAKEHOUSE_ENGINE_UNAVAILABLE`.
 */
export interface QueryProvider {
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

/**
 * A persistence backend for lakehouse metadata. Registered with
 * `ctx.lakehouse.registerCatalogStore`. `registerTable` is transactional and
 * overwrite-shaped: an existing `(tenantId, tableName)` registration is
 * replaced atomically and the outcome reports the replacement.
 */
export interface CatalogStore {
  /** Stable string, unique among registered catalog stores. */
  readonly id: string
  /** Cheap local usability check; must not perform I/O. */
  available(): boolean
  /**
   * Register (or replace) one table registration atomically.
   * @param table - the full registration record.
   * @param signal - cancellation signal.
   * @returns whether a prior registration with the same identity was replaced.
   */
  registerTable(table: LakehouseTable, signal?: AbortSignal): Promise<{ replaced: boolean }>
  /**
   * List one tenant's registrations, ordered by table name.
   * @param tenantId - owning tenant.
   * @param signal - cancellation signal.
   */
  listTables(tenantId: string, signal?: AbortSignal): Promise<readonly LakehouseTable[]>
  /**
   * Read one registration by identity.
   * @param tenantId - owning tenant.
   * @param tableName - table identity within the tenant.
   * @param signal - cancellation signal.
   */
  describeTable(tenantId: string, tableName: string, signal?: AbortSignal): Promise<LakehouseTable | undefined>
  /**
   * Delete one registration by identity.
   * @param tenantId - owning tenant.
   * @param tableName - table identity within the tenant.
   * @param signal - cancellation signal.
   * @returns whether a registration was deleted.
   */
  dropTable(tenantId: string, tableName: string, signal?: AbortSignal): Promise<boolean>
  /**
   * Append one connector transfer record.
   * @param record - the transfer trail entry.
   * @param signal - cancellation signal.
   * @returns the stored record's id.
   */
  recordTransfer(record: LakehouseTransferRecord, signal?: AbortSignal): Promise<{ transferId: number }>
  /**
   * Read the stored transfer trail, newest first.
   * @param limit - maximum number of records to return.
   * @param signal - cancellation signal.
   */
  listTransfers(limit: number, signal?: AbortSignal): Promise<readonly LakehouseTransferEntry[]>
  /**
   * Atomically add one operation's usage increments to a tenant's counters.
   * @param tenantId - owning tenant.
   * @param delta - the increments; omitted fields add zero.
   * @param signal - cancellation signal.
   */
  recordUsage(tenantId: string, delta: LakehouseUsageDelta, signal?: AbortSignal): Promise<void>
  /**
   * Read one tenant's cumulative usage counters; a tenant with no recorded
   * usage reads as all zeros.
   * @param tenantId - owning tenant.
   * @param signal - cancellation signal.
   */
  usage(tenantId: string, signal?: AbortSignal): Promise<LakehouseUsage>
}

/** One load request through the seam: tabular content plus table identity. */
export interface LakehouseLoadRequest {
  readonly tenantId: string
  readonly tableName: string
  readonly tabular: TabularData
  readonly provenance?: LakehouseProvenance
}

/** Load outcome: the registered table and whether it replaced a prior one. */
export interface LakehouseLoadResult {
  readonly table: LakehouseTable
  readonly replaced: boolean
}
