/** parseFormDrafts / parsePushReceipt: the form-assistant wire contract. */

import { describe, expect, it } from 'vitest'
import { parseConfirmPush, parseFormDrafts, parsePushReceipt } from '../src/client/form-draft.ts'

describe('parseFormDrafts', () => {
  it('extracts every fenced draft in order and coerces scalar values', () => {
    const text = [
      '三步计划：',
      '```json',
      '{"collection":"hub_po_suppliers","fields":{"rating":4}}',
      '```',
      '然后：',
      '```json',
      '{"collection":"hub_po_purchase_orders","title":"采购单登记","fields":{"po_number":"PO-1","total":1600,"active":true}}',
      '```',
    ].join('\n')
    const drafts = parseFormDrafts(text)
    expect(drafts.map(draft => draft.collection)).toEqual(['hub_po_suppliers', 'hub_po_purchase_orders'])
    expect(drafts[0]?.fields).toEqual({ rating: '4' })
    expect(drafts[1]?.title).toBe('采购单登记')
    expect(drafts[1]?.fields).toEqual({ po_number: 'PO-1', total: '1600', active: 'true' })
  })

  it('falls back to the collection name as title and rejects non-draft blocks', () => {
    const drafts = parseFormDrafts('```json\n{"collection":"experts","fields":{"name":"张红喜"}}\n```')
    expect(drafts[0]?.title).toBe('experts')
    expect(parseFormDrafts('```json\n{"message":"普通回复"}\n```')).toEqual([])
    expect(parseFormDrafts('没有代码块')).toEqual([])
    expect(parseFormDrafts('```json\nnot json\n```')).toEqual([])
    expect(parseFormDrafts('```json\n{"collection":"","fields":{"a":"1"}}\n```')).toEqual([])
    expect(parseFormDrafts('```json\n{"collection":"x","fields":{}}\n```')).toEqual([])
    // An all-invalid field set is not a draft (no displayable fields).
    expect(parseFormDrafts('```json\n{"collection":"x","fields":{"a":[1]}}\n```')).toEqual([])
  })
})

describe('parsePushReceipt', () => {
  it('anchors the landing row from the fixed receipt format', () => {
    expect(parsePushReceipt('已创建 业务表 hub_po_purchase_orders 行 id=42 已创建')).toEqual({
      collection: 'hub_po_purchase_orders',
      rowId: 42,
    })
    expect(parsePushReceipt('业务表 hub_po_suppliers：行 id：7')).toEqual({ collection: 'hub_po_suppliers', rowId: 7 })
    // The live persona backticks the collection name.
    expect(parsePushReceipt('业务表 `hub_po_suppliers` 行 id=6 已创建。')).toEqual({ collection: 'hub_po_suppliers', rowId: 6 })
  })

  it('rejects messages without both anchors', () => {
    expect(parsePushReceipt('id=42')).toBeUndefined()
    expect(parsePushReceipt('业务表 hub_po_purchase_orders 已创建')).toBeUndefined()
    expect(parsePushReceipt('随便聊聊')).toBeUndefined()
  })
})

describe('parseFormDrafts comment tolerance', () => {
  it('strips // line comments the model interleaves into the JSON block', () => {
    const text = '草稿：\n```json\n{\n  "collection": "t", "title": "x",\n  "fields": { "a": "1",\n    // a: 注释行\n    "b": "2" }\n}\n```\n'
    expect(parseFormDrafts(text)).toEqual([{ collection: 't', title: 'x', fields: { a: '1', b: '2' } }])
  })
})

describe('parseConfirmPush', () => {
  const confirm = (fields: string): string =>
    `确认推送：请按以下最终字段值调用 nb_create 写入业务表，完成后给出回执（业务表 t 行 id）。\n${fields}`

  it('parses the final field set the review card locked in', () => {
    expect(parseConfirmPush(confirm('{"collection":"t","fields":{"a":"1","b":2,"c":true}}')))
      .toEqual({ collection: 't', fields: { a: '1', b: '2', c: 'true' } })
  })

  it('rejects non-confirm texts, broken JSON, and empty fields', () => {
    expect(parseConfirmPush('驳回：本表单草稿作废，不要写库。')).toBeUndefined()
    expect(parseConfirmPush('随便聊聊')).toBeUndefined()
    expect(parseConfirmPush(confirm('{oops}'))).toBeUndefined()
    expect(parseConfirmPush(confirm('{"collection":"t","fields":{}}'))).toBeUndefined()
    expect(parseConfirmPush(confirm('{"fields":{"a":"1"}}'))).toBeUndefined()
  })

  it('rejects payloads without an object body, a fields object, or any scalar field', () => {
    // No JSON object to extract at all.
    expect(parseConfirmPush('确认推送：没有代码体')).toBeUndefined()
    // The closing brace lands before the opening one.
    expect(parseConfirmPush('确认推送：} 意外 {')).toBeUndefined()
    // The payload parses to a JSON null body.
    expect(parseConfirmPush(confirm('null'))).toBeUndefined()
    // The payload parses to a JSON scalar.
    expect(parseConfirmPush(confirm('"just-text"'))).toBeUndefined()
    // The fields slot carries an array instead of an object.
    expect(parseConfirmPush(confirm('{"collection":"t","fields":["a"]}'))).toBeUndefined()
    // The fields slot is missing entirely.
    expect(parseConfirmPush(confirm('{"collection":"t"}'))).toBeUndefined()
  })

  it('keeps the scalar fields and rejects the payload when none survive', () => {
    expect(parseConfirmPush(confirm('{"collection":"t","fields":{"a":"1","b":[2]}}')))
      .toEqual({ collection: 't', fields: { a: '1' } })
    expect(parseConfirmPush(confirm('{"collection":"t","fields":{"b":{"deep":2}}}'))).toBeUndefined()
  })
})
