/**
 * The workbench's client-session state: one cached `kb.stats` snapshot shared
 * by the sidebar entry, the portal dock, and the workbench view (all three
 * registrations close over the one instance created in apply), plus the
 * session-local document records and the cross-entry view-navigation bridge.
 * Nothing here persists: a refresh drops the records back to the stats totals
 * (the document list says so in its header) and the bridge re-arms when the
 * header action mounts again.
 * @module @deepseek-ai/dsh-client-ui-kb/client/kbStore
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** The cached business metrics the usage surfaces show. */
export interface KbUsageSnapshot {
  readonly documents: number
  readonly searches: number
  readonly ingestedDocuments: number
}

/** The shared stats cache: one discriminated state per load. */
export type KbStatsCache =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly usage: KbUsageSnapshot }
  | { readonly status: 'error'; readonly error: string }

/** One session-local document record (an ingest receipt, a lakehouse landing, or a search sighting). */
export interface KbDocumentRecord {
  /** Display name (the hit-card source rule; a table name for lakehouse landings). */
  readonly name: string
  /** Full relative source path (identity; also the hover title). */
  readonly path: string
  /** Passage count when this record came from a kb ingest receipt. */
  readonly chunks?: number
  /** Where the upload landed; absent means the kb document channel. */
  readonly destination?: 'kb' | 'lakehouse'
  /** Row count when this record came from a lakehouse upload receipt. */
  readonly rows?: number
  /** Epoch milliseconds of the first sighting this session. */
  readonly at: number
}

/** The shared client-session snapshot. */
export interface KbClientState {
  /** Stats cache: `undefined` before the first load starts. */
  readonly stats: KbStatsCache | undefined
  /** Session-local document records, newest first. */
  readonly records: readonly KbDocumentRecord[]
}

/** Initial snapshot: nothing loaded, no records. */
const INITIAL: KbClientState = { stats: undefined, records: [] }

/** The shared store handle created once per apply. */
export interface KbClientStore {
  /** Snapshot source the renderer binds for the workbench surfaces. */
  readonly store: SnapshotStore<KbClientState>
  /** Record a stats load start (drives the skeleton chips). */
  beginStats(): void
  /** Record a successful stats load. */
  setStats(usage: KbUsageSnapshot): void
  /** Record a failed stats load. */
  failStats(message: string): void
  /** Record one ingest receipt from either upload destination (refreshes nothing else; apply also reloads stats). */
  noteIngested(record: { name: string; path: string; chunks?: number; destination?: 'kb' | 'lakehouse'; rows?: number }): void
  /** Fold search hits into the records (existing paths only refresh recency). */
  noteSearched(paths: readonly string[], nameOf: (path: string) => string): void
}

/**
 * Create the workbench's shared client-session store.
 * @returns the store handle for apply to close over.
 */
export function createKbClientStore(): KbClientStore {
  const store = createSnapshotStore(INITIAL)
  const patch = (next: Partial<KbClientState>): void => {
    store.set({ ...store.getSnapshot(), ...next })
  }
  const record = (path: string): KbDocumentRecord | undefined =>
    store.getSnapshot().records.find(item => item.path === path)

  return {
    store,
    beginStats(): void {
      patch({ stats: { status: 'loading' } })
    },
    setStats(usage: KbUsageSnapshot): void {
      patch({ stats: { status: 'ready', usage } })
    },
    failStats(message: string): void {
      patch({ stats: { status: 'error', error: message } })
    },
    noteIngested(receipt): void {
      const existing = record(receipt.path)
      const next: KbDocumentRecord = {
        name: receipt.name,
        path: receipt.path,
        ...receipt.chunks === undefined ? {} : { chunks: receipt.chunks },
        ...receipt.destination === undefined ? {} : { destination: receipt.destination },
        ...receipt.rows === undefined ? {} : { rows: receipt.rows },
        at: existing?.at ?? Date.now(),
      }
      patch({ records: [next, ...store.getSnapshot().records.filter(item => item.path !== receipt.path)] })
    },
    noteSearched(paths, nameOf): void {
      const seen = new Set<string>()
      const added: KbDocumentRecord[] = []
      for (const path of paths) {
        if (seen.has(path)) continue
        seen.add(path)
        const existing = record(path)
        if (existing !== undefined) continue
        added.push({ name: nameOf(path), path, at: Date.now() })
      }
      if (added.length === 0) return
      patch({ records: [...added, ...store.getSnapshot().records] })
    },
  }
}

/**
 * The cross-entry view-navigation bridge: the header action entry owns the
 * session's `setView` (handed to it as a best-effort owner prop) and publishes
 * it here while mounted; the sidebar entry and the workbench request view
 * switches through {@link KbViewBridge.request} and simply no-op while no
 * publisher is mounted (the tabs stay manually clickable — the documented
 * degradation).
 */
export interface KbViewBridge {
  /** Publish the live view switch; returns the revoker. */
  provide(setView: (view: string) => void): () => void
  /** Request a view switch; a no-op while no publisher is mounted. */
  request(view: string): void
  /**
   * Mount mirror for the workbench view tab: true while its component is
   * mounted. The blank-session hero portal reads it to step aside while the
   * workbench itself is on screen — the session stays blank (hero-eligible
   * snapshot-wise), so the mount state is the only view signal it has.
   */
  workbench: SnapshotStore<boolean>
}

/**
 * Create the view-navigation bridge for apply to share across entries.
 * @returns the bridge handle.
 */
export function createKbViewBridge(): KbViewBridge {
  let setView: ((view: string) => void) | undefined
  return {
    provide(next): () => void {
      setView = next
      return () => {
        if (setView === next) setView = undefined
      }
    },
    request(view): void {
      setView?.(view)
    },
    workbench: createSnapshotStore(false),
  }
}
