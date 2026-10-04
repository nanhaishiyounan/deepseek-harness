/**
 * The conversation's draft-card value cells (split from ChatView, W8-B2; the
 * hydration and landing guarantees are unchanged): per-seq edit values
 * hydrated from localStorage on mount, per-draft-id generated system numbers
 * (one read per draft, cached so revisions keep the same number), and the
 * edit sink that persists through draftStore.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ChatItem } from '../../fold.ts'
import type { DerivedCardState } from '../../cardState.ts'
import { loadDraftEdits, saveDraftEdits } from '../../draftStore.ts'
import { nextSystemNumber } from '../../systemFields.ts'

/** The draft-card value cells the conversation page renders against. */
export interface DraftValuesCell {
  /** Edit values keyed by card seq (hydrated over each draft's own fields). */
  readonly draftValues: ReadonlyMap<number, Record<string, string>>
  /** Generated system numbers keyed by draft id (blank system fields). */
  readonly systemValues: ReadonlyMap<string, Record<string, string>>
  /** The edit sink for one card: persists and merges into the seq's row. */
  readonly onEdit: (seq: number) => (name: string, value: string) => void
}

/**
 * The draft-card values cell.
 * @param items - the folded chat items carrying the task cards.
 * @param cardStates - the derived card phases (superseded cards skip the draw).
 * @param sessionId - the owning session (the draftStore scope).
 * @returns the values and the edit sink.
 */
export function useDraftValues(
  items: readonly ChatItem[],
  cardStates: ReadonlyMap<number, DerivedCardState>,
  sessionId: string,
): DraftValuesCell {
  const [draftValues, setDraftValues] = useState<ReadonlyMap<number, Record<string, string>>>(new Map())
  /** Generated system numbers keyed by draft id (the N2 landing guarantee). */
  const [systemValues, setSystemValues] = useState<ReadonlyMap<string, Record<string, string>>>(new Map())

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

  // Draw the predictable number for every live v3 draft's blank system field
  // (po_number & co.): one read per draft, cached by draft id so revisions
  // keep the same number and a fresh draft takes the next.
  useEffect(() => {
    for (const item of items) {
      if (item.kind !== 'task-card' || item.payload === undefined) continue
      if (cardStates.get(item.seq)?.superseded === true) continue
      for (const field of item.payload.fields) {
        if (field.tier !== 'system' || (field.value !== null && field.value.trim() !== '')) continue
        const draftId = item.payload.draftId
        if (systemValues.get(draftId)?.[field.name] !== undefined) continue
        void nextSystemNumber(draftId, item.payload.form.collection, field.name).then((number) => {
          // A field the registry does not generate answers empty and stays blank.
          if (number === '') return
          setSystemValues((current) => {
            const drawn = current.get(draftId) ?? {}
            return new Map(current).set(draftId, { ...drawn, [field.name]: number })
          })
        })
      }
    }
  }, [items, cardStates, systemValues])

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

  return { draftValues, systemValues, onEdit }
}
