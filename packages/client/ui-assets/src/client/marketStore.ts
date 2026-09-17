/**
 * The market's client-session state: one cached `assets.stats` snapshot, one
 * cached `assets.list` catalog, and one cached `orders.list` order set shared
 * by the sidebar entry and the market view tab (both registrations close over
 * the one instance created in apply). Nothing here persists; a refresh
 * reloads the caches. The view-local state (selected asset, confirm-card
 * flow, previewed order) stays in the component — it is presentation, not
 * session data.
 * @module @deepseek-ai/dsh-client-ui-assets/client/marketStore
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { MarketAssetRow, MarketOrderRow, MarketStatsRow } from './marketTypes.ts'

/** One discriminated load state per cache. */
export type MarketCache<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly error: string }

/** The shared client-session snapshot. */
export interface MarketClientState {
  /** Counters + featured rail; `undefined` before the first load starts. */
  readonly stats: MarketCache<MarketStatsRow> | undefined
  /** The catalog; `undefined` before the first load starts. */
  readonly catalog: MarketCache<readonly MarketAssetRow[]> | undefined
  /** The order rows; `undefined` before the first load starts. */
  readonly orders: MarketCache<readonly MarketOrderRow[]> | undefined
  /** AI-driven asset selection (view_apply select_asset); absent when idle. */
  readonly selectedAssetId?: string | undefined
  /** AI-driven category filter (view_apply filter_category); absent shows all. */
  readonly categoryFilter?: string | undefined
}

/** Initial snapshot: nothing loaded. */
const INITIAL: MarketClientState = {
  stats: undefined,
  catalog: undefined,
  orders: undefined,
  selectedAssetId: undefined,
  categoryFilter: undefined,
}

/** The shared store handle created once per apply. */
export interface MarketClientStore {
  /** Snapshot source the renderer binds as useMarket. */
  readonly store: SnapshotStore<MarketClientState>
  /** Record a stats load start. */
  beginStats(): void
  /** Record a successful stats load. */
  setStats(stats: MarketStatsRow): void
  /** Record a failed stats load. */
  failStats(message: string): void
  /** Record a catalog load start. */
  beginCatalog(): void
  /** Record a successful catalog load. */
  setCatalog(assets: readonly MarketAssetRow[]): void
  /** Record a failed catalog load. */
  failCatalog(message: string): void
  /** Record an orders load start. */
  beginOrders(): void
  /** Record a successful orders load. */
  setOrders(rows: readonly MarketOrderRow[]): void
  /** Record a failed orders load. */
  failOrders(message: string): void
  /** Select one catalog asset by dataset id (view_apply select_asset). */
  selectAsset(id: string | undefined): void
  /** Replace the category filter (view_apply filter_category; undefined clears). */
  setCategoryFilter(category: string | undefined): void
}

/**
 * Create the market's shared client-session store.
 * @returns the store handle for apply to close over.
 */
export function createMarketClientStore(): MarketClientStore {
  const store = createSnapshotStore(INITIAL)
  const patch = (next: Partial<MarketClientState>): void => {
    store.set({ ...store.getSnapshot(), ...next })
  }
  return {
    store,
    beginStats(): void {
      patch({ stats: { status: 'loading' } })
    },
    setStats(stats): void {
      patch({ stats: { status: 'ready', value: stats } })
    },
    failStats(message): void {
      patch({ stats: { status: 'error', error: message } })
    },
    beginCatalog(): void {
      patch({ catalog: { status: 'loading' } })
    },
    setCatalog(assets): void {
      patch({ catalog: { status: 'ready', value: assets } })
    },
    failCatalog(message): void {
      patch({ catalog: { status: 'error', error: message } })
    },
    beginOrders(): void {
      patch({ orders: { status: 'loading' } })
    },
    setOrders(rows): void {
      patch({ orders: { status: 'ready', value: rows } })
    },
    failOrders(message): void {
      patch({ orders: { status: 'error', error: message } })
    },
    selectAsset(id): void {
      patch({ selectedAssetId: id })
    },
    setCategoryFilter(category): void {
      patch({ categoryFilter: category })
    },
  }
}
