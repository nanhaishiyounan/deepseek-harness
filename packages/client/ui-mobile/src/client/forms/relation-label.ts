/**
 * The shared relation-label read: resolves one relation field's numeric id to
 * its target-row label for the task cards' title/diff and the draft card's
 * edit widget. A failed read retries once after a short delay, then degrades
 * to the raw id — the AI-prefilled name is never shown as if verified, and a
 * missed read clears the label so a stale value never survives a change.
 */

import { useEffect, useState } from 'react'
import { relationLabelColumn } from '../fieldControls.ts'
import { rpc } from '../rpc.ts'

/** The delay before the second label read (ms). */
const RETRY_DELAY_MS = 300

/** Render one opaque row cell as text (numbers pass through, objects show empty). */
function cellLabel(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

/**
 * Resolve one relation field value to its target-row label over the shared
 * target-table read (`relationLabelColumn` picks the label column). A failed
 * read retries once after `RETRY_DELAY_MS`; a second failure degrades the
 * label to the raw id. A missed read (empty page or empty label cell) clears
 * the label instead of keeping the previous value.
 * @param spec - the field's control spec; undefined, non-relation, and target-less specs never read.
 * @param value - the field's current value; undefined, empty, and non-numeric values never read.
 * @returns the resolved label, the degraded raw id, or undefined while unresolved.
 */
export function useRelationLabel(
  spec: { readonly kind: string; readonly target: string | undefined } | undefined,
  value: string | undefined,
): string | undefined {
  const [label, setLabel] = useState<string | undefined>(undefined)
  const kind = spec?.kind
  const target = spec?.target
  useEffect(() => {
    let alive = true
    // The empty string is the "no value" state — Number('') is 0, not a miss.
    if (kind !== 'relation' || target === undefined || value === undefined || value === '') return
    const column = relationLabelColumn(target)
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return
    const readLabel = (): Promise<void> => rpc('nocobase.list', {
      collection: target,
      filter: [{ field: 'id', op: 'eq', value: numeric }],
      page: 1,
      page_size: 1,
    }).then((page) => {
      if (!alive) return
      const row = page.rows[0]
      setLabel(row === undefined ? undefined : cellLabel(row[column]))
    })
    void readLabel().catch(async () => {
      await new Promise((resolve) => { setTimeout(resolve, RETRY_DELAY_MS) })
      if (!alive) return
      await readLabel().catch(() => {
        // Both reads failed: degrade to the raw id, never the AI-prefilled name.
        if (alive) setLabel(String(numeric))
      })
    })
    return () => { alive = false }
  }, [kind, target, value])
  return label
}
