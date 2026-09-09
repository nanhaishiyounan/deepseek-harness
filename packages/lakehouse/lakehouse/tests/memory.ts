import type {
  CatalogStore,
  EngineTableRef,
  LakehouseTable,
  LakehouseTransferEntry,
  LakehouseTransferRecord,
  LakehouseUsage,
  LakehouseUsageDelta,
  QueryProvider,
  TabularData,
} from '../src/index.ts'

function tableKey(tenantId: string, tableName: string): string {
  return `${tenantId}\u0000${tableName}`
}

/** In-memory catalog stand-in for runtime selection and orchestration tests. */
export class MemoryCatalogStore implements CatalogStore {
  readonly id: string
  closed = false
  usageFailures = false
  dropReports = true
  readonly tables = new Map<string, LakehouseTable>()
  readonly transfers: Array<LakehouseTransferRecord & { transferId: number }> = []
  usageByTenant = new Map<string, LakehouseUsage>()

  constructor(id = 'memory-catalog') {
    this.id = id
  }

  available(): boolean {
    return !this.closed
  }

  async registerTable(table: LakehouseTable): Promise<{ replaced: boolean }> {
    const key = tableKey(table.tenantId, table.tableName)
    const replaced = this.tables.has(key)
    this.tables.set(key, table)
    return { replaced }
  }

  async listTables(tenantId: string): Promise<readonly LakehouseTable[]> {
    return [...this.tables.values()].filter(table => table.tenantId === tenantId)
  }

  async describeTable(tenantId: string, tableName: string): Promise<LakehouseTable | undefined> {
    return this.tables.get(tableKey(tenantId, tableName))
  }

  async dropTable(tenantId: string, tableName: string): Promise<boolean> {
    if (!this.dropReports) return false
    return this.tables.delete(tableKey(tenantId, tableName))
  }

  async recordTransfer(record: LakehouseTransferRecord): Promise<{ transferId: number }> {
    const transferId = this.transfers.length + 1
    this.transfers.push({ ...record, transferId })
    return { transferId }
  }

  async listTransfers(limit: number): Promise<readonly LakehouseTransferEntry[]> {
    return [...this.transfers].reverse().slice(0, Math.max(0, limit))
  }

  async recordUsage(tenantId: string, delta: LakehouseUsageDelta): Promise<void> {
    if (this.usageFailures) throw new Error('usage store offline')
    const prior = this.usageByTenant.get(tenantId) ?? { loadedTables: 0, lakehouseQueries: 0 }
    this.usageByTenant.set(tenantId, {
      loadedTables: prior.loadedTables + (delta.loadedTables ?? 0),
      lakehouseQueries: prior.lakehouseQueries + (delta.lakehouseQueries ?? 0),
    })
  }

  async usage(tenantId: string): Promise<LakehouseUsage> {
    return this.usageByTenant.get(tenantId) ?? { loadedTables: 0, lakehouseQueries: 0 }
  }

  close(): void {
    this.closed = true
  }
}

/** In-memory engine stand-in: records writes, replays rows for queries. */
export class MemoryQueryProvider implements QueryProvider {
  readonly id: string
  engineUp: boolean
  failQueries = false
  readonly parquetWrites: Array<{ location: string; tabular: TabularData }> = []
  readonly queries: Array<{ tenantId: string; sql: string; tables: readonly EngineTableRef[]; maxRows: number }> = []

  constructor(id = 'memory-engine', engineUp = true) {
    this.id = id
    this.engineUp = engineUp
  }

  available(): boolean {
    return this.engineUp
  }

  async writeParquet(location: string, tabular: TabularData): Promise<void> {
    this.parquetWrites.push({ location, tabular })
  }

  async query(
    tenantId: string,
    sql: string,
    tables: readonly EngineTableRef[],
    options: { readonly maxRows: number },
  ): Promise<{ columns: readonly { name: string; sqlType: string }[]; rows: readonly (readonly unknown[])[]; truncated: boolean }> {
    if (this.failQueries) throw new Error('engine offline')
    this.queries.push({ tenantId, sql, tables, maxRows: options.maxRows })
    const rows = tables.length === 0 ? [] : [...tables.flatMap(() => this.replayRows)]
    const truncated = rows.length > options.maxRows
    return { columns: this.replayColumns, rows: rows.slice(0, options.maxRows), truncated }
  }

  replayColumns: readonly { name: string; sqlType: string }[] = []
  replayRows: readonly (readonly unknown[])[] = []
}
