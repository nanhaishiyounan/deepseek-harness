/**
 * The model-facing `lakehouse_tables` tool: the bound tenant's registered
 * lakehouse tables with their column schemas and load-time row counts.
 * Execution goes through `ctx.lakehouse.listTables` — this module owns only
 * the model-facing schema, argument validation, and the textual projection
 * the model reads.
 * @module @deepseek-ai/dsh-tool-lakehouse/tables
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { LakehouseTable } from '@deepseek-ai/dsh-lakehouse'

/** Model-facing `lakehouse_tables` arguments. */
export interface LakehouseTablesArgs {
  /** Narrow the listing to one table name; omitted lists every table. */
  table?: string
  /** Always rejected at parse time: the tenant is the deployment-side binding, never model input. */
  tenant?: string
}

/**
 * Validate the arguments the schema DSL cannot constrain: a non-blank
 * `table` when given, and no model-supplied `tenant`.
 * @param args - the schema-validated `lakehouse_tables` arguments.
 * @returns the validated table filter.
 */
export function parseTablesArgs(args: LakehouseTablesArgs): { table: string | undefined } {
  if (args.tenant !== undefined) {
    throw new Error('lakehouse_tables: the tenant is bound by the deployment; a tenant argument is not accepted')
  }
  const table = args.table?.trim()
  return { table: table === undefined || table.length === 0 ? undefined : table }
}

/** One table's wire projection inside the canonical tool value. */
export interface LakehouseTableView {
  name: string
  columns: Array<{ name: string; type: string }>
  rows: number
  format: string
  updated_at: string
}

/** The canonical `lakehouse_tables` output value. */
export interface LakehouseTablesToolValue {
  tables: LakehouseTableView[]
}

/**
 * Project catalog records into the canonical tool value.
 * @param tables - the tenant's registered tables.
 * @returns the canonical tool value.
 */
export function tablesValueFromRecords(tables: readonly LakehouseTable[]): LakehouseTablesToolValue {
  return {
    tables: tables.map(table => tableView(table)),
  }
}

/** The wire projection of one registered table. */
function tableView(table: LakehouseTable): LakehouseTableView {
  return {
    name: table.tableName,
    columns: table.columns.map(column => ({ name: column.name, type: column.sqlType })),
    rows: table.rowCount,
    format: table.format,
    updated_at: table.updatedAt,
  }
}

/**
 * Format the listing as the model-facing text: one block per table with its
 * column schema, sized for schema-first SQL authoring.
 * @param value - the tool's canonical output value.
 * @returns the rendered table inventory.
 */
export function formatTablesOutput(value: LakehouseTablesToolValue): string {
  if (value.tables.length === 0) {
    return 'No lakehouse tables are registered yet. Tabular uploads (csv/xlsx/json) land as tables through the data upload channel.'
  }
  const blocks = value.tables.map((table) => {
    const columns = table.columns.map(column => `  ${column.name} ${column.type}`).join('\n')
    return `${table.name} — ${table.rows} rows, ${table.format} (updated ${table.updated_at})\n${columns}`
  })
  return [
    blocks.join('\n\n'),
    'Write lakehouse_query SQL against these tables; quote identifiers with double quotes when a column name needs it.',
  ].join('\n\n')
}

/** Presentation-ready projection of replayed tables metadata. */
export interface LakehouseTablesMetaView {
  readonly tables: number
  readonly rows: number
}

/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * @param meta - result metadata.
 * @returns the validated tables meta, or `undefined`.
 */
export function tablesMetaFromResult(meta: unknown): LakehouseTablesMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { tables, rows } = meta as Record<string, unknown>
  if (typeof tables !== 'number' || !Number.isInteger(tables) || tables < 0) return undefined
  if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 0) return undefined
  return { tables, rows }
}

/**
 * Pending-call presentation: a generic card titled by the tool or the asked table.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentTablesCall(args: LakehouseTablesArgs): GenericCallView {
  const asked = args.table?.trim()
  return { card: 'generic', title: asked !== undefined && asked.length > 0 ? asked : 'lakehouse_tables', kind: 'search', rawInput: asked ?? 'lakehouse_tables' }
}

/**
 * Completed-call presentation: a generic card with the table and row totals.
 * @param args - the raw tool arguments.
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentTablesResult(args: LakehouseTablesArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = tablesMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'generic',
    title: args.table?.trim() || 'lakehouse_tables',
    content: [{ type: 'text', text: `${meta.tables} lakehouse table${meta.tables === 1 ? '' : 's'}, ${meta.rows} rows total` }],
  }
}

/**
 * Register the `lakehouse_tables` tool and its system-prompt guidance, scoped
 * to the deployment's bound tenant.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param tenant - the deployment-side tenant binding; every listing runs within it.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyLakehouseTablesTool(ctx: Context, tenant: string, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:lakehouse_tables',
    order: 111,
    text: 'Use the lakehouse_tables tool before writing SQL: it lists the tenant\'s registered lakehouse tables with each table\'s columns, SQL types, and row counts. When asked for numbers, statistics, aggregates, or record lists that live in uploaded tabular data, call lakehouse_tables first, then query with lakehouse_query.',
  })

  ctx.tools.register(defineTool({
    name: 'lakehouse_tables',
    description: 'List the registered lakehouse tables with their column schemas (name and SQL type per column), row counts, and formats. Pass table to narrow to one table. Use before writing lakehouse_query SQL.',
    parameters: {
      table: {
        type: 'string',
        description: 'One table name to describe; omit to list every registered table.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tables: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
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
                rows: { type: 'number', required: true },
                format: { type: 'string', required: true },
                updated_at: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatTablesOutput(value) }],
      presentationMeta: (_args, value) => {
        const tables = value.tables
        return { tables: tables.length, rows: tables.reduce((sum, table) => sum + table.rows, 0) }
      },
    },
    timeoutMs,
    // The catalog listing does not mutate agent state.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const { table } = parseTablesArgs(args)
      const tables = await ctx.lakehouse.listTables(tenant, exec.signal)
      const filtered = table === undefined ? tables : tables.filter(entry => entry.tableName === table)
      if (table !== undefined && filtered.length === 0) {
        throw new Error(`lakehouse_tables: no registered table named "${table}" for this tenant; list all tables first to see the names`)
      }
      return tablesValueFromRecords(filtered)
    },
    presentCall: presentTablesCall,
    presentResult: presentTablesResult,
  }))
}
