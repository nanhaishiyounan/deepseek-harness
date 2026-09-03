/**
 * Model-facing `kb_search`, `kb_ingest`, and `kb_stats` tools over `ctx.kb`.
 * This package owns schemas, validation, prompt guidance, limits, and
 * presentation, never concrete store or embed providers. Enablement controls
 * tool registration; an enabled tool remains visible when its store is
 * unavailable and fails with a structured error at execution time.
 * @module @deepseek-ai/dsh-tool-kb
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyKbGraphTools } from './graph.ts'
import { applyKbIngestTool } from './ingest.ts'
import { applyKbIngestUrlTool } from './ingest-url.ts'
import { applyKbSearchTool, KB_SEARCH_MAX_RESULTS } from './search.ts'
import { applyKbStatsTool } from './stats.ts'

export {
  formatGraphQueryOutput, parseGraphAddArgs, parseGraphQueryArgs, presentGraphQueryCall, presentGraphQueryResult,
} from './graph.ts'
export type { KbGraphAddArgs, KbGraphAddToolValue, KbGraphQueryArgs, KbGraphQueryToolValue } from './graph.ts'
export { formatIngestOutput, INGEST_EXTENSIONS, parseIngestArgs, presentIngestCall, presentIngestResult } from './ingest.ts'
export type { KbIngestArgs, KbIngestInput, KbIngestToolValue } from './ingest.ts'
export { formatIngestUrlOutput, presentIngestUrlCall, presentIngestUrlResult } from './ingest-url.ts'
export type { KbIngestUrlToolValue } from './ingest-url.ts'
export { htmlToStructuredText, extractDocxText, extractPdfText } from './extract.ts'
export { assertPublicUrl, isPrivateAddress, parseIngestUrlArgs } from './url-policy.ts'
export type { KbIngestUrlArgs, KbIngestUrlInput } from './url-policy.ts'
export {
  formatSearchOutput,
  KB_SEARCH_MAX_RESULTS,
  parseSearchArgs,
  presentSearchCall,
  presentSearchResult,
  searchMetaFromResult,
  searchValueFromResult,
} from './search.ts'
export type { KbSearchArgs, KbSearchInput, KbSearchMetaView, KbSearchToolValue } from './search.ts'
export { formatStatsOutput, parseStatsArgs, presentStatsCall, presentStatsResult, statsValueFromResult } from './stats.ts'
export type { KbStatsArgs, KbStatsToolValue } from './stats.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-kb'

/** Services required by the kb tool suite. */
export const inject = ['tools', 'kb', 'fs', 'systemPrompt']

/** Default cooperative tool-call timeout budget (ms) for kb_search. */
export const DEFAULT_KB_TOOL_TIMEOUT_MS = 30_000
/** Default cooperative tool-call timeout budget (ms) for kb_ingest (embedding batches). */
export const DEFAULT_KB_INGEST_TIMEOUT_MS = 300_000
/** Default cooperative tool-call timeout budget (ms) for kb_stats. */
export const DEFAULT_KB_STATS_TIMEOUT_MS = 10_000

/** Default cooperative tool-call timeout budget (ms) for `kb_ingest_url` (fetch plus embedding batches). */
export const DEFAULT_KB_URL_INGEST_TIMEOUT_MS = 300_000

/** Default cooperative tool-call timeout budget (ms) for `kb_graph_query`. */
export const DEFAULT_KB_GRAPH_QUERY_TIMEOUT_MS = 15_000

/** Default cooperative tool-call timeout budget (ms) for `kb_graph_add`. */
export const DEFAULT_KB_GRAPH_ADD_TIMEOUT_MS = 30_000

/** Plugin config: which kb tools to register, per-tool budgets, the citation cap, and the bound tenant. */
export interface Config {
  /** Register `kb_search`. Defaults to true. */
  search?: boolean
  /** Register `kb_ingest`. Defaults to true. */
  ingest?: boolean
  /** Register `kb_ingest_url`. Defaults to true. */
  urlIngest?: boolean
  /** Register `kb_stats`. Defaults to true. */
  stats?: boolean
  /**
   * Let `kb_ingest_url` fetch private/internal-network addresses (loopback,
   * RFC1918, link-local, CGNAT, unique-local). Defaults to false — the SSRF
   * gate; fixtures and intranet deployments opt in explicitly.
   */
  allowPrivateNetworks?: boolean
  /** Upper bound on citations returned by one `kb_search` call. Defaults to 8. */
  maxResults?: number
  /**
   * The tenant every kb tool operates on — the deployment-side tenant
   * binding. The model never supplies a tenant; a `tenant` argument on any
   * kb tool call is rejected. Required, so a composition without a binding
   * fails config validation at load.
   */
  tenant: string
  /** Cooperative timeout budget (ms) for `kb_search`. Defaults to 30000. */
  searchTimeoutMs?: number
  /** Cooperative timeout budget (ms) for `kb_ingest`. Defaults to 300000. */
  ingestTimeoutMs?: number
  /** Cooperative timeout budget (ms) for `kb_stats`. Defaults to 10000. */
  statsTimeoutMs?: number
  /** Cooperative timeout budget (ms) for `kb_ingest_url`. Defaults to 300000. */
  urlIngestTimeoutMs?: number
  /** Register `kb_graph_query`/`kb_graph_add` over the optional `ctx.kbGraph` seam. Defaults to true. */
  graph?: boolean
  /** Cooperative timeout budget (ms) for `kb_graph_query`. Defaults to 15000. */
  graphQueryTimeoutMs?: number
  /** Cooperative timeout budget (ms) for `kb_graph_add`. Defaults to 30000. */
  graphAddTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  search: z.boolean().default(true),
  ingest: z.boolean().default(true),
  urlIngest: z.boolean().default(true),
  stats: z.boolean().default(true),
  allowPrivateNetworks: z.boolean().default(false),
  maxResults: z.number().step(1).min(1).default(KB_SEARCH_MAX_RESULTS),
  tenant: z.string().required(),
  searchTimeoutMs: z.number().step(1).min(1).default(DEFAULT_KB_TOOL_TIMEOUT_MS),
  ingestTimeoutMs: z.number().step(1).min(1).default(DEFAULT_KB_INGEST_TIMEOUT_MS),
  statsTimeoutMs: z.number().step(1).min(1).default(DEFAULT_KB_STATS_TIMEOUT_MS),
  urlIngestTimeoutMs: z.number().step(1).min(1).default(DEFAULT_KB_URL_INGEST_TIMEOUT_MS),
  graph: z.boolean().default(true),
  graphQueryTimeoutMs: z.number().step(1).min(1).default(DEFAULT_KB_GRAPH_QUERY_TIMEOUT_MS),
  graphAddTimeoutMs: z.number().step(1).min(1).default(DEFAULT_KB_GRAPH_ADD_TIMEOUT_MS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/**
 * Register the enabled kb tools, all bound to the deployment's `tenant`.
 * `search`/`ingest`/`stats` default to true; a product that wants a subset
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
  if (resolved.search) {
    applyKbSearchTool(ctx, resolved.maxResults, resolved.tenant, resolved.searchTimeoutMs)
  }
  if (resolved.ingest) {
    applyKbIngestTool(ctx, resolved.tenant, resolved.ingestTimeoutMs)
  }
  if (resolved.urlIngest) {
    applyKbIngestUrlTool(ctx, resolved.tenant, resolved.allowPrivateNetworks, resolved.urlIngestTimeoutMs)
  }
  if (resolved.stats) {
    applyKbStatsTool(ctx, resolved.tenant, resolved.statsTimeoutMs)
  }
  if (resolved.graph) {
    applyKbGraphTools(ctx, resolved.tenant, resolved.graphQueryTimeoutMs, resolved.graphAddTimeoutMs)
  }
}
