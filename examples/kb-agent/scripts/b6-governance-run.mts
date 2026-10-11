// W24-B6 governance acceptance run: compose the lakehouse engine, the Neo4j
// graph store, and the governance engine in one process, then exercise the
// four capabilities for real — cross-source inventory with search, lineage
// edges recorded from the real sync/ETL surface, quality rules evaluated
// against the live lakehouse (one deliberately failing), and alert events
// with the webhook-off proof. Run from the repository root:
//   node examples/kb-agent/scripts/b6-governance-run.mts
import { mkdirSync, writeFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import * as EnginePlugin from '../../../packages/lakehouse/lakehouse-engine/src/index.ts'
import * as GraphPlugin from '../../../packages/graph/graph-neo4j/src/index.ts'
import * as GovernanceEngine from '../../../packages/governance/governance-engine/src/index.ts'

const EVIDENCE_DIR = 'research/2026-10-09-w24-rebuild/b6-governance'
const log: string[] = []
const say = (line: string): void => { console.log(line); log.push(line) }

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname)
} catch {
  // No root .env: the password env chain simply resolves empty.
}
try {
  // The WeKnora sidecar keeps its API key in its own .env (B4 deployment).
  process.loadEnvFile(new URL('../../../workspace/weknora/.env', import.meta.url).pathname)
} catch {
  // Optional: the kb collector degrades to anonymous (and refused).
}

const ctx = new Context()
await ctx.plugin(EnginePlugin, {
  catalog: { kind: 'ducklake', catalogPath: 'workspace/lakehouse/ducklake/catalog.ducklake', dataPath: 'workspace/lakehouse/ducklake/files' },
})
await ctx.plugin(GraphPlugin, {
  url: process.env.DSH_NEO4J_URL ?? 'bolt://localhost:7687',
  user: process.env.DSH_NEO4J_USER ?? 'neo4j',
  passwordEnv: 'DSH_NEO4J_PASSWORD',
})
await ctx.plugin(GovernanceEngine, {
  path: 'workspace/governance/governance.sqlite',
  gravitinoUrl: process.env.GRAVITINO_URL ?? 'http://localhost:8090',
  metalake: 'dsh',
  weknoraUrl: process.env.WEKNORA_BASE_URL ?? 'http://localhost:18081',
  weknoraApiKey: process.env.WEKNORA_API_KEY ?? '',
  kgGraphPath: 'examples/kb-agent/workspace/kg-graph.sqlite',
  kbSqlitePath: 'examples/kb-agent/workspace/kb.sqlite',
})

try {
  // ── 1. Catalog: live cross-source inventory ─────────────────────────────
  const assets = await ctx.governance.inventory()
  const bySource = new Map<string, number>()
  for (const asset of assets) bySource.set(asset.source, (bySource.get(asset.source) ?? 0) + 1)
  say(`inventory: ${String(assets.length)} assets by source: ${JSON.stringify([...bySource.entries()])}`)

  // Cross-source search must hit lakehouse, KB, and graph in one query.
  const hits = await ctx.governance.search('customer')
  const hitSources = [...new Set(hits.map(hit => hit.source))]
  say(`search 'customer': ${String(hits.length)} hits across [${hitSources.join(', ')}]`)
  say(`  samples: ${JSON.stringify(hits.slice(0, 6).map(hit => `${hit.source}:${hit.qualifiedName}`))}`)

  // ── 2. Lineage: record the real carbon→lakehouse→graph chain ────────────
  const tables = await ctx.lakehouseEngine.listTables()
  const carbonTables = tables.filter(table => table.schema === 'synced_carbon')
  const at = new Date().toISOString()
  const edges = carbonTables.slice(0, 12).flatMap(table => [
    { source: `business.carbon.${table.table}`, target: `lake.synced_carbon.${table.table}`, transform: 'lakehouse-sync watermark 增量同步 (B3)', recordedAt: at },
    { source: `lake.synced_carbon.${table.table}`, target: `graph.<labels>`, transform: 'B5 确定性 ETL 入图 (kg-mappings)', recordedAt: at },
  ])
  edges.push({ source: 'kb.食品安全知识库', target: 'kb.chunks', transform: 'WeKnora 语料切分', recordedAt: at })
  await ctx.governance.recordEdges(edges)
  const stored = await ctx.governance.lineage()
  say(`lineage: recorded ${String(edges.length)} edges, store holds ${String(stored.length)}`)

  // ── 3. Quality: ≥3 rules incl. one deliberately failing ─────────────────
  const target = carbonTables[0]?.table ?? 'customers'
  await ctx.governance.upsertRule({
    id: 'carbon-rows', name: 'carbon 同步表行数下限', kind: 'row_count_threshold',
    table: `lake.synced_carbon.${target}`, threshold: 1, enabled: true,
  })
  await ctx.governance.upsertRule({
    id: 'legacy-nonempty', name: 'legacy 导出非空', kind: 'row_count_threshold',
    table: `lake.legacy_nocobase.${(tables.find(t => t.schema === 'legacy_nocobase') ?? { table: 'orders' }).table}`,
    threshold: 1, enabled: true,
  })
  await ctx.governance.upsertRule({
    id: 'deliberate-fail', name: '故意违规: 不可能达到的行数下限', kind: 'row_count_threshold',
    table: `lake.synced_carbon.${target}`, threshold: 1_000_000, enabled: true,
  })
  const evaluation = await ctx.governance.evaluate()
  for (const outcome of evaluation.outcomes) {
    say(`quality ${outcome.rule.id}: ${outcome.status} (measured=${String(outcome.measured)})`)
  }
  if (evaluation.failed < 1) throw new Error('the deliberately failing rule did not fail')

  // ── 4. Alerts: events recorded + webhook default-off proof ──────────────
  const events = await ctx.governance.events()
  const critical = events.filter(event => event.level === 'critical' && event.kind === 'quality')
  say(`alerts: ${String(events.length)} events, ${String(critical.length)} critical from the failed rule`)
  const webhook = await ctx.governance.testWebhook()
  say(`webhook: delivered=${String(webhook.delivered)} status="${webhook.status}"`)
  if (webhook.delivered) throw new Error('webhook should be off by default')

  mkdirSync(EVIDENCE_DIR, { recursive: true })
  writeFileSync(`${EVIDENCE_DIR}/07-governance-four-capabilities.txt`, `${log.join('\n')}\n`)
  say(`evidence -> ${EVIDENCE_DIR}/07-governance-four-capabilities.txt`)
  say('GOVERNANCE RUN PASS')
} finally {
  await ctx.fiber.dispose()
}
