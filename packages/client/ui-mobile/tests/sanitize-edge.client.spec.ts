/**
 * The sanitize edge assertions (W23-R4, the R3 verification's
 * production-simulation gap): the denylist matches every casing variant —
 * the R3 pass was lowercase-blind, so `WFL_Approval_Todos` / `Ask_Field` /
 * `NB_LIST` passed through live — a >10KB clean body survives verbatim, a
 * longer token strips whole (no partial residue), code-fence markers stay
 * intact so a successful protocol payload remains renderable, and the
 * contextual `suggestions` field name keeps English body prose untouched.
 */

import { describe, expect, it } from 'vitest'
import { PROTOCOL_BLACKLIST, sanitizeBody, sanitizeSubtitle } from '../src/client/sanitize.ts'

describe('sanitize edge (W23-R4)', () => {
  it('passes a >10KB clean body through verbatim', () => {
    const chunk = '近30天合计128000元，OTIF96%，毛利率百分之三点二；'
    const text = chunk.repeat(Math.ceil(10_240 / chunk.length) + 1)
    expect(text.length).toBeGreaterThan(10_240)
    expect(sanitizeBody(text)).toBe(text)
    expect(sanitizeSubtitle(text)).toBe(text)
  })

  it('strips every casing variant of the denylist tokens', () => {
    expect(sanitizeBody('待办表 WFL_Approval_Todos 已清空')).toBe('待办表 已清空')
    expect(sanitizeBody('先走 Ask_Field，字段来自 SUGGESTIONS')).toBe('先走，字段来自')
    expect(sanitizeSubtitle('近30天 · NB_LIST 直查 · KG_QUERY 走查')).toBe('近30天 · 直查 · 走查')
  })

  it('keeps the plain word suggestions in English body prose (protocol context only)', () => {
    expect(sanitizeBody('Here are our Suggestions for next quarter')).toBe('Here are our Suggestions for next quarter')
    expect(sanitizeBody('here are our suggestions for next quarter')).toBe('here are our suggestions for next quarter')
  })

  it('strips a longer token whole: no partial residue survives', () => {
    expect(sanitizeBody('待办 wfl_approval_todos_inner 已处理')).toBe('待办 已处理')
    expect(sanitizeBody('待办 WFL_APPROVAL_TODOS_INNER 已处理')).toBe('待办 已处理')
    expect(sanitizeSubtitle('wfl_approval_todos_inner')).toBe('')
  })

  it('keeps the code-fence markers of a successful protocol payload intact', () => {
    const fenced = '```\ndsh\n```'
    expect(sanitizeBody(fenced)).toBe(fenced)
    expect(sanitizeSubtitle(fenced)).toBe(fenced)
  })

  it('strips the order action tokens the body narratives leaked (W23-R5)', () => {
    expect(sanitizeBody('已为你 order_create · 待复核 order_status')).toBe('已为你 · 待复核')
    expect(sanitizeBody('重试 ORDER_STATUS 后关闭')).toBe('重试 后关闭')
  })

  it('is idempotent: sanitizing its own output changes nothing (W23-R5)', () => {
    const samples = [
      'suggestions from pur_orders',
      '待办表 wfl_approval_todos 已清空 · suggestions',
      'Here are our Suggestions for next quarter',
      '实时查询 · 待办表 WFL_Approval_Todos 已清空',
      '已为你 order_create · 待复核 order_status',
      '```\ndsh\n```',
    ]
    for (const text of samples) {
      expect(sanitizeBody(sanitizeBody(text))).toBe(sanitizeBody(text))
      expect(sanitizeSubtitle(sanitizeSubtitle(text))).toBe(sanitizeSubtitle(text))
    }
  })

  it('strips the contextual field name when the mapping pass introduces the CJK context (W23-R5)', () => {
    // The raw string carries no CJK and no denylist family, so the R4
    // verdict over the raw text kept `suggestions` on the first pass and
    // stripped it on the second; the verdict over the mapped text agrees
    // with itself on every pass.
    expect(sanitizeBody('suggestions from pur_orders')).toBe('from 采购订单')
  })

  it('exports the closed denylist both passes share, with the contextual field name a member', () => {
    expect(PROTOCOL_BLACKLIST).toEqual(['wfl_[a-z0-9_]+', 'ask_[a-z_]+', 'order_create', 'order_status', 'suggestions'])
  })
})
