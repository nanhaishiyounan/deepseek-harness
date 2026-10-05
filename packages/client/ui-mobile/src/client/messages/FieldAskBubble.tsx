/**
 * The ask_field interaction bubble: one missing required field with its
 * suggested-value chips (a pick fills the composer draft for the user to
 * edit and send, W9-B1) and the answered state.
 */

import type { JSX } from 'react'
import { Info } from 'lucide-react'
import type { ChatFieldAsk } from '../fold.ts'
import { sanitizeBizText } from './rich.ts'
import css from './messages.module.css'

/** Field-ask props: the ask item, the draft-fill sink, the busy gate. */
export interface FieldAskBubbleProps {
  readonly ask: ChatFieldAsk
  /** The assist-input sink: a suggestion pick fills the composer draft (W9-B1). */
  readonly onFill: (text: string) => void
  readonly disabled: boolean
}

/**
 * The ask_field bubble.
 * @param props - the ask item, the fill sink, the busy gate.
 * @returns the interaction bubble.
 */
export function FieldAskBubble({ ask, onFill, disabled }: FieldAskBubbleProps): JSX.Element {
  const { payload, answered } = ask
  const settled = answered !== undefined
  const busy = disabled || settled
  return (
    <div
      className={`${css.askBubble} ${settled ? css.askAnswered : ''}`}
      data-testid="field-ask"
      aria-label="字段补问"
    >
      <p className={css.askQuestion}>
        <Info className={css.askMark} size={15} strokeWidth={1.8} aria-hidden="true" />
        {sanitizeBizText(payload.question)}
      </p>
      <p className={css.fieldAskLabel}>
        {sanitizeBizText(payload.field.label)}
        {payload.field.unit !== undefined ? `（${payload.field.unit}）` : ''}
      </p>
      {payload.field.suggestions.length > 0 && (
        <div className={css.askChips}>
          {payload.field.suggestions.map(suggestion => (
            <button
              key={suggestion.value}
              type="button"
              className={`${css.askChip} ${answered?.selected === suggestion.value ? css.askSelected : ''}`}
              disabled={busy}
              onClick={() => { onFill(suggestion.label) }}
            >
              {sanitizeBizText(suggestion.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
