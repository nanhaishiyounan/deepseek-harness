/**
 * The model-facing `lakehouse_query` tool: one read-only SQL statement over
 * the lakehouse catalog (`lake.<schema>.<table>` references). The engine's
 * statement-shape guard rejects anything that is not a single read statement
 * before it reaches DuckDB; the row and time budgets bound the result. The
 * rendered output keeps the markdown result table, the truncation note, and
 * the `Data source: lakehouse table(s) …` attribution line the conversation
 * source-trail parses.
 * @module @deepseek-ai/dsh-tool-lakehouse/query
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { LakehouseQueryOutcome, LakehouseTableSummary } from '@deepseek-ai/dsh-lakehouse-engine'

/** Model-facing `lakehouse_query` arguments. */
export interface LakehouseQueryArgs {
  sql: string
}

/** Validated `lakehouse_query` input. */
export interface LakehouseQueryInput {
  sql: string
}

/**
 * Validate the arguments the schema DSL cannot constrain: non-blank SQL.
 * @param args - the schema-validated `lakehouse_query` arguments.
 * @returns the validated query input.
 */
export function parseQueryArgs(args: LakehouseQueryArgs): LakehouseQueryInput {
  const sql = args.sql.trim()
  if (sql.length === 0) throw new Error('lakehouse_query: sql must be a non-empty string')
  return { sql }
}

/** The canonical `lakehouse_query` output value. */
export interface LakehouseQueryToolValue {
  sql: string
  /** Lakehouse tables (`<schema>.<table>`) whose references appear in the SQL. */
  tables_used: string[]
  columns: Array<{ name: string; type: string }>
  /** Result cells: the JSON-scalar vocabulary the engine normalizes to. */
  rows: (null | boolean | number | string)[][]
  row_count: number
  truncated: boolean
}

/** Escape one name for a word-boundary regex (identifiers are plain, but stay safe). */
function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** True when the SQL text references `schema.table` (with or without the `lake.` prefix) as standalone words. */
function sqlMentionsTable(sql: string, schema: string, table: string): boolean {
  const qualified = `${escapeRegExp(schema)}.${escapeRegExp(table)}`
  return new RegExp(`(?<![A-Za-z0-9_])(?:lake\\.)?${qualified}(?![A-Za-z0-9_])`, 'iu').test(sql)
}

/**
 * Project an engine query outcome into the canonical tool value, attributing
 * the statement to the lakehouse tables it references.
 * @param input - the validated query input.
 * @param outcome - the engine's query outcome.
 * @param tables - the lakehouse listing, for attribution.
 * @returns the canonical tool value.
 */
export function queryValueFromOutcome(
  input: LakehouseQueryInput,
  outcome: LakehouseQueryOutcome,
  tables: readonly LakehouseTableSummary[],
): LakehouseQueryToolValue {
  return {
    sql: input.sql,
    tables_used: tables
      .filter(summary => sqlMentionsTable(input.sql, summary.schema, summary.table))
      .map(summary => `${summary.schema}.${summary.table}`),
    columns: outcome.columns.map(column => ({ name: column.name, type: column.sqlType })),
    rows: outcome.rows.map(row => [...row] as (null | boolean | number | string)[]),
    row_count: outcome.rowCount,
    truncated: outcome.truncated,
  }
}

/** Render one cell for the markdown table (nulls stay explicit, pipes escape). */
function cellText(value: null | boolean | number | string): string {
  if (value === null) return 'NULL'
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

/**
 * Format a query outcome as the model-facing text: the markdown result
 * table, the truncation note, the source-table attribution line, and the
 * standing answer guidance.
 * @param value - the canonical output value.
 * @returns the rendered result table with attribution.
 */
export function formatQueryOutput(value: LakehouseQueryToolValue): string {
  const parts: string[] = []
  const header = `| ${value.columns.map(column => column.name).join(' | ')} |`
  const separator = `| ${value.columns.map(() => '---').join(' | ')} |`
  const body = value.rows.map(row => `| ${row.map(cellText).join(' | ')} |`)
  parts.push([header, separator, ...body].join('\n'))
  if (value.row_count === 0) {
    parts.push('(0 rows returned)')
  }
  if (value.truncated) {
    parts.push(`(Result truncated at ${String(value.row_count)} rows by the row cap; refine the query — aggregate or filter — for exact totals.)`)
  }
  if (value.tables_used.length === 0) {
    parts.push('Data source: lakehouse (no registered table named by the statement)')
  } else {
    parts.push(`Data source: lakehouse table${value.tables_used.length === 1 ? '' : 's'} ${value.tables_used.join(', ')}`)
  }
  parts.push('Answer from the rows above; name the source table(s) in your answer.')
  return parts.join('\n\n')
}

/** Presentation-ready projection of replayed query metadata. */
export interface LakehouseQueryMetaView {
  readonly rows: number
  readonly truncated: boolean
  readonly tablesUsed: readonly string[]
}

/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * @param meta - result metadata.
 * @returns the validated query meta, or `undefined`.
 */
export function queryMetaFromResult(meta: unknown): LakehouseQueryMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { rows, truncated, tablesUsed } = meta as Record<string, unknown>
  if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 0) return undefined
  if (typeof truncated !== 'boolean') return undefined
  if (!Array.isArray(tablesUsed) || !tablesUsed.every(name => typeof name === 'string')) return undefined
  return { rows, truncated, tablesUsed }
}

/** The title shown on query cards: the leading SQL clause line, capped. */
function queryTitle(sql: string): string {
  const newline = sql.indexOf('\n')
  const firstLine = newline === -1 ? sql : sql.slice(0, newline)
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine
}

/**
 * Pending-call presentation: a generic card titled by the statement's first line.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentQueryCall(args: LakehouseQueryArgs): GenericCallView {
  const sql = args.sql.trim()
  return { card: 'generic', title: sql.length > 0 ? queryTitle(sql) : 'lakehouse_query', kind: 'search', rawInput: sql }
}

/**
 * Completed-call presentation: a generic card restating the row count and sources.
 * @param args - the raw tool arguments.
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentQueryResult(args: LakehouseQueryArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = queryMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  const sql = args.sql.trim()
  return {
    card: 'generic',
    title: sql.length > 0 ? queryTitle(sql) : 'lakehouse_query',
    content: [{
      type: 'text',
      text: `${String(meta.rows)} row${meta.rows === 1 ? '' : 's'}${meta.truncated ? ' (truncated)' : ''} from ${meta.tablesUsed.length === 0 ? 'lakehouse' : meta.tablesUsed.join(', ')}`,
    }],
  }
}

/**
 * Register the `lakehouse_query` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyLakehouseQueryTool(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:lakehouse_query',
    order: 112,
    text: 'Use the lakehouse_query tool to run one read SQL statement (SELECT) over the lakehouse tables when a question needs numbers, statistics, aggregates, or record lists. Reference tables exactly as lakehouse_list_tables lists them (lake.<schema>.<table>). Only single read statements are accepted — writes and data-definition statements are rejected. Results are capped rows plus a truncation marker; the output names the source tables — mention them in your answer. For document passages and prose facts, use kb_search instead.',
  })

  ctx.tools.register(defineTool({
    name: 'lakehouse_query',
    description: 'Run one read SQL statement (SELECT) over the lakehouse tables. Returns the result columns, the row set, a truncation marker, and the source-table attribution. List tables and their reference form with lakehouse_list_tables first; only single read statements are accepted.',
    parameters: {
      sql: {
        type: 'string',
        required: true,
        description: 'One single-statement read SQL query (SELECT ...), referencing tables as lake.<schema>.<table>.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sql: { type: 'string', required: true },
          tables_used: { type: 'array', required: true, items: { type: 'string' } },
          columns: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                type: { type: 'string', required: true },
              },
            },
          },
          rows: { type: 'array', required: true, items: { type: 'array', items: { type: 'json' } } },
          row_count: { type: 'number', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatQueryOutput(value as LakehouseQueryToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as LakehouseQueryToolValue
        return { rows: projected.row_count, truncated: projected.truncated, tablesUsed: projected.tables_used }
      },
    },
    timeoutMs,
    // Read-only SQL under the engine's statement guard; safe to overlap with other reads.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseQueryArgs(args)
      const tables = await ctx.lakehouseEngine.listTables(exec.signal)
      const outcome = await ctx.lakehouseEngine.query(input.sql, undefined, exec.signal)
      return queryValueFromOutcome(input, outcome, tables)
    },
    presentCall: presentQueryCall,
    presentResult: presentQueryResult,
  }))
}
