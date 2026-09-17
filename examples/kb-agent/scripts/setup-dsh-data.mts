/**
 * DSH-side data initialization for the kb-agent example: the data plane the
 * workbench pages read on a fresh world (the three workspace SQLite files
 * are gitignored runtime state nobody else recreates). Orchestrates, in
 * order: connector-files provisioning (mkdir + the git-tracked sample
 * assets), the expert roster, the historical orders, the lakehouse seed
 * tables, the market catalog, the knowledge-graph build, and the KB corpus
 * ingestion. kg-build always runs
 * its three deterministic legs (NocoBase mappings + lakehouse catalog +
 * connector discovery); its corpus LLM leg grades itself by
 * MINIMAX_API_KEY. The KB corpus step is skipped loudly without the key —
 * embedding is its whole point, a text-only rerun would only burn time.
 *
 * Watermarks: connector-files, the expert roster, the historical orders,
 * the lakehouse catalog, and the KB corpus probe backend/disk/SQLite state
 * and replay their owning script only when the probe misses, so a second
 * run reports kept everywhere. The market seed
 * replays unconditionally — its own by-title probe prints assetsSkipped —
 * and kg-build replays unconditionally — its per-scope content-hash
 * watermarks make an unchanged rerun all-skip with zero count drift.
 *
 * Wired into setup-nocobase.mts "all" after the NocoBase module replays and
 * before "verify"; also runnable standalone (NocoBase must be up — the
 * market and kg NocoBase legs read it; credentials resolve from ambient env
 * or the repository root .env like every other example script).
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/setup-dsh-data.mts
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'
import { loadCorpusManifest } from '@deepseek-ai/dsh-kg-build'
import { resolveEnv } from './resolve-env.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const workspaceRoot = join(repoRoot, 'examples/kb-agent/workspace')
const connectorFilesRoot = join(workspaceRoot, 'data/connector-files')

/** The git-tracked sample assets B1 ships inside connector-files. */
const SAMPLE_ASSETS = ['sample-export-compliance.md', 'sample-shipment-events.json', 'sample-supplier-prices.csv'] as const

/** The lakehouse tables seed-lakehouse.mts owns (keep in sync with its header). */
const LAKEHOUSE_TABLES = ['ingredient_prices_monthly', 'import_export_monthly', 'cold_chain_rates'] as const

/**
 * The corpus directories the KB corpus step owns, from the versioned
 * kb-corpus.yml manifest every corpus consumer (seed-kb, this probe, and the
 * kg-build corpus leg) reads — no second list to keep in sync.
 */
const KB_CORPUS_DIRS: readonly string[] = loadCorpusManifest(
  join(repoRoot, 'examples/kb-agent/kb-corpus.yml'),
).dirs.map(entry => `workspace/data/${entry.dir}`)

/** Replay one sibling script as a child, failing loud on a non-zero exit. */
function replay(script: string, args: readonly string[] = []): void {
  console.log(`setup-dsh-data: replaying ${script}${args.length === 0 ? '' : ` ${args.join(' ')}`}`)
  const child = spawnSync(process.execPath, ['--import', 'tsx/esm', join(repoRoot, 'examples/kb-agent/scripts', script), ...args], {
    stdio: 'inherit',
    cwd: repoRoot,
    env: process.env,
  })
  if (child.status !== 0) {
    throw new Error(`${script} exited with ${String(child.status)} — inspect its output above`)
  }
}

/** One read-only SQLite probe; `undefined` when the file is absent or the query misses (a replay follows). */
function sqliteScalar<T>(path: string, sql: string, ...params: readonly unknown[]): T | undefined {
  try {
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined
      return row === undefined ? undefined : (Object.values(row)[0] as T)
    } finally {
      db.close()
    }
  } catch {
    // A missing file or an unknown table/column both mean "not seeded yet".
    return undefined
  }
}

/** connector-files: the directory must exist (B1's provider also self-heals); the sample assets are kept when tracked. */
function ensureConnectorFiles(): void {
  mkdirSync(connectorFilesRoot, { recursive: true })
  const missing = SAMPLE_ASSETS.filter(asset => !existsSync(join(connectorFilesRoot, asset)))
  if (missing.length === 0) {
    console.log(`setup-dsh-data: connector-files present with ${String(SAMPLE_ASSETS.length)} sample assets (kept)`)
    return
  }
  // The market works without file assets; the samples are git-tracked, so
  // name the restore command instead of failing the chain over them.
  console.log(`setup-dsh-data: connector-files sample assets missing (${missing.join(', ')}); restore with "git checkout -- examples/kb-agent/workspace/data/connector-files"`)
}

/** Lakehouse: kept when the catalog carries every seeded table for the tenant. */
function ensureLakehouse(): void {
  const catalog = join(workspaceRoot, 'lakehouse-catalog.sqlite')
  const known = sqliteScalar<number>(catalog, 'SELECT COUNT(*) AS c FROM lakehouse_tables WHERE tenant_id = ? AND table_name IN (?, ?, ?)', 'demo-food-co', ...LAKEHOUSE_TABLES)
  if (known === LAKEHOUSE_TABLES.length) {
    console.log(`setup-dsh-data: lakehouse tables ${LAKEHOUSE_TABLES.join(', ')} registered (kept)`)
    return
  }
  replay('seed-lakehouse.mts')
}

/** NocoBase REST credentials, resolved the way every sibling script reads them. */
function nocobaseCredentials(): { baseUrl: string; token: string } {
  const baseUrl = resolveEnv('NOCOBASE_BASE_URL')
  const token = resolveEnv('NOCOBASE_API_KEY')
  if (baseUrl === undefined || token === undefined) {
    throw new Error('NOCOBASE_BASE_URL/NOCOBASE_API_KEY unresolved — the NocoBase-backed steps need the backend (ambient env or the repository root .env, as every NocoBase-backed script here)')
  }
  return { baseUrl, token }
}

/**
 * Expert roster: kept when every roster expert name already sits in the
 * NocoBase `experts` collection (the seeder itself is idempotent by name, so
 * the replay also settles a partial world and sweeps e2e/demo residue rows).
 */
async function ensureExpertsRoster(): Promise<void> {
  const { baseUrl, token } = nocobaseCredentials()
  const roster = JSON.parse(readFileSync(join(workspaceRoot, 'data/experts/roster-batch5.json'), 'utf8')) as {
    experts: ReadonlyArray<{ name: string }>
  }
  const existing = await new NocoBaseClient({ baseUrl, token }).list<{ name: string }>('experts', { page: 1, pageSize: 500 })
  const names = new Set(existing.rows.map(row => row.name))
  const missing = roster.experts.filter(row => !names.has(row.name))
  if (missing.length === 0) {
    console.log(`setup-dsh-data: expert roster present (${String(roster.experts.length)} experts, kept)`)
    return
  }
  replay('seed-experts-roster.mts')
}

/**
 * Historical orders: kept when the seeder's `ORD-B5-` rows are all present
 * (kg-build's orders leg asserts a non-empty collection, and the orders
 * collection is otherwise empty on a reset world — the seed is what gives
 * the chain its demo-grade history; the seeder itself is idempotent by the
 * order-number prefix and sweeps its own approval-workflow residue).
 */
async function ensureHistoricalOrders(): Promise<void> {
  const { baseUrl, token } = nocobaseCredentials()
  const existing = await new NocoBaseClient({ baseUrl, token }).list<{ orderNo: string }>('orders', { page: 1, pageSize: 500 })
  const seeded = existing.rows.filter(row => row.orderNo.startsWith('ORD-B5-')).length
  if (seeded >= 24) {
    console.log(`setup-dsh-data: historical orders present (${String(seeded)} ORD-B5- rows, kept)`)
    return
  }
  replay('seed-orders.mts')
}

/** Market: the seeder is idempotent by title, so replay and let its report speak. */
function ensureMarket(): void {
  replay('seed-market.mts')
}

/** KG build: always replayed — content-hash watermarks keep an unchanged rerun all-skip. */
function ensureKgGraph(): void {
  const withKey = resolveEnv('MINIMAX_API_KEY') !== undefined
  console.log(`setup-dsh-data: kg-build ${withKey ? 'with MINIMAX_API_KEY — corpus extraction leg ON' : 'without MINIMAX_API_KEY — deterministic legs only, corpus leg skipped'}`)
  // --no-incremental drops the acceptance script's throwaway-order scenario:
  // its node survives the reconcile, so running it on every replay would
  // break the chain's zero-count-drift idempotency contract.
  replay('kg-build.mts', ['--no-incremental'])
}

/** KB corpus: kept when every owned document is already ingested for the tenant. */
function ensureKbCorpus(): void {
  if (resolveEnv('MINIMAX_API_KEY') === undefined) {
    console.log('setup-dsh-data: seed-kb skipped (no MINIMAX_API_KEY — corpus ingestion needs real embo-01 embeddings)')
    return
  }
  const kb = join(workspaceRoot, 'kb.sqlite')
  const wanted: string[] = []
  for (const dir of KB_CORPUS_DIRS) {
    const onDisk = join(workspaceRoot, dir.slice('workspace/'.length))
    if (!existsSync(onDisk)) throw new Error(`corpus directory ${dir} not found under the workspace`)
    for (const file of readdirSync(onDisk).sort()) {
      if (file.endsWith('.md')) wanted.push(`${dir}/${file}`)
    }
  }
  const placeholders = wanted.map(() => '?').join(', ')
  const ingested = sqliteScalar<number>(kb, `SELECT COUNT(*) AS c FROM documents WHERE tenant_id = ? AND source_path IN (${placeholders})`, 'demo-food-co', ...wanted)
  if (ingested === wanted.length) {
    console.log(`setup-dsh-data: kb corpus already ingested (${String(wanted.length)} documents, kept)`)
    return
  }
  replay('seed-kb.mts')
}

// The market and kg NocoBase legs read credentials; ambient wins, the
// repository root .env backs them up (the same fallback every sibling uses).
try {
  process.loadEnvFile(join(repoRoot, '.env'))
} catch {
  // No .env: the NocoBase-backed steps below fail loud with their own message.
}

ensureConnectorFiles()
await ensureExpertsRoster()
await ensureHistoricalOrders()
ensureLakehouse()
ensureMarket()
ensureKgGraph()
ensureKbCorpus()
console.log('setup-dsh-data: done')
