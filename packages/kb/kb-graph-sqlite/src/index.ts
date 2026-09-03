/**
 * SQLite store provider for the knowledge-graph seam: one `node:sqlite`
 * database holding tenant-isolated triples with an entities projection for
 * search, opened and validated at load (fail-loud on schema mismatch).
 * @module @deepseek-ai/dsh-kb-graph-sqlite
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SqliteGraphStore } from './store.ts'

export { SCHEMA_VERSION } from './schema.ts'
export { SqliteGraphStore } from './store.ts'
export type { SqliteGraphStoreOptions } from './store.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'kb-graph-sqlite'
/** Services required by the graph store provider. */
export const inject = ['kbGraph']

/* jscpd:ignore-start */
// jscpd: intentional symmetry — the SQLite store plugin convention (config +
// warning-filtered loader + eager open/register); the kb and session groups
// stay cross-dependency-free (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
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
 * Open the configured database and register it as the graph store provider.
 * The open itself is eager: an unwritable path or a foreign on-disk schema
 * fails composition load instead of the first query.
 * @param ctx - context whose `kbGraph` service receives the registration.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const sqlite = await loadNodeSqlite()
  const store = new SqliteGraphStore({
    path: config.path,
    busyTimeoutMs: config.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
  }, sqlite.DatabaseSync)
  const unregister = ctx.kbGraph.registerStoreProvider(store)
  ctx.effect(() => () => {
    unregister()
    store.close()
  }, 'kb-graph-sqlite.store')
}
/* jscpd:ignore-end */
