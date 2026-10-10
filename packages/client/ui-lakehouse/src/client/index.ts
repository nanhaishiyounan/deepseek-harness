/**
 * Lakehouse workbench surface plugin, browser half: the sidebar first-class
 * entry and the `lakehouse` conversation view tab (the table catalog with
 * live row counts, the selected table's schema card, and the read-only SQL
 * editor with its result table). All data rides the connection's
 * `api.lakehouse` face; a deployment without the engine shows the structured
 * refusal inline.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-slots SlotMap merges (every seat this plugin rides).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-nav slot declaration the menu row rides.
import type {} from '@deepseek-ai/dsh-client-ui-nav/client'
// Type-only: pulls the ui-conversation slot declarations (the view ring).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { createLakehouseClientStore } from './lakehouseStore.ts'
import { LakehouseEntry } from './LakehouseEntry.tsx'
import { LakehouseView } from './LakehouseView.tsx'
import { en, zh } from './locales.ts'
import type { LakehouseKey } from './locales.ts'

export type { LakehouseEntryInjected, LakehouseEntryProps } from './LakehouseEntry.tsx'
export type { LakehouseViewInjected, LakehouseViewProps } from './LakehouseView.tsx'
export type {
  LakehouseClientState, LakehouseClientStore, LakehouseColumnRow, LakehouseQueryState,
  LakehouseSchemaState, LakehouseTableRow,
} from './lakehouseStore.ts'
export type { LakehouseKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The lakehouse workbench's copy. */
    lakehouse: LakehouseKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'lakehouse'

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
 * Client plugin body: register the dictionaries and the page's seats over one
 * shared client-session store.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-lakehouse: dictionaries')
  const api = (ctx.get('connection') as ConnectionHandle).api
  const store = createLakehouseClientStore()
  const bound = ctx.locale.bind(NS)

  /** Load or reload the shared catalog cache (a no-op while one load is in flight). */
  const refresh = (): void => {
    const snapshot = store.store.getSnapshot()
    if (snapshot.tables?.status === 'loading') return
    store.beginTables()
    api.lakehouse.tables({}).then((response) => {
      const value = unwrap<{ tables: readonly { ref: string; schema: string; table: string; row_count: number }[] }>(response)
      store.setTables(value.tables.map(row => ({
        ref: row.ref,
        schema: row.schema,
        table: row.table,
        rowCount: row.row_count,
      })))
    }).catch((error: unknown) => {
      store.failTables(messageOf(error))
    })
  }

  /** Load one table's schema card (columns plus sample rows). */
  const loadSchema = (schema: string, table: string): void => {
    api.lakehouse.schema({ schema, table }).then((response) => {
      const value = unwrap<{
        ref: string
        columns: readonly { name: string; type: string }[]
        row_count: number
        sample_rows: (null | boolean | number | string)[][]
      }>(response)
      store.setSchema({
        ref: value.ref,
        columns: value.columns,
        rowCount: value.row_count,
        sampleRows: value.sample_rows,
      })
    }).catch((error: unknown) => {
      store.failQuery(messageOf(error))
    })
  }

  /** Run one read-only SQL statement. */
  const runQuery = (sql: string): void => {
    store.beginQuery(sql)
    api.lakehouse.query({ sql }).then((response) => {
      const value = unwrap<{
        sql: string
        columns: readonly { name: string; type: string }[]
        rows: (null | boolean | number | string)[][]
        row_count: number
        truncated: boolean
      }>(response)
      store.setQuery({
        sql: value.sql,
        columns: value.columns,
        rows: value.rows,
        rowCount: value.row_count,
        truncated: value.truncated,
      })
    }).catch((error: unknown) => {
      store.failQuery(messageOf(error))
    })
  }

  // Main-nav menu row: the shared inject hands the row the activation
  // channel, so only data hooks stay here.
  ctx.slots.inject('sidebar.nav', () => ctx.slots.register({
    name: 'sidebar.nav',
    id: 'lakehouse',
    order: 12.5,
    locale: NS,
    inject: () => ({
      hooks: { lakehouse: store.store },
      refresh,
    }),
  }, LakehouseEntry))

  // The hidden conversation view the nav row activates.
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'lakehouse',
    order: 12.5,
    hidden: true,
    locale: NS,
    label: () => bound('view.lakehouse'),
    inject: () => ({
      hooks: { lakehouse: store.store },
      refresh,
      loadSchema,
      runQuery,
      badgeUnit: bound('entry.tablesBadge'),
    }),
  }, LakehouseView))
}
