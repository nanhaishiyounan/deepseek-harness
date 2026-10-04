/**
 * W6-B1 (G7): the scheduled lakehouse transfer — the NocoBase business tables
 * land as full-replace Parquet snapshots (`nb_<collection>`) through the same
 * `lakehouse.load` seam seed-lakehouse rides. Until now the transfer existed
 * only as the PC connector page's manual button, so the agent's statistics
 * answers (the "query the lakehouse first" discipline) drifted arbitrarily
 * far behind live business data. The engine's nightly timer and
 * `POST /run-nightly` schedule this module's {@link runNocobaseTransfer};
 * same-table reloads replace, so re-runs and restart replays are idempotent.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/w6b1-lakehouse-transfer.mts
 */
import { Context } from '@deepseek-ai/cordis'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseSqliteCatalog from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as LakehouseDuckDb from '@deepseek-ai/dsh-lakehouse-duckdb'
import type { TabularData } from '@deepseek-ai/dsh-lakehouse'
import { dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'

const tenant = process.env.DSH_KB_TENANT ?? 'demo-food-co'

/** The business tables the snapshot covers — the statistics answers' sources. */
const SOURCE_COLLECTIONS: readonly string[] = [
  'pur_orders', 'pur_order_lines', 'pur_requests',
  'so_orders', 'so_order_lines',
  'wms_receipts', 'wms_stock', 'wms_lots',
  'qm_inspections',
  'mfg_orders', 'mfg_job_reports',
  'hub_inv_products',
  'crm_payments',
]

/** SQL type one row cell's JS kind maps onto (NULL stays NULL). */
function sqlTypeOf(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'DOUBLE'
  if (typeof value === 'boolean') return 'BOOLEAN'
  return 'TEXT'
}

/**
 * One cell's Parquet-safe value: JSON-object cells (NocoBase json columns
 * like approver_map or preview_data) serialize to their JSON text — the
 * DuckDB writer only takes scalars, and analysis queries read the text.
 */
function cellOf(value: unknown): unknown {
  if (value !== null && value !== undefined && typeof value === 'object') {
    return JSON.stringify(value)
  }
  return value ?? null
}

/** Read one collection's full row set through the paged REST surface. */
async function readAll(token: string, collection: string): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = []
  const pageSize = 200
  for (let page = 1; page < 200; page += 1) {
    const batch = await dataOf(token, 'GET', `/api/${collection}:list?page=${String(page)}&pageSize=${String(pageSize)}&sort=id`) as Array<Record<string, unknown>> | null
    if (!Array.isArray(batch) || batch.length === 0) break
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

/** Project rows onto tabular data: the first row fixes the column set. */
function tabularOf(collection: string, rows: Array<Record<string, unknown>>): TabularData | undefined {
  if (rows.length === 0) return undefined
  const names = Object.keys(rows[0] as Record<string, unknown>)
  const columns = names.map(name => ({ name, sqlType: sqlTypeOf(cellOf((rows[0] as Record<string, unknown>)[name])) }))
  return { columns, rows: rows.map(row => names.map(name => cellOf(row[name]))) }
}

/**
 * Run one full transfer pass: read every source collection, load it as the
 * `nb_<collection>` lakehouse table (full replace), and record the transfer
 * trail row the connector page's delivery timeline reads.
 * @param token - a root API token (the nightly leg passes its own).
 * @returns the one-line outcome summary.
 */
export async function runNocobaseTransfer(token?: string): Promise<string> {
  const auth = token ?? await signInWithRetry()
  const ctx = new Context()
  try {
    await ctx.plugin(LakehouseRuntime, { dataRoot: 'examples/kb-agent/workspace/lakehouse' })
    await ctx.plugin(LakehouseSqliteCatalog, { path: 'examples/kb-agent/workspace/lakehouse-catalog.sqlite' })
    await ctx.plugin(LakehouseDuckDb, {})
    const lakehouse = ctx.get('lakehouse')
    if (lakehouse === undefined) throw new Error('lakehouse service did not compose')
    let loaded = 0
    let skipped = 0
    let totalRows = 0
    const transferredAt = new Date().toISOString()
    for (const collection of SOURCE_COLLECTIONS) {
      const rows = await readAll(auth, collection)
      const tabular = tabularOf(collection, rows)
      if (tabular === undefined) {
        skipped += 1
        continue
      }
      const tableName = `nb_${collection}`
      const result = await lakehouse.load({
        tenantId: tenant,
        tableName,
        tabular,
        provenance: { provider: 'nocobase-transfer', collectedSource: `scripts/w6b1-lakehouse-transfer.mts (${collection} 全量快照)` },
      })
      await lakehouse.recordTransfer({
        source: 'nocobase-transfer', destination: 'lakehouse', datasetId: tableName,
        rows: result.table.rowCount, transferredAt,
      })
      loaded += 1
      totalRows += result.table.rowCount
    }
    return `tables=${String(loaded)} skipped=${String(skipped)} rows=${String(totalRows)}`
  } finally {
    await ctx.fiber.dispose()
  }
}

const invokedDirectly = process.argv[1] !== undefined && process.argv[1].endsWith('w6b1-lakehouse-transfer.mts')
if (invokedDirectly) {
  console.log(`w6b1-lakehouse-transfer: ${await runNocobaseTransfer()}`)
}
