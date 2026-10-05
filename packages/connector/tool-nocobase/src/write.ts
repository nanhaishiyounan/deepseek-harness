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
import { NocoBaseError, type NocoBaseClient, sessionActingUserOf } from '@deepseek-ai/dsh-connector-nocobase'
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
  DOC_TERMINAL_ACTIONS,
  type BusinessAction,
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

/**
 * The submitter-stamping columns: collections whose row records who performed
 * the registration. When the executing session carries an acting user, these
 * columns land that username regardless of what the model proposed — the
 * audit value is server-owned (G4), never model-narrative.
 */
export const ACTING_USER_COLUMNS: Readonly<Record<string, string>> = {
  pur_requests: 'requester',
  qm_inspections: 'inspector',
  mfg_job_reports: 'operator',
}

/**
 * Stamp the acting user onto the collection's submitter column, when the
 * session carries one. Collections without a configured column and anonymous
 * sessions pass the values through unchanged.
 * @param collection - the collection nb_create targets.
 * @param values - the proposed row values.
 * @param acting - the session's acting user, or undefined when anonymous.
 * @returns the values to write (the input object when nothing changes).
 */
export function applyActingUserColumns(
  collection: string,
  values: Readonly<Record<string, JsonValue>>,
  acting: { username: string } | undefined,
): Record<string, JsonValue> {
  const column = ACTING_USER_COLUMNS[collection]
  if (column === undefined || acting === undefined) return { ...values }
  return { ...values, [column]: acting.username }
}

/**
 * The refusal `nb_update` answers for a `wfl_approval_todos` write under a
 * session with no bound acting user (W10-R4): the todos rows are the
 * signed-in user's private data, so the last ungated write entry closes the
 * same way the nb_list/nb_get read gates did (W9-B2/W9-R1).
 */
const TODOS_UPDATE_UNBOUND_REFUSAL = 'nb_update: 审批待办（wfl_approval_todos）是登录用户的私有数据；当前会话未绑定登录身份，拒绝修改'

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
  /** submit/approve/reject/void (resubmit rides submit) plus the W5-B5 business actions, which delegate whole to the engine. */
  readonly action: 'submit' | 'approve' | 'reject' | 'void' | BusinessAction
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
 * positive integer doc_id, one of the four core actions or a W5-B5 business
 * action (settle / admission grade moves — engine-delegated), comment optional.
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
  const business = (DOC_TERMINAL_ACTIONS as readonly string[]).includes(action)
  if (action !== 'submit' && action !== 'approve' && action !== 'reject' && action !== 'void' && !business) {
    throw new Error(`nb_approve: action 只接受 submit/approve/reject/void 或业务动作（${DOC_TERMINAL_ACTIONS.join('/')}）（收到 ${String(action)}）`)
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
      const stamped = applyActingUserColumns(input.collection, input.values, sessionActingUserOf(exec.agent?.id))
      const values = await allocateEmptyCode(client, input.collection, stamped, exec.signal)
      await enforceCodeUniqueness(client, input.collection, values, exec.signal)
      await enforceCreateGates(client, input.collection, values, exec.signal)
      const row = await client.create<NbRow>(input.collection, values, exec.signal)
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
      // W10-R4: the todos write closes the last ungated write entry the same
      // way nb_get closes single-row reads (W9-R1): an unbound session refuses
      // before any wire call; a bound session refuses any row whose user is
      // not the acting username. The approval engine's own todo writes
      // (nb_approve's create/complete transitions) ride the client directly
      // and never pass through this tool, so the engine's server-owned
      // approver stamping is untouched.
      const actingUsername = input.collection === 'wfl_approval_todos'
        ? sessionActingUserOf(exec.agent?.id)?.username
        : undefined
      if (input.collection === 'wfl_approval_todos' && actingUsername === undefined) {
        throw new Error(TODOS_UPDATE_UNBOUND_REFUSAL)
      }
      const before = await client.get<NbRow>(input.collection, input.id, undefined, exec.signal)
      if (before === undefined) {
        throw new Error(`nb_update: no row ${input.id} exists in ${input.collection}`)
      }
      if (input.collection === 'wfl_approval_todos') {
        // The owner column is a username string on every well-formed row; a
        // non-string cell fails the scope the same way a foreign one does
        // (the nb_get owner check's twin).
        const rowUser = before['user']
        if (typeof rowUser !== 'string' || rowUser !== actingUsername) {
          throw new Error(`nb_update: 该审批待办不属于账号 ${actingUsername ?? '(未绑定)'}，拒绝跨用户修改`)
        }
      }
      await assertRowEditable(client, input.collection, before, input.values, exec.signal)
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
  readonly approver_map: Record<string, unknown> | null
  readonly extras: {
    approved_by_field?: string
    approved_at_field?: string
    amount_field?: string
    amount_threshold?: number
    /** W5-B2 graph-owned keys whose presence marks an engine-side advanced flow. */
    sign_modes?: unknown
    cc_after?: unknown
    condition_dsl?: unknown
  } | null
  /** The document column the amount-threshold routing reads (extras.amount_field, default total). */
  readonly amount_field: string
  /** The flow's two-level routing threshold (extras.amount_threshold via thresholdOf; default 100_000). */
  readonly threshold: number
}

/**
 * Whether one flow needs the engine's W5-B2 runtime (department/marker
 * approver entries, countersign/sequential aggregation, cc rows, or the
 * row-driven general condition routing): this tool-side twin implements the
 * static template only, so such flows delegate whole to the engine's POST
 * /act — one code path per feature, no forked semantics (BP-02/BP-14).
 * @param flow - the resolved flow configuration.
 * @returns true when the act must run on the engine.
 */
export function flowNeedsEngine(flow: Pick<FlowConfigRow, 'approver_map' | 'extras'>): boolean {
  for (const value of Object.values(flow.approver_map ?? {})) {
    const entries = Array.isArray(value) ? value : [value]
    if (entries.some(entry => typeof entry === 'object' && entry !== null)) return true
  }
  const extras = flow.extras ?? {}
  return extras.sign_modes !== undefined || extras.cc_after !== undefined || extras.condition_dsl === 'v2'
}

/**
 * Reach the engine's single effective-effect exit for a LOCAL act that just
 * landed effective (BP-02: the mobile twin used to skip these hooks
 * entirely). The hooks are idempotent. A failed call (W6-B1, the G8 fix)
 * lands the document on the `wfl_effect_backlog` compensation queue — one
 * pending row per still-unreplayed document — which the engine's serve loop
 * replays automatically once the engine is back; the tool still fails loud
 * so the conversation reports the deferred hook instead of silently
 * skipping, but nobody re-curls the replay by hand anymore.
 * @param client - the shared REST client (the backlog insert must not depend
 * on the engine being up — NocoBase itself is the durable store).
 * @param input - the parsed nb_approve arguments.
 * @param code - the document's business code (reserveForSo resolves by it).
 */
async function runEffectsViaEngine(client: NocoBaseClient, input: { docType: string; docId: number }, code: string): Promise<void> {
  const base = (process.env['NOCOBASE_ENGINE_URL'] ?? 'http://127.0.0.1:13110').replace(/\/$/u, '')
  const deferred = async (reason: string): Promise<never> => {
    // Idempotent enqueue: a still-pending row for the same document updates
    // in place (the newest failure reason wins) instead of stacking.
    const queued = await client.list<NbRow>('wfl_effect_backlog', {
      filter: { doc_type: input.docType, doc_id: input.docId, status: 'pending' }, page: 1, pageSize: 5,
    }).catch(() => ({ rows: [] as NbRow[] }))
    if (queued.rows.length > 0) {
      for (const row of queued.rows) {
        await client.update('wfl_effect_backlog', Number(row['id']), { reason }).catch(() => undefined)
      }
    } else {
      await client.create('wfl_effect_backlog', { doc_type: input.docType, doc_id: input.docId, code, reason, status: 'pending', attempts: 0 })
    }
    throw new Error(`nb_approve：单据已生效，但生效钩子（${input.docType}#${String(input.docId)}）暂未执行（${reason}）——已转入补偿队列，引擎恢复后自动重放，无需人工处理`)
  }
  let response: Response
  try {
    response = await fetch(`${base}/effective-effects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc_type: input.docType, doc_id: input.docId, code }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw await deferred(`引擎不可达：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw await deferred(payload?.error ?? `HTTP ${String(response.status)}`)
  }
}

/**
 * The engine delegation (W5-B2): POST the act to approval-engine --serve,
 * which runs the same orchestration plus the runtime resolution,
 * aggregation, cc, and the single effective-effect exit (so_orders/
 * mps_plans hooks included — BP-02). The engine owns advanced flows; this
 * twin keeps only the static template (byte-parity with the pre-B2 path).
 * @param input - the parsed nb_approve arguments.
 * @returns the transition receipt the engine produced.
 */
async function delegateToEngine(input: { docType: string; docId: number; action: 'submit' | 'approve' | 'reject' | 'void' | BusinessAction; comment: string | undefined; approver: string }): Promise<NbApproveToolValue> {
  const base = (process.env['NOCOBASE_ENGINE_URL'] ?? 'http://127.0.0.1:13110').replace(/\/$/u, '')
  const path = input.action === 'submit' ? '/submit' : '/act'
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        doc_type: input.docType, doc_id: input.docId,
        ...(input.action === 'submit' ? {} : { action: input.action }),
        approver: input.approver, ...(input.comment === undefined ? {} : { comment: input.comment }),
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw new Error(`nb_approve：审批流「${input.docType}」使用了部门/会签/依次/抄送/通用条件等引擎侧特性，需经审批引擎执行，但引擎服务（${base}）不可达（${error instanceof Error ? error.message : String(error)}）；请先启动 approval-engine --serve 再重试本操作`)
  }
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; result?: Partial<NbApproveToolValue> } | null
  if (!response.ok || payload === null || payload.ok !== true || payload.result === undefined) {
    throw new Error(`nb_approve（引擎执行）：${payload?.error ?? `HTTP ${String(response.status)}`}`)
  }
  const result = payload.result
  return {
    doc_type: result.doc_type ?? input.docType,
    doc_id: result.doc_id ?? input.docId,
    action: result.action ?? input.action,
    from_state: result.from_state ?? '',
    to_state: result.to_state ?? '',
    from_anchor: result.from_anchor ?? 0,
    to_anchor: result.to_anchor ?? 0,
    attempt_no: result.attempt_no ?? 0,
    effective: result.effective === true,
    doc_status: result.to_state ?? '',
  }
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
    approver_map: parseJsonColumn<Record<string, unknown>>(row['approver_map'], 'approver_map'),
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
 * The mobile-leg authorization gate: a session-bound acting user may approve
 * or reject only a document that holds one of their OPEN todos (kind=cc rows
 * never authorize). The engine's own OR-sign-off path admits any non-self
 * approver, so the acting-user channel carries the assignment check the
 * configured flow implies — the refusal names the routing so the operator
 * learns whose queue the document sits in.
 * @param client - the shared REST client.
 * @param input - the parsed nb_approve arguments (doc identity only).
 * @param username - the session's acting user.
 * @param signal - caller cancellation.
 */
export async function assertActingUserHoldsTodo(
  client: NocoBaseClient, input: { docType: string; docId: number }, username: string, signal?: AbortSignal,
): Promise<void> {
  const todos = await engineList(client, 'wfl_approval_todos', { doc_type: input.docType, doc_id: input.docId, user: username, status: 'open' }, signal)
  if (todos.some(todo => String(todo['kind'] ?? 'todo') !== 'cc')) return
  throw new Error(`越权审批被拒：当前登录用户 ${username} 在 ${input.docType} 第 ${String(input.docId)} 行没有待办（待办由审批流配置路由到该节点的审批人，在 PC 审批中心或持待办账号处理）`)
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
export async function nbApproveEngine(client: NocoBaseClient, input: { docType: string; docId: number; action: 'submit' | 'approve' | 'reject' | 'void' | BusinessAction; comment: string | undefined; approver: string }, signal?: AbortSignal): Promise<NbApproveToolValue> {
  // W5-B5: business actions (settle / admission grade moves) live only in the
  // flow's derived terminal transition rows — this twin implements no
  // template for them, so they delegate whole to the engine.
  if ((DOC_TERMINAL_ACTIONS as readonly string[]).includes(input.action)) {
    return await delegateToEngine(input)
  }
  const flow = await loadFlowConfig(client, input.docType, signal)
  // W5-B2: advanced flows (department routing, markers, countersign,
  // sequential, cc, general conditions) run on the engine — one code path per
  // feature, and the effective-effect hooks ride the same call (BP-02/14).
  if (flowNeedsEngine(flow)) {
    return await delegateToEngine(input)
  }
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
  // BP-02 (W5-B2): a local act that lands effective reaches the same
  // effective-effect exit the engine runs inline (the hooks are idempotent,
  // so a replay after a hiccup is safe).
  if (next === vocab.effectiveState) {
    const code = typeof row['code'] === 'string' && row['code'] !== '' ? row['code'] : String(input.docId)
    await runEffectsViaEngine(client, input, code)
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
 * The number format each guarded collection's server-side allocation draws
 * from (W6-B1): `PREFIX-YYYY-NNNN`. The prefix is the same one the mobile
 * registry's rule text declares, restated here because the write path has no
 * registry access — the two tables change together or not at all.
 */
const CODE_PREFIXES: Readonly<Record<string, string>> = {
  pur_orders: 'PO',
  pur_requests: 'PR',
  so_orders: 'SO',
  mfg_orders: 'MO',
  wms_receipts: 'RCV',
  srm_suppliers: 'SUP',
}

/**
 * Draw the next `PREFIX-YYYY-NNNN` number for one guarded collection: the
 * number column read back descending inside the current year's band (a
 * `$like` prefix filter — probe numbers like PO-W6B1-… sort above PO-2026-…
 * lexically and would crowd the plain descending first page out of the
 * year's real max) and the same-year max suffix across the page decides — a
 * year rollover or an empty table restarts at 0001. Scanning the whole page
 * (not just its head) keeps the draw correct even where a backend ignores
 * the sort. The clock fallback (a same-minute draw exhausting the 4-digit
 * space) keeps the number format-true like the retired client-side preview
 * did.
 * @param client - the shared REST client.
 * @param collection - the guarded collection.
 * @param column - the number column.
 * @param prefix - the collection's `PREFIX` from CODE_PREFIXES.
 * @param signal - caller cancellation.
 * @returns the allocated number.
 */
export async function nextNumberFor(
  client: NocoBaseClient, collection: string, column: string, prefix: string, signal?: AbortSignal,
): Promise<string> {
  const year = new Date().getFullYear()
  const base = `${prefix}-${String(year)}-`
  // The prefix filter keeps the descending read inside the current year's
  // number band — probe numbers like PO-W6B1-… sort above PO-2026-… lexically
  // and would otherwise crowd the first page out of the year's max suffix.
  const { rows } = await client.list<NbRow>(collection, {
    filter: { [column]: { $like: `${base}%` } },
    sort: [`-${column}`], page: 1, pageSize: 5, fields: [column],
  }, signal)
  let max = 0
  for (const row of rows) {
    const value = row[column]
    if (typeof value !== 'string' || !value.startsWith(base)) continue
    const suffix = Number(value.slice(base.length))
    if (Number.isInteger(suffix) && suffix > max) max = suffix
  }
  const next = max + 1
  const clock = new Date().getHours() * 60 + new Date().getMinutes()
  return `${base}${next > 9999 ? String(clock).padStart(4, '0') : String(next).padStart(4, '0')}`
}

/**
 * Server-side number allocation (W6-B1, the G5 fix): a create on a guarded
 * collection whose number column arrives empty or blank draws the next number
 * inside the write path. The mobile surface stopped pre-generating numbers
 * (two clients drafting the same form drew the same preview number and the
 * later submit bounced); the write path owns the number now, so concurrent
 * drafts cannot collide and an outbox retry re-draws a fresh number instead
 * of failing on the stale one. The allocation stays a read-then-write window
 * behind the engine's serial write path; the partial unique index remains the
 * authoritative backstop, exactly as for caller-supplied numbers.
 * @param client - the shared REST client.
 * @param collection - the collection nb_create targets.
 * @param values - the written row's values; a drawn number lands in place.
 * @param signal - caller cancellation.
 * @returns the values to write (the input object when nothing changes).
 */
export async function allocateEmptyCode(
  client: NocoBaseClient, collection: string, values: Record<string, JsonValue>, signal?: AbortSignal,
): Promise<Record<string, JsonValue>> {
  const column = CODE_UNIQUENESS_COLUMNS[collection]
  const prefix = CODE_PREFIXES[collection]
  if (column === undefined || prefix === undefined) return values
  const current = values[column]
  if (typeof current === 'string' && current !== '') return values
  return { ...values, [column]: await nextNumberFor(client, collection, column, prefix, signal) }
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
  return gateNotEffectiveMessage(label, ref, state)
}

/**
 * The nb_update edit lock: when the collection has an active flow config and
 * the row sits in a locked state (pending, pending_level2, approved, void),
 * direct edits refuse; draft and rejected stay editable. The update's values
 * may never touch the flow's state column itself (W5-B3/B5): state moves ride
 * the engine (nb_approve / --act / the admission grade actions), so writing
 * doc_status or lifecycle_status directly refuses in every state — closing
 * the draft-side bypass a direct write used to allow.
 * @param client - the shared REST client.
 * @param collection - the collection nb_update targets.
 * @param before - the row as read immediately before the update.
 * @param values - the update's changed fields (the state-column refusal reads their keys).
 * @param signal - caller cancellation.
 */
export async function assertRowEditable(
  client: NocoBaseClient, collection: string, before: NbRow,
  values: Record<string, JsonValue> = {}, signal?: AbortSignal,
): Promise<void> {
  const flows = await engineList(client, 'wfl_flow_configs', { doc_type: collection, is_active: true }, signal)
  const flowRow = flows[0]
  if (flowRow === undefined) return
  const stateField = flowRow['state_field']
  const vocab: FlowVocabulary = vocabularyForStateField(typeof stateField === 'string' && stateField !== '' ? stateField : 'doc_status')
  if (Object.keys(values).includes(vocab.stateField)) {
    throw new Error(`状态列受控：${collection} 的 ${vocab.stateField} 只能经审批引擎转移（nb_approve / approval-engine --act），不能直接修改`)
  }
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
        description: 'One of submit | approve | reject | void, or a business action (settle | promote | demote | restrict | freeze | eliminate | restore). submit on a rejected document resubmits it (attempt +1); business actions run on the engine (terminal transitions).',
      },
      comment: {
        type: 'string',
        description: 'The actor\'s remark recorded in the audit trail (rejects read best with one).',
      },
      approver: {
        type: 'string',
        description: 'The acting user\'s name for the audit record; a session-bound login identity (the gateway sign-in token) overrides this value server-side. Anonymous sessions are refused — approvals need a signed-in audit actor.',
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
      const acting = sessionActingUserOf(exec.agent?.id)
      if (acting === undefined) {
        // Anonymous approvals have no audit actor: the audit trail must carry
        // a verified sign-in identity, so the caller is refused rather than
        // falling back to the service account.
        throw new Error('nb_approve: 审批动作需要登录身份——请先登录（会话凭据由服务端校验），匿名会话不能执行审批')
      }
      if (input.action === 'approve' || input.action === 'reject') {
        await assertActingUserHoldsTodo(client, input, acting.username, exec.signal)
      }
      return await nbApproveEngine(client, { ...input, approver: acting.username }, exec.signal)
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
