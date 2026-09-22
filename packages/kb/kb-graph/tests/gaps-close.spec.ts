/**
 * The close-out batch over the kb-graph ecosystem: validateOntology's four
 * referential throws, louvain/PPR boundary graphs (self loops, orphans,
 * zero-weight edges), the SHACL shapes' optional-prop variants and unregistered
 * relations, the KGCL ontology-change previews, and the runtime's ontology-edit
 * rejection matrix plus the PPR/xref/reject read-write APIs.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import KbGraphRuntime, { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import {
  builtinOntology, compileShaclShapes, formatOntologyChange, formatShaclFeedback, louvainCommunities,
  personalizedPageRank, previewOfOntologyOp, validateOntology, validateShaclCandidates,
} from '@deepseek-ai/dsh-kb-graph'

const NOW = '2026-09-19T08:00:00.000Z'

describe('validateOntology referential throws', () => {
  const seed = builtinOntology()

  it('rejects unknown extends, constraint endpoints, and inverses by name', () => {
    expect(() =>{  validateOntology({ version: '1', nodeTypes: [...seed.nodeTypes, { id: 'Odd', label: '孤儿', layer: 'domain', extends: 'Missing', props: [], source: 'agent-defined', status: 'draft' } as never], relations: seed.relations }) }).toThrow('extends unknown type "Missing"')
    expect(() =>{  validateOntology({ version: '1', nodeTypes: seed.nodeTypes, relations: [...seed.relations, { id: 'bad_domain', label: '坏域', constraints: [{ domain: 'Ghost', range: 'company' }], kind: 'object', source: 'agent-defined' } as never] }) }).toThrow('unknown domain "Ghost"')
    expect(() =>{  validateOntology({ version: '1', nodeTypes: seed.nodeTypes, relations: [...seed.relations, { id: 'bad_range', label: '坏值域', constraints: [{ domain: 'company', range: 'Ghost' }], kind: 'object', source: 'agent-defined' } as never] }) }).toThrow('unknown range "Ghost"')
    expect(() =>{  validateOntology({ version: '1', nodeTypes: seed.nodeTypes, relations: [...seed.relations, { id: 'bad_inverse', label: '坏反义', constraints: [], kind: 'object', inverseOf: 'ghost', source: 'agent-defined' } as never] }) }).toThrow('unknown inverse "ghost"')
  })
})

describe('louvain and PPR boundary graphs', () => {
  it('keeps orphans and self loops out of the walk and modularity math', () => {
    const result = louvainCommunities(['a', 'b', 'lonely'], [['a', 'b'], ['a', 'a']])
    expect(result.communities).toBe(2)
    expect(new Set(result.assignments.values()).size).toBe(2)
    expect(result.assignments.get('lonely')).toBeDefined()
    expect(louvainCommunities(['only'], []).communities).toBe(1)
  })

  it('splits two balanced dyads into two communities', () => {
    const result = louvainCommunities(['a', 'b', 'c', 'd'], [['a', 'b'], ['c', 'd']])
    expect(result.communities).toBe(2)
    expect(result.assignments.get('a')).toBe(result.assignments.get('b'))
    expect(result.assignments.get('a')).not.toBe(result.assignments.get('c'))
  })

  it('skips self loops, foreign endpoints, and zero-weight edges in the PPR walk', () => {
    const ranking = personalizedPageRank(['a', 'b'], [['a', 'a'], ['a', 'ghost'], ['a', 'b']], ['a'], { topN: 5 })
    expect(ranking.some(entry => entry.nodeId === 'b')).toBe(true)
    expect(personalizedPageRank(['solo'], [], ['solo'], { topN: 3 }).map(entry => entry.nodeId)).toEqual(['solo'])
  })
})

describe('SHACL optional prop shapes and unregistered relations', () => {
  const view = {
    nodeTypes: [
      { id: 'company', label: '企业', props: [{ key: '成立日', datatype: 'date' }, { key: '原始JSON', datatype: 'json' }, { key: '状态', enumValues: ['active', 'closed'] }, { key: '编码', pattern: '^[A-Z]{2}$' }] },
      { id: 'product', label: '产品', props: [] },
    ],
    relations: [{ id: 'produces', label: '生产', constraints: [{ domain: 'company', range: 'product' }] }],
  } as never

  it('checks datatypes, enums, patterns, and direction over the compiled shapes', () => {
    const shapes = compileShaclShapes(view)
    const report = validateShaclCandidates(shapes, [
      { name: '宏发食品', typeId: 'company', props: { 成立日: 42, 原始JSON: '不是对象', 状态: 'paused', 编码: 'zz' } },
      { name: '酱油', typeId: 'product' },
    ], [
      { relationId: kgRelationId('produces'), srcName: '宏发食品', srcTypeId: 'company', dstName: '酱油', dstTypeId: 'product' },
      { relationId: 'ghost_rel', srcName: '宏发食品', srcTypeId: 'company', dstName: '酱油', dstTypeId: 'product' },
    ])
    expect(report.conforms).toBe(false)
    const messages = report.results.map(result => result.message)
    expect(messages.some(message => message.includes('日期'))).toBe(true)
    expect(messages.some(message => message.includes('关系 "ghost_rel" 不在本体注册表中'))).toBe(true)
    expect(formatShaclFeedback(report)).toContain('1.')
    expect(formatShaclFeedback({ conforms: true, results: [] })).toBe('')
  })
})

describe('KGCL ontology-change previews', () => {
  it('renders every op family, both deprecate forms, and the cardinality bound variants', () => {
    expect(previewOfOntologyOp({ op: 'add_node', targetId: 'Snack', label: '零食', parentId: 'product' })).toContain('零食')
    expect(previewOfOntologyOp({ op: 'rename_node', targetId: 'Snack', label: '轻零食' })).toContain('轻零食')
    expect(previewOfOntologyOp({ op: 'set_parent', targetId: 'Snack', newParentId: 'Concept' })).toContain('Concept')
    expect(previewOfOntologyOp({ op: 'deprecate_node', targetId: 'Snack' })).toBe('废弃类 Snack')
    expect(previewOfOntologyOp({ op: 'deprecate_node', targetId: 'Snack', replacedBy: 'product' })).toContain('替代 product')
    expect(previewOfOntologyOp({ op: 'change_cardinality', relationId: kgRelationId('produces'), domainId: 'company', rangeId: 'product', min: 1, max: 5 })).toContain('1..5')
    expect(previewOfOntologyOp({ op: 'change_cardinality', relationId: kgRelationId('produces'), domainId: 'company', rangeId: 'product' })).toContain('0..n')
    expect(formatOntologyChange([
      { op: 'add_node', targetId: 'Snack', label: '零食', parentId: 'product' },
      { op: 'rename_node', targetId: 'Snack', label: '轻零食' },
    ])).toContain('~ ')
  })
})

describe('kb-graph runtime ontology-edit matrix and read-write APIs', () => {
  let root: string | undefined
  let ctx: Context | undefined

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'kb-graph-gaps-'))
    const context = new Context()
    await context.plugin(KbGraphRuntime)
    await context.plugin(KbGraphSqlite, { path: ':memory:' })
    ctx = context
  })

  afterEach(async () => {
    await ctx?.fiber.dispose()
    ctx = undefined
    if (root !== undefined) await rm(root, { recursive: true, force: true })
    root = undefined
  })

  it('rejects every malformed KGCL op set with its named invariant', async () => {
    const runtime = ctx!.kbGraph
    await expect(runtime.applyOntologyOps([{ op: 'add_node', targetId: '9bad', label: '坏', parentId: 'Object' }])).rejects.toThrow('must start with a letter')
    await expect(runtime.applyOntologyOps([{ op: 'add_node', targetId: 'Snack', label: '  ', parentId: 'Object' }])).rejects.toThrow('non-empty label')
    await expect(runtime.applyOntologyOps([{ op: 'add_node', targetId: 'company', label: '重名', parentId: 'Object' }])).rejects.toThrow('already registered')
    await expect(runtime.applyOntologyOps([{ op: 'add_node', targetId: 'Snack', label: '零食' }])).rejects.toThrow('needs a parent')
    await expect(runtime.applyOntologyOps([{ op: 'add_node', targetId: 'Snack', label: '零食', parentId: 'Ghost' }])).rejects.toThrow('not registered')
    await runtime.applyOntologyOps([{ op: 'add_node', targetId: 'Legacy', label: '旧类', parentId: 'Object' }, { op: 'deprecate_node', targetId: 'Legacy' }])
    await expect(runtime.applyOntologyOps([{ op: 'add_node', targetId: 'Snack', label: '零食', parentId: 'Legacy' }])).rejects.toThrow('deprecated')
    await expect(runtime.applyOntologyOps([{ op: 'rename_node', targetId: 'Ghost', label: '无' }])).rejects.toThrow('not registered')
    await expect(runtime.applyOntologyOps([{ op: 'rename_node', targetId: 'company', label: '' }])).rejects.toThrow('non-empty label')
    await expect(runtime.applyOntologyOps([{ op: 'set_parent', targetId: 'Ghost', newParentId: 'Object' }])).rejects.toThrow('not registered')
    await expect(runtime.applyOntologyOps([{ op: 'set_parent', targetId: 'product', newParentId: 'Ghost' }])).rejects.toThrow('not registered')
    await expect(runtime.applyOntologyOps([{ op: 'set_parent', targetId: 'product', newParentId: 'product' }])).rejects.toThrow('cycle')
    await expect(runtime.applyOntologyOps([{ op: 'deprecate_node', targetId: 'Ghost' }])).rejects.toThrow('not registered')
    await expect(runtime.applyOntologyOps([{ op: 'deprecate_node', targetId: 'company', replacedBy: 'Ghost' }])).rejects.toThrow('not registered')
    await expect(runtime.applyOntologyOps([{ op: 'change_cardinality', relationId: 'ghost' as never, domainId: 'company', rangeId: 'product' }])).rejects.toThrow('not registered')
    await expect(runtime.applyOntologyOps([{ op: 'change_cardinality', relationId: kgRelationId('produces'), domainId: 'company', rangeId: 'risk' }])).rejects.toThrow('no legal pair')
    await expect(runtime.applyOntologyOps([{ op: 'change_cardinality', relationId: kgRelationId('produces'), domainId: 'company', rangeId: 'product', min: -1 }])).rejects.toThrow('non-negative')
    await expect(runtime.applyOntologyOps([{ op: 'change_cardinality', relationId: kgRelationId('produces'), domainId: 'company', rangeId: 'product', min: 5, max: 2 }])).rejects.toThrow('exceeds max')
    await expect(runtime.applyOntologyOps([])).rejects.toThrow('op set is empty')
  })

  it('applies cardinality bounds in all three shapes and deprecates with a replacement', async () => {
    const runtime = ctx!.kbGraph
    const first = await runtime.applyOntologyOps([{ op: 'change_cardinality', relationId: kgRelationId('produces'), domainId: 'company', rangeId: 'product', min: 1 }])
    expect(first.applied[0]).toContain('基数改为')
    await runtime.applyOntologyOps([{ op: 'change_cardinality', relationId: kgRelationId('produces'), domainId: 'company', rangeId: 'product', max: 9 }])
    const unbounded = await runtime.applyOntologyOps([{ op: 'change_cardinality', relationId: kgRelationId('produces'), domainId: 'company', rangeId: 'product' }])
    expect(unbounded.applied[0]).toContain('0..n')
    const deprecating = await runtime.applyOntologyOps([{ op: 'add_node', targetId: 'Snack', label: '零食', parentId: 'product' }, { op: 'deprecate_node', targetId: 'Snack', replacedBy: 'product' }])
    expect(deprecating.applied[1]).toContain('替代 product')
    expect(runtime.nodeType(kgNodeTypeId('Snack'))?.status).toBe('deprecated')
  })

  it('answers empty PPR neighborhoods, xref and reject round-trips, build-run reads, and tie-broken communities', async () => {
    const runtime = ctx!.kbGraph
    const empty = await runtime.pprNeighborhood('t', [], 10)
    expect(empty).toEqual({ ranking: [], subgraph: { nodes: [], edges: [], truncated: false } })
    expect(await runtime.listOntologyXrefs(10)).toEqual([])
    const inserted = await runtime.putOntologyXrefs([
      { subjectId: 'foodon:1', predicateId: 'cross-facet', objectId: 'foodon:2', mappingJustification: 'curated' },
    ])
    expect(inserted).toBe(1)
    expect((await runtime.listOntologyXrefs(10))[0]).toMatchObject({ subjectId: 'foodon:1' })
    expect((await runtime.listCorefRejects()).size).toBe(0)
    await runtime.putCorefRejects([{ pairKey: 'a::b', docId: 'a', rowId: 'b', reason: '不是同指', decidedAt: NOW }])
    expect(await runtime.listCorefRejects()).toEqual(new Set(['a::b']))
    expect(await runtime.latestBuildRun('t')).toBeUndefined()
    await runtime.recordBuildRun({ tenantId: 't', startedAt: NOW, finishedAt: NOW, report: {}, metrics: {}, createdAt: NOW })
    expect(await runtime.latestBuildRun('t')).toMatchObject({ tenantId: 't' })
    for (const [type, name] of [['company', '甲'], ['product', '乙'], ['company', '丙'], ['additive', '丁']] as const) {
      await runtime.upsertNode({
        id: `kb:${name}`, tenantId: 't', type: kgNodeTypeId(type),
        naturalKey: name, name, createdAt: NOW, updatedAt: NOW,
      })
    }
    await runtime.upsertEdges([
      { id: 'e1', tenantId: 't', srcId: 'kb:甲', dstId: 'kb:乙', relation: kgRelationId('produces'), confidence: 1, provenance: { sourceSystem: 'kb', sourceId: 's', extractedAt: NOW }, validFrom: NOW },
      { id: 'e2', tenantId: 't', srcId: 'kb:丙', dstId: 'kb:丁', relation: kgRelationId('follows'), confidence: 1, provenance: { sourceSystem: 'kb', sourceId: 's', extractedAt: NOW }, validFrom: NOW },
    ])
    const communities = await runtime.communities('t')
    expect(communities.communities).toHaveLength(2)
    expect(communities.nodeCount).toBe(4)
    const walk = await runtime.pprNeighborhood('t', ['kb:甲'], 10)
    expect(walk.subgraph.nodes.length).toBeGreaterThan(0)
  })
})
