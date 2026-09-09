/**
 * The sidebar's data-asset entry: a market icon with the product-count badge
 * (wide row shows the label too; the collapsed rail shows the icon alone).
 * The click dispatches on the session state — any session, blank included,
 * asks the view bridge to switch to the market tab, while no session at all
 * just refreshes the portal counters (no view ring exists to switch).
 * @module @deepseek-ai/dsh-client-ui-assets/client/MarketEntry
 */

import { useEffect } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { IconBrowseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MarketClientState } from './marketStore.ts'
import css from './entry.module.css'

/** Registration-side business face for the sidebar entry. */
export interface MarketEntryInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useMarket. */
    market: SnapshotStore<MarketClientState>
  }
  /** Load or reload the shared caches. */
  refresh: () => void
  /** Best-effort switch to the market view tab. */
  requestMarketView: () => void
}

/** Full component props: the footer-action owner share plus the inject face and locale seat. */
export type MarketEntryProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'market'>
  & InjectFace<MarketEntryInjected>

/**
 * Render the sidebar entry.
 * @param props - the sidebar column state, the shared store hook, and the actions.
 * @returns the entry row (icon + label + badge, or the rail icon).
 */
export function MarketEntry({ wide, useSessions, useMarket, refresh, requestMarketView, t }: MarketEntryProps): JSX.Element {
  const state = useMarket(snapshot => snapshot)
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
      : String(stats.value.products)

  return (
    <button
      type="button"
      className={css.entry}
      aria-label={t('entry.productsBadge')}
      onClick={() => {
        if (noSession) refresh()
        else requestMarketView()
      }}
    >
      <IconBrowseOutline16 size={16} />
      {wide && <span className={css.label}>{t('entry.label')}</span>}
      {badge !== undefined && <span className={css.badge}>{badge}</span>}
    </button>
  )
}
