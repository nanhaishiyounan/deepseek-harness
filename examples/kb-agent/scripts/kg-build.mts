/**
 * Real-track kg-build verification (V4 acceptance): full build against the
 * LIVE NocoBase at :13000 plus the lakehouse catalog and connector
 * discovery, then the assertion battery — derived registry ≥4 types, node and
 * edge counts, 张红喜 connected experts → services → orders, watermarks
 * persisted, an idempotent second run, and the incremental scenario (create
 * an order row → new node appears; delete it → tombstoned edges). Corpus
 * extraction runs only with MINIMAX_API_KEY (the closed-set path; without a
 * key the leg is skipped loudly in the report, not silently faked).
 * Run from the repo root:
 *   node --import tsx/esm examples/kb-agent/scripts/kg-build.mts
 */
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import * as ConnectorFile from '@deepseek-ai/dsh-connector-file'
import * as ConnectorNocoBase from '@deepseek-ai/dsh-connector-nocobase'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseSqliteCatalog from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import KgBuildRuntime from '@deepseek-ai/dsh-kg-build'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'

// The app bin loads the gitignored root .env; a bare tsx run must do the same.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname)
} catch {
  // No .env: the NocoBase leg below fails loud with the credential error.
}

const tenant = process.env.DSH_KB_TENANT ?? 'demo-food-co'
const graphPath = 'examples/kb-agent/workspace/kg-graph.sqlite'
const withKey = typeof process.env.MINIMAX_API_KEY === 'string' && process.env.MINIMAX_API_KEY.length > 0
const failures: string[] = []

/** One assertion with a unified failure log. */
function check(name: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`[${mark}] ${name}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(name)
}

const mappingsFile = 'examples/kb-agent/kg-mappings.yml'

const ctx = new Context()
try {
  await ctx.plugin(LlmRuntime)
  if (withKey) await ctx.plugin(LlmMiniMax, {})
  await ctx.plugin(KbGraphRuntime)
  await ctx.plugin(KbGraphSqlite, { path: graphPath })
  await ctx.plugin(LakehouseRuntime, { dataRoot: 'examples/kb-agent/workspace/lakehouse' })
  await ctx.plugin(LakehouseSqliteCatalog, { path: 'examples/kb-agent/workspace/lakehouse-catalog.sqlite' })
  await ctx.plugin(ConnectorRuntime)
  await ctx.plugin(ConnectorFile, { root: 'examples/kb-agent/workspace/data/connector-files' })
  await ctx.plugin(ConnectorNocoBase, {})
  await ctx.plugin(KgBuildRuntime, {
    tenant,
    nocobase: { mappingsFile },
    ...(withKey ? { corpus: { root: 'examples/kb-agent/workspace/data', extensions: ['.md'], maxDocuments: 50, maxChunksPerDocument: 4 } } : {}),
    pageSize: 100,
    intervalMs: 0,
  })

  console.log(`kg-build.mts: ${withKey ? 'with MINIMAX key — corpus extraction ON' : 'no MINIMAX key — corpus leg OFF'}`)

  const graph = ctx.get('kbGraph')
  if (graph === undefined) throw new Error('kbGraph did not compose')
  const build = ctx.get('kgBuild')
  if (build === undefined) throw new Error('kgBuild did not compose')

  // ① Full build.
  const first = await build.run()
  for (const entry of first.collections) {
    console.log(`  collection ${entry.scope}: rows=${String(entry.rows)} nodes=${String(entry.nodesUpserted)} edges=${String(entry.edgesUpserted)} watermark=${entry.watermark} skipped=${String(entry.skipped)}`)
  }
  if (first.lakehouse !== undefined) console.log(`  lakehouse: items=${String(first.lakehouse.items)} skipped=${String(first.lakehouse.skipped)}`)
  if (first.connector !== undefined) console.log(`  connector: items=${String(first.connector.items)} skipped=${String(first.connector.skipped)}`)
  if (first.corpus !== undefined) {
    console.log(`  corpus: docs=${String(first.corpus.documents)} calls=${String(first.corpus.extractionCalls)} entities=${String(first.corpus.extractedEntities)} degraded=${String(first.corpus.degradedEntities)} dropped=${String(first.corpus.droppedRelations)} merged=${String(first.corpus.mergedEntities)}`)
  }
  check('full build ingested every collection', first.collections.length === 5 && first.collections.every(entry => entry.rows > 0))

  // ①b Versioned ontology and the mappings readout.
  check('ontologyVersion is 1.0.0', graph.ontologyVersion() === '1.0.0', graph.ontologyVersion())
  const readout = build.mappings()
  check('mappings readout carries 5 collections', readout.collections.length === 5 && readout.version === 1, `${String(readout.collections.length)} collections, v${String(readout.version)}`)

  // ② Derived registry: ≥4 nocobase-derived types persisted and visible.
  const derived = (await graph.storedRegistry()).nodeTypes.filter(type => type.source === 'nocobase-derived')
  check('registry carries ≥4 nocobase-derived types', derived.length >= 4, `${String(derived.length)}: ${derived.map(type => String(type.id)).join(', ')}`)
  check('draft statuses carry through', derived.every(type => type.status === 'draft'))

  // ③ Counts and 张红喜 connectivity (experts → services → orders).
  const stats = await graph.stats(tenant)
  console.log(`  graph stats: nodes=${String(stats.entities)} edges=${String(stats.triples)}`)
  check('graph holds ≥19 nodes', stats.entities >= 19, `nodes=${String(stats.entities)}`)
  check('graph holds derived fk edges', stats.triples >= 5, `edges=${String(stats.triples)}`)
  const zhang = await graph.searchNodes(tenant, '张红喜', undefined, 5)
  const zhangNode = zhang.find(hit => hit.id === 'nocobase:experts:1')
  check('张红喜 canonical node exists', zhangNode !== undefined)
  if (zhangNode !== undefined) {
    const subgraph = await graph.subgraph(tenant, [zhangNode.id], 2)
    const names = subgraph.nodes.map(node => node.name)
    const services = ['中亚货运动线方案', '海外仓风险应对咨询', '食品出海合规咨询'].filter(name => names.includes(name))
    check('张红喜 reaches its services (hop 1)', services.length >= 2, services.join('、'))
    const ordersBefore = subgraph.nodes.filter(node => String(node.type) === 'orders')
    console.log(`  张红喜 2-hop orders in graph: ${String(ordersBefore.length)}`)
  }

  // ④ Watermarks persisted.
  const expertsRun = await graph.getSourceRun('nocobase', 'experts')
  check('watermark persisted for experts', expertsRun?.watermark !== undefined && Number(expertsRun.watermark) > 0, `watermark=${expertsRun?.watermark ?? 'none'}`)

  // ⑤ Idempotent second run: nothing changes.
  const second = await build.run()
  const statsAfter = await graph.stats(tenant)
  const allSkipped = second.collections.every(entry => entry.skipped)
  check('second run skips every unchanged scope', allSkipped, second.collections.map(entry => `${entry.scope}:${String(entry.skipped)}`).join(' '))
  check('second run changes no counts', statsAfter.entities === stats.entities && statsAfter.triples === stats.triples, `nodes ${String(stats.entities)}→${String(statsAfter.entities)}, edges ${String(stats.triples)}→${String(statsAfter.triples)}`)

  // ⑥ Incremental: create one order → new node appears; delete → tombstone.
  // The scenario mints a throwaway order row every run and the node itself
  // survives the reconcile (only its edges tombstone), so count-stable
  // replays — the setup chain's setup-dsh-data orchestration — pass
  // --no-incremental to skip this acceptance-only leg.
  const incrementalEnabled = !process.argv.includes('--no-incremental')
  const ncBase = process.env.NOCOBASE_BASE_URL
  const ncKey = process.env.NOCOBASE_API_KEY
  if (!incrementalEnabled) {
    check('incremental scenario skipped (--no-incremental)', true, 'kept for manual verification runs; setup-chain replays stay count-stable')
  } else if (typeof ncBase === 'string' && typeof ncKey === 'string') {
    const client = new NocoBaseClient({ baseUrl: ncBase, token: ncKey })
    const orderNo = `KG-BUILD-${String(Date.now()).slice(-8)}`
    const created = await client.create('orders', {
      orderNo,
      serviceId: 'expert_services/1',
      serviceName: '中亚货运动线方案',
      price: '¥8,800/份',
      brief: 'kg-build 增量验证订单',
      clientName: 'kg-build 脚本',
      expertName: '张红喜',
      status: 'pending',
    })
    const beforeEntities = (await graph.stats(tenant)).entities
    const incremental = await build.run()
    const ordersSlice = incremental.collections.find(entry => entry.scope === 'orders')
    check('incremental run ingests the new row', ordersSlice?.skipped === false && ordersSlice?.newRows === 1, `newRows=${String(ordersSlice?.newRows ?? -1)}`)
    const newNode = await graph.searchNodes(tenant, orderNo, undefined, 5)
    check('new order node appears in the graph', newNode.some(hit => hit.id === `nocobase:orders:${String(created.id)}`) && (await graph.stats(tenant)).entities === beforeEntities + 1)
    const connected = await graph.subgraph(tenant, [`nocobase:orders:${String(created.id)}`], 1)
    check('new order connects to its service', connected.nodes.some(node => node.name === '中亚货运动线方案'))
    const zhangAgain = await graph.subgraph(tenant, ['nocobase:experts:1'], 2)
    check('张红喜 now reaches the new order', zhangAgain.nodes.some(node => node.name === orderNo))

    // Deletion propagates: the row disappears, its edges tombstone.
    await fetch(`${ncBase}/api/orders:destroy?filterByTk=${String(created.id)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ncKey}` },
    })
    const reconciled = await build.run()
    const reconciledOrders = reconciled.collections.find(entry => entry.scope === 'orders')
    check('reconcile tombstones the deleted row edges', (reconciledOrders?.tombstoned ?? 0) >= 1, `tombstoned=${String(reconciledOrders?.tombstoned ?? 0)}`)
    const afterDelete = await graph.subgraph(tenant, [`nocobase:orders:${String(created.id)}`], 1)
    check('deleted order no longer reaches its service', afterDelete.nodes.length === 1 && afterDelete.edges.length === 0)
  } else {
    check('incremental scenario (needs NocoBase credentials)', false, 'NOCOBASE_BASE_URL/NOCOBASE_API_KEY missing')
  }

  console.log(failures.length === 0
    ? '\nkg-build.mts: ALL CHECKS PASSED'
    : `\nkg-build.mts: ${String(failures.length)} CHECK(S) FAILED — ${failures.join('; ')}`)
  process.exitCode = failures.length === 0 ? 0 : 1
} finally {
  await ctx.fiber.dispose()
}
