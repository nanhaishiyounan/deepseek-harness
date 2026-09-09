/**
 * The sidebar's first-class knowledge-base entry: a document icon with the
 * document-count badge (wide row shows the label too; the collapsed rail shows
 * the icon alone). The click dispatches on the session state — any session,
 * blank included, asks the view bridge to switch to the workbench tab (a
 * blank session keeps its view ring, so the jump lands before the first
 * message; a no-op while no bridge publisher is mounted, the tabs stay
 * manually clickable), while no session at all just refreshes the portal's
 * stats.
 * @module @deepseek-ai/dsh-client-ui-kb/client/KbEntry
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { IconBrowseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { KbClientState } from './kbStore.ts'
import css from './entry.module.css'

/** Registration-side business face for the sidebar entry. */
export interface KbEntryInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useKb. */
    kb: SnapshotStore<KbClientState>
  }
  /** Load or reload the shared stats cache. */
  refresh: () => void
  /** Best-effort switch to the workbench view tab. */
  requestKbView: () => void
}

/** Full component props: the footer-action owner share plus the inject face and locale seat. */
export type KbEntryProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'kb'>
  & InjectFace<KbEntryInjected>

/**
 * Render the sidebar entry.
 * @param props - the sidebar column state, the shared store hook, and the actions.
 * @returns the entry row (icon + label + badge, or the rail icon).
 */
export function KbEntry({ wide, useSessions, useKb, refresh, requestKbView, t }: KbEntryProps): JSX.Element {
  const state = useKb(snapshot => snapshot)
  // No session at all leaves the portal as the only surface (no view ring
  // exists to switch); every session — blank or active — owns its ring.
  const noSession = useSessions(snapshot => snapshot.current === undefined)

  useEffect(() => {
    if (state.stats === undefined) refresh()
  }, [state.stats, refresh])

  const stats = state.stats
  const badge = stats === undefined || stats.status === 'loading'
    ? undefined
    : stats.status === 'error'
      ? '?'
      : String(stats.usage.documents)

  return (
    <button
      type="button"
      className={css.entry}
      aria-label={t('entry.label')}
      onClick={() => {
        if (noSession) refresh()
        else requestKbView()
      }}
    >
      <IconBrowseOutline16 size={16} />
      {wide && <span className={css.label}>{t('entry.label')}</span>}
      {badge !== undefined && <span className={css.badge}>{badge}</span>}
    </button>
  )
}
