/**
 * Data-asset market surface plugin, browser half: the sidebar first-class
 * entry and the `market` conversation view tab (section portal with the
 * featured rail, the searchable catalog, the asset detail panel, and the
 * order journey — confirm card → `orders.create` → receipt with the status
 * badge). All data rides the connection's `api.assets` face (plus
 * `api.orders` for placement); a deployment without the market domain shows
 * the structured refusal inline.
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
import type { MarketAssetRow, MarketOrderReceipt, MarketStatsRow } from './marketTypes.ts'
import { createMarketClientStore } from './marketStore.ts'
import { createMarketViewBridge } from './marketBridge.ts'
import { MarketEntry } from './MarketEntry.tsx'
import { MarketHeaderButton } from './MarketHeaderButton.tsx'
import { MarketView } from './MarketView.tsx'
import { en, zh } from './locales.ts'
import type { MarketKey } from './locales.ts'

export type { MarketEntryInjected, MarketEntryProps } from './MarketEntry.tsx'
export type { MarketHeaderButtonInjected, MarketHeaderButtonProps } from './MarketHeaderButton.tsx'
export type { MarketViewInjected, MarketViewProps } from './MarketView.tsx'
export type { OrderConfirmCardProps } from './OrderConfirmCard.tsx'
export type { MarketCache, MarketClientState, MarketClientStore } from './marketStore.ts'
export type { MarketViewBridge } from './marketBridge.ts'
export type {
  MarketAssetKind, MarketAssetRow, MarketFeaturedRow, MarketOrderReceipt, MarketOrderStatus, MarketStatsRow,
} from './marketTypes.ts'
export { MARKET_KIND_FILTERS, filterCatalog, providerLabelOf } from './presentation.ts'
export type { MarketKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The market's copy. */
    market: MarketKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'market'

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

/**
 * Client plugin body: register the dictionaries and the market's seats over
 * one shared client-session store and one view bridge.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-assets: dictionaries')
  const api = (ctx.get('connection') as ConnectionHandle).api
  const store = createMarketClientStore()
  const bridge = createMarketViewBridge()
  const bound = ctx.locale.bind(NS)

  /** Load or reload both shared caches (each load is a no-op while one is in flight). */
  const refresh = (): void => {
    const snapshot = store.store.getSnapshot()
    if (snapshot.stats?.status !== 'loading') {
      store.beginStats()
      api.assets.stats({}).then((response) => {
        store.setStats(unwrap<MarketStatsRow>(response))
      }).catch((error: unknown) => {
        store.failStats(messageOf(error))
      })
    }
    if (snapshot.catalog?.status !== 'loading') {
      store.beginCatalog()
      api.assets.list({}).then((response) => {
        store.setCatalog(unwrap<{ assets: readonly MarketAssetRow[] }>(response).assets)
      }).catch((error: unknown) => {
        store.failCatalog(messageOf(error))
      })
    }
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'market',
    order: 6,
    locale: NS,
    inject: () => ({
      hooks: { market: store.store },
      refresh,
      requestMarketView: () => { bridge.request('market') },
    }),
  }, MarketEntry))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'market',
    order: 11,
    locale: NS,
    label: () => bound('view.market'),
    inject: () => ({
      hooks: { market: store.store },
      refresh,
      requestView: (view: string) => { bridge.request(view) },
      placeOrder: (asset: MarketAssetRow, brief: string) => {
        const serviceId = asset.service_id
        if (serviceId === undefined) return Promise.reject(new Error('this asset is not orderable'))
        return api.orders.create({ service_id: serviceId, brief }).then((response) => {
          const receipt = unwrap<MarketOrderReceipt>(response)
          refresh()
          return receipt
        })
      },
    }),
  }, MarketView))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'market',
    order: 11,
    locale: NS,
    inject: () => ({
      hooks: { market: store.store },
      publishViewSwitch: (setView: (view: string) => void) => bridge.provide(setView),
    }),
  }, MarketHeaderButton))

  // Workbench-view projection: the host injects this snapshot into every
  // model request while the market tab is the active conversation view.
  // Deferred activation: ui-view-context may apply after this package;
  // ctx.inject runs the registration once the service exists.
  ctx.inject(['viewContext'], (sub) => {
    const viewContext = sub.viewContext

    // First-batch market actions: hoisted store fields (selection + category
    // filter) the snapshot projection reports; the catalog UI binds to them
    // in a later round.
    ctx.effect(() => viewContext.registerActions({
      view: 'market',
      actions: {
        select_asset: (args: Record<string, unknown>) => {
          const id = args['id']
          if (typeof id !== 'string' || id === '') {
            throw new Error('select_asset: {"id": string} required (dataset_id or title)')
          }
          const catalog = store.store.getSnapshot().catalog
          const hit = catalog?.status === 'ready'
            ? catalog.value.find(asset => asset.dataset_id === id || asset.title === id)
            : undefined
          if (hit === undefined) {
            throw new Error(`select_asset: 资产目录中找不到资产「${id}」`)
          }
          store.selectAsset(hit.dataset_id)
          return { summary: `已选中资产「${hit.title}」` }
        },
        filter_category: (args: Record<string, unknown>) => {
          const category = args['category']
          if (typeof category !== 'string' || category === '') {
            throw new Error('filter_category: {"category": string} required')
          }
          store.setCategoryFilter(category)
          return { summary: `已将资产目录分类过滤设为「${category}」` }
        },
      },
    }), 'ui-assets: view-actions executors')
    ctx.effect(() => viewContext.provide({
      view: 'market',
      label: () => bound('view.market'),
      changes: store.store,
      snapshot: () => {
        const state = store.store.getSnapshot()
        return {
          '资产目录': state.catalog?.status === 'ready' ? `${String(state.catalog.value.length)} 项` : '未加载',
          '服务商数': state.stats?.status === 'ready' ? state.stats.value.providers : '未加载',
          '选中资产': state.selectedAssetId ?? '无',
          '分类过滤': state.categoryFilter ?? '全部',
        }
      },
    }), 'ui-assets: view-context provider')
  })
}
