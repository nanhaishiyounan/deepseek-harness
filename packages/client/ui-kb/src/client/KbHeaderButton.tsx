/**
 * The session-header knowledge-base button: a document icon with the
 * document-count badge, switching to the workbench view tab through the
 * owner-prop view switch. While mounted it publishes that switch to the
 * package's view bridge, which is what lets the sidebar entry and the
 * workbench's carry-to-chat action reach the tab too.
 * @module @deepseek-ai/dsh-client-ui-kb/client/KbHeaderButton
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { IconBrowseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the header-action seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { KbClientState } from './kbStore.ts'
import css from './entry.module.css'

/** Registration-side business face for the header button. */
export interface KbHeaderButtonInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useKb. */
    kb: SnapshotStore<KbClientState>
  }
  /** Publish or withdraw this mount's view switch (the bridge). */
  publishViewSwitch: (setView: (view: string) => void) => () => void
}

/** Full component props: the header-action owner share plus the inject face and locale seat. */
export type KbHeaderButtonProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'kb'>
  & InjectFace<KbHeaderButtonInjected>

/**
 * Render the header button.
 * @param props - the optional owner view switch plus the shared store hook.
 * @returns the icon button (still rendered, switchless, without the owner prop).
 */
export function KbHeaderButton({ setView, useKb, publishViewSwitch, t }: KbHeaderButtonProps): JSX.Element {
  const state = useKb(snapshot => snapshot)

  // The owner prop is best-effort: publish it while it exists so the sidebar
  // entry and the workbench can route through this mount.
  useEffect(() => (setView === undefined ? undefined : publishViewSwitch(setView)), [setView, publishViewSwitch])

  const stats = state.stats
  const badge = stats === undefined || stats.status === 'loading'
    ? undefined
    : stats.status === 'error'
      ? '?'
      : String(stats.usage.documents)

  return (
    <button
      type="button"
      className={css.headerButton}
      aria-label={t('entry.label')}
      title={t('entry.label')}
      onClick={() => { setView?.('kb') }}
    >
      <IconBrowseOutline16 size={14} />
      {badge !== undefined && <span className={css.badge}>{badge}</span>}
    </button>
  )
}
