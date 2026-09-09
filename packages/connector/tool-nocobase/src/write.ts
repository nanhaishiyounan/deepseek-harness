/**
 * The model-facing NocoBase write tools: `nb_create` lands one new row and
 * `nb_update` changes fields of one row, each answering a receipt the
 * conversation can show. The in-conversation confirmation lives in the
 * system-prompt guidance, not in tool state: the agent must present the
 * planned change first — nb_create's full new row, nb_update's field-by-field
 * before→after diff over an nb_get — and only call the tool after the user's
 * explicit go-ahead. nb_update's receipt carries the before→after diff of the
 * changed fields so the conversation can echo exactly what landed.
 * @module @deepseek-ai/dsh-tool-nocobase/write
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, JsonValue, ToolResult } from '@deepseek-ai/dsh-tools'
import type { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'
import type { NbRow } from './read.ts'

/** Model-facing `nb_create` arguments. */
export interface NbCreateArgs {
  readonly collection: string
  /** The new row's fields; no id (the server assigns it). */
  readonly values: Record<string, JsonValue>
  /** Always rejected at parse time: the service account is the deployment-side binding, never model input. */
  readonly tenant?: string
}

/** Model-facing `nb_update` arguments. */
export interface NbUpdateArgs {
  readonly collection: string
  readonly id: number
  /** The fields to change; no id. */
  readonly values: Record<string, JsonValue>
  /** Always rejected at parse time: the service account is the deployment-side binding, never model input. */
  readonly tenant?: string
}

/** One changed field's before→after pair, the receipt's diff unit (JSON values; a missing before reads as null). */
export interface FieldChangeView {
  readonly field: string
  readonly before: JsonValue
  readonly after: JsonValue
}

/** The canonical `nb_create` output value: the landing receipt. */
export interface NbCreateToolValue {
  readonly collection: string
  readonly id: number
  readonly row: NbRow
}

/** The canonical `nb_update` output value: the diff receipt. */
export interface NbUpdateToolValue {
  readonly collection: string
  readonly id: number
  readonly changes: FieldChangeView[]
  readonly row: NbRow
}

/**
 * Parse `nb_create` arguments: no model-supplied tenant, non-empty
 * collection, a non-empty plain values object without an id key.
 * @param args - the schema-validated arguments.
 * @returns the validated create input.
 */
export function parseNbCreateArgs(args: NbCreateArgs): { collection: string; values: Record<string, JsonValue> } {
  if (args.tenant !== undefined) {
    throw new Error('nb_create: the service account is bound by the deployment; a tenant argument is not accepted')
  }
  const collection = args.collection.trim()
  if (collection.length === 0) throw new Error('nb_create: collection must be a non-empty collection name')
  const keys = Object.keys(args.values)
  if (keys.length === 0) throw new Error('nb_create: values must name at least one field')
  if (keys.includes('id')) throw new Error('nb_create: values must not carry an id; the server assigns it')
  return { collection, values: args.values }
}

/**
 * Parse `nb_update` arguments: no model-supplied tenant, non-empty
 * collection, positive integer id, a non-empty plain values object without an
 * id key.
 * @param args - the schema-validated arguments.
 * @returns the validated update input.
 */
export function parseNbUpdateArgs(args: NbUpdateArgs): { collection: string; id: number; values: Record<string, JsonValue> } {
  if (args.tenant !== undefined) {
    throw new Error('nb_update: the service account is bound by the deployment; a tenant argument is not accepted')
  }
  const collection = args.collection.trim()
  if (collection.length === 0) throw new Error('nb_update: collection must be a non-empty collection name')
  if (!Number.isInteger(args.id) || args.id < 1) throw new Error('nb_update: id must be a positive integer row id')
  const keys = Object.keys(args.values)
  if (keys.length === 0) throw new Error('nb_update: values must name at least one field to change')
  if (keys.includes('id')) throw new Error('nb_update: values must not carry an id; address the row with id')
  return { collection, id: args.id, values: args.values }
}

/**
 * Build the changed fields' before→after pairs from the pre-update row and
 * the update values.
 * @param before - the row as nb_get read it immediately before the update.
 * @param values - the update's changed fields.
 * @returns one pair per changed field, in the values' key order.
 */
export function fieldChangesOf(before: NbRow, values: Record<string, JsonValue>): FieldChangeView[] {
  return Object.entries(values).map(([field, after]) => ({ field, before: before[field] ?? null, after }))
}

/**
 * Format the nb_create outcome: the landing receipt.
 * @param value - the tool's canonical output value.
 * @returns the receipt text.
 */
export function formatNbCreateOutput(value: NbCreateToolValue): string {
  const fields = Object.entries(value.row).map(([field, cell]) => `- ${field}: ${JSON.stringify(cell)}`)
  return [`已在 ${value.collection} 创建第 ${value.id} 行：`, ...fields].join('\n')
}

/**
 * Format the nb_update outcome: the field-by-field before→after diff
 * followed by the stored row's remaining identity.
 * @param value - the tool's canonical output value.
 * @returns the diff receipt text.
 */
export function formatNbUpdateOutput(value: NbUpdateToolValue): string {
  const lines = [`已更新 ${value.collection} 第 ${value.id} 行：`]
  for (const change of value.changes) {
    lines.push(`- ${change.field}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`)
  }
  return lines.join('\n')
}

/** Pending-call presentation shared by the write tools: a generic execute card. */
function writeCallCard(tool: string, rawInput: string): GenericCallView {
  return { card: 'generic', title: tool, kind: 'execute', rawInput }
}

/**
 * Register the `nb_create` tool and its system-prompt guidance carrying the
 * in-conversation confirmation contract.
 * @param ctx - context whose registries receive the registrations.
 * @param client - the resolved NocoBase REST client (or undefined in the degraded mode).
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyNbCreateTool(ctx: Context, client: NocoBaseClient | undefined, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:nb_create',
    order: 123,
    text: 'Use the nb_create tool only AFTER the user explicitly confirmed the new record: draft the full row first (fields grounded in nb_collections), show it as a preview in the conversation, and ask for the go-ahead. Fill missing slots by asking — never invent business values. One call lands the row and returns the receipt with the server-assigned id.',
  })

  ctx.tools.register(defineTool({
    name: 'nb_create',
    description: 'Create one row in a business collection. Confirmed-change contract: present the full new row to the user and get their explicit go-ahead BEFORE calling. Returns the landing receipt with the assigned id and the stored row.',
    parameters: {
      collection: {
        type: 'string',
        required: true,
        description: 'Collection name from nb_collections.',
      },
      values: {
        type: 'object',
        required: true,
        additionalProperties: true,
        description: 'The new row\'s fields (no id); the exact row the user confirmed.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          collection: { type: 'string', required: true },
          id: { type: 'number', required: true },
          row: { type: 'object', required: true, additionalProperties: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatNbCreateOutput(value as NbCreateToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as NbCreateToolValue
        return { collection: projected.collection, id: projected.id }
      },
    },
    timeoutMs,
    async execute(args, exec) {
      const input = parseNbCreateArgs(args)
      if (client === undefined) {
        throw new Error('nb_create: this deployment resolves no NocoBase credentials (NOCOBASE_BASE_URL/NOCOBASE_API_KEY); the business tools are unavailable')
      }
      const row = await client.create<NbRow>(input.collection, input.values, exec.signal)
      return { collection: input.collection, id: row.id, row }
    },
    presentCall: args => writeCallCard('nb_create', args.collection),
    presentResult: (_args: NbCreateArgs, result: ToolResult): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = result.meta as { collection?: unknown; id?: unknown }
      if (typeof meta.collection !== 'string' || typeof meta.id !== 'number') return undefined
      return {
        card: 'generic',
        title: 'nb_create',
        content: [{ type: 'text', text: `${meta.collection} 第 ${meta.id} 行已创建` }],
      }
    },
  }))
}

/**
 * Register the `nb_update` tool and its system-prompt guidance carrying the
 * in-conversation diff-confirmation contract.
 * @param ctx - context whose registries receive the registrations.
 * @param client - the resolved NocoBase REST client (or undefined in the degraded mode).
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyNbUpdateTool(ctx: Context, client: NocoBaseClient | undefined, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:nb_update',
    order: 124,
    text: 'Use the nb_update tool only AFTER the user explicitly confirmed the change: nb_get the row first, show the field-by-field before→after diff in the conversation, and ask for the go-ahead. Update just the fields the user asked to change. The call answers the same diff as its receipt, plus the stored row.',
  })

  ctx.tools.register(defineTool({
    name: 'nb_update',
    description: 'Change fields of one business row by collection and id. Confirmed-change contract: nb_get the current row, present the before→after diff, and get the user\'s explicit go-ahead BEFORE calling. Returns the diff receipt and the stored row after the merge.',
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
      values: {
        type: 'object',
        required: true,
        additionalProperties: true,
        description: 'The fields to change (no id); exactly the diff the user confirmed.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          collection: { type: 'string', required: true },
          id: { type: 'number', required: true },
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
          row: { type: 'object', required: true, additionalProperties: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatNbUpdateOutput(value as NbUpdateToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as NbUpdateToolValue
        return { collection: projected.collection, id: projected.id, changed: projected.changes.map(change => change.field) }
      },
    },
    timeoutMs,
    async execute(args, exec) {
      const input = parseNbUpdateArgs(args)
      if (client === undefined) {
        throw new Error('nb_update: this deployment resolves no NocoBase credentials (NOCOBASE_BASE_URL/NOCOBASE_API_KEY); the business tools are unavailable')
      }
      const before = await client.get<NbRow>(input.collection, input.id, undefined, exec.signal)
      if (before === undefined) {
        throw new Error(`nb_update: no row ${input.id} exists in ${input.collection}`)
      }
      const changes = fieldChangesOf(before, input.values)
      const row = await client.update<NbRow>(input.collection, input.id, input.values, exec.signal)
      return { collection: input.collection, id: row.id, changes, row }
    },
    presentCall: args => writeCallCard('nb_update', `${args.collection}#${args.id}`),
    presentResult: (_args: NbUpdateArgs, result: ToolResult): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = result.meta as { collection?: unknown; id?: unknown; changed?: unknown }
      if (typeof meta.collection !== 'string' || typeof meta.id !== 'number' || !Array.isArray(meta.changed)) return undefined
      return {
        card: 'generic',
        title: 'nb_update',
        content: [{ type: 'text', text: `${meta.collection} 第 ${meta.id} 行已更新：${meta.changed.join(', ')}` }],
      }
    },
  }))
}
