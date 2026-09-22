/**
 * The kg template compiler (moved verbatim from apiproxy's kg-nl spec): every
 * built-in template's slot fill (seeds, hops, relation filter), the
 * closed-set guard that drops a template naming an unregistered relation, and
 * the explicit-miss policy (blank or unknown shapes compile to undefined —
 * the refusal, never a guessed walk). apiproxy's `kg.query` RPC and the
 * `kg_query` tool both compile through this one module, so these assertions
 * lock both faces at once.
 */

import { describe, expect, it } from 'vitest'
import { compileKgQuery, KG_QUERY_EXAMPLES } from '../src/kg-nl.ts'

const VOCAB = { relationIds: ['supplies', 'produces', 'uses', 'contains', 'complies_with', 'follows', 'flags'] }

describe('compileKgQuery', () => {
  it('compiles the three legacy shapes with their original walk semantics', () => {
    expect(compileKgQuery('宏发食品的供货链', VOCAB))
      .toEqual({ seeds: ['宏发食品'], hops: 2, templateId: 'supply-chain' })
    expect(compileKgQuery('宏发食品的供货', VOCAB))
      .toEqual({ seeds: ['宏发食品'], hops: 2, templateId: 'supply-chain' })
    expect(compileKgQuery('张红喜的订单', VOCAB))
      .toEqual({ seeds: ['张红喜'], hops: 1, templateId: 'orders' })
    expect(compileKgQuery('含山梨酸钾的产品', VOCAB))
      .toEqual({ seeds: ['山梨酸钾'], hops: 1, templateId: 'contains' })
  })

  it('compiles the relation-filtered shapes with their closed-set filters', () => {
    expect(compileKgQuery('张红喜供货的所有产品', VOCAB))
      .toEqual({ seeds: ['张红喜'], hops: 1, relationTypes: ['supplies'], templateId: 'supplies-products' })
    expect(compileKgQuery('宏发食品供应的产品', VOCAB)?.relationTypes).toEqual(['supplies'])
    expect(compileKgQuery('宏发食品生产的产品', VOCAB))
      .toEqual({ seeds: ['宏发食品'], hops: 1, relationTypes: ['produces'], templateId: 'produces-products' })
    expect(compileKgQuery('酱油使用的原料', VOCAB))
      .toEqual({ seeds: ['酱油'], hops: 1, relationTypes: ['uses'], templateId: 'uses-inputs' })
    expect(compileKgQuery('酱油的合规信息', VOCAB)?.relationTypes).toEqual(['complies_with'])
  })

  it('compiles the trace family (suppliers, batch flow, made-from)', () => {
    expect(compileKgQuery('酱油的原料来自哪些供应商', VOCAB))
      .toEqual({ seeds: ['酱油'], hops: 2, templateId: 'trace-input-suppliers' })
    expect(compileKgQuery('20260911批次流向哪些客户', VOCAB))
      .toEqual({ seeds: ['20260911'], hops: 2, templateId: 'trace-batch-flow' })
    expect(compileKgQuery('宏发食品的供应商', VOCAB))
      .toEqual({ seeds: ['宏发食品'], hops: 2, templateId: 'suppliers-of' })
    expect(compileKgQuery('宏发食品的客户', VOCAB))
      .toEqual({ seeds: ['宏发食品'], hops: 2, templateId: 'customers-of' })
    expect(compileKgQuery('蚝油由哪些原料制成', VOCAB))
      .toEqual({ seeds: ['蚝油'], hops: 1, relationTypes: ['uses'], templateId: 'made-from' })
  })

  it('fills the hop slot and the two-entity pair shape', () => {
    expect(compileKgQuery('宏发食品相关的2跳关系', VOCAB))
      .toEqual({ seeds: ['宏发食品'], hops: 2, templateId: 'n-hop' })
    expect(compileKgQuery('宏发食品相关的1跳', VOCAB)?.hops).toBe(1)
    expect(compileKgQuery('宏发食品和张红喜的关系', VOCAB))
      .toEqual({ seeds: ['宏发食品', '张红喜'], hops: 1, templateId: 'pair' })
  })

  it('prefers the relation-filtered shape over the bare supply-chain shape', () => {
    // Both templates contain 供货; the specific product walk must win.
    expect(compileKgQuery('张红喜供货的所有产品', VOCAB)?.templateId).toBe('supplies-products')
    expect(compileKgQuery('张红喜的供货链', VOCAB)?.templateId).toBe('supply-chain')
  })

  it('drops a template whose relation is outside the registry closed set', () => {
    const narrow = { relationIds: ['produces'] }
    expect(compileKgQuery('张红喜供货的所有产品', narrow)).toBeUndefined()
    expect(compileKgQuery('宏发食品生产的产品', narrow)?.templateId).toBe('produces-products')
  })

  it('returns undefined for blank or unknown shapes (the explicit miss)', () => {
    expect(compileKgQuery('   ', VOCAB)).toBeUndefined()
    expect(compileKgQuery('今天天气怎么样', VOCAB)).toBeUndefined()
    expect(compileKgQuery('的供货链', VOCAB)).toBeUndefined()
  })

  it('keeps every cited example compiling', () => {
    for (const example of KG_QUERY_EXAMPLES) {
      expect(compileKgQuery(example, VOCAB), example).toBeDefined()
    }
  })

  it('answers through the package root the apiproxy RPC imports', async () => {
    // The RPC face resolves '@deepseek-ai/dsh-kb-graph', so the root export
    // must carry the compiler — a dropped re-export is an RPC break.
    const root = await import('../src/index.ts')
    expect(root.compileKgQuery).toBe(compileKgQuery)
    expect(root.KG_QUERY_EXAMPLES).toBe(KG_QUERY_EXAMPLES)
  })
})
