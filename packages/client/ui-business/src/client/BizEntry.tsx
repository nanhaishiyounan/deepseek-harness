/**
 * The main nav's business menu row: a ledger glyph with the table-count
 * badge (wide row shows the label too; the collapsed rail shows the icon
 * alone). The click rides the seat's shared activation channel; the active
 * mark follows the resolved navigation screen.
 * @module @deepseek-ai/dsh-client-ui-business/client/BizEntry
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import clsx from 'clsx'
import type { BizClientState } from './bizStore.ts'
import css from './entry.module.css'

/** The conversation view id this row activates. */
const BUSINESS_VIEW = 'business'

/** Registration-side business face for the nav menu row. */
export interface BizEntryInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useBusiness. */
    business: SnapshotStore<BizClientState>
  }
  /** Load or reload the table roster. */
  refresh: () => void
}

/** Full component props: the sidebar.nav owner share plus the inject face and locale seat. */
export type BizEntryProps =
  PropsRuntime<'sidebar.nav'>
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
 * Render the nav menu row.
 * @param props - the nav column state, the shared store hook, and the seat's activation machinery.
 * @returns the menu row (icon + label + badge, or the rail icon).
 */
export function BizEntry({ wide, useNavState, activate, useBusiness, refresh, t }: BizEntryProps): JSX.Element {
  const state = useBusiness(snapshot => snapshot)
  const active = useNavState(nav => nav.screen?.view === BUSINESS_VIEW)

  useEffect(() => {
    if (state.collections === undefined) refresh()
  }, [state.collections, refresh])

  const collections = state.collections
  const badge = collections === undefined || collections.status === 'loading'
    ? undefined
    : collections.status === 'error'
      ? '?'
      : String(collections.value.length)

  return (
    <Tooltip label={t('view.business')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.entry, !wide && css.rail)}
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={t('view.business')}
        onClick={() => { activate(BUSINESS_VIEW) }}
      >
        <LedgerGlyph />
        {wide && <span className={css.label}>{t('entry.label')}</span>}
        {badge !== undefined && <span className={css.badge}>{badge}</span>}
      </button>
    </Tooltip>
  )
}
