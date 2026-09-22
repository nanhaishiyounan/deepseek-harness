/**
 * Cross-source coreference tests: the deterministic alignment pass that wires
 * `corefers_with` edges between corpus-extracted entities (`kb:` nodes) and
 * NocoBase rows (`nocobase:` nodes) without merging anything — the structural
 * fix that makes 张红喜 (experts:1) reachable from document-side entities.
 * Rule-matrix unit tests over the pure planner, then pipeline-integration
 * tests over the same in-memory composition pipeline.spec uses.
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import KgBuildRuntime from '../src/index.ts'
import type { KgBuildPluginConfig } from '../src/index.ts'
import { crossSourceEdges } from '../src/cross-source.ts'
import type { KgNode } from '@deepseek-ai/dsh-kb-graph'

const NOW = '2026-09-17T00:00:00.000Z'

function docNode(id: string, type: string, name: string): KgNode {
  return { id, tenantId: 't', type: kgNodeTypeId(type), name, createdAt: NOW, updatedAt: NOW }
}

describe('crossSourceEdges (the deterministic rule matrix)', () => {
  const doc = (name: string, type = 'Region') => docNode(`kb:export-risk/doc.md#${name}`, type, name)
  const nb = (id: string, name: string, type = 'customs_export') => docNode(id, type, name)

  it('wires an exact normalized-name match at confidence 1', () => {
    const edges = crossSourceEdges([doc('中亚')], [nb('nocobase:customs_export:1', '中亚')], { tenantId: 't', now: NOW })
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      tenantId: 't',
      srcId: 'kb:export-risk/doc.md#中亚',
      dstId: 'nocobase:customs_export:1',
      relation: kgRelationId('corefers_with'),
      confidence: 1,
    })
    expect(edges[0]?.provenance).toMatchObject({ sourceSystem: 'kg-align', sourceId: 'kb:export-risk/doc.md#中亚' })
  })

  it('wires a containment match at the lower confidence and honors normalization', () => {
    const edges = crossSourceEdges([doc('中亚')], [nb('nocobase:expert_services:1', '中亚货运动线方案', 'expert_services')], { tenantId: 't', now: NOW })
    expect(edges).toHaveLength(1)
    expect(edges[0]?.confidence).toBe(0.75)
    // Company-suffix stripping applies to both sides before comparison.
    const normalized = crossSourceEdges(
      [doc('宏发食品（漯河）', 'company')],
      [nb('nocobase:customers:1', '宏发食品股份有限公司', 'customers')],
      { tenantId: 't', now: NOW },
    )
    expect(normalized).toHaveLength(1)
  })

  it('skips exact matches when exactOnly is set and containment matches always', () => {
    const both = crossSourceEdges([doc('中亚')], [
      nb('nocobase:customs_export:1', '中亚'),
      nb('nocobase:expert_services:1', '中亚货运动线方案', 'expert_services'),
    ], { tenantId: 't', now: NOW })
    expect(both).toHaveLength(2)
    const exactOnly = crossSourceEdges([doc('中亚')], [
      nb('nocobase:customs_export:1', '中亚'),
      nb('nocobase:expert_services:1', '中亚货运动线方案', 'expert_services'),
    ], { tenantId: 't', now: NOW, exactOnly: true })
    expect(exactOnly.map(edge => edge.dstId)).toEqual(['nocobase:customs_export:1'])
  })

  it('excludes short names and the person-name (Expert) doc type', () => {
    const edges = crossSourceEdges([
      doc('中'), // normalized length 1: below the floor
      docNode('kb:doc.md#王五', 'Expert', '王五'), // person-name type: excluded
    ], [
      nb('nocobase:experts:2', '王五', 'experts'),
      nb('nocobase:customs_export:1', '中国·中亚通道'),
    ], { tenantId: 't', now: NOW })
    expect(edges).toHaveLength(0)
  })

  it('ignores non-kb and non-nocobase node ids on the wrong side', () => {
    const edges = crossSourceEdges(
      [docNode('lakehouse:customs_export', 'Region', '中亚'), doc('中亚')],
      [docNode('kb:other.md#中亚', 'expert_services', '中亚'), nb('nocobase:customs_export:1', '中亚')],
      { tenantId: 't', now: NOW },
    )
    // Only the kb: doc seed pairs with the nocobase: row; the swapped sides
    // (lakehouse on the doc side, kb: on the row side) never pair.
    expect(edges.map(edge => `${edge.srcId}→${edge.dstId}`)).toEqual(['kb:export-risk/doc.md#中亚→nocobase:customs_export:1'])
  })
})

/** The extraction fixture: one Region entity coreferent with a NocoBase row. */
const EXTRACTION = JSON.stringify({
  entities: [
    { type: 'Region', name: '中亚' },
    { type: 'company', name: '漯河宏发食品有限公司' },
  ],
  relations: [],
})

const META = [
  { name: 'experts', title: '专家', filterTargetKey: 'id', fields: [{ name: 'name', type: 'string' }] },
  { name: 'expert_services', title: '专家服务', filterTargetKey: 'id', fields: [
    { name: 'expertId', type: 'integer' },
    { name: 'name', type: 'string' },
  ] },
  { name: 'customs_export', title: '出口数据', filterTargetKey: 'id', fields: [{ name: 'region', type: 'string' }] },
]

const ROWS = new Map<string, Array<Record<string, unknown>>>([
  ['experts', [{ id: 1, name: '张红喜' }]],
  ['expert_services', [
    { id: 1, expertId: 1, name: '中亚货运动线方案' },
    { id: 2, expertId: 1, name: '海外仓风险应对咨询' },
  ]],
  ['customs_export', [{ id: 1, region: '中亚' }]],
])

class FakeLlm extends Service {
  constructor(ctx: Context) {
    super(ctx, 'llm')
  }
  async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'text-delta', index: 0, text: EXTRACTION }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

let ctx: Context | undefined
let ncServer: Server | undefined
let corpusRoot: string | undefined
let mappingsPath: string | undefined

/** Write the minimal mappings file the track's collections need. */
async function writeMappings(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kg-cross-mappings-'))
  const path = join(dir, 'kg-mappings.yml')
  const text = [
    'version: 1',
    'sources:',
    '  - system: nocobase',
    '    collections:',
    '      - name: experts',
    '        anchor: Expert',
    '        titleField: name',
    '      - name: expert_services',
    '        anchor: ExpertService',
    '        titleField: name',
    '        fkLinks:',
    '          - field: expertId',
    '            target: experts',
    '            relation: expert_services.expert',
    '            style: plain-id',
    '      - name: customs_export',
    '        anchor: Dataset',
    '        titleField: region',
    'rules:',
    '  skipHiddenCollections: true',
    '  emptyFkNoEdge: true',
    '  derivesTitle: true',
  ].join('\n')
  await writeFile(path, `${text}\n`, 'utf8')
  return path
}

async function boot(overrides: Partial<KgBuildPluginConfig> = {}): Promise<Context> {
  const context = new Context()
  await context.plugin(KbGraphRuntime)
  await context.plugin(KbGraphSqlite, { path: ':memory:' })
  new FakeLlm(context)
  const ncUrl = ncServer === undefined ? '' : `http://127.0.0.1:${String((ncServer.address() as { port: number }).port)}`
  await context.plugin(KgBuildRuntime, {
    tenant: 't',
    nocobase: { baseUrl: ncUrl, apiKeyEnv: 'KG_TEST_NC_KEY', mappingsFile: mappingsPath as string },
    lakehouse: false,
    connector: false,
    corpus: { root: corpusRoot, maxDocuments: 5, maxChunksPerDocument: 2 },
    // These tests assert the deterministic pairing semantics; the v2 LLM
    // bridge has its own module tests (FakeLlm answers extraction JSON, not
    // judge verdicts).
    crossSourceAlign: { enabled: true, v2: false },
    pageSize: 100,
    intervalMs: 0,
    ...overrides,
  } as never)
  ctx = context
  return context
}

beforeEach(async () => {
  process.env.KG_TEST_NC_KEY = 'kg-test-token'
  ncServer = createServer((request, response) => {
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
      finish(200, { data: ROWS.get(listMatch[1] as string) ?? [], meta: { count: (ROWS.get(listMatch[1] as string) ?? []).length } })
      return
    }
    finish(404, { error: { code: 'NOT_FOUND' } })
  })
  await new Promise((resolve) => {
    ncServer?.listen(0, '127.0.0.1', () => { resolve(undefined) })
  })
  mappingsPath = await writeMappings()
  corpusRoot = await mkdtemp(join(tmpdir(), 'kg-cross-corpus-'))
  await writeFile(join(corpusRoot, 'note.md'), '中亚货运动线由张红喜主持。', 'utf8')
})

afterEach(async () => {
  delete process.env.KG_TEST_NC_KEY
  await ctx?.fiber.dispose()
  ctx = undefined
  await new Promise(resolve => ncServer?.close(resolve))
  ncServer = undefined
  if (corpusRoot !== undefined) await rm(corpusRoot, { recursive: true, force: true })
  corpusRoot = undefined
})

describe('KgBuildRuntime cross-source alignment leg', () => {
  it('wires corefers_with edges and connects the doc entity to 张红喜', async () => {
    const context = await boot()
    const report = await context.kgBuild.run()
    // Doc Region「中亚」pairs exactly with customs_export:1「中亚」and by
    // containment with expert_services:1「中亚货运动线方案」.
    expect(report.crossSourceAlign).toMatchObject({ edgesCreated: 2 })
    const docRegion = (await context.get('kbGraph')!.searchNodes('t', '中亚', undefined, 10))
      .find(hit => hit.id.startsWith('kb:'))
    expect(docRegion).toBeDefined()
    // The bridge works: the doc entity reaches 张红喜 through the coref edge
    // onto its service, then the fk edge onto the expert row.
    const walk = await context.get('kbGraph')!.subgraph('t', [docRegion?.id as string], 2)
    expect(walk.nodes.map(node => node.id)).toContain('nocobase:experts:1')
    const bridging = walk.edges.find(edge => String(edge.relation) === 'corefers_with')
    expect(bridging).toBeDefined()
    await context.fiber.dispose()
  })

  it('stays count-stable across idempotent reruns', async () => {
    const context = await boot()
    await context.kgBuild.run()
    const before = await context.get('kbGraph')!.stats('t')
    await context.kgBuild.run()
    const after = await context.get('kbGraph')!.stats('t')
    expect(after).toEqual(before)
    await context.fiber.dispose()
  })

  it('excludes manifest-external kb nodes from alignment and drops their stale coreferences', async () => {
    await mkdir(join(corpusRoot as string, 'corpus'), { recursive: true })
    await writeFile(join(corpusRoot as string, 'corpus', 'note.md'), '中亚货运动线由张红喜主持。', 'utf8')
    const manifestFile = join(corpusRoot as string, 'kb-corpus.yml')
    await writeFile(manifestFile, 'version: 1\ndirs:\n  - dir: corpus\n    kind: report\n', 'utf8')
    const context = await boot({ corpus: { root: corpusRoot, manifestFile, maxDocuments: 5, maxChunksPerDocument: 2 } })
    const graph = context.get('kbGraph')!
    await context.kgBuild.run()
    // Legacy drift: a connector-files doc entity that still pairs by name and
    // carries a live coreference from an earlier align pass.
    const ghost = docNode('kb:connector-files/drop.md#中亚', 'Region', '中亚')
    await graph.upsertNode(ghost)
    await graph.upsertEdges([{
      id: 'align-ghost',
      tenantId: 't',
      srcId: ghost.id,
      dstId: 'nocobase:customs_export:1',
      relation: kgRelationId('corefers_with'),
      confidence: 1,
      provenance: { sourceSystem: 'kg-align', sourceId: ghost.id, extractedAt: NOW },
      validFrom: NOW,
    }])
    const report = await context.kgBuild.run()
    // Only the manifest-scoped doc entities stay candidates; the ghost never
    // re-pairs (exact onto customs_export:1 plus containment onto the service).
    expect(report.crossSourceAlign?.docCandidates).toBe(2)
    expect(report.crossSourceAlign?.edgesCreated).toBe(2)
    // The ghost's stale coreference died with the sweep and stays dead.
    expect((await graph.expand('t', ghost.id, 10)).edges).toHaveLength(0)
    // The manifest-scoped doc entity still reaches the expert through the
    // rebuilt bridge.
    const walk = await graph.subgraph('t', ['kb:corpus/note.md#中亚'], 2)
    expect(walk.nodes.map(node => node.id)).toContain('nocobase:experts:1')
    await context.fiber.dispose()
  })

  it('respects the enabled and exactOnly config switches', async () => {
    const disabled = await boot({ crossSourceAlign: { enabled: false } })
    const off = await disabled.kgBuild.run()
    expect(off.crossSourceAlign).toMatchObject({ edgesCreated: 0 })
    await disabled.fiber.dispose()

    const exact = await boot({ crossSourceAlign: { enabled: true, exactOnly: true } })
    const on = await exact.kgBuild.run()
    // Exact only: the containment edge onto 中亚货运动线方案 drops out.
    expect(on.crossSourceAlign).toMatchObject({ edgesCreated: 1 })
    await exact.fiber.dispose()
  })
})
