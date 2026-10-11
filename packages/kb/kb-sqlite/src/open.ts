/**
 * Factory that opens one SQLite kb store through the shared warning-filtered
 * `node:sqlite` loader. Other packages (the weknora provider's embedded
 * fallback) reuse this instead of duplicating the loader symmetry.
 * @module @deepseek-ai/dsh-kb-sqlite/open
 */

import { SqliteKbStore } from './store.ts'
import type { SqliteKbStoreOptions } from './store.ts'

/** Default wait for another SQLite connection's write reservation. */
export const DEFAULT_BUSY_TIMEOUT_MS = 5_000

let nodeSqlite: Promise<typeof import('node:sqlite')> | undefined

/** Load Node SQLite once so concurrent loads share one warning-filter lifetime. */
function loadNodeSqlite(): Promise<typeof import('node:sqlite')> {
  nodeSqlite ??= importNodeSqlite()
  return nodeSqlite
}

/** Import Node 22's SQLite dependency without its process-wide experimental warning. */
async function importNodeSqlite(): Promise<typeof import('node:sqlite')> {
  const emitWarning = Reflect.get(process, 'emitWarning')
  /* v8 ignore start -- Node 22 alone emits this warning; primary coverage runs on Node 24. */
  const filteredEmitWarning = (warning: string | Error, ...args: unknown[]): void => {
    const message = warning instanceof Error ? warning.message : warning
    const first = args[0]
    const type = warning instanceof Error
      ? warning.name
      : typeof first === 'string'
        ? first
        : typeof first === 'object' && first !== null && 'type' in first
          ? first.type
          : undefined
    if (message === 'SQLite is an experimental feature and might change at any time'
      && type === 'ExperimentalWarning') return
    Reflect.apply(emitWarning, process, [warning, ...args])
  }
  Reflect.set(process, 'emitWarning', filteredEmitWarning)
  try {
    return await import('node:sqlite')
  } finally {
    Reflect.set(process, 'emitWarning', emitWarning)
  }
  /* v8 ignore stop */
}

/**
 * Open a SQLite kb store at the given path. An unwritable path or a foreign
 * on-disk schema fails here instead of at the first store operation.
 * @param options - store options (`path` supports `:memory:`).
 * @returns the opened store; closing it is the caller's responsibility.
 */
export async function openSqliteKbStore(options: Omit<SqliteKbStoreOptions, 'busyTimeoutMs'> & { busyTimeoutMs?: number }): Promise<SqliteKbStore> {
  const sqlite = await loadNodeSqlite()
  return new SqliteKbStore({ path: options.path, busyTimeoutMs: options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS }, sqlite.DatabaseSync)
}
