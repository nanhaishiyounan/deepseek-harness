/**
 * Model-facing lakehouse tool suite over `ctx.lakehouseEngine`:
 * `lakehouse_list_tables` (the lakehouse catalog with live row counts),
 * `lakehouse_query` (one read-only SQL statement under the engine's
 * statement-shape guard and row/time budgets), and `lakehouse_schema`
 * (columns, types, and sample rows). The engine enforces read-only
 * semantics; this package owns schemas, prompt guidance, budgets, and
 * presentation. Enablement controls tool registration; an enabled tool stays
 * visible when the engine is unavailable and fails with a structured error
 * at execution time (the documented degraded mode).
 * @module @deepseek-ai/dsh-tool-lakehouse
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyLakehouseQueryTool } from './query.ts'
import { applyLakehouseListTablesTool } from './list-tables.ts'
import { applyLakehouseSchemaTool } from './schema.ts'

export {
  formatListTablesOutput,
  parseListTablesArgs,
  presentListTablesCall,
  presentListTablesResult,
  listTablesMetaFromResult,
  listTablesValueFromSummaries,
} from './list-tables.ts'
export type { LakehouseListTablesArgs, LakehouseListTablesToolValue, LakehouseTableEntryView } from './list-tables.ts'
export {
  formatQueryOutput,
  parseQueryArgs,
  presentQueryCall,
  presentQueryResult,
  queryMetaFromResult,
  queryValueFromOutcome,
} from './query.ts'
export type { LakehouseQueryArgs, LakehouseQueryInput, LakehouseQueryMetaView, LakehouseQueryToolValue } from './query.ts'
export {
  formatSchemaOutput,
  parseSchemaArgs,
  presentSchemaCall,
  presentSchemaResult,
  schemaMetaFromResult,
  schemaValueFromParts,
} from './schema.ts'
export type { LakehouseSchemaArgs, LakehouseSchemaInput, LakehouseSchemaMetaView, LakehouseSchemaToolValue } from './schema.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-lakehouse'

/** Services required by the lakehouse tool suite. */
export const inject = ['tools', 'lakehouseEngine', 'systemPrompt']

/** Default cooperative tool-call timeout budget (ms) for `lakehouse_list_tables`. */
export const DEFAULT_LAKEHOUSE_TABLES_TIMEOUT_MS = 10_000

/** Default cooperative tool-call timeout budget (ms) for `lakehouse_query`. */
export const DEFAULT_LAKEHOUSE_QUERY_TIMEOUT_MS = 30_000

/** Default cooperative tool-call timeout budget (ms) for `lakehouse_schema`. */
export const DEFAULT_LAKEHOUSE_SCHEMA_TIMEOUT_MS = 15_000

/** Plugin config: which lakehouse tools to register and per-tool budgets. */
export interface Config {
  /** Register `lakehouse_list_tables`. Defaults to true. */
  readonly listTables?: boolean
  /** Register `lakehouse_query`. Defaults to true. */
  readonly query?: boolean
  /** Register `lakehouse_schema`. Defaults to true. */
  readonly schema?: boolean
  /** Cooperative timeout budget (ms) for `lakehouse_list_tables`. Defaults to 10000. */
  readonly listTablesTimeoutMs?: number
  /** Cooperative timeout budget (ms) for `lakehouse_query`. Defaults to 30000. */
  readonly queryTimeoutMs?: number
  /** Cooperative timeout budget (ms) for `lakehouse_schema`. Defaults to 15000. */
  readonly schemaTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  listTables: z.boolean().default(true),
  query: z.boolean().default(true),
  schema: z.boolean().default(true),
  listTablesTimeoutMs: z.number().step(1).min(1).default(DEFAULT_LAKEHOUSE_TABLES_TIMEOUT_MS),
  queryTimeoutMs: z.number().step(1).min(1).default(DEFAULT_LAKEHOUSE_QUERY_TIMEOUT_MS),
  schemaTimeoutMs: z.number().step(1).min(1).default(DEFAULT_LAKEHOUSE_SCHEMA_TIMEOUT_MS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/**
 * Register the enabled lakehouse tools over the lakehouse engine. Each
 * tool's cooperative timeout budget is attached to the tool as
 * `ToolDefinition.timeoutMs` for `@deepseek-ai/dsh-tool-call-timeout-policy`
 * to enforce. The tools' disposers are fiber-scoped, so no manual teardown is
 * needed.
 * @param ctx - context whose registries receive the registrations.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  if (resolved.listTables) {
    applyLakehouseListTablesTool(ctx, resolved.listTablesTimeoutMs)
  }
  if (resolved.query) {
    applyLakehouseQueryTool(ctx, resolved.queryTimeoutMs)
  }
  if (resolved.schema) {
    applyLakehouseSchemaTool(ctx, resolved.schemaTimeoutMs)
  }
}
