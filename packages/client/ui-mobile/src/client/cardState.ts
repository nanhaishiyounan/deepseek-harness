/**
 * Task-card phase derivation: the pure replay that turns the folded chat
 * items back into each draft card's lifecycle state (draft → pending →
 * submitted / rejected). The durable session log is the single source of
 * truth. v3 actions and receipts discriminate by their `dsh` fence payloads
 * (draftId + revision anchors — model wording drift cannot break the chain);
 * v2 sessions keep the text-prefix and receipt-regex replay so history
 * reloads identically. Pending state no longer depends on localStorage.
 */

import type { ChatItem } from './fold.ts'
import { parsePushReceipt, type PushReceipt } from './form-draft.ts'
import type { SubmitReceiptPayload } from './protocol.ts'

/** One card's lifecycle phase. */
export type CardPhase = 'draft' | 'pending' | 'submitted' | 'rejected'

/** The derived state of one task-card item (keyed by its seq). */
export interface DerivedCardState {
  readonly phase: CardPhase
  /** Final fields locked in by the confirm action (pending/submitted). */
  readonly confirmedFields?: Readonly<Record<string, string>>
  /** The landing-row receipt (submitted; the v2 text-regex shape). */
  readonly receipt?: PushReceipt
  /** The landing-row receipt (submitted; the v3 fence payload). */
  readonly receiptPayload?: SubmitReceiptPayload
  /** True when a newer revision of the same draftId superseded this card. */
  readonly superseded?: boolean
}

/** The per-draftId replay cursor (the newest revision card owns the phase). */
interface DraftCursor {
  currentSeq: number
  currentRevision: number
}

/**
 * Derive every task card's phase from the folded items.
 *
 * v3 matching rules: a form_confirm claims the newest-revision card of its
 * draftId (the greatest confirm revision wins on re-edits); a reject_flow
 * rejects that card unless it already landed; a submit_receipt settles it as
 * submitted. v2 rules stay as the legacy prefix/collection replay for
 * sessions the old persona produced.
 * @param items - the folded chat items in seq order.
 * @returns phase (and payload) per task-card seq; cards without any action
 * stay in draft; superseded revisions hide from the flow.
 */
export function deriveCardStates(items: readonly ChatItem[]): Map<number, DerivedCardState> {
  const states = new Map<number, DerivedCardState>()
  const collectionOf = new Map<number, string>()
  const cursors = new Map<string, DraftCursor>()
  for (const item of items) {
    if (item.kind !== 'task-card') continue
    states.set(item.seq, { phase: 'draft' })
    collectionOf.set(item.seq, item.draft.collection)
    if (item.payload !== undefined) {
      const cursor = cursors.get(item.payload.draftId)
      if (cursor === undefined) {
        cursors.set(item.payload.draftId, { currentSeq: item.seq, currentRevision: item.payload.revision })
      } else if (item.payload.revision >= cursor.currentRevision) {
        states.set(cursor.currentSeq, { phase: 'draft', superseded: true })
        cursor.currentSeq = item.seq
        cursor.currentRevision = item.payload.revision
      } else {
        states.set(item.seq, { phase: 'draft', superseded: true })
      }
    }
  }
  for (const item of items) {
    if (item.kind === 'action') {
      if (item.payload !== undefined) {
        if (item.payload.type === 'form_confirm') {
          settleConfirm(states, cursors, item.payload.draftId, item.payload.revision, fieldsRecordOf(item.payload.fields))
        } else {
          settleReject(states, cursors, item.payload.draftId)
        }
        continue
      }
      if (item.legacy !== undefined) {
        const target = earliestOpenCard(states, collectionOf, item.legacy.collection, item.seq)
        if (target !== undefined) {
          states.set(target, { phase: 'pending', confirmedFields: item.legacy.fields })
        }
        continue
      }
      if (item.action === 'reject') {
        const target = latestDraftCard(states, collectionOf, item.seq)
        if (target !== undefined) states.set(target, { phase: 'rejected' })
      }
      continue
    }
    if (item.kind === 'receipt') {
      settleReceipt(states, cursors, item.payload)
      continue
    }
    if (item.kind !== 'text') continue
    const receipt = parsePushReceipt(item.text)
    if (receipt !== undefined && item.role === 'assistant') {
      const target = newestPendingCard(states, collectionOf, receipt.collection)
      if (target !== undefined) {
        const previous = states.get(target)
        const confirmed = previous?.confirmedFields
        // A pending card always carries its confirmed fields, so the bare
        // receipt arm only exists for the type, not a reachable state.
        /* v8 ignore next -- pending cards always carry confirmedFields. */
        states.set(target, confirmed === undefined
          ? { phase: 'submitted', receipt }
          : { phase: 'submitted', confirmedFields: confirmed, receipt })
      }
    }
  }
  return states
}

/** The {name: value} record of one confirm's field rows. */
function fieldsRecordOf(fields: ReadonlyArray<{ name: string; value: string }>): Record<string, string> {
  const record: Record<string, string> = {}
  for (const field of fields) record[field.name] = field.value
  return record
}

/** A v3 confirm claims its draftId's current card (greatest revision wins). */
function settleConfirm(
  states: Map<number, DerivedCardState>,
  cursors: Map<string, DraftCursor>,
  draftId: string,
  revision: number,
  confirmedFields: Record<string, string>,
): void {
  const cursor = cursors.get(draftId)
  if (cursor === undefined) return
  // An older-revision confirm arriving after a newer one changes nothing:
  // the replay rule takes the greatest revision.
  if (revision < cursor.currentRevision) return
  const previous = states.get(cursor.currentSeq)
  if (previous?.phase === 'submitted') return
  states.set(cursor.currentSeq, { phase: 'pending', confirmedFields })
}

/** A v3 reject discards its draftId's current card unless it already landed. */
function settleReject(
  states: Map<number, DerivedCardState>,
  cursors: Map<string, DraftCursor>,
  draftId: string,
): void {
  const cursor = cursors.get(draftId)
  if (cursor === undefined) return
  const previous = states.get(cursor.currentSeq)
  if (previous?.phase === 'submitted') return
  states.set(cursor.currentSeq, { phase: 'rejected' })
}

/** A v3 receipt settles its draftId's current card as submitted. */
function settleReceipt(
  states: Map<number, DerivedCardState>,
  cursors: Map<string, DraftCursor>,
  payload: SubmitReceiptPayload,
): void {
  const cursor = cursors.get(payload.draftId)
  if (cursor === undefined) return
  const previous = states.get(cursor.currentSeq)
  if (previous?.phase !== 'pending') return
  states.set(cursor.currentSeq, {
    phase: 'submitted',
    // A pending card always carries its confirmed fields (settleConfirm set
    // them); the bare arm exists for the type, not a reachable state.
    /* v8 ignore next 2 -- pending cards always carry confirmedFields. */
    ...(previous.confirmedFields === undefined ? {} : { confirmedFields: previous.confirmedFields }),
    receiptPayload: payload,
  })
}

/** The earliest card of `collection` before `limitSeq` that is not submitted. */
function earliestOpenCard(
  states: Map<number, DerivedCardState>,
  collectionOf: Map<number, string>,
  collection: string,
  limitSeq: number,
): number | undefined {
  let found: number | undefined
  for (const [seq, state] of states) {
    if (seq >= limitSeq) continue
    if (collectionOf.get(seq) !== collection) continue
    if (state.phase === 'submitted') continue
    if (found === undefined || seq < found) found = seq
  }
  return found
}

/** The latest card before `limitSeq` still sitting in draft (any collection). */
function latestDraftCard(
  states: Map<number, DerivedCardState>,
  collectionOf: Map<number, string>,
  limitSeq: number,
): number | undefined {
  let found: number | undefined
  for (const [seq, state] of states) {
    if (seq >= limitSeq) continue
    // Every state key is a task-card seq and every task-card seq carries its
    // collection, so the undefined arm is unreachable.
    /* v8 ignore next -- state keys always map to a collection. */
    if (collectionOf.get(seq) === undefined) continue
    if (state.phase !== 'draft') continue
    if (found === undefined || seq > found) found = seq
  }
  return found
}

/** The newest pending card of `collection` (the receipt settles the last push). */
function newestPendingCard(
  states: Map<number, DerivedCardState>,
  collectionOf: Map<number, string>,
  collection: string,
): number | undefined {
  let found: number | undefined
  for (const [seq, state] of states) {
    if (collectionOf.get(seq) !== collection) continue
    if (state.phase !== 'pending') continue
    // A confirm claims the earliest still-open card of its collection, so a
    // second card of the same collection cannot go pending while an earlier
    // one holds the phase; the compare arm is unreachable.
    /* v8 ignore next -- one pending card per collection at a time. */
    if (found === undefined || seq > found) found = seq
  }
  return found
}
