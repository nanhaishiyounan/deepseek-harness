/**
 * Model-facing `lakehouse_tables` and `lakehouse_query` tools over
 * `ctx.lakehouse`. This package owns schemas, validation, prompt guidance,
 * budgets, and presentation, never concrete catalog or engine providers.
 * Enablement controls tool registration; an enabled tool remains visible
 * when its engine is unavailable and fails with a structured error at
 * execution time (the seam's documented degraded mode).
 * @module @deepseek-ai/dsh-tool-lakehouse
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyLakehouseQueryTool } from './query.ts'
import { applyLakehouseTablesTool } from './tables.ts'

export {
  formatTablesOutput,
  parseTablesArgs,
  presentTablesCall,
  presentTablesResult,
  tablesMetaFromResult,
  tablesValueFromRecords,
} from './tables.ts'
export type {
  LakehouseTablesArgs, LakehouseTablesMetaView, LakehouseTableView, LakehouseTablesToolValue,
} from './tables.ts'
export {
  formatQueryOutput,
  parseQueryArgs,
  presentQueryCall,
  presentQueryResult,
  queryMetaFromResult,
  queryValueFromResult,
} from './query.ts'
export type { LakehouseQueryArgs, LakehouseQueryInput, LakehouseQueryMetaView, LakehouseQueryToolValue } from './query.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-lakehouse'

/** Services required by the lakehouse tool suite. */
export const inject = ['tools', 'lakehouse', 'systemPrompt']

/** Default cooperative tool-call timeout budget (ms) for `lakehouse_tables`. */
export const DEFAULT_LAKEHOUSE_TABLES_TIMEOUT_MS = 10_000

/** Default cooperative tool-call timeout budget (ms) for `lakehouse_query`. */
export const DEFAULT_LAKEHOUSE_QUERY_TIMEOUT_MS = 30_000

/** Plugin config: which lakehouse tools to register, per-tool budgets, and the bound tenant. */
export interface Config {
  /** Register `lakehouse_tables`. Defaults to true. */
  tables?: boolean
  /** Register `lakehouse_query`. Defaults to true. */
  query?: boolean
  /**
   * The tenant every lakehouse tool operates on — the deployment-side tenant
   * binding. The model never supplies a tenant; a `tenant` argument on any
   * lakehouse tool call is rejected. Required, so a composition without a
   * binding fails config validation at load.
   */
  tenant: string
  /** Cooperative timeout budget (ms) for `lakehouse_tables`. Defaults to 10000. */
  tablesTimeoutMs?: number
  /** Cooperative timeout budget (ms) for `lakehouse_query`. Defaults to 30000. */
  queryTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  tables: z.boolean().default(true),
  query: z.boolean().default(true),
  tenant: z.string().required(),
  tablesTimeoutMs: z.number().step(1).min(1).default(DEFAULT_LAKEHOUSE_TABLES_TIMEOUT_MS),
  queryTimeoutMs: z.number().step(1).min(1).default(DEFAULT_LAKEHOUSE_QUERY_TIMEOUT_MS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/**
 * Register the enabled lakehouse tools, all bound to the deployment's
 * `tenant`. `tables`/`query` default to true; a product that wants a subset
 * disables the others in config. Each tool's cooperative timeout budget is
 * attached to the tool as `ToolDefinition.timeoutMs` for
 * `@deepseek-ai/dsh-tool-call-timeout-policy` to enforce. The tools'
 * disposers are fiber-scoped, so no manual teardown is needed.
 * @param ctx - context whose registries receive the registrations.
 * @param config - validated plugin configuration; `tenant` is required.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  if (resolved.tables) {
    applyLakehouseTablesTool(ctx, resolved.tenant, resolved.tablesTimeoutMs)
  }
  if (resolved.query) {
    applyLakehouseQueryTool(ctx, resolved.tenant, resolved.queryTimeoutMs)
  }
}
