/**
 * W24-B2 acceptance driver: the REAL lakehouse end-to-end run against the
 * real DuckLake catalog (workspace/lakehouse/ducklake), the real nocobase
 * PostgreSQL source, and the B0 legacy Parquet export. Emits the evidence
 * files under research/2026-10-09-w24-rebuild/b2-lakehouse/.
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm research/2026-10-09-w24-rebuild/b2-lakehouse/b2-acceptance.mts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as LakehouseEngine from '@deepseek-ai/dsh-lakehouse-engine'
import * as LakehouseSync from '@deepseek-ai/dsh-lakehouse-sync'

const EVIDENCE_DIR = 'research/2026-10-09-w24-rebuild/b2-lakehouse'
const PG_DSN = process.env.DSH_LAKEHOUSE_SYNC_DSN ?? 'dbname=nocobase host=127.0.0.1 port=5432 user=nocobase'

/** One section of the evidence log. */
const lines: string[] = []
const log = (text: string): void => {
  lines.push(text)
  console.log(text)
}

async function main(): Promise<void> {
  const ctx = await createBoot()
  const engine = ctx.lakehouseEngine
  const sync = ctx.lakehouseSync
  const version = await engine.query('SELECT version()')
  log(`# W24-B2 acceptance run — ${new Date().toISOString()}`)
  log(`# engine: DuckDB ${String(version.rows[0]?.[0])}`)
  log('')

  // ── 1. Legacy ingest: 138 tables land, counts reconcile ────────────────────
  const ingest = await sync.ingestLegacy()
  log(`[ingest] schema=${ingest.schema} tables=${String(ingest.tables.length)}`)
  const parquetLanded = ingest.tables.filter(entry => entry.source === 'parquet').length
  const schemaOnly = ingest.tables.filter(entry => entry.source === 'schema-only').length
  log(`[ingest] parquet=${String(parquetLanded)} schema-only=${String(schemaOnly)}`)

  // Reconcile against the B0 rowcount table (138 rows, pg_rows column).
  const csv = readFileSync('workspace/lakehouse/legacy/rowcount-reconciliation.csv', 'utf8')
  const expected = new Map(csv.trim().split('\n').slice(1).map(row => {
    const [table, pgRows] = row.split(',')
    return [table, Number(pgRows)] as const
  }))
  log(`[reconcile] expected tables=${String(expected.size)}`)
  let mismatch = 0
  let missing = 0
  for (const [table, pgRows] of expected) {
    const landed = ingest.tables.find(entry => entry.table === table)
    if (landed === undefined) {
      missing += 1
      log(`[reconcile] MISSING ${table}`)
      continue
    }
    if (landed.rowCount !== pgRows) {
      mismatch += 1
      log(`[reconcile] MISMATCH ${table}: lake=${String(landed.rowCount)} pg=${String(pgRows)}`)
    }
  }
  const extra = ingest.tables.filter(entry => !expected.has(entry.table))
  for (const entry of extra) log(`[reconcile] EXTRA ${entry.table}`)
  log(`[reconcile] missing=${String(missing)} mismatch=${String(mismatch)} extra=${String(extra.length)} → ${missing === 0 && mismatch === 0 && extra.length === 0 ? 'ALL OK' : 'FAILED'}`)
  log('')

  // ── 2. The model-facing listing sees the 138 legacy tables ─────────────────
  const listed = await engine.listTables()
  const legacyListed = listed.filter(summary => summary.schema === 'legacy_nocobase')
  const totalRows = legacyListed.reduce((sum, summary) => sum + summary.rowCount, 0)
  log(`[list] lakehouse tables=${String(listed.length)} legacy_nocobase=${String(legacyListed.length)} legacyRows=${String(totalRows)}`)
  log('')

  // ── 3. Real aggregate query over the sales orders (so_order_lines) ─────────
  const soCount = await engine.query('SELECT count(*) AS n FROM lake.legacy_nocobase.so_order_lines')
  const soAgg = await engine.query(
    'SELECT sum(qty) AS total_qty FROM lake.legacy_nocobase.so_order_lines',
  )
  log(`[query] so_order_lines count=${String(soCount.rows[0]?.[0])} sum(qty)=${String(soAgg.rows[0]?.[0])}`)
  const soOrders = await engine.query('SELECT count(*) FROM lake.legacy_nocobase.so_orders')
  log(`[query] so_orders count=${String(soOrders.rows[0]?.[0])}`)
  const schema = await engine.describeTable('legacy_nocobase', 'so_order_lines')
  log(`[schema] so_order_lines columns=${schema.map(c => `${c.name}:${c.sqlType}`).join(', ')}`)
  log('')

  // ── 4. Read-only defense: every hostile statement is rejected ─────────────
  const hostile: ReadonlyArray<readonly [string, string]> = [
    ['INSERT', "INSERT INTO lake.legacy_nocobase.so_orders VALUES (999)"],
    ['UPDATE', "UPDATE lake.legacy_nocobase.so_orders SET id = 999 WHERE id = 1"],
    ['DELETE', 'DELETE FROM lake.legacy_nocobase.so_orders'],
    ['DROP', 'DROP TABLE lake.legacy_nocobase.so_orders'],
    ['ATTACH', "ATTACH 'ducklake:/tmp/evil.ducklake' AS evil"],
    ['multi-statement', 'SELECT 1; DROP TABLE lake.legacy_nocobase.so_orders'],
  ]
  let defenseOk = true
  for (const [label, sql] of hostile) {
    try {
      await engine.query(sql)
      log(`[defense] ${label} UNEXPECTEDLY ALLOWED — FAILED`)
      defenseOk = false
    } catch (error) {
      log(`[defense] ${label} rejected: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
    }
  }
  const survivors = await engine.query('SELECT count(*) FROM lake.legacy_nocobase.so_orders')
  log(`[defense] after the volley, so_orders rows still=${String(survivors.rows[0]?.[0])} → ${defenseOk ? 'DEFENSE OK' : 'DEFENSE FAILED'}`)
  log('')

  // ── 5. Watermark sync: two rounds, then one source insert ──────────────────
  const first = await sync.runOnce()
  const firstRow = first.tables[0]
  log(`[sync#1] table=${firstRow?.table} mode=${firstRow?.mode} appended=${String(firstRow?.appended)} watermark=${firstRow?.watermark ?? 'null'}`)
  const afterFirst = await engine.query('SELECT count(*) FROM lake.synced_nocobase.wfl_mobile_work')
  const second = await sync.runOnce()
  const secondRow = second.tables[0]
  log(`[sync#2] table=${secondRow?.table} mode=${secondRow?.mode} appended=${String(secondRow?.appended)} watermark=${secondRow?.watermark ?? 'null'}`)
  const afterSecond = await engine.query('SELECT count(*) FROM lake.synced_nocobase.wfl_mobile_work')
  log(`[sync] counts: round1=${String(afterFirst.rows[0]?.[0])} round2=${String(afterSecond.rows[0]?.[0])} → ${afterFirst.rows[0]?.[0] === afterSecond.rows[0]?.[0] && secondRow?.appended === 0 ? 'NO DUPLICATES OK' : 'CHECK'}`)

  const finalListing = await engine.listTables()
  log(`[list] final lakehouse tables=${String(finalListing.length)} (legacy ${String(finalListing.filter(s => s.schema === 'legacy_nocobase').length)} + synced ${String(finalListing.filter(s => s.schema === 'synced_nocobase').length)})`)

  await ctx.fiber.dispose()
  writeFileSync(resolve(EVIDENCE_DIR, '02-acceptance-run.txt'), `${lines.join('\n')}\n`)
  console.log(`\nevidence written to ${EVIDENCE_DIR}/02-acceptance-run.txt`)
}

async function createBoot(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LakehouseEngine, {
    catalog: { kind: 'ducklake', catalogPath: 'workspace/lakehouse/ducklake/catalog.ducklake', dataPath: 'workspace/lakehouse/ducklake/files' },
    maxRows: 1000,
  })
  await ctx.plugin(LakehouseSync, {
    dsn: PG_DSN,
    tables: ['wfl_mobile_work'],
    watermarkCandidates: ['updatedAt', 'updated_at'],
    legacyIngest: {
      enabled: true,
      parquetDir: 'workspace/lakehouse/legacy',
      targetSchema: 'legacy_nocobase',
      sourceDsn: PG_DSN,
    },
  })
  return ctx
}

void main().catch((error: unknown) => {
  console.error('acceptance run failed:', error)
  process.exitCode = 1
})
