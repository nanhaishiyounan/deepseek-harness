/**
 * The session-header connectors button: a compact icon button beside the
 * session title that switches to the connectors view tab and publishes the
 * session's `setView` to the view bridge while mounted.
 * @module @deepseek-ai/dsh-client-ui-connectors/client/ConnectorsHeaderButton
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import { IconLinkOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './entry.module.css'

/** Registration-side business face for the header action. */
export interface ConnectorsHeaderButtonInjected {
  /** Publish the live view switch; returns the revoker. */
  publishViewSwitch: (setView: (view: string) => void) => () => void
}

/** Full component props: the header-action owner share plus the inject face and locale seat. */
export type ConnectorsHeaderButtonProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'connectors'>
  & InjectFace<ConnectorsHeaderButtonInjected>

/**
 * Render the header connectors button.
 * @param props - the header owner share (optional `setView`) and the bridge publisher.
 * @returns the header icon button, or nothing without the owner switch.
 */
export function ConnectorsHeaderButton({ setView, publishViewSwitch, t }: ConnectorsHeaderButtonProps): JSX.Element | null {
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
      onClick={() => { setView('connectors') }}
    >
      <IconLinkOutline16 size={16} />
    </button>
  )
}
