/**
 * WeKnora provider plugin for the knowledge-base seam: loads the validated
 * configuration, opens the optional embedded fallback store, and registers
 * the WeKnora store on `ctx.kb`. Composition errors (fallback without a
 * path) fail at load.
 * @module @deepseek-ai/dsh-kb-weknora
 */

import type { Context } from '@deepseek-ai/cordis'
import { KbError } from '@deepseek-ai/dsh-kb'
import { openSqliteKbStore } from '@deepseek-ai/dsh-kb-sqlite'
import z from '@deepseek-ai/schemastery'
import { WeknoraKbStore } from './store.ts'

export { FALLBACK_NOTICE, WeknoraKbStore, WEKNORA_STORE_ID } from './store.ts'
export { WeknoraApiError, WeknoraClient } from './client.ts'
export type { WeknoraClientOptions, WeknoraKnowledgeBase, WeknoraKnowledge, WeknoraSearchHit } from './client.ts'
export type { WeknoraKbStoreOptions, WeknoraStoreLogger } from './store.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'kb-weknora'

/** Services required before the provider can register. */
export const inject = ['kb']

/** Default WeKnora app origin (the B4 sidecar host port). */
export const DEFAULT_BASE_URL = 'http://localhost:18081'

/** Default per-request timeout. */
export const DEFAULT_TIMEOUT_MS = 15_000

/** Default retrieval depth per knowledge base per path. */
export const DEFAULT_TOP_K = 32

/** Plugin configuration. */
export interface Config {
  /** WeKnora app origin, no `/api/v1` suffix. */
  baseUrl: string
  /** Scoped API key (`X-API-Key`). Blank or missing marks the store unavailable. */
  apiKey?: string
  /** Serve from the fallback store on WeKnora outages; defaults to `false` (fail loud). */
  allowFallback?: boolean
  /** SQLite database the fallback store opens; required when `allowFallback` is set. */
  fallbackPath?: string
  /** Per-request timeout in milliseconds. */
  requestTimeoutMs?: number
  /** Retrieval depth per knowledge base per path. */
  topK?: number
}

export const Config: z<Config> = z.object({
  baseUrl: z.string().default(DEFAULT_BASE_URL),
  apiKey: z.string(),
  allowFallback: z.boolean().default(false),
  fallbackPath: z.string(),
  requestTimeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
  topK: z.number().step(1).min(1).default(DEFAULT_TOP_K),
})

/**
 * Open the optional fallback store and register the Weknora store provider.
 * `allowFallback` without `fallbackPath` fails the load: a silent no-fallback
 * degradation is exactly the misconfiguration the seam refuses.
 * @param ctx - context whose `kb` service receives the registration.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (config.allowFallback === true && (config.fallbackPath ?? '') === '') {
    throw new KbError('kb-weknora: allowFallback is set but fallbackPath is missing', 'KB_WEKNORA_CONFIG_INVALID')
  }
  const fallback = config.allowFallback === true && config.fallbackPath !== undefined
    ? await openSqliteKbStore({ path: config.fallbackPath })
    : undefined
  const store = new WeknoraKbStore({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey ?? '',
    allowFallback: config.allowFallback,
    fallbackStore: fallback,
    timeoutMs: config.requestTimeoutMs,
    topK: config.topK,
    logger: ctx.logger,
  })
  const unregister = ctx.kb.registerStoreProvider(store)
  ctx.effect(() => () => {
    unregister()
    store.close()
  }, 'kb-weknora.store')
}
