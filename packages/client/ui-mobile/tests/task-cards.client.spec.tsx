// @vitest-environment jsdom
/**
 * Task cards: DraftCard's missing-value fallback, ReviewCard's confirmation
 * dialog (cancel keeps pending), ReceiptCard's row read-back over hits,
 * misses, and failures, the review diff's relation label resolution, the
 * review/receipt title's relation-name mapping over the final values, and
 * the label read's failure paths (one retry, then the raw-id degradation).
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NocobaseFieldView } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { FormDraft } from '../src/client/form-draft.ts'
import { DraftCard, ReceiptCard, ReviewCard } from '../src/client/forms/task-cards.tsx'
import type { CollectionFieldMeta } from '../src/client/forms/task-cards.tsx'

/** One gateway call's payload. */
interface RecordedCall {
  readonly url: string
  readonly payload: Record<string, unknown>
}

let calls: RecordedCall[]

/**
 * Install the gateway fetch stub. `routes` maps method names to a value or a
 * per-call producer; an unmapped method answers ok:false.
 */
function stubGateway(routes: Record<string, unknown>): void {
  calls = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const body = JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string; payload?: Record<string, unknown> }
    calls.push({ url, payload: body.payload ?? {} })
    const method = url.replace('/api/', '')
    const route = routes[method]
    if (route === undefined) {
      return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: false, error: { message: `no stub for ${method}` } } }), { status: 200 })
    }
    const value = typeof route === 'function'
      ? await (route as (payload: Record<string, unknown>) => Promise<unknown>)(body.payload ?? {})
      : route
    return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value } }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** One draft over the purchase-order collection. */
const DRAFT: FormDraft = {
  collection: 'hub_po_orders',
  title: '采购单',
  fields: { po_number: 'PO-1', total: '100' },
}

/** A meta map naming every field string-typed unless overridden. */
function metaOf(fields: Record<string, NocobaseFieldView | undefined>): CollectionFieldMeta {
  const map = new Map<string, NocobaseFieldView>()
  for (const [name, field] of Object.entries(fields)) {
    if (field !== undefined) map.set(name, field)
  }
  return map
}

const STRING_META = metaOf({
  po_number: { name: 'po_number', type: 'string', title: '单号' },
  total: { name: 'total', type: 'float', title: '金额' },
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  cleanup()
})

describe('DraftCard', () => {
  it('renders a field the values map does not carry as empty', () => {
    stubGateway({})
    const { container } = render(
      <DraftCard
        draft={DRAFT}
        meta={STRING_META}
        values={{ po_number: 'PO-2' }}
        onEdit={() => {}}
        onSubmitReview={() => {}}
        disabled={false}
      />,
    )
    const inputs = container.querySelectorAll('input')
    expect(screen.getByText('单号')).toBeTruthy()
    expect((inputs[0] as HTMLInputElement).value).toBe('PO-2')
    // The missing number field falls back to the empty string, which the
    // Stepper renders as its zero numeric input value.
    expect((inputs[1] as HTMLInputElement).value).toBe('0')
  })
})

describe('ReviewCard', () => {
  it('keeps the card pending when the confirm dialog closes without writing', () => {
    stubGateway({})
    const onConfirm = vi.fn()
    render(
      <ReviewCard
        draft={DRAFT}
        meta={STRING_META}
        confirmedFields={{ po_number: 'PO-1', total: '100' }}
        onConfirm={onConfirm}
        onReject={() => {}}
        disabled={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '确认提交' }))
    expect(screen.getByText('再想想')).toBeTruthy()
    // The cancel action leaves the write path untouched (the mask-close arm
    // rides a layer jsdom never mounts).
    fireEvent.click(screen.getByText('再想想'))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('ReceiptCard', () => {
  it('reads the landing row back and shows it', async () => {
    stubGateway({ 'nocobase.list': { rows: [{ id: 42, po_number: 'PO-1' }] } })
    render(
      <ReceiptCard draft={DRAFT} meta={STRING_META} finalFields={DRAFT.fields} receipt={{ collection: 'hub_po_orders', rowId: 42 }} />,
    )
    await waitFor(() => { expect(screen.getByTestId('receipt-row').textContent).toContain('PO-1') })
    const read = calls.find(call => call.url === '/api/nocobase.list')
    expect(read?.payload).toMatchObject({ collection: 'hub_po_orders', page: 1, page_size: 1 })
  })

  it('keeps the read-back hint when the row read misses', async () => {
    stubGateway({ 'nocobase.list': { rows: [] } })
    render(
      <ReceiptCard draft={DRAFT} meta={STRING_META} finalFields={DRAFT.fields} receipt={{ collection: 'hub_po_orders', rowId: 42 }} />,
    )
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(1) })
    expect(screen.getByText('正在实查业务表行…')).toBeTruthy()
  })

  it('keeps the read-back hint when the row read fails', async () => {
    stubGateway({ 'nocobase.list': () => { throw new Error('业务表 503') } })
    render(
      <ReceiptCard draft={DRAFT} meta={STRING_META} finalFields={DRAFT.fields} receipt={{ collection: 'hub_po_orders', rowId: 42 }} />,
    )
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(1) })
    expect(screen.getByText('正在实查业务表行…')).toBeTruthy()
  })
})

describe('ReviewCard relation diff labels', () => {
  /** A draft whose supplier column targets the suppliers table. */
  const supplierDraft: FormDraft = {
    collection: 'hub_po_orders',
    title: '采购单',
    fields: { supplier: '42' },
  }

  /** The meta carrying the belongsTo supplier field. */
  const supplierMeta = (target: string | undefined): CollectionFieldMeta => metaOf(
    target === undefined ? {} : { supplier: { name: 'supplier', type: 'belongsTo', target } },
  )

  it('resolves a numeric relation id to the target row label', async () => {
    stubGateway({ 'nocobase.list': { rows: [{ id: 42, name: '宏发食品' }] } })
    render(
      <ReviewCard
        draft={supplierDraft}
        meta={supplierMeta('hub_po_suppliers')}
        confirmedFields={{ supplier: '42' }}
        onConfirm={() => {}}
        onReject={() => {}}
        disabled={false}
      />,
    )
    await waitFor(() => { expect(screen.getByText('宏发食品')).toBeTruthy() })
  })

  it('shows the raw id when the label read fails', async () => {
    stubGateway({ 'nocobase.list': () => { throw new Error('供应商表 502') } })
    render(
      <ReviewCard
        draft={supplierDraft}
        meta={supplierMeta('hub_po_suppliers')}
        confirmedFields={{ supplier: '42' }}
        onConfirm={() => {}}
        onReject={() => {}}
        disabled={false}
      />,
    )
    // The title slot and the diff row both read the AI-original id 42's label;
    // each retries once after the 300ms delay, then degrades to the raw id.
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(4) })
    expect(screen.getByText('42')).toBeTruthy()
  })

  it('shows the raw id when the label page comes back empty', async () => {
    stubGateway({ 'nocobase.list': { rows: [] } })
    render(
      <ReviewCard
        draft={supplierDraft}
        meta={supplierMeta('hub_po_suppliers')}
        confirmedFields={{ supplier: '43' }}
        onConfirm={() => {}}
        onReject={() => {}}
        disabled={false}
      />,
    )
    // The title slot, the final value, and the del's AI-original id each read a label.
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(3) })
    expect(screen.getByText('43')).toBeTruthy()
  })

  it('resolves to the empty label when the row lacks the label column', async () => {
    stubGateway({ 'nocobase.list': { rows: [{ id: 44 }] } })
    const { container } = render(
      <ReviewCard
        draft={supplierDraft}
        meta={supplierMeta('hub_po_suppliers')}
        confirmedFields={{ supplier: '44' }}
        onConfirm={() => {}}
        onReject={() => {}}
        disabled={false}
      />,
    )
    // The title slot, the final value, and the del's AI-original id each read a label.
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(3) })
    expect(container.textContent).not.toContain('44')
  })

  it('labels the numeric diff original while non-numeric and non-relation values stay read-free', async () => {
    stubGateway({ 'nocobase.list': { rows: [{ id: 42, name: '宏发食品' }] } })
    const { container, rerender } = render(
      <ReviewCard
        draft={supplierDraft}
        meta={supplierMeta('hub_po_suppliers')}
        confirmedFields={{ supplier: '宏发' }}
        onConfirm={() => {}}
        onReject={() => {}}
        disabled={false}
      />,
    )
    // The non-numeric final 宏发 renders directly; only the del's AI-original id 42 reads its label.
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(1) })
    expect(container.textContent).toContain('宏发食品')
    expect(container.textContent).toContain('宏发')
    // A text field renders its value directly.
    rerender(
      <ReviewCard
        draft={{ ...supplierDraft, fields: { po_number: 'PO-1' } }}
        meta={STRING_META}
        confirmedFields={{ po_number: 'PO-2' }}
        onConfirm={() => {}}
        onReject={() => {}}
        disabled={false}
      />,
    )
    expect(container.textContent).toContain('PO-2')
    expect(calls).toHaveLength(1)
  })

  it('labels a numeric id with a numeric label cell rendered as text', async () => {
    stubGateway({ 'nocobase.list': { rows: [{ id: 3, name: 66 }] } })
    render(
      <ReviewCard
        draft={supplierDraft}
        meta={supplierMeta('hub_po_suppliers')}
        confirmedFields={{ supplier: '3' }}
        onConfirm={() => {}}
        onReject={() => {}}
        disabled={false}
      />,
    )
    // The del's AI-original read resolves to the same stubbed row, so both render 66.
    await waitFor(() => { expect(screen.getAllByText('66')).toBeTruthy() })
  })

  it('ignores a late label read after unmount', async () => {
    let release: (page: unknown) => void = () => {}
    const gate = new Promise<unknown>((resolve) => { release = resolve })
    stubGateway({ 'nocobase.list': () => gate })
    const view = render(
      <ReviewCard
        draft={supplierDraft}
        meta={supplierMeta('hub_po_suppliers')}
        confirmedFields={{ supplier: '42' }}
        onConfirm={() => {}}
        onReject={() => {}}
        disabled={false}
      />,
    )
    // The title slot and the diff row both read the AI-original id 42's label.
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(2) })
    view.unmount()
    release({ rows: [{ id: 42, name: '迟到' }] })
    await Promise.resolve()
    expect(document.body.textContent === null || !document.body.textContent.includes('迟到')).toBe(true)
  })
})

describe('ReceiptCard relation title', () => {
  /** A purchase-order draft whose title carries the supplier name in the paren group. */
  const titledDraft: FormDraft = {
    collection: 'hub_po_purchase_orders',
    title: '采购单 PO-V2R-882910（速达冷链设备）',
    fields: { po_number: 'PO-V2R-882910', supplier: '4' },
  }

  /** The meta carrying the belongsTo supplier field. */
  const titleMeta = metaOf({ supplier: { name: 'supplier', type: 'belongsTo', target: 'hub_po_suppliers' } })

  it('maps the title name to the re-selected supplier after submit', async () => {
    stubGateway({ 'nocobase.list': { rows: [{ id: 6, name: '宏发食品' }] } })
    render(
      <ReceiptCard
        draft={titledDraft}
        meta={titleMeta}
        finalFields={{ po_number: 'PO-V2R-882910', supplier: '6' }}
        receipt={{ collection: 'hub_po_purchase_orders', rowId: 9 }}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('采购单 PO-V2R-882910（宏发食品） · 已落库')).toBeTruthy()
    })
    const nameRead = calls.find(call => call.url === '/api/nocobase.list' && call.payload['collection'] === 'hub_po_suppliers')
    expect(nameRead?.payload).toMatchObject({
      collection: 'hub_po_suppliers',
      filter: [{ field: 'id', op: 'eq', value: 6 }],
    })
  })

  it('keeps the title verbatim when the draft has no relation field', async () => {
    stubGateway({ 'nocobase.list': { rows: [{ id: 42, po_number: 'PO-1' }] } })
    render(
      <ReceiptCard
        draft={DRAFT}
        meta={STRING_META}
        finalFields={DRAFT.fields}
        receipt={{ collection: 'hub_po_orders', rowId: 42 }}
      />,
    )
    // Only the row read-back fires; the title never reads without a relation field.
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(1) })
    expect(screen.getByText('采购单 · 已落库')).toBeTruthy()
  })

  it('shows the raw-id placeholder in the title when the prefill read misses', async () => {
    stubGateway({ 'nocobase.list': { rows: [] } })
    render(
      <ReceiptCard
        draft={titledDraft}
        meta={titleMeta}
        finalFields={{}}
        receipt={{ collection: 'hub_po_purchase_orders', rowId: 9 }}
      />,
    )
    // The prefill id 4 rides the title read; an empty page shows the #id
    // placeholder, never the AI-prefilled 速达冷链设备.
    const prefillRead = await waitFor(() => {
      const read = calls.find(call => call.url === '/api/nocobase.list' && call.payload['collection'] === 'hub_po_suppliers')
      expect(read).toBeTruthy()
      return read
    })
    expect(prefillRead?.payload).toMatchObject({ filter: [{ field: 'id', op: 'eq', value: 4 }] })
    expect(screen.getByText('采购单 PO-V2R-882910（#4） · 已落库')).toBeTruthy()
  })
})

describe('relation label failure recovery', () => {
  /** A purchase-order draft whose title carries the supplier name in the paren group. */
  const titledDraft: FormDraft = {
    collection: 'hub_po_purchase_orders',
    title: '采购单 PO-V2R-882910（速达冷链设备）',
    fields: { po_number: 'PO-V2R-882910', supplier: '6' },
  }

  /** The meta carrying the belongsTo supplier field. */
  const titleMeta = metaOf({ supplier: { name: 'supplier', type: 'belongsTo', target: 'hub_po_suppliers' } })

  it('falls back to the raw-id placeholder in the title after both label reads reject', async () => {
    vi.useFakeTimers()
    stubGateway({ 'nocobase.list': () => { throw new Error('供应商表 502') } })
    render(
      <ReceiptCard
        draft={titledDraft}
        meta={titleMeta}
        finalFields={{ po_number: 'PO-V2R-882910', supplier: '6' }}
        receipt={{ collection: 'hub_po_purchase_orders', rowId: 9 }}
      />,
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    // The degraded label is the raw id shown as the #id placeholder — never
    // the AI-prefilled 速达冷链设备 the failed read could not verify.
    expect(screen.getByText('采购单 PO-V2R-882910（#6） · 已落库')).toBeTruthy()
    // The title read ran its initial call plus the single retry.
    const supplierReads = calls.filter(call => call.payload['collection'] === 'hub_po_suppliers')
    expect(supplierReads).toHaveLength(2)
  })

  it('heals the title on the retry after one rejected label read', async () => {
    vi.useFakeTimers()
    let supplierReads = 0
    stubGateway({ 'nocobase.list': (payload: Record<string, unknown>) => {
      if (payload['collection'] !== 'hub_po_suppliers') return { rows: [{ id: 9, po_number: 'PO-V2R-882910' }] }
      supplierReads += 1
      if (supplierReads === 1) throw new Error('供应商表 502')
      return { rows: [{ id: 6, name: '宏发食品' }] }
    } })
    render(
      <ReceiptCard
        draft={titledDraft}
        meta={titleMeta}
        finalFields={{ po_number: 'PO-V2R-882910', supplier: '6' }}
        receipt={{ collection: 'hub_po_purchase_orders', rowId: 9 }}
      />,
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    // The retry resolves the label without a reload: the placeholder heals.
    expect(screen.getByText('采购单 PO-V2R-882910（宏发食品） · 已落库')).toBeTruthy()
  })

  it('ignores the retry when the card unmounts during the retry delay', async () => {
    vi.useFakeTimers()
    stubGateway({ 'nocobase.list': (payload: Record<string, unknown>) => {
      if (payload['collection'] !== 'hub_po_suppliers') return { rows: [] }
      throw new Error('供应商表 502')
    } })
    const view = render(
      <ReceiptCard
        draft={titledDraft}
        meta={titleMeta}
        finalFields={{ po_number: 'PO-V2R-882910', supplier: '6' }}
        receipt={{ collection: 'hub_po_purchase_orders', rowId: 9 }}
      />,
    )
    // The initial read rejects and arms the retry delay; the card unmounts first.
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    view.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    // The retry never fires after the unmount.
    const supplierReads = calls.filter(call => call.payload['collection'] === 'hub_po_suppliers')
    expect(supplierReads).toHaveLength(1)
  })

  it('drops the degraded label when the card unmounts before the retry settles', async () => {
    vi.useFakeTimers()
    let supplierReads = 0
    let failRetry: (reason?: unknown) => void = () => {}
    const retryGate = new Promise<unknown>((_, reject) => { failRetry = reject })
    stubGateway({ 'nocobase.list': (payload: Record<string, unknown>) => {
      if (payload['collection'] !== 'hub_po_suppliers') return { rows: [] }
      supplierReads += 1
      return supplierReads === 1 ? Promise.reject(new Error('供应商表 502')) : retryGate
    } })
    const view = render(
      <ReceiptCard
        draft={titledDraft}
        meta={titleMeta}
        finalFields={{ po_number: 'PO-V2R-882910', supplier: '6' }}
        receipt={{ collection: 'hub_po_purchase_orders', rowId: 9 }}
      />,
    )
    // The retry fires and pends on the gate; the card unmounts before it settles.
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    view.unmount()
    failRetry(new Error('供应商表 502'))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    // The degraded setLabel lands on an unmounted card and renders nothing.
    expect(document.body.textContent === null || !document.body.textContent.includes('#6')).toBe(true)
  })

  it('keeps the raw-id placeholder stable when every label read rejects', async () => {
    vi.useFakeTimers()
    stubGateway({ 'nocobase.list': () => { throw new Error('供应商表 502') } })
    render(
      <ReceiptCard
        draft={titledDraft}
        meta={titleMeta}
        finalFields={{ po_number: 'PO-V2R-882910', supplier: '6' }}
        receipt={{ collection: 'hub_po_purchase_orders', rowId: 9 }}
      />,
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getByText('采购单 PO-V2R-882910（#6） · 已落库')).toBeTruthy()
    // Degradation stops the read: no third attempt fires however far time moves.
    const supplierReads = calls.filter(call => call.payload['collection'] === 'hub_po_suppliers')
    expect(supplierReads).toHaveLength(2)
  })
})
