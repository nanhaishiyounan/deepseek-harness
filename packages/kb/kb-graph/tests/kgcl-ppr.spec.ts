import { describe, expect, it } from 'vitest'
import { buildChangeDiff, formatChangeDiff, previewOfOp } from '../src/kgcl.ts'
import type { KgDiffNodeRef } from '../src/kgcl.ts'
import { kgRelationId } from '../src/types.ts'
import { personalizedPageRank } from '../src/ppr.ts'
import { compileKgQuery, fillKgQueryPlan, KG_QUERY_EXAMPLES, KG_QUERY_TEMPLATE_IDS } from '../src/kg-nl.ts'

const ref = (name: string): KgDiffNodeRef => ({ id: '', name })

describe('kgcl diff', () => {
  it('renders add/remove/props entries with direction markers', () => {
    const diff = buildChangeDiff([
      { op: 'add_edge', relation: kgRelationId('supplies'), src: ref('张红喜'), dst: ref('中粮'), fact: '改供应' },
      { op: 'remove_edge', relation: kgRelationId('supplies'), src: ref('张红喜'), dst: ref('旧供应商') },
      { op: 'set_node_props', target: ref('张红喜'), props: { grade: 'A' } },
    ])
    expect(diff.entries.map(entry => entry.marker)).toEqual(['+', '−', '~'])
    const text = formatChangeDiff(diff)
    expect(text).toContain('+ 新增关系 张红喜 —[supplies]→ 中粮')
    expect(text).toContain('− 移除关系 张红喜 —[supplies]→ 旧供应商')
    expect(text).toContain('~ 更新实体 张红喜 的属性')
  })

  it('previews every op kind through previewOfOp', () => {
    expect(previewOfOp({ op: 'add_edge', relation: kgRelationId('uses'), src: ref('a'), dst: ref('b') })).toContain('uses')
  })
})

describe('personalizedPageRank', () => {
  const nodeIds = ['hub', 'a', 'b', 'c', 'far']
  const pairs: readonly (readonly [string, string])[] = [
    ['hub', 'a'], ['hub', 'b'], ['a', 'c'], ['far', 'c'],
  ]

  it('keeps early-iteration locality near the seed', () => {
    const ranking = personalizedPageRank(nodeIds, pairs, ['hub'], { topN: 5, iters: 3 })
    const rankOf = new Map(ranking.map(entry => [entry.nodeId, entry.rank]))
    // With few iterations the personalization survives: one-hop neighbors
    // outrank the two-hop tail.
    expect((rankOf.get('b') ?? 0)).toBeGreaterThan(rankOf.get('far') ?? 0)
  })

  it('converges toward the degree-weighted stationary distribution', () => {
    const ranking = personalizedPageRank(nodeIds, pairs, ['hub'], { topN: 5 })
    const rankOf = new Map(ranking.map(entry => [entry.nodeId, entry.rank]))
    expect(ranking[0]?.nodeId).toBe('hub')
    expect((rankOf.get('a') ?? 0)).toBeGreaterThan(rankOf.get('b') ?? 0)
    expect((rankOf.get('c') ?? 0)).toBeGreaterThan(rankOf.get('far') ?? 0)
  })

  it('spreads mass across multiple seeds', () => {
    const ranking = personalizedPageRank(nodeIds, pairs, ['a', 'b'], { topN: 5 })
    expect(ranking.some(entry => entry.nodeId === 'c')).toBe(true)
  })

  it('returns nothing for unknown seeds', () => {
    expect(personalizedPageRank(nodeIds, pairs, ['ghost'])).toEqual([])
  })

  it('caps the result at topN', () => {
    const ranking = personalizedPageRank(nodeIds, pairs, ['hub'], { topN: 2 })
    expect(ranking).toHaveLength(2)
  })

  it('ignores pairs with unknown endpoints and self-loops', () => {
    const ranking = personalizedPageRank(['x', 'y'], [['x', 'y'], ['x', 'ghost'], ['x', 'x']], ['x'], { topN: 5 })
    expect(ranking.map(entry => entry.nodeId).sort()).toEqual(['x', 'y'])
  })
})

describe('kg_query template regression (M1 baseline: 14 templates)', () => {
  it('compiles every advertised example phrase', () => {
    const vocabulary = {
      relationIds: ['supplies', 'produces', 'uses', 'complies_with', 'contains', 'broader', 'related', 'corefers_with', 'places'],
    }
    const misses: string[] = []
    for (const phrase of KG_QUERY_EXAMPLES) {
      if (compileKgQuery(phrase, vocabulary) === undefined) misses.push(phrase)
    }
    expect(KG_QUERY_EXAMPLES).toHaveLength(14)
    expect(misses).toEqual([])
  })
})

describe('compileKgQuery blank slots', () => {
  it('treats a structurally matching phrase with a blank entity slot as a miss', () => {
    const vocabulary = { relationIds: ['supplies', 'related'] }
    expect(compileKgQuery('和甲的关系', vocabulary)).toBeUndefined()
    expect(compileKgQuery('甲和 的关系', vocabulary)).toBeUndefined()
  })
})

describe('fillKgQueryPlan', () => {
  const vocabulary = { relationIds: ['supplies', 'produces', 'uses', 'complies_with', 'broader', 'related', 'corefers_with'] }

  it('whitelists template ids', () => {
    expect(KG_QUERY_TEMPLATE_IDS).toContain('supply-chain')
    expect(KG_QUERY_TEMPLATE_IDS).toContain('pair')
  })

  it('fills a valid template choice', () => {
    const plan = fillKgQueryPlan({ templateId: 'produces-products', seeds: ['宏发食品'] }, vocabulary)
    expect(plan?.templateId).toBe('produces-products')
    expect(plan?.relationTypes).toEqual(['produces'])
    expect(plan?.hops).toBe(1)
  })

  it('honors hops only on the n-hop template', () => {
    expect(fillKgQueryPlan({ templateId: 'n-hop', seeds: ['宏发食品'], hops: 2 }, vocabulary)?.hops).toBe(2)
    expect(fillKgQueryPlan({ templateId: 'n-hop', seeds: ['宏发食品'], hops: 5 }, vocabulary)?.hops).toBe(2)
    expect(fillKgQueryPlan({ templateId: 'orders', seeds: ['宏发食品'], hops: 2 }, vocabulary)?.hops).toBe(1)
  })

  it('rejects unknown templates and blank seeds', () => {
    expect(fillKgQueryPlan({ templateId: 'nope', seeds: ['x'] }, vocabulary)).toBeUndefined()
    expect(fillKgQueryPlan({ templateId: 'orders', seeds: ['  '] }, vocabulary)).toBeUndefined()
  })

  it('rejects a relation the registry lacks', () => {
    expect(fillKgQueryPlan({ templateId: 'produces-products', seeds: ['x'] }, { relationIds: ['supplies'] })).toBeUndefined()
  })

  it('requires both seeds on the pair template', () => {
    expect(fillKgQueryPlan({ templateId: 'pair', seeds: ['a'] }, vocabulary)).toBeUndefined()
    expect(fillKgQueryPlan({ templateId: 'pair', seeds: ['a', 'b'] }, vocabulary)?.seeds).toEqual(['a', 'b'])
  })
})
