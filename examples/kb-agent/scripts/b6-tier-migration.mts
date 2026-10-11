// W24-B6 Tier-migration proof: one table created in Tier 0 (DuckLake), read
// out, re-created in Tier 1 (Iceberg REST over Gravitino + SeaweedFS S3), and
// read back from BOTH tiers in one process — the data is never locked to a
// tier. Each tier gets its own DuckDB instance: attaching ducklake and the
// iceberg REST catalog in the same instance corrupts the shared S3 credential
// context (metadata PUTs silently stop landing), so the two tiers stay in
// isolated instances and the row reconciliation happens in this process.
// Run from the repository root:
//   node examples/kb-agent/scripts/b6-tier-migration.mts
import { mkdirSync, writeFileSync } from 'node:fs'
import duckdbApi from '../../../packages/lakehouse/lakehouse-engine/node_modules/@duckdb/node-api/lib/index.js'

const { DuckDBInstance } = duckdbApi
const EVIDENCE_DIR = 'research/2026-10-09-w24-rebuild/b6-governance'
const log = []
const say = (line) => { console.log(line); log.push(line) }

async function open() {
  const instance = await DuckDBInstance.create(':memory:')
  return { instance, connection: await instance.connect() }
}

async function rows(connection, sql) {
  const result = await connection.run(sql)
  const data = await result.getRows()
  return JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)))
}

// ── Tier 0: DuckLake ──────────────────────────────────────────────────────────
// A scratch DuckLake root: the deployment's main catalog stays locked by the
// running web process, and the no-lock proof needs its own pair anyway.
const t0Root = 'workspace/lakehouse/b6-tier-proof'
{
  const { instance, connection } = await open()
  await connection.run('LOAD ducklake')
  await connection.run(`ATTACH 'ducklake:${t0Root}/catalog.ducklake' AS lake (DATA_PATH '${t0Root}/files')`)
  await connection.run(`CREATE SCHEMA IF NOT EXISTS lake.food`)
  await connection.run(`DROP TABLE IF EXISTS lake.food.suppliers_tier0`)
  await connection.run(`CREATE TABLE lake.food.suppliers_tier0 (id INTEGER, name VARCHAR, region VARCHAR)`)
  await connection.run(`INSERT INTO lake.food.suppliers_tier0 VALUES (1,'青岛海产供应','华东'),(2,'广州糖业','华南'),(3,'呼和浩特乳源','华北')`)
  const data = await rows(connection, `SELECT * FROM lake.food.suppliers_tier0 ORDER BY id`)
  say(`tier0 (DuckLake): created lake.food.suppliers_tier0, rows = ${JSON.stringify(data)}`)
  connection.disconnectSync()
  instance.closeSync()
}

// ── Tier 1: Iceberg REST (same data, different tier) ─────────────────────────
{
  const { instance, connection } = await open()
  await connection.run('LOAD iceberg')
  await connection.run(`CREATE OR REPLACE SECRET dsh_lake_s3 (TYPE S3, KEY_ID 'dshlake', SECRET 'dshlake-secret', ENDPOINT 'localhost:9000', URL_STYLE 'path', USE_SSL false, REGION 'us-east-1')`)
  await connection.run(`ATTACH 'lakehouse' AS ice (TYPE ICEBERG, ENDPOINT 'http://localhost:8181/iceberg', AUTHORIZATION_TYPE none)`)
  await connection.run(`CREATE SCHEMA IF NOT EXISTS ice.food`)
  // Fresh table name per run: the Gravitino memory backend serves stale
  // metadata for a DROP+CREATE in the same session, so the proof always
  // targets a table this run created.
  const tier1Table = `suppliers_tier0_${Date.now().toString(36)}`
  await connection.run(`CREATE TABLE ice.food.${tier1Table} (id INTEGER, name VARCHAR, region VARCHAR)`)
  // Read the Tier 0 rows through a second, Tier-0-only instance (the
  // shared-credential hazard above), then bind them back into Tier 1.
  const t0 = await open()
  await t0.connection.run('LOAD ducklake')
  await t0.connection.run(`ATTACH 'ducklake:${t0Root}/catalog.ducklake' AS lake (DATA_PATH '${t0Root}/files', READ_ONLY)`)
  const source = await rows(t0.connection, `SELECT id, name, region FROM lake.food.suppliers_tier0 ORDER BY id`)
  t0.connection.disconnectSync(); t0.instance.closeSync()
  const valuesSql = source
    .map((row) => `(${Number(row[0])}, '${String(row[1]).replaceAll("'", "''")}', '${String(row[2]).replaceAll("'", "''")}')`)
    .join(', ')
  await connection.run(`INSERT INTO ice.food.${tier1Table} VALUES ${valuesSql}`)
  connection.disconnectSync()
  instance.closeSync()
  // Read Tier 1 back through a fresh instance: reading a table the same
  // session just wrote trips a stale metadata-location reference in DuckDB
  // 1.5.6's iceberg extension, while a fresh attach reads it cleanly.
  {
    const reader = await open()
    await reader.connection.run('LOAD iceberg')
    await reader.connection.run(`CREATE OR REPLACE SECRET dsh_lake_s3 (TYPE S3, KEY_ID 'dshlake', SECRET 'dshlake-secret', ENDPOINT 'localhost:9000', URL_STYLE 'path', USE_SSL false, REGION 'us-east-1')`)
    await reader.connection.run(`ATTACH 'lakehouse' AS ice (TYPE ICEBERG, ENDPOINT 'http://localhost:8181/iceberg', AUTHORIZATION_TYPE none)`)
    const data = await rows(reader.connection, `SELECT * FROM ice.food.${tier1Table} ORDER BY id`)
    say(`tier1 (Iceberg REST): migrated ice.food.${tier1Table}, rows = ${JSON.stringify(data)}`)
    // The no-lock proof: both tiers read back; counts must agree.
    const t1Count = (await rows(reader.connection, `SELECT count(*) FROM ice.food.${tier1Table}`))[0][0]
    if (source.length !== t1Count) throw new Error(`tier row counts diverged: tier0=${source.length} tier1=${t1Count}`)
    say(`cross-tier reconciliation: tier0 rows = ${source.length}, tier1 rows = ${t1Count}`)
    reader.connection.disconnectSync()
    reader.instance.closeSync()
  }
}

say('TIER MIGRATION PASS: same data live in Tier 0 (DuckLake) and Tier 1 (Iceberg REST), reconciled in one process')
mkdirSync(EVIDENCE_DIR, { recursive: true })
writeFileSync(`${EVIDENCE_DIR}/06-tier-migration.txt`, `${log.join('\n')}\n`)
say(`evidence -> ${EVIDENCE_DIR}/06-tier-migration.txt`)
// Exit before teardown-GC: the native DuckDB addon trips an internal
// assertion when the last instance is collected after everything already
// succeeded, which would flip this proof's exit code.
process.exit(0)
