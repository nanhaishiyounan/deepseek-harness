/**
 * The close-out batches: the pure-module rejection branches (mappings loader,
 * corpus manifest, OLS term shaping, cross-source guards), the pipeline
 * seams the earlier suites never reached — latestRun/runIncremental, the
 * FoodOn import leg inside run(), the disabled align report, the instruct-kgc
 * protocol's batch merge, and the LLM coref-judge adapter's verdict and
 * defense paths over a real composition — plus the final batch: the
 * quality/mappings readouts, the incremental diff arms, the judge's summary
 * and defense legs, the align cap, and the extraction/SHACL quarantine split.
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
import type { KgNode } from '@deepseek-ai/dsh-kb-graph'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import type { LakehouseTable } from '@deepseek-ai/dsh-lakehouse'
import type { ConnectorDatasetSummary } from '@deepseek-ai/dsh-connector'
import { parseMappings, loadMappingsFile } from '../src/mappings.ts'
import { loadCorpusManifest, parseCorpusManifest } from '../src/corpus-manifest.ts'
import { fetchFoodOnChildrenFromOls } from '../src/foodon-import.ts'
import { corefPairKey, crossSourceEdgesV2, kbScopeOfNodeId, unionFindClusters } from '../src/cross-source.ts'
import { buildInstructKgcPrompt, extractChunkProtocol } from '../src/extract.ts'
import { extractValidated, validateExtractionOutcome } from '../src/validate.ts'
import KgBuildRuntime, { LIST_NODES_CAP } from '../src/index.ts'
import type { KgBuildPluginConfig } from '../src/index.ts'

const NOW = '2026-09-01T08:00:00.000Z'

describe('mappings and corpus-manifest rejection branches', () => {
  it('rejects every malformed mappings field with the field path in the message', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kg-build-mappings-close-'))
    expect(() => loadMappingsFile(join(dir, 'nope.yml'))).toThrow('cannot read')
    const write = async (): Promise<string> => {
      const path = join(dir, `m${String(Math.random()).slice(2, 8)}.yml`)
      await writeFile(path, 'version: 1\nsources: []\n', 'utf8')
      expect(() => loadMappingsFile(path)).not.toThrow()
      return path
    }
    await write()
    expect(() => parseMappings('version: 1\nsources: 3\n', 'm.yml')).toThrow('expected an array')
    expect(() => parseMappings('- one\n', 'm.yml')).toThrow('expected a top-level mapping object')
    expect(() => parseMappings('version: 2\nsources: []\n', 'm.yml')).toThrow('expected 1, got 2')
    expect(() => parseMappings('version: 1\nsources:\n  - system: other\n    collections: []\n', 'm.yml')).toThrow('expected "nocobase"')
    expect(() => parseMappings('version: 1\nsources: []\nrules:\n  skipHiddenCollections: yes\n', 'm.yml')).toThrow('expected a boolean')
    expect(() => parseMappings([
      'version: 1',
      'sources:',
      '  - system: nocobase',
      '    collections:',
      '      - name: a',
      '      - name: a',
    ].join('\n'), 'm.yml')).toThrow('duplicate collection "a"')
    expect(() => parseMappings([
      'version: 1',
      'sources:',
      '  - system: nocobase',
      '    collections:',
      '      - name: a',
      '        mystery: 1',
    ].join('\n'), 'm.yml')).toThrow('unknown collection key')
    expect(() => parseMappings([
      'version: 1',
      'sources:',
      '  - system: nocobase',
      '    collections:',
      '      - name: a',
      '        fkLinks:',
      '          - field: f',
    ].join('\n'), 'm.yml')).toThrow('fkLinks[0].target')
    expect(() => parseMappings([
      'version: 1',
      'sources:',
      '  - system: nocobase',
      '    collections:',
      '      - name: a',
      '        fkLinks:',
      '          - field: f',
      '            target: t',
      '            relation: r',
      '            style: bogus',
    ].join('\n'), 'm.yml')).toThrow('expected plain-id or collection-address')
    expect(parseMappings([
      'version: 1',
      'sources:',
      '  - system: nocobase',
      '    collections:',
      '      - name: a',
      '        fkLinks:',
      '          - field: f',
      '            target: t',
      '            relation: r',
    ].join('\n'), 'm.yml').sources[0]?.collections[0]).toEqual({ name: 'a', fkLinks: [{ field: 'f', target: 't', relation: 'r' }] })
    await rm(dir, { recursive: true, force: true })
  })

  it('rejects malformed mappings fields with the field path in the message', () => {
    expect(() => parseMappings('version: 1\nsources:\n  - system: nocobase\n    collections:\n      - anchor: x\n', 'm.yml')).toThrow('m.yml.sources[0].collections[0].name')
    expect(() => parseMappings('version: 1\nsources:\n  - system: nocobase\n    collections:\n      - name: a\n        anchor: ""\n', 'm.yml')).toThrow('expected a non-empty string')
    expect(() => parseMappings('version: 1\nsources:\n  - system: nocobase\n    collections:\n      - name: a\n        fkLinks: 7\n', 'm.yml')).toThrow('expected an array')
    expect(() => parseMappings('version: 1\nsources: nocobase\n', 'm.yml')).toThrow('sources')
    expect(() => parseMappings('version: 1\nsources: []\nrules: []\n', 'm.yml')).toThrow('rules')
    expect(() => parseMappings('version: 1\nsources: []\nrules:\n  mystery: true\n', 'm.yml')).toThrow('unknown rule key')
    expect(parseMappings('version: 1\nsources: []\n', 'm.yml').rules).toEqual({ skipHiddenCollections: true, emptyFkNoEdge: true, derivesTitle: true })
  })

  it('rejects non-object entries at every mappings list level', () => {
    expect(() => parseMappings('version: 1\nsources:\n  - 3\n', 'm.yml')).toThrow('sources[0]')
    expect(() => parseMappings('version: 1\nsources:\n  - system: nocobase\n', 'm.yml')).toThrow('sources[0].collections')
    expect(() => parseMappings('version: 1\nsources:\n  - system: nocobase\n    collections:\n      - 9\n', 'm.yml')).toThrow('collections[0]')
    expect(() => parseMappings('version: 1\nsources:\n  - system: nocobase\n    collections:\n      - name: a\n        fkLinks:\n          - 7\n', 'm.yml')).toThrow('fkLinks[0]')
  })

  it('rejects corpus-manifest dir entries that are not mapping objects', () => {
    expect(() => parseCorpusManifest('version: 1\ndirs:\n  - 7\n', 'c.yml')).toThrow('expected a mapping object')
  })

  it('rejects corpus manifests whose root is not a mapping and fails loud on unreadable files', () => {
    expect(() => parseCorpusManifest('- a\n- b\n', 'c.yml')).toThrow('expected a top-level mapping object')
    expect(() => parseCorpusManifest('version: 1\ndirs: []\n', 'c.yml')).toThrow('expected a non-empty array')
    expect(() => loadCorpusManifest(join(tmpdir(), 'dsh-no-such-manifest.yml'))).toThrow('manifest read failed')
  })

  it('falls back to the raw IRI label when OLS terms carry none and skips non-FOODON IRIs', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ '_embedded': { terms: [
        { iri: 'http://purl.obolibrary.org/obo/FOODON_00001234' },
        { iri: 'http://example.org/OTHER_1', label: '外来词' },
        { iri: 'http://purl.obolibrary.org/obo/FOODON_00005678', label: '豆腐' },
      ] } }),
    })) as unknown as typeof fetch
    const terms = await fetchFoodOnChildrenFromOls('http://purl.obolibrary.org/obo/FOODON_00001002', fetchImpl)
    expect(terms).toEqual([
      { iri: 'FOODON_00001234', label: 'FOODON_00001234', labelZh: 'FOODON_00001234', parents: ['FOODON_00001002'] },
      { iri: 'FOODON_00005678', label: '豆腐', labelZh: '豆腐', parents: ['FOODON_00001002'] },
    ])
  })
})

describe('instruct-kgc prompt and batch merge', () => {
  it('falls back to the raw type id for constraints the view does not declare', () => {
    const view = {
      entityTypes: [{ id: 'company', label: '企业', props: [] }],
      relations: [{
        id: 'ships_to',
        label: '发货',
        constraints: [{ domain: 'ghost_a', range: 'ghost_b' }],
      }],
    } as never
    const prompt = buildInstructKgcPrompt(view)
    expect(prompt).toContain('ghost_a(ghost_a)→ghost_b(ghost_b)')
  })

  it('merges schema-dict batches and dedupes entities and relations across them', async () => {
    const view = {
      entityTypes: [
        { id: 'company', label: '企业', props: [] },
        { id: 'product', label: '产品', props: [] },
      ],
      relations: [1, 2, 3, 4, 5].map(index => ({
        id: `rel${String(index)}`,
        label: `关系${String(index)}`,
        constraints: [{ domain: 'company', range: 'product' }],
      })),
    } as never
    const answer = JSON.stringify({
      entities: [
        { type: 'company', name: '宏发食品' },
        { type: 'product', name: '酱油' },
      ],
      relations: [
        { subject: '宏发食品', predicate: 'rel1', object: '酱油', confidence: 0.9 },
        { subject: '宏发食品', predicate: 'rel1', object: '酱油', confidence: 0.9 },
      ],
    })
    const calls: string[] = []
    let served = 0
    const llm = {
      complete: async (system: string, _user: string): Promise<string> => {
        calls.push(system)
        served += 1
        return answer
      },
    }
    const outcome = await extractChunkProtocol(llm, view, 'chunk text', 'instruct-kgc')
    // Five relations over a split of four: two batches, both answered. The
    // predicate lives in the first batch's schema only, so the second batch
    // adjudicates both copies away; the first batch's duplicate collapses in
    // the merge and the outcome keeps one relation, both entities, and two
    // batch-scoped drops.
    expect(calls).toHaveLength(2)
    expect(served).toBe(2)
    expect(outcome.relations).toHaveLength(1)
    expect(outcome.entities.map(entity => entity.name)).toEqual(['宏发食品', '酱油'])
    expect(outcome.dropped).toHaveLength(2)
    expect(outcome.dropped.every(drop => drop.predicate === 'rel1')).toBe(true)
  })
})

describe('validate quarantine paths', () => {
  const view = {
    entityTypes: [
      { id: 'company', label: '企业', props: [{ key: '成立日', datatype: 'date' }] },
      { id: 'product', label: '产品', props: [] },
      { id: 'additive', label: '添加剂', props: [] },
    ],
    relations: [{
      id: 'produces',
      label: '生产',
      constraints: [{ domain: 'company', range: 'product', cardinality: { max: 1 } }],
    }],
  } as never

  it('types undeclared relation endpoints as the empty type id', () => {
    const outcome = {
      entities: [{ name: '宏发食品', claimedType: 'company', resolvedType: 'company', degraded: false }],
      relations: [
        { subjectName: '幽灵', relation: 'produces', objectName: '酱油', confidence: 0.9 },
        { subjectName: '宏发食品', relation: 'produces', objectName: '幻影', confidence: 0.9 },
      ],
      dropped: [],
    }
    const report = validateExtractionOutcome(view, outcome as never)
    expect(report.conforms).toBe(false)
  })

  it('quarantines max-cardinality relations out of the survivors after the retry budget', async () => {
    const answer = JSON.stringify({
      entities: [
        { type: 'company', name: '宏发食品' },
        { type: 'product', name: '酱油' },
        { type: 'product', name: '陈醋' },
      ],
      relations: [
        { subject: '宏发食品', predicate: 'produces', object: '酱油', confidence: 0.9 },
        { subject: '宏发食品', predicate: 'produces', object: '陈醋', confidence: 0.9 },
      ],
    })
    const llm = { complete: async (): Promise<string> => answer }
    const verdict = await extractValidated(llm, view, 'chunk', 'legacy', { maxRounds: 1 })
    expect(verdict.rounds).toBe(1)
    expect(verdict.outcome.relations).toHaveLength(1)
    expect(verdict.outcome.relations[0]?.objectName).toBe('酱油')
    expect(verdict.quarantinedRelations).toHaveLength(1)
    expect(verdict.quarantinedRelations[0]?.objectName).toBe('陈醋')
    expect(verdict.quarantinedEntities).toHaveLength(0)
    expect(verdict.finalReport?.conforms).toBe(false)
  })
  it('convicts entity prop-shape violations while clean outcomes conform', async () => {
    const outcome = {
      entities: [
        { name: '宏发食品', claimedType: 'company', resolvedType: 'company', degraded: false, props: { 成立日: 'not-a-date' } },
        { name: '酱油', claimedType: 'product', resolvedType: 'product', degraded: false },
      ],
      relations: [
        { subjectName: '宏发食品', relation: 'produces', objectName: '酱油', confidence: 1 },
      ],
      dropped: [],
    }
    const report = validateExtractionOutcome(view, outcome as never)
    expect(report.conforms).toBe(false)
    const clean = { entities: [{ name: '宏发食品', claimedType: 'company', resolvedType: 'company', degraded: false }], relations: [], dropped: [], retried: false }
    const cleanReport = validateExtractionOutcome(view, clean as never)
    expect(cleanReport.conforms).toBe(true)
  })
})

describe('cross-source guards', () => {
  const node = (id: string, name: string, type: string, summary?: string): KgNode => ({
    id, tenantId: 't', type: type as never, naturalKey: name, name, createdAt: NOW, updatedAt: NOW,
    ...(summary === undefined ? {} : { summary }),
  })

  it('orders the unordered pair key by the lexicographically smaller id', () => {
    expect(corefPairKey('aaa', 'zzz')).toBe('aaa::zzz')
    expect(corefPairKey('zzz', 'aaa')).toBe('aaa::zzz')
  })

  it('unions clusters from both root orderings and skips redundant pairs', () => {
    const clusters = unionFindClusters(['a', 'b', 'c'], [['b', 'a'], ['b', 'a'], ['a', 'c']])
    expect(clusters).toEqual([{ representative: 'a', members: ['a', 'b', 'c'] }])
  })

  it('reads scopes out of corpus node ids and rejects foreign shapes', () => {
    expect(kbScopeOfNodeId('kb:data/notes/a.md#宏发食品')).toBe('data/notes/a.md')
    expect(kbScopeOfNodeId('nocobase:experts:1')).toBeUndefined()
    expect(kbScopeOfNodeId('kb:no-separator')).toBeUndefined()
  })

  it('degrades to deterministic edges without a judge and respects the tombstone set', async () => {
    const docs = [node('kb:d.md#中亚', '中亚', 'Concept')]
    const rows = [node('nocobase:services:1', '中亚货运动线方案', 'ExpertService')]
    const fallback = await crossSourceEdgesV2(docs, rows, { tenantId: 't', now: NOW })
    expect(fallback.judgedPairs).toBe(0)
    expect(fallback.edges.every(edge => edge.provenance.sourceSystem === 'kg-align')).toBe(true)
    const calls: Array<[string, string]> = []
    const judge = {
      judge: async (doc: { name: string }, row: { name: string }) => {
        calls.push([doc.name, row.name])
        return { same: true, confidence: 0.95, reason: '同一条动线' }
      },
    }
    const judged = await crossSourceEdgesV2(docs, rows, { tenantId: 't', now: NOW, judge })
    expect(calls).toEqual([['中亚', '中亚货运动线方案']])
    expect(judged.judgedPairs).toBe(1)
    expect(judged.edges.some(edge => edge.fact?.includes('LLM 桥判'))).toBe(true)
    const tombstoned = await crossSourceEdgesV2(docs, rows, {
      tenantId: 't', now: NOW, judge,
      rejectedPairs: new Set(['kb:d.md#中亚::nocobase:services:1']),
    })
    expect(tombstoned.judgedPairs).toBe(0)
  })

  it('routes gray-band and negative verdicts and filters the candidate pool by prefix, type, and length', async () => {
    const docs = [
      node('kb:d.md#中亚', '中亚', 'Concept'),
      node('kb:d.md#短', '短', 'Expert'),
      node('nocobase:fake#伪文档', '中亚', 'Expert'),
      node('kb:d.md#天气', '冷锋过境', 'weather_front'),
    ]
    const rows = [
      node('nocobase:services:1', '中亚货运动线方案', 'ExpertService'),
      node('nocobase:orders:9', '中亚货运动线方案备选', 'Order'),
      node('kb:fake#伪行', '中亚货运动线方案', 'ExpertService'),
    ]
    const verdicts = [
      { same: true, confidence: 0.4, reason: '偏保守' },
      { same: false, confidence: 0.9, reason: '不是同一线路' },
    ]
    let index = 0
    const judge = {
      judge: async () => {
        const verdict = verdicts[Math.min(index, verdicts.length - 1)] as { same: boolean; confidence: number; reason: string }
        index += 1
        return verdict
      },
    }
    const gray = await crossSourceEdgesV2(docs, rows, { tenantId: 't', now: NOW, judge })
    expect(gray.judgedPairs).toBe(2)
    expect(gray.review).toHaveLength(1)
    expect(gray.rejected).toHaveLength(1)
    expect(gray.rejected[0]?.reason).toBe('不是同一线路')
  })

  it('carries doc and row summaries into the judge profiles', async () => {
    const docs = [node('kb:d.md#中亚', '中亚', 'Concept', '一家物流公司')]
    const rows = [node('nocobase:services:1', '中亚货运动线方案', 'ExpertService', '跨境动线服务')]
    const seen: Array<{ doc?: string; row?: string }> = []
    const judge = {
      judge: async (doc: { name: string; summary?: string }, row: { name: string; summary?: string }) => {
        const seenDoc = { ...(doc.summary === undefined ? {} : { doc: doc.summary }) }
        seen.push({ ...seenDoc, ...(row.summary === undefined ? {} : { row: row.summary }) })
        return { same: true, confidence: 0.95, reason: '同一家' }
      },
    }
    const result = await crossSourceEdgesV2(docs, rows, { tenantId: 't', now: NOW, judge })
    expect(seen).toEqual([{ doc: '一家物流公司', row: '跨境动线服务' }])
    expect(result.judgedPairs).toBe(1)
  })

  it('skips doc candidates whose normalized name is under the minimum length', async () => {
    const docs = [node('kb:d.md#甲', '甲', 'Concept')]
    const rows = [node('nocobase:services:1', '甲乙丙货源', 'ExpertService')]
    const judge = { judge: async (): Promise<{ same: boolean; confidence: number; reason: string }> => {
      throw new Error('short-name docs never reach the judge')
    } }
    const result = await crossSourceEdgesV2(docs, rows, { tenantId: 't', now: NOW, judge })
    expect(result.judgedPairs).toBe(0)
    expect(result.edges).toHaveLength(0)
  })

  it('honors an explicit exactOnly flag on the judgeless deterministic fallback', async () => {
    const docs = [node('kb:d.md#中亚', '中亚', 'Concept')]
    const rows = [node('nocobase:services:1', '中亚货运动线方案', 'ExpertService')]
    const loose = await crossSourceEdgesV2(docs, rows, { tenantId: 't', now: NOW, exactOnly: false })
    const strict = await crossSourceEdgesV2(docs, rows, { tenantId: 't', now: NOW, exactOnly: true })
    expect(loose.edges).toHaveLength(1)
    expect(strict.edges).toHaveLength(0)
  })
})

describe('pipeline close-out seams over the full composition', () => {
  const EXTRACTION = JSON.stringify({
    entities: [
      { type: 'Expert', name: '张红喜' },
      { type: 'company', name: '中亚' },
    ],
    relations: [
      { subject: '张红喜', predicate: 'offers', object: '中亚货运动线方案', confidence: 0.7 },
    ],
  })

  class FakeLlm extends Service {
    private replies: readonly string[]
    private call = 0
    public asked: string[] = []
    constructor(ctx: Context, replies: readonly string[]) {
      super(ctx, 'llm')
      this.replies = replies
    }
    async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
      const text = this.replies[Math.min(this.call, this.replies.length - 1)] ?? ''
      this.call += 1
      this.asked.push(text)
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }

  class FakeLakehouse extends Service {
    constructor(ctx: Context) { super(ctx, 'lakehouse') }
    async listTables(): Promise<readonly LakehouseTable[]> { return [] }
  }

  class FakeConnector extends Service {
    constructor(ctx: Context) { super(ctx, 'connector') }
    async discover(): Promise<readonly ConnectorDatasetSummary[]> { return [] }
  }

  const META = [
    { name: 'experts', title: '专家', filterTargetKey: 'id', fields: [{ name: 'name', type: 'string', title: '姓名' }] },
    { name: 'expert_services', title: '专家服务', filterTargetKey: 'id', fields: [{ name: 'expertId', type: 'integer' }, { name: 'name', type: 'string' }] },
  ]
  const ROWS = new Map<string, Array<Record<string, unknown>>>([
    ['experts', [{ id: 1, name: '张红喜' }]],
    ['expert_services', [{ id: 1, expertId: 1, name: '中亚货运动线方案' }]],
  ])

  let ctx: Context | undefined
  let lastLlm: FakeLlm | undefined
  let ncServer: Server | undefined
  let ncUrl: string | undefined
  let scratch: string | undefined

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
        finish(200, { data: ROWS.get(listMatch[1] as string) ?? [], meta: { count: 1, page: 1, pageSize: 100 } })
        return
      }
      finish(404, { error: { code: 'NOT_FOUND' } })
    })
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => { resolve(server) })
    })
  }

  /** Boot the in-memory composition with the multi-reply fake llm. */
  async function boot(
    overrides: Partial<KgBuildPluginConfig> = {},
    replies: readonly string[] = [EXTRACTION],
    mappingsLines: readonly string[] = [
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
    ],
  ): Promise<void> {
    const context = new Context()
    await context.plugin(KbGraphRuntime)
    await context.plugin(KbGraphSqlite, { path: ':memory:' })
    new FakeLakehouse(context)
    new FakeConnector(context)
    const llm = new FakeLlm(context, replies)
    lastLlm = llm
    const mappingsPath = join(scratch!, 'kg-mappings.yml')
    await writeFile(mappingsPath, mappingsLines.join('\n'), 'utf8')
    await context.plugin(KgBuildRuntime, {
      tenant: 't',
      nocobase: { baseUrl: ncUrl, apiKeyEnv: 'KG_TEST_NC_KEY', mappingsFile: mappingsPath },
      lakehouse: true,
      connector: true,
      foodon: true,
      pageSize: 100,
      intervalMs: 0,
      extract: { protocol: 'instruct-kgc' },
      ...overrides,
    } as never)
    ctx = context
  }

  beforeEach(async () => {
    process.env.KG_TEST_NC_KEY = 'kg-test-token'
    ncServer = await bootMockNocoBase()
    ncUrl = `http://127.0.0.1:${String((ncServer.address() as { port: number }).port)}`
    scratch = await mkdtemp(join(tmpdir(), 'kg-build-close-'))
    await writeFile(join(scratch, 'corpus.md'), '张红喜主持中亚货运动线。', 'utf8')
  })

  afterEach(async () => {
    delete process.env.KG_TEST_NC_KEY
    await ctx?.fiber.dispose()
    ctx = undefined
    lastLlm = undefined
    await new Promise(resolve => ncServer?.close(resolve))
    ncServer = undefined
    if (scratch !== undefined) await rm(scratch, { recursive: true, force: true })
    scratch = undefined
  })

  it('answers latestRun before and after a full run, and the FoodOn leg lands its classes', async () => {
    await boot({ corpus: { root: scratch!, maxDocuments: 5, maxChunksPerDocument: 2 } })
    const runtime = ctx!.kgBuild
    await expect(runtime.latestRun()).resolves.toBeUndefined()
    const report = await runtime.run()
    expect(report.foodonTypes).toBeGreaterThan(0)
    expect(report.ontologyRevision).toBeDefined()
    const after = await runtime.latestRun() as { report: { foodonTypes: number } } | undefined
    expect(after?.report.foodonTypes).toBe(report.foodonTypes)
  })

  it('runs incrementally: first pass lists every scope, the fingerprint-stable second pass lists none', async () => {
    await boot({ corpus: { root: scratch!, maxDocuments: 5, maxChunksPerDocument: 2 } })
    const runtime = ctx!.kgBuild
    const first = await runtime.runIncremental()
    expect(first.changedScopes.length).toBeGreaterThan(0)
    expect(first.changedScopes.every(entry => entry.sourceSystem.length > 0)).toBe(true)
    const second = await runtime.runIncremental()
    expect(second.changedScopes).toEqual([])
  })

  it('bridges gray-zone containment pairs through the LLM judge with its defense answers', async () => {
    const replies = [
      EXTRACTION,
      EXTRACTION,
      EXTRACTION,
      '{"same": true, "confidence": 0.95, "reason": "同一条动线"}',
      '完全不是 JSON',
      '{"broken": ',
      '{"same": true, "confidence": 0.55, "reason": "偏保守"}',
    ]
    await boot({ corpus: { root: scratch!, maxDocuments: 5, maxChunksPerDocument: 2 } }, replies)
    const runtime = ctx!.kgBuild
    const first = await runtime.run()
    expect((first.crossSourceAlign?.judgedPairs ?? 0)).toBeGreaterThanOrEqual(1)
    await runtime.runIncremental()
    await runtime.runIncremental()
    await runtime.runIncremental()
  })

  it('omits the align report when the pass is disabled in config', async () => {
    await boot({ crossSourceAlign: { enabled: false } })
    const runtime = ctx!.kgBuild
    const report = await runtime.run()
    expect(report.crossSourceAlign).toMatchObject({ docCandidates: 0, edgesCreated: 0, judgedPairs: 0 })
  })

  it('answers qualityReport before and after a persisted run', async () => {
    await boot({ corpus: { root: scratch!, maxDocuments: 5, maxChunksPerDocument: 2 } })
    const runtime = ctx!.kgBuild
    const before = await runtime.qualityReport()
    expect(before.nodes).toBe(0)
    expect(before.coverage).toBeUndefined()
    expect(before.lastRunAt).toBeUndefined()
    await runtime.run()
    const after = await runtime.qualityReport()
    expect(after.nodes).toBeGreaterThan(0)
    expect(after.coverage?.ratio).toBeTypeOf('number')
    expect(after.lastRunAt).toBeTruthy()
  })

  it('serves the mappings readout before and after a run, bare and full entries alike', async () => {
    await boot({ corpus: { root: scratch!, maxDocuments: 5, maxChunksPerDocument: 2 } }, [EXTRACTION], [
      'version: 1',
      'sources:',
      '  - system: nocobase',
      '    collections:',
      '      - name: experts',
      '      - name: expert_services',
      '        anchor: ExpertService',
      '        titleField: name',
      '        fkLinks:',
      '          - field: expertId',
      '            target: experts',
      '            relation: expert_services.expert',
      '            style: plain-id',
    ])
    const runtime = ctx!.kgBuild
    const before = await runtime.mappings()
    expect(before.version).toBe(1)
    expect(before.rules).toEqual({ skipHiddenCollections: true, emptyFkNoEdge: true, derivesTitle: true })
    expect(before.collections).toEqual([
      { name: 'experts', fkLinkCount: 0 },
      { name: 'expert_services', anchor: 'ExpertService', titleField: 'name', fkLinkCount: 1 },
    ])
    expect(before.lastRun).toBeUndefined()
    await runtime.run()
    const after = await runtime.mappings()
    expect(after.lastRun?.ruleHits.R12).toBe(2)
    expect(after.lastRun?.collections).toHaveLength(2)
    expect(after.file.endsWith('kg-mappings.yml')).toBe(true)
  })

  it('runs without a mappings file: R12 stays zero and the mappings readout fails loud', async () => {
    await boot({
      nocobase: undefined,
      corpus: { root: scratch!, maxDocuments: 5, maxChunksPerDocument: 2 },
    } as never)
    const runtime = ctx!.kgBuild
    const report = await runtime.run()
    expect(report.ruleHits.R12).toBe(0)
    expect(report.collections).toEqual([])
    await expect(runtime.mappings()).rejects.toThrow('no mappings file configured')
  })

  it('defaults the corpus protocol through the schema and the raw-config fallback', async () => {
    await boot({ extract: undefined, corpus: { root: scratch!, maxDocuments: 5, maxChunksPerDocument: 2 } } as never)
    // Cordis materializes the extract block with the schema default (legacy):
    // one single-prompt extraction call plus one gray-zone judge call.
    const cordisReport = await ctx!.kgBuild.run()
    expect(cordisReport.corpus?.documents).toBe(1)
    expect(lastLlm!.asked).toHaveLength(2)
    // A raw config object constructed directly (no cordis validation) keeps
    // the constructor's own fallback: the schema-dict protocol batches the
    // registry's relations, so the extraction asks at least twice.
    const rawCtx = new Context()
    try {
      await rawCtx.plugin(KbGraphRuntime)
      await rawCtx.plugin(KbGraphSqlite, { path: ':memory:' })
      new FakeLakehouse(rawCtx)
      new FakeConnector(rawCtx)
      const rawLlm = new FakeLlm(rawCtx, [EXTRACTION])
      const rawRuntime = new KgBuildRuntime(rawCtx, {
        tenant: 't',
        nocobase: { baseUrl: ncUrl, apiKeyEnv: 'KG_TEST_NC_KEY', mappingsFile: join(scratch!, 'kg-mappings.yml') },
        lakehouse: true,
        connector: true,
        foodon: false,
        pageSize: 100,
        intervalMs: 0,
        corpus: { root: scratch!, maxDocuments: 5, maxChunksPerDocument: 2 },
      })
      const rawReport = await rawRuntime.run()
      expect(rawReport.corpus?.documents).toBe(1)
      expect(rawLlm.asked.length).toBeGreaterThan(2)
    } finally {
      await rawCtx.fiber.dispose()
    }
  })

  it('runs the corpus leg ungated when extract.shaclGate is false', async () => {
    await boot({
      extract: { shaclGate: false },
      corpus: { root: scratch!, extensions: [], maxDocuments: 5, maxChunksPerDocument: 2 },
    })
    const runtime = ctx!.kgBuild
    const report = await runtime.run()
    expect(report.corpus?.chunks).toBe(1)
    expect(report.corpus?.shaclRounds).toBe(0)
    expect(report.corpus?.quarantinedEntities).toBe(0)
    expect(report.corpus?.quarantinedRelations).toBe(0)
    // One legacy extraction call plus one gray-zone judge call (the leftover
    // containment pair 中亚 ⊂ 中亚货运动线方案 still judges ungated).
    expect(lastLlm!.asked).toHaveLength(2)
    expect(report.crossSourceAlign).toMatchObject({ judgedPairs: 1, rejectedPairs: 1 })
  })

  it('seeds gray-zone pairs with summaries through the judge and its defense answers', async () => {
    const replies = [
      '{"same": true, "confidence": 0.95, "reason": "同一家货源"}',
      '完全不是 JSON',
      '{broken}',
    ]
    // No corpus root: every reply goes to the judge, none to extraction.
    await boot({}, replies)
    const graph = ctx!.get('kbGraph')!
    await graph.upsertNode({
      id: 'kb:notes/q.md#奇亚', tenantId: 't', type: kgNodeTypeId('Service'),
      naturalKey: '奇亚', name: '奇亚', summary: '新引进的超级食品原料', createdAt: NOW, updatedAt: NOW,
    })
    for (const [index, suffix] of ['一', '二', '三'].entries()) {
      await graph.upsertNode({
        id: `nocobase:experts:${String(70 + index)}`, tenantId: 't', type: kgNodeTypeId('ExpertService'),
        naturalKey: `奇亚籽货源${suffix}`, name: `奇亚籽货源${suffix}`, summary: `供货说明${suffix}`,
        createdAt: NOW, updatedAt: NOW,
      })
    }
    const runtime = ctx!.kgBuild
    const report = await runtime.run()
    expect(report.crossSourceAlign).toMatchObject({ judgedPairs: 3, rejectedPairs: 2, edgesCreated: 1 })
  })

  it('restricts matching to exact pairs when crossSourceAlign.exactOnly is on', async () => {
    await boot({ crossSourceAlign: { exactOnly: true } })
    const graph = ctx!.get('kbGraph')!
    await graph.upsertNode({
      id: 'kb:notes/w.md#中亚', tenantId: 't', type: kgNodeTypeId('Service'),
      naturalKey: '中亚', name: '中亚', createdAt: NOW, updatedAt: NOW,
    })
    await graph.upsertNode({
      id: 'nocobase:experts:8', tenantId: 't', type: kgNodeTypeId('ExpertService'),
      naturalKey: '中亚', name: '中亚', createdAt: NOW, updatedAt: NOW,
    })
    const runtime = ctx!.kgBuild
    const report = await runtime.run()
    expect(report.crossSourceAlign).toMatchObject({ judgedPairs: 0, edgesCreated: 1 })
  })

  it('fails the align pass when the tenant enumeration hits the cap', { timeout: 30_000 }, async () => {
    await boot({ nocobase: undefined } as never)
    const graph = ctx!.get('kbGraph')!
    for (let index = 0; index < LIST_NODES_CAP; index += 1) {
      await graph.upsertNode({
        id: `kb:bulk#${String(index)}`, tenantId: 't', type: kgNodeTypeId('Region'),
        naturalKey: `bulk${String(index)}`, name: `bulk${String(index)}`, createdAt: NOW, updatedAt: NOW,
      })
    }
    const runtime = ctx!.kgBuild
    await expect(runtime.run()).rejects.toThrow('enumeration cap')
  })

  it('reports manifest-scoped over-budget scans with the manifest directory count', async () => {
    const docsDir = join(scratch!, 'docs')
    await mkdir(docsDir)
    await writeFile(join(docsDir, 'a.md'), '甲', 'utf8')
    await writeFile(join(docsDir, 'b.md'), '乙', 'utf8')
    const manifestPath = join(scratch!, 'corpus-manifest.yml')
    await writeFile(manifestPath, 'version: 1\ndirs:\n  - dir: docs\n    kind: document\n', 'utf8')
    await boot({
      corpus: { root: scratch!, manifestFile: manifestPath, maxDocuments: 1, maxChunksPerDocument: 2 },
    })
    const runtime = ctx!.kgBuild
    await expect(runtime.run()).rejects.toThrow('across 1 manifest directories')
  })

  it('exercises the incremental diff arms: re-extracted scopes and hashless legacy rows', async () => {
    await boot({ corpus: { root: scratch!, maxDocuments: 5, maxChunksPerDocument: 2 } })
    // A legacy row without a content hash feeds the before-snapshot's empty
    // fingerprint arm; untouched rows never re-enter the diff.
    const graph = ctx!.get('kbGraph')!
    await graph.putSourceRun({ sourceSystem: 'kb', scope: 'z-legacy', lastRunAt: '2026-09-01T03:00:00.000Z' })
    const runtime = ctx!.kgBuild
    const first = await runtime.runIncremental()
    expect(first.changedScopes.some(entry => entry.scope === 'z-legacy')).toBe(false)
    await writeFile(join(scratch!, 'corpus.md'), '张红喜主持中亚货运动线（修订）。', 'utf8')
    const second = await runtime.runIncremental()
    const rewritten = second.changedScopes.find(entry => entry.sourceSystem === 'kb' && entry.scope === 'corpus.md')
    expect(rewritten?.previousRunAt).toBeTruthy()
    expect(rewritten?.updated).toBe(true)
  })

  it('carries cardinality-bearing registry constraints through the extraction view', async () => {
    const REGION_EXTRACTION = JSON.stringify({
      entities: [
        { type: 'Region', name: '中亚仓' },
        { type: 'Region', name: '莫斯科仓' },
      ],
      relations: [
        { subject: '中亚仓', predicate: 'located_near', object: '莫斯科仓', confidence: 0.9, evidence: '两仓铁路相邻' },
      ],
    })
    await boot({ corpus: { root: scratch!, maxDocuments: 5, maxChunksPerDocument: 2 } }, [REGION_EXTRACTION])
    const graph = ctx!.get('kbGraph')!
    await graph.persistRelation({
      id: kgRelationId('located_near'),
      label: '邻近',
      description: '两地运输相邻',
      constraints: [{ domain: kgNodeTypeId('Region'), range: kgNodeTypeId('Region'), cardinality: { min: 1, max: 4 } }],
      kind: 'object',
      source: 'builtin-ontology',
    })
    const runtime = ctx!.kgBuild
    const report = await runtime.run()
    expect(report.corpus?.extractedRelations).toBe(1)
    expect(report.corpus?.quarantinedRelations).toBe(0)
  })
})
