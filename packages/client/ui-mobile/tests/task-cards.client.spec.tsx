// @vitest-environment jsdom
/**
 * Task cards: DraftCard's missing-value fallback, ReviewCard's confirmation
 * dialog (cancel keeps pending), and ReceiptCard's static retirement face.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FieldMetaView } from '../src/client/fieldControls.ts'
import type { FormDraft } from '../src/client/form-draft.ts'
import { DraftCard, ReceiptCard, ReviewCard } from '../src/client/forms/task-cards.tsx'
import type { CollectionFieldMeta } from '../src/client/forms/task-cards.tsx'

/**
 * Install the gateway fetch stub (nothing dials it on these paths; the stub
 * keeps an accidental read loud in `calls`).
 */
let calls: string[] = []
beforeEach(() => {
  localStorage.clear()
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (): Promise<Response> => new Response('no gateway use', { status: 500 })))
})

/** One draft over the purchase-order collection. */
const DRAFT: FormDraft = {
  collection: 'hub_po_orders',
  title: '采购单',
  fields: { po_number: 'PO-1', total: '100' },
}

/** A meta map naming every field string-typed unless overridden. */
function metaOf(fields: Record<string, FieldMetaView | undefined>): CollectionFieldMeta {
  const map = new Map<string, FieldMetaView>()
  for (const [name, field] of Object.entries(fields)) {
    if (field !== undefined) map.set(name, field)
  }
  return map
}

const STRING_META = metaOf({
  po_number: { name: 'po_number', type: 'string', title: '单号' },
  total: { name: 'total', type: 'float', title: '金额' },
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  cleanup()
})

describe('DraftCard', () => {
  it('renders a field the values map does not carry as empty', () => {
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
  it('renders the static retirement face without dialing the gateway', () => {
    render(
      <ReceiptCard
        draft={DRAFT}
        finalFields={{ po_number: 'PO-1', total: '100' }}
        receipt={{ collection: 'hub_po_orders', rowId: 42 }}
      />,
    )
    expect(screen.getByText('采购单 · 已落库')).toBeTruthy()
    expect(screen.getByText('该单据随 NocoBase 业务系统退役，此处保留历史回执。')).toBeTruthy()
    expect(calls).toEqual([])
  })
})
