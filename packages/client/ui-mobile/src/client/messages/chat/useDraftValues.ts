/**
 * The conversation's draft-card value cells (split from ChatView, W8-B2; the
 * hydration guarantees are unchanged): per-seq edit values hydrated from
 * localStorage on mount and the edit sink that persists through draftStore.
 * The generated system-number leg is retired with the NocoBase wire.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ChatItem } from '../../fold.ts'
import { loadDraftEdits, saveDraftEdits } from '../../draftStore.ts'

/** The draft-card value cells the conversation page renders against. */
export interface DraftValuesCell {
  /** Edit values keyed by card seq (hydrated over each draft's own fields). */
  readonly draftValues: ReadonlyMap<number, Record<string, string>>
  /** The edit sink for one card: persists and merges into the seq's row. */
  readonly onEdit: (seq: number) => (name: string, value: string) => void
}

/**
 * The draft-card values cell.
 * @param items - the folded chat items carrying the task cards.
 * @param sessionId - the owning session (the draftStore scope).
 * @returns the values and the edit sink.
 */
export function useDraftValues(
  items: readonly ChatItem[],
  sessionId: string,
): DraftValuesCell {
  const [draftValues, setDraftValues] = useState<ReadonlyMap<number, Record<string, string>>>(new Map())

  useEffect(() => {
    setDraftValues((current) => {
      const next = new Map(current)
      for (const item of items) {
        if (item.kind !== 'task-card') continue
        if (next.has(item.seq)) continue
        const saved = loadDraftEdits(sessionId, item.draft)
        next.set(item.seq, saved === undefined ? { ...item.draft.fields } : { ...item.draft.fields, ...saved })
      }
      return next
    })
  }, [items, sessionId])


  const onEdit = useCallback((seq: number) => (name: string, value: string) => {
    setDraftValues((current) => {
      const row = current.get(seq)
      // The mount hydration above seeds every folded card before any user
      // edit can arrive, so the missing-row arm is unreachable.
      /* v8 ignore next -- hydration always precedes the first edit. */
      if (row === undefined) return current
      const next = { ...row, [name]: value }
      for (const item of items) {
        if (item.kind === 'task-card' && item.seq === seq) saveDraftEdits(sessionId, item.draft, next)
      }
      return new Map(current).set(seq, next)
    })
  }, [items, sessionId])

  return { draftValues, onEdit }
}
