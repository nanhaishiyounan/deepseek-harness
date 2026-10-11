/**
 * The model-facing `kg_graph_query` tool: one read-only Cypher statement
 * over the Neo4j graph store. The store's statement-shape guard rejects
 * anything that is not a single read clause before it reaches the driver;
 * the row budget bounds the result. The rendered output keeps the markdown
 * result table, the truncation note, and the `Data source: Neo4j graph`
 * attribution line the conversation source-trail parses.
 * @module @deepseek-ai/dsh-tool-graph/graph-query
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
// Type-only: resolves `ctx.get('neo4jGraph')` to the service type.
import type {} from '@deepseek-ai/dsh-graph-neo4j'

/** Model-facing `kg_graph_query` arguments. */
export interface GraphQueryArgs {
  cypher: string
}

/** Validated `kg_graph_query` input. */
export interface GraphQueryInput {
  cypher: string
}

/** One JSON-scalar cell the result table renders. */
type Cell = null | boolean | number | string

/**
 * Validate the arguments the schema DSL cannot constrain: non-blank Cypher.
 * @param args - the schema-validated `kg_graph_query` arguments.
 * @returns the validated query input.
 */
export function parseGraphQueryArgs(args: GraphQueryArgs): GraphQueryInput {
  const cypher = args.cypher.trim()
  if (cypher.length === 0) throw new Error('kg_graph_query: cypher must be a non-empty string')
  return { cypher }
}

/** The canonical `kg_graph_query` output value. */
export interface GraphQueryToolValue {
  cypher: string
  columns: string[]
  /** Result cells: the JSON-scalar vocabulary the store normalizes to. */
  rows: Cell[][]
  row_count: number
  truncated: boolean
}

/**
 * Project the store's guarded rows into the canonical tool value. Values
 * outside the scalar vocabulary (nested objects, arrays) render as their
 * JSON text so the markdown table stays rectangular.
 * @param input - the validated query input.
 * @param rows - the store's returned rows.
 * @param cap - the row cap that marks truncation.
 * @returns the canonical tool value.
 */
export function graphQueryValueFromRows(
  input: GraphQueryInput,
  rows: readonly Record<string, unknown>[],
  cap: number,
): GraphQueryToolValue {
  const first = rows[0]
  const columns = first === undefined ? [] : Object.keys(first)
  return {
    cypher: input.cypher,
    columns,
    rows: rows.map(row => columns.map(column => cellOf(row[column]))),
    row_count: rows.length,
    truncated: rows.length >= cap,
  }
}

/** Narrow one driver value to a table cell. */
function cellOf(value: unknown): Cell {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return JSON.stringify(value)
}

/** Render one cell for the markdown table (nulls stay explicit, pipes escape). */
function cellText(value: Cell): string {
  if (value === null) return 'NULL'
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

/**
 * Format a query result as the model-facing text: the markdown result table,
 * the truncation note, the source attribution line, and the standing answer
 * guidance.
 * @param value - the canonical output value.
 * @returns the rendered result table with attribution.
 */
export function formatGraphQueryOutput(value: GraphQueryToolValue): string {
  const parts: string[] = []
  if (value.columns.length === 0) {
    parts.push('(0 rows returned)')
  } else {
    const header = `| ${value.columns.join(' | ')} |`
    const separator = `| ${value.columns.map(() => '---').join(' | ')} |`
    const body = value.rows.map(row => `| ${row.map(cellText).join(' | ')} |`)
    parts.push([header, separator, ...body].join('\n'))
  }
  if (value.truncated) {
    parts.push(`(Result truncated at ${String(value.row_count)} rows by the row cap; refine the query — filter or aggregate — for exact totals.)`)
  }
  parts.push('Data source: Neo4j graph (kg_graph_query)')
  parts.push('Answer from the rows above; name the node types and relations you traversed in your answer.')
  return parts.join('\n\n')
}

/** Presentation-ready projection of replayed query metadata. */
export interface GraphQueryMetaView {
  readonly rows: number
  readonly truncated: boolean
}

/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * @param meta - result metadata.
 * @returns the validated query meta, or `undefined`.
 */
export function graphQueryMetaFromResult(meta: unknown): GraphQueryMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { rows, truncated } = meta as Record<string, unknown>
  if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 0) return undefined
  if (typeof truncated !== 'boolean') return undefined
  return { rows, truncated }
}

/** The title shown on query cards: the leading Cypher line, capped. */
function queryTitle(cypher: string): string {
  const newline = cypher.indexOf('\n')
  const firstLine = newline === -1 ? cypher : cypher.slice(0, newline)
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine
}

/**
 * Pending-call presentation: a generic card titled by the statement's first line.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentGraphQueryCall(args: GraphQueryArgs): GenericCallView {
  const cypher = (args.cypher ?? '').trim()
  return { card: 'generic', title: cypher.length > 0 ? queryTitle(cypher) : 'kg_graph_query', kind: 'search', rawInput: cypher }
}

/**
 * Completed-call presentation: a generic card restating the row count and source.
 * @param args - the raw tool arguments.
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentGraphQueryResult(args: GraphQueryArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = graphQueryMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  const cypher = (args.cypher ?? '').trim()
  return {
    card: 'generic',
    title: cypher.length > 0 ? queryTitle(cypher) : 'kg_graph_query',
    content: [{
      type: 'text',
      text: `${String(meta.rows)} row${meta.rows === 1 ? '' : 's'}${meta.truncated ? ' (truncated)' : ''} from Neo4j graph`,
    }],
  }
}

/**
 * Register the `kg_graph_query` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyGraphQueryTool(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:kg_graph_query',
    order: 113,
    text: 'Use the kg_graph_query tool to run one read-only Cypher statement over the Neo4j graph when a question needs entity neighborhoods, multi-hop relationships, or graph counts. Nodes carry gid/name/nodeType; relationships are typed (e.g. orderedBy, orderedFrom, orderedItem, purchasedItem, MENTIONS). Only single read statements starting with MATCH/OPTIONAL MATCH/WITH/UNWIND and containing RETURN are accepted — writes (CREATE/MERGE/DELETE/SET/REMOVE/CALL) are rejected. For lakehouse table aggregates use lakehouse_query instead; for the ontology schema census use kg_ontology.',
  })

  ctx.tools.register(defineTool({
    name: 'kg_graph_query',
    description: 'Run one read-only Cypher statement over the Neo4j graph. Returns the result columns, the row set, and a truncation marker. Only single read statements are accepted (MATCH/OPTIONAL MATCH/WITH/UNWIND … RETURN).',
    parameters: {
      cypher: {
        type: 'string',
        required: true,
        description: 'One single-statement read Cypher query (MATCH ... RETURN ...).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cypher: { type: 'string', required: true },
          columns: { type: 'array', required: true, items: { type: 'string' } },
          rows: { type: 'array', required: true, items: { type: 'array', items: { type: 'json' } } },
          row_count: { type: 'number', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatGraphQueryOutput(value as GraphQueryToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as GraphQueryToolValue
        return { rows: projected.row_count, truncated: projected.truncated }
      },
    },
    timeoutMs,
    // Read-only Cypher under the store's statement guard; safe to overlap with other reads.
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = parseGraphQueryArgs(args)
      const rows = await ctx.neo4jGraph.runReadOnly(input.cypher)
      return graphQueryValueFromRows(input, rows, ctx.neo4jGraph.rowCap())
    },
    presentCall: presentGraphQueryCall,
    presentResult: presentGraphQueryResult,
  }))
}
