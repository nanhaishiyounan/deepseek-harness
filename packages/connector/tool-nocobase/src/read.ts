/**
 * The model-facing NocoBase read tools: `nb_collections` lists the business
 * schema (one collection definition per card section, hidden ones dropped),
 * `nb_list` queries rows with the restricted filter vocabulary, and `nb_get`
 * reads one row. All three stay registered when no credentials resolve and
 * fail with a structured error at execution time — the suite's documented
 * degraded mode.
 * @module @deepseek-ai/dsh-tool-nocobase/read
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, JsonValue, ToolResult } from '@deepseek-ai/dsh-tools'
import type { NocoBaseClient, NocoBaseCollectionMeta } from '@deepseek-ai/dsh-connector-nocobase'
import { unwrapNbTitle } from '@deepseek-ai/dsh-connector-nocobase'
import { compileFilter, describeFilterCondition, parseFilterCondition } from './filter.ts'
import type { NbFilterCondition, NbFilterConditionInput, NbFilterMatch } from './filter.ts'

/** Model-facing `nb_collections` arguments. */
export interface NbCollectionsArgs {
  /** Include collections the backend marks hidden; defaults to false. */
  readonly include_hidden?: boolean
  /** Always rejected at parse time: the service account is the deployment-side binding, never model input. */
  readonly tenant?: string
}

/** Model-facing `nb_list` arguments. */
export interface NbListArgs {
  readonly collection: string
  /** Restricted conditions (eq/in/gt/lt); an empty list lists unfiltered. Operands arrive as JSON and are validated by the parse step. */
  readonly filter?: readonly NbFilterConditionInput[] | undefined
  /** How conditions join; `and` by default (narrowed by the parse step). */
  readonly match?: string | undefined
  readonly page?: number | undefined
  readonly page_size?: number | undefined
  /** Sort keys; a leading `-` is NocoBase's descending marker. */
  readonly sort?: readonly string[] | undefined
  /** Field projection. */
  readonly fields?: readonly string[] | undefined
  /** Always rejected at parse time: the service account is the deployment-side binding, never model input. */
  readonly tenant?: string | undefined
}

/** Model-facing `nb_get` arguments. */
export interface NbGetArgs {
  readonly collection: string
  readonly id: number
  /** Always rejected at parse time: the service account is the deployment-side binding, never model input. */
  readonly tenant?: string
}

/** One collection schema card as `nb_collections` projects it (a JSON output value). */
export interface CollectionCardView {
  readonly name: string
  readonly title?: string
  readonly fields: { readonly name: string; readonly type: string; readonly title?: string; readonly target?: string }[]
}

/** The canonical `nb_collections` output value. */
export interface NbCollectionsToolValue {
  readonly collections: CollectionCardView[]
}

/** One queried row; cells are the wire row's JSON cells (the REST answer is JSON by construction). */
export type NbRow = Record<string, JsonValue>

/** The canonical `nb_list` output value. */
export interface NbListToolValue {
  readonly collection: string
  readonly count: number
  readonly page: number
  readonly page_size: number
  readonly rows: NbRow[]
}

/** The canonical `nb_get` output value. */
export interface NbGetToolValue {
  readonly collection: string
  readonly row: NbRow
}

/** Upper bound for one nb_list page; larger requests refuse at parse time. */
export const NB_LIST_MAX_PAGE_SIZE = 100

/** Default nb_list page size. */
export const NB_LIST_DEFAULT_PAGE_SIZE = 20

/**
 * Parse `nb_collections` arguments: no model-supplied tenant.
 * @param args - the schema-validated arguments.
 * @returns the validated include-hidden flag.
 */
export function parseNbCollectionsArgs(args: NbCollectionsArgs): { includeHidden: boolean } {
  if (args.tenant !== undefined) {
    throw new Error('nb_collections: the service account is bound by the deployment; a tenant argument is not accepted')
  }
  return { includeHidden: args.include_hidden === true }
}

/**
 * Parse `nb_list` arguments: no model-supplied tenant, non-empty collection,
 * validated conditions, bounded paging.
 * @param args - the schema-validated arguments.
 * @returns the validated list input.
 */
export function parseNbListArgs(args: NbListArgs): {
  collection: string
  conditions: readonly NbFilterCondition[]
  match: NbFilterMatch
  page: number
  pageSize: number
  sort?: readonly string[]
  fields?: readonly string[]
} {
  if (args.tenant !== undefined) {
    throw new Error('nb_list: the service account is bound by the deployment; a tenant argument is not accepted')
  }
  const collection = args.collection.trim()
  if (collection.length === 0) throw new Error('nb_list: collection must be a non-empty collection name')
  const conditions: NbFilterCondition[] = []
  for (const raw of args.filter ?? []) {
    const parsed = parseFilterCondition(raw)
    if (!parsed.ok) throw new Error(`nb_list: ${parsed.error}`)
    conditions.push(parsed.value)
  }
  const match = args.match ?? 'and'
  if (match !== 'and' && match !== 'or') throw new Error('nb_list: match must be "and" or "or"')
  const narrowedMatch: NbFilterMatch = match
  const page = args.page ?? 1
  const pageSize = args.page_size ?? NB_LIST_DEFAULT_PAGE_SIZE
  if (!Number.isInteger(page) || page < 1) throw new Error('nb_list: page must be a positive integer')
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > NB_LIST_MAX_PAGE_SIZE) {
    throw new Error(`nb_list: page_size must be an integer between 1 and ${NB_LIST_MAX_PAGE_SIZE}`)
  }
  const sort = args.sort?.filter(key => key.trim().length > 0)
  const fields = args.fields?.filter(key => key.trim().length > 0)
  return {
    collection,
    conditions,
    match: narrowedMatch,
    page,
    pageSize,
    ...sort === undefined || sort.length === 0 ? {} : { sort },
    ...fields === undefined || fields.length === 0 ? {} : { fields },
  }
}

/**
 * Parse `nb_get` arguments: no model-supplied tenant, non-empty collection,
 * positive integer id.
 * @param args - the schema-validated arguments.
 * @returns the validated get input.
 */
export function parseNbGetArgs(args: NbGetArgs): { collection: string; id: number } {
  if (args.tenant !== undefined) {
    throw new Error('nb_get: the service account is bound by the deployment; a tenant argument is not accepted')
  }
  const collection = args.collection.trim()
  if (collection.length === 0) throw new Error('nb_get: collection must be a non-empty collection name')
  if (!Number.isInteger(args.id) || args.id < 1) throw new Error('nb_get: id must be a positive integer row id')
  return { collection, id: args.id }
}

/**
 * Project one listMeta answer onto the schema cards, dropping hidden
 * collections unless asked for.
 * @param meta - the raw collection definitions.
 * @param includeHidden - keep hidden collections.
 * @returns the projected cards.
 */
export function collectionCardsOf(meta: readonly NocoBaseCollectionMeta[], includeHidden: boolean): CollectionCardView[] {
  return meta
    .filter(entry => includeHidden || entry.hidden !== true)
    .map(entry => ({
      name: entry.name,
      // System collections carry i18n template titles; the tool face has no translator, so unwrap to the display key.
      ...entry.title === undefined ? {} : { title: unwrapNbTitle(entry.title) },
      fields: (entry.fields ?? []).map(field => ({
        name: field.name,
        type: field.type,
        ...field.title === undefined ? {} : { title: unwrapNbTitle(field.title) },
        ...field.target === undefined ? {} : { target: field.target },
      })),
    }))
}

/**
 * Format the nb_collections outcome as model-facing markdown: one section
 * per collection with its fields.
 * @param value - the tool's canonical output value.
 * @returns the schema listing text.
 */
export function formatNbCollectionsOutput(value: NbCollectionsToolValue): string {
  if (value.collections.length === 0) return '业务系统没有可见的集合。'
  const sections = value.collections.map((entry) => {
    const heading = entry.title ? `${entry.name}（${entry.title}）` : entry.name
    const fields = entry.fields.map((field) => {
      const label = field.title ? `${field.name} ${field.title}` : field.name
      const relation = field.target ? ` → ${field.target}` : ''
      return `- ${label}: ${field.type}${relation}`
    })
    return [`### ${heading}`, ...fields].join('\n')
  })
  return [`共 ${value.collections.length} 个集合：`, ...sections].join('\n\n')
}

/**
 * Format the nb_list outcome: the paging header plus one line per row.
 * @param value - the tool's canonical output value.
 * @returns the row listing text.
 */
export function formatNbListOutput(value: NbListToolValue): string {
  const header = `${value.collection} 第 ${value.page} 页（每页 ${value.page_size}，共 ${value.count} 行）`
  if (value.rows.length === 0) return `${header}\n本页没有行。`
  const lines = value.rows.map(row => `- ${JSON.stringify(row)}`)
  return [header, ...lines].join('\n')
}

/**
 * Format the nb_get outcome: the row's cells.
 * @param value - the tool's canonical output value.
 * @returns the single-row text.
 */
export function formatNbGetOutput(value: NbGetToolValue): string {
  return `${value.collection}: ${JSON.stringify(value.row)}`
}

/** Pending-call presentation shared by the read tools: a generic read card. */
function readCallCard(tool: string, rawInput: string): GenericCallView {
  return { card: 'generic', title: tool, kind: 'read', rawInput }
}

/**
 * Replay-safe projection of one nb_collections result meta.
 */
export interface NbCollectionsMetaView {
  readonly collections: number
}

function nbCollectionsMetaFromResult(meta: unknown): NbCollectionsMetaView | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { collections } = meta as Record<string, unknown>
  if (typeof collections !== 'number' || !Number.isInteger(collections) || collections < 0) return undefined
  return { collections }
}

/**
 * Register the `nb_collections` tool and its system-prompt guidance: the
 * schema-discovery first step of every business question.
 * @param ctx - context whose registries receive the registrations.
 * @param client - the resolved NocoBase REST client (or undefined in the degraded mode).
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyNbCollectionsTool(ctx: Context, client: NocoBaseClient | undefined, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:nb_collections',
    order: 120,
    text: 'Use the nb_collections tool before any other nb_* call when the conversation names a business record type you have not seen: it lists every visible collection with its fields (name, type, relation targets). Ground collection and field names in this listing instead of guessing.',
  })

  ctx.tools.register(defineTool({
    name: 'nb_collections',
    description: 'List the business system\'s collections (tables) with their fields — the schema needed to read or change business records. Hidden collections stay dropped unless include_hidden is true.',
    parameters: {
      include_hidden: {
        type: 'boolean',
        description: 'Include collections the backend marks hidden; defaults to false.',
      },
    },
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
                name: { type: 'string', required: true },
                title: { type: 'string' },
                fields: {
                  type: 'array',
                  required: true,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string', required: true },
                      type: { type: 'string', required: true },
                      title: { type: 'string' },
                      target: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatNbCollectionsOutput(value as NbCollectionsToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as NbCollectionsToolValue
        return { collections: projected.collections.length }
      },
    },
    timeoutMs,
    // Reads over the NocoBase source; safe to overlap with other reads.
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = parseNbCollectionsArgs(args)
      if (client === undefined) {
        throw new Error('nb_collections: this deployment resolves no NocoBase credentials (NOCOBASE_BASE_URL/NOCOBASE_API_KEY); the business tools are unavailable')
      }
      const meta = await client.listMeta()
      return { collections: collectionCardsOf(meta, input.includeHidden) }
    },
    presentCall: args => readCallCard('nb_collections', args.include_hidden === true ? 'include hidden' : ''),
    presentResult: (_args: NbCollectionsArgs, result: ToolResult): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = nbCollectionsMetaFromResult(result.meta)
      if (meta === undefined) return undefined
      return {
        card: 'generic',
        title: 'nb_collections',
        content: [{ type: 'text', text: `${meta.collections} 个业务集合` }],
      }
    },
  }))
}

/**
 * Register the `nb_list` tool and its system-prompt guidance.
 * @param ctx - context whose registries receive the registrations.
 * @param client - the resolved NocoBase REST client (or undefined in the degraded mode).
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyNbListTool(ctx: Context, client: NocoBaseClient | undefined, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:nb_list',
    order: 121,
    text: 'Use the nb_list tool to answer questions over business records: name the collection from nb_collections, filter with the restricted conditions (field, op eq/in/gt/lt, value; joined by match and/or), sort with leading `-` for descending, and page when count exceeds page_size. Answer from the returned rows and name the collection.',
  })

  ctx.tools.register(defineTool({
    name: 'nb_list',
    description: 'Query rows of one business collection with restricted filters (eq/in/gt/lt, and/or), sorting, field projection, and paging. Returns the page, the total count, and the rows.',
    parameters: {
      collection: {
        type: 'string',
        required: true,
        description: 'Collection name from nb_collections (for example orders).',
      },
      filter: {
        type: 'array',
        description: 'Conditions: {field, op: eq|in|gt|lt, value}; scalars for eq/gt/lt, a non-empty array for in.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            field: { type: 'string', required: true },
            op: { type: 'string', required: true, enum: ['eq', 'in', 'gt', 'lt'] },
            value: { type: 'json', required: true },
          },
        },
      },
      match: {
        type: 'string',
        description: 'How conditions join: "and" (default) or "or".',
      },
      page: {
        type: 'number',
        description: '1-based page number; defaults to 1.',
      },
      page_size: {
        type: 'number',
        description: 'Rows per page, 1-100; defaults to 20.',
      },
      sort: {
        type: 'array',
        description: 'Sort keys; a leading `-` marks descending (for example ["-updatedAt"]).',
        items: { type: 'string' },
      },
      fields: {
        type: 'array',
        description: 'Field projection; limits the returned columns.',
        items: { type: 'string' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          collection: { type: 'string', required: true },
          count: { type: 'number', required: true },
          page: { type: 'number', required: true },
          page_size: { type: 'number', required: true },
          rows: { type: 'array', required: true, items: { type: 'object', additionalProperties: true } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatNbListOutput(value as NbListToolValue) }],
      presentationMeta: (args, value) => {
        const projected = value as NbListToolValue
        return {
          collection: projected.collection,
          count: projected.count,
          page: projected.page,
          filters: (args as NbListArgs).filter?.map(raw => describeFilterCondition(raw)) ?? [],
        }
      },
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseNbListArgs(args)
      if (client === undefined) {
        throw new Error('nb_list: this deployment resolves no NocoBase credentials (NOCOBASE_BASE_URL/NOCOBASE_API_KEY); the business tools are unavailable')
      }
      const filter = compileFilter(input.conditions, input.match)
      const result = await client.list<NbRow>(input.collection, {
        ...Object.keys(filter).length === 0 ? {} : { filter },
        page: input.page,
        pageSize: input.pageSize,
        ...input.sort === undefined ? {} : { sort: input.sort },
        ...input.fields === undefined ? {} : { fields: input.fields },
      }, exec.signal)
      return {
        collection: input.collection,
        count: result.count,
        page: result.page,
        page_size: result.pageSize,
        rows: result.rows,
      }
    },
    presentCall: args => readCallCard('nb_list', args.collection),
    presentResult: (_args: NbListArgs, result: ToolResult): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = result.meta as { collection?: unknown; count?: unknown }
      if (typeof meta.collection !== 'string' || typeof meta.count !== 'number') return undefined
      return {
        card: 'generic',
        title: 'nb_list',
        content: [{ type: 'text', text: `${meta.collection}：${meta.count} 行` }],
      }
    },
  }))
}

/**
 * Register the `nb_get` tool and its system-prompt guidance.
 * @param ctx - context whose registries receive the registrations.
 * @param client - the resolved NocoBase REST client (or undefined in the degraded mode).
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyNbGetTool(ctx: Context, client: NocoBaseClient | undefined, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:nb_get',
    order: 122,
    text: 'Use the nb_get tool to read one business record by collection and id — the current values you need before proposing any change (the nb_update confirmation diff) and the follow-up read after a write.',
  })

  ctx.tools.register(defineTool({
    name: 'nb_get',
    description: 'Read one business record by collection and row id. Returns the full row as stored.',
    parameters: {
      collection: {
        type: 'string',
        required: true,
        description: 'Collection name from nb_collections.',
      },
      id: {
        type: 'number',
        required: true,
        description: 'The row\'s primary-key id.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          collection: { type: 'string', required: true },
          row: { type: 'object', required: true, additionalProperties: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatNbGetOutput(value as NbGetToolValue) }],
      presentationMeta: (args, value) => {
        const projected = value as NbGetToolValue
        return { collection: projected.collection, id: (args as NbGetArgs).id }
      },
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseNbGetArgs(args)
      if (client === undefined) {
        throw new Error('nb_get: this deployment resolves no NocoBase credentials (NOCOBASE_BASE_URL/NOCOBASE_API_KEY); the business tools are unavailable')
      }
      const row = await client.get<NbRow>(input.collection, input.id, undefined, exec.signal)
      if (row === undefined) {
        throw new Error(`nb_get: no row ${input.id} exists in ${input.collection}`)
      }
      return { collection: input.collection, row }
    },
    presentCall: args => readCallCard('nb_get', `${args.collection}#${args.id}`),
    presentResult: (_args: NbGetArgs, result: ToolResult): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = result.meta as { collection?: unknown; id?: unknown }
      if (typeof meta.collection !== 'string' || typeof meta.id !== 'number') return undefined
      return {
        card: 'generic',
        title: 'nb_get',
        content: [{ type: 'text', text: `${meta.collection} #${meta.id}` }],
      }
    },
  }))
}
