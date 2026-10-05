/**
 * The new-session welcome screen: the local rendering of the preset's welcome
 * metadata (never a logged message) — the 72px stamp logo, the display-size
 * greeting, the capability ledger, and the starter chips whose pick fills
 * the composer draft for the user to confirm (W9-B1). The chat flow centers
 * it vertically (03 §4.6): an empty session is an invitation to act, not a
 * list row.
 */

import type { JSX } from 'react'
import type { Welcome } from '../colleagues.ts'
import css from './messages.module.css'

/** Welcome-card props: the welcome metadata and the starter fill sink. */
export interface WelcomeCardProps {
  readonly welcome: Welcome
  /** The assist-input sink: a starter pick fills the composer draft (W9-B1). */
  readonly onFill: (text: string) => void
  readonly disabled: boolean
}

/**
 * The welcome screen the empty chat state renders.
 * @param props - the welcome metadata, the fill sink, the busy gate.
 * @returns the welcome screen.
 */
export function WelcomeCard({ welcome, onFill, disabled }: WelcomeCardProps): JSX.Element {
  return (
    <section className={css.welcomeCard} data-testid="welcome-card" aria-label="会话欢迎屏">
      <span className={css.welcomeLogo} aria-hidden="true">
        <span className={css.welcomeLogoRing} />
        <span className={css.welcomeLogoGlyph}>表</span>
      </span>
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
              className={`dshm-seal-chip ${css.starter}`}
              disabled={disabled}
              onClick={() => { onFill(starter.send) }}
            >
              {starter.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
