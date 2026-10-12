/**
 * The model-facing `lakehouse_schema` tool: one lakehouse table's ordered
 * columns with types, its live row count, and a few sample rows — everything
 * a model needs to write a correct statement before its first
 * `lakehouse_query`.
 * @module @deepseek-ai/dsh-tool-lakehouse/schema
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import type {
  LakehouseColumnDesc,
  LakehouseQueryOutcome,
} from '@deepseek-ai/dsh-lakehouse-engine'

/** Model-facing `lakehouse_schema` arguments. */
export interface LakehouseSchemaArgs {
  schema: string
  table: string
}

/** Validated `lakehouse_schema` input. */
export interface LakehouseSchemaInput {
  schema: string
  table: string
}

/**
 * Validate the arguments the schema DSL cannot constrain: plain identifiers.
 * @param args - the schema-validated `lakehouse_schema` arguments.
 * @returns the validated schema input.
 */
export function parseSchemaArgs(args: LakehouseSchemaArgs): LakehouseSchemaInput {
  const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/u
  if (!identifier.test(args.schema)) {
    throw new Error('lakehouse_schema: schema must be a plain SQL identifier')
  }
  if (!identifier.test(args.table)) {
    throw new Error('lakehouse_schema: table must be a plain SQL identifier')
  }
  return { schema: args.schema, table: args.table }
}

/** The canonical `lakehouse_schema` output value. */
export interface LakehouseSchemaToolValue {
  ref: string
  schema: string
  table: string
  columns: Array<{ name: string; type: string }>
  row_count: number
  sample_rows: (null | boolean | number | string)[][]
}

/** Render one cell for the sample table (nulls stay explicit, pipes escape). */
function cellText(value: null | boolean | number | string): string {
  if (value === null) return 'NULL'
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

/**
 * Project the engine's description and sample read into the canonical tool value.
 * @param input - the validated schema input.
 * @param columns - the engine's column description.
 * @param sample - the engine's sample-row read.
 * @param rowCount - the row count reported alongside the sample.
 * @returns the canonical tool value.
 */
export function schemaValueFromParts(
  input: LakehouseSchemaInput,
  columns: readonly LakehouseColumnDesc[],
  sample: LakehouseQueryOutcome,
  rowCount: number,
): LakehouseSchemaToolValue {
  return {
    ref: `lake.${input.schema}.${input.table}`,
    schema: input.schema,
    table: input.table,
    columns: columns.map(column => ({ name: column.name, type: column.sqlType })),
    row_count: rowCount,
    sample_rows: sample.rows.map(row => [...row] as (null | boolean | number | string)[]),
  }
}

/**
 * Format the schema as the model-facing text: the column table, the row
 * count, the sample rows, and the standing query guidance.
 * @param value - the canonical output value.
 * @returns the rendered schema card.
 */
export function formatSchemaOutput(value: LakehouseSchemaToolValue): string {
  const parts: string[] = []
  const header = '| column | type |'
  const separator = '| --- | --- |'
  const body = value.columns.map(column => `| ${column.name} | ${column.type} |`)
  parts.push([header, separator, ...body].join('\n'))
  parts.push(`${value.ref}: ${String(value.row_count)} rows (sample below)`)
  if (value.sample_rows.length > 0) {
    const sampleHeader = `| ${value.columns.map(column => column.name).join(' | ')} |`
    const sampleBody = value.sample_rows.map(row => `| ${row.map(cellText).join(' | ')} |`)
    parts.push([sampleHeader, separator, ...sampleBody].join('\n'))
  }
  parts.push(`Query this table with lakehouse_query, referencing it as ${value.ref}.`)
  return parts.join('\n\n')
}

/** Presentation-ready projection of replayed schema metadata. */
export interface LakehouseSchemaMetaView {
  readonly columns: number
  readonly rows: number
}

/**
 * Narrow opaque live or replayed result metadata for presentation. Malformed
 * metadata returns `undefined` so presentation falls back to the generic card.
 * @param meta - result metadata.
 * @returns the validated schema meta, or `undefined`.
 */
export function schemaMetaFromResult(meta: unknown): LakehouseSchemaMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { columns, rows } = meta as Record<string, unknown>
  if (typeof columns !== 'number' || !Number.isInteger(columns) || columns < 0) return undefined
  if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 0) return undefined
  return { columns, rows }
}

/**
 * Pending-call presentation: a generic card titled by the reference.
 * @param args - the raw tool arguments.
 * @returns the generic card view.
 */
export function presentSchemaCall(args: LakehouseSchemaArgs): GenericCallView {
  return { card: 'generic', title: `lakehouse_schema ${args.schema}.${args.table}`, kind: 'search', rawInput: `${args.schema}.${args.table}` }
}

/**
 * Completed-call presentation: a generic card restating the column and row counts.
 * @param args - the raw tool arguments.
 * @param result - the final tool result; `meta` carries the projection.
 * @returns the generic card view, or `undefined` on failure or malformed meta.
 */
export function presentSchemaResult(args: LakehouseSchemaArgs, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  const meta = schemaMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'generic',
    title: `lakehouse_schema ${args.schema}.${args.table}`,
    content: [{
      type: 'text',
      text: `${String(meta.columns)} column${meta.columns === 1 ? '' : 's'}, ${String(meta.rows)} rows`,
    }],
  }
}

/**
 * Register the `lakehouse_schema` tool and its system-prompt guidance.
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the registrations.
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyLakehouseSchemaTool(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:lakehouse_schema',
    order: 113,
    text: 'Use the lakehouse_schema tool to read one lakehouse table\'s ordered columns with types, its row count, and a few sample rows — the exact shape a correct lakehouse_query statement needs. Name tables by the schema and table lakehouse_list_tables lists.',
  })

  ctx.tools.register(defineTool({
    name: 'lakehouse_schema',
    description: 'Read one lakehouse table\'s columns with types, its row count, and sample rows. Takes the schema and table names from the lakehouse_list_tables listing.',
    parameters: {
      schema: {
        type: 'string',
        required: true,
        description: 'The table\'s schema name from the listing (a plain identifier).',
      },
      table: {
        type: 'string',
        required: true,
        description: 'The table name (a plain identifier).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ref: { type: 'string', required: true },
          schema: { type: 'string', required: true },
          table: { type: 'string', required: true },
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
          row_count: { type: 'number', required: true },
          sample_rows: { type: 'array', required: true, items: { type: 'array', items: { type: 'json' } } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatSchemaOutput(value as LakehouseSchemaToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as LakehouseSchemaToolValue
        return { columns: projected.columns.length, rows: projected.row_count }
      },
    },
    timeoutMs,
    // Metadata plus a bounded sample read; safe to overlap with other reads.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseSchemaArgs(args)
      const columns = await ctx.lakehouseEngine.describeTable(input.schema, input.table, exec.signal)
      const counted = await ctx.lakehouseEngine.query(
        `SELECT count(*) FROM lake.${input.schema}.${input.table}`,
        undefined,
        exec.signal,
      )
      const sample = await ctx.lakehouseEngine.sampleRows(input.schema, input.table, 5, exec.signal)
      return schemaValueFromParts(input, columns, sample, Number(counted.rows[0]?.[0] ?? 0))
    },
    presentCall: presentSchemaCall,
    presentResult: presentSchemaResult,
  }))
}
