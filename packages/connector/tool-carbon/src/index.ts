/**
 * Model-facing carbon business tools plugin: mounts the cb_* tool rows over
 * the `ctx.carbon` capability service (connector-carbon provides it; this
 * plugin is the seam's tool Consumer). The rows stay registered when the
 * service is absent or degraded and fail with the structured refusal at
 * execution time — the documented degraded mode shared with tool-nocobase.
 * @module @deepseek-ai/dsh-tool-carbon
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { CarbonService } from '@deepseek-ai/dsh-connector-carbon'
import {
  applyCbCollectionsTool,
  applyCbCreateTool,
  applyCbGetTool,
  applyCbListTool,
  applyCbUpdateTool,
} from './tools.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-carbon'

/** Services required by the carbon tool suite. */
export const inject = ['tools', 'systemPrompt', 'carbon']

/** Default cooperative tool-call timeout budget (ms) for the read tools. */
export const DEFAULT_READ_TIMEOUT_MS = 10_000

/** Default cooperative tool-call timeout budget (ms) for the write tools (covers the get+write pair cb_update runs). */
export const DEFAULT_WRITE_TIMEOUT_MS = 60_000

export {
  applyCbCollectionsTool,
  applyCbCreateTool,
  applyCbGetTool,
  applyCbListTool,
  applyCbUpdateTool,
  CB_LIST_DEFAULT_LIMIT,
  CB_LIST_MAX_LIMIT,
  formatCbCollectionsOutput,
  formatCbListOutput,
} from './tools.ts'
export type {
  CbCollectionCardView,
  CbCollectionsToolValue,
  CbCreateToolValue,
  CbFieldChange,
  CbGetToolValue,
  CbListToolValue,
  CbUpdateToolValue,
} from './tools.ts'

/** Plugin configuration. */
export interface Config {
  /** Cooperative tool-call budget for the read tools (ms); defaults to 10000. */
  readTimeoutMs?: number
  /** Cooperative tool-call budget for the write tools (ms); defaults to 60000. */
  writeTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  readTimeoutMs: z.number().step(1).min(1).default(DEFAULT_READ_TIMEOUT_MS),
  writeTimeoutMs: z.number().step(1).min(1).default(DEFAULT_WRITE_TIMEOUT_MS),
})

/**
 * Register the five cb_* tool rows over the carbon capability service.
 * @param ctx - context whose registries receive the registrations.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const carbon = ctx.carbon as CarbonService
  const read = config.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS
  const write = config.writeTimeoutMs ?? DEFAULT_WRITE_TIMEOUT_MS
  applyCbCollectionsTool(ctx, carbon, read)
  applyCbListTool(ctx, carbon, read)
  applyCbGetTool(ctx, carbon, read)
  applyCbCreateTool(ctx, carbon, write)
  applyCbUpdateTool(ctx, carbon, write)
}
