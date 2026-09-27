/**
 * The model-facing NocoBase write tools: `nb_create` lands one new row and
 * `nb_update` changes fields of one row, each answering a receipt the
 * conversation can show, and `nb_approve` drives the general approval engine
 * (submit/approve/reject/void) with the audit five elements in its receipt.
 * The in-conversation confirmation lives in the system-prompt guidance, not
 * in tool state: the agent must present the planned change first —
 * nb_create's full new row, nb_update's field-by-field before→after diff
 * over an nb_get — and only call the tool after the user's explicit
 * go-ahead. nb_update's receipt carries the before→after diff of the
 * changed fields so the conversation can echo exactly what landed.
 *
 * Approval semantics: nb_approve re-implements the script engine's act
 * orchestration (examples/kb-agent/scripts/approval-engine.mts) over this
 * package's REST client; both import their transition rules from
 * approval-rules.ts, the single code source of truth, so the two entry
 * points (mobile conversation and NocoBase page workflow callback) cannot
 * drift on rules. nb_create and nb_update run the anti-collision guard (a
 * guarded collection's code must be free; an update exempts the row's own
 * id) and the downstream gate (referenced upstream documents must be
 * effective; configured through the wfl_* collections), and nb_update
 * refuses documents locked under an active flow. The guard's create path is
 * a non-atomic list→create TOCTOU: a concurrent writer can land the same
 * number between the check and the write. Mitigated by the engine's serial
 * write path and the fail-loud refusal on retry; the root fix is the
 * database partial unique index setup-nocobase's unique-index step owns.
 * @module @deepseek-ai/dsh-tool-nocobase/write
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, JsonValue, ToolResult } from '@deepseek-ai/dsh-tools'
import { NocoBaseError, type NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'
import {
  AMOUNT_FIELD,
  SUPPLIER_ADMISSION_STATE_FIELD,
  approversOfRole,
  conditionApplies,
  flowStateLabel,
  gateNotAdmittedMessage,
  gateNotEffectiveMessage,
  gateNotInSetMessage,
  isEffectiveState,
  isWorkflowState,
  parseRequiredStatuses,
  thresholdOf,
  vocabularyForStateField,
  type ApprovalAction,
  type FlowVocabulary,
  type WorkflowState,
} from './approval-rules.ts'
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

/** Model-facing `nb_approve` arguments. */
export interface NbApproveArgs {
  readonly doc_type: string
  readonly doc_id: number
  /** submit | approve | reject | void (resubmit rides submit on a rejected document). */
  readonly action: 'submit' | 'approve' | 'reject' | 'void'
  readonly comment?: string
  /** The acting user's name for the audit record; defaults to admin (the service account). */
  readonly approver?: string
  readonly tenant?: string
}

/** The canonical `nb_approve` output value: the transition receipt (states are whichever vocabulary the flow rides). */
export interface NbApproveToolValue {
  readonly doc_type: string
  readonly doc_id: number
  readonly action: ApprovalAction
  readonly from_state: string
  readonly to_state: string
  readonly from_anchor: 0 | 1 | 2
  readonly to_anchor: 0 | 1 | 2
  readonly attempt_no: number
  readonly effective: boolean
  readonly doc_status: string
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
 * Parse `nb_approve` arguments: no model-supplied tenant, non-empty doc_type,
 * positive integer doc_id, one of the four actions, comment optional.
 * @param args - the schema-validated arguments.
 * @returns the validated approve input.
 */
export function parseNbApproveArgs(args: NbApproveArgs): { docType: string; docId: number; action: NbApproveArgs['action']; comment: string | undefined; approver: string } {
  if (args.tenant !== undefined) {
    throw new Error('nb_approve: the service account is bound by the deployment; a tenant argument is not accepted')
  }
  const docType = args.doc_type.trim()
  if (docType.length === 0) throw new Error('nb_approve: doc_type must be a non-empty collection name')
  if (!Number.isInteger(args.doc_id) || args.doc_id < 1) throw new Error('nb_approve: doc_id must be a positive integer row id')
  const action = args.action
  if (action !== 'submit' && action !== 'approve' && action !== 'reject' && action !== 'void') {
    throw new Error(`nb_approve: action 只接受 submit/approve/reject/void（收到 ${String(action)}）`)
  }
  const comment = args.comment === undefined ? undefined : args.comment.trim()
  const approver = args.approver === undefined || args.approver.trim() === '' ? 'admin' : args.approver.trim()
  return { docType, docId: args.doc_id, action, comment: comment === undefined || comment === '' ? undefined : comment, approver }
}

/**
 * Format the nb_approve outcome: the Chinese transition receipt (states,
 * anchors, attempt, and effectiveness all echo what landed).
 * @param value - the tool's canonical output value.
 * @returns the receipt text.
 */
export function formatNbApproveOutput(value: NbApproveToolValue): string {
  const lines = [
    `${value.doc_type} 第 ${value.doc_id} 行：${flowStateLabel(value.from_state)} → ${flowStateLabel(value.to_state)}`,
    `- 动作: ${value.action}（第 ${value.attempt_no} 轮）`,
    `- ${value.doc_status === value.to_state ? '状态锚点' : 'doc_status 锚点'}: ${value.from_anchor} → ${value.to_anchor}`,
  ]
  if (value.effective) lines.push('- 单据已生效，可驱动下游业务')
  return lines.join('\n')
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
      await enforceCodeUniqueness(client, input.collection, input.values, exec.signal)
      await enforceCreateGates(client, input.collection, input.values, exec.signal)
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
      await assertRowEditable(client, input.collection, before, exec.signal)
      // The side door a code-changing patch would open is closed with the
      // create-side guard: the patch's number must stay free of every row
      // but this one (excludeId), or the update refuses before writing.
      await enforceCodeUniqueness(client, input.collection, input.values, exec.signal, input.id)
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

// ─── the approval engine's tool-side orchestration (approval-rules.ts is the shared rules source) ───

/** One wfl_flow_configs row as the tool orchestration reads it. */
interface FlowConfigRow {
  readonly id: number
  readonly state_field: string
  readonly approver_map: Record<string, string | string[]> | null
  readonly extras: { approved_by_field?: string; approved_at_field?: string; amount_field?: string; amount_threshold?: number } | null
  /** The document column the amount-threshold routing reads (extras.amount_field, default total). */
  readonly amount_field: string
  /** The flow's two-level routing threshold (extras.amount_threshold via thresholdOf; default 100_000). */
  readonly threshold: number
}

/** Read one JSON text column, failing loud on a malformed value. */
function parseJsonColumn<T>(text: unknown, column: string): T | null {
  if (text === null || text === undefined || text === '') return null
  if (typeof text !== 'string') return text as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`wfl_flow_configs 的 ${column} 列不是合法 JSON：${text.slice(0, 120)}`)
  }
}

/**
 * Load the one active flow config for a document type (activation is
 * exclusive per doc_type; zero or many both fail loud).
 * @param client - the shared REST client.
 * @param docType - the document collection name.
 * @param signal - caller cancellation.
 * @returns the resolved config.
 */
async function loadFlowConfig(client: NocoBaseClient, docType: string, signal?: AbortSignal): Promise<FlowConfigRow> {
  const found = await client.list<Record<string, JsonValue>>('wfl_flow_configs', { filter: { doc_type: docType, is_active: true }, pageSize: 5 }, signal)
  if (found.rows.length === 0) {
    throw new Error(`未找到 ${docType} 的激活审批流配置（wfl_flow_configs）；该集合暂未接入审批引擎`)
  }
  if (found.rows.length > 1) {
    throw new Error(`${docType} 存在 ${found.rows.length} 条激活审批流配置（激活互斥被破坏）`)
  }
  const row = found.rows[0]
  if (row === undefined) throw new Error(`未找到 ${docType} 的激活审批流配置（wfl_flow_configs）`)
  const stateField = row['state_field']
  const extras = parseJsonColumn<FlowConfigRow['extras']>(row['extras'], 'extras')
  return {
    id: Number(row['id']),
    state_field: typeof stateField === 'string' && stateField !== '' ? stateField : 'doc_status',
    approver_map: parseJsonColumn<Record<string, string | string[]>>(row['approver_map'], 'approver_map'),
    extras,
    amount_field: extras?.amount_field !== undefined && extras.amount_field !== '' ? extras.amount_field : AMOUNT_FIELD,
    // Fails loud on a malformed amount_threshold (a missing key falls back to the default).
    threshold: thresholdOf(extras),
  }
}

/**
 * Assert every mapped approver username exists in the users table: a stale
 * approver_map naming a missing user refuses before any todo row lands.
 * @param client - the shared REST client.
 * @param docType - the flow's document collection (error context).
 * @param users - the role's resolved approver usernames.
 * @param signal - caller cancellation.
 */
async function assertApproversExist(
  client: NocoBaseClient, docType: string, users: readonly string[], signal?: AbortSignal,
): Promise<void> {
  const { rows } = await client.list<{ username?: unknown }>('users', { pageSize: 200 }, signal)
  const known = new Set(rows.map(row => row['username']).filter((name): name is string => typeof name === 'string'))
  const missing = users.filter(user => !known.has(user))
  if (missing.length > 0) {
    throw new Error(`审批流「${docType}」approver_map 引用不存在的用户：${missing.join('、')}（users 表无此用户名）`)
  }
}

/** The document's current attempt number (0 before the first submit). */
async function currentAttemptOf(client: NocoBaseClient, docType: string, docId: number, signal?: AbortSignal): Promise<number> {
  const records = await client.list<Record<string, JsonValue>>('wfl_approval_records', { filter: { doc_type: docType, doc_id: docId }, pageSize: 500 }, signal)
  return records.rows.reduce((max, row) => Math.max(max, Number(row['attempt_no'] ?? 0)), 0)
}

/** One audit-record entry writeApprovalRecord appends (append-only; the five elements ride the columns). */
interface AuditRecordEntry {
  doc_type: string
  doc_id: number
  approver: string
  action: ApprovalAction
  comment: string | undefined
  attempt_no: number
  from_state: string
  to_state: string
  /** The flow vocabulary's anchor table (doc_status or admission anchors). */
  anchors: Readonly<Record<string, 0 | 1 | 2>>
}

/** Append one audit record row (append-only; the five elements ride the columns). */
async function writeApprovalRecord(client: NocoBaseClient, entry: AuditRecordEntry, signal?: AbortSignal): Promise<void> {
  const existing = await client.list<Record<string, JsonValue>>('wfl_approval_records', { filter: { doc_type: entry.doc_type, doc_id: entry.doc_id }, pageSize: 500 }, signal)
  const nodeSeq = existing.rows.reduce((max, row) => Math.max(max, Number(row['node_seq'] ?? 0)), 0) + 1
  await client.create('wfl_approval_records', {
    doc_type: entry.doc_type, doc_id: entry.doc_id, node_seq: nodeSeq, approver: entry.approver,
    action: entry.action, comment: entry.comment ?? null, attempt_no: entry.attempt_no,
    from_state: entry.from_state, to_state: entry.to_state,
    from_anchor: entry.anchors[entry.from_state], to_anchor: entry.anchors[entry.to_state],
    source: 'engine', acted_at: new Date().toISOString().slice(0, 10),
  }, signal)
}

/** Close the document's open todos at one state. */
async function closeTodosAt(
  client: NocoBaseClient, docType: string, docId: number, state: string, signal?: AbortSignal,
): Promise<void> {
  const todos = await client.list<Record<string, JsonValue>>('wfl_approval_todos', { filter: { doc_type: docType, doc_id: docId, state, status: 'open' }, pageSize: 100 }, signal)
  for (const todo of todos.rows) {
    await client.update('wfl_approval_todos', Number(todo['id']), { status: 'completed' }, signal)
  }
}

/**
 * Create the open todo rows for a state that waits on one role. The role's
 * approver_map value may name several users (an array): each expands to one
 * todo row, and any one of them acting completes the whole tier — the
 * OR-sign-off contract (counter-sign is out of scope).
 */
async function openTodoAt(
  client: NocoBaseClient, flow: FlowConfigRow, docType: string, docId: number, state: string, signal?: AbortSignal,
): Promise<void> {
  const transitions = await client.list<Record<string, JsonValue>>('wfl_flow_transitions', { filter: { flow_id: flow.id, state }, pageSize: 50 }, signal)
  const leaving = transitions.rows.find(row => row['action'] === 'approve')
  if (leaving === undefined) {
    throw new Error(`审批流「${docType}」缺 ${state} 状态的 approve 转移（wfl_flow_transitions）`)
  }
  const users = approversOfRole(flow.approver_map, String(leaving['allowed_role'] ?? ''))
  await assertApproversExist(client, docType, users, signal)
  for (const user of users) {
    await client.create('wfl_approval_todos', {
      doc_type: docType, doc_id: docId, user, state, status: 'open',
      due_date: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    }, signal)
  }
}

/**
 * The `nb_approve` engine: the tool-side twin of approval-engine.mts's
 * submit/act orchestration (same rules module, same table writes, same
 * Chinese failure messages — see the module docs for the same-source
 * contract). Returns the transition receipt value.
 * @param client - the shared REST client.
 * @param input - the parsed nb_approve arguments.
 * @param signal - caller cancellation.
 * @returns the transition receipt.
 */
export async function nbApproveEngine(client: NocoBaseClient, input: { docType: string; docId: number; action: 'submit' | 'approve' | 'reject' | 'void'; comment: string | undefined; approver: string }, signal?: AbortSignal): Promise<NbApproveToolValue> {
  const flow = await loadFlowConfig(client, input.docType, signal)
  const row = await client.get<NbRow>(input.docType, input.docId, undefined, signal)
  if (row === undefined) {
    throw new Error(`单据不存在：${input.docType} 第 ${input.docId} 行`)
  }
  const vocab = vocabularyForStateField(flow.state_field)
  const rawState = row[flow.state_field]
  if (!vocab.isState(rawState)) {
    throw new Error(`${input.docType} 第 ${input.docId} 行的 ${flow.state_field} 列值 ${JSON.stringify(rawState)} 不是合法审批状态`)
  }
  const state = rawState
  const previousAttempt = await currentAttemptOf(client, input.docType, input.docId, signal)

  let next: string | undefined
  let action: ApprovalAction = input.action
  let attemptNo = previousAttempt + 1
  if (input.action === 'submit') {
    // Both vocabularies submit from their entry state (draft / potential).
    action = state === 'draft' || state === 'potential' ? 'submit' : 'resubmit'
    next = vocab.nextOf(state, action, undefined)
  } else {
    const amountRaw = row[flow.amount_field]
    const amount = amountRaw === null || amountRaw === undefined ? undefined : Number(amountRaw)
    next = vocab.nextOf(state, input.action, amount, flow.threshold)
  }
  if (next === undefined) {
    throw new Error(vocab.illegalMessage(state, input.action))
  }

  if (input.action !== 'submit') {
    // The configured transition must admit the move the rules resolved
    // (amount threshold included) — rules and configuration cross-check.
    const transitions = await client.list<Record<string, JsonValue>>('wfl_flow_transitions', { filter: { flow_id: flow.id, state, action: input.action }, pageSize: 50 }, signal)
    const matched = transitions.rows.find(candidate => candidate['next_state'] === next
      && conditionApplies(candidate['condition_expr'] === null || candidate['condition_expr'] === undefined ? undefined : String(candidate['condition_expr']), row))
    if (matched === undefined) {
      throw new Error(`审批流「${input.docType}」缺 ${state}×${input.action}→${next} 的转移配置（wfl_flow_transitions）`)
    }
    if (matched['allow_self_approval'] !== true) {
      const submits = await client.list<Record<string, JsonValue>>('wfl_approval_records', { filter: { doc_type: input.docType, doc_id: input.docId, action: 'submit' }, pageSize: 100 }, signal)
      const lastSubmitter = submits.rows.filter(record => Number(record['attempt_no'] ?? 0) > 0)
        .sort((a, b) => Number(b['attempt_no'] ?? 0) - Number(a['attempt_no'] ?? 0) || Number(b['node_seq'] ?? 0) - Number(a['node_seq'] ?? 0))[0]?.['approver']
      if (lastSubmitter === input.approver) {
        throw new Error(`不允许自审自批：${input.docType} 第 ${input.docId} 行由 ${input.approver} 提交，该转移未开启 allow_self_approval`)
      }
    }
    attemptNo = previousAttempt
  }

  await writeApprovalRecord(client, {
    doc_type: input.docType, doc_id: input.docId, approver: input.approver, action,
    comment: input.comment, attempt_no: attemptNo, from_state: state, to_state: next,
    anchors: vocab.anchors,
  }, signal)
  await closeTodosAt(client, input.docType, input.docId, state, signal)
  const writeBack: Record<string, JsonValue> = { [flow.state_field]: next }
  if (next === vocab.effectiveState && flow.extras !== null) {
    if (flow.extras.approved_by_field !== undefined) writeBack[flow.extras.approved_by_field] = input.approver
    if (flow.extras.approved_at_field !== undefined) writeBack[flow.extras.approved_at_field] = new Date().toISOString().slice(0, 10)
  }
  await client.update<NbRow>(input.docType, input.docId, writeBack, signal)
  // A submitted or resubmitted document waits at its vocabulary's review state
  // (pending / reviewing); an approval that routes to the level-2 sign-off
  // opens the second todo. Both vocabularies share the rule.
  if (action === 'submit' || action === 'resubmit' || next === 'pending_level2') {
    await openTodoAt(client, flow, input.docType, input.docId, next, signal)
  }
  return {
    doc_type: input.docType, doc_id: input.docId, action,
    from_state: state, to_state: next,
    from_anchor: vocab.anchors[state] ?? 0, to_anchor: vocab.anchors[next] ?? 0,
    attempt_no: attemptNo, effective: next === vocab.effectiveState,
    doc_status: next,
  }
}

/**
 * The guarded document-number columns: the collection → number-column map of
 * the PO-/PR-/SO-/MO-/RCV-/SUP-prefixed registry forms (wms_receipts numbers
 * through receipt_no; every other form through code). nb_create refuses a
 * number already in use — engine-side fail-loud (B5 #1), because prompt
 * discipline alone let a model-issued code collide with an existing number.
 */
export const CODE_UNIQUENESS_COLUMNS: Readonly<Record<string, string>> = {
  pur_orders: 'code',
  pur_requests: 'code',
  so_orders: 'code',
  mfg_orders: 'code',
  wms_receipts: 'receipt_no',
  srm_suppliers: 'code',
}

/**
 * The collision refusal text.
 * @param collection - the guarded collection nb_create targets.
 * @param column - the number column the guard matched on.
 * @param code - the duplicate document number.
 * @param existingId - the wire id of the row already holding the number (the row hint renders only when numeric).
 * @returns the fail-loud refusal message.
 */
export function duplicateCodeMessage(collection: string, column: string, code: string, existingId: JsonValue | undefined): string {
  const rowHint = typeof existingId === 'number' ? `（第 ${existingId} 行）` : ''
  return `单据编号撞号：${collection} 已存在 ${column}=${code}${rowHint}，请改用未占用的编号后重试`
}

/**
 * The anti-collision guard nb_create and nb_update share: on the guarded
 * collections, a non-empty document number in the values must be free — a
 * row other than `excludeId` holding the same number refuses the write
 * before anything is written (an update passes `excludeId` so keeping or
 * re-entering the row's own number is not a collision). Collections outside
 * the map and rows without a number pass through untouched. The check-then-
 * write is a non-atomic TOCTOU window: the engine's serial write path and
 * the fail-loud refusal on retry mitigate it, and the database partial
 * unique index (setup-nocobase's unique-index step) is the authoritative
 * backstop behind this preflight.
 * @param client - the shared REST client.
 * @param collection - the collection the write targets.
 * @param values - the written row's values (create: the full row; update: the patch).
 * @param signal - caller cancellation.
 * @param excludeId - the updated row's own id (create omits it; every
 * existing row then counts as a collision).
 */
export async function enforceCodeUniqueness(
  client: NocoBaseClient, collection: string, values: Readonly<Record<string, JsonValue>>, signal?: AbortSignal, excludeId?: number,
): Promise<void> {
  const column = CODE_UNIQUENESS_COLUMNS[collection]
  if (column === undefined) return
  const code = values[column]
  if (typeof code !== 'string' || code === '') return
  const { rows } = await client.list<NbRow>(collection, { filter: { [column]: code }, pageSize: 5 }, signal)
  const clash = rows.find(row => row['id'] !== excludeId)
  if (clash !== undefined) {
    throw new Error(duplicateCodeMessage(collection, column, code, clash['id']))
  }
}

/**
 * The nb_create downstream gate: for every wfl_gate_configs row binding the
 * target collection, the values' referenced upstream row must pass — a
 * doc_status gate needs the effective state, a lifecycle gate (the supplier
 * gate) needs the referenced row's lifecycle column inside the configured
 * enum set. A gate whose reference field is absent in the values does not
 * bind.
 * @param client - the shared REST client.
 * @param collection - the collection nb_create targets.
 * @param values - the new row's values.
 * @param signal - caller cancellation.
 */
export async function enforceCreateGates(
  client: NocoBaseClient, collection: string, values: Readonly<Record<string, JsonValue>>, signal?: AbortSignal,
): Promise<void> {
  const gates = await engineList(client, 'wfl_gate_configs', { downstream_collection: collection }, signal)
  for (const gate of gates) {
    const upstreamField = String(gate['upstream_field'] ?? '')
    const ref = values[upstreamField]
    if (ref === null || ref === undefined || ref === '') continue
    const upstream = String(gate['upstream_collection'] ?? '')
    const label = gate['upstream_label'] === null || gate['upstream_label'] === undefined ? upstream : String(gate['upstream_label'])
    const refField = gate['upstream_ref_field']
    const upstreamRows = refField === null || refField === undefined || refField === ''
      ? [await client.get<NbRow>(upstream, Number(ref), undefined, signal)].filter((row): row is NbRow => row !== undefined)
      : (await client.list<NbRow>(upstream, { filter: { [String(refField)]: ref }, pageSize: 5 }, signal)).rows
    if (upstreamRows.length === 0) {
      const stateFieldRaw = gate['upstream_state_field']
      const stateField = stateFieldRaw === null || stateFieldRaw === undefined || stateFieldRaw === '' ? 'doc_status' : String(stateFieldRaw)
      throw new Error(stateField === 'doc_status'
        ? `上游单据未生效：找不到 ${label} ${String(ref)}（在 ${upstream} 中无匹配行），未生效单据不能驱动下游业务`
        : `供应商卡口未通过：找不到 ${label} ${String(ref)}（在 ${upstream} 中无匹配行），未准入/不合格供方不能下采购单`)
    }
    const upstreamFirst = upstreamRows[0]
    if (upstreamFirst === undefined) {
      throw new Error(`上游单据未生效：找不到 ${label} ${String(ref)}（在 ${upstream} 中无匹配行），未生效单据不能驱动下游业务`)
    }
    const stateFieldRaw = gate['upstream_state_field']
    const stateField = stateFieldRaw === null || stateFieldRaw === undefined || stateFieldRaw === '' ? 'doc_status' : String(stateFieldRaw)
    if (stateField === 'doc_status') {
      const upstreamState = upstreamFirst['doc_status']
      if (!isWorkflowState(upstreamState)) {
        throw new Error(gateNotEffectiveText(label, String(ref), 'draft'))
      }
      if (!isEffectiveState(upstreamState)) {
        throw new Error(gateNotEffectiveText(label, String(ref), upstreamState))
      }
      continue
    }
    // A lifecycle gate must name its admitted set explicitly — an empty set
    // would admit nothing, which is a seed error, not a policy.
    const required = parseRequiredStatuses(gate['required_status'] === null || gate['required_status'] === undefined ? null : String(gate['required_status']))
    if (required.length === 0) {
      throw new Error(`卡口配置错误：${collection}→${upstream} 的 ${stateField} 卡口未配置 required_status 集合（如 qualified,preferred）`)
    }
    const actual = upstreamFirst[stateField]
    if (typeof actual !== 'string' || !required.includes(actual)) {
      // Supplier-lifecycle gates keep their admission wording; every other
      // state-field set gate (B3's invoice gate) renders the generic text.
      const actualText = JSON.stringify(actual ?? '') ?? ''
      const refusal = stateField === SUPPLIER_ADMISSION_STATE_FIELD
        ? gateNotAdmittedMessage(label, String(ref), actualText, required)
        : gateNotInSetMessage(label, String(ref), stateField, actualText, required)
      throw new Error(refusal)
    }
  }
}

/** The gate refusal text (kept beside enforceCreateGates; mirrors approval-rules' message). */
function gateNotEffectiveText(label: string, ref: string, state: WorkflowState | 'draft'): string {
  return gateNotEffectiveMessage(label, ref, state as WorkflowState)
}

/**
 * The nb_update edit lock: when the collection has an active flow config and
 * the row sits in a locked state (pending, pending_level2, approved, void),
 * direct edits refuse; draft and rejected stay editable.
 * @param client - the shared REST client.
 * @param collection - the collection nb_update targets.
 * @param before - the row as read immediately before the update.
 * @param signal - caller cancellation.
 */
export async function assertRowEditable(client: NocoBaseClient, collection: string, before: NbRow, signal?: AbortSignal): Promise<void> {
  const flows = await engineList(client, 'wfl_flow_configs', { doc_type: collection, is_active: true }, signal)
  const flowRow = flows[0]
  if (flowRow === undefined) return
  const stateField = flowRow['state_field']
  const vocab: FlowVocabulary = vocabularyForStateField(typeof stateField === 'string' && stateField !== '' ? stateField : 'doc_status')
  const state = before[vocab.stateField]
  if (vocab.isState(state) && vocab.lockedStates.includes(state)) {
    throw new Error(`单据已锁定编辑：${collection} 当前状态「${flowStateLabel(state)}」，审批中/已生效/已作废的单据禁止直接修改`)
  }
}

/**
 * List one wfl_* engine table, answering [] when the server has no such
 * collection (HTTP 404): a deployment that never ran the approval setup has
 * no engine to enforce, so the write tools keep their pre-engine behavior
 * there. Every other failure surfaces.
 */
async function engineList(
  client: NocoBaseClient, collection: string, filter: Record<string, JsonValue>, signal?: AbortSignal,
): Promise<Array<Record<string, JsonValue>>> {
  try {
    const found = await client.list<Record<string, JsonValue>>(collection, { filter, pageSize: 50 }, signal)
    return found.rows
  } catch (error) {
    if (error instanceof NocoBaseError && error.code === 'NOCOBASE_HTTP_ERROR' && error.status === 404) return []
    throw error
  }
}

/**
 * Register the `nb_approve` tool and its system-prompt guidance carrying the
 * in-conversation approval contract (present the document and the pending
 * action, get the user's explicit 同意/驳回 first).
 * @param ctx - context whose registries receive the registrations.
 * @param client - the resolved NocoBase REST client (or undefined in the degraded mode).
 * @param timeoutMs - cooperative tool-call budget attached as `ToolDefinition.timeoutMs`.
 */
export function applyNbApproveTool(ctx: Context, client: NocoBaseClient | undefined, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:nb_approve',
    order: 125,
    text: 'Use nb_approve to drive the approval engine on one document: submit a draft for approval, approve/reject a pending document, or void an approved one. Present the document (type, number, amount) and the intended action in business language and get the user\'s explicit go-ahead BEFORE calling. Rejects should carry the user\'s reason in comment. The receipt echoes the state transition, the doc_status anchor, and the attempt round.',
  })

  ctx.tools.register(defineTool({
    name: 'nb_approve',
    description: 'Drive one document through the approval engine (submit/approve/reject/void). Confirmed-change contract: present the document and action, get the user\'s explicit go-ahead BEFORE calling. Returns the transition receipt (from/to state, anchors, attempt round, effectiveness).',
    parameters: {
      doc_type: {
        type: 'string',
        required: true,
        description: 'Document collection name (e.g. hub_po_purchase_orders).',
      },
      doc_id: {
        type: 'number',
        required: true,
        description: 'The document row\'s primary-key id.',
      },
      action: {
        type: 'string',
        required: true,
        description: 'One of submit | approve | reject | void. submit on a rejected document resubmits it (attempt +1).',
      },
      comment: {
        type: 'string',
        description: 'The actor\'s remark recorded in the audit trail (rejects read best with one).',
      },
      approver: {
        type: 'string',
        description: 'The acting user\'s name for the audit record; defaults to admin.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          doc_type: { type: 'string', required: true },
          doc_id: { type: 'number', required: true },
          action: { type: 'string', required: true },
          from_state: { type: 'string', required: true },
          to_state: { type: 'string', required: true },
          from_anchor: { type: 'number', required: true },
          to_anchor: { type: 'number', required: true },
          attempt_no: { type: 'number', required: true },
          effective: { type: 'boolean', required: true },
          doc_status: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatNbApproveOutput(value as NbApproveToolValue) }],
      presentationMeta: (_args, value) => {
        const projected = value as NbApproveToolValue
        return { doc_type: projected.doc_type, doc_id: projected.doc_id, to_state: projected.to_state }
      },
    },
    timeoutMs,
    async execute(args, exec) {
      const input = parseNbApproveArgs(args as NbApproveArgs)
      if (client === undefined) {
        throw new Error('nb_approve: this deployment resolves no NocoBase credentials (NOCOBASE_BASE_URL/NOCOBASE_API_KEY); the business tools are unavailable')
      }
      return await nbApproveEngine(client, input, exec.signal)
    },
    presentCall: args => writeCallCard('nb_approve', `${args.doc_type}#${args.doc_id}`),
    presentResult: (_args: NbApproveArgs, result: ToolResult): GenericResultView | undefined => {
      if (result.isError) return undefined
      const meta = result.meta as { doc_type?: unknown; doc_id?: unknown; to_state?: unknown }
      if (typeof meta.doc_type !== 'string' || typeof meta.doc_id !== 'number' || typeof meta.to_state !== 'string') return undefined
      return {
        card: 'generic',
        title: 'nb_approve',
        content: [{ type: 'text', text: `${meta.doc_type} 第 ${meta.doc_id} 行已进入「${flowStateLabel(meta.to_state)}」` }],
      }
    },
  }))
}
