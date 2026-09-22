// @vitest-environment jsdom
/**
 * The surface-owned system-field guarantees: the registry number spec, the
 * max-suffix+1 derivation with its clock fallback, the draft-keyed issue
 * cache over the nocobase read (plus the read-failure arm), and the
 * merge/override rules that keep system blanks numbered and 今天 dates on
 * the client calendar.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deriveNextNumber, mergeCardValues, nextSystemNumber, systemNumberSpecOf, systemOverridesOf, todayOf,
} from '../src/client/systemFields.ts'
import type { FormDraftPayload } from '../src/client/protocol.ts'

/** The 2026-09-22 01:02 client clock every deterministic case pins. */
const NOW = new Date(2026, 8, 22, 1, 2).getTime()

/** Install the gateway fetch stub returning `value` for nocobase.list. */
function stubList(value: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse((init?.body ?? '{}') as string) as { rpcId: string }
    return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value } }), { status: 200 })
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('systemNumberSpecOf', () => {
  it('reads the prefix off the registry rule', () => {
    expect(systemNumberSpecOf('hub_po_purchase_orders', 'po_number')).toEqual({
      collection: 'hub_po_purchase_orders',
      field: 'po_number',
      prefix: 'PO',
    })
    expect(systemNumberSpecOf('hub_fin_payments', 'payment_number')?.prefix).toBe('PAY')
  })

  it('returns undefined for non-generating fields and collections', () => {
    expect(systemNumberSpecOf('hub_po_purchase_orders', 'total')).toBeUndefined()
    expect(systemNumberSpecOf('hub_unknown', 'po_number')).toBeUndefined()
  })
})

describe('deriveNextNumber', () => {
  const spec = systemNumberSpecOf('hub_po_purchase_orders', 'po_number')

  it('takes max same-year suffix +1 and starts at 0001', () => {
    const rows = [{ po_number: 'PO-2026-0007' }, { po_number: 'PO-2026-0042' }, { po_number: 'PO-2025-9999' }]
    expect(deriveNextNumber(rows, spec!, NOW)).toBe('PO-2026-0043')
    expect(deriveNextNumber([], spec!, NOW)).toBe('PO-2026-0001')
  })

  it('skips non-matching and non-string values', () => {
    const rows = [{ po_number: 'SUP-2026-0042' }, { po_number: null }, { other: 'PO-2026-0009' }, 'PO-2026-0005']
    expect(deriveNextNumber(rows, spec!, NOW)).toBe('PO-2026-0001')
  })

  it('falls to the clock suffix once the space is exhausted', () => {
    expect(deriveNextNumber([{ po_number: 'PO-2026-9999' }], spec!, NOW)).toBe('PO-2026-0062')
  })
})

describe('nextSystemNumber', () => {
  it('reads the rows, caches per draft, and falls back on read failure', async () => {
    stubList({ rows: [{ po_number: 'PO-2026-0007' }] })
    await expect(nextSystemNumber('d_a', 'hub_po_purchase_orders', 'po_number', NOW)).resolves.toBe('PO-2026-0008')
    // The cached draft id answers without another read; a fresh draft re-reads.
    await expect(nextSystemNumber('d_a', 'hub_po_purchase_orders', 'po_number', NOW)).resolves.toBe('PO-2026-0008')
    stubList({ rows: [{ po_number: 'PO-2026-0007' }, { po_number: 'PO-2026-0008' }] })
    await expect(nextSystemNumber('d_b', 'hub_po_purchase_orders', 'po_number', NOW)).resolves.toBe('PO-2026-0009')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })))
    await expect(nextSystemNumber('d_c', 'hub_po_purchase_orders', 'po_number', NOW)).resolves.toBe('PO-2026-0062')
  })

  it('merges a second generated field into the same draft record', async () => {
    stubList({ rows: [{ po_number: 'PO-2026-0007' }] })
    await expect(nextSystemNumber('d_multi', 'hub_po_purchase_orders', 'po_number', NOW)).resolves.toBe('PO-2026-0008')
    await expect(nextSystemNumber('d_multi', 'hub_fin_payments', 'payment_number', NOW)).resolves.toBe('PAY-2026-0001')
  })

  it('answers empty for a field the registry does not generate', async () => {
    await expect(nextSystemNumber('d_d', 'hub_po_purchase_orders', 'total', NOW)).resolves.toBe('')
  })
})

const PAYLOAD: FormDraftPayload = {
  v: 3,
  type: 'form_draft',
  draftId: 'd_1',
  revision: 1,
  form: { collection: 'hub_po_purchase_orders', label: '采购单' },
  title: '采购',
  fields: [
    { name: 'order_date', label: '日期', value: '2026-09-21', tier: 'derived', rationale: '今天', widget: 'date' },
    { name: 'ship_date', label: '交货日', value: '2026-09-21', tier: 'derived', widget: 'date' },
    { name: 'po_number', label: '单号', value: '', tier: 'system', widget: 'text' },
  ],
}

describe('systemOverridesOf and mergeCardValues', () => {
  it('overrides unedited system blanks and off-today derived dates', () => {
    expect(systemOverridesOf(PAYLOAD, { po_number: 'PO-2026-0043' }, NOW)).toEqual({
      po_number: 'PO-2026-0043',
      order_date: '2026-09-22',
    })
    const values = mergeCardValues(PAYLOAD, { order_date: '2026-09-21', ship_date: '2026-09-21', po_number: '' }, { po_number: 'PO-2026-0043' }, NOW)
    expect(values).toEqual({ order_date: '2026-09-22', ship_date: '2026-09-21', po_number: 'PO-2026-0043' })
  })

  it('keeps user edits over the overrides and payload values otherwise', () => {
    const edits = { order_date: '2026-09-30', po_number: '' }
    const values = mergeCardValues(PAYLOAD, edits, { po_number: 'PO-2026-0043' }, NOW)
    expect(values.order_date).toBe('2026-09-30')
    expect(values.po_number).toBe('PO-2026-0043')
  })

  it('leaves a settled system number and an on-today date untouched', () => {
    const settled: FormDraftPayload = {
      ...PAYLOAD,
      fields: [
        { name: 'order_date', label: '日期', value: todayOf(NOW), tier: 'derived', rationale: '今天', widget: 'date' },
        { name: 'po_number', label: '单号', value: 'PO-2026-0042', tier: 'system', widget: 'text' },
      ],
    }
    expect(systemOverridesOf(settled, {}, NOW)).toEqual({})
    expect(mergeCardValues(settled, { order_date: todayOf(NOW), po_number: 'PO-2026-0042' }, {}, NOW))
      .toEqual({ order_date: todayOf(NOW), po_number: 'PO-2026-0042' })
  })
})
