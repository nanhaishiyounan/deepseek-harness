/**
 * The ask_choice interaction bubble: the question plus its pickable options
 * in the payload's suggested variant (cards / chips / buttons). A pick sends
 * the option's text as the user's own message; the answered state (replay
 * derived) greys the group and marks the picked option with the check seal.
 * The bubble rides the ask-material tier — the washed primary fill with the
 * ink bar on its speaking edge — so a question never reads as another white
 * card in the flow.
 */

import type { JSX } from 'react'
import { Check } from 'lucide-react'
import type { ChatAsk } from '../fold.ts'
import { answerTextOf } from '../protocol.ts'
import { sanitizeBizText } from './rich.ts'
import css from './messages.module.css'

/** Choice-bubble props: the ask item, the send sink, and the busy gate. */
export interface ChoiceBubbleProps {
  readonly ask: ChatAsk
  readonly onSend: (text: string) => void
  readonly onFreeText: () => void
  readonly disabled: boolean
}

/**
 * The ask_choice bubble.
 * @param props - the ask item, the send sink, the free-text focus sink, the busy gate.
 * @returns the interaction bubble.
 */
export function ChoiceBubble({ ask, onSend, onFreeText, disabled }: ChoiceBubbleProps): JSX.Element {
  const { payload, answered } = ask
  const settled = answered !== undefined
  const busy = disabled || settled
  const question = sanitizeBizText(payload.question)
  return (
    <div
      className={`${css.askBubble} ${settled ? css.askAnswered : ''}`}
      data-testid="ask-choice"
      aria-label="选择询问"
    >
      <p className={css.askQuestion}>{question}</p>
      {payload.variant === 'cards' && (
        <div className={css.askCards} role="radiogroup" aria-label={question}>
          {payload.options.map((option) => {
            const picked = answered?.selected === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={picked}
                className={`${css.askCard} ${picked ? css.askSelected : ''}`}
                disabled={busy}
                onClick={() => { onSend(answerTextOf(option)) }}
              >
                <span className={css.askCardRadio} aria-hidden="true">
                  <span className={css.askCardRadioDot} />
                </span>
                <span className={css.askCardMain}>
                  <span className={css.askCardLabel}>{sanitizeBizText(option.label)}</span>
                  {option.hint !== undefined && <span className={css.askCardHint}>{sanitizeBizText(option.hint)}</span>}
                </span>
                {picked && <Check className={css.askCardSeal} size={14} strokeWidth={3} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
      {payload.variant === 'chips' && (
        <div className={css.askChips} role="radiogroup" aria-label={question}>
          {payload.options.map(option => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={answered?.selected === option.value}
              className={`${css.askChip} ${answered?.selected === option.value ? css.askSelected : ''}`}
              disabled={busy}
              onClick={() => { onSend(answerTextOf(option)) }}
            >
              {sanitizeBizText(option.label)}
              {option.hint !== undefined && <span className={css.askChipHint}>{sanitizeBizText(option.hint)}</span>}
            </button>
          ))}
        </div>
      )}
      {payload.variant === 'buttons' && (
        <div className={css.askButtons} role="radiogroup" aria-label={payload.question}>
          {payload.options.map(option => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={answered?.selected === option.value}
              className={`${css.askButton} ${answered?.selected === option.value ? css.askSelected : ''}`}
              disabled={busy}
              onClick={() => { onSend(answerTextOf(option)) }}
            >
              {sanitizeBizText(option.label)}
            </button>
          ))}
        </div>
      )}
      {payload.allowFreeText && !settled && (
        <button type="button" className={css.askFree} onClick={onFreeText}>自己打字说明</button>
      )}
    </div>
  )
}
