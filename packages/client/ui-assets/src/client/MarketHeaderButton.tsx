/**
 * The session-header market button: a compact icon button beside the session
 * title that switches to the market view tab and publishes the session's
 * `setView` to the view bridge while mounted (the sidebar entry and the
 * market view switch through it).
 * @module @deepseek-ai/dsh-client-ui-assets/client/MarketHeaderButton
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import { IconBrowseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './entry.module.css'

/** Registration-side business face for the header action. */
export interface MarketHeaderButtonInjected {
  /** Publish the live view switch; returns the revoker. */
  publishViewSwitch: (setView: (view: string) => void) => () => void
}

/** Full component props: the header-action owner share plus the inject face and locale seat. */
export type MarketHeaderButtonProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'market'>
  & InjectFace<MarketHeaderButtonInjected>

/**
 * Render the header market button.
 * @param props - the header owner share (optional `setView`) and the bridge publisher.
 * @returns the header icon button, or nothing without the owner switch.
 */
export function MarketHeaderButton({ setView, publishViewSwitch, t }: MarketHeaderButtonProps): JSX.Element | null {
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
      onClick={() => { setView('market') }}
    >
      <IconBrowseOutline16 size={16} />
    </button>
  )
}
