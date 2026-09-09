/**
 * SQLite catalog provider for the lakehouse seam: opens and validates one
 * `node:sqlite` database at load (fail-loud on schema mismatch) and registers
 * it on `ctx.lakehouse`.
 * @module @deepseek-ai/dsh-lakehouse-sqlite-catalog
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SqliteCatalogStore } from './store.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'lakehouse-sqlite-catalog'
/** Services required by the catalog provider. */
export const inject = ['lakehouse']

export { SCHEMA_VERSION, validateSchema } from './schema.ts'
export { SqliteCatalogStore } from './store.ts'
export type { SqliteCatalogStoreOptions } from './store.ts'

/* jscpd:ignore-start */
// jscpd: intentional symmetry — the plugin-name/inject/busy-timeout/Config
// declaration order shared with the kb store plugin; the kb and lakehouse
// groups stay cross-dependency-free
// (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
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
// loader convention and the eager-open apply template; the kb, session, and
// lakehouse groups stay cross-dependency-free
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

/**
 * Open the configured database and register it as the lakehouse catalog
 * provider. The open itself is eager: an unwritable path or a foreign on-disk
 * schema fails composition load instead of the first call.
 * @param ctx - context whose `lakehouse` service receives the registration.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const sqlite = await loadNodeSqlite()
  const store = new SqliteCatalogStore({
    path: config.path,
    busyTimeoutMs: config.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
  }, sqlite.DatabaseSync)
  const unregister = ctx.lakehouse.registerCatalogStore(store)
  ctx.effect(() => () => {
    unregister()
    store.close()
  }, 'lakehouse-sqlite-catalog.store')
}
/* jscpd:ignore-end */
