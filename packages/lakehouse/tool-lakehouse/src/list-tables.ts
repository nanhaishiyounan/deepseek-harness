/**
 * The model-facing `lakehouse_list_tables` tool: the lakehouse catalog with
 * live row counts, grouped by schema (`legacy_nocobase`, synced schemas,
 * uploads). The output names each table as `lake.<schema>.<table>`, the
 * reference form `lakehouse_query` statements use.
 * @module @deepseek-ai/dsh-tool-lakehouse/list-tables
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type { LakehouseTableSummary } from '@deepseek-ai/dsh-lakehouse-engine'

/** Model-facing `lakehouse_list_tables` arguments (none beyond the name). */
export interface LakehouseListTablesArgs {
  readonly [key: string]: unknown
}

/** The canonical `lakehouse_list_tables` output value. */
export interface LakehouseTableEntryView {
  /** The schema-qualified reference form: `lake.<schema>.<table>`. */
  readonly ref: string
  readonly schema: string
  readonly table: string
  readonly row_count: number
}

/** The canonical output value. */
export interface LakehouseListTablesToolValue {
  tables: LakehouseTableEntryView[]
}

/**
 * Validate the (empty) arguments: any model-supplied property is rejected so
 * the tool call surface stays closed.
 * @param args - the raw tool arguments.
 * @returns the validated (empty) input.
 */
export function parseListTablesArgs(args: LakehouseListTablesArgs): Record<string, never> {
  for (const key of Object.keys(args)) {
    throw new Error(`lakehouse_list_tables: unexpected argument "${key}"; the tool takes no arguments`)
  }
  return {}
}

/**
 * Project the engine's table summaries into the canonical tool value.
 * @param summaries - the engine's live lakehouse listing.
 * @returns the canonical output value.
 */
export function listTablesValueFromSummaries(summaries: readonly LakehouseTableSummary[]): LakehouseListTablesToolValue {
  return {
    tables: summaries.map(summary => ({
      ref: `lake.${summary.schema}.${summary.table}`,
      schema: summary.schema,
      table: summary.table,
      row_count: summary.rowCount,
    })),
  }
}

/**
 * Format the listing as the model-facing text: a markdown table of
 * references and row counts, plus the standing query guidance.
 * @param value - the canonical output value.
 * @returns the rendered catalog listing.
 */
export function formatListTablesOutput(value: LakehouseListTablesToolValue): string {
  const parts: string[] = []
  if (value.tables.length === 0) {
    parts.push('(the lakehouse has no tables registered)')
  } else {
    const header = '| table | rows |'
    const separator = '| --- | --- |'
    const body = value.tables.map(entry => `| ${entry.ref} | ${String(entry.row_count)} |`)
    parts.push([header, separator, ...body].join('\n'))
  }
  parts.push('Query these tables with lakehouse_query (SELECT only), referencing them exactly as listed. Use lakehouse_schema for one table\'s columns and sample rows.')
  return parts.join('\n\n')
}

/** Presentation-ready projection of replayed listing metadata. */
export interface LakehouseListTablesMetaView {
  readonly tables: number
  readonly totalRows: number
}

/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * @param meta - result metadata.
 * @returns the validated listing meta, or `undefined`.
 */
export function listTablesMetaFromResult(meta: unknown): LakehouseListTablesMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { tables, totalRows } = meta as Record<string, unknown>
  if (typeof tables !== 'number' || !Number.isInteger(tables) || tables < 0) return undefined
  if (typeof totalRows !== 'number' || totalRows < 0) return undefined
  return { tables, totalRows }
}

/**
 * Pending-call presentation: a generic card.
 * @param _args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentListTablesCall(_args: LakehouseListTablesArgs): GenericCallView {
  return { card: 'generic', title: 'lakehouse_list_tables', kind: 'search', rawInput: '' }
}

/**
 * Completed-call presentation: a generic card restating the table and row totals.
 * @param _args - the raw tool arguments.
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentListTablesResult(_args: LakehouseListTablesArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = listTablesMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'generic',
    title: 'lakehouse_list_tables',
    content: [{ type: 'text', text: `${String(meta.tables)} table${meta.tables === 1 ? '' : 's'}, ${String(meta.totalRows)} rows total` }],
  }
}

/**
 * Register the `lakehouse_list_tables` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyLakehouseListTablesTool(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:lakehouse_list_tables',
    order: 111,
    text: 'Use the lakehouse_list_tables tool to see every lakehouse table with its live row count before querying. The listing names each table in the exact reference form lakehouse_query statements use. For one table\'s columns, types, and sample rows, use lakehouse_schema; for document passages and prose facts, use kb_search instead.',
  })

  ctx.tools.register(defineTool({
    name: 'lakehouse_list_tables',
    description: 'List every lakehouse table with its schema and live row count. Each entry\'s `ref` is the exact reference form for lakehouse_query statements.',
    parameters: {},
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
                ref: { type: 'string', required: true },
                schema: { type: 'string', required: true },
                table: { type: 'string', required: true },
                row_count: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatListTablesOutput(value as LakehouseListTablesToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as LakehouseListTablesToolValue
        return {
          tables: projected.tables.length,
          totalRows: projected.tables.reduce((sum, entry) => sum + entry.row_count, 0),
        }
      },
    },
    timeoutMs,
    // Catalog listing over attached metadata; safe to overlap with reads.
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      parseListTablesArgs(_args)
      const summaries = await ctx.lakehouseEngine.listTables(exec.signal)
      return listTablesValueFromSummaries(summaries)
    },
    presentCall: presentListTablesCall,
    presentResult: presentListTablesResult,
  }))
}
