/**
 * The model-facing `kg_ontology` tool: the append-only ontology version
 * chain stored in Neo4j, with the head document's class/relation census
 * (parsed from its JSON-LD payload) so the model can cite the live schema
 * before planning graph queries.
 * @module @deepseek-ai/dsh-tool-graph/ontology
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { OntologyVersionMeta } from '@deepseek-ai/dsh-graph-neo4j'
// Type-only: resolves `ctx.get('neo4jGraph')` to the service type.
import type {} from '@deepseek-ai/dsh-graph-neo4j'

/** One version row as the tool value carries it. */
export interface OntologyVersionRow {
  id: string
  version: number
  name: string
  source: string
  created_at: string
  prev?: string
}

/** The head document's census. */
export interface OntologyCensus {
  classes: string[]
  class_count: number
  relations: string[]
  relation_count: number
}

/** The canonical `kg_ontology` output value. */
export interface OntologyToolValue {
  versions: OntologyVersionRow[]
  /** The head document's census; absent when no parseable document is stored. */
  head?: OntologyCensus
}

/**
 * Project the store's version chain into the canonical tool value, parsing
 * the head's JSON-LD payload for the census.
 * @param versions - the store's version chain (newest first).
 * @param headDoc - the head's stored JSON-LD document when present.
 * @returns the canonical tool value.
 */
export function ontologyValueFromVersions(
  versions: readonly OntologyVersionMeta[],
  headDoc: unknown,
): OntologyToolValue {
  const census = censusOf(headDoc)
  return {
    versions: versions.map(entry => ({
      id: entry.id,
      version: entry.version,
      name: entry.name,
      source: entry.source,
      created_at: entry.createdAt,
      ...(entry.prev === undefined ? {} : { prev: entry.prev }),
    })),
    ...(census === undefined ? {} : { head: census }),
  }
}

/**
 * Parse the census out of one JSON-LD document (class and relation ids).
 * @param doc - the stored document.
 * @returns the census, or undefined when the document is not shaped like one.
 */
function censusOf(doc: unknown): OntologyCensus | undefined {
  if (doc === null || typeof doc !== 'object') return undefined
  const graph = (doc as { '@graph'?: unknown })['@graph']
  if (!Array.isArray(graph)) return undefined
  const classes: string[] = []
  const relations: string[] = []
  for (const node of graph) {
    if (node === null || typeof node !== 'object') continue
    const type = (node as { '@type'?: unknown })['@type']
    const id = (node as { '@id'?: unknown })['@id']
    if (typeof id !== 'string') continue
    const local = id.slice(id.lastIndexOf('#') + 1)
    if (type === 'rdfs:Class' && local.startsWith('Class_')) classes.push(local.slice('Class_'.length))
    if (type === 'owl:ObjectProperty' && local.startsWith('Relation_')) relations.push(local.slice('Relation_'.length))
  }
  if (classes.length === 0 && relations.length === 0) return undefined
  return { classes: classes.sort(), class_count: classes.length, relations: relations.sort(), relation_count: relations.length }
}

/**
 * Format the tool value as the model-facing text.
 * @param value - the canonical output value.
 * @returns the rendered version chain and census.
 */
export function formatOntologyOutput(value: OntologyToolValue): string {
  const parts: string[] = []
  if (value.versions.length === 0) {
    parts.push('(no ontology version stored yet)')
  } else {
    const header = '| version | name | source | created_at | prev |'
    const separator = '| --- | --- | --- | --- | --- |'
    const body = value.versions.map(entry =>
      `| ${String(entry.version)} | ${entry.name.replaceAll('|', '\\|')} | ${entry.source} | ${entry.created_at} | ${entry.prev ?? '-'} |`)
    parts.push([header, separator, ...body].join('\n'))
    if (value.head !== undefined) {
      parts.push(`Head schema census: ${String(value.head.class_count)} classes (${value.head.classes.join(', ')}); ${String(value.head.relation_count)} relations (${value.head.relations.join(', ')}).`)
    }
  }
  parts.push('Data source: Neo4j graph ontology version chain (kg_ontology)')
  return parts.join('\n\n')
}

/**
 * Pending-call presentation: a generic card.
 * @returns the generic card view.
 */
export function presentOntologyCall(): GenericCallView {
  return { card: 'generic', title: 'kg_ontology', kind: 'search', rawInput: '' }
}

/**
 * Completed-call presentation: a generic card restating the version count.
 * @param _args - the raw tool arguments (unused).
 * @param result - the final tool result; `meta` carries the version count.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentOntologyResult(_args: unknown, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = result.meta
  if (typeof meta !== 'object' || meta === null) return undefined
  const versions = (meta as { versions?: unknown }).versions
  if (typeof versions !== 'number') return undefined
  return {
    card: 'generic',
    title: 'kg_ontology',
    content: [{ type: 'text', text: `${String(versions)} ontology version${versions === 1 ? '' : 's'} stored` }],
  }
}

/**
 * Register the `kg_ontology` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyOntologyTool(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:kg_ontology',
    order: 114,
    text: 'Use the kg_ontology tool to read the stored ontology version chain and the head document\'s class/relation census before planning kg_graph_query traversals. Ontology versions are append-only (LLM induction drafts pass the SHACL gate before storage); the census lists the legal class ids and relation ids.',
  })

  ctx.tools.register(defineTool({
    name: 'kg_ontology',
    description: 'Read the Neo4j-stored ontology version chain plus the head document\'s class/relation census. No arguments.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          versions: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                version: { type: 'number', required: true },
                name: { type: 'string', required: true },
                source: { type: 'string', required: true },
                created_at: { type: 'string', required: true },
                prev: { type: 'string' },
              },
            },
          },
          head: {
            type: 'object',
            additionalProperties: false,
            properties: {
              classes: { type: 'array', required: true, items: { type: 'string' } },
              class_count: { type: 'number', required: true },
              relations: { type: 'array', required: true, items: { type: 'string' } },
              relation_count: { type: 'number', required: true },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatOntologyOutput(value as OntologyToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as OntologyToolValue
        return { versions: projected.versions.length }
      },
    },
    timeoutMs,
    // A pure read over the version chain; safe to overlap with other reads.
    isConcurrencySafe: () => true,
    async execute() {
      const versions = await ctx.neo4jGraph.listOntologyVersions()
      const head = versions[0]
      const headDoc = head === undefined ? undefined : await ctx.neo4jGraph.getOntologyVersion(head.id)
      return ontologyValueFromVersions(versions, headDoc)
    },
    presentCall: presentOntologyCall,
    presentResult: presentOntologyResult,
  }))
}
