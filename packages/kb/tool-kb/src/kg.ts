/**
 * The model-facing `kg_schema` and `kg_subgraph` tools over the
 * knowledge-graph seam's property-graph v2 face (`ctx.kbGraph`, optional
 * like the web service): schema browsing over the runtime ontology registry
 * and fixed k-hop subgraph reads serialized as entity-aggregated YAML — the
 * empirically best-accuracy encoding, with free-form graph-query generation
 * deliberately absent. Seeds resolve by name through the store's node search
 * (aliases included); the tenant is a deployment-side binding the model
 * never supplies. Without the seam (or a v2 store) both tools stay visible
 * and fail with a structured error at execution time — the store-availability
 * convention.
 * @module @deepseek-ai/dsh-tool-kb/kg
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
// Side-effect type import: resolves `ctx.get('kbGraph')` to the service type.
import type {} from '@deepseek-ai/dsh-kb-graph'
import { builtinOntology, ONTOLOGY_VERSION } from '@deepseek-ai/dsh-kb-graph'
import type { KgNodeTypeId, KgSubgraph } from '@deepseek-ai/dsh-kb-graph'

/** Model-facing `kg_schema` arguments. */
export interface KgSchemaArgs {
  layer?: 'top' | 'domain'
}

/** Model-facing `kg_subgraph` arguments. */
export interface KgSubgraphArgs {
  seeds: string[]
  hops?: number
  max_nodes?: number
  relation_types?: string[]
}

/** One node-type row in the `kg_schema` output. */
export interface KgSchemaTypeView {
  id: string
  label: string
  layer: string
  extends?: string
  status: string
  natural_key?: string
  props: string[]
}

/** One relation row in the `kg_schema` output. */
export interface KgSchemaRelationView {
  id: string
  label: string
  kind: string
  directions: string[]
}

/** The canonical `kg_schema` output value. */
export interface KgSchemaToolValue {
  /** The built-in ontology's semver (the TS seed is the source of truth). */
  ontology_version: string
  layer?: 'top' | 'domain'
  types: KgSchemaTypeView[]
  relations: KgSchemaRelationView[]
}

/** One registry node type as the schema view reads it. */
interface FaceNodeType {
  readonly id: KgNodeTypeId
  readonly label: string
  readonly layer: 'top' | 'domain'
  readonly extends?: KgNodeTypeId
  readonly props: readonly { key: string }[]
  readonly naturalKey?: string
  readonly status: string
}

/** One registry relation as the schema view reads it. */
interface FaceRelation {
  readonly id: { toString(): string }
  readonly label: string
  readonly kind: string
  readonly constraints: readonly { domain: KgNodeTypeId; range: KgNodeTypeId }[]
}

/** The registry face {@link kgOntologyViews} reads: structural, so any registry satisfies it. */
interface OntologyRegistryFace {
  listNodeTypes(layer?: 'top' | 'domain'): readonly FaceNodeType[]
  listRelations(): readonly FaceRelation[]
}

/**
 * Project the registry (or the built-in seed when the seam is absent) onto
 * the schema-browsing views.
 * @param registry - the runtime registry face, when composed.
 * @returns the type and relation views.
 */
export function kgOntologyViews(
  registry: OntologyRegistryFace | undefined,
): { ontologyVersion: string; types: KgSchemaTypeView[]; relations: KgSchemaRelationView[] } {
  const seed = builtinOntology()
  const nodeTypes = registry === undefined ? seed.nodeTypes : registry.listNodeTypes()
  const relations = registry === undefined ? seed.relations : registry.listRelations()
  return {
    ontologyVersion: ONTOLOGY_VERSION,
    types: nodeTypes.map(type => ({
      id: String(type.id),
      label: type.label,
      layer: type.layer,
      ...(type.extends === undefined ? {} : { extends: String(type.extends) }),
      status: type.status,
      ...(type.naturalKey === undefined ? {} : { natural_key: type.naturalKey }),
      props: type.props.map(prop => prop.key),
    })),
    relations: relations.map(relation => ({
      id: String(relation.id),
      label: relation.label,
      kind: relation.kind,
      directions: relation.constraints.map(pair => `${String(pair.domain)}→${String(pair.range)}`),
    })),
  }
}

/** Quote one scalar for YAML output (JSON string syntax is valid YAML). */
function yaml(text: string): string {
  return JSON.stringify(text)
}

/**
 * Render the `kg_schema` value as the model-facing YAML.
 * @param value - the tool's canonical output value.
 * @returns the rendered schema listing.
 */
export function formatKgSchemaOutput(value: KgSchemaToolValue): string {
  const lines: string[] = [`ontology_version: ${value.ontology_version}`, 'entity_types:']
  for (const type of value.types) {
    lines.push(`  - id: ${yaml(type.id)} | label: ${yaml(type.label)} | layer: ${type.layer}${type.extends === undefined ? '' : ` | extends: ${type.extends}`}${type.status === 'active' ? '' : ` | status: ${type.status}`}${type.natural_key === undefined ? '' : ` | natural_key: ${type.natural_key}`}${type.props.length === 0 ? '' : ` | props: ${type.props.join(', ')}`}`)
  }
  lines.push('relations:')
  for (const relation of value.relations) {
    lines.push(`  - id: ${yaml(relation.id)} | label: ${yaml(relation.label)} | kind: ${relation.kind}${relation.directions.length === 0 ? ' | 任意方向' : ` | ${relation.directions.join(' / ')}`}`)
  }
  return lines.join('\n')
}

/** One aggregated entity row in the subgraph YAML. */
interface AggregatedEntity {
  readonly id: string
  readonly type: string
  readonly name: string
  readonly depth: number
  readonly relations: Map<string, string[]>
}

/**
 * Serialize one subgraph as entity-aggregated YAML (per node, its relations
 * grouped by predicate with neighbor names) plus the truncation signal and
 * the provenance source list.
 * @param subgraph - the k-hop read.
 * @param relationFilter - when set, only these relation ids render.
 * @param sourceCap - maximum provenance entries listed; default 20.
 * @returns the YAML text.
 */
export function formatKgSubgraphYaml(subgraph: KgSubgraph, relationFilter?: readonly string[], sourceCap = 20): string {
  const nodes = new Map(subgraph.nodes.map(node => [node.id, node]))
  const allowed = relationFilter === undefined ? undefined : new Set(relationFilter)
  const aggregated = new Map<string, AggregatedEntity>()
  for (const node of subgraph.nodes) {
    aggregated.set(node.id, {
      id: node.id, type: String(node.type), name: node.name, depth: node.depth,
      relations: new Map<string, string[]>(),
    })
  }
  for (const edge of subgraph.edges) {
    const relation = String(edge.relation)
    if (allowed !== undefined && !allowed.has(relation)) continue
    const forward = aggregated.get(edge.srcId)
    const neighbor = nodes.get(edge.dstId)
    if (forward !== undefined && neighbor !== undefined) {
      const bucket = forward.relations.get(relation) ?? []
      bucket.push(neighbor.name)
      forward.relations.set(relation, bucket)
    }
  }
  const lines: string[] = ['entities:']
  for (const entity of [...aggregated.values()].sort((left, right) => left.depth - right.depth || left.name.localeCompare(right.name))) {
    lines.push(`  - id: ${yaml(entity.id)} | type: ${entity.type} | name: ${yaml(entity.name)} | depth: ${String(entity.depth)}`)
    for (const [relation, names] of entity.relations) {
      lines.push(`      ${relation}: ${names.map(yaml).join(', ')}`)
    }
  }
  const sources = [...new Set(subgraph.edges.map(edge => `${edge.provenance.sourceSystem}:${edge.provenance.sourceId}`))]
  lines.push(`sources: ${sources.slice(0, sourceCap).map(yaml).join(', ')}${sources.length > sourceCap ? ` (+${String(sources.length - sourceCap)} more)` : ''}`)
  lines.push(`truncated: ${subgraph.truncated ? 'true' : 'false'}${subgraph.truncated ? '  # 达到节点/边预算，可缩小 hops 或换更具体的 seeds' : ''}`)
  return lines.join('\n')
}

/** The canonical `kg_subgraph` output value. */
export interface KgSubgraphToolValue {
  yaml: string
  seeds_resolved: string[]
  /** Seeds that resolved to no graph entity, when any. */
  unresolved_note?: string
  hops: number
  node_count: number
  edge_count: number
  truncated: boolean
}

/**
 * Pending-call presentation: a generic card titled by the action.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentKgCall(args: KgSchemaArgs | KgSubgraphArgs): GenericCallView {
  return { card: 'generic', title: 'seeds' in args ? 'kg_subgraph' : 'kg_schema', kind: 'search', rawInput: 'seeds' in args ? args.seeds.join(', ') : 'schema' }
}

/**
 * Completed-call presentation: a generic card restating the counts.
 * @param result - the final model-facing tool result.
 * @returns the generic card view, or `undefined` on failure.
 */
export function presentKgResult(result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = result.meta as
    | { types?: number; relations?: number; nodeCount?: number; edgeCount?: number; truncated?: boolean }
    | undefined
  if (meta?.types !== undefined) {
    return {
      card: 'generic',
      title: 'kg_schema',
      content: [{ type: 'text', text: `${String(meta.types)} types, ${String(meta.relations ?? 0)} relations` }],
    }
  }
  if (meta?.nodeCount === undefined) return undefined
  return {
    card: 'generic',
    title: 'kg_subgraph',
    content: [{ type: 'text', text: `${String(meta.nodeCount)} nodes, ${String(meta.edgeCount ?? 0)} edges${meta.truncated === true ? ' (truncated)' : ''}` }],
  }
}

/**
 * Register the kg tools and their system-prompt guidance, scoped to the
 * deployment's bound tenant. Both tools answer from the graph's registry and
 * k-hop walk — no free-form query generation exists to misuse.
 * @param ctx - context whose registries receive the registrations; execution uses
 *   its optional `kbGraph` service.
 * @param tenant - the deployment-side tenant binding; every read runs within it.
 * @param schemaEnabled - whether `kg_schema` registers.
 * @param subgraphEnabled - whether `kg_subgraph` registers.
 * @param schemaTimeoutMs - cooperative budget for `kg_schema`.
 * @param subgraphTimeoutMs - cooperative budget for `kg_subgraph`.
 */
export function applyKgTools(
  ctx: Context,
  tenant: string,
  schemaEnabled: boolean,
  subgraphEnabled: boolean,
  schemaTimeoutMs: number,
  subgraphTimeoutMs: number,
): void {
  ctx.systemPrompt.section({
    name: 'tool:kg',
    order: 112,
    text: 'Use kg_schema to browse the knowledge graph ontology (entity types and relation directions) and kg_subgraph to read the k-hop neighborhood of named entities (who supplies whom, which orders exist, compliance relations). Route entity-relation questions to kg_subgraph, document-passage questions to kb_search, and numeric aggregation to lakehouse_query.',
  })

  if (schemaEnabled) {
    ctx.tools.register(defineTool({
      name: 'kg_schema',
      description: 'Browse the knowledge-graph ontology: entity types (with labels, layers, natural keys, property keys) and relations (with their legal subject→object directions). Use it before kg_subgraph when unsure what the graph contains.',
      parameters: {
        layer: {
          type: 'string',
          description: 'Optional layer filter: top (五个顶层类) or domain (业务域类型). Omitted lists everything.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ontology_version: { type: 'string', required: true },
            layer: { type: 'string' },
            types: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  label: { type: 'string', required: true },
                  layer: { type: 'string', required: true },
                  extends: { type: 'string' },
                  status: { type: 'string', required: true },
                  natural_key: { type: 'string' },
                  props: { type: 'array', required: true, items: { type: 'string' } },
                },
              },
            },
            relations: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  label: { type: 'string', required: true },
                  kind: { type: 'string', required: true },
                  directions: { type: 'array', required: true, items: { type: 'string' } },
                },
              },
            },
          },
        },
        render: (_args, value) => [{ type: 'text', text: formatKgSchemaOutput(value as KgSchemaToolValue) }],
        presentationMeta: (_args, value) => {
          const typed = value as KgSchemaToolValue
          return { types: typed.types.length, relations: typed.relations.length }
        },
      },
      timeoutMs: schemaTimeoutMs,
      isConcurrencySafe: () => true,
      execute(args) {
        const graph = ctx.get('kbGraph')
        const layer = (args as KgSchemaArgs).layer
        const views = kgOntologyViews(graph)
        const filtered = layer === 'top' || layer === 'domain'
          ? views.types.filter(type => type.layer === layer)
          : views.types
        return Promise.resolve({
          ontology_version: views.ontologyVersion,
          ...(layer === undefined ? {} : { layer }),
          types: filtered,
          relations: views.relations,
        } satisfies KgSchemaToolValue)
      },
      presentCall: args => presentKgCall(args as KgSchemaArgs),
      presentResult: (_args, result) => presentKgResult(result),
    }))
  }

  if (!subgraphEnabled) return
  ctx.tools.register(defineTool({
    name: 'kg_subgraph',
    description: 'Read the k-hop neighborhood of named entities in the knowledge graph (default 2 hops, up to 3, ≤200 nodes). Seeds resolve by entity name or alias; the answer lists each entity with its relations and the provenance sources. For "谁给谁供货 / 有哪些订单 / 合规关系" questions use this, not SQL.',
    parameters: {
      seeds: {
        type: 'array',
        required: true,
        description: 'Entity names or aliases to walk from (1–5), for example ["张红喜"].',
        items: { type: 'string' },
      },
      hops: {
        type: 'number',
        description: 'Maximum walk depth, 0–3; default 2. Three hops cross the corefers_with bridge between document entities and business rows.',
      },
      max_nodes: {
        type: 'number',
        description: 'Node budget, 1–200; default 200.',
      },
      relation_types: {
        type: 'array',
        description: 'Optional relation-id filter (see kg_schema).',
        items: { type: 'string' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          yaml: { type: 'string', required: true },
          seeds_resolved: { type: 'array', required: true, items: { type: 'string' } },
          unresolved_note: { type: 'string' },
          hops: { type: 'number', required: true },
          node_count: { type: 'number', required: true },
          edge_count: { type: 'number', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: (value).yaml }],
      presentationMeta: (_args, value) => {
        const typed = value
        return {
          seeds: typed.seeds_resolved.length,
          hops: typed.hops,
          nodeCount: typed.node_count,
          edgeCount: typed.edge_count,
          truncated: typed.truncated,
        }
      },
    },
    timeoutMs: subgraphTimeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, _exec) {
      const graph = ctx.get('kbGraph')
      if (graph === undefined) {
        throw new Error('kg_subgraph: no knowledge-graph service is composed; add the dsh-kb-graph seam and a store provider')
      }
      const typed = args
      const seeds = [...new Set(typed.seeds.map(seed => seed.trim()).filter(seed => seed.length > 0))].slice(0, 5)
      if (seeds.length === 0) throw new Error('kg_subgraph: seeds must name at least one entity')
      const hops = Math.min(Math.max(Math.floor(typed.hops ?? 2), 0), 3)
      const maxNodes = Math.min(Math.max(Math.floor(typed.max_nodes ?? 200), 1), 200)
      const resolved: string[] = []
      const missing: string[] = []
      for (const seed of seeds) {
        const [hit] = await graph.searchNodes(tenant, seed, undefined, 1)
        if (hit === undefined) missing.push(seed)
        else resolved.push(hit.id)
      }
      if (resolved.length === 0) {
        throw new Error(`kg_subgraph: no graph entity matches any seed (${seeds.join(', ')}); try kg_schema to browse types or a more exact name`)
      }
      const subgraph = await graph.subgraph(tenant, resolved, hops, { maxNodes })
      return {
        yaml: formatKgSubgraphYaml(subgraph, typed.relation_types),
        seeds_resolved: resolved,
        ...(missing.length === 0 ? {} : { unresolved_note: `unresolved seeds: ${missing.join(', ')}` }),
        hops,
        node_count: subgraph.nodes.length,
        edge_count: subgraph.edges.length,
        truncated: subgraph.truncated,
      }
    },
    presentCall: args => presentKgCall(args),
    presentResult: (_args, result) => presentKgResult(result),
  }))
}
