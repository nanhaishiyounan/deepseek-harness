/**
 * The market's client-session state: one cached `assets.stats` snapshot and
 * one cached `assets.list` catalog shared by the sidebar entry and the market
 * view tab (both registrations close over the one instance created in apply).
 * Nothing here persists; a refresh reloads both caches. The view-local state
 * (selected asset, confirm-card flow) stays in the component — it is
 * presentation, not session data.
 * @module @deepseek-ai/dsh-client-ui-assets/client/marketStore
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { MarketAssetRow, MarketStatsRow } from './marketTypes.ts'

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
}

/** Initial snapshot: nothing loaded. */
const INITIAL: MarketClientState = { stats: undefined, catalog: undefined }

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
  }
}
