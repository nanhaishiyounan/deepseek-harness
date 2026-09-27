// @vitest-environment jsdom
/**
 * The approval card's contract (W1): the three approval payloads' fence
 * validation (valid bodies parse, malformed ones degrade whole), the fold's
 * projection (pending/result fences render approval items, the user's
 * approval_confirm collapses to the 同意/驳回 action badge, the nb_approve
 * tool row carries its Chinese label), and the card's render + interaction
 * (summary grid and state stamp on the pending card, the remark input riding
 * the action row, the buttons sending the fenced approval_confirm message,
 * and the read-only result card with the audit line).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalCard, approvalConfirmOf } from '../src/client/messages/ApprovalCard.tsx'
import { buildApprovalConfirmMessage, parseDshPayload, splitMessage } from '../src/client/protocol.ts'
import { foldHistory, type FoldEvent } from '../src/client/fold.ts'
import type { ApprovalPendingPayload, ApprovalResultPayload } from '../src/client/protocol.ts'

afterEach(cleanup)

/** One legal approval_pending fence body. */
const PENDING_BODY = JSON.stringify({
  v: 3,
  type: 'approval_pending',
  id: 'ap_1',
  doc: { collection: 'hub_po_purchase_orders', label: '采购单', docId: '7', title: 'PO-2026-0042' },
  applicant: '陈立群',
  node: '经理审批',
  summary: [
    { label: '合计金额', value: '¥16,000', kind: 'money' },
    { label: '申请人', value: '陈立群', kind: 'text' },
    { label: '轮次', value: '1', kind: 'count' },
  ],
})

const pendingPayload = (): ApprovalPendingPayload => parseDshPayload(PENDING_BODY) as ApprovalPendingPayload

/** One legal approval_result fence body. */
const RESULT_BODY = JSON.stringify({
  v: 3,
  type: 'approval_result',
  approvalId: 'ap_1',
  doc: { collection: 'hub_po_purchase_orders', label: '采购单', docId: '7', title: 'PO-2026-0042' },
  action: 'approve',
  state: 'approved',
  by: 'admin',
  comment: '同意，按合同执行',
  at: '2026-09-25',
})

const resultPayload = (): ApprovalResultPayload => parseDshPayload(RESULT_BODY) as ApprovalResultPayload

describe('approval payload validation', () => {
  it('parses the pending/result bodies and keeps malformed fences degraded', () => {
    const pending = pendingPayload()
    expect(pending.doc).toMatchObject({ collection: 'hub_po_purchase_orders', docId: '7', title: 'PO-2026-0042' })
    expect(pending.summary).toHaveLength(3)
    const result = resultPayload()
    expect(result.state).toBe('approved')
    expect(result.by).toBe('admin')
    // A missing summary, a missing doc title, and an unknown state each degrade whole.
    const noSummary = JSON.parse(PENDING_BODY) as Record<string, unknown>
    delete noSummary['summary']
    expect(parseDshPayload(JSON.stringify(noSummary))).toBeUndefined()
    const noTitle = JSON.parse(PENDING_BODY) as Record<string, unknown>
    ;(noTitle['doc'] as Record<string, unknown>)['title'] = ''
    expect(parseDshPayload(JSON.stringify(noTitle))).toBeUndefined()
    const badState = JSON.parse(RESULT_BODY) as Record<string, unknown>
    badState['state'] = 'submitted'
    expect(parseDshPayload(JSON.stringify(badState))).toBeUndefined()
    // The model's Chinese state spelling normalizes onto the same closed enum.
    const chineseState = JSON.parse(RESULT_BODY) as Record<string, unknown>
    chineseState['state'] = '已生效'
    expect(parseDshPayload(JSON.stringify(chineseState))).toMatchObject({ type: 'approval_result', state: 'approved' })
    const illegalChinese = JSON.parse(RESULT_BODY) as Record<string, unknown>
    illegalChinese['state'] = '已提交'
    expect(parseDshPayload(JSON.stringify(illegalChinese))).toBeUndefined()
  })

  it('splits the approval fences out of the narrative', () => {
    const { segments, degraded } = splitMessage(`这有一张待审单。\n\`\`\`dsh\n${PENDING_BODY}\n\`\`\``)
    expect(degraded).toBe(0)
    expect(segments[0]).toMatchObject({ kind: 'text' })
    expect(segments[1]).toMatchObject({ kind: 'dsh', payload: { type: 'approval_pending' } })
  })
})

describe('approval fold projection', () => {
  /** Fold raw events through the real history fold. */
  const fold = (events: ReadonlyArray<Partial<FoldEvent> & { type: string }>) =>
    foldHistory(events.map((event, index) => ({ seq: index + 1, time: 1_700_000_000_000, ...event } as FoldEvent)))

  it('renders assistant pending/result fences as approval items and the tool row with its label', () => {
    const folded = fold([
      { type: 'tool/call', data: { callId: 'c1', name: 'nb_approve', arguments: '{}' } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: `\`\`\`dsh\n${PENDING_BODY}\n\`\`\`` }] } } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: `\`\`\`dsh\n${RESULT_BODY}\n\`\`\`` }] } } },
    ])
    const approvals = folded.items.filter(item => item.kind === 'approval')
    expect(approvals).toHaveLength(2)
    expect(approvals[0]).toMatchObject({ payload: { type: 'approval_pending' } })
    expect(approvals[1]).toMatchObject({ payload: { type: 'approval_result' } })
    const tool = folded.items.find(item => item.kind === 'tool')
    expect(tool).toMatchObject({ name: 'nb_approve', label: '审批操作' })
  })

  it('collapses the user approval_confirm fence to the 同意 action badge', () => {
    const confirm = JSON.stringify({
      v: 3, type: 'approval_confirm', approvalId: 'ap_1',
      doc: { collection: 'hub_po_purchase_orders', label: '采购单', docId: '7' },
      action: 'approve', comment: '同意这笔',
    })
    const folded = fold([
      { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: `同意\n\`\`\`dsh\n${confirm}\n\`\`\`` }] } },
    ])
    const action = folded.items.find(item => item.kind === 'action')
    expect(action).toMatchObject({ action: 'confirm', text: '同意' })
    // No raw bubble leaks the fence.
    expect(folded.items.filter(item => item.kind === 'text')).toHaveLength(0)
  })

  it('drops an assistant-emitted approval_confirm (user-action fences never render from the model)', () => {
    const confirm = JSON.stringify({
      v: 3, type: 'approval_confirm', approvalId: 'ap_1',
      doc: { collection: 'x', label: 'x', docId: '1' }, action: 'reject',
    })
    const folded = fold([
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: `\`\`\`dsh\n${confirm}\n\`\`\`` }] } } },
    ])
    expect(folded.items.filter(item => item.kind === 'action')).toHaveLength(0)
    expect(folded.items.filter(item => item.kind === 'approval')).toHaveLength(0)
  })
})

describe('ApprovalCard render and interaction', () => {
  it('renders the pending card with the summary grid, stamp, chip, remark input, and both buttons', () => {
    render(<ApprovalCard payload={pendingPayload()} onSend={() => {}} disabled={false} />)
    expect(screen.getByTestId('approval-card')).toBeTruthy()
    expect(screen.getByText('PO-2026-0042')).toBeTruthy()
    expect(screen.getByText('采购单 · 经理审批')).toBeTruthy()
    expect(screen.getByText('¥16,000')).toBeTruthy()
    expect(screen.getByText('合计金额')).toBeTruthy()
    expect(screen.getByPlaceholderText('审批意见（可选）')).toBeTruthy()
    const buttons = screen.getAllByRole('button').map(button => button.textContent)
    expect(buttons).toContain('同意')
    expect(buttons).toContain('驳回')
    expect(screen.getByText('待审批').className).toContain('approvalChipPending')
  })

  it('sends the fenced approval_confirm message carrying the remark', () => {
    const onSend = vi.fn()
    render(<ApprovalCard payload={pendingPayload()} onSend={onSend} disabled={false} />)
    fireEvent.change(screen.getByPlaceholderText('审批意见（可选）'), { target: { value: ' 同意，按合同执行 ' } })
    fireEvent.click(screen.getByText('同意'))
    expect(onSend).toHaveBeenCalledTimes(1)
    const text = onSend.mock.calls[0]?.[0] as string
    expect(text.startsWith('同意\n```dsh\n')).toBe(true)
    const payload = parseDshPayload(text.split('```dsh\n')[1]?.split('\n```')[0] ?? '') as { type: string; comment?: string }
    expect(payload.type).toBe('approval_confirm')
    expect(payload.comment).toBe('同意，按合同执行')
    // approvalConfirmOf trims and omits the empty remark.
    expect(approvalConfirmOf(pendingPayload(), 'reject', '  ').comment).toBeUndefined()
  })

  it('renders the result card read-only with the audit line and the state chip', () => {
    render(<ApprovalCard payload={resultPayload()} onSend={() => {}} disabled={false} />)
    expect(screen.getByTestId('approval-card-result')).toBeTruthy()
    expect(screen.getByText('同意，按合同执行')).toBeTruthy()
    expect(screen.getByText('admin · 2026-09-25')).toBeTruthy()
    expect(screen.getByText('已生效').className).toContain('approvalChipApproved')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByLabelText('审批意见')).toBeNull()
  })

  it('serializes the confirm message round-trip', () => {
    const confirm = approvalConfirmOf(pendingPayload(), 'reject', '资质不全')
    const message = buildApprovalConfirmMessage(confirm)
    expect(message.startsWith('驳回\n```dsh\n')).toBe(true)
    expect(parseDshPayload(message.split('```dsh\n')[1]?.split('\n```')[0] ?? '')).toMatchObject({ type: 'approval_confirm', action: 'reject', comment: '资质不全' })
  })
})
