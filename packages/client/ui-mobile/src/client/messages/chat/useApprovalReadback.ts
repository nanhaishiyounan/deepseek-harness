/**
 * W6-B1 G2 approval read-back: live polling of every still-pending approval
 * card's document state (4s while no turn runs — the in-session result card
 * owns the running window). A state that left the review words settles the
 * frozen pending snapshot with 他端已处理. Split from ChatView (W8-B2); the
 * poll semantics are unchanged.
 */

import { useMemo } from 'react'
import { usePoll } from '../../hooks.ts'
import { rpc } from '../../rpc.ts'
import type { ChatItem } from '../../fold.ts'
import type { ApprovalPendingPayload, ApprovalResultPayload } from '../../protocol.ts'

/**
 * Poll the pending approval cards' live document states.
 * @param items - the folded chat items carrying the approval cards.
 * @param running - whether a turn is running (running suspends the poll).
 * @returns the live states keyed `collection:docId`.
 */
export function useApprovalReadback(
  items: readonly ChatItem[],
  running: boolean,
): ReadonlyMap<string, ApprovalResultPayload['state']> {
  const pendingApprovals = useMemo(() => items.flatMap((item): ApprovalPendingPayload[] =>
    item.kind === 'approval' && item.payload.type === 'approval_pending' ? [item.payload] : []), [items])
  const approvalStates = usePoll(async () => {
    const reads = await Promise.all(pendingApprovals.map(async (payload) => {
      const docId = Number(payload.doc.docId)
      if (!Number.isInteger(docId) || docId < 1) return undefined
      try {
        const value = await rpc('nocobase.get', { collection: payload.doc.collection, id: docId })
        // The state column by the collection's own vocabulary (posting
        // collections ride lifecycle_status/status, approval ones doc_status)
        // — the 他端已处理 flip must settle for both.
        const state = (value.row as Record<string, unknown>)['doc_status']
          ?? (value.row as Record<string, unknown>)['status']
          ?? (value.row as Record<string, unknown>)['lifecycle_status']
        return typeof state === 'string'
          ? [`${payload.doc.collection}:${payload.doc.docId}`, state as ApprovalResultPayload['state']] as const
          : undefined
      } catch {
        return undefined
      }
    }))
    return new Map(reads.flatMap(entry => entry === undefined ? [] : [entry]))
  }, 4000, !running && pendingApprovals.length > 0)
  return approvalStates.value ?? new Map<string, ApprovalResultPayload['state']>()
}
