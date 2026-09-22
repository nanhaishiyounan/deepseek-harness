// @vitest-environment jsdom
/** The six-form registry: entry invariants and the intent scorer's fork policy. */

import { describe, expect, it } from 'vitest'
import { FORM_REGISTRY, matchIntent, registryCapabilityLine } from '../src/client/formRegistry.ts'

describe('FORM_REGISTRY', () => {
  it('carries six entries with unique collections and glyphs', () => {
    expect(FORM_REGISTRY).toHaveLength(6)
    expect(new Set(FORM_REGISTRY.map(entry => entry.collection)).size).toBe(6)
    expect(new Set(FORM_REGISTRY.map(entry => entry.glyph)).size).toBe(6)
    for (const entry of FORM_REGISTRY) {
      expect(entry.required.length).toBeGreaterThan(0)
      expect(entry.intentTerms.length).toBeGreaterThan(0)
      expect(entry.examples.length).toBeGreaterThan(0)
    }
  })

  it('keeps the verified hub_po collections first', () => {
    expect(FORM_REGISTRY[0]?.collection).toBe('hub_po_purchase_orders')
    expect(FORM_REGISTRY[1]?.collection).toBe('hub_po_suppliers')
  })

  it('projects the welcome capability line from the biz names', () => {
    expect(registryCapabilityLine()).toContain('采购单')
    expect(registryCapabilityLine()).toContain('回款记录')
  })
})

describe('matchIntent', () => {
  it('matches a unique high-confidence purchase sentence', () => {
    const match = matchIntent('向宏发食品采购 500kg 面粉，单价 3.2')
    expect(match).toEqual({ kind: 'unique', entry: FORM_REGISTRY[0] })
  })

  it('matches the other form nouns uniquely', () => {
    expect(matchIntent('宏发的货质检有问题，结论不合格').kind).toBe('unique')
    expect(matchIntent('宏发的货抽检有问题，结论不合格').kind).toBe('unique')
    expect(matchIntent('今天到货 200 箱冷链箱要入库').kind).toBe('unique')
    expect(matchIntent('宏发这笔回款 16000 到账了').kind).toBe('unique')
    expect(matchIntent('给供应商三味食品登个档').kind).toBe('unique')
    expect(matchIntent('给客户鲜丰发货 100 箱黄豆酱油').kind).toBe('unique')
  })

  it('penalizes the anti-term that flips the direction', () => {
    // 卖给 hits the purchase anti-term (-2) while scoring outbound 卖给(2).
    const match = matchIntent('这批货卖给鲜丰，出库安排一下')
    expect(match.kind).toBe('unique')
    if (match.kind !== 'unique') throw new Error('unreachable')
    expect(match.entry.collection).toBe('hub_wms_outbound')
  })

  it('forks an ambiguous low-confidence sentence into an ask_choice verdict', () => {
    const match = matchIntent('帮我登记一下，刚和鲜丰谈好一批冷链箱')
    expect(match.kind).toBe('ambiguous')
    if (match.kind !== 'ambiguous') throw new Error('unreachable')
    expect(match.candidates.length).toBeGreaterThan(1)
  })

  it('lists the whole registry when the user clearly registers but says too little', () => {
    const match = matchIntent('帮我登记一下')
    // 登记 alone scores the generic weight on every table — the fork lists
    // all six rather than guess (02 §3.3.4).
    expect(match.kind).toBe('ambiguous')
    if (match.kind !== 'ambiguous') throw new Error('unreachable')
    expect(match.candidates).toHaveLength(FORM_REGISTRY.length)
  })

  it('answers none for a non-registration question', () => {
    expect(matchIntent('本月采购额是多少')).toEqual({ kind: 'none' })
    expect(matchIntent('宏发食品是哪里的公司')).toEqual({ kind: 'none' })
  })

  it('normalizes the cold-chain synonyms before scoring', () => {
    expect(matchIntent('采购 20 个保温箱').kind).toBe('unique')
  })
})
