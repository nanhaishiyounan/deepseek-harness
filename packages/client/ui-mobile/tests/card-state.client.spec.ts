// @vitest-environment jsdom
/** deriveCardStates: the task-card phase replay over folded chat items. */

import { describe, expect, it } from 'vitest'
import { deriveCardStates } from '../src/client/cardState.ts'
import type { ChatItem, ChatReceipt } from '../src/client/fold.ts'
import type { FormDraftPayload } from '../src/client/protocol.ts'

const DRAFT_SEQ = 1.5

/** One task-card item carrying the collection under test. */
function card(collection: string, seq: number = DRAFT_SEQ): ChatItem {
  return { kind: 'task-card', seq, time: 1, draft: { collection, title: '单据', fields: { a: '1' } } }
}

/** One user/assistant text item. */
function text(role: 'user' | 'assistant', seq: number, body: string): ChatItem {
  return { kind: 'text', seq, time: 1, role, text: body }
}

/** One v2 confirm-push action item (the fold's shape for the legacy prefix). */
function confirmPush(seq: number, collection: string, fields: Record<string, string>): ChatItem {
  return {
    kind: 'action',
    seq,
    time: 1,
    action: 'confirm',
    text: `确认推送：…\n${JSON.stringify({ collection, fields })}`,
    legacy: { collection, fields },
  }
}

/** One v2 reject action item (the fold's shape for the 驳回： prefix). */
function rejectPush(seq: number): ChatItem {
  return { kind: 'action', seq, time: 1, action: 'reject', text: '驳回：本表单草稿作废，不要写库。' }
}

/** One v3 three-tier draft card anchored on a draftId/revision. */
function v3Card(draftId: string, revision: number, seq: number, collection = 'hub_po_orders'): ChatItem {
  const payload: FormDraftPayload = {
    v: 3,
    type: 'form_draft',
    draftId,
    revision,
    form: { collection, label: '采购单' },
    title: '单据',
    fields: [
      { name: 'a', label: '甲', value: '1', tier: 'required', widget: 'text' },
      { name: 'status', label: '状态', value: 'draft', tier: 'derived', widget: 'text' },
    ],
  }
  return { kind: 'task-card', seq, time: 1, draft: { collection, title: '单据', fields: { a: '1', status: 'draft' } }, payload }
}

/** One v3 form_confirm action item. */
function v3Confirm(seq: number, draftId: string, revision: number, collection = 'hub_po_orders'): ChatItem {
  return {
    kind: 'action',
    seq,
    time: 1,
    action: 'confirm',
    text: '确认写入',
    payload: {
      v: 3,
      type: 'form_confirm',
      draftId,
      revision,
      form: { collection, label: '采购单' },
      fields: [{ name: 'a', label: '甲', value: '2' }],
    },
  }
}

/** One v3 reject_flow action item. */
function v3Reject(seq: number, draftId: string): ChatItem {
  return { kind: 'action', seq, time: 1, action: 'reject', text: '驳回', payload: { v: 3, type: 'reject_flow', draftId } }
}

/** One v3 submit_receipt item. */
function v3Receipt(seq: number, draftId: string, collection = 'hub_po_orders'): ChatReceipt {
  return {
    kind: 'receipt',
    seq,
    time: 1,
    payload: {
      v: 3,
      type: 'submit_receipt',
      draftId,
      form: { collection, label: '采购单' },
      rowId: '1042',
      summary: [{ label: '合计金额', value: '¥16,000', kind: 'money' }],
    },
  }
}

describe('deriveCardStates (v2 legacy actions)', () => {
  it('keeps a fresh draft in draft', () => {
    const states = deriveCardStates([card('hub_po_orders')])
    expect(states.get(DRAFT_SEQ)).toEqual({ phase: 'draft' })
  })

  it('locks the confirmed fields on a confirm-push message', () => {
    const states = deriveCardStates([
      card('hub_po_orders'),
      confirmPush(2, 'hub_po_orders', { a: '2' }),
    ])
    expect(states.get(DRAFT_SEQ)).toEqual({ phase: 'pending', confirmedFields: { a: '2' } })
  })

  it('settles submitted on the assistant receipt naming the collection', () => {
    const states = deriveCardStates([
      card('hub_po_orders'),
      confirmPush(2, 'hub_po_orders', { a: '2' }),
      text('assistant', 3, '业务表 hub_po_orders 行 id=42 已创建'),
    ])
    expect(states.get(DRAFT_SEQ)).toEqual({
      phase: 'submitted',
      confirmedFields: { a: '2' },
      receipt: { collection: 'hub_po_orders', rowId: 42 },
    })
  })

  it('rejects the latest still-draft card on a reject message', () => {
    const states = deriveCardStates([
      card('hub_po_orders'),
      rejectPush(2),
    ])
    expect(states.get(DRAFT_SEQ)).toEqual({ phase: 'rejected' })
  })

  it('pairs confirms and receipts to their own cards across collections', () => {
    const states = deriveCardStates([
      card('hub_po_orders', 1.5),
      card('hub_po_suppliers', 2.5),
      confirmPush(3, 'hub_po_suppliers', { name: '新供应商' }),
      confirmPush(4, 'hub_po_orders', { po_number: 'PO-1' }),
      text('assistant', 5, '业务表 hub_po_suppliers 行 id=9 已创建'),
    ])
    expect(states.get(2.5)?.phase).toBe('submitted')
    expect(states.get(1.5)?.phase).toBe('pending')
  })

  it('re-opens a rejected card when the user confirms a re-edited push', () => {
    const states = deriveCardStates([
      card('hub_po_orders'),
      rejectPush(2),
      confirmPush(3, 'hub_po_orders', { a: '2' }),
    ])
    expect(states.get(DRAFT_SEQ)).toEqual({ phase: 'pending', confirmedFields: { a: '2' } })
  })

  it('ignores confirmations of unknown collections and user-shaped receipts', () => {
    const states = deriveCardStates([
      card('hub_po_orders'),
      confirmPush(2, 'hub_po_elsewhere', { a: '1' }),
      text('user', 3, '业务表 hub_po_orders 行 id=42 已创建'),
    ])
    expect(states.get(DRAFT_SEQ)).toEqual({ phase: 'draft' })
  })

  it('drops a reject with no still-draft card behind it', () => {
    const states = deriveCardStates([
      card('hub_po_orders'),
      confirmPush(2, 'hub_po_orders', { a: '2' }),
      rejectPush(3),
    ])
    // The only card is pending, so the reject finds no draft to reject.
    expect(states.get(DRAFT_SEQ)?.phase).toBe('pending')
  })

  it('drops a receipt with no pending card of its collection', () => {
    const states = deriveCardStates([
      card('hub_po_orders'),
      text('assistant', 2, '业务表 hub_po_orders 行 id=42 已创建'),
    ])
    expect(states.get(DRAFT_SEQ)).toEqual({ phase: 'draft' })
  })

  it('skips cards the confirm message sits behind', () => {
    const states = deriveCardStates([
      card('hub_po_orders', 1.5),
      confirmPush(2, 'hub_po_orders', { a: '2' }),
      card('hub_po_orders', 3),
    ])
    expect(states.get(1.5)?.phase).toBe('pending')
    expect(states.get(3)?.phase).toBe('draft')
  })

  it('lets a later confirm claim a fresh card after one card settles', () => {
    const states = deriveCardStates([
      card('hub_po_orders', 1.5),
      confirmPush(2, 'hub_po_orders', { a: '2' }),
      text('assistant', 3, '业务表 hub_po_orders 行 id=42 已创建'),
      card('hub_po_orders', 4),
      confirmPush(5, 'hub_po_orders', { a: '2' }),
    ])
    expect(states.get(1.5)?.phase).toBe('submitted')
    expect(states.get(4)?.phase).toBe('pending')
  })

  it('rejects the latest still-draft card even out of seq order', () => {
    const states = deriveCardStates([
      card('hub_po_orders', 2.5),
      card('hub_po_orders', 1.5),
      rejectPush(3),
    ])
    // The walk visits 1.5 after 2.5 but keeps 2.5 as the latest draft.
    expect(states.get(2.5)?.phase).toBe('rejected')
    expect(states.get(1.5)?.phase).toBe('draft')
  })

  it('keeps the earliest card when two same-collection drafts await one confirm', () => {
    const states = deriveCardStates([
      card('hub_po_orders', 1.5),
      card('hub_po_orders', 2.5),
      confirmPush(3, 'hub_po_orders', { a: '2' }),
    ])
    expect(states.get(1.5)?.phase).toBe('pending')
    expect(states.get(2.5)?.phase).toBe('draft')
  })

  it('skips cards a reject message sits behind', () => {
    const states = deriveCardStates([
      card('hub_po_orders', 1.5),
      rejectPush(2),
      card('hub_po_orders', 3),
    ])
    expect(states.get(1.5)?.phase).toBe('rejected')
    expect(states.get(3)?.phase).toBe('draft')
  })

  it('skips submitted and foreign cards as confirms and receipts walk forward', () => {
    const states = deriveCardStates([
      card('hub_po_suppliers', 1.5),
      card('hub_po_orders', 2.5),
      confirmPush(3, 'hub_po_orders', { a: '2' }),
      text('assistant', 4, '业务表 hub_po_orders 行 id=42 已创建'),
      card('hub_po_orders', 4.5),
      confirmPush(5, 'hub_po_orders', { a: '2' }),
      text('assistant', 6, '业务表 hub_po_orders 行 id=43 已创建'),
    ])
    // Each receipt settles its own card; the suppliers draft stays open.
    expect(states.get(2.5)?.phase).toBe('submitted')
    expect(states.get(4.5)?.phase).toBe('submitted')
    expect(states.get(1.5)?.phase).toBe('draft')
  })
})

describe('deriveCardStates (v3 fence anchors)', () => {
  it('settles pending → submitted through draftId anchors', () => {
    const receipt = v3Receipt(3, 'd_1')
    const states = deriveCardStates([
      v3Card('d_1', 1, 1.5),
      v3Confirm(2, 'd_1', 1),
      receipt,
    ])
    expect(states.get(1.5)).toEqual({
      phase: 'submitted',
      confirmedFields: { a: '2' },
      receiptPayload: receipt.payload,
    })
  })

  it('rejects a draft through its draftId and leaves it unsubmitted', () => {
    const states = deriveCardStates([
      v3Card('d_1', 1, 1.5),
      v3Reject(2, 'd_1'),
    ])
    expect(states.get(1.5)).toEqual({ phase: 'rejected' })
  })

  it('supersedes the older revision and re-opens it on re-edit confirm', () => {
    const states = deriveCardStates([
      v3Card('d_1', 1, 1.5),
      v3Card('d_1', 2, 3),
      v3Confirm(4, 'd_1', 2),
    ])
    expect(states.get(1.5)).toEqual({ phase: 'draft', superseded: true })
    expect(states.get(3)).toEqual({ phase: 'pending', confirmedFields: { a: '2' } })
  })

  it('ignores a stale-revision confirm after a newer one landed', () => {
    const states = deriveCardStates([
      v3Card('d_1', 2, 1.5),
      v3Confirm(2, 'd_1', 2),
      v3Confirm(3, 'd_1', 1),
    ])
    // The greatest confirm revision is 2; the replay keeps it pending.
    expect(states.get(1.5)?.phase).toBe('pending')
  })

  it('anchors independent draftIds independently', () => {
    const states = deriveCardStates([
      v3Card('d_1', 1, 1.5),
      v3Card('d_2', 1, 2.5, 'hub_wms_outbound'),
      v3Confirm(3, 'd_2', 1, 'hub_wms_outbound'),
      v3Receipt(4, 'd_2', 'hub_wms_outbound'),
    ])
    expect(states.get(2.5)?.phase).toBe('submitted')
    expect(states.get(1.5)?.phase).toBe('draft')
  })

  it('ignores actions and receipts for unknown draftIds', () => {
    const states = deriveCardStates([
      v3Card('d_1', 1, 1.5),
      v3Confirm(2, 'd_unknown', 1),
      v3Receipt(3, 'd_unknown'),
    ])
    expect(states.get(1.5)).toEqual({ phase: 'draft' })
  })
})

describe('deriveCardStates (out-of-order revisions)', () => {
  it('supersedes a stale revision arriving after a newer card', () => {
    const states = deriveCardStates([
      v3Card('d_1', 2, 2.5),
      v3Card('d_1', 1, 3.5),
    ])
    expect(states.get(2.5)).toEqual({ phase: 'draft' })
    expect(states.get(3.5)).toEqual({ phase: 'draft', superseded: true })
  })
})

describe('deriveCardStates (v3 late and orphaned actions)', () => {
  it('keeps a submitted card through a late confirm and a later reject', () => {
    const states = deriveCardStates([
      v3Card('d_1', 1, 1.5),
      v3Confirm(2, 'd_1', 1),
      v3Receipt(3, 'd_1'),
      v3Confirm(4, 'd_1', 1),
      v3Reject(5, 'd_1'),
    ])
    expect(states.get(1.5)?.phase).toBe('submitted')
  })

  it('drops a v3 reject for an unknown draftId and a receipt without a pending card', () => {
    const states = deriveCardStates([
      v3Card('d_1', 1, 1.5),
      v3Reject(2, 'd_unknown'),
      v3Receipt(3, 'd_1'),
    ])
    // The receipt lands before any confirm: the card stays in draft.
    expect(states.get(1.5)).toEqual({ phase: 'draft' })
  })

  it('ignores a stale-revision confirm against a newer card', () => {
    const states = deriveCardStates([
      v3Card('d_1', 2, 1.5),
      v3Confirm(2, 'd_1', 1),
    ])
    expect(states.get(1.5)).toEqual({ phase: 'draft' })
  })
})

describe('deriveCardStates (anchor-free action tolerance)', () => {
  it('skips a bare confirm action carrying neither anchor', () => {
    const states = deriveCardStates([
      v3Card('d_1', 1, 1.5),
      { kind: 'action', seq: 2, time: 1, action: 'confirm', text: '确认写入' },
    ])
    // The card stays untouched: the fold never emits this shape, and the
    // derivation refuses to act without an anchor.
    expect(states.get(1.5)).toEqual({ phase: 'draft' })
  })
})
