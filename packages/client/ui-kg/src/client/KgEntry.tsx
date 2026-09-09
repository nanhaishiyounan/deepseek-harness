/**
 * The sidebar's graph-page entry: a graph icon with the entity-count badge
 * (wide row shows the label too; the collapsed rail shows the icon alone).
 * The click dispatches on the session state — any session, blank included,
 * asks the view bridge to switch to the kg tab, while no session at all
 * just refreshes the caches.
 * @module @deepseek-ai/dsh-client-ui-kg/client/KgEntry
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { KgClientState } from './kgStore.ts'
import css from './entry.module.css'

/** Registration-side business face for the sidebar entry. */
export interface KgEntryInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useKg. */
    kg: SnapshotStore<KgClientState>
  }
  /** Load or reload the legend + counters. */
  refresh: () => void
  /** Best-effort switch to the kg view tab. */
  requestKgView: () => void
}

/** Full component props: the footer-action owner share plus the inject face and locale seat. */
export type KgEntryProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'kg'>
  & InjectFace<KgEntryInjected>

/** A tiny graph glyph (three connected dots) drawn inline — the icon seat stays dependency-free. */
function GraphGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" className={css.glyph}>
      <circle cx="4" cy="4" r="2" fill="currentColor" />
      <circle cx="12" cy="6" r="2" fill="currentColor" />
      <circle cx="7" cy="12" r="2" fill="currentColor" />
      <line x1="5.5" y1="5" x2="10.5" y2="5.8" stroke="currentColor" strokeWidth="1" />
      <line x1="11" y1="7.8" x2="8.4" y2="10.6" stroke="currentColor" strokeWidth="1" />
      <line x1="5.4" y1="5.8" x2="6.4" y2="10.2" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/**
 * Render the sidebar entry.
 * @param props - the sidebar column state, the shared store hook, and the actions.
 * @returns the entry row (icon + label + badge, or the rail icon).
 */
export function KgEntry(
  { wide, useSessions, useKg, refresh, requestKgView, t }: KgEntryProps,
): JSX.Element {
  const state = useKg(snapshot => snapshot)
  // No session at all leaves the page unreachable through a view ring; every
  // session — blank or active — owns its ring.
  const noSession = useSessions(snapshot => snapshot.current === undefined)

  useEffect(() => {
    if (state.legend === undefined) refresh()
  }, [state.legend, refresh])

  const legend = state.legend
  // The badge counts registry types: it stays meaningful even before the
  // first walk, and mirrors the legend the entry opens.
  const badge = legend === undefined || legend.status === 'loading'
    ? undefined
    : legend.status === 'error'
      ? '?'
      : String(legend.value.types.length)

  return (
    <button
      type="button"
      className={css.entry}
      aria-label={t('entry.entitiesBadge')}
      onClick={() => {
        if (noSession) refresh()
        else requestKgView()
      }}
    >
      <GraphGlyph />
      {wide && <span className={css.label}>{t('entry.label')}</span>}
      {badge !== undefined && <span className={css.badge}>{badge}</span>}
    </button>
  )
}
