/**
 * The composer chips for the conversation phase (the 02 §4.4 matrix): none on
 * the welcome state (starters live in the welcome card) or an open ask; the
 * draft/rejected phases carry the re-phrase shortcuts; a landed receipt
 * carries the next-register shortcuts. Split from ChatView (W8-B2); the
 * decision table is unchanged.
 */

import type { CardPhase, DerivedCardState } from '../../cardState.ts'
import type { ChatItem } from '../../fold.ts'

/**
 * Derive the composer chips for the conversation phase.
 * @param items - the folded chat items in seq order.
 * @param cardStates - the derived card phases.
 * @returns the chip texts (empty renders no chip row).
 */
export function contextChipsOf(
  items: readonly ChatItem[],
  cardStates: ReadonlyMap<number, DerivedCardState>,
): string[] {
  if (items.length === 0) return []
  for (const item of [...items].reverse()) {
    if (item.kind === 'ask' || item.kind === 'field-ask') {
      if (item.answered === undefined) return []
      break
    }
    if (item.kind === 'text' || item.kind === 'task-card' || item.kind === 'receipt' || item.kind === 'degraded') break
  }
  let latestPhase: CardPhase | undefined
  let landed = false
  for (const item of items) {
    if (item.kind === 'task-card') {
      const state = cardStates.get(item.seq)
      if (state === undefined || state.superseded === true) continue
      latestPhase = state.phase
    }
    if (item.kind === 'receipt') landed = true
  }
  if (latestPhase === 'submitted' || (latestPhase === undefined && landed)) return ['再来一单', '查这条记录']
  if (latestPhase !== undefined) return ['再补一句说明', '换一种单据']
  return []
}
