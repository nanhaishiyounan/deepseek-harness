// @vitest-environment jsdom
/** The render-side deterministic widget resolver mirror (W22-R2). */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDshPayloadObject } from '../src/client/protocol.ts'
import { applyDeterministicWidgets, inferWidgetKind } from '../src/client/widget.ts'

/**
 * Load one tool-present-card fixtures/<name>.json as raw payload data. The
 * corpus is the mirror source for this client resolver — a rule change on
 * either side must update both in one PR. The path resolves off this spec
 * file's own runner-state location (expect.getState().testPath), never the
 * process cwd; the jsdom environment rewrites import.meta.url to an http URL.
 */
function presentCardFixture(name: string): unknown {
  const testPath = expect.getState().testPath
  if (testPath === undefined) throw new Error('widget.client.spec: runner state carries no testPath')
  const fixturesDir = join(dirname(testPath), '../../../interaction/tool-present-card/tests/fixtures')
  return JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), 'utf8'))
}

describe('inferWidgetKind (client mirror)', () => {
  it.each([
    { name: 'quantity', label: '数量', expected: 'number' },
    { name: 'unit_price', label: '单价', expected: 'number' },
    { name: 'forecast_qty', label: '预测量', expected: 'number' },
    { name: 'need_date', label: '需求日期', expected: 'date' },
    { name: 'received_at', label: '收货时间', expected: 'date' },
    { name: 'qty_boxes', label: '入库数量（箱）', expected: 'number' },
    { name: 'total_all', label: '合计金额', expected: 'number' },
    { name: 'eta', label: '交期', expected: 'date' },
  ])('$name / $label classifies to $expected', ({ name, label, expected }) => {
    expect(inferWidgetKind(name, label, false)).toBe(expected)
  })

  it('keeps the declared widget on note-family names whose labels quote money words (customer_note 反例)', () => {
    expect(inferWidgetKind('customer_note', '客户备注（含单价上限说明）', false)).toBeUndefined()
    expect(inferWidgetKind('note', '备注（含单价）', false)).toBeUndefined()
    expect(inferWidgetKind('po_remark', '备注：单价历史', false)).toBeUndefined()
  })

  it('treats connector-glued label tokens as prose, not head words', () => {
    expect(inferWidgetKind('misc', '备注（含单价）', false)).toBeUndefined()
    expect(inferWidgetKind('misc2', '说明：见单价表', false)).toBeUndefined()
  })

  it('forces select only for carried options', () => {
    expect(inferWidgetKind('doc_status', '单据状态', true)).toBe('select')
    expect(inferWidgetKind('doc_status', '单据状态', false)).toBeUndefined()
  })
})

describe('applyDeterministicWidgets (both render channels ride the fold)', () => {
  /** Fold one shared fixture through the client resolver and return its widgets by name. */
  function widgetsOf(name: string): Record<string, string> {
    const payload = parseDshPayloadObject(presentCardFixture(name))
    if (payload === undefined) throw new Error(`fixture ${name} must parse`)
    const classified = applyDeterministicWidgets(payload)
    if (classified.type !== 'form_draft') throw new Error('fixture must be a form_draft')
    return Object.fromEntries(classified.fields.map(field => [field.name, field.widget]))
  }

  it('matches the server rewrite on the shared coercion fixture (double-sided determinism)', () => {
    expect(widgetsOf('form-draft.widget-coercion.valid')).toEqual({
      supplier_id: 'relation',
      product_name: 'text',
      quantity: 'number',
      unit_price: 'number',
      amount: 'number',
      need_date: 'date',
      currency: 'text',
      code: 'text',
    })
  })

  it('corrects only the decidable fields and keeps relation/code declarations on the plain valid fixture', () => {
    const payload = parseDshPayloadObject(presentCardFixture('form-draft.valid'))
    if (payload === undefined) throw new Error('fixture must parse')
    const classified = applyDeterministicWidgets(payload)
    if (classified.type !== 'form_draft') throw new Error('fixture must be a form_draft')
    const widgets = Object.fromEntries(classified.fields.map(field => [field.name, field.widget]))
    expect(widgets).toEqual({ supplier_id: 'relation', amount: 'number', code: 'text' })
  })
})
