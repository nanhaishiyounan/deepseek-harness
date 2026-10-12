// @vitest-environment jsdom
/**
 * The surface-owned system-field guarantees, local face (post-NocoBase): the
 * 今天 date override and the merge rules that keep user edits winning and
 * 今天 dates on the client calendar.
 */

import { describe, expect, it } from 'vitest'
import { mergeCardValues, todayOf } from '../src/client/systemFields.ts'
import type { FormDraftPayload } from '../src/client/protocol.ts'

/** The 2026-09-22 01:02 client clock every deterministic case pins. */
const NOW = new Date(2026, 8, 22, 1, 2).getTime()

const PAYLOAD: FormDraftPayload = {
  v: 3,
  type: 'form_draft',
  draftId: 'd_1',
  revision: 1,
  form: { collection: 'pur_orders', label: '采购单' },
  title: '采购',
  fields: [
    { name: 'order_date', label: '日期', value: '2026-09-21', tier: 'derived', rationale: '今天', widget: 'date' },
    { name: 'ship_date', label: '交货日', value: '2026-09-21', tier: 'derived', widget: 'date' },
    { name: 'code', label: '订单号', value: '', tier: 'system', widget: 'text' },
  ],
}

describe('todayOf', () => {
  it('projects the client calendar date', () => {
    expect(todayOf(NOW)).toBe('2026-09-22')
  })
})

describe('mergeCardValues', () => {
  it('overrides off-today derived dates on the client calendar', () => {
    const values = mergeCardValues(PAYLOAD, { order_date: '2026-09-21', ship_date: '2026-09-21', code: '' }, NOW)
    expect(values).toEqual({ order_date: '2026-09-22', ship_date: '2026-09-21', code: '' })
  })

  it('keeps user edits over the overrides and payload values otherwise', () => {
    const edits = { order_date: '2026-09-30', ship_date: '2026-09-21', code: '' }
    const values = mergeCardValues(PAYLOAD, edits, NOW)
    expect(values.order_date).toBe('2026-09-30')
    expect(values.ship_date).toBe('2026-09-21')
    expect(values.code).toBe('')
  })

  it('leaves an on-today date untouched', () => {
    const values = mergeCardValues(PAYLOAD, { order_date: '2026-09-22', ship_date: '2026-09-21', code: '' }, NOW)
    expect(values.order_date).toBe('2026-09-22')
  })
})
