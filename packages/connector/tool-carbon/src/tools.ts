/**
 * The model-facing carbon business tools: `cb_collections` (catalog
 * discovery), `cb_list`/`cb_get` (reads over the restricted filter
 * vocabulary), and `cb_create`/`cb_update` (single-table writes with the
 * in-conversation confirmation contract the persona drives — the tools carry
 * no UI confirmation state). Risk tiers mirror the carbon manifest's
 * classification: write tools accept only write-tier catalog tables, and
 * the composite posting server-functions stay off the rows entirely. Every
 * tool stays registered in the degraded mode (no carbon service composed or
 * no credentials) and fails with the structured refusal at execution time.
 * @module @deepseek-ai/dsh-tool-carbon/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, JsonValue, ToolResult } from '@deepseek-ai/dsh-tools'
import type { CarbonFilterCondition } from '@deepseek-ai/dsh-connector-carbon'
import { CarbonService, carbonTableOf } from '@deepseek-ai/dsh-connector-carbon'

/** Upper bound for one cb_list page; larger requests refuse at parse time. */
export const CB_LIST_MAX_LIMIT = 100

/** Default cb_list page size. */
export const CB_LIST_DEFAULT_LIMIT = 20

/** Model-facing `cb_list` filter vocabulary (the connector client's restricted set). */
type CbFilterInput = { field: string; op: CarbonFilterCondition['op']; value: string | number | boolean | null | (string | number | boolean)[] }

/** One catalog card section as `cb_collections` projects it (a JSON output value). */
export interface CbCollectionCardView {
  readonly table: string
  readonly label: string
  readonly module: string
  readonly risk: 'read' | 'write'
  readonly id_column: string
  readonly key_columns: readonly string[]
}

/** The canonical `cb_collections` output value. */
export interface CbCollectionsToolValue {
  readonly collections: readonly CbCollectionCardView[]
}

/** The canonical `cb_list` output value. */
export interface CbListToolValue {
  readonly table: string
  readonly count: number
  readonly offset: number
  readonly limit: number
  readonly rows: Record<string, JsonValue>[]
}

/** The canonical `cb_get` output value. */
export interface CbGetToolValue {
  readonly table: string
  readonly row: Record<string, JsonValue> | null
}

/** The canonical `cb_create` output value. */
export interface CbCreateToolValue {
  readonly table: string
  readonly row: Record<string, JsonValue>
}

/** One field change as `cb_update` reports it. */
export interface CbFieldChange {
  readonly field: string
  readonly before?: JsonValue
  readonly after?: JsonValue
}

/** The canonical `cb_update` output value. */
export interface CbUpdateToolValue {
  readonly table: string
  readonly id: string
  readonly row: Record<string, JsonValue>
  readonly changes: readonly CbFieldChange[]
}

/**
 * Narrow one wire row into a JSON value map (PostgREST answers JSON by
 * construction; null and nested objects ride as-is).
 */
function jsonRow(row: Record<string, unknown>): Record<string, JsonValue> {
  return row as Record<string, JsonValue>
}

/**
 * Parse and bound the filter list (no empty in-arrays, scalars for the
 * comparison ops).
 * @param raw - the model-supplied conditions.
 * @returns the validated conditions.
 */
function parseFilter(raw: CbFilterInput[] | undefined): CarbonFilterCondition[] {
  if (raw === undefined) return []
  return raw.map((condition) => {
    if (typeof condition.field !== 'string' || condition.field.length === 0) throw new Error('cb_list: filter.field must be a non-empty string')
    const ops: readonly CarbonFilterCondition['op'][] = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'like', 'ilike', 'in', 'is']
    if (!ops.includes(condition.op)) throw new Error(`cb_list: filter.op must be one of ${ops.join('/')}`)
    if (condition.op === 'in' && (!Array.isArray(condition.value) || condition.value.length === 0)) {
      throw new Error('cb_list: filter value for in must be a non-empty array')
    }
    if (condition.op === 'is' && condition.value !== null && condition.value !== true && condition.value !== false) {
      throw new Error('cb_list: filter value for is must be null/true/false')
    }
    if (condition.op !== 'in' && condition.op !== 'is' && (condition.value === null || Array.isArray(condition.value))) {
      throw new Error(`cb_list: filter value for ${condition.op} must be a scalar`)
    }
    return { field: condition.field, op: condition.op, value: condition.value } satisfies CarbonFilterCondition
  })
}

/**
 * Format the cb_collections outcome as model-facing markdown.
 * @param value - the tool's canonical output value.
 * @returns the catalog listing text.
 */
export function formatCbCollectionsOutput(value: CbCollectionsToolValue): string {
  const sections = value.collections.map(entry =>
    `- ${entry.table}（${entry.label}｜${entry.risk === 'write' ? '可读可写' : '只读'}｜主键列 ${entry.id_column}｜关键列 ${entry.key_columns.join(', ')}）`)
  return [`共 ${value.collections.length} 张业务表：`, ...sections].join('\n')
}

/**
 * Format the cb_list outcome: the paging header plus one line per row.
 * @param value - the tool's canonical output value.
 * @returns the row listing text.
 */
export function formatCbListOutput(value: CbListToolValue): string {
  const header = `${value.table}（共 ${value.count} 行，返回 ${value.rows.length} 行）`
  if (value.rows.length === 0) return `${header}\n没有匹配的行。`
  return [header, ...value.rows.map(row => `- ${JSON.stringify(row)}`)].join('\n')
}

/** Pending-call presentation shared by the read tools. */
function readCallCard(tool: string, rawInput: string): GenericCallView {
  return { card: 'generic', title: tool, kind: 'read', rawInput }
}

/** Pending-call presentation shared by the write tools (the cautious tier). */
function writeCallCard(tool: string, rawInput: string): GenericCallView {
  return { card: 'generic', title: tool, kind: 'execute', rawInput }
}

/**
 * Register the `cb_collections` tool and its system-prompt guidance.
 * @param ctx - context whose registries receive the registrations.
 * @param carbon - the carbon capability service.
 * @param timeoutMs - cooperative tool-call budget.
 */
export function applyCbCollectionsTool(ctx: Context, carbon: CarbonService, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:cb_collections',
    order: 120,
    text: 'Use the cb_collections tool before any other cb_* call when the conversation names a business object you have not seen: it lists the carbon business tables with module, risk tier, key column, and key columns. Ground table and column names in this listing instead of guessing.',
  })
  ctx.tools.register(defineTool({
    name: 'cb_collections',
    description: 'List the carbon business system\'s tables (物料/客户/供应商/销售订单/采购订单/库存/生产工单/不合格品…) with module, risk tier, and key columns — the catalog needed to read or change business records.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          collections: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                table: { type: 'string', required: true },
                label: { type: 'string', required: true },
                module: { type: 'string', required: true },
                risk: { type: 'string', required: true, enum: ['read', 'write'] },
                id_column: { type: 'string', required: true },
                key_columns: { type: 'array', required: true, items: { type: 'string' } },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatCbCollectionsOutput(value as CbCollectionsToolValue) }],
      presentationMeta: (_args, value) => ({ collections: (value as CbCollectionsToolValue).collections.length }),
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    execute() {
      if (!carbon.available()) throw new Error(CarbonService.NO_CREDENTIALS)
      const catalog = carbon.catalog()
      return Promise.resolve({
        collections: catalog.tables.map(entry => ({
          table: entry.table,
          label: entry.label,
          module: entry.module,
          risk: entry.risk,
          id_column: entry.idColumn,
          key_columns: [...entry.keyColumns],
        })),
      })
    },
    presentCall: () => readCallCard('cb_collections', ''),
    presentResult: (_args, result: ToolResult): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = result.meta as { collections?: unknown }
      if (typeof meta.collections !== 'number') return undefined
      return { card: 'generic', title: 'cb_collections', content: [{ type: 'text', text: `${meta.collections} 张业务表` }] }
    },
  }))
}

/**
 * Register the `cb_list` tool and its system-prompt guidance.
 * @param ctx - context whose registries receive the registrations.
 * @param carbon - the carbon capability service.
 * @param timeoutMs - cooperative tool-call budget.
 */
export function applyCbListTool(ctx: Context, carbon: CarbonService, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:cb_list',
    order: 121,
    text: 'Use the cb_list tool to answer questions over carbon business records: name the table from cb_collections (for example salesOrder), filter with the restricted conditions (field, op eq/neq/gt/lt/gte/lte/like/ilike/in/is, value — ilike is case-insensitive substring matching with * wildcards), order with column or column.desc, and page with limit/offset when count exceeds limit. Rows referencing other tables by id (salesOrder.customerId is a customer id) resolve the target with one more cb_list — filter: [{field: "id", op: "in", value: [<ids>]}] on customer surfaces the names. Answer from the returned rows and name the table.',
  })
  ctx.tools.register(defineTool({
    name: 'cb_list',
    description: 'Query rows of one carbon business table with restricted filters (eq/neq/gt/lt/gte/lte/like/ilike/in/is), ordering, and limit/offset paging. Returns the total count and the rows.',
    parameters: {
      table: {
        type: 'string',
        required: true,
        description: 'Table name from cb_collections (for example salesOrder).',
      },
      filter: {
        type: 'array',
        description: 'Conditions: {field, op, value}; scalars for the comparison ops, a non-empty array for in, null/true/false for is, * wildcard patterns for like/ilike.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            field: { type: 'string', required: true },
            op: { type: 'string', required: true, enum: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'like', 'ilike', 'in', 'is'] },
            value: { type: 'json', required: true },
          },
        },
      },
      order: {
        type: 'array',
        description: 'Sort keys; a `.desc` suffix marks descending (for example ["createdAt.desc"]).',
        items: { type: 'string' },
      },
      limit: {
        type: 'number',
        description: `Rows to return, 1-${CB_LIST_MAX_LIMIT}; defaults to ${CB_LIST_DEFAULT_LIMIT}.`,
      },
      offset: {
        type: 'number',
        description: 'Row offset for paging; defaults to 0.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          table: { type: 'string', required: true },
          count: { type: 'number', required: true },
          offset: { type: 'number', required: true },
          limit: { type: 'number', required: true },
          rows: { type: 'array', required: true, items: { type: 'object', additionalProperties: true } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatCbListOutput(value as CbListToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as CbListToolValue
        return { table: projected.table, count: projected.count }
      },
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (!carbon.available()) throw new Error(CarbonService.NO_CREDENTIALS)
      const meta = carbonTableOf(args.table)
      if (meta === undefined) throw new Error(`cb_list: table ${args.table} is not on the business catalog (see cb_collections)`)
      const filter = parseFilter(args.filter as CbFilterInput[] | undefined)
      const limit = args.limit === undefined ? CB_LIST_DEFAULT_LIMIT : args.limit
      if (!Number.isInteger(limit) || limit < 1 || limit > CB_LIST_MAX_LIMIT) throw new Error(`cb_list: limit must be an integer 1-${CB_LIST_MAX_LIMIT}`)
      const offset = args.offset === undefined ? 0 : args.offset
      if (!Number.isInteger(offset) || offset < 0) throw new Error('cb_list: offset must be a non-negative integer')
      const order = args.order === undefined ? undefined : args.order.map(String)
      const result = await carbon.list(meta.table, {
        filter,
        ...order === undefined ? {} : { order },
        limit,
        offset,
        select: meta.keyColumns,
      }, exec.signal)
      return {
        table: meta.table,
        count: result.count,
        offset,
        limit,
        rows: result.rows.map(jsonRow),
      }
    },
    presentCall: args => readCallCard('cb_list', args.table),
    presentResult: (_args, result: ToolResult): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = result.meta as { table?: unknown; count?: unknown }
      if (typeof meta.table !== 'string' || typeof meta.count !== 'number') return undefined
      return { card: 'generic', title: 'cb_list', content: [{ type: 'text', text: `${meta.table}：${meta.count} 行` }] }
    },
  }))
}

/**
 * Register the `cb_get` tool and its system-prompt guidance.
 * @param ctx - context whose registries receive the registrations.
 * @param carbon - the carbon capability service.
 * @param timeoutMs - cooperative tool-call budget.
 */
export function applyCbGetTool(ctx: Context, carbon: CarbonService, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:cb_get',
    order: 122,
    text: 'Use the cb_get tool to read one carbon business row by its id (for example the full detail of a sales order after cb_list surfaced its id). The key column is the table\'s id_column from cb_collections (itemId for itemStockQuantities, the prefixed id everywhere else).',
  })
  ctx.tools.register(defineTool({
    name: 'cb_get',
    description: 'Read one carbon business row by table and id. Returns the row\'s full columns.',
    parameters: {
      table: { type: 'string', required: true, description: 'Table name from cb_collections.' },
      id: { type: 'string', required: true, description: 'The row id (or itemId for the stock quantity table).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          table: { type: 'string', required: true },
          row: { type: 'json' },
        },
      },
      render: (_args, value) => {
        const projected = value as CbGetToolValue
        return [{ type: 'text', text: `${projected.table}: ${projected.row === null ? '没有这一行。' : JSON.stringify(projected.row)}` }]
      },
      presentationMeta: (_args, value) => ({ table: (value as CbGetToolValue).table, found: (value as CbGetToolValue).row !== null }),
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (!carbon.available()) throw new Error(CarbonService.NO_CREDENTIALS)
      const table = args.table
      const meta = carbonTableOf(table)
      if (meta === undefined) throw new Error(`cb_get: table ${table} is not on the business catalog (see cb_collections)`)
      const id = args.id
      if (id.length === 0) throw new Error('cb_get: id must be a non-empty string')
      const row = await carbon.get(table, id, exec.signal)
      return { table, row: row === undefined ? null : jsonRow(row) }
    },
    presentCall: args => readCallCard('cb_get', `${args.table}#${args.id}`),
    presentResult: (_args, result: ToolResult): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = result.meta as { table?: unknown }
      if (typeof meta.table !== 'string') return undefined
      return { card: 'generic', title: 'cb_get', content: [{ type: 'text', text: meta.table }] }
    },
  }))
}

/**
 * Register the `cb_create` tool and its system-prompt guidance (the
 * cautious write tier).
 * @param ctx - context whose registries receive the registrations.
 * @param carbon - the carbon capability service.
 * @param timeoutMs - cooperative tool-call budget.
 */
export function applyCbCreateTool(ctx: Context, carbon: CarbonService, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:cb_create',
    order: 130,
    text: 'Use the cb_create tool only after the user\'s explicit go-ahead on a presented draft (the in-conversation confirmation contract): draft the new row from the table\'s key columns, restate every field value, and get the go-ahead BEFORE calling cb_create. The tenant companyId is injected by the deployment — never supply or narrate it. Read-tier tables (receipt, shipment, postings, stock quantities) refuse: those documents belong to carbon\'s posting workflows.',
  })
  ctx.tools.register(defineTool({
    name: 'cb_create',
    description: 'Create one row in a write-tier carbon business table (item/customer/supplier/salesOrder/purchaseOrder/job). '
      + 'The tenant is injected server-side; the created row is returned as the receipt.',
    parameters: {
      table: { type: 'string', required: true, description: 'Write-tier table name from cb_collections.' },
      values: { type: 'json', required: true, description: 'The row\'s column values (never companyId — the deployment injects it).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          table: { type: 'string', required: true },
          row: { type: 'object', required: true, additionalProperties: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `已创建 ${(value as CbCreateToolValue).table}：${JSON.stringify((value as CbCreateToolValue).row)}` }],
      presentationMeta: (_args, value) => ({ table: (value as CbCreateToolValue).table }),
    },
    timeoutMs,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (!carbon.available()) throw new Error(CarbonService.NO_CREDENTIALS)
      const table = args.table
      const meta = carbonTableOf(table)
      if (meta === undefined) throw new Error(`cb_create: table ${table} is not on the business catalog (see cb_collections)`)
      if (meta.risk !== 'write') throw new Error(`cb_create: table ${table}（${meta.label}）是只读层——过账类单据走 carbon 的过账工作流，不在工具写面上`)
      if (args.values === null || typeof args.values !== 'object' || Array.isArray(args.values)) throw new Error('cb_create: values must be an object of column values')
      const values = { ...(args.values as Record<string, unknown>) }
      if ('companyId' in values) throw new Error('cb_create: companyId is injected by the deployment; remove it from values')
      const row = await carbon.create(table, values, exec.signal)
      return { table, row: jsonRow(row) }
    },
    presentCall: args => writeCallCard('cb_create', `${args.table} ${JSON.stringify(args.values ?? {})}`),
    presentResult: (_args, result: ToolResult): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = result.meta as { table?: unknown }
      if (typeof meta.table !== 'string') return undefined
      return { card: 'generic', title: 'cb_create', content: [{ type: 'text', text: `已创建 ${meta.table}` }] }
    },
  }))
}

/**
 * Register the `cb_update` tool and its system-prompt guidance (the
 * cautious write tier).
 * @param ctx - context whose registries receive the registrations.
 * @param carbon - the carbon capability service.
 * @param timeoutMs - cooperative tool-call budget.
 */
export function applyCbUpdateTool(ctx: Context, carbon: CarbonService, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:cb_update',
    order: 131,
    text: 'Use the cb_update tool only after the user\'s explicit go-ahead on a presented field-by-field before→after diff (the in-conversation confirmation contract): cb_get the current row first, present the diff, and change only the fields the user named. Read-tier tables refuse, the same tier rule as cb_create.',
  })
  ctx.tools.register(defineTool({
    name: 'cb_update',
    description: 'Update named columns of one row in a write-tier carbon business table. '
      + 'Returns the updated row and the before→after diff as the receipt.',
    parameters: {
      table: { type: 'string', required: true, description: 'Write-tier table name from cb_collections.' },
      id: { type: 'string', required: true, description: 'The row id.' },
      values: { type: 'json', required: true, description: 'The columns to change (never companyId).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          table: { type: 'string', required: true },
          id: { type: 'string', required: true },
          row: { type: 'object', required: true, additionalProperties: true },
          changes: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                field: { type: 'string', required: true },
                before: { type: 'json' },
                after: { type: 'json' },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const projected = value as CbUpdateToolValue
        const lines = projected.changes.map(change => `- ${change.field}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`)
        return [{ type: 'text', text: [`已更新 ${projected.table} ${projected.id}：`, ...lines].join('\n') }]
      },
      presentationMeta: (_args, value) => {
        const projected = value as CbUpdateToolValue
        return { table: projected.table, fields: projected.changes.length }
      },
    },
    timeoutMs,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (!carbon.available()) throw new Error(CarbonService.NO_CREDENTIALS)
      const table = args.table
      const meta = carbonTableOf(table)
      if (meta === undefined) throw new Error(`cb_update: table ${table} is not on the business catalog (see cb_collections)`)
      if (meta.risk !== 'write') throw new Error(`cb_update: table ${table}（${meta.label}）是只读层——过账类单据走 carbon 的过账工作流，不在工具写面上`)
      const id = args.id
      if (id.length === 0) throw new Error('cb_update: id must be a non-empty string')
      if (args.values === null || typeof args.values !== 'object' || Array.isArray(args.values)) throw new Error('cb_update: values must be an object of column values')
      const values = { ...(args.values as Record<string, unknown>) }
      if ('companyId' in values) throw new Error('cb_update: companyId is the tenant binding; remove it from values')
      if (Object.keys(values).length === 0) throw new Error('cb_update: values must name at least one column')
      const before = await carbon.get(table, id, exec.signal)
      if (before === undefined) throw new Error(`cb_update: ${table} row ${id} does not exist`)
      const row = await carbon.update(table, id, values, exec.signal)
      const changes = Object.keys(values).map(field => ({
        field,
        ...field in before ? { before: before[field] as JsonValue } : {},
        ...field in row ? { after: row[field] as JsonValue } : {},
      }))
      return { table, id, row: jsonRow(row), changes }
    },
    presentCall: args => writeCallCard('cb_update', `${args.table}#${args.id} ${JSON.stringify(args.values ?? {})}`),
    presentResult: (_args, result: ToolResult): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = result.meta as { table?: unknown; fields?: unknown }
      if (typeof meta.table !== 'string' || typeof meta.fields !== 'number') return undefined
      return { card: 'generic', title: 'cb_update', content: [{ type: 'text', text: `已更新 ${meta.table}（${meta.fields} 个字段）` }] }
    },
  }))
}
