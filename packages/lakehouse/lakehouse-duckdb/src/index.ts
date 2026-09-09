/**
 * DuckDB query provider for the lakehouse seam: probes the native module at
 * load and registers the engine on `ctx.lakehouse`; a missing native binding
 * degrades to an unavailable engine (catalog answers keep working) instead of
 * failing composition.
 * @module @deepseek-ai/dsh-lakehouse-duckdb
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DuckDbEngine } from './engine.ts'

export { DuckDbEngine } from './engine.ts'
export type { DuckDbEngineDeps, DuckDbEngineOptions } from './engine.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'lakehouse-duckdb'
/** Services required by the engine provider. */
export const inject = ['lakehouse']

/** Plugin configuration. */
export interface Config {
  /** DuckDB memory limit in MB; omitted = DuckDB's own default. */
  memoryLimitMb?: number
  /** DuckDB worker-thread count; omitted = DuckDB's own default. */
  threads?: number
}

export const Config: z<Config> = z.object({
  memoryLimitMb: z.number().step(1).min(1),
  threads: z.number().step(1).min(1),
})

/**
 * Probe the native module and register the engine on `ctx.lakehouse`. A
 * failed probe logs one operator warning and leaves the engine registered
 * but unavailable: catalog operations keep working while `load` and `query`
 * fail loud with `LAKEHOUSE_ENGINE_UNAVAILABLE`.
 * @param ctx - context whose `lakehouse` service receives the registration.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const engine = new DuckDbEngine({
    ...(config.memoryLimitMb === undefined ? {} : { memoryLimitMb: config.memoryLimitMb }),
    ...(config.threads === undefined ? {} : { threads: config.threads }),
  })
  const unregister = ctx.lakehouse.registerQueryProvider(engine)
  ctx.effect(() => () => {
    unregister()
    engine.dispose()
  }, 'lakehouse-duckdb.engine')
  await engine.probe()
  /* v8 ignore next 3 -- only reachable on hosts whose native module failed to load. */
  if (!engine.available()) {
    ctx.logger.warn('lakehouse-duckdb: the DuckDB native module is unavailable; lakehouse load/query will fail loud until it is installed')
  }
}
