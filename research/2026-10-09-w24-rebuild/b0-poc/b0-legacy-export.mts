/**
 * W24-B0 task 2: full NocoBase business-table export. Generalizes the verified
 * w6b1-lakehouse-transfer.mts pipeline (paged REST read → lakehouse.load
 * full-replace Parquet) from the 13-table statistics snapshot to every
 * business table the live PG schema actually holds — the B2/B3/B5 legacy-data
 * source of record and the B7 decommission safety net.
 *
 * Table inventory is NOT hardcoded: the script reads the physical inventory
 * dumped from PG (nb-all-tables.txt, 258 tables) and selects business tables
 * by prefix whitelist plus the standalone order/alert tables; NocoBase
 * platform tables stay out (the pg_dump fallback owns those).
 *
 * Two hardening points over w6b1's scalar probe:
 *   - column types scan every row: millisecond-epoch cells overflow Parquet
 *     INT32, so out-of-int32 integers widen the column to DOUBLE (exact to
 *     53 bits);
 *   - tables the REST surface does not expose (audit/config views) fall back
 *     to a direct PG `json_agg` read so the Parquet set still covers the
 *     whole business schema.
 *
 * Output:
 *   workspace/lakehouse/legacy/<table>.parquet   (tenant "legacy")
 *   research/2026-10-09-w24-rebuild/b0-poc/b0-export-rowcounts.json
 *
 * Usage (repo root): node --import tsx/esm research/2026-10-09-w24-rebuild/b0-poc/b0-legacy-export.mts
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseSqliteCatalog from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as LakehouseDuckDb from '@deepseek-ai/dsh-lakehouse-duckdb'
import type { TabularData } from '@deepseek-ai/dsh-lakehouse'
import { dataOf, signInWithRetry } from '../../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts'

const INVENTORY = 'research/2026-10-09-w24-rebuild/b0-poc/nb-all-tables.txt'
const OUT_JSON = 'research/2026-10-09-w24-rebuild/b0-poc/b0-export-rowcounts.json'

/** Business-domain prefixes that own the export scope; platform tables ride the pg_dump fallback instead. */
const BUSINESS_PREFIXES = [
  'hub_', 'crm_', 'mfg_', 'pur_', 'qm_', 'srm_', 'wms_', 'wfl_', 'mps_', 'mrp_',
  'eam_', 'fin_', 'recall_', 'aps_', 'so_',
] as const

/** Standalone business tables without a whitelisted prefix. */
const BUSINESS_STANDALONE = [
  'expert_services', 'experts', 'orders', 'orders_deliverables',
  'alert_rules', 'kpi_snapshots',
] as const

function isBusinessTable(name: string): boolean {
  return BUSINESS_PREFIXES.some(p => name.startsWith(p)) || (BUSINESS_STANDALONE as readonly string[]).includes(name)
}

function cellOf(value: unknown): unknown {
  if (value !== null && value !== undefined && typeof value === 'object') return JSON.stringify(value)
  return value ?? null
}

/** One column's SQL type scanned across every row (see module doc: INT32 overflow hardening). */
function columnTypeOf(values: readonly unknown[]): string {
  let sawInt = false
  let sawFloat = false
  let sawBool = false
  let sawStr = false
  for (const raw of values) {
    const value = cellOf(raw)
    if (value === null) continue
    if (typeof value === 'boolean') sawBool = true
    else if (typeof value === 'string') sawStr = true
    else if (typeof value === 'number') {
      if (Number.isInteger(value) && Math.abs(value) <= 2_147_483_647) sawInt = true
      else sawFloat = true
    }
  }
  if (sawStr) return 'TEXT'
  if (sawBool && !sawInt && !sawFloat) return 'BOOLEAN'
  if (sawInt && !sawFloat) return 'INTEGER'
  if (sawInt || sawFloat) return 'DOUBLE'
  return 'TEXT'
}

async function readAll(token: string, collection: string): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = []
  const pageSize = 500
  for (let page = 1; page < 200; page += 1) {
    const batch = await dataOf(token, 'GET', `/api/${collection}:list?page=${String(page)}&pageSize=${String(pageSize)}&sort=id`) as Array<Record<string, unknown>> | null
    if (!Array.isArray(batch) || batch.length === 0) break
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

/** PG fallback leg for tables the REST surface does not expose (audit/config views): one json_agg read. */
function readFromPg(table: string): Array<Record<string, unknown>> {
  const out = execFileSync('psql', [
    '-h', process.env.NB_PGHOST ?? 'localhost',
    '-U', process.env.NB_PGUSER ?? 'nocobase',
    '-d', process.env.NB_PGDATABASE ?? 'nocobase',
    '-Atc', `select coalesce(json_agg(t), '[]'::json) from (select * from "${table}") t`,
  ], { env: { ...process.env, PGPASSWORD: process.env.NB_PGPASSWORD ?? 'nocobase' }, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' })
  return JSON.parse(out) as Array<Record<string, unknown>>
}

function tabularOf(rows: Array<Record<string, unknown>>): TabularData | undefined {
  if (rows.length === 0) return undefined
  const names = Object.keys(rows[0] as Record<string, unknown>)
  const columns = names.map(name => ({ name, sqlType: columnTypeOf(rows.map(row => row[name])) }))
  return { columns, rows: rows.map(row => names.map(name => cellOf(row[name]))) }
}

async function main(): Promise<void> {
  const all = readFileSync(INVENTORY, 'utf8').split('\n').map(s => s.trim()).filter(s => s.length > 0)
  const business = all.filter(isBusinessTable)
  console.log(`inventory=${String(all.length)} business=${String(business.length)}`)

  const token = await signInWithRetry()
  const ctx = new Context()
  const counts: Record<string, number> = {}
  const skipped: Array<{ table: string, reason: string }> = []
  const failed: Array<{ table: string, error: string }> = []
  const pgFallback: string[] = []
  const startedAt = new Date().toISOString()
  try {
    await ctx.plugin(LakehouseRuntime, { dataRoot: 'workspace/lakehouse' })
    await ctx.plugin(LakehouseSqliteCatalog, { path: 'workspace/lakehouse/legacy/legacy-catalog.sqlite' })
    await ctx.plugin(LakehouseDuckDb, {})
    const lakehouse = ctx.get('lakehouse')
    if (lakehouse === undefined) throw new Error('lakehouse service did not compose')
    const transferredAt = new Date().toISOString()
    for (const table of business) {
      let source = 'rest'
      try {
        let rows: Array<Record<string, unknown>>
        try {
          rows = await readAll(token, table)
        } catch (restError) {
          source = 'pg-direct'
          console.warn(`REST miss on ${table} (${String(restError).slice(0, 60)}), falling back to PG json_agg`)
          rows = readFromPg(table)
          pgFallback.push(table)
        }
        const tabular = tabularOf(rows)
        if (tabular === undefined) {
          skipped.push({ table, reason: `0 rows via ${source}` })
          counts[table] = 0
          continue
        }
        const result = await lakehouse.load({
          tenantId: 'legacy',
          tableName: table,
          tabular,
          provenance: { provider: 'nocobase-legacy-export', collectedSource: `b0-legacy-export.mts (${table} 全量快照, source=${source})` },
        })
        await lakehouse.recordTransfer({
          source: 'nocobase-legacy-export', destination: 'lakehouse', datasetId: table,
          rows: result.table.rowCount, transferredAt,
        })
        counts[table] = result.table.rowCount
        console.log(`loaded ${table} rows=${String(result.table.rowCount)} source=${source}`)
      } catch (error) {
        failed.push({ table, error: String(error) })
        console.error(`FAILED ${table}: ${String(error)}`)
      }
    }
  } finally {
    await ctx.fiber.dispose()
  }
  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    inventoryTotal: all.length,
    businessTotal: business.length,
    loaded: Object.keys(counts).length,
    pgFallback,
    skipped,
    failed,
    counts,
  }
  writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`)
  console.log(`summary: loaded=${String(Object.keys(counts).length)} skipped=${String(skipped.length)} failed=${String(failed.length)} -> ${OUT_JSON}`)
  if (failed.length > 0) process.exitCode = 1
}

await main()
