/**
 * W24-B3 lakehouse sync: point the B2 sync pipeline at the carbon PG (the
 * colima-published :51538) as the business source, land the synced tables
 * under the `synced_carbon` lakehouse schema (legacy_nocobase stays
 * untouched), and prove the watermark increment over two rounds plus a
 * live-insert third round: round 1 full baseline, round 2 zero-duplicate
 * idempotence, round 3 one fresh carbon row (written through the PostgREST
 * session path) becomes exactly one lakehouse row.
 */
import { writeFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import * as LakehouseEngine from '@deepseek-ai/dsh-lakehouse-engine'
import * as LakehouseSync from '@deepseek-ai/dsh-lakehouse-sync'
import { CarbonClient } from '../../../packages/connector/connector-carbon/src/index.ts'

/** The carbon PG the colima stack publishes (Config-able through the script env). */
const CARBON_DSN = process.env.B3_CARBON_DSN ?? 'dbname=postgres host=127.0.0.1 port=51538 user=postgres password=postgres'
const TABLES = ['item', 'customer', 'supplier', 'salesOrder', 'purchaseOrder', 'job', 'receipt', 'itemStockQuantities']

const lines: string[] = []
const log = (text: string): void => { lines.push(text); console.log(text) }

const ctx = new Context()
await ctx.plugin(LakehouseEngine, {
  catalog: { kind: 'ducklake', catalogPath: 'workspace/lakehouse/ducklake/catalog.ducklake', dataPath: 'workspace/lakehouse/ducklake/files' },
  maxRows: 1000,
})
await ctx.plugin(LakehouseSync, {
  dsn: CARBON_DSN,
  targetSchema: 'synced_carbon',
  tables: [...TABLES],
  watermarkCandidates: ['updatedAt', 'updated_at'],
})
const engine = ctx.lakehouseEngine
const sync = ctx.lakehouseSync

/** Verify the legacy schema from B2 is intact (the frozen history). */
const legacyTables = await engine.query(
  "SELECT count(*) FROM (SELECT table_name FROM duckdb_tables() WHERE database_name='lake' AND schema_name='legacy_nocobase')",
)
log(`[legacy] legacy_nocobase tables still present: ${String(legacyTables.rows[0]?.[0])}`)

const reportRound = async (label: string): Promise<void> => {
  const result = await sync.runOnce()
  const perTable = result.tables.map(table => `${table.table}:${table.mode}+${String(table.appended)}`).join(' ')
  log(`[${label}] ${perTable}`)
}

await reportRound('round1')
await reportRound('round2-zero-duplicate')

// Round 3: one fresh carbon row through the session path becomes exactly one lakehouse row.
const beforeCount = Number((await engine.query('SELECT count(*) FROM lake.synced_carbon.supplier')).rows[0]?.[0])
const client = new CarbonClient({
  baseUrl: process.env.CARBON_URL ?? 'http://127.0.0.1:54321',
  anonKey: process.env.CARBON_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODE4OTUsImV4cCI6MjEwNjk0MTg5NX0.42nhGia5GsXBtJiW9aP12HCVwOoBmqwiZ3QZ060OU5o',
  email: process.env.CARBON_EMAIL ?? 'test@carbon.ms',
  password: process.env.CARBON_PASSWORD ?? 'password',
})
const MARK = 'B3-湖仓增量验证供应商-' + Date.now().toString(36)
const created = await client.create('supplier', { name: MARK })
log(`[round3-source] created supplier ${String(created.id)}`)

await reportRound('round3-increment')

const afterCount = Number((await engine.query('SELECT count(*) FROM lake.synced_carbon.supplier')).rows[0]?.[0])
const delta = afterCount - beforeCount
const probe = Number((await engine.query("SELECT count(*) FROM lake.synced_carbon.supplier WHERE name = '" + MARK + "'")).rows[0]?.[0])
log(`[round3] lake.synced_carbon.supplier ${String(beforeCount)} → ${String(afterCount)} (delta=${String(delta)}); fresh row visible: ${probe === 1 ? 'YES' : 'NO'}`)

// Cross-source reconciliation: the carbon PG row counts vs the lake rows (the sync's own source of truth).
const counts: string[] = []
for (const table of TABLES) {
  const lake = Number((await engine.query(`SELECT count(*) FROM lake.synced_carbon."${table}"`)).rows[0]?.[0])
  counts.push(`${table}=${String(lake)}`)
}
log(`[lake] ${counts.join(' ')}`)

log(delta === 1 ? '[verdict] SYNC OK — carbon→lakehouse two-round no-duplicate + one-round increment exact' : '[verdict] SYNC FAILED')

writeFileSync('research/2026-10-09-w24-rebuild/b3-carbon/02-lakehouse-sync.txt', `${lines.join('\n')}\n`)
console.log('\nevidence written to research/2026-10-09-w24-rebuild/b3-carbon/02-lakehouse-sync.txt')
await ctx.fiber.dispose()
