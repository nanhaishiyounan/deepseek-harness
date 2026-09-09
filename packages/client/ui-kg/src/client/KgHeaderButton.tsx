/**
 * The session-header graph button: a compact icon button beside the session
 * title that switches to the kg view tab and publishes the session's
 * `setView` to the view bridge while mounted.
 * @module @deepseek-ai/dsh-client-ui-kg/client/KgHeaderButton
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './entry.module.css'

/** Registration-side business face for the header action. */
export interface KgHeaderButtonInjected {
  /** Publish the live view switch; returns the revoker. */
  publishViewSwitch: (setView: (view: string) => void) => () => void
}

/** Full component props: the header-action owner share plus the inject face and locale seat. */
export type KgHeaderButtonProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'kg'>
  & InjectFace<KgHeaderButtonInjected>

/**
 * Render the header graph button.
 * @param props - the header owner share (optional `setView`) and the bridge publisher.
 * @returns the header icon button, or nothing without the owner switch.
 */
export function KgHeaderButton({ setView, publishViewSwitch, t }: KgHeaderButtonProps): JSX.Element | null {
  useEffect(() => {
    if (setView === undefined) return
    return publishViewSwitch(setView)
  }, [setView, publishViewSwitch])

  if (setView === undefined) return null
  return (
    <button
      type="button"
      className={css.headerButton}
      aria-label={t('entry.label')}
      onClick={() => { setView('kg') }}
    >
      <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
        <circle cx="4" cy="4" r="2" fill="currentColor" />
        <circle cx="12" cy="6" r="2" fill="currentColor" />
        <circle cx="7" cy="12" r="2" fill="currentColor" />
        <line x1="5.5" y1="5" x2="10.5" y2="5.8" stroke="currentColor" strokeWidth="1" />
        <line x1="11" y1="7.8" x2="8.4" y2="10.6" stroke="currentColor" strokeWidth="1" />
      </svg>
    </button>
  )
}
