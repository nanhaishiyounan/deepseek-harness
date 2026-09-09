/**
 * The graph page's client-session state: the cached ontology legend
 * (`kg.schema`), the canvas graph (one `kg.subgraph` walk or `kg.expand`
 * patch at a time), the seed-search hits, and the counters. Shared by the
 * sidebar entry, the view tab, and the tool-row handoff; nothing persists.
 * @module @deepseek-ai/dsh-client-ui-kg/client/kgStore
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { KgCanvasGraph, KgNodeHitRow, KgNodeTypeRow, KgRelationRow } from './kgTypes.ts'

/** One discriminated load state per cache. */
export type KgCache<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly error: string }

/** The shared client-session snapshot. */
export interface KgClientState {
  /** Ontology legend (registry projection); `undefined` before the first load starts. */
  readonly legend: KgCache<{ readonly types: readonly KgNodeTypeRow[]; readonly relations: readonly KgRelationRow[] }> | undefined
  /** The canvas graph; `undefined` before the first walk. */
  readonly canvas: KgCache<KgCanvasGraph & { readonly seeds: readonly string[] }> | undefined
  /** The latest seed search; `undefined` until the user searches. */
  readonly search: KgCache<readonly KgNodeHitRow[]> | undefined
  /** The selected node id (details panel); absent when nothing is selected. */
  readonly selected: string | undefined
  /** Type-filter whitelist; `undefined` renders every type. */
  readonly typeFilter: ReadonlySet<string> | undefined
}

/** Initial snapshot: nothing loaded, nothing selected. */
const INITIAL: KgClientState = { legend: undefined, canvas: undefined, search: undefined, selected: undefined, typeFilter: undefined }

/** The shared store handle created once per apply. */
export interface KgClientStore {
  /** Snapshot source the renderer binds as useKg. */
  readonly store: SnapshotStore<KgClientState>
  /** Record a legend load start. */
  beginLegend(): void
  /** Record a successful legend load. */
  setLegend(types: readonly KgNodeTypeRow[], relations: readonly KgRelationRow[]): void
  /** Record a failed legend load. */
  failLegend(message: string): void
  /** Record a canvas walk start. */
  beginCanvas(): void
  /** Record a successful subgraph walk (replaces the canvas). */
  setCanvas(graph: KgCanvasGraph, seeds: readonly string[]): void
  /** Merge one expand patch into the canvas (existing nodes keep their identity). */
  mergeCanvas(graph: KgCanvasGraph): void
  /** Record a failed walk. */
  failCanvas(message: string): void
  /** Record a seed-search load start. */
  beginSearch(): void
  /** Record seed-search hits. */
  setSearch(hits: readonly KgNodeHitRow[]): void
  /** Record a failed seed search. */
  failSearch(message: string): void
  /** Select one node (details panel) or clear the selection. */
  select(nodeId: string | undefined): void
  /** Replace the type-filter whitelist (`undefined` clears the filter). */
  setTypeFilter(types: ReadonlySet<string> | undefined): void
}

/**
 * Create the graph page's shared client-session store.
 * @returns the store handle for apply to close over.
 */
export function createKgClientStore(): KgClientStore {
  const store = createSnapshotStore(INITIAL)
  const patch = (next: Partial<KgClientState>): void => {
    store.set({ ...store.getSnapshot(), ...next })
  }
  return {
    store,
    beginLegend(): void {
      patch({ legend: { status: 'loading' } })
    },
    setLegend(types, relations): void {
      patch({ legend: { status: 'ready', value: { types, relations } } })
    },
    failLegend(message): void {
      patch({ legend: { status: 'error', error: message } })
    },
    beginCanvas(): void {
      patch({ canvas: { status: 'loading' } })
    },
    setCanvas(graph, seeds): void {
      patch({ canvas: { status: 'ready', value: { ...graph, seeds } } })
    },
    mergeCanvas(graph): void {
      const current = store.getSnapshot().canvas
      // An expand on a canvas that failed (or never loaded) resets to the
      // patch alone — the double-click only fires on a rendered canvas, so
      // this arm covers a racing failure.
      if (current === undefined || current.status !== 'ready') {
        patch({ canvas: { status: 'ready', value: { ...graph, seeds: [] } } })
        return
      }
      const byId = new Map(current.value.nodes.map(node => [node.id, node]))
      for (const node of graph.nodes) byId.set(node.id, node)
      const edgeById = new Map(current.value.edges.map(edge => [edge.id, edge]))
      for (const edge of graph.edges) edgeById.set(edge.id, edge)
      patch({
        canvas: {
          status: 'ready',
          value: {
            nodes: [...byId.values()],
            edges: [...edgeById.values()],
            truncated: current.value.truncated || graph.truncated,
            seeds: current.value.seeds,
          },
        },
      })
    },
    failCanvas(message): void {
      patch({ canvas: { status: 'error', error: message } })
    },
    beginSearch(): void {
      patch({ search: { status: 'loading' } })
    },
    setSearch(hits): void {
      patch({ search: { status: 'ready', value: hits } })
    },
    failSearch(message): void {
      patch({ search: { status: 'error', error: message } })
    },
    select(nodeId): void {
      patch({ selected: nodeId })
    },
    setTypeFilter(types): void {
      // An empty whitelist filters nothing; normalize to `undefined` so the
      // render never distinguishes "no filter" from "filter with zero types".
      patch({ typeFilter: types !== undefined && types.size === 0 ? undefined : types })
    },
  }
}
