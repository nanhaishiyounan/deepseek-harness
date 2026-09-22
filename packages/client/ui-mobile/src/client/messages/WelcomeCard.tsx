/**
 * The new-session welcome card: the local rendering of the preset's welcome
 * metadata (never a logged message) — greeting, capability lines, and the
 * starter chips whose pick sends the user's own first message. Styling is
 * minimal v3 scaffolding; the visual batch owns the final look.
 */

import type { JSX } from 'react'
import type { Welcome } from '../colleagues.ts'
import css from './messages.module.css'

/** Welcome-card props: the welcome metadata and the starter send sink. */
export interface WelcomeCardProps {
  readonly welcome: Welcome
  readonly onSend: (text: string) => void
  readonly disabled: boolean
}

/**
 * The welcome card the empty chat state renders.
 * @param props - the welcome metadata, the send sink, the busy gate.
 * @returns the welcome card.
 */
export function WelcomeCard({ welcome, onSend, disabled }: WelcomeCardProps): JSX.Element {
  return (
    <section className={css.welcomeCard} data-testid="welcome-card" aria-label="会话欢迎卡">
      <h2 className={css.welcomeTitle}>{welcome.greeting}</h2>
      <ul className={css.welcomeList}>
        {welcome.capabilities.map(line => <li key={line} className={css.welcomeLine}>{line}</li>)}
      </ul>
      {welcome.starters.length > 0 && (
        <div className={css.welcomeStarters}>
          {welcome.starters.map(starter => (
            <button
              key={starter.label}
              type="button"
              className={css.starter}
              disabled={disabled}
              onClick={() => { onSend(starter.send) }}
            >
              {starter.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
