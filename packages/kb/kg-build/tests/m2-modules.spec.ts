/**
 * M2 module tests: the FoodOn import plan (single-inheritance reduction,
 * anchors, cross-facet xrefs), the SHACL feedback loop's convergence and
 * quarantine, the cross-source v2 pass (LLM bridge verdicts, reject
 * tombstones, review queue, union-find clusters), and the Instruct-KGC
 * prompt/batch builders.
 */

import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import { describe, expect, it } from 'vitest'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import { planFoodOnImport, FOODON_SEED_TERMS, fetchFoodOnChildrenFromOls } from '../src/foodon-import.ts'
import { buildInstructKgcPrompt, splitOntologyView } from '../src/extract.ts'
import type { OntologyView } from '../src/extract.ts'
import { extractValidated, validateExtractionOutcome } from '../src/validate.ts'
import { corefPairKey, crossSourceEdgesV2, unionFindClusters } from '../src/cross-source.ts'
import type { CorefJudgeLlm, CorefVerdict } from '../src/cross-source.ts'
import type { ExtractionOutcome } from '../src/types.ts'

const view: OntologyView = {
  entityTypes: [
    { id: 'company', label: '企业' },
    { id: 'product', label: '食品产品' },
    { id: 'ingredient', label: '食品配料', props: [{ key: 'grade', datatype: 'string', enumValues: ['A', 'B'], required: true }] },
  ],
  relations: [
    { id: 'supplies', label: '供应', constraints: [{ domain: 'company', range: 'ingredient' }] },
    { id: 'uses', label: '使用', constraints: [{ domain: 'product', range: 'ingredient' }] },
    { id: 'produces', label: '生产', constraints: [{ domain: 'company', range: 'product' }] },
    { id: 'contains', label: '含有', constraints: [{ domain: 'product', range: 'additive' }] },
    { id: 'complies_with', label: '符合', constraints: [{ domain: 'product', range: 'standard' }] },
  ],
}

describe('planFoodOnImport', () => {
  const plan = planFoodOnImport()

  it('imports every curated term as a foodon-imported class with anchors', () => {
    expect(plan.nodeTypes).toHaveLength(FOODON_SEED_TERMS.length)
    const soybean = plan.nodeTypes.find(type => String(type.id) === 'foodon:03301415')
    expect(soybean?.foodonUri).toBe('http://purl.obolibrary.org/obo/FOODON_03301415')
    expect(soybean?.foodonId).toBe('FOODON:03301415')
    expect(soybean?.source).toBe('foodon-imported')
    expect(soybean?.synonyms).toContain('soya bean')
    // 张红喜场景四环：原料 soybean 与产品 tofu 都有落点。
    expect(plan.nodeTypes.some(type => String(type.id) === 'foodon:00004697')).toBe(true)
  })

  it('single-inherits along the product facet and demotes the second parent to a cross-facet xref', () => {
    const soybean = plan.nodeTypes.find(type => String(type.id) === 'foodon:03301415')
    expect(String(soybean?.extends)).toBe('foodon:00002266')
    const cross = plan.xrefs.find(xref => xref.subjectId === 'foodon:03301415' && xref.predicateId === 'cross-facet')
    expect(cross?.objectId).toBe('FOODON:00004331')
  })

  it('anchors the five subtree roots onto builtin classes', () => {
    const anchors = plan.xrefs.filter(xref => xref.predicateId === 'extends-builtin')
    expect(new Set(anchors.map(xref => xref.objectId))).toEqual(new Set(['product', 'ingredient', 'process', 'packaging', 'standard']))
  })

  it('warns on orphan parents and drops unknown cross-facet extras', () => {
    const warned = planFoodOnImport([
      { iri: 'FOODON_1', label: 'a', labelZh: 'a', parents: ['FOODON_MISSING'] },
      { iri: 'FOODON_2', label: 'b', labelZh: 'b', parents: ['FOODON_1', 'FOODON_GHOST'] },
      { iri: 'FOODON_3', label: 'c', labelZh: 'c', parents: [] },
    ])
    expect(warned.nodeTypes.map(type => String(type.id))).toEqual(['foodon:2'])
    expect(warned.warnings.some(text => text.includes('FOODON_1 references unknown parent'))).toBe(true)
    expect(warned.warnings.some(text => text.includes('cross-facet parent FOODON_GHOST unknown'))).toBe(true)
    expect(warned.warnings.some(text => text.includes('FOODON_3 carries no parent'))).toBe(true)
  })

  it('round-trips through the runtime registry with foodon fields intact', async () => {
    const ctx = new Context()
    const runtime = new KbGraphRuntime(ctx)
    const store = new KbGraphSqlite.SqliteGraphStore({ path: ':memory:', busyTimeoutMs: 5_000 }, DatabaseSync)
    const unregister = runtime.registerStoreProvider(store)
    for (const type of plan.nodeTypes) await runtime.persistNodeType(type)
    const stored = await runtime.storedRegistry()
    const soybean = stored.nodeTypes.find(type => String(type.id) === 'foodon:03301415')
    expect(soybean?.foodonUri).toBe('http://purl.obolibrary.org/obo/FOODON_03301415')
    expect(soybean?.source).toBe('foodon-imported')
    unregister()
    store.close()
    void ctx.fiber.dispose()
  })

  it('maps OLS children payloads through the fetch face', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ '_embedded': { terms: [
        { iri: 'http://purl.obolibrary.org/obo/FOODON_00000001', label: 'x', synonym: ['syn'] },
        { label: 'no iri' },
      ] } }),
    })) as unknown as typeof fetch
    const terms = await fetchFoodOnChildrenFromOls('http://purl.obolibrary.org/obo/FOODON_00001002', fetchImpl)
    expect(terms).toEqual([{ iri: 'FOODON_00000001', label: 'x', labelZh: 'x', parents: ['FOODON_00001002'], synonyms: ['syn'] }])
    const failing = (async () => ({ ok: false, status: 500, statusText: 'boom' })) as unknown as typeof fetch
    await expect(fetchFoodOnChildrenFromOls('http://purl.obolibrary.org/obo/FOODON_00001002', failing)).rejects.toThrow('OLS children request')
    const empty = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch
    expect(await fetchFoodOnChildrenFromOls('http://purl.obolibrary.org/obo/FOODON_00001002', empty)).toEqual([])
  })
})

describe('Instruct-KGC prompt protocol', () => {
  it('embeds the schema dict with directions and the hard closed-set rule', () => {
    const prompt = buildInstructKgcPrompt(view)
    expect(prompt).toContain('知识图谱三元组抽取')
    expect(prompt).toContain('supplies（供应）')
    expect(prompt).toContain('企业(company)→食品配料(ingredient)')
    expect(prompt).toContain('逐字使用')
  })

  it('splits the registry into bounded batches', () => {
    const batches = splitOntologyView(view, 2)
    expect(batches.map(batch => batch.relations.length)).toEqual([2, 2, 1])
    expect(splitOntologyView({ entityTypes: [], relations: [] }, 2)).toEqual([{ entityTypes: [], relations: [] }])
  })
})

describe('SHACL feedback loop', () => {
  const badEntity = (grade: string) => JSON.stringify({
    entities: [
      { type: 'ingredient', name: '大豆', props: { grade } },
      { type: 'company', name: '宏发食品' },
    ],
    relations: [],
  })
  const conforming = JSON.stringify({
    entities: [
      { type: 'ingredient', name: '大豆', props: { grade: 'A' } },
      { type: 'company', name: '宏发食品' },
    ],
    relations: [{ subject: '宏发食品', predicate: 'supplies', object: '大豆', confidence: 0.9 }],
  })

  it('repairs a violating answer within one feedback round', async () => {
    const answers = [badEntity('X'), conforming]
    const llm = { complete: async () => answers.shift() ?? conforming }
    const result = await extractValidated(llm, view, '宏发食品供应A级的-grade大豆', 'legacy')
    expect(result.rounds).toBe(1)
    expect(result.outcome.entities.map(entity => entity.name)).toContain('大豆')
    expect(result.quarantinedEntities).toEqual([])
  })

  it('quarantines entries that never conform and keeps survivors', async () => {
    const stuck = badEntity('X')
    const llm = {
      // The corrective prompt lands on the same violating answer (the model
      // never concedes) — the quarantine path under test.
      complete: async () => stuck,
    }
    const result = await extractValidated(llm, view, 'text', 'legacy')
    expect(result.rounds).toBe(3)
    expect(result.quarantinedEntities.map(entity => entity.name)).toEqual(['大豆'])
    expect(result.outcome.entities.map(entity => entity.name)).toEqual(['宏发食品'])
    expect(result.finalReport?.conforms).toBe(false)
  })

  it('breaks the loop on an unparseable corrective answer', async () => {
    const llm = { complete: async (system: string) => system.includes('未通过本体约束校验') ? 'not json' : badEntity('X') }
    const result = await extractValidated(llm, view, 'text', 'legacy')
    expect(result.quarantinedEntities.length + result.outcome.entities.length).toBe(2)
  })

  it('validates an adjudicated outcome directionally', () => {
    const outcome: ExtractionOutcome = {
      entities: [
        { name: '宏发食品', resolvedType: 'company' as never, claimedType: 'company', degraded: false },
        { name: '大豆', resolvedType: 'ingredient' as never, claimedType: 'ingredient', degraded: false, props: { grade: 'A' } },
      ],
      relations: [{ subjectName: '大豆', objectName: '宏发食品', relation: 'supplies' as never, confidence: 0.9 }],
      dropped: [],
      retried: false,
    }
    const report = validateExtractionOutcome(view, outcome)
    expect(report.conforms).toBe(false)
    expect(report.results.some(result => result.focusNode.includes('supplies'))).toBe(true)
  })
})

describe('cross-source v2', () => {
  const now = '2026-09-17T00:00:00.000Z'
  const docNode = (id: string, name: string) => ({
    id, tenantId: 't', type: 'product' as never, name, createdAt: now, updatedAt: now,
  })
  const rowNode = (id: string, name: string) => ({
    id, tenantId: 't', type: 'products' as never, name, createdAt: now, updatedAt: now,
  })
  const judgeOf = (table: Map<string, CorefVerdict>): CorefJudgeLlm => ({
    judge: async (doc, row) => table.get(`${doc.name}::${row.name}`) ?? { same: false, confidence: 0.9, reason: '默认拒绝' },
  })

  it('auto-accepts exact matches, lands high-confidence verdicts, and rejects negatives', async () => {
    const judge = judgeOf(new Map([
      ['中亚::中亚航线', { same: false, confidence: 0.95, reason: '一个是地区一个是航线' }],
      ['大豆蛋白::大豆蛋白粉', { same: true, confidence: 0.95, reason: '同一产品' }],
    ]))
    const result = await crossSourceEdgesV2(
      [docNode('kb:s1#中亚', '中亚'), docNode('kb:s1#大豆蛋白', '大豆蛋白')],
      [rowNode('nocobase:regions/1', '中亚'), rowNode('nocobase:products/1', '中亚航线'), rowNode('nocobase:products/2', '大豆蛋白粉')],
      { tenantId: 't', now, judge },
    )
    // 中亚 exact match (the deterministic floor) + 大豆蛋白 verdict edge;
    // the 中亚→中亚航线 containment pair rejects through the judge.
    expect(result.edges.map(edge => edge.id).sort()).toEqual(['kg-align:kb:s1#中亚:nocobase:regions/1', 'kg-align:kb:s1#大豆蛋白:nocobase:products/2'].sort())
    expect(result.judgedPairs).toBe(2)
    expect(result.rejected.map(pair => pair.docName)).toEqual(['中亚'])
  })

  it('queues sub-floor same-verdicts for review instead of landing them', async () => {
    const judge = judgeOf(new Map([
      ['方案::中亚货运动线方案', { same: true, confidence: 0.3, reason: '勉强' }],
    ]))
    const result = await crossSourceEdgesV2(
      [docNode('kb:s1#方案', '方案')],
      [rowNode('nocobase:products/1', '中亚货运动线方案')],
      { tenantId: 't', now, judge },
    )
    expect(result.edges).toEqual([])
    expect(result.review).toHaveLength(1)
    expect(result.review[0]?.verdict.reason).toBe('勉强')
  })

  it('skips rejected tombstone pairs and exactOnly containment pools', async () => {
    const judge = judgeOf(new Map())
    const tombstoned = await crossSourceEdgesV2(
      [docNode('kb:s1#中亚', '中亚')],
      [rowNode('nocobase:products/1', '中亚航线')],
      { tenantId: 't', now, judge, rejectedPairs: new Set([corefPairKey('kb:s1#中亚', 'nocobase:products/1')]) },
    )
    expect(tombstoned.judgedPairs).toBe(0)
    const exactOnly = await crossSourceEdgesV2(
      [docNode('kb:s1#中亚', '中亚')],
      [rowNode('nocobase:products/1', '中亚航线')],
      { tenantId: 't', now, judge, exactOnly: true },
    )
    expect(exactOnly.judgedPairs).toBe(0)
    expect(exactOnly.edges).toEqual([])
  })

  it('degrades to deterministic edges without a judge', async () => {
    const result = await crossSourceEdgesV2(
      [docNode('kb:s1#中亚', '中亚')],
      [rowNode('nocobase:products/1', '中亚')],
      { tenantId: 't', now },
    )
    expect(result.edges).toHaveLength(1)
    expect(result.judgedPairs).toBe(0)
  })

  it('materializes union-find clusters over accepted pairs', () => {
    const clusters = unionFindClusters(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c']])
    expect(clusters).toEqual([{ representative: 'a', members: ['a', 'b', 'c'] }])
    expect(unionFindClusters(['a'], [])).toEqual([])
  })
})
