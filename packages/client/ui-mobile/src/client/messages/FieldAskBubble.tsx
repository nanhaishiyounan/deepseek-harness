/**
 * The ask_field interaction bubble: one missing required field with its
 * suggested-value chips (a pick sends the suggestion as the user's own
 * answer) and the answered state.
 */

import type { JSX } from 'react'
import { Info } from 'lucide-react'
import type { ChatFieldAsk } from '../fold.ts'
import { sanitizeBizText } from './rich.ts'
import css from './messages.module.css'

/** Field-ask props: the ask item, the send sink, the busy gate. */
export interface FieldAskBubbleProps {
  readonly ask: ChatFieldAsk
  readonly onSend: (text: string) => void
  readonly disabled: boolean
}

/**
 * The ask_field bubble.
 * @param props - the ask item, the send sink, the busy gate.
 * @returns the interaction bubble.
 */
export function FieldAskBubble({ ask, onSend, disabled }: FieldAskBubbleProps): JSX.Element {
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
              onClick={() => { onSend(suggestion.label) }}
            >
              {sanitizeBizText(suggestion.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
