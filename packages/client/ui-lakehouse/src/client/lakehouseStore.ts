/**
 * Shared client-session store for the lakehouse workbench: the table catalog
 * cache, the selected table's schema card, the in-flight or settled query
 * result, and the rejection text. One store instance serves the nav row and
 * the conversation view; loads are no-ops while one is already in flight.
 * @module @deepseek-ai/dsh-client-ui-lakehouse/client/lakehouseStore
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** One table in the catalog listing. */
export interface LakehouseTableRow {
  readonly ref: string
  readonly schema: string
  readonly table: string
  readonly rowCount: number
}

/** One column in a schema card or query result. */
export interface LakehouseColumnRow {
  readonly name: string
  readonly type: string
}

/** A settled query result. */
export interface LakehouseQueryState {
  readonly sql: string
  readonly columns: readonly LakehouseColumnRow[]
  readonly rows: (null | boolean | number | string)[][]
  readonly rowCount: number
  readonly truncated: boolean
}

/** The schema card for the selected table. */
export interface LakehouseSchemaState {
  readonly ref: string
  readonly columns: readonly LakehouseColumnRow[]
  readonly rowCount: number
  readonly sampleRows: (null | boolean | number | string)[][]
}

/** Loading-or-settled wrapper. */
type Phase<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; message: string }

/** The full workbench state. */
export interface LakehouseClientState {
  readonly tables: Phase<readonly LakehouseTableRow[]> | undefined
  readonly schema: LakehouseSchemaState | undefined
  readonly query: LakehouseQueryState | undefined
  readonly queryError: string | undefined
  readonly queryLoading: boolean
}

/** The store handle bound by the renderer into props hooks. */
export interface LakehouseClientStore {
  readonly store: SnapshotStore<LakehouseClientState>
  beginTables(): void
  setTables(rows: readonly LakehouseTableRow[]): void
  failTables(message: string): void
  setSchema(schema: LakehouseSchemaState): void
  beginQuery(sql: string): void
  setQuery(result: LakehouseQueryState): void
  failQuery(message: string): void
}

/** Create one shared store (the plugin registers it once per session). */
export function createLakehouseClientStore(): LakehouseClientStore {
  const store = createSnapshotStore<LakehouseClientState>({
    tables: undefined,
    schema: undefined,
    query: undefined,
    queryError: undefined,
    queryLoading: false,
  })
  const patch = (next: Partial<LakehouseClientState>): void => {
    store.set({ ...store.getSnapshot(), ...next })
  }
  return {
    store,
    beginTables() {
      patch({ tables: { status: 'loading' } })
    },
    setTables(rows) {
      patch({ tables: { status: 'ready', value: rows } })
    },
    failTables(message) {
      patch({ tables: { status: 'error', message } })
    },
    setSchema(schema) {
      patch({ schema })
    },
    beginQuery(sql) {
      const prior = store.getSnapshot().query
      patch({ queryLoading: true, queryError: undefined, query: sql === prior?.sql ? prior : undefined })
    },
    setQuery(result) {
      patch({ queryLoading: false, queryError: undefined, query: result })
    },
    failQuery(message) {
      patch({ queryLoading: false, queryError: message })
    },
  }
}
