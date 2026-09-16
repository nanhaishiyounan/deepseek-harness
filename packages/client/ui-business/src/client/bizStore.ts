/**
 * The business page's client-session state: the cached collection roster
 * (`nocobase.listMeta`), the selected collection, and its cached first row
 * page (`nocobase.list`). Conversation-first by design: edits and creates
 * never touch this store — they hand off to the conversation and the nb_*
 * tools land the change; the page's retry re-reads.
 * @module @deepseek-ai/dsh-client-ui-business/client/bizStore
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { BizCollectionRow, BizRowPageView } from './bizTypes.ts'

/** One discriminated load state per cache. */
export type BizCache<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly error: string }

/** The shared client-session snapshot. */
export interface BizClientState {
  /** Collection roster (hidden ones filtered at the projection); `undefined` before the first load starts. */
  readonly collections: BizCache<readonly BizCollectionRow[]> | undefined
  /** The selected collection name; `undefined` shows the roster guidance. */
  readonly selected: string | undefined
  /** The selected collection's first row page; `undefined` before the first load starts. */
  readonly rows: BizCache<BizRowPageView> | undefined
  /** AI-driven row filter (view_apply set_table_filter); absent shows all rows. */
  readonly tableFilter?: string | undefined
}

/** Initial snapshot: nothing loaded, nothing selected. */
const INITIAL: BizClientState = { collections: undefined, selected: undefined, rows: undefined, tableFilter: undefined }

/** The shared store handle created once per apply. */
export interface BizClientStore {
  /** Snapshot source the renderer binds as useBusiness. */
  readonly store: SnapshotStore<BizClientState>
  /** Record a roster load start. */
  beginCollections(): void
  /** Record a successful roster load. */
  setCollections(collections: readonly BizCollectionRow[]): void
  /** Record a failed roster load. */
  failCollections(message: string): void
  /** Select one collection (clears the row cache; `undefined` deselects). */
  select(collection: string | undefined): void
  /** Record a row-page load start. */
  beginRows(): void
  /** Record a successful row-page load. */
  setRows(page: BizRowPageView): void
  /** Record a failed row-page load. */
  failRows(message: string): void
  /** Replace the row filter (view_apply set_table_filter; undefined clears). */
  setTableFilter(filter: string | undefined): void
}

/**
 * Create the business page's shared client-session store.
 * @returns the store handle for apply to close over.
 */
export function createBizClientStore(): BizClientStore {
  const store = createSnapshotStore(INITIAL)
  const patch = (next: Partial<BizClientState>): void => {
    store.set({ ...store.getSnapshot(), ...next })
  }
  return {
    store,
    beginCollections(): void {
      patch({ collections: { status: 'loading' } })
    },
    setCollections(collections): void {
      patch({ collections: { status: 'ready', value: collections } })
    },
    failCollections(message): void {
      patch({ collections: { status: 'error', error: message } })
    },
    select(collection): void {
      patch({ selected: collection, rows: undefined })
    },
    beginRows(): void {
      patch({ rows: { status: 'loading' } })
    },
    setRows(page): void {
      patch({ rows: { status: 'ready', value: page } })
    },
    failRows(message): void {
      patch({ rows: { status: 'error', error: message } })
    },
    setTableFilter(filter): void {
      patch({ tableFilter: filter })
    },
  }
}
