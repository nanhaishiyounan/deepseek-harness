/**
 * The SQLite `CatalogStore` provider: table registry, connector transfer
 * records, and usage counters in one `node:sqlite` database with
 * transactional overwrite-shaped registration.
 * @module @deepseek-ai/dsh-lakehouse-sqlite-catalog/store
 */

import { resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { LakehouseError } from '@deepseek-ai/dsh-lakehouse'
import type {
  CatalogStore,
  LakehouseColumn,
  LakehouseFormat,
  LakehouseProvenance,
  LakehouseScope,
  LakehouseTable,
  LakehouseTransferEntry,
  LakehouseTransferRecord,
  LakehouseUsage,
  LakehouseUsageDelta,
} from '@deepseek-ai/dsh-lakehouse'
import { validateSchema } from './schema.ts'
import { sql } from './sql.ts'

type DatabaseSyncConstructor = typeof import('node:sqlite')['DatabaseSync']

/** Open the database at `path` and validate schema ownership, closing again on a foreign schema. */
function openValidated(options: SqliteCatalogStoreOptions, Database: DatabaseSyncConstructor): DatabaseSync {
  const db = new Database(options.path === ':memory:' ? ':memory:' : resolve(options.path), {
    timeout: options.busyTimeoutMs,
  })
  try {
    validateSchema(db, options.path)
    return db
  } catch (error: unknown) {
    db.close()
    throw error
  }
}

/** Constructor options for {@link SqliteCatalogStore}. */
export interface SqliteCatalogStoreOptions {
  /** Database path (`:memory:` supported) or cwd-relative path. */
  readonly path: string
  /** Maximum wait for another SQLite connection's lock. */
  readonly busyTimeoutMs: number
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  // An aborted AbortSignal always carries a reason per the WHATWG standard.
  /* v8 ignore next 2 */
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

/** Parse a stored columns record back into typed columns; corrupt text fails loud. */
function parseColumns(raw: string, tenantId: string, tableName: string): readonly LakehouseColumn[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause: unknown) {
    throw new LakehouseError(
      `the columns record for "${tenantId}/${tableName}" is not valid JSON`,
      'LAKEHOUSE_CATALOG_CORRUPT',
      { cause },
    )
  }
  if (!Array.isArray(parsed)) {
    throw new LakehouseError(
      `the columns record for "${tenantId}/${tableName}" is not a JSON array`,
      'LAKEHOUSE_CATALOG_CORRUPT',
    )
  }
  const columns: LakehouseColumn[] = []
  for (const entry of parsed) {
    const record = entry as Record<string, unknown>
    if (typeof record.name !== 'string' || typeof record.sqlType !== 'string') {
      throw new LakehouseError(
        `the columns record for "${tenantId}/${tableName}" has a non-column entry`,
        'LAKEHOUSE_CATALOG_CORRUPT',
      )
    }
    columns.push({ name: record.name, sqlType: record.sqlType })
  }
  return columns
}

/** One row of `lakehouse_tables` as SQLite returns it. */
type TableRow = {
  tenant_id: string
  table_name: string
  columns_json: string
  format: string
  location: string
  row_count: number
  provider: string | null
  scope: string | null
  collected_source: string | null
  created_at: string
  updated_at: string
}

function rowToTable(row: TableRow): LakehouseTable {
  const provider = row.provider
  const provenance: LakehouseProvenance | undefined = provider === null
    ? undefined
    : {
      provider,
      ...(row.scope === null ? {} : { scope: row.scope as LakehouseScope }),
      ...(row.collected_source === null ? {} : { collectedSource: row.collected_source }),
    }
  return {
    tenantId: row.tenant_id,
    tableName: row.table_name,
    columns: parseColumns(row.columns_json, row.tenant_id, row.table_name),
    format: row.format as LakehouseFormat,
    location: row.location,
    rowCount: row.row_count,
    ...(provenance === undefined ? {} : { provenance }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * The `node:sqlite`-backed `CatalogStore`. Opens and validates the database
 * in the constructor (fail-loud on schema mismatch); one instance owns one
 * connection until {@link SqliteCatalogStore.close}.
 */
export class SqliteCatalogStore implements CatalogStore {
  readonly id = 'lakehouse-sqlite-catalog'
  private readonly db: DatabaseSync
  private closed = false

  constructor(options: SqliteCatalogStoreOptions, Database: DatabaseSyncConstructor) {
    this.db = openValidated(options, Database)
  }

  available(): boolean {
    return !this.closed
  }

  /** Close the owned connection; idempotent. */
  close(): void {
    if (!this.closed) {
      this.closed = true
      this.db.close()
    }
  }

  async registerTable(table: LakehouseTable, signal?: AbortSignal): Promise<{ replaced: boolean }> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    throwIfAborted(signal)
    /* jscpd:ignore-start */
    // jscpd: intentional symmetry — the begin/immediate-write/commit/rollback
    // transaction skeleton shared with the kb store; the kb and lakehouse
    // groups stay cross-dependency-free
    // (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
    this.db.exec(sql('begin-immediate'))
    try {
      const existing = this.db.prepare(sql('select-table-by-identity'))
        .get(table.tenantId, table.tableName) as TableRow | undefined
      this.db.prepare(sql('upsert-table')).run(
        table.tenantId,
        table.tableName,
        JSON.stringify(table.columns),
        table.format,
        table.location,
        table.rowCount,
        table.provenance?.provider ?? null,
        table.provenance?.scope ?? null,
        table.provenance?.collectedSource ?? null,
        table.createdAt,
        table.updatedAt,
      )
      this.db.exec(sql('commit'))
      return { replaced: existing !== undefined }
    } catch (error: unknown) {
      this.rollback()
      throw error
    }
    /* jscpd:ignore-end */
  }

  async listTables(tenantId: string, _signal?: AbortSignal): Promise<readonly LakehouseTable[]> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    const rows = this.db.prepare(sql('select-tables-by-tenant')).all(tenantId) as TableRow[]
    return rows.map(rowToTable)
  }

  async describeTable(tenantId: string, tableName: string, _signal?: AbortSignal): Promise<LakehouseTable | undefined> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    const row = this.db.prepare(sql('select-table-by-identity')).get(tenantId, tableName) as TableRow | undefined
    return row === undefined ? undefined : rowToTable(row)
  }

  async dropTable(tenantId: string, tableName: string, _signal?: AbortSignal): Promise<boolean> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    const changes = this.db.prepare(sql('delete-table-by-identity')).run(tenantId, tableName)
    return changes.changes > 0
  }

  async recordTransfer(record: LakehouseTransferRecord, _signal?: AbortSignal): Promise<{ transferId: number }> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    const inserted = this.db.prepare(sql('insert-transfer')).run(
      record.source,
      record.destination,
      record.datasetId,
      record.rows,
      record.transferredAt,
    ) as { lastInsertRowid: number | bigint }
    return { transferId: Number(inserted.lastInsertRowid) }
  }

  async listTransfers(limit: number, _signal?: AbortSignal): Promise<readonly LakehouseTransferEntry[]> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    const rows = this.db.prepare(sql('select-transfers')).all(limit) as Array<{
      id: number
      source: string
      destination: string
      dataset_id: string
      rows: number
      transferred_at: string
    }>
    return rows.map(row => ({
      transferId: row.id,
      source: row.source,
      destination: row.destination as LakehouseTransferEntry['destination'],
      datasetId: row.dataset_id,
      rows: row.rows,
      transferredAt: row.transferred_at,
    }))
  }

  async recordUsage(tenantId: string, delta: LakehouseUsageDelta, _signal?: AbortSignal): Promise<void> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    this.db.prepare(sql('record-usage')).run(
      tenantId,
      delta.loadedTables ?? 0,
      delta.lakehouseQueries ?? 0,
    )
  }

  async usage(tenantId: string, _signal?: AbortSignal): Promise<LakehouseUsage> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    const row = this.db.prepare(sql('select-usage')).get(tenantId) as
      | { loaded_tables: number; lakehouse_queries: number }
      | undefined
    if (row === undefined) {
      return { loadedTables: 0, lakehouseQueries: 0 }
    }
    return { loadedTables: row.loaded_tables, lakehouseQueries: row.lakehouse_queries }
  }

  /** Roll back the open transaction, retaining the original failure. */
  private rollback(): void {
    try {
      this.db.exec(sql('rollback'))
    } catch {
      // The original statement failure remains actionable.
    }
  }

  /** Reject use of a closed catalog. */
  private assertLive(): void {
    if (this.closed) {
      throw new LakehouseError('the lakehouse-sqlite-catalog connection is closed', 'LAKEHOUSE_CATALOG_CLOSED')
    }
  }
}
