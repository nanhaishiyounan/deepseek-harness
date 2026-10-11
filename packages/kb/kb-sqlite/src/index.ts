/**
 * SQLite store provider for the knowledge-base seam: opens and validates one
 * `node:sqlite` database at load (fail-loud on schema mismatch) and registers
 * it on `ctx.kb`.
 * @module @deepseek-ai/dsh-kb-sqlite
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_BUSY_TIMEOUT_MS, openSqliteKbStore } from './open.ts'

export { SCHEMA_VERSION } from './schema.ts'
export { SqliteKbStore, ftsMatchExpression, likePattern } from './store.ts'
export type { SqliteKbStoreOptions } from './store.ts'
export { openSqliteKbStore } from './open.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'kb-sqlite'
/** Services required by the store provider. */
export const inject = ['kb']

export { DEFAULT_BUSY_TIMEOUT_MS } from './open.ts'

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

/**
 * Open the configured database and register it as the kb store provider. The
 * open itself is eager: an unwritable path or a foreign on-disk schema fails
 * composition load instead of the first tool call.
 * @param ctx - context whose `kb` service receives the registration.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const store = await openSqliteKbStore({
    path: config.path,
    busyTimeoutMs: config.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
  })
  const unregister = ctx.kb.registerStoreProvider(store)
  ctx.effect(() => () => {
    unregister()
    store.close()
  }, 'kb-sqlite.store')
}
