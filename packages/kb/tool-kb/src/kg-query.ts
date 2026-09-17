/**
 * The model-facing `kg_query` tool: one natural-language phrase in, one
 * structured subgraph walk out. The phrase compiles through the SAME
 * template-plus-slot compiler the apiproxy `kg.query` RPC serves (moved to
 * `@deepseek-ai/dsh-kb-graph/kg-nl`; one compiler, zero drift), then executes
 * as a `kg_subgraph`-shaped walk — name→seed resolution, closed-set relation
 * filter, entity-aggregated YAML. A phrase no template matches is an explicit
 * miss that names the supported shapes and points at the kg_schema +
 * kg_subgraph fallback, never a guessed walk.
 * @module @deepseek-ai/dsh-tool-kb/kg-query
 */

import type { Context } from '@deepseek-ai/cordis'
import { compileKgQuery, KG_QUERY_EXAMPLES } from '@deepseek-ai/dsh-kb-graph'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import { formatKgSubgraphYaml } from './kg.ts'

/** Model-facing `kg_query` arguments. */
export interface KgQueryArgs {
  /** The natural-language phrase, for example「宏发食品供货的所有产品」. */
  phrase: string
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  tenant?: string
}

/** The canonical `kg_query` output value. */
export interface KgQueryToolValue {
  /** The matched template's stable id. */
  template: string
  /** What the compiled walk reads as, for the transcript. */
  restated: string
  /** The entity-aggregated subgraph YAML (kg_subgraph's own encoding). */
  yaml: string
  /** Resolved seed node ids. */
  seeds_resolved: string[]
  /** Names that matched no graph entity, when any. */
  unresolved_note?: string
  hops: number
  relation_types?: string[]
  node_count: number
  edge_count: number
  truncated: boolean
}

/**
 * Validate what the schema DSL cannot: a non-blank phrase and no
 * model-supplied `tenant`.
 * @param args - the schema-validated `kg_query` arguments.
 * @returns the trimmed phrase.
 */
export function parseKgQueryArgs(args: KgQueryArgs): string {
  if (args.tenant !== undefined) {
    throw new Error('kg_query: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  const phrase = args.phrase.trim()
  if (phrase.length === 0) throw new Error('kg_query: phrase must state one supported question shape')
  return phrase
}

/** Format the miss the model reads: the supported shapes plus the fallback. */
function unsupportedMessage(): string {
  return `kg_query: no template matches this phrase; supported shapes: ${KG_QUERY_EXAMPLES.join(' / ')} — fall back to kg_schema + kg_subgraph for anything else`
}

/**
 * Pending-call presentation: a generic search card titled by the phrase.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentKgQueryCall(args: KgQueryArgs): GenericCallView {
  return { card: 'generic', title: 'kg_query', kind: 'search', rawInput: args.phrase.trim() || 'kg_query' }
}

/** Presentation-ready projection of replayed kg_query metadata. */
interface KgQueryMetaView {
  readonly template: string
  readonly hops: number
  readonly nodes: number
}

/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * @param meta - result metadata.
 * @returns the validated meta, or `undefined`.
 */
function kgQueryMetaFromResult(meta: unknown): KgQueryMetaView | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const { template, hops, nodes } = meta as Record<string, unknown>
  if (typeof template !== 'string' || template.length === 0) return undefined
  if (typeof hops !== 'number' || !Number.isInteger(hops) || hops < 0) return undefined
  if (typeof nodes !== 'number' || !Number.isInteger(nodes) || nodes < 0) return undefined
  return { template, hops, nodes }
}

/**
 * Completed-call presentation: a generic card naming the template and counts.
 * @param _args - the raw tool arguments.
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentKgQueryResult(_args: KgQueryArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = kgQueryMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'generic',
    title: 'kg_query',
    content: [{ type: 'text', text: `template ${meta.template} · ${meta.hops} hops · ${meta.nodes} nodes` }],
  }
}

/**
 * Register the `kg_query` tool and its system-prompt guidance, scoped to the
 * deployment's bound tenant.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param tenant - the deployment-side tenant binding; every walk runs within it.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyKgQueryTool(ctx: Context, tenant: string, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:kg_query',
    order: 112,
    text: 'Use kg_query to ask the knowledge graph one templated Chinese phrase — supported shapes include 「X的供货链」「X的订单」「含Y的产品」「X供货的所有产品」「X生产的产品」「X使用的原料」「X的合规信息」「X相关的N跳关系」「X和Y的关系」. A miss names the supported shapes; for anything freer, browse kg_schema and walk kg_subgraph yourself.',
  })

  ctx.tools.register(defineTool({
    name: 'kg_query',
    description: 'Ask the knowledge graph one templated Chinese phrase (e.g. 「宏发食品供货的所有产品」) and get the walked subgraph as entity-aggregated YAML. Supported shapes: X的供货链 / X的订单 / 含Y的产品 / X供货(供应)的所有产品 / X生产的产品 / X使用的原料 / X的合规信息 / X相关的1-2跳关系 / X和Y的关系. For other question shapes use kg_schema + kg_subgraph.',
    parameters: {
      phrase: {
        type: 'string',
        required: true,
        description: 'One supported question phrase, for example 「张红喜的供货链」.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          template: { type: 'string', required: true },
          restated: { type: 'string', required: true },
          yaml: { type: 'string', required: true },
          seeds_resolved: { type: 'array', required: true, items: { type: 'string' } },
          unresolved_note: { type: 'string' },
          hops: { type: 'number', required: true },
          relation_types: { type: 'array', items: { type: 'string' } },
          node_count: { type: 'number', required: true },
          edge_count: { type: 'number', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.yaml }],
      presentationMeta: (_args, value) => {
        return {
          template: value.template,
          hops: value.hops,
          nodes: value.node_count,
          edges: value.edge_count,
          truncated: value.truncated,
        }
      },
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args) {
      const graph = ctx.get('kbGraph')
      if (graph === undefined) {
        throw new Error('kg_query: no knowledge-graph service is composed; add the dsh-kb-graph seam and a store provider')
      }
      const phrase = parseKgQueryArgs(args)
      const plan = compileKgQuery(phrase, {
        relationIds: graph.listRelations().map(relation => String(relation.id)),
      })
      if (plan === undefined) throw new Error(unsupportedMessage())
      const resolved: string[] = []
      const missing: string[] = []
      for (const seed of plan.seeds) {
        const [hit] = await graph.searchNodes(tenant, seed, undefined, 1)
        if (hit === undefined) missing.push(seed)
        else resolved.push(hit.id)
      }
      if (resolved.length === 0) {
        throw new Error(`kg_query: no graph entity matches any seed (${plan.seeds.join(', ')}); try a more exact name, or kg_schema + kg_subgraph`)
      }
      const subgraph = await graph.subgraph(tenant, resolved, plan.hops, { maxNodes: 200 })
      return {
        template: plan.templateId,
        restated: `${plan.seeds.join(' + ')} · ${String(plan.hops)} hops${plan.relationTypes === undefined ? '' : ` · ${plan.relationTypes.join('+')}`}`,
        yaml: formatKgSubgraphYaml(subgraph, plan.relationTypes),
        seeds_resolved: resolved,
        ...(missing.length === 0 ? {} : { unresolved_note: `unresolved seeds: ${missing.join(', ')}` }),
        hops: plan.hops,
        ...(plan.relationTypes === undefined ? {} : { relation_types: [...plan.relationTypes] }),
        node_count: subgraph.nodes.length,
        edge_count: subgraph.edges.length,
        truncated: subgraph.truncated,
      } satisfies KgQueryToolValue
    },
    presentCall: args => presentKgQueryCall(args),
    presentResult: (args, result) => presentKgQueryResult(args, result),
  }))
}
