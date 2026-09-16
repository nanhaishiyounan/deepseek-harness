/**
 * The invisible header-actions rider: captures the session header's live
 * `setView` for the view-context service (the KgHeaderButton pattern, minus
 * the button) so `switch_view` has a navigation handle while the header is
 * mounted. Renders nothing.
 * @module @deepseek-ai/dsh-client-ui-view-context/client/ViewSwitchCapture
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Registration-side business face for the capture. */
export interface ViewSwitchCaptureInjected {
  /** Publish the live view switch; returns the revoker. */
  publishViewSwitch: (setView: (view: string) => void) => () => void
}

/** Full component props: the header-action owner share and the inject face. */
export type ViewSwitchCaptureProps =
  PropsRuntime<'conversation.session.header.actions'>
  & InjectFace<ViewSwitchCaptureInjected>

/**
 * Capture the header switch into the view-context service.
 * @param props - the optional owner switch and the service publisher.
 * @returns nothing.
 */
export function ViewSwitchCapture({ setView, publishViewSwitch }: ViewSwitchCaptureProps): JSX.Element | null {
  useEffect(() => {
    if (setView === undefined) return
    return publishViewSwitch(setView)
  }, [setView, publishViewSwitch])
  return null
}
