/**
 * Business-page surface plugin, browser half: the sidebar main-nav row
 * (`sidebar.nav`) and the hidden `business` conversation view (the carbon
 * module navigator over `carbon.listMeta`, the conversation-first entity
 * card stream, the auxiliary table view, and the carbon ERP external entry —
 * a new-window link card over the /carbon proxy). Writes ride the write-tier
 * tables only: edits and creates hand off to the conversation, where the
 * cb_* tools carry the in-conversation confirmation contract.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-slots SlotMap merges (every seat this plugin rides).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-nav slot declaration the main-nav row rides.
import type {} from '@deepseek-ai/dsh-client-ui-nav/client'
// Type-only: pulls the ui-sidebar slot declaration the entry rides.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the ui-conversation slot declarations (view ring, header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the view-context service Context merge (ctx.viewContext).
import type {} from '@deepseek-ai/dsh-client-ui-view-context/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { BizCollectionRow, BizRowPageView } from './bizTypes.ts'
import { createBizClientStore } from './bizStore.ts'
import { BizEntry } from './BizEntry.tsx'
import { BizHeaderButton } from './BizHeaderButton.tsx'
import { BizView } from './BizView.tsx'
import { en, zh } from './locales.ts'
import type { BusinessKey } from './locales.ts'

export type { BizEntryInjected, BizEntryProps } from './BizEntry.tsx'
export type { BizHeaderButtonInjected, BizHeaderButtonProps } from './BizHeaderButton.tsx'
export type { BizViewInjected, BizViewProps } from './BizView.tsx'
export type { BizCache, BizClientState, BizClientStore } from './bizStore.ts'
export type { BizCollectionRow, BizRowPageView, BizRowView } from './bizTypes.ts'
export { entityLabelOf, entityPreviewOf } from './presentation.ts'
export type { BusinessKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The business page's copy. */
    business: BusinessKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'business'

/** Required services: the slot registry, the locale dictionaries, and the connection's api face. */
export const inject = ['slots', 'locale', 'connection']

/** Rows per page the data source loads. */
const PAGE_SIZE = 20

/** Unwrap a unary response or rethrow its error text (the inline failure path). */
function unwrap<T>(response: { result: { ok: true; value: T } | { ok: false; error: { message: string } } }): T {
  if (response.result.ok) return response.result.value
  throw new Error(response.result.error.message)
}

/** Failure text for any thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One carbon wire table row (the listMeta projection). */
interface CarbonTableWireRow {
  readonly table: string
  readonly label?: unknown
  readonly module?: unknown
  readonly risk?: unknown
  readonly id_column?: unknown
  readonly key_columns?: unknown
}

/** One carbon wire row page (the list projection). */
interface CarbonPageWire {
  readonly count: number
  readonly offset: number
  readonly limit: number
  readonly rows: readonly Record<string, unknown>[]
}

/** Project one wire catalog table onto the page's roster row. */
function collectionOf(entry: CarbonTableWireRow): BizCollectionRow {
  return {
    name: entry.table,
    ...typeof entry.label === 'string' ? { title: entry.label } : {},
    ...typeof entry.module === 'string' ? { module: entry.module } : {},
    ...(entry.risk === 'read' || entry.risk === 'write') ? { risk: entry.risk } : {},
    ...typeof entry.id_column === 'string' ? { id_column: entry.id_column } : {},
    fields: (Array.isArray(entry.key_columns) ? entry.key_columns : [])
      .filter((name): name is string => typeof name === 'string')
      .map(name => ({ name, type: 'string' })),
  }
}

/** Project one wire row page onto the page's envelope (1-based page derived from offset/limit). */
function pageOf(entry: CarbonPageWire): BizRowPageView {
  const pageSize = entry.limit > 0 ? entry.limit : PAGE_SIZE
  return {
    count: entry.count,
    page: Math.floor(entry.offset / pageSize) + 1,
    page_size: pageSize,
    rows: entry.rows,
  }
}

/**
 * Client plugin body: register the dictionaries and the page's seats over one
 * shared client-session store and one view-bridge discipline (the header
 * publisher pattern shared with the sibling pages).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-business: dictionaries')
  const api = (ctx.get('connection') as ConnectionHandle).api
  const store = createBizClientStore()
  const bound = ctx.locale.bind(NS)
  // The header bridge: one publisher owns the live setView while mounted.
  const setViewRef: { current: ((view: string) => void) | undefined } = { current: undefined }
  const requestView = (view: string): void => { setViewRef.current?.(view) }

  /** Load or reload the table roster (a no-op while one is in flight). */
  const refresh = (): void => {
    if (store.store.getSnapshot().collections?.status === 'loading') return
    store.beginCollections()
    api.carbon.listMeta({}).then((response) => {
      const value = unwrap<{ tables: readonly CarbonTableWireRow[] }>(response)
      store.setCollections(value.tables.map(collectionOf))
    }).catch((error: unknown) => {
      store.failCollections(messageOf(error))
    })
  }

  /** Select one table and load its first row page. */
  const loadRows = (collection: string): void => {
    store.select(collection)
    store.beginRows()
    api.carbon.list({ table: collection, limit: PAGE_SIZE }).then((response) => {
      store.setRows(pageOf(unwrap<CarbonPageWire>(response)))
    }).catch((error: unknown) => {
      store.failRows(messageOf(error))
    })
  }

  /** Load one more row page onto the stream (the hasNext pattern). */
  const loadMore = (collection: string, page: number): void => {
    api.carbon.list({ table: collection, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }).then((response) => {
      const next = pageOf(unwrap<CarbonPageWire>(response))
      const current = store.store.getSnapshot().rows
      if (current?.status !== 'ready') {
        store.setRows(next)
        return
      }
      const seen = new Set(current.value.rows.map(row => row.id))
      store.setRows({
        ...next,
        rows: [...current.value.rows, ...next.rows.filter(row => !seen.has(row.id))],
      })
    }).catch((error: unknown) => {
      store.failRows(messageOf(error))
    })
  }

  // Main-nav menu row: the shared inject hands the row the activation
  // channel, so only data hooks stay here.
  ctx.slots.inject('sidebar.nav', () => ctx.slots.register({
    name: 'sidebar.nav',
    id: 'business',
    order: 14,
    locale: NS,
    inject: () => ({
      hooks: { business: store.store },
      refresh,
    }),
  }, BizEntry))

  // The hidden conversation view the nav row activates.
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'business',
    order: 14,
    hidden: true,
    locale: NS,
    label: () => bound('view.business'),
    inject: () => ({
      hooks: { business: store.store },
      refresh,
      loadRows,
      loadMore,
      requestView,
      updateRow: (collection: string, id: string, values: Record<string, string | number | null>) =>
        api.carbon.update({ table: collection, id, values }).then(response =>
          unwrap<{ table: string; row: Record<string, unknown> }>(response).row),
    }),
  }, BizView))

  // Deferred activation: ui-view-context may apply after this package;
  // ctx.inject runs the registration once the service exists.
  ctx.inject(['viewContext'], (sub) => {
    const viewContext = sub.viewContext

    // First-batch business actions: table selection (the store's own
    // select) plus the hoisted row filter the projection reports.
    ctx.effect(() => viewContext.registerActions({
      view: 'business',
      actions: {
        select_collection: (args: Record<string, unknown>) => {
          const collection = args['collection']
          if (typeof collection !== 'string' || collection === '') {
            throw new Error('select_collection: {"collection": string} required')
          }
          const roster = store.store.getSnapshot().collections
          const exists = roster?.status === 'ready' && roster.value.some(row => row.name === collection)
          if (!exists) {
            throw new Error(`select_collection: 业务表清单中找不到「${collection}」`)
          }
          store.select(collection)
          loadRows(collection)
          return { summary: `已切换业务表到「${collection}」` }
        },
        set_table_filter: (args: Record<string, unknown>) => {
          const filter = args['filter']
          if (typeof filter !== 'string' || filter === '') {
            throw new Error('set_table_filter: {"filter": string} required')
          }
          store.setTableFilter(filter)
          return { summary: `已将当前表行过滤设为「${filter}」` }
        },
      },
    }), 'ui-business: view-actions executors')
    ctx.effect(() => viewContext.provide({
      view: 'business',
      label: () => bound('view.business'),
      changes: store.store,
      snapshot: () => {
        const state = store.store.getSnapshot()
        return {
          '当前表': state.selected ?? '未选择',
          '数据状态': state.rows?.status === 'ready' ? `${String(state.rows.value.count)} 行` : '未加载',
          '行过滤': state.tableFilter ?? '无',
        }
      },
    }), 'ui-business: view-context provider')
  })

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'business',
    order: 14,
    locale: NS,
    inject: () => ({
      publishViewSwitch: (setView: (view: string) => void) => {
        setViewRef.current = setView
        // A superseded publisher's withdraw leaves the live one wired.
        return () => { if (setViewRef.current === setView) setViewRef.current = undefined }
      },
    }),
  }, BizHeaderButton))
}
