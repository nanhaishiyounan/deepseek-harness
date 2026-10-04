/**
 * The approval card (W1) — the conversation-side half of the general
 * approval engine: an open todo rendered as the actionable pending card
 * (document summary, state stamp, 同意/驳回 with an optional remark), and
 * the post-act outcome as the read-only result card (state chip, the actor,
 * the remark, the audit date). The pending card's buttons send the fenced
 * approval_confirm user message the assistant answers with nb_approve;
 * visual family is the report card's ledger material (reportCard head /
 * metric grid) plus the stamp and chip vocabulary.
 */

import { useState, type JSX } from 'react'
import { Button, Input } from 'antd-mobile'
import type { ApprovalConfirmPayload, ApprovalPendingPayload, ApprovalResultPayload } from '../protocol.ts'
import { buildApprovalConfirmMessage } from '../protocol.ts'
import css from './messages.module.css'

/** Approval-card props: the pending/result payload, the send sink, and the busy gate. */
export interface ApprovalCardProps {
  readonly payload: ApprovalPendingPayload | ApprovalResultPayload
  /** Sends the fenced approval_confirm user message (pending cards only). */
  readonly onSend: (text: string) => void
  readonly disabled: boolean
  /**
   * The live document state read back from NocoBase (W6-B1 G2): when another
   * surface already settled the document, the frozen pending snapshot
   * renders as settled (他端已处理) instead of offering dead buttons.
   */
  readonly externalState?: ApprovalResultPayload['state'] | undefined
}

/** The one state's view row; the closed union always hits a row, the literal fallback keeps the type string-tight. */
function stateViewOf(state: ApprovalResultPayload['state']): { seal: string; label: string; chip: string } {
  const view = APPROVAL_STATE_VIEW[state]
  return view !== undefined ? view : { seal: '草', label: '草稿', chip: chipOf(css.approvalChipDraft) }
}

/** Narrow one CSS-module class name to a string (the modules' index signature is optional-typed). */
const chipOf = (name: string | undefined): string => name ?? ''

/** The state stamp's seal character and chip label per workflow state. */
export const APPROVAL_STATE_VIEW: Readonly<Record<ApprovalResultPayload['state'], { seal: string; label: string; chip: string }>> = {
  draft: { seal: '草', label: '草稿', chip: chipOf(css.approvalChipDraft) },
  pending: { seal: '审', label: '待审批', chip: chipOf(css.approvalChipPending) },
  pending_level2: { seal: '贰', label: '二级审批中', chip: chipOf(css.approvalChipLevel2) },
  approved: { seal: '效', label: '已生效', chip: chipOf(css.approvalChipApproved) },
  rejected: { seal: '驳', label: '已驳回', chip: chipOf(css.approvalChipRejected) },
  void: { seal: '废', label: '已作废', chip: chipOf(css.approvalChipDraft) },
  // The supplier-admission states (B2): reviewing waits like pending, qualified lands like approved.
  potential: { seal: '潜', label: '潜在', chip: chipOf(css.approvalChipDraft) },
  reviewing: { seal: '评', label: '准入评审中', chip: chipOf(css.approvalChipPending) },
  qualified: { seal: '准', label: '合格', chip: chipOf(css.approvalChipApproved) },
}

/**
 * Build the approval_confirm message a pending card's button sends.
 * @param payload - the pending card's payload.
 * @param action - the user's chosen action.
 * @param comment - the optional remark from the input.
 * @returns the serialized user message.
 */
export function approvalConfirmOf(payload: ApprovalPendingPayload, action: 'approve' | 'reject', comment: string): ApprovalConfirmPayload {
  const trimmed = comment.trim()
  return {
    v: payload.v,
    type: 'approval_confirm',
    approvalId: payload.id,
    doc: { collection: payload.doc.collection, label: payload.doc.label, docId: payload.doc.docId },
    action,
    ...trimmed === '' ? {} : { comment: trimmed },
  }
}

/**
 * The approval card.
 * @param props - the payload, send sink, busy gate.
 * @returns the card element.
 */
export function ApprovalCard({ payload, onSend, disabled, externalState }: ApprovalCardProps): JSX.Element {
  const [comment, setComment] = useState('')
  const pending = payload.type === 'approval_pending'
  // G2: a live read-back that left the review states settles the frozen
  // pending snapshot — the card flips to the settled chip with the 他端已处理
  // note and the action buttons retire (they would bounce off the state
  // machine anyway).
  const settledElsewhere = pending && externalState !== undefined
    && externalState !== 'pending' && externalState !== 'pending_level2'
    && externalState !== 'reviewing'
  const state = settledElsewhere ? externalState : pending ? 'pending' : payload.state
  const view = stateViewOf(state)
  const doc = payload.doc
  return (
    <section
      className={css.reportCard}
      data-testid={pending ? 'approval-card' : 'approval-card-result'}
      aria-label={`审批卡 ${doc.label} ${doc.title}`}
    >
      <header className={css.reportHead}>
        <span className={css.reportTitles}>
          <span className={css.reportTitle}>{doc.title}</span>
          <span className={css.reportSubtitle}>
            {doc.label}
            {payload.type === 'approval_pending' && payload.node !== undefined ? ` · ${payload.node}` : ''}
          </span>
        </span>
        <span className={css.reportStamp} aria-hidden="true">{view.seal}</span>
      </header>
      {payload.type === 'approval_pending' && (
        <div className={css.reportMetrics}>
          {payload.summary.map(row => (
            <span key={row.label} className={css.metricMiniCell}>
              <span className={css.metricMiniValue}>{row.value}</span>
              <span className={css.metricMiniLabel}>{row.label}</span>
            </span>
          ))}
        </div>
      )}
      {payload.type === 'approval_result' && (
        <ul className={css.reportRows}>
          {payload.comment !== undefined && (
            <li className={css.reportRow}>
              <span className={`${css.rowDot} ${payload.action === 'approve' ? css.rowDotLow : css.rowDotHigh}`} aria-hidden="true" />
              <span className={css.rowTexts}>
                <span className={css.rowLabel}>{payload.comment}</span>
                <span className={css.rowHint}>审批意见</span>
              </span>
            </li>
          )}
          <li className={css.reportRow}>
            <span className={`${css.rowDot} ${css.rowDotLow}`} aria-hidden="true" />
            <span className={css.rowTexts}>
              <span className={css.rowLabel}>{payload.by}{payload.at !== undefined ? ` · ${payload.at}` : ''}</span>
              <span className={css.rowHint}>操作人与时间</span>
            </span>
          </li>
        </ul>
      )}
      <div className={css.reportDivider} aria-hidden="true" />
      <div className={css.approvalFooter}>
        <span className={`${css.approvalChip} ${view.chip}`}>{view.label}</span>
        {settledElsewhere && <span className={css.approvalElsewhere}>他端已处理</span>}
        {pending && !settledElsewhere && (
          <span className={css.reportActions}>
            <Input
              className={css.approvalComment}
              placeholder="审批意见（可选）"
              value={comment}
              onChange={setComment}
              disabled={disabled}
              aria-label="审批意见"
            />
            <Button
              size="small"
              disabled={disabled}
              onClick={() => { onSend(buildApprovalConfirmMessage(approvalConfirmOf(payload, 'reject', comment))) }}
              className={css.reportSecondary}
            >
              驳回
            </Button>
            <Button
              color="primary"
              size="small"
              disabled={disabled}
              onClick={() => { onSend(buildApprovalConfirmMessage(approvalConfirmOf(payload, 'approve', comment))) }}
              className={css.reportPrimary}
            >
              同意
            </Button>
          </span>
        )}
      </div>
    </section>
  )
}
