/**
 * Service Definition for the lakehouse capability seam (`ctx.lakehouse`):
 * catalog and engine provider registries, registration-order-independent
 * selection, and the load/query orchestration (write Parquet → register →
 * query with tenant-scoped table exposure and row capping). A missing query
 * engine is a documented degraded mode — the catalog keeps answering while
 * `load` and `query` fail loud.
 * @module @deepseek-ai/dsh-lakehouse
 */

import { mkdir, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LakehouseError } from './types.ts'
import type {
  CatalogStore,
  EngineTableRef,
  LakehouseLoadRequest,
  LakehouseLoadResult,
  LakehouseQueryResult,
  LakehouseStats,
  LakehouseTable,
  LakehouseTransferEntry,
  LakehouseTransferRecord,
  LakehouseUsage,
  LakehouseUsageDelta,
  QueryProvider,
} from './types.ts'

export { LAKEHOUSE_FORMATS, LAKEHOUSE_SCOPES, LakehouseError } from './types.ts'
export type {
  CatalogStore,
  EngineQueryOptions,
  EngineTableRef,
  LakehouseColumn,
  LakehouseFormat,
  LakehouseLoadRequest,
  LakehouseLoadResult,
  LakehouseProvenance,
  LakehouseQueryResult,
  LakehouseScope,
  LakehouseStats,
  LakehouseTable,
  LakehouseTransferEntry,
  LakehouseTransferRecord,
  LakehouseUsage,
  LakehouseUsageDelta,
  QueryProvider,
  TabularData,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    lakehouse: LakehouseRuntime
  }
}

/** Default workspace-relative root for lakehouse data files. */
const DEFAULT_DATA_ROOT = 'workspace/lakehouse'
/** Default query result cap. */
const DEFAULT_MAX_ROWS = 200

/**
 * Config for the lakehouse seam. `catalogStore` / `queryProvider` pin which
 * provider wins for each role; both are optional (a single registered usable
 * provider auto-selects).
 */
export interface LakehouseRuntimeConfig {
  /** Explicit catalog store id. Omitted = auto-select when exactly one usable. */
  readonly catalogStore?: string
  /** Explicit query engine id. Omitted = auto-select when exactly one usable. */
  readonly queryProvider?: string
  /** Workspace-relative (or absolute) data-file root; defaults to `workspace/lakehouse`. */
  readonly dataRoot?: string
  /** Query result cap; defaults to 200. */
  readonly maxRows?: number
}

/** One registered provider with a string id and a local usability check. */
interface ProviderLike {
  readonly id: string
  available(): boolean
}

/**
 * The lakehouse service. Registered as `ctx.lakehouse` (one instance per
 * context).
 *
 * Catalog selection (resolved at execution time, never order-dependent):
 * - A configured id that is registered and `available()` → that catalog.
 * - A configured id not registered → `LAKEHOUSE_CATALOG_CONFIGURED_MISSING`.
 * - A configured id registered but unavailable →
 *   `LAKEHOUSE_CATALOG_CONFIGURED_UNAVAILABLE`.
 * - No id configured, exactly one registered usable catalog → that catalog.
 * - No id configured, multiple usable catalogs → `LAKEHOUSE_CATALOG_AMBIGUOUS`.
 * - No id configured, no usable catalog → `LAKEHOUSE_CATALOG_UNAVAILABLE`.
 *
 * Engine selection mirrors those five branches with `LAKEHOUSE_ENGINE_*`
 * codes. The engine has no degraded substitution: with no usable engine the
 * catalog surface (`listTables`, `stats`, `usage`) keeps working while
 * `load` and `query` fail loud with `LAKEHOUSE_ENGINE_UNAVAILABLE`.
 */
export class LakehouseRuntime extends Service {
  static Config: z<LakehouseRuntimeConfig> = z.object({
    catalogStore: z.string(),
    queryProvider: z.string(),
    dataRoot: z.string().default(DEFAULT_DATA_ROOT),
    maxRows: z.number().step(1).min(1).default(DEFAULT_MAX_ROWS),
  })

  private readonly catalogs = new Map<string, CatalogStore>()
  private readonly engines = new Map<string, QueryProvider>()
  private readonly catalogId: string | undefined
  private readonly engineId: string | undefined
  private readonly dataRoot: string
  private readonly maxRows: number

  constructor(ctx: Context, config?: LakehouseRuntimeConfig) {
    super(ctx, 'lakehouse')
    this.catalogId = config?.catalogStore
    this.engineId = config?.queryProvider
    this.dataRoot = config?.dataRoot ?? DEFAULT_DATA_ROOT
    this.maxRows = config?.maxRows ?? DEFAULT_MAX_ROWS
  }

  /**
   * Register a catalog store. Throws {@link LakehouseError}
   * `LAKEHOUSE_DUPLICATE_PROVIDER` if its id is already registered. Returns a
   * disposer; disposed with the calling fiber.
   * @param store - the catalog store; its `id` is the registry key.
   * @returns the disposer that unregisters the store.
   */
  registerCatalogStore(store: CatalogStore): () => void {
    return this.registerProvider(this.catalogs, store, 'catalog')
  }

  /**
   * Register a query engine. Throws {@link LakehouseError}
   * `LAKEHOUSE_DUPLICATE_PROVIDER` if its id is already registered. Returns a
   * disposer; disposed with the calling fiber.
   * @param provider - the query engine; its `id` is the registry key.
   * @returns the disposer that unregisters the provider.
   */
  registerQueryProvider(provider: QueryProvider): () => void {
    return this.registerProvider(this.engines, provider, 'engine')
  }

  /** Shared registry insert with duplicate rejection and fiber-scoped disposal. */
  private registerProvider<T extends ProviderLike>(registry: Map<string, T>, provider: T, label: string): () => void {
    if (registry.has(provider.id)) {
      throw new LakehouseError(`${label} provider "${provider.id}" is already registered`, 'LAKEHOUSE_DUPLICATE_PROVIDER')
    }
    registry.set(provider.id, provider)
    const dispose = this.ctx.effect(() => () => {
      registry.delete(provider.id)
    }, `lakehouse.register${label.charAt(0).toUpperCase()}${label.slice(1)}Provider()`)
    return () => void dispose()
  }

  /** Resolve the catalog or throw the matching {@link LakehouseError}; see class doc. */
  private resolveCatalog(): CatalogStore {
    if (this.catalogId !== undefined) {
      const store = this.catalogs.get(this.catalogId)
      if (store === undefined) {
        throw new LakehouseError(
          `configured catalog store "${this.catalogId}" is not registered`,
          'LAKEHOUSE_CATALOG_CONFIGURED_MISSING',
        )
      }
      if (!store.available()) {
        throw new LakehouseError(
          `configured catalog store "${this.catalogId}" is registered but unavailable`,
          'LAKEHOUSE_CATALOG_CONFIGURED_UNAVAILABLE',
        )
      }
      return store
    }
    return this.resolveUsable(this.catalogs, 'catalog', 'LAKEHOUSE_CATALOG_UNAVAILABLE', 'LAKEHOUSE_CATALOG_AMBIGUOUS')
  }

  /** Resolve the engine or throw the matching {@link LakehouseError}; see class doc. */
  private resolveEngine(): QueryProvider {
    if (this.engineId !== undefined) {
      const engine = this.engines.get(this.engineId)
      if (engine === undefined) {
        throw new LakehouseError(
          `configured query engine "${this.engineId}" is not registered`,
          'LAKEHOUSE_ENGINE_CONFIGURED_MISSING',
        )
      }
      if (!engine.available()) {
        throw new LakehouseError(
          `configured query engine "${this.engineId}" is registered but unavailable`,
          'LAKEHOUSE_ENGINE_CONFIGURED_UNAVAILABLE',
        )
      }
      return engine
    }
    return this.resolveUsable(this.engines, 'engine', 'LAKEHOUSE_ENGINE_UNAVAILABLE', 'LAKEHOUSE_ENGINE_AMBIGUOUS')
  }

  /** Resolve the single usable provider or throw; used when nothing is configured. */
  private resolveUsable<T extends ProviderLike>(
    registry: Map<string, T>,
    label: string,
    unavailableCode: string,
    ambiguousCode: string,
  ): T {
    const usable = [...registry.values()].filter(provider => provider.available())
    const [sole] = usable
    if (sole !== undefined && usable.length === 1) return sole
    if (usable.length > 1) {
      throw new LakehouseError(
        `multiple usable lakehouse ${label} providers are registered (${usable.map(provider => provider.id).join(', ')}); configure one explicitly`,
        ambiguousCode,
      )
    }
    throw new LakehouseError(`no usable lakehouse ${label} provider is registered`, unavailableCode)
  }

  /**
   * Record one completed operation's usage increments. Metering is
   * observability: a failed counter write is logged and swallowed so it can
   * never fail the data operation that already succeeded — nothing else
   * reaches this catch.
   * @param catalog - the already-resolved catalog that owns the counters.
   * @param tenantId - owning tenant.
   * @param delta - the operation's increments.
   * @param signal - cancellation signal.
   */
  private async meter(catalog: CatalogStore, tenantId: string, delta: LakehouseUsageDelta, signal: AbortSignal | undefined): Promise<void> {
    try {
      await catalog.recordUsage(tenantId, delta, signal)
    } catch (error: unknown) {
      this.ctx.logger.warn(`lakehouse: usage recording failed for tenant "${tenantId}": ${String(error)}`)
    }
  }

  /** Reject an already-aborted signal before any provider work. */
  private throwIfAborted(signal: AbortSignal | undefined): void {
    // An aborted AbortSignal always carries a reason per the WHATWG standard.
    /* v8 ignore next 2 */
    if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
  }

  /** Absolute data-file path for one table identity. */
  private absoluteLocation(tenantId: string, tableName: string): string {
    return resolve(this.dataRoot, tenantId, `${tableName}.parquet`)
  }

  /** Workspace-relative data-file path for one table identity (the catalog record). */
  private relativeLocation(tenantId: string, tableName: string): string {
    return [this.dataRoot, tenantId, `${tableName}.parquet`].join('/')
  }

  /**
   * Write one tabular dataset as a Parquet file under the data root and
   * register it in the catalog. Loading the same `(tenantId, tableName)`
   * replaces the prior registration and its data file.
   * @param request - table identity, content, and optional provenance.
   * @param signal - cancellation signal forwarded to the engine and catalog.
   * @returns the registered table and whether it replaced a prior one.
   */
  async load(request: LakehouseLoadRequest, signal?: AbortSignal): Promise<LakehouseLoadResult> {
    this.throwIfAborted(signal)
    assertTableName(request.tableName)
    assertTenantId(request.tenantId)
    const catalog = this.resolveCatalog()
    const engine = this.resolveEngine()
    const absolute = this.absoluteLocation(request.tenantId, request.tableName)
    await mkdir(dirname(absolute), { recursive: true })
    await engine.writeParquet(absolute, request.tabular, signal)
    const now = new Date().toISOString()
    const prior = await catalog.describeTable(request.tenantId, request.tableName, signal)
    const table: LakehouseTable = {
      tenantId: request.tenantId,
      tableName: request.tableName,
      columns: request.tabular.columns,
      format: 'parquet',
      location: this.relativeLocation(request.tenantId, request.tableName),
      rowCount: request.tabular.rows.length,
      ...(request.provenance === undefined ? {} : { provenance: request.provenance }),
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
    }
    const { replaced } = await catalog.registerTable(table, signal)
    await this.meter(catalog, request.tenantId, { loadedTables: 1 }, signal)
    return { table, replaced }
  }

  /**
   * Run one SQL query over the tenant's registered tables. The engine sees
   * exactly that tenant's tables, so references to another tenant's tables
   * fail as unknown tables.
   * @param tenantId - owning tenant; scopes every visible table.
   * @param sql - single-statement SQL text.
   * @param signal - cancellation signal checked before provider work.
   * @returns result columns, rows cut to `maxRows`, and the truncation marker.
   */
  async query(tenantId: string, sql: string, signal?: AbortSignal): Promise<LakehouseQueryResult> {
    this.throwIfAborted(signal)
    assertTenantId(tenantId)
    const catalog = this.resolveCatalog()
    const engine = this.resolveEngine()
    const tables = await catalog.listTables(tenantId, signal)
    const refs: EngineTableRef[] = tables.map(table => ({
      tableName: table.tableName,
      location: resolve(table.location),
      format: table.format,
    }))
    const result = await engine.query(tenantId, sql, refs, { maxRows: this.maxRows }, signal)
    await this.meter(catalog, tenantId, { lakehouseQueries: 1 }, signal)
    return result
  }

  /**
   * List one tenant's registered tables through the resolved catalog.
   * @param tenantId - owning tenant.
   * @param signal - cancellation signal.
   * @returns the tenant's registrations, ordered by table name.
   */
  async listTables(tenantId: string, signal?: AbortSignal): Promise<readonly LakehouseTable[]> {
    this.throwIfAborted(signal)
    return this.resolveCatalog().listTables(tenantId, signal)
  }

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
  async dropTable(tenantId: string, tableName: string, signal?: AbortSignal): Promise<boolean> {
    this.throwIfAborted(signal)
    const catalog = this.resolveCatalog()
    const table = await catalog.describeTable(tenantId, tableName, signal)
    if (table === undefined) return false
    const dropped = await catalog.dropTable(tenantId, tableName, signal)
    if (!dropped) return false
    try {
      await unlink(resolve(table.location))
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code
      if (code !== 'ENOENT') {
        this.ctx.logger.warn(`lakehouse: deleting the data file for "${tenantId}/${tableName}" failed: ${String(error)}`)
      }
    }
    return true
  }

  /**
   * Report table counts plus engine observability for stats tooling. A
   * missing engine degrades to `engineAvailable: false` instead of throwing,
   * so the catalog side stays observable in the degraded mode.
   * @param tenantId - owning tenant.
   * @param signal - cancellation signal.
   * @returns table counts plus engine availability and identity.
   */
  async stats(tenantId: string, signal?: AbortSignal): Promise<LakehouseStats> {
    this.throwIfAborted(signal)
    const catalog = this.resolveCatalog()
    const tables = await catalog.listTables(tenantId, signal)
    const engine = this.resolveEngineSoft()
    return {
      tables: tables.length,
      ...(engine === undefined ? { engineAvailable: false } : { engineAvailable: true, engineId: engine.id }),
    }
  }

  /**
   * Resolve the engine without throwing: any selection failure (none
   * registered, none usable) reads as `undefined` for observability callers.
   */
  private resolveEngineSoft(): QueryProvider | undefined {
    try {
      return this.resolveEngine()
    } catch {
      return undefined
    }
  }

  /**
   * Read one tenant's cumulative usage counters through the resolved catalog.
   * @param tenantId - owning tenant.
   * @param signal - cancellation signal.
   * @returns the tenant's counters; all zeros when none were recorded.
   */
  async usage(tenantId: string, signal?: AbortSignal): Promise<LakehouseUsage> {
    this.throwIfAborted(signal)
    return this.resolveCatalog().usage(tenantId, signal)
  }

  /**
   * Append one connector transfer record through the resolved catalog — the
   * confirm step of the connector seam's transfer orchestration, registering
   * where a dataset landed regardless of destination.
   * @param record - the transfer trail entry.
   * @param signal - cancellation signal.
   * @returns the stored record's id.
   */
  async recordTransfer(record: LakehouseTransferRecord, signal?: AbortSignal): Promise<{ transferId: number }> {
    this.throwIfAborted(signal)
    return this.resolveCatalog().recordTransfer(record, signal)
  }

  /**
   * Read the stored transfer trail through the resolved catalog, newest first —
   * the delivery-tracking read behind the connector page's timeline.
   * @param limit - maximum number of records to return.
   * @param signal - cancellation signal.
   * @returns the most recent transfer entries.
   */
  async listTransfers(limit: number, signal?: AbortSignal): Promise<readonly LakehouseTransferEntry[]> {
    this.throwIfAborted(signal)
    return this.resolveCatalog().listTransfers(limit, signal)
  }
}

/** A table name must be a plain SQL identifier; it becomes a file name and a view name. */
const TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertTableName(tableName: string): void {
  if (!TABLE_NAME_PATTERN.test(tableName)) {
    throw new LakehouseError(
      `table name "${tableName}" is not a plain SQL identifier ([A-Za-z_][A-Za-z0-9_]*)`,
      'LAKEHOUSE_INVALID_TABLE_NAME',
    )
  }
}

/** A tenant slug must not traverse the data root when joined into a path. */
const TENANT_FORBIDDEN = /[\\/]|\.\./u

function assertTenantId(tenantId: string): void {
  if (tenantId.length === 0 || TENANT_FORBIDDEN.test(tenantId)) {
    throw new LakehouseError(
      'tenant id must be non-empty and free of path separators and ".."',
      'LAKEHOUSE_INVALID_TENANT',
    )
  }
}

export default LakehouseRuntime
