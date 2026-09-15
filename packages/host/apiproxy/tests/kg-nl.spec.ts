/**
 * The kg.query template compiler: every built-in template's slot fill (seeds,
 * hops, relation filter), the closed-set guard that drops a template naming
 * an unregistered relation, and the explicit-miss policy (blank or unknown
 * shapes compile to undefined — the refusal, never a guessed walk).
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
})
