/**
 * The model-facing `lakehouse_query` tool: one SQL statement over the bound
 * tenant's registered lakehouse tables, with column metadata, the row set
 * (cut to the seam's `maxRows`), the truncation marker, and the source-table
 * attribution line. Execution goes through `ctx.lakehouse.query` — the
 * engine only ever sees this tenant's tables, so cross-tenant references
 * fail as unknown tables.
 * @module @deepseek-ai/dsh-tool-lakehouse/query
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { LakehouseQueryResult } from '@deepseek-ai/dsh-lakehouse'

/** Model-facing `lakehouse_query` arguments. */
export interface LakehouseQueryArgs {
  sql: string
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  tenant?: string
}

/** Validated `lakehouse_query` input. */
export interface LakehouseQueryInput {
  sql: string
}

/**
 * Validate the arguments the schema DSL cannot constrain: non-blank SQL and
 * no model-supplied `tenant`.
 * @param args - the schema-validated `lakehouse_query` arguments.
 * @returns the validated query input.
 */
export function parseQueryArgs(args: LakehouseQueryArgs): LakehouseQueryInput {
  if (args.tenant !== undefined) {
    throw new Error('lakehouse_query: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  const sql = args.sql.trim()
  if (sql.length === 0) throw new Error('lakehouse_query: sql must be a non-empty string')
  return { sql }
}

/** The canonical `lakehouse_query` output value. */
export interface LakehouseQueryToolValue {
  sql: string
  /** Registered tables whose names appear in the SQL (the attribution line). */
  tables_used: string[]
  columns: Array<{ name: string; type: string }>
  /** Result cells: the JSON-scalar vocabulary the engine normalizes to. */
  rows: (null | boolean | number | string)[][]
  row_count: number
  truncated: boolean
}

/**
 * Project a seam query outcome into the canonical tool value, attributing the
 * statement to the registered tables it names.
 * @param input - the validated query input.
 * @param result - the seam's query outcome.
 * @param registeredTables - the tenant's registered table names, for attribution.
 * @returns the canonical tool value.
 */
export function queryValueFromResult(
  input: LakehouseQueryInput,
  result: LakehouseQueryResult,
  registeredTables: readonly string[],
): LakehouseQueryToolValue {
  return {
    sql: input.sql,
    tables_used: registeredTables.filter(name => sqlMentionsTable(input.sql, name)),
    columns: result.columns.map(column => ({ name: column.name, type: column.sqlType })),
    rows: result.rows.map(row => [...row] as (null | boolean | number | string)[]),
    row_count: result.rows.length,
    truncated: result.truncated,
  }
}

/** Escape one name for a word-boundary regex (identifiers are plain, but stay safe). */
function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** True when the SQL text references the table name as a standalone word (quoted identifiers included). */
function sqlMentionsTable(sql: string, tableName: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(tableName)}(?![A-Za-z0-9_])`, 'iu').test(sql)
}

/** Render one cell for the markdown table (nulls stay explicit, pipes escape). */
function cellText(value: null | boolean | number | string): string {
  if (value === null) return 'NULL'
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

/**
 * Format a query outcome as the model-facing text: the markdown result table,
 * the truncation note, the source-table attribution line, and the standing
 * answer guidance.
 * @param value - the tool's canonical output value.
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
    parts.push(`(Result truncated at ${value.row_count} rows by the row cap; refine the query — aggregate or filter — for exact totals.)`)
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
      text: `${meta.rows} row${meta.rows === 1 ? '' : 's'}${meta.truncated ? ' (truncated)' : ''} from ${meta.tablesUsed.length === 0 ? 'lakehouse' : meta.tablesUsed.join(', ')}`,
    }],
  }
}

/**
 * Register the `lakehouse_query` tool and its system-prompt guidance, scoped
 * to the deployment's bound tenant.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param tenant - the deployment-side tenant binding; every query runs within it.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyLakehouseQueryTool(ctx: Context, tenant: string, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:lakehouse_query',
    order: 112,
    text: 'Use the lakehouse_query tool to run one read SQL statement (SELECT) over the tenant\'s registered lakehouse tables when a question needs numbers, statistics, aggregates, or record lists. Call lakehouse_tables first to see the exact columns and types. Results are capped rows plus a truncation marker; the output names the source tables — mention them in your answer. For document passages and prose facts, use kb_search instead.',
  })

  ctx.tools.register(defineTool({
    name: 'lakehouse_query',
    description: 'Run one read SQL statement (SELECT) over the registered lakehouse tables. Returns the result columns, the row set, a truncation marker, and the source-table attribution. List tables with lakehouse_tables first.',
    parameters: {
      sql: {
        type: 'string',
        required: true,
        description: 'One single-statement read SQL query (SELECT ...).',
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
    // Read-only SQL over the tenant's tables; safe to overlap with other reads.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseQueryArgs(args)
      const registered = await ctx.lakehouse.listTables(tenant, exec.signal)
      const result = await ctx.lakehouse.query(tenant, input.sql, exec.signal)
      return queryValueFromResult(input, result, registered.map(table => table.tableName))
    },
    presentCall: presentQueryCall,
    presentResult: presentQueryResult,
  }))
}
