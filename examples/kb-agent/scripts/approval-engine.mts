/**
 * W1: the general approval engine — the single write path every doc_status
 * transition goes through (plans/2026-09-25-mfg-closure/02-b1-approval-engine.md).
 * Three entry points converge on the same functions: the mobile conversation
 * (`nb_approve` in tool-nocobase, which re-implements this orchestration over
 * the shared rules module), the NocoBase page (a wfl_approval_records intent
 * row → collection workflow → HTTP callback on :13110), and this CLI. The
 * transition rules themselves live in
 * packages/connector/tool-nocobase/src/approval-rules.ts — the single
 * code source of truth both sides import, so the two orchestrations cannot
 * drift on rules (they stay structurally parallel by contract).
 *
 * Effects per act(): the append-only wfl_approval_records row (who/when/
 * action/comment/attempt — the five audit elements), the current todo's
 * completion (and the level-2 todo's creation on the amount-threshold
 * route), and the document's doc_status write-back (with the anchor pair
 * recorded; `approved` also lands approved_by/approved_at when the flow
 * config names those columns).
 *
 * Usage (repo root, tsx loader):
 *   node --import tsx/esm examples/kb-agent/scripts/approval-engine.mts --selftest
 *   node --import tsx/esm examples/kb-agent/scripts/approval-engine.mts --seed-flow
 *   node --import tsx/esm examples/kb-agent/scripts/approval-engine.mts --seed-admission
 *   node --import tsx/esm examples/kb-agent/scripts/approval-engine.mts --submit hub_po_purchase_orders 12
 *   node --import tsx/esm examples/kb-agent/scripts/approval-engine.mts --act hub_po_purchase_orders 12 approve admin 同意
 *   node --import tsx/esm examples/kb-agent/scripts/approval-engine.mts --todos
 *   node --import tsx/esm examples/kb-agent/scripts/approval-engine.mts --serve 13110
 *
 * B4 rides --serve with two WMS callbacks: POST /post-count-adjust (the
 * count-approval workflow's request node) and POST /scan-reorder (the ROP
 * scan an external cron curls; the open-source NocoBase snapshot ships no
 * schedule workflow plugin). B7 adds POST /run-mrp (the nightly close the
 * same cron curls) and POST /confirm-suggestion (the plan-workbench intent
 * workflow's callback; the engine consumes the intent row on success), and
 * every so_orders act that lands approved fires the finished-goods
 * reservation (mrp-run's reserveForSo, dynamically imported so the module
 * graph stays acyclic).
 *
 * W2-B7 adds the built-in nightly timer (default off — env opt-in; the
 * W-round external-cron curls stay available, pick one, never both) and
 * POST /run-nightly (a manual one-shot pass through the same leg sequence,
 * available whether or not the timer is armed). Timer legs per fire:
 * scan-reorder → run-mrp → (month-end only) snapshot-month → calc-kpi, and
 * a quarter-start day appends calc-scorecard; a failed leg logs and the
 * next leg still runs (legs never block each other).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { call, dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'
import { calcScorecard, postCountAdjust, scanReorder, snapshotMonthlyBalances } from './nocobase-h5-wms.mts'
import {
  AMOUNT_FIELD,
  DEFAULT_AMOUNT_THRESHOLD,
  DOC_FLOW_VOCABULARY,
  DOC_STATUS_ANCHORS,
  EFFECTIVE_STATE,
  SUPPLIER_ADMISSION_ANCHORS,
  SUPPLIER_ADMISSION_STATE_FIELD,
  SUPPLIER_ADMISSION_STATES,
  WORKFLOW_STATES,
  approversOfRole,
  conditionApplies,
  flowStateLabel,
  gateNotAdmittedMessage,
  gateNotEffectiveMessage,
  gateNotInSetMessage,
  isWorkflowState,
  nextStateOf,
  parseRequiredStatuses,
  thresholdOf,
  vocabularyForStateField,
  type ApprovalAction,
  type FlowVocabulary,
  type SupplierAdmissionState,
  type WorkflowState,
} from '../../../packages/connector/tool-nocobase/src/approval-rules.ts'

/** The data access the engine orchestration runs over (REST in production, in-memory in --selftest). */
export interface NocoIO {
  list(collection: string, filter?: Record<string, unknown>): Promise<Array<Record<string, any>>>
  get(collection: string, id: number): Promise<Record<string, any> | undefined>
  create(collection: string, values: Record<string, unknown>): Promise<Record<string, any>>
  update(collection: string, id: number, values: Record<string, unknown>): Promise<void>
  /**
   * Optimistic conditional update (the h5 stock versioning pattern): matches
   * the filter instead of the bare id and reports how many rows moved. The
   * engine's write-back rides it so two concurrent acts on one document
   * cannot both pass validation — the loser sees zero rows and fails loud.
   */
  updateWhere(collection: string, filter: Record<string, unknown>, values: Record<string, unknown>): Promise<number>
  destroy(collection: string, id: number): Promise<void>
}

/** One wfl_flow_configs row (the engine's resolved configuration). */
export interface FlowConfig {
  readonly id: number
  readonly doc_type: string
  readonly state_field: string
  readonly approver_map: Record<string, string | string[]>
  readonly extras: { approved_by_field?: string, approved_at_field?: string, amount_field?: string, amount_threshold?: number, invoice_match_tolerance?: number } | null
  /** The document column the amount-threshold routing reads (extras.amount_field, default total). */
  readonly amount_field: string
  /** The flow's two-level routing threshold (extras.amount_threshold via thresholdOf; default 100_000). */
  readonly threshold: number
}

/** The engine's act() outcome, mirrored by nb_approve's receipt. */
export interface ActResult {
  readonly doc_type: string
  readonly doc_id: number
  readonly action: ApprovalAction
  readonly from_state: WorkflowState
  readonly to_state: WorkflowState
  readonly from_anchor: 0 | 1 | 2
  readonly to_anchor: 0 | 1 | 2
  readonly attempt_no: number
  readonly effective: boolean
}

const today = (): string => new Date().toISOString().slice(0, 10)

const listFilter = (filter: Record<string, unknown> | undefined): string =>
  filter === undefined ? '' : `&filter=${encodeURIComponent(JSON.stringify(filter))}`

/** Read one JSON text column, failing loud on a malformed value (misconfiguration fails loud). */
function parseJsonColumn<T>(text: unknown, column: string, where: string): T | null {
  if (text === null || text === undefined || text === '') return null
  if (typeof text !== 'string') return text as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${where} 的 ${column} 列不是合法 JSON：${String(text).slice(0, 120)}`)
  }
}

/**
 * Load the one active flow config for a document type (activation is
 * exclusive per doc_type). The threshold rides `thresholdOf(extras)`: a
 * missing key falls back to DEFAULT_AMOUNT_THRESHOLD (one fallback log line
 * per flow per process); a malformed value fails loud here.
 */
export async function loadFlow(io: NocoIO, docType: string): Promise<FlowConfig> {
  const rows = await io.list('wfl_flow_configs', { doc_type: docType, is_active: true })
  if (rows.length === 0) {
    throw new Error(`未找到 ${docType} 的激活审批流配置（wfl_flow_configs）；先运行 nocobase-w1-approval.mts 或 --seed-flow`)
  }
  if (rows.length > 1) {
    throw new Error(`${docType} 存在 ${rows.length} 条激活审批流配置（激活互斥被破坏）；检查 wfl_flow_configs`)
  }
  const row = rows[0]
  const approverMap = parseJsonColumn<Record<string, string | string[]>>(row.approver_map, 'approver_map', `审批流 #${row.id}`)
  const extras = parseJsonColumn<FlowConfig['extras']>(row.extras, 'extras', `审批流 #${row.id}`)
  const threshold = thresholdOf(extras)
  if (extras === null || extras.amount_threshold === undefined) {
    logThresholdFallback(docType, threshold)
  }
  return {
    id: Number(row.id), doc_type: docType, state_field: String(row.state_field ?? 'doc_status'),
    approver_map: approverMap ?? {}, extras,
    amount_field: extras?.amount_field !== undefined && extras.amount_field !== '' ? extras.amount_field : AMOUNT_FIELD,
    threshold,
  }
}

/** The doc types this process already logged the default-threshold fallback for (one line each). */
const thresholdFallbackLogged = new Set<string>()

/** Emit the one-per-flow default-threshold fallback line (extras carries no amount_threshold key). */
function logThresholdFallback(docType: string, threshold: number): void {
  if (thresholdFallbackLogged.has(docType)) return
  thresholdFallbackLogged.add(docType)
  console.log(`approval-engine: flow ${docType} extras has no amount_threshold; defaulting to ${String(threshold)}`)
}

/** Read the document row, its current flow state, and the vocabulary that state rides (failing loud on unknown shapes). */
async function readState(io: NocoIO, flow: FlowConfig, docType: string, docId: number): Promise<{ row: Record<string, any>, state: string, vocab: FlowVocabulary }> {
  const vocab = vocabularyForStateField(flow.state_field)
  const row = await io.get(docType, docId)
  if (row === undefined) {
    throw new Error(`单据不存在：${docType} 第 ${docId} 行`)
  }
  const raw = row[flow.state_field]
  if (!vocab.isState(raw)) {
    throw new Error(`${docType} 第 ${docId} 行的 ${flow.state_field} 列值 ${JSON.stringify(raw)} 不是合法审批状态；先回填 ${flow.state_field}`)
  }
  return { row, state: raw, vocab }
}

/** The document's current attempt number (0 before the first submit). */
async function currentAttempt(io: NocoIO, docType: string, docId: number): Promise<number> {
  const records = await io.list('wfl_approval_records', { doc_type: docType, doc_id: docId })
  return records.reduce((max, row) => Math.max(max, Number(row.attempt_no ?? 0)), 0)
}

/**
 * Assert every approver username exists in the users table: a stale
 * approver_map naming a missing user refuses before any todo row lands.
 */
async function assertApproversExist(io: NocoIO, flow: FlowConfig, users: readonly string[]): Promise<void> {
  const known = new Set((await io.list('users', {})).map(row => String(row.username ?? '')))
  const missing = users.filter(user => !known.has(user))
  if (missing.length > 0) {
    throw new Error(`审批流「${flow.doc_type}」approver_map 引用不存在的用户：${missing.join('、')}（users 表无此用户名）`)
  }
}

/** Append one audit record (append-only; the five elements: who/when/action/comment/attempt). */
async function writeRecord(io: NocoIO, entry: {
  doc_type: string, doc_id: number, approver: string, action: ApprovalAction, comment?: string,
  attempt_no: number, from_state: string, to_state: string, source: 'engine' | 'page',
  anchors: Readonly<Record<string, 0 | 1 | 2>>,
}): Promise<void> {
  const existing = await io.list('wfl_approval_records', { doc_type: entry.doc_type, doc_id: entry.doc_id })
  const nodeSeq = existing.reduce((max, row) => Math.max(max, Number(row.node_seq ?? 0)), 0) + 1
  await io.create('wfl_approval_records', {
    doc_type: entry.doc_type, doc_id: entry.doc_id, node_seq: nodeSeq, approver: entry.approver,
    action: entry.action, comment: entry.comment ?? null, attempt_no: entry.attempt_no,
    from_state: entry.from_state, to_state: entry.to_state,
    from_anchor: entry.anchors[entry.from_state], to_anchor: entry.anchors[entry.to_state],
    source: entry.source, acted_at: today(),
  })
}

/** Close the document's open todos at one state (and answer how many closed). */
async function closeTodos(io: NocoIO, docType: string, docId: number, state: string): Promise<number> {
  const todos = await io.list('wfl_approval_todos', { doc_type: docType, doc_id: docId, state, status: 'open' })
  for (const todo of todos) {
    await io.update('wfl_approval_todos', Number(todo.id), { status: 'completed' })
  }
  return todos.length
}

/**
 * Create the open todo rows for a state that waits on one role. The role's
 * approver_map value may name several users (an array): each expands to one
 * todo row, and any one of them acting completes the whole tier — the
 * OR-sign-off contract (counter-sign belongs to the enterprise edition).
 */
async function openTodo(io: NocoIO, flow: FlowConfig, docType: string, docId: number, state: string): Promise<readonly string[]> {
  const transitions = await io.list('wfl_flow_transitions', { flow_id: flow.id, state })
  const leaving = transitions.find(row => row.action === 'approve')
  if (leaving === undefined) {
    throw new Error(`审批流「${flow.doc_type}」缺 ${state} 状态的 approve 转移（wfl_flow_transitions）；配置不完整`)
  }
  const users = approversOfRole(flow.approver_map, String(leaving.allowed_role ?? ''))
  await assertApproversExist(io, flow, users)
  const due = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  for (const user of users) {
    await io.create('wfl_approval_todos', { doc_type: docType, doc_id: docId, user, state, status: 'open', due_date: due })
  }
  return users
}

/**
 * Submit one document for approval: draft → pending, or rejected → pending as
 * a resubmit (attempt_no +1, the whole chain replays — the D4 semantics).
 * @param io - the data access to run over.
 * @param docType - the document collection (must have an active flow config).
 * @param docId - the document row id.
 * @param submitter - the submitting user's name (audit element).
 * @returns the act outcome.
 */
export async function submitForApproval(io: NocoIO, docType: string, docId: number, submitter: string): Promise<ActResult> {
  const flow = await loadFlow(io, docType)
  const { state, vocab } = await readState(io, flow, docType, docId)
  // Both vocabularies submit from their entry state (draft / potential) and
  // resubmit from their refusal state (rejected).
  const action: ApprovalAction = state === 'draft' || state === 'potential' ? 'submit' : 'resubmit'
  const next = vocab.nextOf(state, action, undefined, flow.threshold)
  if (next === undefined) {
    throw new Error(vocab.illegalMessage(state, action))
  }
  const previousAttempt = await currentAttempt(io, docType, docId)
  const attemptNo = previousAttempt + 1
  // The conditional write-back is the concurrency gate: a racing submit or
  // act that moved the document first leaves the filter matching zero rows.
  const moved = await io.updateWhere(docType, { id: docId, [flow.state_field]: state }, { [flow.state_field]: next })
  if (moved === 0) {
    throw new Error(`单据状态已变化：${docType} 第 ${docId} 行已不在「${state}」态（并发提交被拒绝，未双写）`)
  }
  await writeRecord(io, { doc_type: docType, doc_id: docId, approver: submitter, action, attempt_no: attemptNo, from_state: state, to_state: next, source: 'engine', anchors: vocab.anchors })
  await openTodo(io, flow, docType, docId, next)
  return {
    doc_type: docType, doc_id: docId, action, from_state: state, to_state: next,
    from_anchor: vocab.anchors[state] ?? 0, to_anchor: vocab.anchors[next] ?? 0,
    attempt_no: attemptNo, effective: next === vocab.effectiveState,
  }
}

/**
 * Perform one approval action (approve / reject / void): validate the current
 * state against the shared rules, match the configured transition (amount
 * threshold included), write the audit record, close the current todo, open
 * the level-2 todo on the routed state, and write the doc_status back (with
 * approved_by/approved_at when the flow names them).
 * @param io - the data access to run over.
 * @param docType - the document collection.
 * @param docId - the document row id.
 * @param action - approve | reject | void.
 * @param approver - the acting user's name (audit element).
 * @param comment - the actor's remark (audit element; rejects read best with one).
 * @param source - which entry point fired (engine writes page-consumed rows as page).
 * @returns the act outcome.
 */
export async function act(io: NocoIO, docType: string, docId: number, action: ApprovalAction, approver: string, comment?: string, source: 'engine' | 'page' = 'engine'): Promise<ActResult> {
  if (action !== 'approve' && action !== 'reject' && action !== 'void') {
    throw new Error(`act 只接受 approve/reject/void 动作（收到 ${action}）；提交与重提走 submitForApproval`)
  }
  const flow = await loadFlow(io, docType)
  const { row, state, vocab } = await readState(io, flow, docType, docId)
  const amount = row[flow.amount_field] === null || row[flow.amount_field] === undefined ? undefined : Number(row[flow.amount_field])
  const next = vocab.nextOf(state, action, amount, flow.threshold)
  if (next === undefined) {
    throw new Error(vocab.illegalMessage(state, action))
  }
  const transitions = await io.list('wfl_flow_transitions', { flow_id: flow.id, state, action })
  const matched = transitions.find(candidate => candidate.next_state === next && conditionApplies(candidate.condition_expr === null || candidate.condition_expr === undefined ? undefined : String(candidate.condition_expr), row))
  if (matched === undefined) {
    throw new Error(`审批流「${docType}」缺 ${state}×${action}→${next} 的转移配置（wfl_flow_transitions）；规则与配置不一致，检查种子`)
  }
  if (matched.allow_self_approval !== true) {
    const records = await io.list('wfl_approval_records', { doc_type: docType, doc_id: docId, action: 'submit' })
    const lastSubmitter = records.filter(record => Number(record.attempt_no ?? 0) > 0)
      .sort((a, b) => Number(b.attempt_no ?? 0) - Number(a.attempt_no ?? 0) || Number(b.node_seq ?? 0) - Number(a.node_seq ?? 0))[0]?.approver
    if (lastSubmitter === approver) {
      throw new Error(`不允许自审自批：${docType} 第 ${docId} 行由 ${approver} 提交，该转移（${state}×${action}）未开启 allow_self_approval`)
    }
  }
  const attemptNo = await currentAttempt(io, docType, docId)
  const writeBack: Record<string, unknown> = { [flow.state_field]: next }
  if (next === vocab.effectiveState && flow.extras !== null) {
    if (flow.extras.approved_by_field !== undefined) writeBack[flow.extras.approved_by_field] = approver
    if (flow.extras.approved_at_field !== undefined) writeBack[flow.extras.approved_at_field] = today()
  }
  if (next === vocab.effectiveState || next === 'void') {
    const states = await io.list('wfl_flow_states', { flow_id: flow.id, state: next })
    const updateField = states[0]?.update_field
    if (typeof updateField === 'string' && updateField !== '') {
      writeBack[updateField] = states[0]?.update_value ?? null
    }
  }
  // Optimistic concurrency gate first (zero rows = a racing act already moved
  // the document): the loser refuses here, before any record/todo write, so
  // a doubled workflow callback cannot double-write the audit trail.
  const moved = await io.updateWhere(docType, { id: docId, [flow.state_field]: state }, writeBack)
  if (moved === 0) {
    throw new Error(`单据状态已变化：${docType} 第 ${docId} 行已不在「${state}」态（并发审批被拒绝，未双写）`)
  }
  await writeRecord(io, { doc_type: docType, doc_id: docId, approver, action, comment, attempt_no: attemptNo, from_state: state, to_state: next, source, anchors: vocab.anchors })
  await closeTodos(io, docType, docId, state)
  if (next === 'pending_level2') {
    await openTodo(io, flow, docType, docId, next)
  }
  return {
    doc_type: docType, doc_id: docId, action, from_state: state, to_state: next,
    from_anchor: vocab.anchors[state] ?? 0, to_anchor: vocab.anchors[next] ?? 0,
    attempt_no: attemptNo, effective: next === vocab.effectiveState,
  }
}

/**
 * The downstream gate: assert one upstream document is effective
 * (doc_status=approved) before downstream creation proceeds.
 * @param io - the data access to run over.
 * @param upstreamCollection - the upstream collection name.
 * @param ref - the reference value the downstream row carries.
 * @param refField - the upstream column the ref matches (e.g. po_number); omitted = ref is the row id.
 * @param label - the upstream's business label for the error message.
 * @param requiredStatus - the state the upstream must be in (default approved).
 */
export async function assertSourceEffective(io: NocoIO, upstreamCollection: string, ref: string | number, refField?: string, label?: string, requiredStatus: WorkflowState = EFFECTIVE_STATE): Promise<void> {
  const rows = refField === undefined
    ? [await io.get(upstreamCollection, Number(ref))].filter((row): row is Record<string, any> => row !== undefined)
    : await io.list(upstreamCollection, { [refField]: ref })
  if (rows.length === 0) {
    throw new Error(`上游单据未生效：找不到 ${label ?? upstreamCollection} ${ref}（在 ${upstreamCollection} 中无匹配行），未生效单据不能驱动下游业务`)
  }
  const state = rows[0].doc_status
  if (!isWorkflowState(state)) {
    throw new Error(gateNotEffectiveMessage(label ?? upstreamCollection, String(ref), 'draft'))
  }
  if (state !== requiredStatus) {
    throw new Error(gateNotEffectiveMessage(label ?? upstreamCollection, String(ref), state))
  }
}

/**
 * The lifecycle-set gate: assert one upstream row's lifecycle column holds a
 * value inside the required set (the supplier gate — qualified/preferred).
 * @param io - the data access to run over.
 * @param upstreamCollection - the upstream collection name.
 * @param ref - the reference value the downstream row carries.
 * @param refField - the upstream column the ref matches; omitted = ref is the row id.
 * @param label - the upstream's business label for the error message.
 * @param stateField - the upstream lifecycle column the set reads.
 * @param required - the admitted lifecycle values.
 */
async function assertStatusInSet(io: NocoIO, upstreamCollection: string, ref: string | number, refField: string | undefined, label: string, stateField: string, required: readonly string[]): Promise<void> {
  const rows = refField === undefined
    ? [await io.get(upstreamCollection, Number(ref))].filter((row): row is Record<string, any> => row !== undefined)
    : await io.list(upstreamCollection, { [refField]: ref })
  if (rows.length === 0) {
    throw new Error(`供应商卡口未通过：找不到 ${label} ${ref}（在 ${upstreamCollection} 中无匹配行），未准入/不合格供方不能下采购单`)
  }
  const actual = rows[0][stateField]
  if (typeof actual !== 'string' || !required.includes(actual)) {
    // Supplier-lifecycle gates keep their admission wording; every other
    // state-field set gate (B3's invoice gate) renders the generic text.
    const refusal = stateField === SUPPLIER_ADMISSION_STATE_FIELD
      ? gateNotAdmittedMessage(label, String(ref), typeof actual === 'string' ? actual : String(actual ?? ''), required)
      : gateNotInSetMessage(label, String(ref), stateField, typeof actual === 'string' ? actual : String(actual ?? ''), required)
    throw new Error(refusal)
  }
}

/** One resolved wfl_gate_configs row (enforceGates' unit). */
export interface GateConfig {
  readonly id: number
  readonly downstream_collection: string
  readonly upstream_collection: string
  readonly upstream_field: string
  readonly upstream_ref_field: string | null
  readonly upstream_label: string | null
  readonly upstream_state_field: string | null
  readonly required_status: string | null
}

/** List the gate configs for one downstream collection. */
export async function gatesFor(io: NocoIO, downstreamCollection: string): Promise<GateConfig[]> {
  const rows = await io.list('wfl_gate_configs', { downstream_collection: downstreamCollection })
  return rows.map(row => ({
    id: Number(row.id),
    downstream_collection: String(row.downstream_collection),
    upstream_collection: String(row.upstream_collection),
    upstream_field: String(row.upstream_field),
    upstream_ref_field: row.upstream_ref_field === null || row.upstream_ref_field === undefined || row.upstream_ref_field === '' ? null : String(row.upstream_ref_field),
    upstream_label: row.upstream_label === null || row.upstream_label === undefined ? null : String(row.upstream_label),
    upstream_state_field: row.upstream_state_field === null || row.upstream_state_field === undefined || row.upstream_state_field === '' ? null : String(row.upstream_state_field),
    required_status: row.required_status === null || row.required_status === undefined || row.required_status === '' ? null : String(row.required_status),
  }))
}

/**
 * The nb_create precondition: for every gate config on the target collection,
 * the values' referenced upstream row must be effective. A gate whose
 * reference field is absent/null in the values simply does not bind (a
 * receipt without a PO reference is out of the gate's scope).
 * @param io - the data access to run over.
 * @param downstreamCollection - the collection nb_create targets.
 * @param values - the new row's values.
 */
export async function enforceGates(io: NocoIO, downstreamCollection: string, values: Readonly<Record<string, unknown>>): Promise<void> {
  for (const gate of await gatesFor(io, downstreamCollection)) {
    const ref = values[gate.upstream_field]
    if (ref === null || ref === undefined || ref === '') continue
    const stateField = gate.upstream_state_field ?? DOC_FLOW_VOCABULARY.stateField
    if (stateField === DOC_FLOW_VOCABULARY.stateField) {
      await assertSourceEffective(io, gate.upstream_collection, ref as string | number,
        gate.upstream_ref_field === null ? undefined : gate.upstream_ref_field,
        gate.upstream_label === null ? undefined : gate.upstream_label,
        isWorkflowState(gate.required_status) ? gate.required_status : EFFECTIVE_STATE)
      continue
    }
    // A lifecycle gate must name its admitted set explicitly — an empty set
    // would admit nothing, which is a seed error, not a policy.
    const required = parseRequiredStatuses(gate.required_status)
    if (required.length === 0) {
      throw new Error(`卡口配置错误：${gate.downstream_collection}→${gate.upstream_collection} 的 ${stateField} 卡口未配置 required_status 集合（如 qualified,preferred）`)
    }
    await assertStatusInSet(io, gate.upstream_collection, ref as string | number,
      gate.upstream_ref_field === null ? undefined : gate.upstream_ref_field,
      gate.upstream_label === null ? gate.upstream_collection : gate.upstream_label, stateField, required)
  }
}

/** The nb_update precondition: a document under an active flow is read-only while its vocabulary's locked states hold (pending/pending_level2/approved/void, or admission reviewing). */
export async function assertEditable(io: NocoIO, docType: string, docId: number, label: string): Promise<void> {
  const flows = await io.list('wfl_flow_configs', { doc_type: docType, is_active: true })
  if (flows.length === 0) return
  const vocab = vocabularyForStateField(String(flows[0].state_field ?? 'doc_status'))
  const row = await io.get(docType, docId)
  if (row === undefined) return
  const state = row[vocab.stateField]
  if (vocab.isState(state) && vocab.lockedStates.includes(state)) {
    throw new Error(`单据已锁定编辑：${label} 当前状态「${flowStateLabel(state)}」，审批中/已生效/已作废的单据禁止直接修改`)
  }
}

/** The open todos for one user (or everyone), newest documents first. */
export async function listTodos(io: NocoIO, user?: string): Promise<Array<Record<string, any>>> {
  return await io.list('wfl_approval_todos', user === undefined ? { status: 'open' } : { status: 'open', user })
}

// ─── the pilot flow seed (shared by --seed-flow and nocobase-w1-approval.mts) ───

/** The pilot transitions in seed order (see nextStateOf: the two approve rows split on the threshold condition). */
export const PILOT_TRANSITIONS: ReadonlyArray<{ state: WorkflowState, action: ApprovalAction, next_state: WorkflowState, allowed_role: string, condition_expr: string, allow_self_approval: boolean }> = [
  { state: 'draft', action: 'submit', next_state: 'pending', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
  { state: 'rejected', action: 'resubmit', next_state: 'pending', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
  { state: 'pending', action: 'approve', next_state: 'approved', allowed_role: 'manager', condition_expr: `total <= ${DEFAULT_AMOUNT_THRESHOLD}`, allow_self_approval: true },
  { state: 'pending', action: 'approve', next_state: 'pending_level2', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
  { state: 'pending_level2', action: 'approve', next_state: 'approved', allowed_role: 'gm', condition_expr: '', allow_self_approval: true },
  { state: 'pending', action: 'reject', next_state: 'rejected', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
  { state: 'pending_level2', action: 'reject', next_state: 'rejected', allowed_role: 'gm', condition_expr: '', allow_self_approval: true },
  { state: 'approved', action: 'void', next_state: 'void', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
]

/**
 * Seed the pilot purchase-order flow (idempotent by doc_type: an existing
 * config row skips whole). States ride WORKFLOW_STATES with their anchors;
 * transitions ride {@link PILOT_TRANSITIONS}; the gate binds wms_receipts
 * rows (source_no) to effective purchase orders (po_number).
 * @param io - the data access to run over.
 * @param approverMap - role → username (defaults to the single-admin pilot).
 */
export async function seedFlow(io: NocoIO, approverMap: Record<string, string> = { manager: 'admin', gm: 'admin' }): Promise<void> {
  const docType = 'hub_po_purchase_orders'
  const existing = await io.list('wfl_flow_configs', { doc_type: docType })
  if (existing.length > 0) {
    console.log(`approval-engine: flow config for ${docType} exists (kept)`)
    return
  }
  const flow = await io.create('wfl_flow_configs', {
    doc_type: docType, title: '采购订单审批', state_field: 'doc_status', is_active: true,
    approver_map: JSON.stringify(approverMap),
    extras: JSON.stringify({ approved_by_field: 'approved_by', approved_at_field: 'approved_at' }),
  })
  for (const state of ['draft', 'pending', 'pending_level2', 'approved', 'rejected', 'void'] as const) {
    await io.create('wfl_flow_states', {
      flow_id: flow.id, state, doc_status_anchor: DOC_STATUS_ANCHORS[state],
      allow_edit_role: state === 'draft' || state === 'rejected' ? 'submitter' : 'manager',
      update_field: '', update_value: '',
    })
  }
  for (const row of PILOT_TRANSITIONS) {
    await io.create('wfl_flow_transitions', { flow_id: flow.id, ...row, condition_expr: row.condition_expr })
  }
  const gates = await io.list('wfl_gate_configs', { downstream_collection: 'wms_receipts' })
  if (gates.length === 0) {
    await io.create('wfl_gate_configs', {
      downstream_collection: 'wms_receipts', upstream_collection: docType,
      upstream_field: 'source_no', upstream_ref_field: 'po_number',
      upstream_label: '采购单', required_status: 'approved',
    })
  }
  console.log(`approval-engine: pilot flow seeded for ${docType} (approvers ${JSON.stringify(approverMap)})`)
}

// ─── the supplier-admission flow seed (B2; shared by nocobase-w2-supplier.mts) ───

/** The admission flow's transitions in seed order (mirrors nextAdmissionStateOf). */
export const ADMISSION_TRANSITIONS: ReadonlyArray<{ state: SupplierAdmissionState, action: ApprovalAction, next_state: SupplierAdmissionState, allowed_role: string, condition_expr: string, allow_self_approval: boolean }> = [
  { state: 'potential', action: 'submit', next_state: 'reviewing', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
  { state: 'rejected', action: 'resubmit', next_state: 'reviewing', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
  { state: 'reviewing', action: 'approve', next_state: 'qualified', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
  { state: 'reviewing', action: 'reject', next_state: 'rejected', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
]

/**
 * Seed the supplier-admission flow over srm_suppliers (idempotent by
 * doc_type): states ride SUPPLIER_ADMISSION_STATES with their anchors, the
 * four transitions ride {@link ADMISSION_TRANSITIONS}, and the extras name
 * admitted_at as the effective-date column (approving a supplier lands its
 * admission date).
 * @param io - the data access to run over.
 * @param approverMap - role → username (defaults to the single-admin pilot).
 */
export async function seedAdmissionFlow(io: NocoIO, approverMap: Record<string, string> = { srm_manager: 'admin' }): Promise<void> {
  const docType = 'srm_suppliers'
  const existing = await io.list('wfl_flow_configs', { doc_type: docType })
  if (existing.length > 0) {
    console.log(`approval-engine: flow config for ${docType} exists (kept)`)
    return
  }
  const flow = await io.create('wfl_flow_configs', {
    doc_type: docType, title: '供应商准入审批', state_field: SUPPLIER_ADMISSION_STATE_FIELD, is_active: true,
    approver_map: JSON.stringify(approverMap),
    extras: JSON.stringify({ approved_at_field: 'admitted_at' }),
  })
  for (const state of SUPPLIER_ADMISSION_STATES) {
    await io.create('wfl_flow_states', {
      flow_id: flow.id, state, doc_status_anchor: SUPPLIER_ADMISSION_ANCHORS[state],
      allow_edit_role: state === 'potential' || state === 'rejected' ? 'submitter' : 'srm_manager',
      update_field: '', update_value: '',
    })
  }
  for (const row of ADMISSION_TRANSITIONS) {
    await io.create('wfl_flow_transitions', { flow_id: flow.id, ...row, condition_expr: row.condition_expr })
  }
  console.log(`approval-engine: admission flow seeded for ${docType} (approvers ${JSON.stringify(approverMap)})`)
}

// ─── the MPS plan flow seed (W2-B2; shared by nocobase-w7-mrp.mts) ───

/**
 * Seed the six-state approval flow for MPS plans (idempotent by doc_type):
 * no amount column, so approvals land in one round with no threshold
 * branch. The approval transition is also the snapshot lock-in moment —
 * the engine's effective hook re-runs the plan's max merge once, and later
 * SO changes never touch the approved plan on their own (the soft time
 * fence; only --refresh-mps re-baselines it).
 * @param io - the data access to run over.
 */
export async function seedMpsFlow(io: NocoIO): Promise<void> {
  await seedDocFlow(io, 'mps_plans', '主生产计划审批')
}

// ─── the generic doc-flow seed (B3; shared by nocobase-w3-procurement.mts) ───

/**
 * Seed one six-state doc_status flow for a document type (idempotent by
 * doc_type): the states ride WORKFLOW_STATES with their anchors, the
 * transitions mirror {@link PILOT_TRANSITIONS} with the amount-threshold
 * condition rewritten onto the document's own amount column and configured
 * threshold literal, and the extras name the approved_by/approved_at
 * write-backs plus the owned config keys (amount_field, amount_threshold,
 * invoice_match_tolerance). An existing flow converges: transitions and the
 * keys the options own repair onto the configured target, and every change
 * appends one config_note audit line (who/when/old→new).
 * @param io - the data access to run over.
 * @param docType - the document collection (e.g. pur_orders).
 * @param title - the flow's display title (e.g. 采购订单审批).
 * @param options - amountField names the column the threshold routes on
 * (omitted = no amount routing: the document type carries no amount column,
 * so approvals land in one round); approverMap defaults to the single-admin
 * pilot (a role value may be one username or an array — any one may act);
 * amountThreshold and invoiceMatchTolerance seed their extras keys when given
 * (omitted leaves an existing flow's keys untouched).
 */
export async function seedDocFlow(io: NocoIO, docType: string, title: string, options: {
  amountField?: string,
  approverMap?: Record<string, string | string[]>,
  /** The two-level threshold this flow seeds (extras.amount_threshold + the transition condition literal). */
  amountThreshold?: number,
  /** The three-way-match tolerance seeded onto the flow extras (the pur_orders demo writes 0.1). */
  invoiceMatchTolerance?: number,
} = {}): Promise<void> {
  const approverMap = options.approverMap ?? { manager: 'admin', gm: 'admin' }
  const amountField = options.amountField
  /** Normalize one condition onto this flow's amount column and threshold literal (idempotent). */
  const normalizeCondition = (threshold: number) => (rawCondition: string): string => {
    if (amountField === undefined || rawCondition === '') return ''
    return rawCondition.replaceAll(amountField, 'total')
      .replace(/(<=|>)\s*-?\d+(?:\.\d+)?$/u, (_match, operator: string) => `${operator} ${String(threshold)}`)
      .replaceAll('total', amountField)
  }
  const existing = await io.list('wfl_flow_configs', { doc_type: docType })
  if (existing.length > 0) {
    // Repair pass (the w7 gate-repair pattern): an early-seeded flow may
    // carry transitions written before the amount-field substitution
    // existed — a raw `total <= …` condition on a document type with no
    // total column fails loud at act() — or extras/approver_map from
    // before a configured threshold landed. Converge every transition
    // condition and the keys the options own onto the configured target;
    // options left undefined keep the flow's existing values.
    const flow = existing[0]!
    const extras = parseJsonColumn<Record<string, unknown>>(flow.extras, 'extras', `审批流 #${flow.id}`) ?? {}
    const threshold = options.amountThreshold ?? thresholdOf(extras)
    const changes: string[] = []
    let repaired = 0
    const transitions = await io.list('wfl_flow_transitions', { flow_id: flow.id })
    for (const row of transitions) {
      const wanted = normalizeCondition(threshold)(String(row.condition_expr ?? ''))
      if (wanted !== String(row.condition_expr ?? '')) {
        changes.push(`transition#${String(row.id)} condition ${JSON.stringify(String(row.condition_expr ?? ''))}→${JSON.stringify(wanted)}`)
        await io.update('wfl_flow_transitions', Number(row.id), { condition_expr: wanted })
        repaired += 1
      }
    }
    const next: Record<string, unknown> = { ...extras }
    const ownedKeys: ReadonlyArray<[string, unknown]> = [
      ['amount_field', options.amountField],
      ['amount_threshold', options.amountThreshold],
      ['invoice_match_tolerance', options.invoiceMatchTolerance],
    ]
    for (const [key, wanted] of ownedKeys) {
      if (wanted !== undefined && (next[key] ?? undefined) !== wanted) {
        changes.push(`extras.${key} ${JSON.stringify(next[key] ?? null)}→${JSON.stringify(wanted)}`)
        next[key] = wanted
        repaired += 1
      }
    }
    const currentMap = parseJsonColumn<Record<string, unknown>>(flow.approver_map, 'approver_map', `审批流 #${flow.id}`) ?? {}
    const mapChanges = options.approverMap !== undefined && JSON.stringify(currentMap) !== JSON.stringify(options.approverMap)
    if (mapChanges) {
      changes.push(`approver_map ${JSON.stringify(currentMap)}→${JSON.stringify(options.approverMap)}`)
      repaired += 1
    }
    if (repaired > 0) {
      const auditBase = typeof flow.config_note === 'string' && flow.config_note !== '' ? `${flow.config_note}\n` : ''
      const auditLine = `${new Date().toISOString()} w2b5 seedDocFlow: ${changes.join('; ')} (operator=admin)`
      await io.update('wfl_flow_configs', Number(flow.id), {
        extras: JSON.stringify(next),
        ...(mapChanges ? { approver_map: JSON.stringify(options.approverMap) } : {}),
        config_note: `${auditBase}${auditLine}`,
      })
    }
    console.log(`approval-engine: flow config for ${docType} exists (${repaired > 0 ? `${String(repaired)} change(s) repaired, config_note audited` : 'kept'})`)
    return
  }
  const threshold = options.amountThreshold ?? DEFAULT_AMOUNT_THRESHOLD
  const extras: Record<string, unknown> = { approved_by_field: 'approved_by', approved_at_field: 'approved_at' }
  if (amountField !== undefined) extras.amount_field = amountField
  if (options.amountThreshold !== undefined) extras.amount_threshold = options.amountThreshold
  if (options.invoiceMatchTolerance !== undefined) extras.invoice_match_tolerance = options.invoiceMatchTolerance
  const seededKeys = ownedKeysOf(options)
  const flow = await io.create('wfl_flow_configs', {
    doc_type: docType, title, state_field: 'doc_status', is_active: true,
    approver_map: JSON.stringify(approverMap),
    extras: JSON.stringify(extras),
    config_note: `${new Date().toISOString()} w2b5 seedDocFlow: seeded (threshold ${String(threshold)}; ${seededKeys}) (operator=admin)`,
  })
  for (const state of WORKFLOW_STATES) {
    await io.create('wfl_flow_states', {
      flow_id: flow.id, state, doc_status_anchor: DOC_STATUS_ANCHORS[state],
      allow_edit_role: state === 'draft' || state === 'rejected' ? 'submitter' : 'manager',
      update_field: '', update_value: '',
    })
  }
  for (const row of PILOT_TRANSITIONS) {
    // No amount column = no amount routing: the threshold condition drops
    // out entirely (one-round approval), it never stays on the unrewritten
    // `total` — an undefined field fails the condition evaluation at act().
    // With an amount column the seeded literal is the configured threshold
    // (the template's DEFAULT_AMOUNT_THRESHOLD placeholder rewrites).
    const condition = amountField === undefined || row.condition_expr === ''
      ? ''
      : row.condition_expr.replaceAll('total', amountField).replaceAll(String(DEFAULT_AMOUNT_THRESHOLD), String(threshold))
    await io.create('wfl_flow_transitions', { flow_id: flow.id, ...row, condition_expr: condition })
  }
  console.log(`approval-engine: doc flow seeded for ${docType} (${title}; amount routing ${amountField ?? 'off'}; threshold ${String(threshold)}; approvers ${JSON.stringify(approverMap)})`)
}

/** The seeded config keys one line of config_note names (the new-flow audit). */
function ownedKeysOf(options: { amountField?: string, amountThreshold?: number, invoiceMatchTolerance?: number }): string {
  const keys: string[] = []
  if (options.amountField !== undefined) keys.push(`amount_field=${options.amountField}`)
  if (options.amountThreshold !== undefined) keys.push(`amount_threshold=${String(options.amountThreshold)}`)
  if (options.invoiceMatchTolerance !== undefined) keys.push(`invoice_match_tolerance=${String(options.invoiceMatchTolerance)}`)
  return keys.length > 0 ? keys.join(', ') : 'no owned keys'
}

// ─── REST IO (production) ───

/** The REST-backed NocoIO every CLI/HTTP path runs over. */
class RestIO implements NocoIO {
  private readonly token: string

  constructor(token: string) {
    this.token = token
  }

  async list(collection: string, filter?: Record<string, unknown>): Promise<Array<Record<string, any>>> {
    const rows = await dataOf(this.token, 'GET', `/api/${collection}:list?pageSize=500${listFilter(filter)}`)
    return rows ?? []
  }

  async get(collection: string, id: number): Promise<Record<string, any> | undefined> {
    return await dataOf(this.token, 'GET', `/api/${collection}:get?filterByTk=${id}`) ?? undefined
  }

  async create(collection: string, values: Record<string, unknown>): Promise<Record<string, any>> {
    return await dataOf(this.token, 'POST', `/api/${collection}:create`, values)
  }

  async update(collection: string, id: number, values: Record<string, unknown>): Promise<void> {
    await dataOf(this.token, 'POST', `/api/${collection}:update?filterByTk=${id}`, values)
  }

  async updateWhere(collection: string, filter: Record<string, unknown>, values: Record<string, unknown>): Promise<number> {
    const rows = await dataOf(this.token, 'POST', `/api/${collection}:update?filter=${encodeURIComponent(JSON.stringify(filter))}&pageSize=10`, values)
    return Array.isArray(rows) ? rows.length : rows === null || rows === undefined ? 0 : 1
  }

  async destroy(collection: string, id: number): Promise<void> {
    await call(this.token, 'POST', `/api/${collection}:destroy?filterByTk=${id}`)
  }
}

const restIO = async (): Promise<RestIO> => new RestIO(await signInWithRetry())

// ─── HTTP serve (:13110, the workflow request callback target) ───

/** Read one request's JSON body (size-capped). */
async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > 100_000) throw new Error('request body too large')
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  return JSON.parse(text) as Record<string, unknown>
}

/** One JSON response write. */
function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

// ─── W2-B7: the built-in nightly timer (default off) ───

/** The nightly timer's env-derived configuration. */
export interface NightlyPlan {
  readonly enabled: boolean
  /** The daily fire time, HH:MM in the plan's timezone. */
  readonly at: string
  readonly tz: string
}

/**
 * Parse and validate the three nightly env knobs, failing loud on any
 * malformed value whether or not the timer is enabled: W1_NIGHTLY_ENABLED
 * (default false; strictly 'true'/'false'), W1_NIGHTLY_AT (default 02:30;
 * strict HH:MM), W1_NIGHTLY_TZ (default Asia/Shanghai — the kpi-run
 * Shanghai day boundary; any IANA zone, validated by construction).
 * @param env - the process env to read (injectable for the selftest).
 */
export function parseNightlyEnv(env: Record<string, string | undefined>): NightlyPlan {
  const rawEnabled = env['W1_NIGHTLY_ENABLED'] ?? ''
  if (rawEnabled !== '' && rawEnabled !== 'true' && rawEnabled !== 'false') {
    throw new Error(`W1_NIGHTLY_ENABLED 仅接受 true/false（收到 ${rawEnabled}）`)
  }
  const rawAt = env['W1_NIGHTLY_AT'] ?? ''
  if (rawAt !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(rawAt)) {
    throw new Error(`W1_NIGHTLY_AT 需为 HH:MM 24 小时制（收到 ${rawAt}）`)
  }
  const tz = env['W1_NIGHTLY_TZ'] ?? 'Asia/Shanghai'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
  } catch {
    throw new Error(`W1_NIGHTLY_TZ 非法 IANA 时区（收到 ${tz}）`)
  }
  return { enabled: rawEnabled === 'true', at: rawAt === '' ? '02:30' : rawAt, tz }
}

/** The plan-timezone wall clock now: the local date (YYYY-MM-DD) and HH:MM. */
export function tzNow(tz: string): { date: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find(part => part.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hhmm: `${get('hour')}:${get('minute')}` }
}

/** Whether a local date is its month's last day (the snapshot-month leg fires). */
export function isMonthEndDay(date: string): boolean {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + 1)).getUTCMonth() !== month! - 1
}

/** One nightly leg's outcome line. */
interface NightlyStep { readonly name: string; readonly ok: boolean; readonly detail: string }

/** One full nightly pass's outcome (per-leg lines plus the all-ok rollup). */
export interface NightlyOutcome { readonly trigger: 'timer' | 'manual'; readonly steps: ReadonlyArray<NightlyStep> }

/**
 * Run one nightly pass: scan-reorder → run-mrp → (month-end only)
 * snapshot-month → calc-kpi, appending calc-scorecard on a quarter-start
 * day. Every leg is idempotent, a failed leg logs and the next leg still
 * runs, and the pass ends with a one-line summary — the timer and the
 * manual POST /run-nightly share this body verbatim.
 * @param token - the root API token.
 * @param trigger - 'timer' (the armed schedule) or 'manual' (the route).
 * @param plan - the parsed nightly configuration (the timezone anchor).
 * @returns the per-leg outcome rollup.
 */
export async function runNightlySteps(token: string, trigger: 'timer' | 'manual', plan: NightlyPlan): Promise<NightlyOutcome> {
  const { date } = tzNow(plan.tz)
  const quarterStart = Number(date.slice(5, 7)) % 3 === 1
  const legs: ReadonlyArray<{ name: string; run: () => Promise<string> }> = [
    { name: 'scan-reorder', run: async () => `created=${JSON.stringify(await scanReorder(token))}` },
    {
      name: 'run-mrp',
      run: async () => {
        const { runMrp } = await import('./mrp-run.mts')
        const result = await runMrp(token)
        return `run_id=${result.run_id} snapshots=${String(result.snapshots)}`
      },
    },
    ...(isMonthEndDay(date) ? [{
      name: 'snapshot-month',
      // The B3 ledger snapshot rides its own destroy-then-create replay
      // (month-end KPI calc reads it for the turnover pair), so the timer
      // merely schedules it — the movements ledger stays the only truth.
      run: async (): Promise<string> => {
        await snapshotMonthlyBalances(token, date.slice(0, 7))
        return `period=${date.slice(0, 7)}`
      },
    }] : []),
    {
      name: 'calc-kpi',
      run: async () => {
        const kpi = await import('./kpi-run.mts')
        const result = await kpi.calcDay(token, date)
        return `date=${result.date} rows=${String(result.rows)} valued=${String(result.valued)}`
      },
    },
    ...(quarterStart ? [{
      name: 'calc-scorecard',
      run: async (): Promise<string> => {
        const period = `${date.slice(0, 4)}Q${String(Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1)}`
        const summaries = await calcScorecard(token, period)
        return `period=${period} suppliers=${String(summaries.length)}`
      },
    }] : []),
  ]
  const steps: NightlyStep[] = []
  console.log(`approval-engine: nightly pass start (trigger=${trigger}, ${date} ${tzNow(plan.tz).hhmm} ${plan.tz}, legs=${legs.map(leg => leg.name).join(' → ')})`)
  for (const leg of legs) {
    try {
      const detail = await leg.run()
      steps.push({ name: leg.name, ok: true, detail })
      console.log(`approval-engine: nightly leg ${leg.name} ok — ${detail}`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      steps.push({ name: leg.name, ok: false, detail })
      console.error(`approval-engine: nightly leg ${leg.name} FAILED（不阻断后续腿）— ${detail}`)
    }
  }
  const failed = steps.filter(step => !step.ok)
  console.log(`approval-engine: nightly pass done (trigger=${trigger}, ${date}) — ${String(steps.length - failed.length)}/${String(steps.length)} legs ok${failed.length > 0 ? `，失败：${failed.map(step => step.name).join('、')}` : ''}`)
  return { trigger, steps }
}

/**
 * Serve the engine over HTTP: POST /act and POST /submit (the workflow
 * request-callback targets), GET /todos, GET /healthz, plus the B4 WMS
 * callbacks POST /post-count-adjust and POST /scan-reorder (the count
 * workflow's request node and any external cron; the open-source snapshot
 * ships no workflow-schedule plugin, so ROP scheduling curls this route). A
 * page-sourced act consumes its intent row on success (the engine destroys
 * the wfl_approval_records row whose id rides the callback body), so the
 * approval-center records table only shows engine-written audit rows.
 * W2-B7: the nightly timer arms after listen when W1_NIGHTLY_ENABLED=true
 * (off by default — no timer logs, no automatic writes), and POST
 * /run-nightly runs one manual pass through the same legs.
 * @param port - the listen port (default 13110).
 */
export async function serve(port = 13_110): Promise<void> {
  const nightly = parseNightlyEnv(process.env)
  const io = await restIO()
  const wmsToken = await signInWithRetry()
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (request.method === 'GET' && url.pathname === '/healthz') {
          return writeJson(response, 200, { ok: true })
        }
        if (request.method === 'GET' && url.pathname === '/todos') {
          const user = url.searchParams.get('user') ?? undefined
          return writeJson(response, 200, { ok: true, todos: await listTodos(io, user) })
        }
        if (request.method === 'POST' && url.pathname === '/post-count-adjust') {
          const body = await readBody(request)
          const countNo = typeof body['count_no'] === 'string' && body['count_no'] !== '' ? body['count_no'] : ''
          const countId = Number(body['count_id'])
          if (countNo === '' && !Number.isInteger(countId)) {
            return writeJson(response, 400, { ok: false, error: '需要 count_no 或正整数 count_id' })
          }
          const resolved = countNo !== '' ? countNo : String((await io.get('wms_counts', countId))?.count_no ?? '')
          if (resolved === '') {
            return writeJson(response, 400, { ok: false, error: `wms_counts 第 ${String(countId)} 行不存在（count_no 缺失）` })
          }
          await postCountAdjust(wmsToken, resolved)
          return writeJson(response, 200, { ok: true, count_no: resolved })
        }
        if (request.method === 'POST' && url.pathname === '/scan-reorder') {
          const created = await scanReorder(wmsToken)
          return writeJson(response, 200, { ok: true, created })
        }
        if (request.method === 'POST' && url.pathname === '/calc-scorecard') {
          // B8: the quarterly supplier-scorecard materialization (schedule or
          // manual curl; the open-source snapshot ships no workflow-schedule
          // plugin, so quarterly cron rides this route).
          const body = await readBody(request)
          const period = typeof body['period'] === 'string' && body['period'] !== '' ? body['period'] : undefined
          const now = new Date()
          const fallback = `${String(now.getFullYear())}Q${String(Math.floor(now.getMonth() / 3) + 1)}`
          const summaries = await calcScorecard(wmsToken, period ?? fallback)
          return writeJson(response, 200, { ok: true, period: period ?? fallback, summaries })
        }
        if (request.method === 'POST' && url.pathname === '/run-mrp') {
          const { runMrp } = await import('./mrp-run.mts')
          return writeJson(response, 200, { ok: true, result: await runMrp(wmsToken) })
        }
        if (request.method === 'POST' && url.pathname === '/calc-kpi') {
          // B9: the nightly KPI materialization (an external cron curls this
          // the same way it curls /run-mrp and /scan-reorder — the
          // open-source snapshot ships no schedule-workflow plugin). A
          // numeric backfill_days replays the trailing window instead.
          const body = await readBody(request)
          const backfillDays = Number(body['backfill_days'])
          const kpi = await import('./kpi-run.mts')
          if (Number.isInteger(backfillDays) && backfillDays > 0) {
            return writeJson(response, 200, { ok: true, result: await kpi.backfill(wmsToken, backfillDays) })
          }
          return writeJson(response, 200, { ok: true, result: await kpi.calcDay(wmsToken, new Date().toISOString().slice(0, 10)) })
        }
        if (request.method === 'POST' && url.pathname === '/run-nightly') {
          // W2-B7: one manual nightly pass — the same leg sequence the armed
          // timer runs, available whatever W1_NIGHTLY_ENABLED says (it never
          // marks the day, so the timer still fires on schedule).
          const outcome = await runNightlySteps(wmsToken, 'manual', nightly)
          return writeJson(response, 200, { ok: outcome.steps.every(step => step.ok), trigger: 'manual', steps: outcome.steps })
        }
        if (request.method === 'POST' && url.pathname === '/confirm-suggestion') {
          const body = await readBody(request)
          const suggestionId = Number(body['suggestion_id'])
          const action = body['action']
          const operator = typeof body['operator'] === 'string' && body['operator'] !== '' ? body['operator'] : 'admin'
          if (!Number.isInteger(suggestionId) || suggestionId < 1) {
            return writeJson(response, 400, { ok: false, error: '需要正整数 suggestion_id' })
          }
          const mrp = await import('./mrp-run.mts')
          if (action === 'confirm') await mrp.confirmSuggestion(wmsToken, suggestionId, operator)
          else if (action === 'dismiss') await mrp.dismissSuggestion(wmsToken, suggestionId, operator)
          else return writeJson(response, 400, { ok: false, error: `action 仅接受 confirm/dismiss（收到 ${String(action)}）` })
          const intentId = Number(body['intent_record_id'])
          if (Number.isInteger(intentId) && intentId > 0) {
            await io.destroy('mrp_confirm_intents', intentId)
          }
          return writeJson(response, 200, { ok: true, suggestion_id: suggestionId, action })
        }
        if (request.method === 'POST' && (url.pathname === '/act' || url.pathname === '/submit')) {
          const body = await readBody(request)
          const docType = typeof body['doc_type'] === 'string' ? body['doc_type'] : ''
          const docId = Number(body['doc_id'])
          if (docType === '' || !Number.isInteger(docId) || docId < 1) {
            return writeJson(response, 400, { ok: false, error: '需要 doc_type 与正整数 doc_id' })
          }
          const approver = typeof body['approver'] === 'string' && body['approver'] !== '' ? body['approver'] : 'admin'
          const comment = typeof body['comment'] === 'string' && body['comment'] !== '' ? body['comment'] : undefined
          const intentId = Number(body['intent_record_id'])
          if (url.pathname === '/submit') {
            const result = await submitForApproval(io, docType, docId, approver)
            return writeJson(response, 200, { ok: true, result })
          }
          const action = body['action']
          if (action !== 'approve' && action !== 'reject' && action !== 'void') {
            return writeJson(response, 400, { ok: false, error: `act 仅接受 approve/reject/void（收到 ${String(action)}）` })
          }
          const result = await act(io, docType, docId, action, approver, comment, 'page')
          if (docType === 'so_orders' && result.effective) {
            const { reserveForSo } = await import('./mrp-run.mts')
            const doc = await io.get(docType, docId)
            const reservation = await reserveForSo(wmsToken, String(doc?.code ?? docId))
            return writeJson(response, 200, { ok: true, result, reservation })
          }
          // W2-B2: approving an MPS plan locks its snapshot in — one final
          // max-merge at the effective moment; later SO changes leave the
          // approved plan alone (the soft time fence).
          if (docType === 'mps_plans' && result.effective) {
            const { recalcPlan } = await import('./mrp-run.mts')
            const recalc = await recalcPlan(wmsToken, docId)
            return writeJson(response, 200, { ok: true, result, recalc })
          }
          if (Number.isInteger(intentId) && intentId > 0) {
            await io.destroy('wfl_approval_records', intentId)
          }
          return writeJson(response, 200, { ok: true, result })
        }
        writeJson(response, 404, { ok: false, error: `no route ${request.method} ${url.pathname}` })
      } catch (error) {
        writeJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    })()
  })
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  console.log(`approval-engine: serving on http://127.0.0.1:${port} (POST /act, POST /submit, POST /post-count-adjust, POST /scan-reorder, POST /calc-scorecard, POST /run-mrp, POST /calc-kpi, POST /run-nightly, POST /confirm-suggestion, GET /todos, GET /healthz)`)
  // W2-B7: the built-in nightly timer — armed only on the env opt-in, fully
  // silent otherwise (zero drift from the W-round external-cron form). The
  // per-minute check fires when the local wall clock has passed the target
  // time and this process has not yet run the day (a restart may replay the
  // day — every leg is idempotent).
  if (nightly.enabled) {
    let lastRunDate = ''
    setInterval(() => {
      const { date, hhmm } = tzNow(nightly.tz)
      if (hhmm < nightly.at || lastRunDate === date) return
      lastRunDate = date
      void runNightlySteps(wmsToken, 'timer', nightly).catch(error => {
        console.error(`approval-engine: nightly timer pass crashed — ${error instanceof Error ? error.message : String(error)}`)
      })
    }, 60_000)
    console.log(`approval-engine: nightly timer armed — daily at ${nightly.at} ${nightly.tz}（legs：scan-reorder → run-mrp → 月末 snapshot-month → calc-kpi，季初追加 calc-scorecard；marker 为进程内存，重启可能同日补跑——各腿均幂等）`)
  }
}

// ─── in-memory IO + selftest ───

/** The in-memory NocoIO the selftest drives (documents, flow tables, gates — enough surface for the orchestration). */
class MemoryIO implements NocoIO {
  readonly store = new Map<string, Array<Record<string, any>>>()
  private seq = 0

  rowsOf(collection: string): Array<Record<string, any>> {
    let rows = this.store.get(collection)
    if (rows === undefined) {
      rows = []
      this.store.set(collection, rows)
    }
    return rows
  }

  matches(row: Record<string, any>, filter: Record<string, unknown> | undefined): boolean {
    return Object.entries(filter ?? {}).every(([key, value]) => row[key] === value)
  }

  async list(collection: string, filter?: Record<string, unknown>): Promise<Array<Record<string, any>>> {
    return this.rowsOf(collection).filter(row => this.matches(row, filter))
  }

  async get(collection: string, id: number): Promise<Record<string, any> | undefined> {
    return this.rowsOf(collection).find(row => Number(row.id) === id)
  }

  async create(collection: string, values: Record<string, unknown>): Promise<Record<string, any>> {
    this.seq += 1
    const row = { id: this.seq, createdAt: new Date().toISOString(), ...values }
    this.rowsOf(collection).push(row)
    return row
  }

  async update(collection: string, id: number, values: Record<string, unknown>): Promise<void> {
    const row = await this.get(collection, id)
    if (row === undefined) throw new Error(`${collection} 第 ${id} 行不存在（内存自测）`)
    Object.assign(row, values)
  }

  async updateWhere(collection: string, filter: Record<string, unknown>, values: Record<string, unknown>): Promise<number> {
    const rows = this.rowsOf(collection).filter(row => this.matches(row, filter))
    for (const row of rows) Object.assign(row, values)
    return rows.length
  }

  async destroy(collection: string, id: number): Promise<void> {
    const rows = this.rowsOf(collection)
    const index = rows.findIndex(row => Number(row.id) === id)
    if (index >= 0) rows.splice(index, 1)
  }
}

/** One selftest assertion (deep-compare; throws with the label on failure). */
function expect(that: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`selftest 失败：${that} — 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}

/** Run one async body, returning its rejection message ('' when it resolved). */
async function failureOf(body: () => Promise<unknown>): Promise<string> {
  try {
    await body()
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * The in-memory selftest: the full state-machine sequence (draft→submit→
 * pending→approve→approved), the amount-threshold route (>100k routes to
 * pending_level2, second approve lands), reject→resubmit with attempt_no+1,
 * the repeat-act refusal (no double writes), the gate refusal, the edit lock,
 * and the supplier-admission flow (potential→reviewing→qualified with the
 * lifecycle gate's negative/positive pair) — all against the shared rules
 * module the production engine runs.
 */
export async function selftest(): Promise<void> {
  // Pure-rule layer first.
  expect('阈值内一审即生效', nextStateOf('pending', 'approve', 90_000), 'approved')
  expect('超限一审进加签', nextStateOf('pending', 'approve', 100_001), 'pending_level2')
  expect('阈值边界含等号', nextStateOf('pending', 'approve', DEFAULT_AMOUNT_THRESHOLD), 'approved')
  expect('无金额列一审即生效', nextStateOf('pending', 'approve', undefined), 'approved')
  expect('驳回侧翼', nextStateOf('pending', 'reject', 500), 'rejected')
  expect('作废只从生效态', nextStateOf('draft', 'void', 500), undefined)
  expect('锚点映射', [DOC_STATUS_ANCHORS.draft, DOC_STATUS_ANCHORS.approved, DOC_STATUS_ANCHORS.void], [0, 1, 2])

  // In-memory orchestration: the pilot flow plus two purchase orders. The
  // users rows must exist before any todo opens: the approver-existence
  // check reads the users table fail-loud.
  const io = new MemoryIO()
  await io.create('users', { username: 'admin', nickname: '管理员' })
  await io.create('users', { username: 'quality_lead', nickname: '质量主管' })
  await seedFlow(io)
  const small = await io.create('hub_po_purchase_orders', { po_number: 'PO-TEST-1', total: 16_000, doc_status: 'draft' })
  const large = await io.create('hub_po_purchase_orders', { po_number: 'PO-TEST-2', total: 250_000, doc_status: 'draft' })

  // Sequence one: submit → approve (≤ threshold) lands approved in one round.
  let result = await submitForApproval(io, 'hub_po_purchase_orders', Number(small.id), 'chenliqun')
  expect('提交后待审批', result.to_state, 'pending')
  expect('首轮 attempt', result.attempt_no, 1)
  expect('主表状态回写', (await io.get('hub_po_purchase_orders', Number(small.id)))?.doc_status, 'pending')
  const todos1 = await listTodos(io, 'admin')
  expect('一级待办生成', todos1.length, 1)
  result = await act(io, 'hub_po_purchase_orders', Number(small.id), 'approve', 'admin', '同意，按合同执行')
  expect('一审生效', result.to_state, 'approved')
  expect('生效锚点', result.to_anchor, 1)
  expect('回写审批人', (await io.get('hub_po_purchase_orders', Number(small.id)))?.approved_by, 'admin')
  expect('待办清零', (await listTodos(io, 'admin')).length, 0)
  const records1 = await io.list('wfl_approval_records', { doc_type: 'hub_po_purchase_orders', doc_id: Number(small.id) })
  expect('审计两行（提交+同意）', records1.length, 2)

  // Repeat act on the approved document refuses (idempotence by state, no double records).
  const repeat = await failureOf(() => act(io, 'hub_po_purchase_orders', Number(small.id), 'approve', 'admin'))
  if (repeat === '') throw new Error('selftest 失败：已生效单据的重复 act 未被拒绝')
  const recordsAfterRepeat = await io.list('wfl_approval_records', { doc_type: 'hub_po_purchase_orders', doc_id: Number(small.id) })
  expect('重复 act 不双写', recordsAfterRepeat.length, 2)

  // Sequence two: the amount-threshold route and reject→resubmit attempt_no+1.
  await submitForApproval(io, 'hub_po_purchase_orders', Number(large.id), 'chenliqun')
  result = await act(io, 'hub_po_purchase_orders', Number(large.id), 'approve', 'admin', '金额超限，报总经理加签')
  expect('超限一审进二级', result.to_state, 'pending_level2')
  const todos2 = await io.list('wfl_approval_todos', { doc_id: Number(large.id), status: 'open' })
  expect('二级待办生成', todos2.length, 1)
  expect('二级待办态', todos2[0]?.state, 'pending_level2')
  result = await act(io, 'hub_po_purchase_orders', Number(large.id), 'reject', 'admin', '供应商资质不全')
  expect('驳回', result.to_state, 'rejected')
  result = await submitForApproval(io, 'hub_po_purchase_orders', Number(large.id), 'chenliqun')
  expect('驳回重提整链重走', result.to_state, 'pending')
  expect('重提 attempt+1', result.attempt_no, 2)

  // Illegal transitions fail loud with the Chinese message.
  const illegal = await failureOf(() => act(io, 'hub_po_purchase_orders', Number(large.id), 'void', 'admin'))
  if (!illegal.includes('非法审批转移')) throw new Error(`selftest 失败：非法转移消息缺失（${illegal}）`)

  // The gate: a draft purchase order cannot drive a receipt; approved passes.
  // (large is pending after the resubmit above — two approvals land it: the
  // threshold route, then the level-2 sign-off.)
  await act(io, 'hub_po_purchase_orders', Number(large.id), 'approve', 'admin', '加签通过')
  await act(io, 'hub_po_purchase_orders', Number(large.id), 'approve', 'admin', '二级通过')
  const draftPo = await io.create('hub_po_purchase_orders', { po_number: 'PO-TEST-3', total: 1, doc_status: 'draft' })
  const gateFailure = await failureOf(() => enforceGates(io, 'wms_receipts', { source_no: 'PO-TEST-3' }))
  if (!gateFailure.includes('未生效')) throw new Error(`selftest 失败：卡口消息缺「未生效」（${gateFailure}）`)
  const gateMissing = await failureOf(() => enforceGates(io, 'wms_receipts', { source_no: 'PO-TEST-404' }))
  if (!gateMissing.includes('未生效')) throw new Error(`selftest 失败：卡口对缺行未拦截（${gateMissing}）`)
  await enforceGates(io, 'wms_receipts', { source_no: 'PO-TEST-2' })
  await enforceGates(io, 'wms_receipts', { source_no: null })

  // The edit lock: approved/pending documents refuse, draft passes.
  const lockFailure = await failureOf(() => assertEditable(io, 'hub_po_purchase_orders', Number(small.id), '采购单'))
  if (!lockFailure.includes('锁定编辑')) throw new Error(`selftest 失败：锁编辑消息缺失（${lockFailure}）`)
  await assertEditable(io, 'hub_po_purchase_orders', Number(draftPo.id), '采购单')

  // The supplier-admission flow (B2): potential → submit → reviewing (locked)
  // → approve → qualified with admitted_at; the lifecycle gate then refuses a
  // potential supplier and passes qualified/preferred ones.
  await seedAdmissionFlow(io)
  const supplier = await io.create('srm_suppliers', { name: '新味源', lifecycle_status: 'potential', source: 'internal', code: 'SUP-2026-0001' })
  result = await submitForApproval(io, 'srm_suppliers', Number(supplier.id), 'chenliqun')
  expect('提交后准入评审中', result.to_state, 'reviewing')
  expect('准入待办生成', (await listTodos(io, 'admin')).filter(todo => todo.doc_type === 'srm_suppliers').length, 1)
  const admissionLock = await failureOf(() => assertEditable(io, 'srm_suppliers', Number(supplier.id), '供应商档案'))
  if (!admissionLock.includes('锁定编辑')) throw new Error(`selftest 失败：准入锁编辑消息缺失（${admissionLock}）`)
  result = await act(io, 'srm_suppliers', Number(supplier.id), 'approve', 'admin', '资质齐全，同意准入')
  expect('准入通过为合格', result.to_state, 'qualified')
  expect('合格为生效锚点', result.to_anchor, 1)
  expect('准入日期回写', (await io.get('srm_suppliers', Number(supplier.id)))?.admitted_at, today())
  const admissionIllegal = await failureOf(() => act(io, 'srm_suppliers', Number(supplier.id), 'void', 'admin'))
  if (!admissionIllegal.includes('非法准入转移')) throw new Error(`selftest 失败：准入非法转移消息缺失（${admissionIllegal}）`)
  await io.create('wfl_gate_configs', {
    downstream_collection: 'hub_po_purchase_orders', upstream_collection: 'srm_suppliers',
    upstream_field: 'supplier_id', upstream_ref_field: null, upstream_label: '供应商',
    upstream_state_field: 'lifecycle_status', required_status: 'qualified,preferred',
  })
  const pendingSupplier = await io.create('srm_suppliers', { name: '潜在供应商', lifecycle_status: 'potential' })
  const denied = await failureOf(() => enforceGates(io, 'hub_po_purchase_orders', { supplier_id: pendingSupplier.id }))
  if (!denied.includes('未准入') || !denied.includes('不合格供方')) throw new Error(`selftest 失败：供应商卡口消息缺「未准入/不合格供方」（${denied}）`)
  await enforceGates(io, 'hub_po_purchase_orders', { supplier_id: supplier.id })
  const preferredSupplier = await io.create('srm_suppliers', { name: '优选供应商', lifecycle_status: 'preferred' })
  await enforceGates(io, 'hub_po_purchase_orders', { supplier_id: preferredSupplier.id })

  // W2-B5: the threshold rides flow extras; the manager tier may name two
  // approvers (either may act); a missing key falls back to the default.
  const hubFlow = await loadFlow(io, 'hub_po_purchase_orders')
  expect('缺省阈值回退', hubFlow.threshold, DEFAULT_AMOUNT_THRESHOLD)
  const b5Options = {
    amountField: 'amount', amountThreshold: 200_000,
    approverMap: { manager: ['admin', 'quality_lead'], gm: 'admin' },
  }
  await seedDocFlow(io, 'test_b5_orders', 'B5阈值配置流', b5Options)
  const b5Flow = await loadFlow(io, 'test_b5_orders')
  expect('配置阈值生效', b5Flow.threshold, 200_000)
  expect('阈值键落库', b5Flow.extras?.amount_threshold, 200_000)
  const b5ApproveRows = await io.list('wfl_flow_transitions', { flow_id: b5Flow.id, state: 'pending', action: 'approve' })
  expect('条件串带配置阈值', b5ApproveRows.find(row => row.next_state === 'approved')?.condition_expr, 'amount <= 200000')
  const smallB5 = await io.create('test_b5_orders', { code: 'PO-B5-T1', amount: 150_000, doc_status: 'draft' })
  await submitForApproval(io, 'test_b5_orders', Number(smallB5.id), '陈立群')
  const tier = await io.list('wfl_approval_todos', { doc_id: Number(smallB5.id), status: 'open' })
  expect('多审批人展开两行', tier.length, 2)
  expect('展开含 quality_lead', tier.some(row => row.user === 'quality_lead'), true)
  result = await act(io, 'test_b5_orders', Number(smallB5.id), 'approve', 'quality_lead', '15 万一审')
  expect('15 万一审生效', result.to_state, 'approved')
  const tierAfter = await io.list('wfl_approval_todos', { doc_id: Number(smallB5.id) })
  expect('任一人 act 全档作废', tierAfter.every(row => row.status === 'completed'), true)
  const recordsB5 = await io.list('wfl_approval_records', { doc_type: 'test_b5_orders', doc_id: Number(smallB5.id) })
  expect('留痕 quality_lead', recordsB5[recordsB5.length - 1]?.approver, 'quality_lead')
  const largeB5 = await io.create('test_b5_orders', { code: 'PO-B5-T2', amount: 250_000, doc_status: 'draft' })
  await submitForApproval(io, 'test_b5_orders', Number(largeB5.id), '陈立群')
  result = await act(io, 'test_b5_orders', Number(largeB5.id), 'approve', 'admin', '25 万加签')
  expect('25 万走二级', result.to_state, 'pending_level2')
  result = await act(io, 'test_b5_orders', Number(largeB5.id), 'approve', 'admin', '二级通过')
  expect('二级生效', result.to_state, 'approved')
  // Repair idempotence: a same-options re-seed keeps every row (one audit line).
  await seedDocFlow(io, 'test_b5_orders', 'B5阈值配置流', b5Options)
  const b5Config = (await io.list('wfl_flow_configs', { doc_type: 'test_b5_orders' }))[0]
  expect('重跑零修复留一行审计', String(b5Config?.config_note ?? '').split('\n').length, 1)
  // Repair convergence: a drifted condition literal returns to the configured threshold and appends one audit line.
  const driftedRow = b5ApproveRows.find(row => row.next_state === 'approved')
  await io.update('wfl_flow_transitions', Number(driftedRow?.id), { condition_expr: 'amount <= 100000' })
  await seedDocFlow(io, 'test_b5_orders', 'B5阈值配置流', b5Options)
  const repairedCondition = (await io.list('wfl_flow_transitions', { flow_id: b5Flow.id, state: 'pending', action: 'approve' }))
    .find(row => row.next_state === 'approved')?.condition_expr
  expect('漂移条件修复', repairedCondition, 'amount <= 200000')
  const b5ConfigAfterRepair = (await io.list('wfl_flow_configs', { doc_type: 'test_b5_orders' }))[0]
  expect('修复追加一行审计', String(b5ConfigAfterRepair?.config_note ?? '').split('\n').length, 2)
  // Negative: approver_map naming a user the users table lacks refuses at submit.
  await seedDocFlow(io, 'test_ghost_flow', '幽灵审批人流', { approverMap: { manager: 'ghost', gm: 'admin' } })
  const ghostOrder = await io.create('test_ghost_flow', { code: 'PO-GHOST-1', amount: 1, doc_status: 'draft' })
  const ghostRefusal = await failureOf(() => submitForApproval(io, 'test_ghost_flow', Number(ghostOrder.id), '陈立群'))
  if (!ghostRefusal.includes('不存在的用户')) throw new Error(`selftest 失败：幽灵审批人未拦截（${ghostRefusal}）`)
  expect('幽灵流零待办', (await io.list('wfl_approval_todos', { doc_id: Number(ghostOrder.id) })).length, 0)
  // Negative: a malformed amount_threshold fails loud at flow load.
  await io.create('wfl_flow_configs', {
    doc_type: 'test_bad_extras', title: '坏阈值流', state_field: 'doc_status', is_active: true,
    approver_map: JSON.stringify({ manager: 'admin', gm: 'admin' }),
    extras: JSON.stringify({ amount_threshold: 'abc' }),
  })
  const badExtras = await failureOf(() => loadFlow(io, 'test_bad_extras'))
  if (!badExtras.includes('amount_threshold')) throw new Error(`selftest 失败：非法阈值未 fail-loud（${badExtras}）`)

  console.log('approval-engine: selftest OK — 状态机全序列/金额阈值加签/驳回重提/非法转移/卡口/幂等/锁编辑/供应商准入流/准入卡口/B5阈值配置+多审批人 全部通过')
}

// ─── CLI ───

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    await selftest()
    return
  }
  const io = await restIO()
  if (args.includes('--seed-flow')) {
    await seedFlow(io)
    return
  }
  if (args.includes('--seed-admission')) {
    await seedAdmissionFlow(io)
    return
  }
  if (args.includes('--seed-mps-flow')) {
    await seedMpsFlow(io)
    return
  }
  if (args.includes('--serve')) {
    const port = Number(args[args.indexOf('--serve') + 1] ?? 13_110)
    await serve(Number.isInteger(port) && port > 0 ? port : 13_110)
    return
  }
  const submitIndex = args.indexOf('--submit')
  if (submitIndex >= 0) {
    const result = await submitForApproval(io, args[submitIndex + 1], Number(args[submitIndex + 2]), args[submitIndex + 3] ?? 'admin')
    console.log(`approval-engine: submitted — ${JSON.stringify(result)}`)
    return
  }
  const actIndex = args.indexOf('--act')
  if (actIndex >= 0) {
    const comment = args.slice(actIndex + 5).join(' ') || undefined
    const result = await act(io, args[actIndex + 1], Number(args[actIndex + 2]), args[actIndex + 3] as ApprovalAction, args[actIndex + 4] ?? 'admin', comment)
    console.log(`approval-engine: acted — ${JSON.stringify(result)}`)
    if (args[actIndex + 1] === 'so_orders' && result.effective) {
      const { reserveForSo } = await import('./mrp-run.mts')
      const doc = await io.get('so_orders', Number(args[actIndex + 2]))
      await reserveForSo(await signInWithRetry(), String(doc?.code ?? args[actIndex + 2]))
    }
    // W2-B2: approving an MPS plan locks its snapshot in (one final recalc).
    if (args[actIndex + 1] === 'mps_plans' && result.effective) {
      const { recalcPlan } = await import('./mrp-run.mts')
      await recalcPlan(await signInWithRetry(), Number(args[actIndex + 2]))
    }
    return
  }
  if (args.includes('--todos')) {
    const user = args[args.indexOf('--todos') + 1]
    console.log(JSON.stringify(await listTodos(io, user === undefined || user.startsWith('--') ? undefined : user), null, 2))
    return
  }
  const gateIndex = args.indexOf('--gate')
  if (gateIndex >= 0) {
    await enforceGates(io, args[gateIndex + 1], JSON.parse(args[gateIndex + 2]) as Record<string, unknown>)
    console.log('approval-engine: gate passed')
    return
  }
  throw new Error('用法：--selftest | --seed-flow | --seed-admission | --seed-mps-flow | --serve [port] | --submit <docType> <id> [submitter] | --act <docType> <id> <action> [approver] [comment…] | --todos [user] | --gate <collection> <valuesJson>')
}

// Library imports (nocobase-w1-approval.mts's seedFlow) must not run the CLI.
if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
