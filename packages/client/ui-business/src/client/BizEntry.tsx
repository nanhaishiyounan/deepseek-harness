/**
 * The sidebar's business-page entry: a ledger glyph with the collection-count
 * badge (wide row shows the label too; the collapsed rail shows the icon
 * alone). The click dispatches on the session state — any session, blank
 * included, asks the view bridge to switch to the business tab, while no
 * session at all just refreshes the caches.
 * @module @deepseek-ai/dsh-client-ui-business/client/BizEntry
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { BizClientState } from './bizStore.ts'
import css from './entry.module.css'

/** Registration-side business face for the sidebar entry. */
export interface BizEntryInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useBusiness. */
    business: SnapshotStore<BizClientState>
  }
  /** Load or reload the collection roster. */
  refresh: () => void
  /** Best-effort switch to the business view tab. */
  requestBusinessView: () => void
}

/** Full component props: the footer-action owner share plus the inject face and locale seat. */
export type BizEntryProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'business'>
  & InjectFace<BizEntryInjected>

/** A tiny ledger glyph drawn inline — the icon seat stays dependency-free. */
function LedgerGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" className={css.glyph}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <line x1="5" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/**
 * Render the sidebar entry.
 * @param props - the sidebar column state, the shared store hook, and the actions.
 * @returns the entry row (icon + label + badge, or the rail icon).
 */
export function BizEntry(
  { wide, useSessions, useBusiness, refresh, requestBusinessView, t }: BizEntryProps,
): JSX.Element {
  const state = useBusiness(snapshot => snapshot)
  // No session at all leaves the page unreachable through a view ring; every
  // session — blank or active — owns its ring.
  const noSession = useSessions(snapshot => snapshot.current === undefined)

  useEffect(() => {
    if (state.collections === undefined) refresh()
  }, [state.collections, refresh])

  const collections = state.collections
  const badge = collections === undefined || collections.status === 'loading'
    ? undefined
    : collections.status === 'error'
      ? '?'
      : String(collections.value.filter(entry => entry.hidden !== true).length)

  return (
    <button
      type="button"
      className={css.entry}
      aria-label={t('entry.collectionsBadge')}
      onClick={() => {
        if (noSession) refresh()
        else requestBusinessView()
      }}
    >
      <LedgerGlyph />
      {wide && <span className={css.label}>{t('entry.label')}</span>}
      {badge !== undefined && <span className={css.badge}>{badge}</span>}
    </button>
  )
}
