/**
 * The new-session welcome screen: the local rendering of the preset's welcome
 * metadata (never a logged message) — the 72px stamp logo, the display-size
 * greeting, the capability ledger, and the starter chips whose pick sends the
 * user's own first message. The chat flow centers it vertically (03 §4.6):
 * an empty session is an invitation to act, not a list row.
 */

import type { JSX } from 'react'
import { Button } from 'antd-mobile'
import type { Welcome } from '../colleagues.ts'
import css from './messages.module.css'

/** Welcome-card props: the welcome metadata and the starter send sink. */
export interface WelcomeCardProps {
  readonly welcome: Welcome
  readonly onSend: (text: string) => void
  readonly disabled: boolean
}

/**
 * The welcome screen the empty chat state renders.
 * @param props - the welcome metadata, the send sink, the busy gate.
 * @returns the welcome screen.
 */
export function WelcomeCard({ welcome, onSend, disabled }: WelcomeCardProps): JSX.Element {
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
            <Button
              key={starter.label}
              type="button"
              color="primary"
              fill="outline"
              className={css.starter}
              style={{ '--border-color': 'rgba(46, 124, 246, 0.35)' }}
              disabled={disabled}
              onClick={() => { onSend(starter.send) }}
            >
              {starter.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
