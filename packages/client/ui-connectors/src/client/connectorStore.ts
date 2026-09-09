/**
 * The connector page's client-session state: one cached provider catalog,
 * one cached delivery aggregate, and one cached timeline shared by the
 * sidebar entry and the view tab (both registrations close over the one
 * instance created in apply). Nothing here persists.
 * @module @deepseek-ai/dsh-client-ui-connectors/client/connectorStore
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectorConnectionRow, ConnectorProviderRow, ConnectorTransferRow } from './connectorTypes.ts'

/** One discriminated load state per cache. */
export type ConnectorCache<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly error: string }

/** The shared client-session snapshot. */
export interface ConnectorClientState {
  /** Provider catalog; `undefined` before the first load starts. */
  readonly providers: ConnectorCache<readonly ConnectorProviderRow[]> | undefined
  /** Per-provider delivery aggregates; `undefined` before the first load starts. */
  readonly connections: ConnectorCache<readonly ConnectorConnectionRow[]> | undefined
  /** Delivery timeline; `undefined` before the first load starts. */
  readonly timeline: ConnectorCache<readonly ConnectorTransferRow[]> | undefined
}

/** Initial snapshot: nothing loaded. */
const INITIAL: ConnectorClientState = { providers: undefined, connections: undefined, timeline: undefined }

/** The shared store handle created once per apply. */
export interface ConnectorClientStore {
  /** Snapshot source the renderer binds as useConnectors. */
  readonly store: SnapshotStore<ConnectorClientState>
  /** Record a providers load start. */
  beginProviders(): void
  /** Record a successful providers load. */
  setProviders(providers: readonly ConnectorProviderRow[]): void
  /** Record a failed providers load. */
  failProviders(message: string): void
  /** Record delivery loads' start. */
  beginDelivery(): void
  /** Record successful delivery loads. */
  setDelivery(connections: readonly ConnectorConnectionRow[], timeline: readonly ConnectorTransferRow[]): void
  /** Record a failed delivery load. */
  failDelivery(message: string): void
}

/**
 * Create the connector page's shared client-session store.
 * @returns the store handle for apply to close over.
 */
export function createConnectorClientStore(): ConnectorClientStore {
  const store = createSnapshotStore(INITIAL)
  const patch = (next: Partial<ConnectorClientState>): void => {
    store.set({ ...store.getSnapshot(), ...next })
  }
  return {
    store,
    beginProviders(): void {
      patch({ providers: { status: 'loading' } })
    },
    setProviders(providers): void {
      patch({ providers: { status: 'ready', value: providers } })
    },
    failProviders(message): void {
      patch({ providers: { status: 'error', error: message } })
    },
    beginDelivery(): void {
      patch({ connections: { status: 'loading' }, timeline: { status: 'loading' } })
    },
    setDelivery(connections, timeline): void {
      patch({ connections: { status: 'ready', value: connections }, timeline: { status: 'ready', value: timeline } })
    },
    failDelivery(message): void {
      patch({ connections: { status: 'error', error: message }, timeline: { status: 'error', error: message } })
    },
  }
}
