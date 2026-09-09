/**
 * The model-facing `kb_graph_query` and `kb_graph_add` tools over the
 * knowledge-graph seam (`ctx.kbGraph`, optional like the web service): query
 * runs neighbors / two-hop paths / entity search under the deployment's bound
 * tenant; add stores extracted triples idempotently so a scenario SKILL can
 * drive entity extraction without a built-in LLM call. The closed-set
 * validation reads the runtime ontology registry, materialized once at tool
 * registration (descriptions are pure functions of the frozen session
 * snapshot). The seam absent, both tools stay visible and fail with a
 * structured error at execution time — the store-availability convention.
 * @module @deepseek-ai/dsh-tool-kb/graph
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
// Side-effect type import: resolves `ctx.get('kbGraph')` to the service type.
import type {} from '@deepseek-ai/dsh-kb-graph'
import { builtinOntology, kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import type {
  KbGraphEntity, KbGraphStoredTriple, KbGraphTriple, KgNodeTypeId, KgRelationId,
} from '@deepseek-ai/dsh-kb-graph'

/** Model-facing `kb_graph_query` arguments. */
export interface KbGraphQueryArgs {
  action: 'neighbors' | 'paths' | 'search'
  entity_type?: string
  entity_id?: string
  target_type?: string
  target_id?: string
  query?: string
  limit?: number
}

/** Model-facing `kb_graph_add` arguments. */
export interface KbGraphAddArgs {
  triples: Array<{
    subject_type: string
    subject_id: string
    predicate: string
    object_type: string
    object_id: string
    source_path?: string
  }>
}

/**
 * One session's materialized ontology snapshot: the registry's active node
 * types and relations as plain strings, frozen at tool registration.
 */
export interface GraphOntologySnapshot {
  readonly entityTypes: readonly string[]
  readonly predicates: readonly string[]
}

/** The canonical `kb_graph_query` output value. */
export interface KbGraphQueryToolValue {
  action: 'neighbors' | 'paths' | 'search'
  triples: Array<{
    row_id: number
    subject_type: string
    subject_id: string
    predicate: string
    object_type: string
    object_id: string
    source_path?: string
  }>
  entities: Array<{ type: string; id: string }>
}

/** The canonical `kb_graph_add` output value. */
export interface KbGraphAddToolValue {
  inserted: number
  total: number
}

/** The wire triple's property rows, shared by the add parameters and the query output. */
const triplePropertyRows = {
  subject_type: { type: 'string', required: true },
  subject_id: { type: 'string', required: true },
  predicate: { type: 'string', required: true },
  object_type: { type: 'string', required: true },
  object_id: { type: 'string', required: true },
  source_path: { type: 'string' },
} as const

/** The registry face {@link graphOntologySnapshot} reads: structural, so any registry satisfies it. */
export interface GraphOntologySource {
  listNodeTypes(): readonly { readonly id: KgNodeTypeId; readonly status: string }[]
  listRelations(): readonly { readonly id: KgRelationId }[]
}

/**
 * Materialize one session's ontology snapshot: the composed registry's active
 * types and relations, or the built-in seed when the graph seam is absent
 * (the tools stay visible and refuse at execution time).
 * @param registry - the runtime registry face, when composed.
 * @returns the frozen snapshot for tool descriptions and validation.
 */
export function graphOntologySnapshot(registry: GraphOntologySource | undefined): GraphOntologySnapshot {
  if (registry === undefined) {
    const seed = builtinOntology()
    return {
      entityTypes: seed.nodeTypes.filter(type => type.status === 'active').map(type => String(type.id)),
      predicates: seed.relations.map(relation => String(relation.id)),
    }
  }
  return {
    entityTypes: registry.listNodeTypes().filter(type => type.status === 'active').map(type => String(type.id)),
    predicates: registry.listRelations().map(relation => String(relation.id)),
  }
}

/** Narrow a wire entity type to a registered id, or undefined when unknown. */
function parseEntityType(type: string | undefined, entityTypes: readonly string[]): KgNodeTypeId | undefined {
  return type !== undefined && entityTypes.includes(type) ? kgNodeTypeId(type) : undefined
}

/** Narrow a wire predicate to a registered id, or undefined when unknown. */
function parsePredicate(predicate: string, predicates: readonly string[]): KgRelationId | undefined {
  return predicates.includes(predicate) ? kgRelationId(predicate) : undefined
}

/** One stored triple as the model-facing wire row. */
function tripleRow(triple: KbGraphStoredTriple): KbGraphQueryToolValue['triples'][number] {
  return {
    row_id: triple.rowId,
    subject_type: String(triple.subject.type),
    subject_id: triple.subject.id,
    predicate: String(triple.predicate),
    object_type: String(triple.object.type),
    object_id: triple.object.id,
    ...triple.sourcePath === undefined ? {} : { source_path: triple.sourcePath },
  }
}

/**
 * Validate `kb_graph_query` arguments: every action names its required
 * fields, and every entity type is inside the session's registry snapshot.
 * @param args - the schema-validated arguments.
 * @param ontology - the frozen registry snapshot.
 * @returns the parsed query, or a string naming the first problem.
 */
export function parseGraphQueryArgs(
  args: KbGraphQueryArgs | (Omit<KbGraphQueryArgs, 'action'> & { action: string }),
  ontology: GraphOntologySnapshot,
):
  | { kind: 'neighbors'; entity: KbGraphEntity }
  | { kind: 'paths'; entity: KbGraphEntity; target: KbGraphEntity }
  | { kind: 'search'; query: string; type: KgNodeTypeId | undefined; limit: number }
  | { kind: 'invalid'; reason: string } {
  const entityType = parseEntityType(args.entity_type, ontology.entityTypes)
  if (args.action !== 'neighbors' && args.action !== 'paths' && args.action !== 'search') {
    return { kind: 'invalid', reason: 'kb_graph_query: action must be one of neighbors, paths, search' }
  }
  if (args.action === 'search') {
    const query = args.query?.trim() ?? ''
    if (query.length === 0) return { kind: 'invalid', reason: 'kb_graph_query: search requires a non-empty query' }
    const type = parseEntityType(args.entity_type, ontology.entityTypes)
    if (args.entity_type !== undefined && type === undefined) {
      return { kind: 'invalid', reason: `kb_graph_query: entity_type must be one of ${ontology.entityTypes.join(', ')}` }
    }
    return { kind: 'search', query, type, limit: Math.min(Math.max(Math.floor(args.limit ?? 10), 1), 20) }
  }
  if (entityType === undefined || args.entity_id === undefined || args.entity_id.trim().length === 0) {
    return { kind: 'invalid', reason: `kb_graph_query: ${args.action} requires entity_type (${ontology.entityTypes.join(', ')}) and entity_id` }
  }
  const entity: KbGraphEntity = { type: entityType, id: args.entity_id.trim() }
  if (args.action === 'neighbors') return { kind: 'neighbors', entity }
  const targetType = parseEntityType(args.target_type, ontology.entityTypes)
  if (targetType === undefined || args.target_id === undefined || args.target_id.trim().length === 0) {
    return { kind: 'invalid', reason: `kb_graph_query: paths requires target_type (${ontology.entityTypes.join(', ')}) and target_id` }
  }
  return { kind: 'paths', entity, target: { type: targetType, id: args.target_id.trim() } }
}

/**
 * Validate `kb_graph_add` arguments: every triple names registered entity
 * types and a registered predicate.
 * @param args - the schema-validated arguments.
 * @param ontology - the frozen registry snapshot.
 * @returns the parsed triples, or a string naming the first problem.
 */
export function parseGraphAddArgs(
  args: KbGraphAddArgs,
  ontology: GraphOntologySnapshot,
): { triples: KbGraphTriple[] } | { invalid: string } {
  if (args.triples.length === 0) return { invalid: 'kb_graph_add: triples must not be empty' }
  if (args.triples.length > 50) return { invalid: 'kb_graph_add: at most 50 triples per call' }
  const triples: KbGraphTriple[] = []
  for (const row of args.triples) {
    const subjectType = parseEntityType(row.subject_type, ontology.entityTypes)
    const objectType = parseEntityType(row.object_type, ontology.entityTypes)
    const predicate = parsePredicate(row.predicate, ontology.predicates)
    if (subjectType === undefined || objectType === undefined || predicate === undefined) {
      return {
        invalid: `kb_graph_add: entity types must be one of ${ontology.entityTypes.join(', ')} and predicate one of ${ontology.predicates.join(', ')}`,
      }
    }
    if (row.subject_id.trim().length === 0 || row.object_id.trim().length === 0) {
      return { invalid: 'kb_graph_add: subject_id and object_id must be non-empty' }
    }
    triples.push({
      subject: { type: subjectType, id: row.subject_id.trim() },
      predicate,
      object: { type: objectType, id: row.object_id.trim() },
      ...row.source_path === undefined || row.source_path.trim().length === 0 ? {} : { sourcePath: row.source_path.trim() },
    })
  }
  return { triples }
}

/**
 * Format a graph query outcome as the model-facing text.
 * @param value - the tool's canonical output value.
 * @returns the rendered triple list or entity list.
 */
export function formatGraphQueryOutput(value: KbGraphQueryToolValue): string {
  if (value.action === 'search') {
    if (value.entities.length === 0) return 'No matching entities. Try a different substring or entity type.'
    return value.entities.map((entity, index) => `[${index + 1}] ${entity.type}:${entity.id}`).join('\n')
  }
  if (value.triples.length === 0) return 'No triples found. Use kb_graph_add to store extracted facts first.'
  return value.triples.map((triple, index) =>
    `[${index + 1}] ${triple.subject_type}:${triple.subject_id} —${triple.predicate}→ ${triple.object_type}:${triple.object_id}${triple.source_path === undefined ? '' : ` (source: ${triple.source_path})`}`,
  ).join('\n')
}

/**
 * Pending-call presentation: a generic card titled by the action.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentGraphQueryCall(args: KbGraphQueryArgs): GenericCallView {
  return { card: 'generic', title: `kb_graph_query ${args.action}`, kind: 'search', rawInput: args.action }
}

/**
 * Completed-call presentation: a generic card restating the action and counts.
 * @param _args - the raw tool arguments (unused; the meta carries the counts).
 * @param result - the final model-facing tool result.
 * @returns the generic card view, or `undefined` on failure.
 */
export function presentGraphQueryResult(_args: KbGraphQueryArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = result.meta as { action?: string; entities?: number; triples?: number } | undefined
  if (meta === undefined || meta.action === undefined) return undefined
  return {
    card: 'generic',
    title: `kb_graph_query ${meta.action}`,
    content: [{
      type: 'text',
      text: meta.action === 'search'
        ? `${String(meta.entities ?? 0)} entities`
        : `${String(meta.triples ?? 0)} triples`,
    }],
  }
}

/**
 * Register the graph tools and the graph system-prompt guidance, scoped to
 * the deployment's bound tenant. The ontology snapshot is materialized once
 * here; mid-session registry changes surface in the next session.
 * @param ctx - context whose registries receive the registrations; execution uses
 *   its optional `kbGraph` service.
 * @param tenant - the deployment-side tenant binding; every query runs within it.
 * @param queryTimeoutMs - cooperative budget for `kb_graph_query`.
 * @param addTimeoutMs - cooperative budget for `kb_graph_add`.
 */
export function applyKbGraphTools(ctx: Context, tenant: string, queryTimeoutMs: number, addTimeoutMs: number): void {
  const ontology = graphOntologySnapshot(ctx.get('kbGraph'))
  ctx.systemPrompt.section({
    name: 'tool:kb_graph',
    order: 111,
    text: `Use kb_graph_query to answer entity-relation questions over the ingested knowledge graph (entity types: ${ontology.entityTypes.join(', ')}; predicates: ${ontology.predicates.join(', ')}). Actions: neighbors (one hop around one entity), paths (two-hop path between two entities), search (entities by id substring). When a corpus names entities and relations, store them with kb_graph_add (idempotent; cite the source document in source_path).`,
  })

  ctx.tools.register(defineTool({
    name: 'kb_graph_query',
    description: `Query the knowledge graph: neighbors of one entity, a two-hop path between two entities, or entities by id substring. Entity types: ${ontology.entityTypes.join(', ')}. Predicates: ${ontology.predicates.join(', ')}.`,
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: 'One of: neighbors, paths, search.',
      },
      entity_type: {
        type: 'string',
        description: `Entity type (${ontology.entityTypes.join(', ')}); required for neighbors/paths, optional type filter for search.`,
      },
      entity_id: {
        type: 'string',
        description: 'Entity id for neighbors/paths, or the substring filter for search.',
      },
      target_type: {
        type: 'string',
        description: 'Target entity type for paths.',
      },
      target_id: {
        type: 'string',
        description: 'Target entity id for paths.',
      },
      query: {
        type: 'string',
        description: 'Id substring for the search action.',
      },
      limit: {
        type: 'number',
        description: 'Maximum entities for search (1–20).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true },
          triples: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                row_id: { type: 'number', required: true },
                ...triplePropertyRows,
              },
            },
          },
          entities: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                type: { type: 'string', required: true },
                id: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatGraphQueryOutput(value as KbGraphQueryToolValue) }],
      presentationMeta: (_args, value) => {
        const typed = value as KbGraphQueryToolValue
        return { action: typed.action, entities: typed.entities.length, triples: typed.triples.length }
      },
    },
    timeoutMs: queryTimeoutMs,
    // Graph queries do not mutate agent state.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const graph = ctx.get('kbGraph')
      if (graph === undefined) {
        throw new Error('kb_graph_query: no knowledge-graph service is composed; add the dsh-kb-graph seam and a store provider')
      }
      const parsed = parseGraphQueryArgs(args as unknown as KbGraphQueryArgs, ontology)
      if (parsed.kind === 'invalid') throw new Error(parsed.reason)
      if (parsed.kind === 'neighbors') {
        const triples = await graph.neighbors(tenant, parsed.entity, exec.signal)
        return { action: 'neighbors', triples: triples.map(tripleRow), entities: [] } satisfies KbGraphQueryToolValue
      }
      if (parsed.kind === 'paths') {
        const triples = await graph.twoHopPaths(tenant, parsed.entity, parsed.target, exec.signal)
        return { action: 'paths', triples: triples.map(tripleRow), entities: [] } satisfies KbGraphQueryToolValue
      }
      const entities = await graph.searchEntities(tenant, parsed.query, parsed.type, parsed.limit, exec.signal)
      return {
        action: 'search',
        triples: [],
        entities: entities.map(entity => ({ type: String(entity.type), id: entity.id })),
      } satisfies KbGraphQueryToolValue
    },
    presentCall: presentGraphQueryCall,
    presentResult: (args, result) => presentGraphQueryResult(args as KbGraphQueryArgs, result),
  }))

  ctx.tools.register(defineTool({
    name: 'kb_graph_add',
    description: 'Store entity-relation triples extracted from ingested documents into the knowledge graph (idempotent; up to 50 per call). Cite the source document in source_path so graph answers stay traceable.',
    parameters: {
      triples: {
        type: 'array',
        required: true,
        description: `Triples to store. Entity types: ${ontology.entityTypes.join(', ')}. Predicates: ${ontology.predicates.join(', ')}.`,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { ...triplePropertyRows },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          inserted: { type: 'number', required: true },
          total: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Stored ${String(value.inserted)} new triple(s) of ${String(value.total)} submitted (duplicates are no-ops).`,
      }],
      presentationMeta: (_args, value) => {
        return { inserted: value.inserted, total: value.total }
      },
    },
    timeoutMs: addTimeoutMs,
    async execute(args, exec) {
      const graph = ctx.get('kbGraph')
      if (graph === undefined) {
        throw new Error('kb_graph_add: no knowledge-graph service is composed; add the dsh-kb-graph seam and a store provider')
      }
      const parsed = parseGraphAddArgs(args, ontology)
      if ('invalid' in parsed) throw new Error(parsed.invalid)
      const inserted = await graph.putTriples(tenant, parsed.triples, exec.signal)
      return { inserted, total: parsed.triples.length } satisfies KbGraphAddToolValue
    },
    presentCall: (args): GenericCallView => ({
      card: 'generic',
      title: `kb_graph_add ${String(args.triples.length)} triples`,
      kind: 'edit',
      rawInput: String(args.triples.length),
    }),
    presentResult: (args, result): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = result.meta as { inserted?: number; total?: number } | undefined
      if (meta === undefined) return undefined
      return {
        card: 'generic',
        title: `kb_graph_add ${String(args.triples.length)} triples`,
        content: [{ type: 'text', text: `${String(meta.inserted ?? 0)} new / ${String(meta.total ?? 0)} submitted` }],
      }
    },
  }))
}
