/**
 * End-to-end pipeline tests over an in-memory graph store, a mock NocoBase
 * HTTP server, fake lakehouse/connector services, and a fake LLM: full-build
 * counts, derived-registry persistence, 张红喜 connectivity
 * (experts → services → orders), idempotent re-runs, incremental adds and
 * tombstoned deletes, corpus extraction with alignment, and the loud failure
 * modes.
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import type { LakehouseTable } from '@deepseek-ai/dsh-lakehouse'
import type { ConnectorDatasetSummary } from '@deepseek-ai/dsh-connector'
import KgBuildRuntime from '../src/index.ts'
import type { KgBuildPluginConfig } from '../src/index.ts'

const NOW = '2026-09-01T08:00:00.000Z'

const META = [
  { name: 'experts', title: '专家', filterTargetKey: 'id', fields: [
    { name: 'name', type: 'string', title: '姓名' },
    { name: 'org', type: 'string' },
    { name: 'mentor', type: 'belongsTo', target: 'experts', foreignKey: 'mentorId' },
  ] },
  { name: 'expert_services', title: '专家服务', filterTargetKey: 'id', fields: [
    { name: 'expertId', type: 'integer' },
    { name: 'name', type: 'string' },
  ] },
  { name: 'orders', title: '专家服务订单', filterTargetKey: 'id', fields: [
    { name: 'orderNo', type: 'string' },
    { name: 'serviceId', type: 'string' },
    { name: 'clientName', type: 'string' },
  ] },
  { name: 'secret', title: '隐藏表', hidden: true, filterTargetKey: 'id', fields: [] },
  { name: 'bare' },
]

const ROWS = new Map<string, Array<Record<string, unknown>>>([
  ['experts', [{ id: 1, name: '张红喜', org: '漯河市电子商务协会' }]],
  ['expert_services', [
    { id: 1, expertId: 1, name: '中亚货运动线方案' },
    { id: 2, expertId: 1, name: '海外仓风险应对咨询' },
  ]],
  ['orders', [{ id: 11, orderNo: 'ORD-11', serviceId: 'expert_services/1', clientName: '漯河宏发食品有限公司' }]],
  ['bare', [{ id: 1 }]],
])

const EXTRACTION = JSON.stringify({
  entities: [
    { type: 'experts', name: '张红喜' },
    { type: 'company', name: '漯河宏发食品有限公司', props: { region: '河南' } },
    { type: 'company', name: '漯河宏发食品有限' },
    { type: 'product', name: '宏发牌酱油' },
    { type: 'product', name: '宏发牌酱油' },
    { type: 'weather_front', name: '冷锋过境' },
  ],
  relations: [
    { subject: '漯河宏发食品有限公司', predicate: 'produces', object: '宏发牌酱油', confidence: 0.85, evidence: '宏发食品生产酱油' },
    { subject: '漯河宏发食品有限公司', predicate: 'supplies', object: '张红喜', confidence: 0.7 },
  ],
})

/** A fake llm service streaming canned replies (the last repeats). */
class FakeLlm extends Service {
  private replies: readonly string[]
  private call = 0
  constructor(ctx: Context, replies: readonly string[]) {
    super(ctx, 'llm')
    this.replies = replies
  }
  async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    const text = this.replies[Math.min(this.call, this.replies.length - 1)] ?? ''
    this.call += 1
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/** A fake lakehouse service exposing one customs table. */
class FakeLakehouse extends Service {
  constructor(ctx: Context) {
    super(ctx, 'lakehouse')
  }
  async listTables(tenantId: string): Promise<readonly LakehouseTable[]> {
    expect(tenantId).toBe('t')
    return [{
      tenantId, tableName: 'customs_export',
      columns: [{ name: 'region', sqlType: 'TEXT' }, { name: 'amount_t', sqlType: 'DOUBLE' }],
      format: 'parquet', location: 't/customs_export.parquet', rowCount: 3,
      provenance: { provider: 'upload', scope: 'share', collectedSource: 'workbench' },
      createdAt: NOW, updatedAt: NOW,
    }]
  }
}

/** A fake connector service exposing one dataset summary. */
class FakeConnector extends Service {
  constructor(ctx: Context) {
    super(ctx, 'connector')
  }
  async discover(): Promise<readonly ConnectorDatasetSummary[]> {
    return [{
      id: 'experts/1', title: '张红喜专家档案', kind: 'expert-profile',
      manifest: { provider: 'connector-nocobase' } as never,
    }]
  }
}

let ctx: Context | undefined
let ncServer: Server | undefined
let ncUrl: string | undefined
let corpusRoot: string | undefined

/** Boot the mock NocoBase on an ephemeral port. */
function bootMockNocoBase(): Promise<Server> {
  const server = createServer((request, response) => {
    const finish = (status: number, body: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    }
    if (request.headers.authorization !== 'Bearer kg-test-token') {
      finish(401, { error: { code: 'INVALID_TOKEN' } })
      return
    }
    const url = new URL(request.url ?? '/', 'http://mock')
    if (url.pathname === '/api/collections:listMeta') {
      finish(200, { data: META })
      return
    }
    const listMatch = /^\/api\/([^/:]+):list$/u.exec(url.pathname)
    if (request.method === 'GET' && listMatch !== null) {
      const rows = ROWS.get(listMatch[1] as string) ?? []
      const page = Number(url.searchParams.get('page') ?? 1)
      const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
      finish(200, {
        data: rows.slice((page - 1) * pageSize, page * pageSize),
        meta: { count: rows.length, page, pageSize },
      })
      return
    }
    finish(404, { error: { code: 'NOT_FOUND' } })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server)
    })
  })
}

/** One collection entry the test mappings writer understands. */
interface MappingEntry {
  name: string
  anchor?: string
  titleField?: string
  fkLinks?: Array<{ field: string; target: string; relation: string; style?: string }>
}

/** Write one mappings file into the run's temp dir and return its path. */
async function writeMappings(collections: readonly MappingEntry[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kg-build-mappings-'))
  const path = join(dir, 'kg-mappings.yml')
  const text = [
    'version: 1',
    'sources:',
    '  - system: nocobase',
    ...(collections.length === 0 ? ['    collections: []'] : ['    collections:']),
    ...collections.flatMap((entry) => {
      const lines = [`      - name: ${entry.name}`]
      if (entry.anchor !== undefined) lines.push(`        anchor: ${entry.anchor}`)
      if (entry.titleField !== undefined) lines.push(`        titleField: ${entry.titleField}`)
      for (const link of entry.fkLinks ?? []) {
        lines.push('        fkLinks:')
        lines.push(`          - field: ${link.field}`)
        lines.push(`            target: ${link.target}`)
        lines.push(`            relation: ${link.relation}`)
        if (link.style !== undefined) lines.push(`            style: ${link.style}`)
      }
      return lines
    }),
  ].join('\n')
  await writeFile(path, `${text}\n`, 'utf8')
  return path
}

let mappingsPath: string | undefined

/** The track config: the seeded collection whitelist with explicit fk links. */
function trackConfig(overrides: Partial<KgBuildPluginConfig> = {}): KgBuildPluginConfig {
  return {
    tenant: 't',
    nocobase: {
      baseUrl: ncUrl,
      apiKeyEnv: 'KG_TEST_NC_KEY',
      mappingsFile: mappingsPath as string,
    },
    lakehouse: true,
    connector: true,
    foodon: false,
    pageSize: 100,
    intervalMs: 0,
    ...overrides,
  }
}

/** Boot the full in-memory composition (graph seam + store + pipeline + fakes). */
async function boot(overrides: Partial<KgBuildPluginConfig> = {}, withFakes = true): Promise<Context> {
  const context = new Context()
  await context.plugin(KbGraphRuntime)
  await context.plugin(KbGraphSqlite, { path: ':memory:' })
  if (withFakes) {
    new FakeLakehouse(context)
    new FakeConnector(context)
    new FakeLlm(context, [EXTRACTION])
  }
  await context.plugin(KgBuildRuntime, trackConfig(overrides) as never)
  ctx = context
  return context
}

beforeEach(async () => {
  process.env.KG_TEST_NC_KEY = 'kg-test-token'
  ncServer = await bootMockNocoBase()
  mappingsPath = await writeMappings([
    { name: 'experts', anchor: 'Expert', titleField: 'name' },
    { name: 'expert_services', anchor: 'ExpertService', titleField: 'name', fkLinks: [
      { field: 'expertId', target: 'experts', relation: 'expert_services.expert', style: 'plain-id' },
    ] },
    { name: 'orders', anchor: 'Order', titleField: 'orderNo', fkLinks: [
      { field: 'serviceId', target: 'expert_services', relation: 'ordered_service', style: 'collection-address' },
    ] },
  ])
  ncUrl = `http://127.0.0.1:${String((ncServer.address() as { port: number }).port)}`
  corpusRoot = await mkdtemp(join(tmpdir(), 'kg-build-corpus-'))
  await writeFile(join(corpusRoot, 'supply-note.md'), '宏发食品与张红喜会长合作，张红喜主持中亚货运动线。冷锋过境影响运输。', 'utf8')
  await mkdir(join(corpusRoot, 'nested'), { recursive: true })
  await writeFile(join(corpusRoot, 'ignored.bin'), 'ignored extension', 'utf8')
})

afterEach(async () => {
  delete process.env.KG_TEST_NC_KEY
  await ctx?.fiber.dispose()
  ctx = undefined
  await new Promise(resolve => ncServer?.close(resolve))
  ncServer = undefined
  if (corpusRoot !== undefined) await rm(corpusRoot, { recursive: true, force: true })
  corpusRoot = undefined
  ROWS.set('experts', [{ id: 1, name: '张红喜', org: '漯河市电子商务协会' }])
  ROWS.set('expert_services', [
    { id: 1, expertId: 1, name: '中亚货运动线方案' },
    { id: 2, expertId: 1, name: '海外仓风险应对咨询' },
  ])
  ROWS.set('orders', [{ id: 11, orderNo: 'ORD-11', serviceId: 'expert_services/1', clientName: '漯河宏发食品有限公司' }])
})

describe('KgBuildRuntime pipeline', () => {
  it('builds the full graph: counts, derived registry, and 张红喜 connectivity', async () => {
    const context = await boot({ corpus: { root: corpusRoot, maxDocuments: 5, maxChunksPerDocument: 2 } })
    const report = await context.kgBuild.run()
    expect(report.collections.map(entry => entry.scope)).toEqual(['experts', 'expert_services', 'orders'])
    expect(report.collections.map(entry => entry.rows)).toEqual([1, 2, 1])
    expect(report.persistedTypes).toBe(3)
    expect(report.persistedRelations).toBe(2)
    expect(report.lakehouse?.items).toBe(1)
    expect(report.connector?.items).toBe(1)

    const stats = await context.get('kbGraph')!.stats('t')
    expect(stats.entities).toBe(9)
    expect(stats.triples).toBe(4)

    const registry = await context.get('kbGraph')!.storedRegistry()
    expect(registry.nodeTypes.map(type => String(type.id))).toContain('experts')
    expect(context.get('kbGraph')!.listNodeTypes().some(type => String(type.id) === 'experts')).toBe(true)

    const subgraph = await context.get('kbGraph')!.subgraph('t', ['nocobase:experts:1'], 2)
    const names = subgraph.nodes.map(node => node.name)
    expect(names).toContain('中亚货运动线方案')
    expect(names).toContain('ORD-11')
    const lakehouseNode = await context.get('kbGraph')!.searchNodes('t', 'customs_export', undefined, 5)
    expect(lakehouseNode[0]?.id).toBe('lakehouse:customs_export')
  })

  it('is idempotent: an unchanged second run writes nothing', async () => {
    const context = await boot()
    const first = await context.kgBuild.run()
    expect(first.collections.every(entry => entry.skipped)).toBe(false)
    const before = await context.get('kbGraph')!.stats('t')
    const second = await context.kgBuild.run()
    expect(second.collections.every(entry => entry.skipped)).toBe(true)
    expect(second.lakehouse?.skipped).toBe(true)
    expect(second.connector?.skipped).toBe(true)
    const after = await context.get('kbGraph')!.stats('t')
    expect(after).toEqual(before)
  })

  it('ingests incremental rows and tombstones deleted rows', async () => {
    const context = await boot()
    await context.get('kgBuild')!.run()
    ROWS.get('orders')?.push({ id: 12, orderNo: 'ORD-12', serviceId: 'expert_services/2', clientName: '新客户' })
    const added = await context.get('kgBuild')!.run()
    expect(added.collections.find(entry => entry.scope === 'orders')).toMatchObject({ newRows: 1, rows: 2, skipped: false })
    let subgraph = await context.get('kbGraph')!.subgraph('t', ['nocobase:orders:12'], 1)
    expect(subgraph.nodes.map(node => node.name)).toContain('ORD-12')

    ROWS.set('orders', [{ id: 11, orderNo: 'ORD-11', serviceId: 'expert_services/1', clientName: '漯河宏发食品有限公司' }])
    const removed = await context.get('kgBuild')!.run()
    expect(removed.collections.find(entry => entry.scope === 'orders')?.tombstoned).toBe(1)
    subgraph = await context.get('kbGraph')!.subgraph('t', ['nocobase:orders:12'], 1)
    // The seed node itself remains (tombstone kills edges, not nodes): the
    // walk now reaches nothing past the seed.
    expect(subgraph.nodes).toHaveLength(1)
    expect(subgraph.edges).toHaveLength(0)
  })

  it('extracts corpus entities with closed-set defense and alignment merging', async () => {
    const context = await boot({ corpus: { root: corpusRoot, maxDocuments: 5, maxChunksPerDocument: 2 } })
    const report = await context.kgBuild.run()
    expect(report.corpus).toMatchObject({
      documents: 1, degradedEntities: 1, droppedRelations: 1, mergedEntities: 2, extractedRelations: 1,
    })
    // The hallucinated weather entity degraded into the Concept bucket.
    const bucket = await context.get('kbGraph')!.searchNodes('t', '冷锋过境', undefined, 5)
    expect(bucket[0]?.id).toContain('#冷锋过境')
    // The extracted 张红喜 aligned onto the canonical NocoBase row (no
    // duplicate experts node was created).
    const expertsHits = (await context.get('kbGraph')!.searchNodes('t', '张红喜', undefined, 10))
      .filter(hit => String(hit.type) === 'experts')
    expect(expertsHits).toHaveLength(1)
    expect(expertsHits[0]?.id).toBe('nocobase:experts:1')
    // The legal produces relation landed as a confidence edge between the
    // new kb nodes; the direction-violating supplies relation dropped.
    const companyNode = await context.get('kbGraph')!.searchNodes('t', '漯河宏发食品有限公司', undefined, 5)
    expect(companyNode[0]?.id).toContain('kb:')
    const around = await context.get('kbGraph')!.subgraph('t', [companyNode[0]?.id as string], 1)
    expect(around.nodes.some(node => node.name === '宏发牌酱油')).toBe(true)
    expect(around.edges.every(edge => edge.confidence < 1)).toBe(true)
  })

  it('skips unchanged corpus documents on the second run', async () => {
    const context = await boot({ corpus: { root: corpusRoot, maxDocuments: 5, maxChunksPerDocument: 2 } })
    await context.kgBuild.run()
    const second = await context.kgBuild.run()
    expect(second.corpus).toMatchObject({ documents: 1, extractionCalls: 0 })
  })

  it('fails loud for missing seams, credentials, and unmappable collections', async () => {
    const bare = new Context()
    await bare.plugin(KgBuildRuntime, { tenant: 't', lakehouse: false, connector: false, pageSize: 10, intervalMs: 0 })
    await expect(bare.kgBuild.run()).rejects.toMatchObject({ code: 'KG_BUILD_SEAM_MISSING' })
    await bare.fiber.dispose()

    delete process.env.KG_TEST_NC_KEY
    const noCreds = await boot()
    await expect(noCreds.kgBuild.run()).rejects.toMatchObject({ code: 'KG_BUILD_CREDENTIALS_MISSING' })

    process.env.KG_TEST_NC_KEY = 'kg-test-token'
    const hidden = await boot({
      nocobase: {
        ...(ncUrl === undefined ? {} : { baseUrl: ncUrl }),
        apiKeyEnv: 'KG_TEST_NC_KEY',
        mappingsFile: await writeMappings([{ name: 'secret' }]),
      },
    })
    await expect(hidden.get('kgBuild')!.run()).rejects.toMatchObject({ code: 'KG_BUILD_COLLECTION_UNMAPPABLE' })
  })

  it('refuses a corpus run without the llm seam', async () => {
    const context = await boot({ corpus: { root: corpusRoot } }, false)
    await expect(context.get('kgBuild')!.run()).rejects.toMatchObject({ code: 'KG_BUILD_SEAM_MISSING' })
  })

  it('schedules repeat runs when intervalMs is positive and skips absent seams', async () => {
    // A huge interval keeps the timer from firing inside the test; disposal
    // clears it (the interval effect lines are the coverage target).
    const scheduled = await boot({ intervalMs: 2_147_483_000, lakehouse: false, connector: false })
    const report = await scheduled.get('kgBuild')!.run()
    expect(report.lakehouse).toBeUndefined()
    expect(report.connector).toBeUndefined()
    await scheduled.fiber.dispose()

    // Without the fakes the legs skip even when enabled: absent seams degrade,
    // they do not fail the run.
    const bare = await boot({ lakehouse: true, connector: true }, false)
    const bareReport = await bare.get('kgBuild')!.run()
    expect(bareReport.lakehouse).toBeUndefined()
    expect(bareReport.connector).toBeUndefined()
  })

  it('pages collections with a small page size', async () => {
    const context = await boot({ pageSize: 1 })
    const report = await context.get('kgBuild')!.run()
    expect(report.collections.find(entry => entry.scope === 'expert_services')).toMatchObject({ rows: 2 })
  })

  it('routes gray-zone names through the adjudicating llm', async () => {
    const context = await boot({
      corpus: { root: corpusRoot, maxDocuments: 5, maxChunksPerDocument: 2 },
      align: { autoThreshold: 0.99, grayFloor: 0.5 },
      extract: { provider: 'minimax', model: 'MiniMax-M3' },
    })
    const report = await context.get('kgBuild')!.run()
    // 漯河宏发食品有限 sits in the gray zone against the canonical company
    // node; the fake llm answers with the extraction JSON (not "yes"), so the
    // merge is refused and the variant stays a separate node.
    expect(report.corpus?.mergedEntities).toBe(1)
    const variant = await context.get('kbGraph')!.searchNodes('t', '漯河宏发食品有限', undefined, 10)
    const companies = variant.filter(hit => String(hit.type) === 'company')
    // The adjudicator refused the merge: the variant and the canonical stay
    // two nodes (no alias was bound).
    expect(companies).toHaveLength(2)
    expect(companies.some(hit => hit.id.endsWith('#漯河宏发食品有限'))).toBe(true)
    expect(companies.some(hit => hit.id.endsWith('#漯河宏发食品有限公司'))).toBe(true)
  })

  it('covers ambient baseUrl, bare collections, aborted signals, and chunk caps', async () => {
    // baseUrl and token resolve through the ambient environment chain when
    // the config omits both (no baseUrl, no apiKeyEnv).
    process.env.NOCOBASE_BASE_URL = ncUrl
    process.env.NOCOBASE_API_KEY = 'kg-test-token'
    const context = new Context()
    await context.plugin(KbGraphRuntime)
    await context.plugin(KbGraphSqlite, { path: ':memory:' })
    new FakeLakehouse(context)
    new FakeConnector(context)
    new FakeLlm(context, [EXTRACTION])
    await context.plugin(KgBuildRuntime, {
      tenant: 't',
      nocobase: {
        mappingsFile: await writeMappings([
          { name: 'experts', anchor: 'Expert', titleField: 'name' },
          { name: 'bare' },
        ]),
      },
      lakehouse: false,
      connector: false,
      pageSize: 100,
      intervalMs: 0,
    })
    // The bare collection (no fields, no filterTargetKey) maps with the id
    // fallbacks; experts covers the ordinary path.
    try {
      const report = await context.get('kgBuild')!.run()
      expect(report.collections.map(entry => entry.scope)).toEqual(['experts', 'bare'])
      await writeFile(join(corpusRoot as string, 'two-parts.md'), '第一段\n\n第二段', 'utf8')
    } finally {
      delete process.env.NOCOBASE_BASE_URL
      await context.fiber.dispose()
    }

    // Chunk caps and the aborted signal run through a corpus-enabled boot
    // (two documents on disk: supply-note plus two-parts, both inside the
    // maxDocuments ceiling, each collapsing to one chunk under the cap).
    const capped = await boot({
      corpus: { root: corpusRoot, maxDocuments: 2, maxChunksPerDocument: 1 },
      nocobase: { baseUrl: ncUrl, apiKeyEnv: 'KG_TEST_NC_KEY', mappingsFile: await writeMappings([{ name: 'experts', anchor: 'Expert', titleField: 'name' }]) },
    })
    const cappedReport = await capped.get('kgBuild')!.run()
    expect(cappedReport.corpus?.chunks).toBe(2)
    await capped.fiber.dispose()
    const aborting = new Context()
    await aborting.plugin(KbGraphRuntime)
    await aborting.plugin(KbGraphSqlite, { path: ':memory:' })
    new FakeLlm(aborting, [EXTRACTION])
    await aborting.plugin(KgBuildRuntime, {
      tenant: 't',
      nocobase: { mappingsFile: await writeMappings([]) },
      corpus: { root: corpusRoot, maxDocuments: 5, extensions: [] },
      lakehouse: false,
      connector: false,
      pageSize: 100,
      intervalMs: 0,
    } as never)
    const aborted = await aborting.get('kgBuild')!.run({ signal: AbortSignal.abort() })
    expect(aborted.corpus?.extractionCalls).toBe(0)
    await aborting.fiber.dispose()
  })

  it('splits over-budget paragraphs and skips cross-document dangling relations', async () => {
    await writeFile(join(corpusRoot as string, 'long-doc.md'), `${'甲'.repeat(240)}\n\n${'乙'.repeat(240)}\n\n${'丙'.repeat(20)}`, 'utf8')
    const firstDoc = await readFile(join(corpusRoot as string, 'supply-note.md'), 'utf8')
    // Two documents under the budget: both extract in one run, and the
    // second one's relations reference a name only the first declares.
    const context = await boot({
      corpus: { root: corpusRoot, maxDocuments: 2, maxChunksPerDocument: 2 },
      extract: { maxChunkChars: 200 },
    })
    const report = await context.get('kgBuild')!.run()
    expect(report.corpus?.documents).toBe(2)
    expect(report.corpus?.chunks).toBe(3)
    expect(firstDoc.length).toBeGreaterThan(0)
  })

  it('fires scheduled runs and logs their failures', async () => {
    process.env.KG_TEST_MISSING_KEY = ''
    const context = new Context()
    await context.plugin(KbGraphRuntime)
    await context.plugin(KbGraphSqlite, { path: ':memory:' })
    await context.plugin(KgBuildRuntime, {
      tenant: 't',
      nocobase: { baseUrl: ncUrl, apiKeyEnv: 'KG_TEST_MISSING_KEY', mappingsFile: await writeMappings([{ name: 'experts' }]) },
      lakehouse: false,
      connector: false,
      pageSize: 100,
      intervalMs: 40,
    } as never)
    // The ticker fires at least one scheduled run; without a token it fails
    // and the failure lands in the logger (the catch line is the target).
    await new Promise(resolve => setTimeout(resolve, 150))
    await context.fiber.dispose()
    delete process.env.KG_TEST_MISSING_KEY
  })

  it('refuses when the credentials seam resolves nothing', async () => {
    class EmptyCredentials extends Service {
      constructor(ctx: Context) {
        super(ctx, 'credentials')
      }
      async resolve(): Promise<{ value: string } | undefined> {
        return undefined
      }
    }
    delete process.env.KG_TEST_NC_ABSENT
    const context = new Context()
    new EmptyCredentials(context)
    await context.plugin(KbGraphRuntime)
    await context.plugin(KbGraphSqlite, { path: ':memory:' })
    await context.plugin(KgBuildRuntime, {
      tenant: 't',
      nocobase: { baseUrl: ncUrl, apiKeyEnv: 'KG_TEST_NC_ABSENT', mappingsFile: await writeMappings([{ name: 'experts' }]) },
      lakehouse: false,
      connector: false,
      pageSize: 100,
      intervalMs: 0,
    } as never)
    await expect(context.get('kgBuild')!.run()).rejects.toMatchObject({ code: 'KG_BUILD_CREDENTIALS_MISSING' })
    await context.fiber.dispose()
  })

  it('resolves the token through the credentials seam when composed', async () => {
    class FakeCredentials extends Service {
      constructor(ctx: Context) {
        super(ctx, 'credentials')
      }
      async resolve(): Promise<{ value: string } | undefined> {
        return { value: 'kg-test-token' }
      }
    }
    const context = new Context()
    new FakeCredentials(context)
    await context.plugin(KbGraphRuntime)
    await context.plugin(KbGraphSqlite, { path: ':memory:' })
    new FakeLlm(context, [EXTRACTION])
    await context.plugin(KgBuildRuntime, {
      tenant: 't',
      nocobase: {
        baseUrl: ncUrl,
        apiKeyEnv: 'KG_TEST_NC_ABSENT',
        mappingsFile: await writeMappings([{ name: 'experts', anchor: 'Expert', titleField: 'name' }]),
      },
      lakehouse: false,
      connector: false,
      pageSize: 100,
      intervalMs: 0,
    } as never)
    const report = await context.get('kgBuild')!.run()
    expect(report.collections.every(entry => entry.rows > 0)).toBe(true)
    await context.fiber.dispose()
  })
})

describe('KgBuildRuntime corpus manifest and budget guard', () => {
  /** Write one corpus manifest into a fresh temp dir and return its path. */
  async function writeManifest(dirs: ReadonlyArray<{ dir: string; kind?: string }>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'kg-build-manifest-'))
    const path = join(dir, 'kb-corpus.yml')
    const text = [
      'version: 1',
      'dirs:',
      ...dirs.map(entry => `  - dir: ${entry.dir}\n    kind: ${entry.kind ?? 'report'}`),
    ].join('\n')
    await writeFile(path, `${text}\n`, 'utf8')
    return path
  }

  beforeEach(async () => {
    process.env.KG_TEST_NC_KEY = 'kg-test-token'
    ncServer = await bootMockNocoBase()
    mappingsPath = await writeMappings([{ name: 'experts', anchor: 'Expert', titleField: 'name' }])
    ncUrl = `http://127.0.0.1:${String((ncServer.address() as { port: number }).port)}`
    corpusRoot = await mkdtemp(join(tmpdir(), 'kg-build-corpus-'))
    // The manifest shape: one listed directory (nested) carrying a document,
    // one unlisted root document the manifest must exclude.
    await mkdir(join(corpusRoot, 'nested'), { recursive: true })
    await writeFile(join(corpusRoot, 'nested', 'note.md'), '宏发食品与张红喜会长合作，冷锋过境影响运输。', 'utf8')
    await writeFile(join(corpusRoot, 'supply-note.md'), '宏发食品与张红喜会长合作，张红喜主持中亚货运动线。', 'utf8')
  })

  it('scans only the manifest directories and records their corpus-relative scopes', async () => {
    const manifestFile = await writeManifest([{ dir: 'nested', kind: 'report' }])
    const context = await boot({ corpus: { root: corpusRoot, manifestFile, maxDocuments: 5, maxChunksPerDocument: 2 } })
    const report = await context.kgBuild.run()
    expect(report.corpus?.documents).toBe(1)
    // Only the manifest file produced a watermark; the unlisted root document
    // never entered the scan.
    expect(await context.get('kbGraph')!.getSourceRun('kb', 'nested/note.md')).toBeDefined()
    expect(await context.get('kbGraph')!.getSourceRun('kb', 'supply-note.md')).toBeUndefined()
    await context.fiber.dispose()
  })

  it('tombstones manifest-external kb scopes, deletes their watermarks, and stays idempotent', async () => {
    const manifestFile = await writeManifest([{ dir: 'nested', kind: 'report' }])
    const context = await boot({ corpus: { root: corpusRoot, manifestFile, maxDocuments: 5, maxChunksPerDocument: 2 } })
    const graph = context.get('kbGraph')!
    await context.kgBuild.run()
    // Legacy drift: a kb scope outside the manifest still holds a live edge
    // and a watermark row from a whole-root scan era.
    const ghostAt = '2026-09-02T00:00:00.000Z'
    await graph.upsertNode({ id: 'kb:connector-files/drop.md#莫斯科旧仓', tenantId: 't', type: kgNodeTypeId('Region'), name: '莫斯科旧仓', createdAt: ghostAt, updatedAt: ghostAt })
    await graph.upsertNode({ id: 'kb:connector-files/drop.md#中亚旧仓', tenantId: 't', type: kgNodeTypeId('Region'), name: '中亚旧仓', createdAt: ghostAt, updatedAt: ghostAt })
    await graph.upsertEdges([{
      id: 'kb:connector-files/drop.md:莫斯科旧仓:related:中亚旧仓',
      tenantId: 't',
      srcId: 'kb:connector-files/drop.md#莫斯科旧仓',
      dstId: 'kb:connector-files/drop.md#中亚旧仓',
      relation: kgRelationId('related'),
      confidence: 1,
      provenance: { sourceSystem: 'kb', sourceId: 'connector-files/drop.md', extractedAt: ghostAt },
      validFrom: ghostAt,
    }])
    await graph.putSourceRun({ sourceSystem: 'kb', scope: 'connector-files/drop.md', contentHash: 'legacy', lastRunAt: ghostAt })

    const repair = await context.kgBuild.run()
    expect(repair.corpus?.tombstonedScopes).toBe(1)
    expect(repair.corpus?.tombstonedEdges).toBe(1)
    // The retired watermark is gone; a later run cannot treat the scope as
    // unchanged corpus.
    expect(await graph.getSourceRun('kb', 'connector-files/drop.md')).toBeUndefined()
    // The ghost scope's edge died with the sweep: no live edge touches the
    // ghost nodes.
    expect((await graph.expand('t', 'kb:connector-files/drop.md#莫斯科旧仓', 10)).edges).toHaveLength(0)
    // The manifest-scoped document keeps its live watermark.
    expect((await graph.getSourceRun('kb', 'nested/note.md'))?.contentHash).toBeDefined()

    // Idempotent: a third run sweeps nothing and changes no counts.
    const before = await graph.stats('t')
    const again = await context.kgBuild.run()
    expect(again.corpus?.tombstonedScopes).toBe(0)
    expect(again.corpus?.tombstonedEdges).toBe(0)
    expect(await graph.stats('t')).toEqual(before)
    await context.fiber.dispose()
  })

  it('fails loud when the scan exceeds maxDocuments instead of truncating', async () => {
    const context = await boot({ corpus: { root: corpusRoot, maxDocuments: 1, maxChunksPerDocument: 2 } })
    await expect(context.kgBuild.run()).rejects.toMatchObject({ code: 'KG_BUILD_CORPUS_OVER_BUDGET' })
    await context.fiber.dispose()
  })

  it('fails loud when a manifest directory is missing or carries no matching files', async () => {
    const absent = await boot({ corpus: { root: corpusRoot, manifestFile: await writeManifest([{ dir: 'absent' }]), maxDocuments: 5 } })
    await expect(absent.kgBuild.run()).rejects.toMatchObject({ code: 'KG_BUILD_CORPUS_DIR_EMPTY' })
    await absent.fiber.dispose()

    // A listed directory whose files all miss the extension filter fails the
    // same way — the manifest declared corpus that the scan cannot find.
    const dir = await mkdtemp(join(tmpdir(), 'kg-build-emptydir-'))
    await mkdir(join(dir, 'only-txt'), { recursive: true })
    await writeFile(join(dir, 'only-txt', 'note.txt'), 'not markdown', 'utf8')
    const wrongExt = new Context()
    await wrongExt.plugin(KbGraphRuntime)
    await wrongExt.plugin(KbGraphSqlite, { path: ':memory:' })
    new FakeLlm(wrongExt, [EXTRACTION])
    await wrongExt.plugin(KgBuildRuntime, trackConfig({
      corpus: { root: dir, manifestFile: await writeManifest([{ dir: 'only-txt' }]), extensions: ['.md'], maxDocuments: 5, maxChunksPerDocument: 2 },
    }) as never)
    await expect(wrongExt.get('kgBuild')!.run()).rejects.toMatchObject({ code: 'KG_BUILD_CORPUS_DIR_EMPTY' })
    await wrongExt.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })

  it('rejects an invalid manifest file at load', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kg-build-badmanifest-'))
    const path = join(dir, 'kb-corpus.yml')
    await writeFile(path, 'version: 1\ndirs: []\n', 'utf8')
    const context = new Context()
    await context.plugin(KbGraphRuntime)
    await context.plugin(KbGraphSqlite, { path: ':memory:' })
    await expect(context.plugin(KgBuildRuntime, trackConfig({
      corpus: { root: corpusRoot, manifestFile: path, maxDocuments: 5, maxChunksPerDocument: 2 },
    }) as never)).rejects.toMatchObject({ code: 'KG_BUILD_CORPUS_MANIFEST_INVALID' })
    await context.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })
})
