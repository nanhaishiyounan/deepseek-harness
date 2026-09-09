/**
 * Knowledge-graph-page surface plugin, browser half: the sidebar first-class
 * entry and the `kg` conversation view tab (phrase-box subgraph walks, seed
 * search, the sigma canvas with its type legend and details panel). All data
 * rides the connection's `api.kg` face; a deployment without the domain
 * shows the structured refusal inline. The page is read-only: graph writes
 * belong to the kg-build pipeline.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-slots SlotMap merges (every seat this plugin rides).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-sidebar slot declaration the entry rides.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the ui-conversation slot declarations (view ring, header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { KgEdgeRow, KgSubgraphNodeRow } from './kgTypes.ts'
import { createKgClientStore } from './kgStore.ts'
import { createKgViewBridge } from './kgBridge.ts'
import { KgEntry } from './KgEntry.tsx'
import { KgHeaderButton } from './KgHeaderButton.tsx'
import { KgView } from './KgView.tsx'
import { en, zh } from './locales.ts'
import type { KgKey } from './locales.ts'

export type { KgEntryInjected, KgEntryProps } from './KgEntry.tsx'
export type { KgHeaderButtonInjected, KgHeaderButtonProps } from './KgHeaderButton.tsx'
export type { KgViewInjected, KgViewProps } from './KgView.tsx'
export type { KgViewBridge } from './kgBridge.ts'
export type { KgCache, KgClientState, KgClientStore } from './kgStore.ts'
export type { KgEdgeRow, KgNodeHitRow, KgNodeTypeRow, KgRelationRow, KgSubgraphNodeRow } from './kgTypes.ts'
export { KG_NODE_COLOR_COUNT, nodeColorOf, parseKgPhrase } from './presentation.ts'
export type { KgPhrasePlan } from './presentation.ts'
export type { KgKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The graph page's copy. */
    kg: KgKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'kg'

/** Required services: the slot registry, the locale dictionaries, and the connection's api face. */
export const inject = ['slots', 'locale', 'connection']

/** Unwrap a unary response or rethrow its error text (the inline failure path). */
function unwrap<T>(response: { result: { ok: true; value: T } | { ok: false; error: { message: string } } }): T {
  if (response.result.ok) return response.result.value
  throw new Error(response.result.error.message)
}

/** Failure text for any thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The subgraph wire value's client-side shape (the store's canvas input). */
interface KgSubgraphWire {
  readonly nodes: readonly KgSubgraphNodeRow[]
  readonly edges: readonly KgEdgeRow[]
  readonly truncated: boolean
}

/**
 * Client plugin body: register the dictionaries and the page's seats over one
 * shared client-session store and one view bridge.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-kg: dictionaries')
  const api = (ctx.get('connection') as ConnectionHandle).api
  const store = createKgClientStore()
  const bridge = createKgViewBridge()
  const bound = ctx.locale.bind(NS)

  /** Load or reload the legend (each load is a no-op while one is in flight). */
  const refresh = (): void => {
    const snapshot = store.store.getSnapshot()
    if (snapshot.legend?.status === 'loading') return
    store.beginLegend()
    api.kg.schema({}).then((response) => {
      const value = unwrap<{ node_types: readonly import('./kgTypes.ts').KgNodeTypeRow[]; relations: readonly import('./kgTypes.ts').KgRelationRow[] }>(response)
      store.setLegend(value.node_types, value.relations)
    }).catch((error: unknown) => {
      store.failLegend(messageOf(error))
    })
  }

  /** Run one subgraph walk from name seeds. */
  const walk = (seeds: readonly string[], hops: number): void => {
    store.beginCanvas()
    api.kg.subgraph({ seeds: [...seeds], hops }).then((response) => {
      const value = unwrap<KgSubgraphWire & { seeds_resolved: readonly string[] }>(response)
      store.setCanvas({ nodes: value.nodes, edges: value.edges, truncated: value.truncated }, value.seeds_resolved)
    }).catch((error: unknown) => {
      store.failCanvas(messageOf(error))
    })
  }

  /** Expand one minted node id (the canvas load-on-demand patch). */
  const expandNode = (nodeId: string): void => {
    api.kg.expand({ node_id: nodeId }).then((response) => {
      store.mergeCanvas(unwrap<KgSubgraphWire>(response))
    }).catch((error: unknown) => {
      store.failCanvas(messageOf(error))
    })
  }

  /** Resolve an entity name to seed hits. */
  const searchSeeds = (query: string): void => {
    store.beginSearch()
    api.kg.search({ query }).then((response) => {
      store.setSearch(unwrap<{ nodes: readonly import('./kgTypes.ts').KgNodeHitRow[] }>(response).nodes)
    }).catch((error: unknown) => {
      store.failSearch(messageOf(error))
    })
  }

  /** Toggle one type in the canvas filter (an empty whitelist clears it). */
  const toggleTypeFilter = (typeId: string): void => {
    const current = store.store.getSnapshot().typeFilter
    const next = new Set(current ?? [])
    if (next.has(typeId)) next.delete(typeId)
    else next.add(typeId)
    store.setTypeFilter(next.size === 0 ? undefined : next)
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'kg',
    order: 8,
    locale: NS,
    inject: () => ({
      hooks: { kg: store.store },
      refresh,
      requestKgView: () => { bridge.request('kg') },
    }),
  }, KgEntry))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'kg',
    order: 13,
    locale: NS,
    label: () => bound('view.kg'),
    inject: () => ({
      hooks: { kg: store.store },
      refresh,
      walk,
      expandNode,
      searchSeeds,
      selectNode: (nodeId: string | undefined) => { store.select(nodeId) },
      toggleTypeFilter,
      clearTypeFilter: () => { store.setTypeFilter(undefined) },
      requestView: (view: string) => { bridge.request(view) },
    }),
  }, KgView))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'kg',
    order: 13,
    locale: NS,
    inject: () => ({
      publishViewSwitch: (setView: (view: string) => void) => bridge.provide(setView),
    }),
  }, KgHeaderButton))
}
