/**
 * The session-header business button: a compact icon button beside the
 * session title that switches to the business view tab and publishes the
 * session's `setView` to the view bridge while mounted.
 * @module @deepseek-ai/dsh-client-ui-business/client/BizHeaderButton
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './entry.module.css'

/** Registration-side business face for the header action. */
export interface BizHeaderButtonInjected {
  /** Publish the live view switch; returns the revoker. */
  publishViewSwitch: (setView: (view: string) => void) => () => void
}

/** Full component props: the header-action owner share plus the inject face and locale seat. */
export type BizHeaderButtonProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'business'>
  & InjectFace<BizHeaderButtonInjected>

/**
 * Render the header business button.
 * @param props - the header owner share (optional `setView`) and the bridge publisher.
 * @returns the header icon button, or nothing without the owner switch.
 */
export function BizHeaderButton({ setView, publishViewSwitch, t }: BizHeaderButtonProps): JSX.Element | null {
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
      onClick={() => { setView('business') }}
    >
      <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <line x1="5" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.2" />
        <line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </button>
  )
}
