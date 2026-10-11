/**
 * Model-facing graph tool suite over `ctx.neo4jGraph`: `kg_graph_query`
 * (one read-only Cypher statement under the store's statement-shape guard
 * and row budget) and `kg_ontology` (the append-only ontology version
 * chain with the head document's class/relation census). The store enforces
 * read-only semantics; this package owns schemas, prompt guidance, budgets,
 * and presentation. An enabled tool stays visible when the store is
 * unavailable and fails with a structured error at execution time (the
 * documented degraded mode).
 * @module @deepseek-ai/dsh-tool-graph
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyGraphQueryTool } from './graph-query.ts'
import { applyOntologyTool } from './ontology.ts'

export {
  formatGraphQueryOutput, graphQueryMetaFromResult, graphQueryValueFromRows,
  parseGraphQueryArgs, presentGraphQueryCall, presentGraphQueryResult,
} from './graph-query.ts'
export type { GraphQueryArgs, GraphQueryInput, GraphQueryMetaView, GraphQueryToolValue } from './graph-query.ts'
export {
  formatOntologyOutput, ontologyValueFromVersions, presentOntologyCall, presentOntologyResult,
} from './ontology.ts'
export type { OntologyCensus, OntologyToolValue, OntologyVersionRow } from './ontology.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-graph'

/** Services required by the graph tool suite. */
export const inject = ['tools', 'neo4jGraph', 'systemPrompt']

/** Default cooperative tool-call timeout budget (ms) for `kg_graph_query`. */
export const DEFAULT_GRAPH_QUERY_TIMEOUT_MS = 30_000

/** Default cooperative tool-call timeout budget (ms) for `kg_ontology`. */
export const DEFAULT_ONTOLOGY_TIMEOUT_MS = 15_000

/** Plugin config: tool enablement and per-tool budgets. */
export interface Config {
  /** Register `kg_graph_query`. Defaults to true. */
  readonly query?: boolean
  /** Register `kg_ontology`. Defaults to true. */
  readonly ontology?: boolean
  /** Cooperative timeout budget (ms) for `kg_graph_query`. Defaults to 30000. */
  readonly queryTimeoutMs?: number
  /** Cooperative timeout budget (ms) for `kg_ontology`. Defaults to 15000. */
  readonly ontologyTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  query: z.boolean().default(true),
  ontology: z.boolean().default(true),
  queryTimeoutMs: z.number().step(1).min(1).default(DEFAULT_GRAPH_QUERY_TIMEOUT_MS),
  ontologyTimeoutMs: z.number().step(1).min(1).default(DEFAULT_ONTOLOGY_TIMEOUT_MS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/**
 * Register the enabled graph tools over the Neo4j graph store. Each tool's
 * cooperative timeout budget is attached to the tool as
 * `ToolDefinition.timeoutMs` for `@deepseek-ai/dsh-tool-call-timeout-policy`
 * to enforce. The tools' disposers are fiber-scoped, so no manual teardown
 * is needed.
 * @param ctx - context whose registries receive the registrations.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved: ResolvedConfig = {
    query: config.query ?? true,
    ontology: config.ontology ?? true,
    queryTimeoutMs: config.queryTimeoutMs ?? DEFAULT_GRAPH_QUERY_TIMEOUT_MS,
    ontologyTimeoutMs: config.ontologyTimeoutMs ?? DEFAULT_ONTOLOGY_TIMEOUT_MS,
  }
  if (resolved.query) applyGraphQueryTool(ctx, resolved.queryTimeoutMs)
  if (resolved.ontology) applyOntologyTool(ctx, resolved.ontologyTimeoutMs)
}
