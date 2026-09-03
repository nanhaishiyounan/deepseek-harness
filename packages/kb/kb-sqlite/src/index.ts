/**
 * SQLite store provider for the knowledge-base seam: opens and validates one
 * `node:sqlite` database at load (fail-loud on schema mismatch) and registers
 * it on `ctx.kb`.
 * @module @deepseek-ai/dsh-kb-sqlite
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SqliteKbStore } from './store.ts'

export { SCHEMA_VERSION } from './schema.ts'
export { SqliteKbStore, ftsMatchExpression, likePattern } from './store.ts'
export type { SqliteKbStoreOptions } from './store.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'kb-sqlite'
/** Services required by the store provider. */
export const inject = ['kb']

/** Default wait for another SQLite connection's write reservation. */
export const DEFAULT_BUSY_TIMEOUT_MS = 5_000

/** Plugin configuration. */
export interface Config {
  /** SQLite database path (`:memory:` supported), resolved against the process cwd when relative. */
  path: string
  /** Maximum wait for another SQLite connection's lock; defaults to 5,000 ms. */
  busyTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  path: z.string().required(),
  busyTimeoutMs: z.number().step(1).min(0).default(DEFAULT_BUSY_TIMEOUT_MS),
})

/* jscpd:ignore-start */
// jscpd: intentional symmetry — the isomorphic node:sqlite warning-filter
// loader convention; the kb and session groups stay cross-dependency-free
// (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
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
/* jscpd:ignore-end */

/**
 * Open the configured database and register it as the kb store provider. The
 * open itself is eager: an unwritable path or a foreign on-disk schema fails
 * composition load instead of the first tool call.
 * @param ctx - context whose `kb` service receives the registration.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const sqlite = await loadNodeSqlite()
  const store = new SqliteKbStore({
    path: config.path,
    busyTimeoutMs: config.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
  }, sqlite.DatabaseSync)
  const unregister = ctx.kb.registerStoreProvider(store)
  ctx.effect(() => () => {
    unregister()
    store.close()
  }, 'kb-sqlite.store')
}
