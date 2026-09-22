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
// Type-only: pulls the view-context service Context merge (ctx.viewContext).
import type {} from '@deepseek-ai/dsh-client-ui-view-context/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {
  KgCommunitiesRow, KgEdgeRow, KgEpisodeRow, KgMappingsRow, KgNodeHitRow, KgOntologyEditResultRow,
  KgOntologyOpRow, KgQueryWire, KgQualityRow, KgReviewEntryRow, KgRollbackResultRow, KgSubgraphNodeRow,
} from './kgTypes.ts'
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
export type { OntoTreeProps } from './OntoTree.tsx'
export { buildOntoTree } from './OntoTree.tsx'
export type { ChangeFeedProps } from './ChangeFeed.tsx'
export type { KgViewBridge } from './kgBridge.ts'
export type { KgCache, KgClientState, KgClientStore } from './kgStore.ts'
export type {
  KgCommunitiesRow, KgEdgeRow, KgEpisodeRow, KgHistoryRow, KgNodeHitRow, KgNodeTypeRow, KgOntologyEditResultRow,
  KgOntologyOpRow, KgRelationRow, KgReviewEntryRow, KgRollbackResultRow, KgSubgraphNodeRow,
} from './kgTypes.ts'
export {
  KG_NODE_COLOR_COUNT, nodeColorOf, parseKgPhrase, semanticColorOf, semanticRootOf, communityColorOf,
} from './presentation.ts'
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
      const value = unwrap<{
        node_types: readonly import('./kgTypes.ts').KgNodeTypeRow[]
        relations: readonly import('./kgTypes.ts').KgRelationRow[]
        revisions?: readonly { id: number; summary: string; created_at: string }[]
      }>(response)
      store.setLegend(value.node_types, value.relations, value.revisions ?? [])
    }).catch((error: unknown) => {
      store.failLegend(messageOf(error))
    })
  }

  /** Load or reload the episode ledger and the review queue (the change feed). */
  const loadFeed = (): void => {
    if (store.store.getSnapshot().episodes?.status === 'loading') return
    store.beginEpisodes()
    api.kg.episodes({ limit: 50 }).then((response) => {
      store.setEpisodes(unwrap<{ episodes: readonly KgEpisodeRow[] }>(response).episodes)
    }).catch((error: unknown) => {
      store.failEpisodes(messageOf(error))
    })
    if (store.store.getSnapshot().review?.status === 'loading') return
    store.beginReview()
    api.kg.reviewQueue({}).then((response) => {
      const value = unwrap<{ entries: readonly KgReviewEntryRow[]; source_episode: string }>(response)
      store.setReview(value.entries, value.source_episode)
    }).catch((error: unknown) => {
      store.failReview(messageOf(error))
    })
  }

  /** Load the precomputed louvain partition (community coloring's input). */
  const loadCommunities = (): void => {
    if (store.store.getSnapshot().communities?.status === 'loading') return
    store.beginCommunities()
    api.kg.communities({}).then((response) => {
      store.setCommunities(unwrap<KgCommunitiesRow>(response))
    }).catch((error: unknown) => {
      store.failCommunities(messageOf(error))
    })
  }

  /** Roll back one episode; the caller refreshes the feed and canvas. */
  const rollbackEpisode = (episodeUuid: string): Promise<KgRollbackResultRow> =>
    api.kg.rollback({ episode_uuid: episodeUuid }).then(response => unwrap<KgRollbackResultRow>(response))

  /** Record one gray-zone verdict; rejects with the refusal message, the caller refreshes the queue. */
  const decideReview = (entry: KgReviewEntryRow, decision: 'merge' | 'reject' | 'skip'): Promise<void> =>
    api.kg.reviewDecide({
      doc_id: entry.doc_id,
      row_id: entry.row_id,
      decision,
      doc_name: entry.doc_name,
      row_name: entry.row_name,
    }).then((response) => { unwrap<unknown>(response) })

  /** Apply one KGCL ontology op set; resolves with the receipt. */
  const applyOntoEdit = (ops: readonly KgOntologyOpRow[]): Promise<KgOntologyEditResultRow> =>
    api.kg.ontologyEdit({ ops: [...ops] }).then(response => unwrap<KgOntologyEditResultRow>(response))

  /** Replay the canvas at one instant (kg.history snapshot). */
  const replayAt = (asOf: string): void => {
    if (store.store.getSnapshot().history?.status === 'loading') return
    store.beginHistory()
    api.kg.history({ as_of: asOf }).then((response) => {
      type HistoryWire = {
        readonly nodes: readonly KgSubgraphNodeRow[]
        readonly edges: readonly KgEdgeRow[]
        readonly truncated: boolean
        readonly as_of: string
      }
      const value = unwrap<HistoryWire>(response)
      store.setHistory({ nodes: value.nodes, edges: value.edges, truncated: value.truncated, asOf: value.as_of })
    }).catch((error: unknown) => {
      store.failHistory(messageOf(error))
    })
  }

  /** Leave replay (the live canvas renders again). */
  const leaveReplay = (): void => {
    store.clearHistory()
  }

  /** The default view runs at most once per client session (a flag, not store state: it is an orchestration fact). */
  let defaultViewDone = false

  /**
   * Load the default canvas view: gate on the counters, then walk the
   * neighborhood of the first entities the seed probe returns (the empty
   * substring matches every node — searchNodes is a substring filter).
   */
  const ensureDefaultView = (): void => {
    if (defaultViewDone) return
    defaultViewDone = true
    api.kg.stats({}).then((response) => {
      const value = unwrap<{ entities: number }>(response)
      // A zero-entity graph keeps the build-guide empty state: the default
      // view must not draw a canvas over an unbuilt world.
      if (value.entities === 0) return
      return api.kg.search({ query: '', k: 3 }).then((searchResponse) => {
        const hits = unwrap<{ nodes: readonly KgNodeHitRow[] }>(searchResponse).nodes
        if (hits.length === 0) return
        walk(hits.map(hit => hit.name), 1)
      })
    }).catch(() => {
      // Swallows the stats/search probe failures of the default view only:
      // the canvas stays untouched (the empty-state guide renders), and the
      // user's own walks re-enter the same calls with full error surfacing.
    })
  }

  /** Run one subgraph walk from name seeds. */
  const walk = (seeds: readonly string[], hops: number): void => {
    store.beginCanvas()
    api.kg.subgraph({ seeds: [...seeds], hops }).then((response) => {
      // `unresolved` seeds ride the wire from a newer gateway; the canvas
      // walks the resolved set alone and ignores the tail.
      const value = unwrap<KgSubgraphWire & { seeds_resolved: readonly string[]; unresolved?: readonly string[] | undefined }>(response)
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

  /** Load the quality panel: the stats extension plus the mappings readout. */
  const loadPanel = (): void => {
    if (store.store.getSnapshot().panel?.status === 'loading') return
    store.beginPanel()
    Promise.all([
      api.kg.stats({}),
      api.kg.mappings({}).catch(() => undefined),
    ]).then(([statsResponse, mappingsResponse]) => {
      const stats = unwrap<{
        triples: number
        entities: number
        islands: number
        conflicts: number
        coverage?: { numerator: number; denominator: number; ratio: number }
        last_run_at?: string
      }>(statsResponse)
      const quality: KgQualityRow = {
        islands: stats.islands,
        conflicts: stats.conflicts,
        ...stats.coverage === undefined ? {} : { coverage: stats.coverage },
        ...stats.last_run_at === undefined ? {} : { last_run_at: stats.last_run_at },
      }
      // The mappings readout is optional in the panel: a deployment without
      // the pipeline shows the counters alone (the catch above swallows only
      // the mappings refusal, naming it here).
      let mappings: KgMappingsRow | undefined
      if (mappingsResponse !== undefined) {
        try {
          mappings = unwrap<KgMappingsRow>(mappingsResponse)
        } catch {
          mappings = undefined
        }
      }
      store.setPanel(quality, { triples: stats.triples, entities: stats.entities }, mappings)
    }).catch((error: unknown) => {
      store.failPanel(messageOf(error))
    })
  }

  /**
   * Compile one phrase server-side (`kg.query`) and land the walked canvas;
   * resolves with the restatement, or rejects with the refusal message.
   */
  const queryPhrase = (phrase: string): Promise<string> => {
    store.beginCanvas()
    return api.kg.query({ phrase }).then((response) => {
      const value = unwrap<KgQueryWire>(response)
      store.setCanvas({ nodes: value.nodes, edges: value.edges, truncated: value.truncated }, value.seeds_resolved)
      return value.restated
    }).catch((error: unknown) => {
      store.failCanvas(messageOf(error))
      throw error
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
      ensureDefaultView,
      walk,
      expandNode,
      searchSeeds,
      loadPanel,
      queryPhrase,
      selectNode: (nodeId: string | undefined) => { store.select(nodeId) },
      toggleTypeFilter,
      clearTypeFilter: () => { store.setTypeFilter(undefined) },
      loadFeed,
      loadCommunities,
      rollbackEpisode,
      decideReview,
      applyOntoEdit,
      replayAt,
      leaveReplay,
      setColorMode: (mode: 'type' | 'semantic' | 'community') => { store.setColorMode(mode) },
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

  // Workbench-view projection: the host injects this snapshot into every
  // model request while the kg tab is the active conversation view.
  // Deferred activation: ui-view-context may apply after this package;
  // ctx.inject runs the registration once the service exists.
  ctx.inject(['viewContext'], (sub) => {
    const viewContext = sub.viewContext

    // The SourceTrail seed deep link: walk the carried entities' two-hop
    // neighborhood and select the first resolved seed — the canvas's
    // selection highlight (the node plus its direct neighbors) then marks
    // the trail's path. Delivered live while mounted, or drained on mount.
    const deepLink = (seeds: readonly string[]): void => {
      if (seeds.length === 0) return
      store.beginCanvas()
      api.kg.subgraph({ seeds: [...seeds], hops: 2 }).then((response) => {
        const value = unwrap<KgSubgraphWire & { seeds_resolved: readonly string[] }>(response)
        store.setCanvas({ nodes: value.nodes, edges: value.edges, truncated: value.truncated }, value.seeds_resolved)
        const first = value.seeds_resolved[0]
        if (first !== undefined) store.select(first)
      }).catch((error: unknown) => {
        store.failCanvas(messageOf(error))
      })
    }
    const consumeDeepLink = (payload: unknown): void => {
      const seeds = (payload as { seeds?: unknown } | undefined)?.seeds
      if (Array.isArray(seeds) && seeds.every(entry => typeof entry === 'string')) deepLink(seeds)
    }
    ctx.effect(() => viewContext.onPending('kg', consumeDeepLink), 'ui-kg: kg deep-link listener')
    const pending = viewContext.takePending('kg')
    if (pending !== undefined) consumeDeepLink(pending)

    // First-batch view actions: pure store writes plus the in-view phrase
    // query (kg 视图内问数) — the browser half the view_apply tool reaches.
    ctx.effect(() => viewContext.registerActions({
      view: 'kg',
      actions: {
        set_type_filter: (args) => {
          // Tolerant parse at the model-visible boundary: models and adapters
          // serialize nested arrays inconsistently, so accept a string[] or a
          // comma/space-separated string for the type list.
          const raw = args['types']
          const types = typeof raw === 'string'
            ? raw.split(/[,，\s]+/).map(t => t.trim()).filter(t => t !== '')
            : Array.isArray(raw) && raw.every(t => typeof t === 'string') ? raw : undefined
          if (types === undefined) {
            throw new Error('set_type_filter: {"types": string[]} required (array or comma-separated string)')
          }
          store.setTypeFilter(types.length === 0 ? undefined : new Set(types))
          return { summary: types.length === 0 ? '已清除类型过滤（显示全部类型）' : `已将图谱类型过滤为 [${types.join(', ')}]` }
        },
        focus_entity: (args) => {
          const entity = args['entity']
          if (typeof entity !== 'string' || entity === '') {
            throw new Error('focus_entity: {"entity": string} required')
          }
          const state = store.store.getSnapshot()
          const hit = state.canvas?.status === 'ready'
            ? state.canvas.value.nodes.find(node => node.name === entity)
            : undefined
          if (hit === undefined) {
            throw new Error(`focus_entity: 当前画布中找不到实体「${entity}」；可先用 run_phrase_query 或 view_state_get 查看图内容`)
          }
          store.select(hit.id)
          return { summary: `已选中并聚焦实体「${entity}」` }
        },
        clear_selection: () => {
          store.select(undefined)
          return { summary: '已清除选中实体' }
        },
        run_phrase_query: async (args: Record<string, unknown>) => {
          const phrase = args['phrase']
          if (typeof phrase !== 'string' || phrase.trim() === '') {
            throw new Error('run_phrase_query: {"phrase": string} required')
          }
          const restated = await queryPhrase(phrase.trim())
          const state = store.store.getSnapshot()
          /* v8 ignore start -- queryPhrase resolves only after its then-callback
             landed the ready canvas, so this re-read cannot find it unready. */
          const size = state.canvas?.status === 'ready'
            ? `节点 ${String(state.canvas.value.nodes.length)}/边 ${String(state.canvas.value.edges.length)}`
            : '图未加载'
          /* v8 ignore stop */
          return { summary: `短语查询「${phrase.trim()}」已渲染（${restated}；${size}）` }
        },
      },
    }), 'ui-kg: view-actions executors')
    ctx.effect(() => viewContext.provide({
      view: 'kg',
      label: () => bound('view.kg'),
      changes: store.store,
      snapshot: () => {
        const state = store.store.getSnapshot()
        return {
          '选中实体': state.selected ?? '无',
          '类型过滤': state.typeFilter === undefined ? '全部' : [...state.typeFilter].sort(),
          '图规模': state.canvas?.status === 'ready'
            ? `节点 ${String(state.canvas.value.nodes.length)}/边 ${String(state.canvas.value.edges.length)}`
            : '未加载',
        }
      },
    }), 'ui-kg: view-context provider')
  })
}
