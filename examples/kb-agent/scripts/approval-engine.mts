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
 *
 * W3-B5 adds department routing for approver_map entries: a role value may
 * be `{type:'department', value:'<部门名>'}` (plugin-departments), which
 * openTodo expands to that department's member usernames through
 * departmentsUsers — the OR-sign-off semantics carry over unchanged. A map
 * with no department entry takes the byte-identical pure path (缺省零漂移);
 * an unknown or member-less department fails loud. The nb_approve tool path
 * resolves pure maps only — a department entry fails loud there, so route
 * department forms to document types the pages/CLI drive.
 *
 * W5-B0 adds the visual-designer surface on --serve: the /designer static
 * SPA (examples/kb-agent/designer/dist — React18+antd5+@xyflow/react 12),
 * GET /designer/meta (doc types/users/roles/departments/form-field option
 * lists), and GET/POST /flow-graph over the new wfl_flow_configs.graph json
 * column (idempotently added at serve start). B0 persists the editing state
 * only — the engine still reads its states/transitions rows; publish-time
 * compilation/derivation and its gates are B1. W5_DESIGNER_ENABLED=false
 * removes the routes (the token guard rides the W3_TERMINAL_TOKEN regime).
 * R0 hardens the editing path: POST requires base_version and rejects a
 * stale base with 409 (optimistic lock), and validateFlowGraph additionally
 * refuses negative coordinates, over-long or angle-bracket node titles, and
 * approval nodes with empty assignees.
 * W5-R1 flips the save to an atomic compare-and-swap over one psql UPDATE
 * (NocoBase's REST filter update is a find→update pair, not a CAS primitive
 * — live-concurrency evidence caught it double-writing): the WHERE pins
 * id + doc_type + graph_version = base_version and zero rows moved answers
 * 409, with structured serve logs on the success/conflict/error paths,
 * title trimming on both sides of the wire, {{t(...)}} template-title
 * resolution in /designer/meta, and non-finite-coordinate rejection.
 *
 * W5-B1 adds the publish chain: compileGraphToRows derives
 * wfl_flow_states/wfl_flow_transitions rows from the stored graph (one-way —
 * graph stays the editing truth, rows stay the runtime truth), rowsToGraph
 * reverses existing rows into a graph draft, and assertRowsEquivalent gates
 * the round trip. POST /flow-graph/publish runs fail-loud gates (orphans,
 * endpoints, cycles, reachability, condition DSL vs the field vocabulary,
 * the engine-consumable feature matrix) plus the round-trip gate, then
 * rewrites the derived rows in ONE data-modifying-CTE statement: every
 * DELETE/INSERT arm keys off `bumped` (the CAS UPDATE ... RETURNING), so a
 * lost CAS no-ops the whole publish — a multi-statement string would commit
 * "UPDATE 0" and still run the DELETEs. The pre-publish rows snapshot into
 * config_note (replayable rollback anchor); the engine's transition code
 * never changes.
 *
 * W3-B6 adds the operator-terminal surface on --serve (D9): three narrow
 * business verbs — POST /report-job (报工: 完成+待求+损失=本循环计划数,
 * ERPNext complete_job_card clamp), POST /inspect-submit (逐项打分 →
 * readings rows + inspectInspection), POST /receive-goods (按单收货 →
 * enforceGates + 超收/错品 refusal + postReceipt) — plus their card-list
 * GETs (/terminal/report|inspect|receive) and the static touch pages under
 * /terminals/*. Every write calls the existing engine functions (no second
 * implementation); UI-side checks are experience only. Auth: env token
 * W3_TERMINAL_TOKEN (header x-terminal-token or query token) + the B5
 * department tables gate each surface's operator (生产车间/质检部/仓储部);
 * unset token = lenient demo (production must set it). W3_TERMINAL_ENABLED=
 * false removes the routes entirely (缺省零漂移: the engine never starts a
 * write unless an endpoint is called).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { call, dataOf, signInWithRetry } from './nocobase-flow-page-lib.mts'
import { calcScorecard, inspectInspection, postCountAdjust, postJobReport, postReceipt, scanReorder, snapshotMonthlyBalances } from './nocobase-h5-wms.mts'
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

/** One approver_map department entry (W3-B5 D8): the role routes to every user attached to the named plugin-departments department. */
export interface DepartmentApprover {
  readonly type: 'department'
  readonly value: string
}

/** Every value an approver_map entry may carry: one username, the department form, or an array mixing both. */
export type ApproverMapValue = string | DepartmentApprover | ReadonlyArray<string | DepartmentApprover>

/** A parsed wfl_flow_configs.approver_map (W3-B5: department entries join the username forms). */
export type ApproverMap = Record<string, ApproverMapValue>

/** One wfl_flow_configs row (the engine's resolved configuration). */
export interface FlowConfig {
  readonly id: number
  readonly doc_type: string
  readonly state_field: string
  readonly approver_map: ApproverMap
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
  const approverMap = parseJsonColumn<ApproverMap>(row.approver_map, 'approver_map', `审批流 #${row.id}`)
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

/** Whether one raw approver_map entry is the department form (a `{type:'department'}` object with a non-empty title). */
function isDepartmentRef(raw: unknown): raw is DepartmentApprover {
  if (typeof raw !== 'object' || raw === null) return false
  const record = raw as Record<string, unknown>
  return record['type'] === 'department' && typeof record['value'] === 'string' && record['value'].trim() !== ''
}

/**
 * Resolve one department's member usernames (the W3-B5 routing expansion):
 * the departmentsUsers rows carry userIds, mapped through the users table so
 * todo rows land as usernames. A department that exists but has no members
 * fails loud — an approval tier nobody can act on is a configuration error,
 * not a policy. Duplicate usernames collapse (map order kept).
 * @param io - the data access to run over.
 * @param deptTitle - the department title the approver_map entry names.
 * @param context - the fail-loud message prefix (flow and role).
 * @returns the department's member usernames.
 */
async function departmentUsernames(io: NocoIO, deptTitle: string, context: string): Promise<readonly string[]> {
  const departments = await io.list('departments', {})
  const department = departments.find(row => String(row.title ?? '') === deptTitle)
  if (department === undefined) {
    throw new Error(`${context} 引用不存在的部门「${deptTitle}」（departments 表无此名称）`)
  }
  const users = await io.list('users', {})
  const usernameOf = new Map(users.map(row => [String(row.id), String(row.username ?? '')]))
  const links = await io.list('departmentsUsers', {})
  const members = links
    .filter(row => String(row.departmentId ?? '') === String(department.id))
    .map(row => usernameOf.get(String(row.userId ?? '')) ?? '')
    .filter(username => username !== '')
  if (members.length === 0) {
    throw new Error(`${context} 的部门「${deptTitle}」没有成员（departmentsUsers 无挂接用户），无法展开审批待办`)
  }
  return [...new Set(members)]
}

/**
 * Resolve one role's approver usernames, expanding department entries
 * (W3-B5 D8): `{type:'department', value:'质检部'}` becomes the department's
 * member usernames and mixes freely with plain usernames. A role value with
 * no department entry delegates to the shared pure resolver with the same
 * map and arguments as W2 — the pure path is byte-identical (缺省零漂移).
 * @param io - the data access to run over.
 * @param flow - the resolved flow configuration.
 * @param role - the transition's allowed_role the todo expansion reads.
 * @returns the role's approver usernames.
 */
async function resolveApproversOfRole(io: NocoIO, flow: FlowConfig, role: string): Promise<readonly string[]> {
  const raw = flow.approver_map[role]
  const entries = raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw : [raw]
  if (entries.length === 0 || !entries.some(isDepartmentRef)) {
    return approversOfRole(flow.approver_map, role)
  }
  const context = `审批流「${flow.doc_type}」角色 ${role}`
  const users: string[] = []
  for (const entry of entries) {
    if (isDepartmentRef(entry)) {
      users.push(...await departmentUsernames(io, entry.value, context))
    } else if (typeof entry === 'string' && entry.trim() !== '') {
      users.push(entry.trim())
    } else {
      throw new Error(`审批流角色 ${role} 的 approver_map 值非法：${JSON.stringify(raw)}（应为用户名、{"type":"department","value":"部门名"} 或二者的数组）`)
    }
  }
  return [...new Set(users)]
}

/**
 * Create the open todo rows for a state that waits on one role. The role's
 * approver_map value may name several users (an array) or a department
 * (W3-B5): each resolved user expands to one todo row, and any one of them
 * acting completes the whole tier — the OR-sign-off contract (counter-sign
 * belongs to the enterprise edition).
 */
async function openTodo(io: NocoIO, flow: FlowConfig, docType: string, docId: number, state: string): Promise<readonly string[]> {
  const transitions = await io.list('wfl_flow_transitions', { flow_id: flow.id, state })
  const leaving = transitions.find(row => row.action === 'approve')
  if (leaving === undefined) {
    throw new Error(`审批流「${flow.doc_type}」缺 ${state} 状态的 approve 转移（wfl_flow_transitions）；配置不完整`)
  }
  const users = await resolveApproversOfRole(io, flow, String(leaving.allowed_role ?? ''))
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
 * pilot (a role value may be one username, an array — any one may act — or
 * the W3-B5 department form {type:'department', value:'部门名'});
 * amountThreshold and invoiceMatchTolerance seed their extras keys when given
 * (omitted leaves an existing flow's keys untouched).
 */
export async function seedDocFlow(io: NocoIO, docType: string, title: string, options: {
  amountField?: string,
  approverMap?: ApproverMap,
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

// ─── psql CAS (W5-R1: the flow-graph save bypasses the NocoBase REST update) ───

/**
 * The psql runner over platform/nocobase/.env credentials (the w4-heal-b4
 * precedent). NocoBase's REST `:update?filter=` is a find→update-by-pk pair
 * (packages/core/database/src/repository.ts update()), so two same-instant
 * conditional updates can both find the old version and both write — the
 * REST filter is not a compare-and-swap primitive. A single SQL UPDATE is:
 * PG row-locks the tuple and re-evaluates the WHERE for the second racer,
 * so exactly one side moves the row.
 * @returns a runner executing one SQL statement and returning raw stdout.
 */
function psqlRunner(): (sql: string) => string {
  const env = readFileSync(fileURLToPath(new URL('../../../platform/nocobase/.env', import.meta.url)), 'utf8')
  const envOf = (key: string): string | undefined => env.split('\n').map(line => line.trim()).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1)
  const base = ['-h', envOf('DB_HOST') ?? 'localhost', '-p', envOf('DB_PORT') ?? '5432', '-U', envOf('DB_USER') ?? 'postgres', '-d', envOf('DB_NAME') ?? 'nocobase', '-t', '-A']
  const psqlEnv = { ...process.env, PGPASSWORD: envOf('DB_PASSWORD') ?? 'nocobase' }
  return (sql: string): string => {
    const run = spawnSync('psql', [...base, '-c', sql], { encoding: 'utf8', env: psqlEnv, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })
    if (run.status !== 0) throw new Error(`psql failed: ${sql.slice(0, 120)}…\n${(run.stderr ?? '').slice(0, 300)}`)
    return run.stdout ?? ''
  }
}

/** One SQL single-quoted literal (standard_conforming_strings on — only ' doubles). */
const sqlLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`

// ─── HTTP serve (:13110, the workflow request callback target) ───

/** Read one request's JSON body (size-capped). */
async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > 100_000) throw new Error('请求体超过 100000 字节上限（readBody size cap）')
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  return JSON.parse(text) as Record<string, unknown>
}

/** One JSON response write (optional extra headers, e.g. the terminal-auth marker). */
function writeJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(JSON.stringify(body))
}

// ─── W3-B6: the operator-terminal verbs (pure validation + HTTP glue) ───

/** An endpoint failure that carries its own HTTP status (401/403/404). */
class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** One inspection reading row the terminal submits (qm_inspection_readings shape plus the UI-only critical flag). */
export interface TerminalReading {
  readonly parameter: string
  readonly spec_min?: number | null
  readonly spec_max?: number | null
  readonly criteria?: string | null
  readonly actual?: number | null
  /** Non-numeric rows carry the inspector's pass/fail big-button verdict; numeric rows ignore it. */
  readonly pass?: boolean | null
  /** UI-only: a failed row counted as a critical defect (0 收 1 拒) instead of major. */
  readonly critical?: boolean | null
}

/**
 * The report-job equation clamp (ERPNext complete_job_card): every unit of
 * this cycle's plan must be accounted for — 完成 + 待求 + 损失 = 本循环计划数,
 * where 本循环计划数 = MO qty − reported so far. qty_pending stays out of the
 * engine's cumulative columns (it is the not-yet-finished remainder the next
 * cycle reports); the equation therefore also proves qty_good + qty_scrap
 * fits the engine's per-operation cumulative ceiling.
 * @param moQty - the MO's planned quantity.
 * @param reportedSoFar - Σ(qty_good + qty_scrap) of this operation's posted reports.
 * @returns the cycle plan the three numbers must sum to.
 */
export function validateReportEquation(moQty: number, reportedSoFar: number, qtyGood: number, qtyPending: number, qtyScrap: number): { planForCycle: number } {
  for (const [name, value] of [['qty_good', qtyGood], ['qty_pending', qtyPending], ['qty_scrap', qtyScrap]] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`报工被拒：${name} 需要不小于 0 的数（收到 ${String(value)}）`)
    }
  }
  const planForCycle = Number((moQty - reportedSoFar).toFixed(6))
  if (planForCycle <= 1e-9) {
    throw new Error(`报工被拒：本循环计划数已报满（计划 ${String(moQty)}，已报 ${String(reportedSoFar)}）——无剩余可报`)
  }
  const sum = qtyGood + qtyPending + qtyScrap
  if (Math.abs(sum - planForCycle) > 1e-9) {
    throw new Error(`三数等式被拒：完成 ${String(qtyGood)} + 待求 ${String(qtyPending)} + 损失 ${String(qtyScrap)} = ${String(sum)} ≠ 本循环计划数 ${String(planForCycle)}（数量必须全部交代去向）`)
  }
  return { planForCycle }
}

/** A numeric reading row: at least one spec bound is a finite number. A null
 * bound is absent, not zero — Number(null) === 0 would silently turn sensory
 * rows (both bounds null) into numeric rows judged 0 ∈ [0, 0] = pass and flip
 * an inspector's explicit 不合格 into Accepted. */
const isNumericRow = (row: TerminalReading): boolean =>
  typeof row.spec_min === 'number' || typeof row.spec_max === 'number'

/**
 * Judge one reading row: numeric rows auto-judge actual against
 * [spec_min, spec_max] (ERPNext reading formula; an absent bound is open),
 * non-numeric rows take the inspector's explicit pass. Fails loud when a
 * numeric row lacks its reading or a non-numeric row lacks a verdict.
 * @param row - the terminal's reading input.
 * @returns the row's judged pass flag.
 */
export function judgeReading(row: TerminalReading): boolean {
  if (isNumericRow(row)) {
    if (row.actual === null || !Number.isFinite(Number(row.actual))) {
      throw new Error(`检验行「${row.parameter}」带规格上下限但缺实测读数（数值行必须录 actual）`)
    }
    const actual = Number(row.actual)
    const min = typeof row.spec_min === 'number' ? row.spec_min : -Infinity
    const max = typeof row.spec_max === 'number' ? row.spec_max : Infinity
    return actual >= min && actual <= max
  }
  if (typeof row.pass !== 'boolean') {
    throw new Error(`检验行「${row.parameter}」无规格区间，需大按钮给出 pass/fail 判定`)
  }
  return row.pass
}

/** The three-severity defect counts inspectInspection takes. */
export interface DefectCounts {
  readonly critical: number
  readonly major: number
  readonly minor: number
}

/**
 * Fold judged readings into the AQL defect counts: every failed row counts
 * as one defect — critical when the UI flagged it (严重 0 收 1 拒), major
 * otherwise (the food-line default; minor stays a manual entry path).
 * @param rows - the terminal's reading inputs.
 * @returns the counts plus each row's judged pass for row-level persistence.
 */
export function defectsFromReadings(rows: ReadonlyArray<TerminalReading>): { defects: DefectCounts, judged: Array<{ row: TerminalReading, pass: boolean }> } {
  let critical = 0
  let major = 0
  const judged = rows.map(row => {
    const pass = judgeReading(row)
    if (!pass && row.critical === true) critical += 1
    else if (!pass) major += 1
    return { row, pass }
  })
  return { defects: { critical, major, minor: 0 }, judged }
}

/** One receive line the terminal submits (扫码/键入 lot + 数量). */
export interface ReceiveLine {
  readonly product_id: number
  readonly lot_no: string
  readonly qty: number
}

/**
 * The receive-goods line clamp: every line's product must be an ordered PO
 * line, quantities must be positive finite numbers, and no line may push
 * its PO line past 订购量 − 已收 (超收 fail-loud — the posting engine itself
 * has no over-receipt guard, so the endpoint owns this entrance check).
 * @param poLines - the PO's lines ({product_id, qty, qty_received}).
 * @param lines - the terminal's receive lines.
 */
export function validateReceiveLines(poLines: ReadonlyArray<{ product_id: number, qty: number, qty_received: number }>, lines: ReadonlyArray<ReceiveLine>): void {
  if (lines.length === 0) throw new Error('收货被拒：至少一行扫码明细')
  const incoming = new Map<number, number>()
  for (const line of lines) {
    if (!Number.isInteger(line.product_id) || line.product_id < 1) {
      throw new Error(`收货被拒：行物料 id 非法（${String(line.product_id)}）`)
    }
    if (typeof line.lot_no !== 'string' || line.lot_no.trim() === '') {
      throw new Error(`收货被拒：物料 #${String(line.product_id)} 缺批次号（扫码或键入 lot）`)
    }
    if (!Number.isFinite(line.qty) || line.qty <= 0) {
      throw new Error(`收货被拒：物料 #${String(line.product_id)} 数量需大于 0（收到 ${String(line.qty)}）`)
    }
    const ordered = poLines.find(poLine => Number(poLine.product_id) === line.product_id)
    if (ordered === undefined) {
      throw new Error(`收货被拒：物料 #${String(line.product_id)} 不在本 PO 的订单行内（错品收货）`)
    }
    incoming.set(line.product_id, (incoming.get(line.product_id) ?? 0) + line.qty)
  }
  for (const [productId, qty] of incoming) {
    const ordered = poLines.find(poLine => Number(poLine.product_id) === productId)
    const ceiling = Number(ordered?.qty ?? 0) - Number(ordered?.qty_received ?? 0)
    if (qty > ceiling + 1e-9) {
      throw new Error(`超收被拒：物料 #${String(productId)} 本单可收 ${String(ceiling)}（订购 ${String(ordered?.qty)} − 已收 ${String(ordered?.qty_received)}），本次 ${String(qty)} 超出`)
    }
  }
}

/**
 * Resolve one document row by business code first, row id second (the
 * terminals' inputs accept either).
 * @param io - the data access to run over.
 * @param collection - the document's collection.
 * @param code - the business code (blank = fall through to id).
 * @param id - the row id.
 * @param label - the document's label for error messages.
 */
async function resolveOrderByCode(io: NocoIO, collection: string, code: string, id: number, label: string): Promise<Record<string, any>> {
  const trimmed = typeof code === 'string' ? code.trim() : ''
  const row = trimmed !== ''
    ? (await io.list(collection)).find(item => String(item.code) === trimmed)
    : Number.isInteger(id) && id >= 1 ? await io.get(collection, id) : undefined
  if (row === undefined) throw new Error(`找不到${label}（code=${trimmed} / id=${String(id)}）`)
  return row
}

/**
 * Mint the next `<PREFIX>-<year>-<NNNN>` code by scanning the collection's
 * live rows (unique-index safe: collisions throw on insert anyway).
 * @param io - the data access to run over.
 * @param collection - the collection whose codes are scanned.
 * @param prefix - the code prefix (JR / RCV-TERM).
 */
async function nextDocCode(io: NocoIO, collection: string, prefix: string, codeField: 'code' | 'receipt_no' = 'code'): Promise<string> {
  const year = new Date().getFullYear()
  const stem = `${prefix}-${year}-`
  const max = (await io.list(collection)).reduce((best, row) => {
    const code = String(row[codeField] ?? '')
    return code.startsWith(stem) ? Math.max(best, Number(code.slice(stem.length)) || 0) : best
  }, 0)
  return `${stem}${String(max + 1).padStart(4, '0')}`
}

/** The department each terminal surface is fenced to (B5 tables gate the operator). */
const TERMINAL_DEPARTMENTS: Readonly<Record<'report' | 'inspect' | 'receive', string>> = {
  report: '生产车间',
  inspect: '质检部',
  receive: '仓储部',
}

/**
 * Resolve and fence one terminal operator: the username must be a member of
 * the surface's department (plugin-departments tables), admin bypasses. A
 * wrong-department operator is a 403 (they cannot see the other surfaces'
 * queues), an unknown department fails loud as a seed problem.
 * @param io - the data access to run over.
 * @param operator - the requested username (blank → admin).
 * @param surface - the terminal the request targets.
 * @returns the fenced username.
 */
async function terminalOperator(io: NocoIO, operator: unknown, surface: 'report' | 'inspect' | 'receive'): Promise<string> {
  const name = typeof operator === 'string' && operator !== '' ? operator : 'admin'
  if (name === 'admin') return name
  const members = await departmentUsernames(io, TERMINAL_DEPARTMENTS[surface], `终端 ${surface}`)
  if (!members.includes(name)) {
    throw new HttpError(403, `操作员 ${name} 不属于${TERMINAL_DEPARTMENTS[surface]}（终端 ${surface} 的部门围栏；B5 部门表无此挂接）`)
  }
  return name
}

/**
 * The static touch pages' guard: with W3_TERMINAL_TOKEN set every terminal
 * route (pages included) must present it (header x-terminal-token or query
 * token); unset means the lenient local-demo档 (the response marker says so —
 * a production deployment must set the env).
 */
function checkTerminalToken(request: IncomingMessage, url: URL): void {
  if (process.env['W3_TERMINAL_TOKEN'] === undefined || process.env['W3_TERMINAL_TOKEN'] === '') return
  const header = request.headers['x-terminal-token']
  const presented = (Array.isArray(header) ? header[0] : header) ?? url.searchParams.get('token') ?? ''
  if (presented !== process.env['W3_TERMINAL_TOKEN']) {
    throw new HttpError(401, '终端端点需要 token（W3_TERMINAL_TOKEN 已配置）：header x-terminal-token、query ?token=，或首次经 URL ?token= 注入后由 localStorage 复用')
  }
}

/** The static-page whitelist (files served from scripts/w3-terminals/). */
const TERMINAL_STATIC_FILES: Readonly<Record<string, string>> = {
  'report.html': 'text/html; charset=utf-8',
  'inspect.html': 'text/html; charset=utf-8',
  'receive.html': 'text/html; charset=utf-8',
  'terminal.css': 'text/css; charset=utf-8',
}

// ─── W5-B0: the visual designer surface (graph editing state only) ───

/** The designer SPA's static-file whitelist (files served from ../designer/dist/). */
const DESIGNER_STATIC_FILES: Readonly<Record<string, string>> = {
  'index.html': 'text/html; charset=utf-8',
  'designer.js': 'text/javascript; charset=utf-8',
  'designer.css': 'text/css; charset=utf-8',
}

const GRAPH_NODE_KINDS: ReadonlySet<string> = new Set(['start', 'approval', 'cc', 'condition', 'end'])
/** Node-title ceiling mirrored by the designer SPA's input gate (R0 Important 8). */
const GRAPH_NODE_TITLE_MAX = 64
/** System column names excluded from /designer/meta's formFields vocabulary. */
const GRAPH_SYSTEM_FIELD_NAMES: ReadonlySet<string> = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'sort'])
/**
 * Resolve a NocoBase i18n template title to its readable text (W5-R1): role
 * and department rows may carry `{{t("Admin")}}` literals that would
 * otherwise leak straight into the designer's dropdown labels. A template's
 * inner string wins; a non-template title passes through trimmed; anything
 * unusable falls back to the caller's fallback.
 * @param title - the raw column value.
 * @param fallback - the readable name when the title is empty or malformed.
 * @returns the display label with no `{{t(` template remaining.
 */
function resolveI18nTitle(title: unknown, fallback: string): string {
  const text = typeof title === 'string' ? title.trim() : ''
  const match = /^\{\{t\("([^"]+)"\)\}\}$/u.exec(text)
  if (match !== null && match[1] !== '') return match[1]
  return text !== '' ? text : fallback
}

const GRAPH_ASSIGNEE_TYPES: ReadonlySet<string> = new Set(['user', 'role', 'deptLeader', 'supervisorChain', 'formField'])
const GRAPH_MODES: ReadonlySet<string> = new Set(['sequential', 'countersign', 'or'])
const GRAPH_EMPTY_POLICIES: ReadonlySet<string> = new Set(['autoPass', 'autoReject', 'transferAdmin', 'assignUser'])
const GRAPH_CONDITION_OPS: ReadonlySet<string> = new Set(['>', '>=', '<', '<=', '==', '!=', 'contains', 'in'])

/**
 * Structural validation of a designer graph — the editing state only.
 * Publish-time gates (orphans, missing end, cycles) are B1; here the bar is
 * "persistable and re-loadable without distortion": node ids unique, kinds
 * known, approval/cc/condition payloads shaped (approval assignees
 * non-empty), titles non-blank after trimming, within 64 chars and free of
 * angle brackets, positions finite and non-negative, edges reference
 * existing nodes with no self-loops or duplicates.
 * @param graph - the decoded graph document from POST /flow-graph.
 * @returns the readable failure list; empty means the graph may be persisted.
 */
export function validateFlowGraph(graph: unknown): string[] {
  const failures: string[] = []
  if (typeof graph !== 'object' || graph === null || Array.isArray(graph)) return ['graph 需为对象（version/nodes/edges）']
  const doc = graph as Record<string, unknown>
  const nodes = Array.isArray(doc['nodes']) ? doc['nodes'] as unknown[] : null
  const edges = Array.isArray(doc['edges']) ? doc['edges'] as unknown[] : null
  if (nodes === null || edges === null) return ['graph.nodes 与 graph.edges 需为数组']
  if (nodes.length === 0) failures.push('graph.nodes 为空——画布至少需要一个节点')
  const seenIds = new Set<string>()
  for (const [index, value] of nodes.entries()) {
    if (typeof value !== 'object' || value === null) { failures.push(`节点 #${String(index)} 不是对象`); continue }
    const node = value as Record<string, unknown>
    if (typeof node['id'] !== 'string' || node['id'] === '') { failures.push(`节点 #${String(index)} 缺 id`); continue }
    if (seenIds.has(node['id'])) { failures.push(`节点 id 重复：${node['id']}`); continue }
    seenIds.add(node['id'])
    const label = `节点「${node['id']}」`
    const kind = String(node['type'])
    if (!GRAPH_NODE_KINDS.has(kind)) failures.push(`${label} type 非法：${kind}（仅 start/approval/cc/condition/end）`)
    const position = node['position']
    if (typeof position !== 'object' || position === null || typeof (position as Record<string, unknown>)['x'] !== 'number' || typeof (position as Record<string, unknown>)['y'] !== 'number') {
      failures.push(`${label} 缺 position.x/y 数值坐标`)
    } else {
      const x = (position as Record<string, unknown>)['x'] as number
      const y = (position as Record<string, unknown>)['y'] as number
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        failures.push(`${label} 坐标需为有限数值（x=${String(x)}, y=${String(y)}）——Infinity/NaN 序列化后无法还原画布位置`)
      } else if (x < 0 || y < 0) {
        failures.push(`${label} 坐标为负（x=${String(x)}, y=${String(y)}）——画布原点在左上，请把节点拖回画布内再保存`)
      }
    }
    const data = node['data']
    if (typeof data !== 'object' || data === null) { failures.push(`${label} 缺 data 负载`); continue }
    const payload = data as Record<string, unknown>
    if (typeof payload['title'] !== 'string' || payload['title'].trim() === '') failures.push(`${label} 缺名称（data.title 不能为空或纯空白）`)
    else {
      const title = payload['title'].trim()
      if (title.length > GRAPH_NODE_TITLE_MAX) failures.push(`${label} 名称超长：${String(title.length)} 字符（上限 ${String(GRAPH_NODE_TITLE_MAX)}）`)
      if (title.includes('<') || title.includes('>')) failures.push(`${label} 名称不能包含 < 或 > 字符`)
    }
    if (kind === 'approval') {
      const approval = payload['approval']
      if (typeof approval !== 'object' || approval === null) failures.push(`${label} 审批节点缺 data.approval`)
      else {
        const block = approval as Record<string, unknown>
        if (!GRAPH_ASSIGNEE_TYPES.has(String(block['assigneeType']))) failures.push(`${label} assigneeType 非法：${String(block['assigneeType'])}`)
        if (!GRAPH_MODES.has(String(block['mode']))) failures.push(`${label} mode 非法：${String(block['mode'])}`)
        if (!GRAPH_EMPTY_POLICIES.has(String(block['emptyPolicy']))) failures.push(`${label} emptyPolicy 非法：${String(block['emptyPolicy'])}`)
        if (!Array.isArray(block['assignees'])) failures.push(`${label} assignees 需为数组`)
        else if ((block['assignees'] as unknown[]).length === 0) failures.push(`${label} 审批人未配置（assignees 为空）`)
        else if (!(block['assignees'] as unknown[]).every(entry => typeof entry === 'string' && entry !== '')) failures.push(`${label} assignees 含空项（每项需非空字符串）`)
      }
    }
    if (kind === 'cc') {
      const cc = payload['cc']
      if (typeof cc !== 'object' || cc === null || !Array.isArray((cc as Record<string, unknown>)['assignees'])) failures.push(`${label} 抄送节点缺 data.cc.assignees 数组`)
    }
    if (kind === 'condition') {
      const condition = payload['condition']
      if (typeof condition !== 'object' || condition === null || !Array.isArray((condition as Record<string, unknown>)['rows'])) {
        failures.push(`${label} 条件节点缺 data.condition.rows 数组`)
      } else {
        const block = condition as Record<string, unknown>
        if (block['join'] !== 'and' && block['join'] !== 'or') failures.push(`${label} join 需为 and/or`)
        for (const [rowIndex, rowValue] of (block['rows'] as unknown[]).entries()) {
          if (typeof rowValue !== 'object' || rowValue === null) { failures.push(`${label} 条件行 #${String(rowIndex)} 不是对象`); continue }
          const row = rowValue as Record<string, unknown>
          if (typeof row['field'] !== 'string' || row['field'] === '') failures.push(`${label} 条件行 #${String(rowIndex)} 缺字段名`)
          if (!GRAPH_CONDITION_OPS.has(String(row['op']))) failures.push(`${label} 条件行 #${String(rowIndex)} 操作符非法：${String(row['op'])}`)
        }
      }
    }
  }
  const seenEdgeIds = new Set<string>()
  const seenPairs = new Set<string>()
  for (const [index, value] of edges.entries()) {
    if (typeof value !== 'object' || value === null) { failures.push(`连线 #${String(index)} 不是对象`); continue }
    const edge = value as Record<string, unknown>
    if (typeof edge['id'] !== 'string' || edge['id'] === '') { failures.push(`连线 #${String(index)} 缺 id`); continue }
    if (seenEdgeIds.has(edge['id'])) { failures.push(`连线 id 重复：${edge['id']}`); continue }
    seenEdgeIds.add(edge['id'])
    const source = String(edge['source'])
    const target = String(edge['target'])
    if (!seenIds.has(source)) failures.push(`连线「${edge['id']}」起点节点不存在：${source}`)
    if (!seenIds.has(target)) failures.push(`连线「${edge['id']}」终点节点不存在：${target}`)
    if (source === target) failures.push(`连线「${edge['id']}」自环（${source} → ${target}）`)
    const pair = `${source}\u0000${target}`
    if (seenPairs.has(pair)) failures.push(`连线「${edge['id']}」重复：${source} → ${target}`)
    seenPairs.add(pair)
  }
  return failures
}

/**
 * The persist-time title trim (W5-R1): validateFlowGraph has already refused
 * whitespace-only titles, so every stored title is its trimmed form —
 * leading/trailing spaces and tabs (half- and full-width) never reach the
 * json column, keeping SPA-side trimming and the DB value in lockstep.
 * @param graph - the validated graph document.
 * @returns a shallow-copied graph whose node titles are trimmed.
 */
function normalizeGraphTitles(graph: Record<string, unknown>): Record<string, unknown> {
  const nodes = Array.isArray(graph['nodes']) ? graph['nodes'] as unknown[] : []
  return {
    ...graph,
    nodes: nodes.map(value => {
      if (typeof value !== 'object' || value === null) return value
      const node = value as Record<string, unknown>
      const data = node['data']
      if (typeof data !== 'object' || data === null || typeof (data as Record<string, unknown>)['title'] !== 'string') return node
      return { ...node, data: { ...(data as Record<string, unknown>), title: String((data as Record<string, unknown>)['title']).trim() } }
    }),
  }
}

// ─── W5-B1: the publish compiler — graph (editing truth) → derived wfl rows ───

/** One derived wfl_flow_states row (engine-consumable; mirrors the seed template). */
export interface CompiledStateRow {
  readonly state: string
  readonly doc_status_anchor: number
  readonly allow_edit_role: string
  readonly update_field: string
  readonly update_value: string
}

/** One derived wfl_flow_transitions row (the canonical roles are manager/gm/srm_manager, so derived rows byte-match the seed templates). */
export interface CompiledTransitionRow {
  readonly state: string
  readonly action: string
  readonly next_state: string
  readonly allowed_role: string
  readonly condition_expr: string
  readonly allow_self_approval: boolean
}

/** The full compile product: derived rows plus the wfl_flow_configs keys the graph owns. */
export interface CompiledRows {
  readonly vocabulary: 'doc' | 'admission'
  readonly states: ReadonlyArray<CompiledStateRow>
  readonly transitions: ReadonlyArray<CompiledTransitionRow>
  readonly approverMap: ApproverMap
  readonly extras: Record<string, unknown>
  /** Pass-through cc nodes — the graph keeps them; engine runtime cc rows are B2. */
  readonly ccCount: number
}

/** What the compiler needs beyond the graph itself (injected so the selftest stays pure). */
export interface CompileContext {
  /** The config row's state_field — selects the vocabulary the derived rows must fit. */
  readonly stateField: string
  /** The condition-field vocabulary (the /designer/meta formFields list). */
  readonly formFields: ReadonlyArray<string>
  /** The live config's extras — engine-owned keys pass through; the graph owns amount_field/amount_threshold. */
  readonly preserveExtras: Record<string, unknown> | null
  /** Every known username (the publish-time user-existence gate). */
  readonly knownUsernames: ReadonlySet<string>
  /** Resolves one NocoBase role name to its usernames (the publish-time role snapshot). */
  readonly usersOfRole: (role: string) => Promise<readonly string[]>
}

/**
 * The publish-gate families that need no external world (structural +
 * topology + feature matrix + condition DSL). Resolution-dependent gates
 * (user existence, role expansion) live in {@link compileGraphToRows}.
 * @param graph - the stored graph document (graph column).
 * @param formFields - the condition-field vocabulary.
 * @returns the readable failure list; empty means the graph passes the pure gates.
 */
export function publishGateFailures(graph: unknown, formFields: ReadonlyArray<string>): string[] {
  const failures = [...validateFlowGraph(graph)]
  if (failures.length > 0 && (typeof graph !== 'object' || graph === null || Array.isArray((graph as Record<string, unknown>)['nodes']) === false)) return failures
  const doc = graph as Record<string, unknown>
  const nodes = (Array.isArray(doc['nodes']) ? doc['nodes'] : []) as Array<Record<string, unknown>>
  const edges = (Array.isArray(doc['edges']) ? doc['edges'] : []) as Array<Record<string, unknown>>
  const kindOf = new Map(nodes.map(node => [String(node['id']), String(node['type'])]))
  const titleOf = (id: string): string => {
    const node = nodes.find(entry => String(entry['id']) === id)
    const data = node?.['data'] as Record<string, unknown> | undefined
    return typeof data?.['title'] === 'string' ? data['title'] : id
  }
  const starts = nodes.filter(node => String(node['type']) === 'start')
  const ends = nodes.filter(node => String(node['type']) === 'end')
  if (starts.length === 0) failures.push('缺开始节点（graph 需要恰好一个 start）')
  if (starts.length > 1) failures.push(`存在 ${String(starts.length)} 个开始节点（仅允许一个 start）`)
  if (ends.length === 0) failures.push('缺结束节点（graph 至少需要一个 end）')
  const inCount = new Map<string, number>()
  const outCount = new Map<string, number>()
  const outTargets = new Map<string, string[]>()
  for (const edge of edges) {
    const source = String(edge['source'])
    const target = String(edge['target'])
    inCount.set(target, (inCount.get(target) ?? 0) + 1)
    outCount.set(source, (outCount.get(source) ?? 0) + 1)
    outTargets.set(source, [...(outTargets.get(source) ?? []), target])
  }
  for (const node of nodes) {
    const id = String(node['id'])
    if ((inCount.get(id) ?? 0) + (outCount.get(id) ?? 0) === 0) failures.push(`孤立节点：「${titleOf(id)}」（没有任何连线相连）`)
  }
  // Cycle first (before degree/unreachable): a back edge reports the loop, not its symptoms.
  const color = new Map<string, 'gray' | 'black'>()
  const stack: string[] = []
  const visit = (id: string): void => {
    const state = color.get(id)
    if (state === 'black') return
    if (state === 'gray') {
      const loopStart = stack.indexOf(id)
      const loop = [...(loopStart >= 0 ? stack.slice(loopStart) : []), id].map(entry => `「${titleOf(entry)}」`).join(' → ')
      failures.push(`存在环：${loop}（审批流不允许循环流转）`)
      return
    }
    color.set(id, 'gray')
    stack.push(id)
    for (const next of outTargets.get(id) ?? []) visit(next)
    stack.pop()
    color.set(id, 'black')
  }
  for (const node of nodes) visit(String(node['id']))
  // Reachability from start (unreachable nodes can never execute).
  if (starts.length === 1) {
    const startId = String(starts[0]?.['id'])
    const reachable = new Set<string>([startId])
    const queue = [startId]
    while (queue.length > 0) {
      const current = queue.shift() as string
      for (const next of outTargets.get(current) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next)
          queue.push(next)
        }
      }
    }
    for (const node of nodes) {
      const id = String(node['id'])
      if (!reachable.has(id)) failures.push(`不可达节点：「${titleOf(id)}」（从开始节点出发无法到达）`)
    }
    if ((inCount.get(startId) ?? 0) > 0) failures.push('开始节点不允许有入边')
  }
  // Degree contracts per kind (they force the chain/branch shapes the walk assumes).
  for (const node of nodes) {
    const id = String(node['id'])
    const kind = String(node['type'])
    const label = `「${titleOf(id)}」`
    const out = outCount.get(id) ?? 0
    const into = inCount.get(id) ?? 0
    if (kind === 'start' && out !== 1) failures.push(`开始节点${label}需恰好一条出边（当前 ${String(out)} 条）`)
    if (kind === 'end' && out > 0) failures.push(`结束节点${label}不允许有出边`)
    if (kind === 'approval' && out !== 1) failures.push(`审批节点${label}需恰好一条出边（当前 ${String(out)} 条）`)
    if (kind === 'approval' && into !== 1) failures.push(`审批节点${label}需恰好一条入边（当前 ${String(into)} 条）`)
    if (kind === 'cc' && out !== 1) failures.push(`抄送节点${label}需恰好一条出边（当前 ${String(out)} 条）`)
    if (kind === 'cc' && into !== 1) failures.push(`抄送节点${label}需恰好一条入边（当前 ${String(into)} 条）`)
    if (kind === 'condition' && out !== 2) failures.push(`条件分支${label}需恰好两条出边（当前 ${String(out)} 条）`)
    if (kind === 'condition' && into !== 1) failures.push(`条件分支${label}需恰好一条入边（当前 ${String(into)} 条）`)
  }
  // Feature matrix: what the engine can consume without changes (B1 boundary; the rest is B2).
  for (const node of nodes) {
    if (String(node['type']) !== 'approval') continue
    const label = `审批节点「${titleOf(String(node['id']))}」`
    const block = (node['data'] as Record<string, unknown>)['approval'] as Record<string, unknown> | undefined
    if (block === undefined) continue
    const assigneeType = String(block['assigneeType'])
    if (assigneeType === 'supervisorChain') failures.push(`${label} 审批人类型「连续多级主管」依赖运行时提交人，引擎 B1 发布链路不支持（B2 启用）；请改用指定成员或角色`)
    if (assigneeType === 'formField') failures.push(`${label} 审批人类型「表单联系人字段」依赖单据运行时字段，引擎 B1 发布链路不支持（B2 启用）；请改用指定成员或角色`)
    if (assigneeType === 'deptLeader') failures.push(`${label} 审批人类型「部门主管」的引擎部门路由按全员展开（或签），主管专属语义 B1 不发布（B2 启用）；请改用指定成员或角色`)
    const mode = String(block['mode'])
    if (mode === 'sequential') failures.push(`${label} 多人方式「依次审批」需要引擎逐人聚合判定（B2 启用）；B1 仅支持或签（任一人可审）`)
    if (mode === 'countersign') failures.push(`${label} 多人方式「会签（全过）」需要引擎扇出聚合判定（B2 启用）；B1 仅支持或签（任一人可审）`)
    const emptyPolicy = String(block['emptyPolicy'])
    if (emptyPolicy === 'autoPass') failures.push(`${label} 空策略「自动通过」需要引擎跳过语义（B2 启用）；B1 支持自动拒绝/转交管理员`)
    if (emptyPolicy === 'assignUser') failures.push(`${label} 空策略「指定人员」需要引擎改派语义（B2 启用）；B1 支持自动拒绝/转交管理员`)
  }
  // Condition DSL: the engine consumes exactly one numeric > threshold row.
  for (const node of nodes) {
    if (String(node['type']) !== 'condition') continue
    const label = `条件分支「${titleOf(String(node['id']))}」`
    const condition = (node['data'] as Record<string, unknown>)['condition'] as Record<string, unknown> | undefined
    if (condition === undefined || !Array.isArray(condition['rows'])) continue
    const rows = condition['rows'] as Array<Record<string, unknown>>
    if (rows.length === 0) {
      failures.push(`${label} 缺条件行（至少一行「字段/操作符/值」）`)
      continue
    }
    if (rows.length > 1) failures.push(`${label} 有 ${String(rows.length)} 行条件——引擎 B1 仅支持单行金额阈值（多行条件在 B2 扩展条件 DSL）`)
    const row = rows[0] as Record<string, unknown>
    const field = String(row['field'] ?? '')
    const op = String(row['op'])
    const value = String(row['value'] ?? '')
    if (field === '') failures.push(`${label} 条件行缺字段名`)
    else if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(field)) failures.push(`${label} 条件字段名非法：${field}（需为数据库列名形式的标识符）`)
    else if (!formFields.includes(field)) failures.push(`${label} 条件字段 ${field} 不在单据字段词表（可在属性面板重新选择字段）`)
    if (op !== '>') failures.push(`${label} 条件操作符需为 >（引擎两级路由语义：金额超过阈值进二级审批，≤ 阈值一审即生效；其余操作符在 B2 扩展条件 DSL）`)
    if (!Number.isFinite(Number(value))) failures.push(`${label} 条件值需为有限数字（当前 ${value === '' ? '空' : value}）`)
  }
  return failures
}

/** The doc-vocabulary states template (byte-matches the seedDocFlow rows). */
const docStateRows = (): ReadonlyArray<CompiledStateRow> =>
  WORKFLOW_STATES.map(state => ({
    state,
    doc_status_anchor: DOC_STATUS_ANCHORS[state],
    allow_edit_role: state === 'draft' || state === 'rejected' ? 'submitter' : 'manager',
    update_field: '',
    update_value: '',
  }))

/** The doc-vocabulary transitions template: the ≤ literal rides the direct-approve row (the PILOT_TRANSITIONS shape). */
const docTransitionRows = (amountField: string | null, threshold: number | null): ReadonlyArray<CompiledTransitionRow> => [
  { state: 'draft', action: 'submit', next_state: 'pending', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
  { state: 'rejected', action: 'resubmit', next_state: 'pending', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
  { state: 'pending', action: 'approve', next_state: 'approved', allowed_role: 'manager', condition_expr: amountField === null || threshold === null ? '' : `${amountField} <= ${String(threshold)}`, allow_self_approval: true },
  { state: 'pending', action: 'approve', next_state: 'pending_level2', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
  { state: 'pending_level2', action: 'approve', next_state: 'approved', allowed_role: 'gm', condition_expr: '', allow_self_approval: true },
  { state: 'pending', action: 'reject', next_state: 'rejected', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
  { state: 'pending_level2', action: 'reject', next_state: 'rejected', allowed_role: 'gm', condition_expr: '', allow_self_approval: true },
  { state: 'approved', action: 'void', next_state: 'void', allowed_role: 'manager', condition_expr: '', allow_self_approval: true },
]

/** The admission-vocabulary states template (byte-matches the seedAdmissionFlow rows). */
const admissionStateRows = (): ReadonlyArray<CompiledStateRow> =>
  SUPPLIER_ADMISSION_STATES.map(state => ({
    state,
    doc_status_anchor: SUPPLIER_ADMISSION_ANCHORS[state],
    allow_edit_role: state === 'potential' || state === 'rejected' ? 'submitter' : 'srm_manager',
    update_field: '',
    update_value: '',
  }))

/** The admission-vocabulary transitions template (the ADMISSION_TRANSITIONS shape). */
const admissionTransitionRows = (): ReadonlyArray<CompiledTransitionRow> => [
  { state: 'potential', action: 'submit', next_state: 'reviewing', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
  { state: 'rejected', action: 'resubmit', next_state: 'reviewing', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
  { state: 'reviewing', action: 'approve', next_state: 'qualified', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
  { state: 'reviewing', action: 'reject', next_state: 'rejected', allowed_role: 'srm_manager', condition_expr: '', allow_self_approval: true },
]

/** One resolved approver-map value: a single username stays a string, several become an array (the live forms). */
const approverValueOf = (users: readonly string[]): ApproverMapValue => users.length === 1 ? users[0] as string : [...users]

/**
 * Compile one graph into the derived rows the engine consumes — the one-way
 * publish derivation. The graph's approval chain maps onto the fixed
 * vocabulary templates (canonical roles manager/gm/srm_manager), the optional
 * condition node becomes the two-level amount routing (extras.amount_field +
 * amount_threshold + the ≤ literal), and cc nodes pass through as graph-only.
 * Every gate failure is collected and reported together (fail loud, readable).
 * @param graph - the stored graph document (the graph column's decoded value).
 * @param ctx - the compile context (vocabulary, field vocabulary, extras base, user/role resolution).
 * @returns the derived rows, or the readable failure list.
 */
export async function compileGraphToRows(graph: unknown, ctx: CompileContext): Promise<{ ok: true, rows: CompiledRows } | { ok: false, errors: string[] }> {
  const failures = publishGateFailures(graph, ctx.formFields)
  if (failures.length > 0) return { ok: false, errors: failures }
  const doc = graph as Record<string, unknown>
  const nodes = (doc['nodes'] as Array<Record<string, unknown>>).map(node => ({
    id: String(node['id']),
    kind: String(node['type']),
    title: String((node['data'] as Record<string, unknown>)['title'] ?? node['id']),
    data: node['data'] as Record<string, unknown>,
  }))
  const edges = (doc['edges'] as Array<Record<string, unknown>>).map(edge => ({ source: String(edge['source']), target: String(edge['target']) }))
  const byId = new Map(nodes.map(node => [node.id, node]))
  const outTargets = new Map<string, string[]>()
  for (const edge of edges) outTargets.set(edge.source, [...(outTargets.get(edge.source) ?? []), edge.target])
  const onlyOut = (id: string): string => (outTargets.get(id) ?? [])[0] ?? ''
  /** Follow one out edge collapsing cc pass-throughs (cc has exactly one out; degree gates guaranteed it). */
  const collapse = (id: string): string => {
    let cursor = onlyOut(id)
    while (byId.get(cursor)?.kind === 'cc') cursor = onlyOut(cursor)
    return cursor
  }
  const start = nodes.find(node => node.kind === 'start') as { id: string } | undefined
  if (start === undefined) return { ok: false, errors: ['缺开始节点'] }
  // Walk the main chain recording approval/condition tokens (cc collapses, ends terminate).
  const tokens: Array<{ id: string, kind: 'approval' | 'condition' }> = []
  let cursor = collapse(start.id)
  let guard = 0
  const errors: string[] = []
  while (byId.get(cursor)?.kind !== 'end') {
    if (++guard > nodes.length + 1) return { ok: false, errors: ['主链走查越界（环检测遗漏？请报告）', ...errors] }
    const node = byId.get(cursor)
    if (node === undefined) return { ok: false, errors: [`主链走到未知节点 ${cursor}`, ...errors] }
    if (node.kind !== 'approval' && node.kind !== 'condition') {
      errors.push(`主链上出现非常规节点「${node.title}」（${node.kind}）——开始节点之后应是审批/条件/结束`)
      break
    }
    tokens.push({ id: cursor, kind: node.kind })
    if (node.kind === 'condition') {
      const [branchA, branchB] = (outTargets.get(cursor) ?? []).map(target => {
        let hop = target
        while (byId.get(hop)?.kind === 'cc') hop = onlyOut(hop)
        return hop
      })
      const kinds = [byId.get(branchA ?? '')?.kind, byId.get(branchB ?? '')?.kind].sort()
      if (kinds[0] !== 'approval' || kinds[1] !== 'end') {
        errors.push(`条件分支「${node.title}」的两条分支需分别指向二级审批节点和结束节点（当前指向 ${kinds.join('、')}）`)
        break
      }
      cursor = byId.get(branchA ?? '')?.kind === 'approval' ? branchA as string : branchB as string
    } else {
      cursor = collapse(cursor)
    }
  }
  if (errors.length > 0) return { ok: false, errors: [...failures, ...errors] }
  const approvals = tokens.filter(token => token.kind === 'approval')
  const conditions = tokens.filter(token => token.kind === 'condition')
  const sequence = tokens.map(token => token.kind).join(',')
  if (approvals.length === 0) return { ok: false, errors: [`主链无审批节点（序列 ${sequence}）——至少需要一个审批节点`] }
  if (approvals.length > 2) return { ok: false, errors: [`主链有 ${String(approvals.length)} 个审批节点——引擎六态词汇表至多支持两级审批（第三级需 B2 引擎扩展）`] }
  if (conditions.length > 1) return { ok: false, errors: [`主链有 ${String(conditions.length)} 个条件分支——至多一个（多路阈值路由需 B2 扩展）`] }
  if (conditions.length === 1 && sequence !== 'approval,condition,approval') {
    return { ok: false, errors: [`条件分支必须位于一级审批与二级审批之间（当前序列 ${sequence}）——条件决定金额超过阈值时进入二级审批`] }
  }
  if (conditions.length === 0 && approvals.length === 2 && sequence !== 'approval,approval') {
    return { ok: false, errors: [`主链序列异常：${sequence}（期望 approval,approval）`] }
  }
  if (conditions.length === 0 && approvals.length === 1 && sequence !== 'approval') {
    return { ok: false, errors: [`主链序列异常：${sequence}（期望 approval）`] }
  }
  const vocabulary: 'doc' | 'admission' | null =
    ctx.stateField === SUPPLIER_ADMISSION_STATE_FIELD ? 'admission' : ctx.stateField === 'doc_status' ? 'doc' : null
  if (vocabulary === null) {
    return { ok: false, errors: [`未知状态字段 ${ctx.stateField}——发布仅支持 doc_status（六态）与 lifecycle_status（准入四态）词汇表`] }
  }
  if (vocabulary === 'admission' && (approvals.length !== 1 || conditions.length !== 0)) {
    return { ok: false, errors: ['供应商准入词汇表仅支持单级审批、无条件分支（potential→reviewing→qualified）——多级/条件编排属于单据词汇表'] }
  }
  // Resolve each approval node's assignees into the approver_map value.
  const approverEntries: Array<[string, ApproverMapValue]> = []
  const roleNames = vocabulary === 'admission' ? ['srm_manager'] : approvals.length === 2 ? ['manager', 'gm'] : ['manager']
  for (const [index, token] of approvals.entries()) {
    const node = byId.get(token.id)
    const block = (node?.data['approval'] ?? {}) as Record<string, unknown>
    const label = `审批节点「${node?.title ?? token.id}」`
    const assigneeType = String(block['assigneeType'])
    const assignees = (Array.isArray(block['assignees']) ? block['assignees'] : []).map(entry => String(entry))
    if (assigneeType === 'user') {
      const missing = assignees.filter(user => !ctx.knownUsernames.has(user))
      if (missing.length > 0) {
        return { ok: false, errors: [`${label} 引用不存在的用户：${missing.join('、')}（users 表无此用户名；请重新选择审批人）`] }
      }
      approverEntries.push([roleNames[index] as string, approverValueOf(assignees)])
      continue
    }
    if (assigneeType === 'role') {
      const users: string[] = []
      for (const role of assignees) {
        const resolved = await ctx.usersOfRole(role)
        if (resolved.length === 0) {
          const emptyPolicy = String(block['emptyPolicy'])
          if (emptyPolicy === 'transferAdmin') {
            users.push('admin')
            continue
          }
          return { ok: false, errors: [`${label} 的角色「${role}」没有任何成员（发布期角色快照为空；emptyPolicy=${emptyPolicy}——改用「转交管理员」或先给角色挂用户）`] }
        }
        users.push(...resolved)
      }
      approverEntries.push([roleNames[index] as string, approverValueOf([...new Set(users)])])
      continue
    }
    return { ok: false, errors: [`${label} 审批人类型 ${assigneeType} 不可编译（publishGateFailures 应已拦截）`] }
  }
  const approverMap: ApproverMap = Object.fromEntries(approverEntries)
  // Amount routing: the condition node owns amount_field/amount_threshold; no condition → the keys drop out.
  const extras: Record<string, unknown> = { ...(ctx.preserveExtras ?? {}) }
  let amountField: string | null = null
  let threshold: number | null = null
  if (conditions.length === 1) {
    const condition = (byId.get(conditions[0]?.id ?? '')?.data['condition'] ?? {}) as Record<string, unknown>
    const row = ((condition['rows'] as Array<Record<string, unknown>>) ?? [])[0] as Record<string, unknown> | undefined
    amountField = String(row?.['field'] ?? '')
    threshold = Number(row?.['value'])
    extras.amount_field = amountField
    extras.amount_threshold = threshold
  } else {
    delete extras.amount_field
    delete extras.amount_threshold
  }
  const ccCount = nodes.filter(node => node.kind === 'cc').length
  if (vocabulary === 'admission') {
    return {
      ok: true,
      rows: {
        vocabulary,
        states: admissionStateRows(),
        transitions: admissionTransitionRows(),
        approverMap,
        extras: { ...(ctx.preserveExtras ?? {}) },
        ccCount,
      },
    }
  }
  return {
    ok: true,
    rows: {
      vocabulary: 'doc',
      states: docStateRows(),
      transitions: docTransitionRows(amountField, threshold),
      approverMap,
      extras,
      ccCount,
    },
  }
}

/** The live-row shape the reverse importer and the equivalence assertion read. */
export interface LiveFlowRows {
  readonly stateField: string
  readonly approverMap: ApproverMap
  readonly extras: Record<string, unknown> | null
  readonly states: ReadonlyArray<Record<string, any>>
  readonly transitions: ReadonlyArray<Record<string, any>>
}

/** Fixed grid coordinates for imported graphs (round-trip stability; purely cosmetic). */
const IMPORT_POSITIONS: Readonly<Record<'start' | 'approval_1' | 'condition' | 'approval_2' | 'end', { x: number, y: number }>> = {
  start: { x: 40, y: 160 },
  approval_1: { x: 320, y: 160 },
  condition: { x: 600, y: 60 },
  approval_2: { x: 880, y: 260 },
  end: { x: 1160, y: 60 },
}

/**
 * The reverse importer: existing wfl states/transitions/approver_map → a
 * graph draft. The canonical roles map back onto approval nodes (manager →
 * level 1, gm → level 2, srm_manager → admission), the ≤ literal becomes the
 * condition node's single `field > threshold` row, and department-form values
 * import as deptLeader nodes. Used by the publish round-trip gate and the B2
 * full migration.
 * @param live - the flow's live rows (config keys + states + transitions).
 * @returns the graph draft, or the readable failure list when the rows fit no known template.
 */
export function rowsToGraph(live: LiveFlowRows): { ok: true, graph: Record<string, unknown> } | { ok: false, errors: string[] } {
  const errors: string[] = []
  const transitionOf = (state: string, action: string, nextState?: string): Record<string, any> | undefined =>
    live.transitions.find(row => String(row.state) === state && String(row.action) === action && (nextState === undefined || String(row.next_state) === nextState))
  const assigneesOf = (role: string): { assigneeType: string, assignees: string[] } => {
    const value = live.approverMap[role]
    const entries = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]
    const plain = entries.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    if (plain.length === entries.length && entries.length > 0) return { assigneeType: 'user', assignees: plain }
    const departments = entries.filter(isDepartmentRef).map(entry => entry.value)
    if (departments.length === entries.length && entries.length > 0) return { assigneeType: 'deptLeader', assignees: departments }
    return { assigneeType: 'user', assignees: [] }
  }
  const nodes: Array<Record<string, unknown>> = []
  const edges: Array<Record<string, unknown>> = []
  const pushNode = (slot: 'start' | 'approval_1' | 'condition' | 'approval_2' | 'end', kind: string, data: Record<string, unknown>): string => {
    const id = `n_${slot}`
    nodes.push({ id, type: kind, position: { ...IMPORT_POSITIONS[slot] }, data })
    return id
  }
  const pushEdge = (source: string, target: string): void => {
    edges.push({ id: `e_${source}_${target}`, source, target })
  }
  const approvalDataOf = (resolved: { assigneeType: string, assignees: string[] }, title: string): Record<string, unknown> => ({
    title,
    approval: {
      assigneeType: resolved.assigneeType,
      assignees: resolved.assignees,
      mode: 'or',
      emptyPolicy: resolved.assignees.length === 0 ? 'autoReject' : 'transferAdmin',
    },
  })
  if (live.stateField === SUPPLIER_ADMISSION_STATE_FIELD) {
    const approve = transitionOf('reviewing', 'approve')
    if (approve === undefined) return { ok: false, errors: ['无法逆向导入：缺 reviewing×approve 转移（准入流模板不完整）'] }
    const role = String(approve.allowed_role ?? '')
    pushNode('start', 'start', { title: '发起人' })
    pushNode('approval_1', 'approval', approvalDataOf(assigneesOf(role), '准入评审'))
    pushNode('end', 'end', { title: '结束' })
    pushEdge('n_start', 'n_approval_1')
    pushEdge('n_approval_1', 'n_end')
    return { ok: true, graph: { version: 1, nodes, edges } }
  }
  if (live.stateField !== 'doc_status') return { ok: false, errors: [`无法逆向导入：未知状态字段 ${live.stateField}（支持 doc_status 与 ${SUPPLIER_ADMISSION_STATE_FIELD}）`] }
  const approve1 = transitionOf('pending', 'approve', 'approved') ?? transitionOf('pending', 'approve', 'pending_level2')
  if (approve1 === undefined) return { ok: false, errors: ['无法逆向导入：缺 pending×approve 转移（六态流模板不完整）'] }
  const level2 = transitionOf('pending_level2', 'approve', 'approved')
  const literal = String(approve1.condition_expr ?? '')
  const thresholdMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*<=\s*(-?\d+(?:\.\d+)?)$/u.exec(literal.trim())
  const twoLevel = level2 !== undefined
  if (!twoLevel && literal.trim() !== '') {
    errors.push(`无法逆向导入：无二级审批但一级审批带条件「${literal}」（种子模板不会产出此形状）`)
  }
  if (thresholdMatch !== null && !twoLevel) {
    errors.push(`无法逆向导入：条件「${literal}」存在但没有二级审批节点承接（模板不一致）`)
  }
  if (twoLevel && thresholdMatch === null && literal.trim() !== '') {
    errors.push(`无法逆向导入：一级审批条件「${literal}」不是「字段 <= 阈值」形式（编译器仅支持该 DSL）`)
  }
  const role2 = level2 === undefined ? '' : String(level2.allowed_role ?? '')
  pushNode('start', 'start', { title: '发起人' })
  pushNode('approval_1', 'approval', approvalDataOf(assigneesOf(String(approve1.allowed_role ?? '')), '一级审批'))
  pushEdge('n_start', 'n_approval_1')
  let tail = 'n_approval_1'
  if (thresholdMatch !== null) {
    const field = thresholdMatch[1] as string
    const threshold = thresholdMatch[2] as string
    pushNode('condition', 'condition', { title: '金额条件', condition: { join: 'and', rows: [{ field, op: '>', value: threshold }] } })
    pushEdge(tail, 'n_condition')
    tail = 'n_condition'
  }
  if (twoLevel) {
    pushNode('approval_2', 'approval', approvalDataOf(assigneesOf(role2), '二级审批'))
    if (tail === 'n_condition') {
      // The > branch continues into level 2; the ≤ branch goes straight to the end (approve → approved).
      pushEdge('n_condition', 'n_approval_2')
      pushEdge('n_condition', 'n_end')
    } else {
      pushEdge(tail, 'n_approval_2')
    }
    tail = 'n_approval_2'
  }
  pushNode('end', 'end', { title: '结束' })
  pushEdge(tail, 'n_end')
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, graph: { version: 1, nodes, edges } }
}

/**
 * The round-trip equivalence assertion: compare live rows against the
 * compiler's product with role keys normalized through the approver_map
 * values (derived roles are canonical manager/gm/srm_manager; live rows may
 * carry any keys naming the same approver sets).
 * @param current - the flow's live rows.
 * @param derived - the compiler's product over the re-imported graph.
 * @returns the diff list; empty means semantically equivalent.
 */
export function assertRowsEquivalent(current: LiveFlowRows, derived: CompiledRows): string[] {
  const diffs: string[] = []
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys)
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(key => [key, sortKeys((value as Record<string, unknown>)[key])]))
    }
    return value
  }
  const canonical = (value: unknown): string => JSON.stringify(sortKeys(value))
  const liveStates = [...current.states].sort((a, b) => String(a.state).localeCompare(String(b.state)))
  const derivedStates = [...derived.states].sort((a, b) => a.state.localeCompare(b.state))
  if (liveStates.length !== derivedStates.length) {
    diffs.push(`状态行数不一致：现库 ${String(liveStates.length)} vs 派生 ${String(derivedStates.length)}`)
  } else {
    for (const [index, liveRow] of liveStates.entries()) {
      const derivedRow = derivedStates[index] as CompiledStateRow
      const live = {
        state: String(liveRow.state),
        anchor: Number(liveRow.doc_status_anchor ?? 0),
        allow_edit_role: String(liveRow.allow_edit_role ?? ''),
        update_field: String(liveRow.update_field ?? ''),
        update_value: String(liveRow.update_value ?? ''),
      }
      const want = { state: derivedRow.state, anchor: derivedRow.doc_status_anchor, allow_edit_role: derivedRow.allow_edit_role, update_field: derivedRow.update_field, update_value: derivedRow.update_value }
      if (canonical(live) !== canonical(want)) diffs.push(`状态行不一致：${String(liveRow.state)} 现库 ${canonical(live)} vs 派生 ${canonical(want)}`)
    }
  }
  const liveTransitions = [...current.transitions].sort((a, b) =>
    `${String(a.state)}\u0000${String(a.action)}\u0000${String(a.next_state)}`.localeCompare(`${String(b.state)}\u0000${String(b.action)}\u0000${String(b.next_state)}`))
  const derivedTransitions = [...derived.transitions].sort((a, b) => `${a.state}\u0000${a.action}\u0000${a.next_state}`.localeCompare(`${b.state}\u0000${b.action}\u0000${b.next_state}`))
  if (liveTransitions.length !== derivedTransitions.length) {
    diffs.push(`转移行数不一致：现库 ${String(liveTransitions.length)} vs 派生 ${String(derivedTransitions.length)}`)
  } else {
    for (const [index, liveRow] of liveTransitions.entries()) {
      const derivedRow = derivedTransitions[index] as CompiledTransitionRow
      const liveKey = `${String(liveRow.state)}×${String(liveRow.action)}→${String(liveRow.next_state)}`
      const wantKey = `${derivedRow.state}×${derivedRow.action}→${derivedRow.next_state}`
      if (liveKey !== wantKey) {
        diffs.push(`转移不一致：现库 ${liveKey} vs 派生 ${wantKey}`)
        continue
      }
      if (String(liveRow.condition_expr ?? '') !== derivedRow.condition_expr) {
        diffs.push(`转移 ${liveKey} 条件不一致：现库「${String(liveRow.condition_expr ?? '')}」 vs 派生「${derivedRow.condition_expr}」`)
      }
      if (Boolean(liveRow.allow_self_approval) !== derivedRow.allow_self_approval) {
        diffs.push(`转移 ${liveKey} allow_self_approval 不一致：现库 ${String(Boolean(liveRow.allow_self_approval))} vs 派生 ${String(derivedRow.allow_self_approval)}`)
      }
      // Both sides normalize through the same lens: value → entries array → canonical JSON.
      const normalizeApprovers = (value: ApproverMapValue | undefined): string =>
        canonical(value === undefined ? [] : Array.isArray(value) ? value : [value])
      const liveApprovers = normalizeApprovers(current.approverMap[String(liveRow.allowed_role ?? '')])
      const derivedApprovers = normalizeApprovers(derived.approverMap[derivedRow.allowed_role])
      if (liveApprovers !== derivedApprovers) {
        diffs.push(`转移 ${liveKey} 审批人不一致：现库角色 ${String(liveRow.allowed_role ?? '')}=${liveApprovers} vs 派生角色 ${derivedRow.allowed_role}=${derivedApprovers}`)
      }
    }
  }
  if (canonical(current.approverMap) !== canonical(derived.approverMap)) {
    diffs.push(`approver_map 不一致：现库 ${canonical(current.approverMap)} vs 派生 ${canonical(derived.approverMap)}`)
  }
  if (canonical(current.extras ?? {}) !== canonical(derived.extras)) {
    diffs.push(`extras 不一致：现库 ${canonical(current.extras ?? {})} vs 派生 ${canonical(derived.extras)}`)
  }
  return diffs
}

/**
 * The /designer + /flow-graph handlers' config lookup: every flow row (active
 * or not) is a valid graph target — the editing state stays orthogonal to
 * activation until B1's publish derives states/transitions rows.
 * @param io - the data access to read through.
 * @param docType - the document-type collection key.
 */
async function flowConfigRow(io: NocoIO, docType: string): Promise<Record<string, any> | undefined> {
  const rows = await io.list('wfl_flow_configs', { doc_type: docType })
  return rows[0]
}

/**
 * The /designer/meta formFields vocabulary — the merged, deduplicated,
 * sorted editable field names across every flow config's doc-type
 * collection (the formField assignee type's AutoComplete options; free
 * input stays allowed, so the list is an aid, not a gate). System columns
 * (id/createdAt/…) are excluded by name.
 * @param token - a root auth token for the field-manager API.
 * @param configs - the wfl_flow_configs rows (their doc_type names the collection).
 * @returns the sorted unique field-name list.
 */
async function designerFormFieldVocabulary(token: string, configs: Array<Record<string, any>>): Promise<string[]> {
  const names = new Set<string>()
  for (const config of configs) {
    const collection = String(config.doc_type)
    const filter = encodeURIComponent(JSON.stringify({ collectionName: { $eq: collection } }))
    const fields = await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${filter}`) as Array<{ name?: string }> | null
    for (const field of fields ?? []) {
      const name = String(field.name ?? '')
      if (name !== '' && !GRAPH_SYSTEM_FIELD_NAMES.has(name)) names.add(name)
    }
  }
  return [...names].sort()
}

/**
 * Idempotently add wfl_flow_configs.graph (json) + graph_version (int) —
 * the designer's persistence columns. Old rows keep graph NULL and the engine
 * never reads these columns (B0 edits only; publish derivation is B1).
 * @param token - a root auth token for the field-manager API.
 */
export async function ensureGraphColumns(token: string): Promise<void> {
  const fields = await dataOf(token, 'GET', `/api/fields:list?pageSize=200&filter=${encodeURIComponent(JSON.stringify({ collectionName: { $eq: 'wfl_flow_configs' } }))}`) as Array<{ name?: string }> | null
  const present = new Set((fields ?? []).map(field => String(field.name)))
  const missing: Array<Record<string, unknown>> = []
  if (!present.has('graph')) missing.push({ name: 'graph', type: 'json', interface: 'json', uiSchema: { type: 'object', 'x-component': 'Input.JSON', title: '流程图（设计器编辑态）' } })
  if (!present.has('graph_version')) missing.push({ name: 'graph_version', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '图版本' } })
  if (!present.has('published_graph_version')) missing.push({ name: 'published_graph_version', type: 'integer', interface: 'number', uiSchema: { type: 'number', 'x-component': 'InputNumber', title: '已发布图版本' } })
  if (!present.has('published_at')) missing.push({ name: 'published_at', type: 'text', interface: 'input', uiSchema: { type: 'string', 'x-component': 'Input', title: '发布时间' } })
  for (const field of missing) {
    await dataOf(token, 'POST', '/api/fields:create', { collectionName: 'wfl_flow_configs', ...field })
    console.log(`approval-engine: wfl_flow_configs.${String(field['name'])} column added (W5-B0 designer editing state)`)
  }
}

/**
 * The atomic publish write: ONE SQL statement whose every effect hangs off a
 * data-modifying CTE. `bumped` re-writes the config row only when the CAS
 * baseline matches; the DELETE/INSERT arms all key off `bumped`'s output, so
 * a lost CAS (UPDATE matches zero rows) no-ops every arm. A multi-statement
 * string would NOT give this: psql's implicit transaction commits a clean
 * "UPDATE 0" and would still run the DELETEs (the derivation would land with
 * no version move).
 * @param flowId - the wfl_flow_configs row id.
 * @param docType - the document-type collection key (CAS guard).
 * @param baseVersion - the graph_version this publish is based on (CAS guard).
 * @param rows - the compiled derivation.
 * @param note - the appended config_note audit line (with the row snapshot).
 * @param publishedAt - the ISO publish timestamp.
 * @returns the SQL statement for one psql -c call.
 */
function publishSql(flowId: number, docType: string, baseVersion: number, rows: CompiledRows, note: string, publishedAt: string): string {
  const nextVersion = baseVersion + 1
  const stateValues = rows.states.map(row =>
    `(${sqlLiteral(row.state)}, ${String(row.doc_status_anchor)}, ${sqlLiteral(row.allow_edit_role)}, '', '')`).join(', ')
  const transitionValues = rows.transitions.map(row =>
    `(${sqlLiteral(row.state)}, ${sqlLiteral(row.action)}, ${sqlLiteral(row.next_state)}, ${sqlLiteral(row.allowed_role)}, ${sqlLiteral(row.condition_expr)}, ${row.allow_self_approval ? 'TRUE' : 'FALSE'})`).join(', ')
  return [
    `WITH bumped AS (UPDATE wfl_flow_configs SET graph_version = ${String(nextVersion)}, approver_map = ${sqlLiteral(JSON.stringify(rows.approverMap))}, extras = ${sqlLiteral(JSON.stringify(rows.extras))}, published_graph_version = ${String(nextVersion)}, published_at = ${sqlLiteral(publishedAt)}, config_note = ${sqlLiteral(note)} WHERE id = ${String(flowId)} AND doc_type = ${sqlLiteral(docType)} AND graph_version = ${String(baseVersion)} RETURNING id),`,
    `ds AS (DELETE FROM wfl_flow_states WHERE flow_id IN (SELECT id FROM bumped)),`,
    `dt AS (DELETE FROM wfl_flow_transitions WHERE flow_id IN (SELECT id FROM bumped)),`,
    `ins_s AS (INSERT INTO wfl_flow_states (flow_id, state, doc_status_anchor, allow_edit_role, update_field, update_value) SELECT b.id, v.state, v.anchor::integer, v.role, v.uf, v.uv FROM bumped b CROSS JOIN (VALUES ${stateValues}) AS v(state, anchor, role, uf, uv) RETURNING id),`,
    `ins_t AS (INSERT INTO wfl_flow_transitions (flow_id, state, action, next_state, allowed_role, condition_expr, allow_self_approval) SELECT b.id, v.state, v.action, v.next, v.role, v.cond, v.self FROM bumped b CROSS JOIN (VALUES ${transitionValues}) AS v(state, action, next, role, cond, self) RETURNING id)`,
    `SELECT (SELECT count(*) FROM bumped) AS bumped, (SELECT count(*) FROM ins_s) AS states, (SELECT count(*) FROM ins_t) AS transitions;`,
  ].join('\n')
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
 * snapshot-month → calc-kpi, appending calc-scorecard on every day of a
 * quarter-start month (each pass recomputes the running quarter
 * idempotently). Every leg is idempotent, a failed leg logs and the next
 * leg still runs, and the pass ends with a one-line summary — the timer
 * and the manual POST /run-nightly share this body verbatim.
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
  await ensureGraphColumns(wmsToken)
  // W5-R1: rows that predate the graph column carry graph_version NULL — in
  // SQL a NULL never equals any CAS baseline, so both same-instant saves
  // would 409 against a fresh row. Backfill 0 once per serve start (one SQL
  // UPDATE, idempotent; the engine's transition tables are untouched).
  const psql = psqlRunner()
  const backfilled = Number((psql('UPDATE wfl_flow_configs SET graph_version = 0 WHERE graph_version IS NULL;').trim().match(/^UPDATE (\d+)$/u) ?? [])[1] ?? 0)
  if (backfilled > 0) console.log(`approval-engine: graph_version 回填 0（${String(backfilled)} 行 NULL → 0，CAS 基线可比对）`)
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
        // W5-B0: the visual designer — static SPA + graph editing state (no
        // publish; that chain is B1). Token auth rides the terminal guard.
        if (url.pathname === '/designer' || url.pathname.startsWith('/designer/') || url.pathname === '/designer/meta' || url.pathname === '/flow-graph' || url.pathname === '/flow-graph/publish') {
          if ((process.env['W5_DESIGNER_ENABLED'] ?? 'true') === 'false') {
            throw new HttpError(404, '设计器端点已关闭（W5_DESIGNER_ENABLED=false）；引擎其余路由不受影响')
          }
          checkTerminalToken(request, url)
          const marker = { 'x-terminal-auth': process.env['W3_TERMINAL_TOKEN'] !== undefined && process.env['W3_TERMINAL_TOKEN'] !== '' ? 'strict' : 'lenient-demo' }
          if (request.method === 'GET' && url.pathname === '/designer/meta') {
            const configs = await io.list('wfl_flow_configs')
            const users = await io.list('users')
            const roles = await io.list('roles')
            const departments = await io.list('departments')
            const formFields = await designerFormFieldVocabulary(wmsToken, configs)
            return writeJson(response, 200, {
              ok: true,
              meta: {
                // Every label passes resolveI18nTitle so no {{t(...)}} template
                // ever leaks into a dropdown (W5-R1); the label is the already-
                // resolved display string.
                docTypes: configs.map(row => ({ doc_type: String(row.doc_type), title: resolveI18nTitle(row.title, String(row.doc_type)), graph_version: Number(row.graph_version ?? 0), has_graph: row.graph != null, published_graph_version: row.published_graph_version == null ? null : Number(row.published_graph_version), published_at: row.published_at == null ? null : String(row.published_at) })),
                users: users.map(row => ({ value: String(row.username ?? ''), label: String(row.nickname ?? '') !== '' ? `${String(row.nickname)}（${String(row.username)}）` : String(row.username ?? '') })),
                roles: roles.map(row => ({ value: String(row.name ?? ''), label: resolveI18nTitle(row.title, String(row.name ?? '')) })),
                departments: departments.flatMap(row => {
                  const title = resolveI18nTitle(row.title, '')
                  return title === '' ? [] : [{ value: title, label: title }]
                }),
                formFields,
              },
            }, marker)
          }
          if (request.method === 'GET' && (url.pathname === '/designer' || url.pathname.startsWith('/designer/'))) {
            const name = url.pathname === '/designer' ? 'index.html' : url.pathname.slice('/designer/'.length)
            const contentType = DESIGNER_STATIC_FILES[name]
            if (contentType === undefined) throw new HttpError(404, `no designer file ${url.pathname}`)
            const body = await readFile(fileURLToPath(new URL(`../designer/dist/${name}`, import.meta.url)))
            response.writeHead(200, { 'content-type': contentType, ...marker })
            response.end(body)
            return
          }
          if (request.method === 'GET' && url.pathname === '/flow-graph') {
            const docType = url.searchParams.get('doc_type') ?? ''
            if (docType === '') return writeJson(response, 400, { ok: false, error: '需要 doc_type 查询参数' })
            const row = await flowConfigRow(io, docType)
            if (row === undefined) return writeJson(response, 404, { ok: false, error: `wfl_flow_configs 无 doc_type=${docType} 行（先建流程头）` })
            return writeJson(response, 200, { ok: true, graph: row.graph ?? null, graph_version: Number(row.graph_version ?? 0) }, marker)
          }
          if (request.method === 'POST' && url.pathname === '/flow-graph') {
            const body = await readBody(request)
            const docType = String(body['doc_type'] ?? '')
            if (docType === '') return writeJson(response, 400, { ok: false, error: '需要 doc_type' })
            const baseVersion = Number(body['base_version'])
            if (!Number.isInteger(baseVersion) || baseVersion < 0) {
              return writeJson(response, 400, { ok: false, error: '需要 base_version（本次编辑所基于的 graph_version，非负整数）' })
            }
            const row = await flowConfigRow(io, docType)
            if (row === undefined) return writeJson(response, 404, { ok: false, error: `wfl_flow_configs 无 doc_type=${docType} 行（先建流程头）` })
            const failures = validateFlowGraph(body['graph'])
            if (failures.length > 0) return writeJson(response, 400, { ok: false, error: `graph 校验未通过（${String(failures.length)} 处）：\n - ${failures.join('\n - ')}` })
            const graph = normalizeGraphTitles(body['graph'] as Record<string, unknown>)
            const nextVersion = baseVersion + 1
            const note = `${String(row.config_note ?? '').trimEnd()}\n${new Date().toISOString()} w5b0 designer: graph saved v${String(nextVersion)} (nodes=${String(Array.isArray(graph['nodes']) ? graph['nodes'].length : 0)}, edges=${String(Array.isArray(graph['edges']) ? graph['edges'].length : 0)}); operator=designer`
            try {
              // W5-R1 atomic CAS over psql: NocoBase's REST filter update is a
              // find→update-by-pk pair, not a compare-and-swap — two same-
              // instant saves could both find the base version and both write
              // (live evidence run 3). One SQL UPDATE is atomic: the row lock
              // serializes the racers and the WHERE re-evaluates for the
              // second, so exactly one side moves the row (and its audit
              // line); the loser answers 409.
              const outcome = psql(`UPDATE wfl_flow_configs SET graph = ${sqlLiteral(JSON.stringify(graph))}::json, graph_version = ${String(nextVersion)}, config_note = ${sqlLiteral(note)} WHERE id = ${String(Number(row.id))} AND doc_type = ${sqlLiteral(docType)} AND graph_version = ${String(baseVersion)};`).trim()
              const moved = Number((outcome.match(/^UPDATE (\d+)$/u) ?? [])[1] ?? 0)
              if (moved === 0) {
                const currentVersion = Number((await flowConfigRow(io, docType))?.graph_version ?? 0)
                console.warn(`approval-engine: flow-graph 409 — doc_type=${docType} base_version=${String(baseVersion)} current_version=${String(currentVersion)}（并发保存一胜一败，败者需重载）`)
                return writeJson(response, 409, { ok: false, error: `版本冲突：画布基于 graph v${String(baseVersion)}，库里已是 v${String(currentVersion)}（他端已保存过）。请点「重新加载」拉取最新版本后重做修改。` })
              }
              console.log(`approval-engine: flow-graph saved — doc_type=${docType} v${String(baseVersion)}→v${String(nextVersion)}（nodes=${String(Array.isArray(graph['nodes']) ? graph['nodes'].length : 0)}, edges=${String(Array.isArray(graph['edges']) ? graph['edges'].length : 0)}）`)
              return writeJson(response, 200, { ok: true, doc_type: docType, graph_version: nextVersion }, marker)
            } catch (error) {
              console.error(`approval-engine: flow-graph unexpected failure — doc_type=${docType} base_version=${String(baseVersion)}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`)
              throw error
            }
          }
          // W5-B1: the publish verb — gates + one-way derivation + the atomic CTE rewrite.
          if (request.method === 'POST' && url.pathname === '/flow-graph/publish') {
            const body = await readBody(request)
            const docType = String(body['doc_type'] ?? '')
            if (docType === '') return writeJson(response, 400, { ok: false, errors: ['需要 doc_type'], error: '需要 doc_type' }, marker)
            const baseVersion = Number(body['base_version'])
            if (!Number.isInteger(baseVersion) || baseVersion < 0) {
              return writeJson(response, 400, { ok: false, errors: ['需要 base_version（本次发布所基于的 graph_version，非负整数）'], error: '需要 base_version（本次发布所基于的 graph_version，非负整数）' }, marker)
            }
            const row = await flowConfigRow(io, docType)
            if (row === undefined) return writeJson(response, 404, { ok: false, error: `wfl_flow_configs 无 doc_type=${docType} 行（先建流程头）` }, marker)
            if (row.graph === null || row.graph === undefined) {
              const error = '该流程还没有已保存的 graph（先在设计器保存画布再发布）'
              return writeJson(response, 400, { ok: false, errors: [error], error }, marker)
            }
            const graphVersion = Number(row.graph_version ?? 0)
            if (graphVersion !== baseVersion) {
              return writeJson(response, 409, { ok: false, error: `版本冲突：发布基于 graph v${String(baseVersion)}，库里已是 v${String(graphVersion)}（他端已保存/发布过）。请点「重新加载」拉取最新版本后再发布。` }, marker)
            }
            // The compile context: field vocabulary, known users, the psql role
            // snapshot, and the live extras the graph does not own.
            const formFields = await designerFormFieldVocabulary(wmsToken, [row])
            const knownUsernames = new Set((await io.list('users')).map(user => String(user.username ?? '')))
            const usersOfRole = async (role: string): Promise<readonly string[]> => {
              const output = psql(`SELECT u.username FROM "rolesUsers" r JOIN users u ON u.id = r."userId" WHERE r."roleName" = ${sqlLiteral(role)};`)
              return output.split('\n').map(line => line.trim()).filter(line => line !== '')
            }
            const stateField = String(row.state_field ?? 'doc_status')
            const preserveExtras = parseJsonColumn<Record<string, unknown>>(row.extras, 'extras', `审批流 #${String(row.id)}`) ?? {}
            const ctx: CompileContext = { stateField, formFields, preserveExtras, knownUsernames, usersOfRole }
            // Round-trip gate first: the compiler must faithfully reproduce the
            // CURRENT rows before it is trusted to replace them.
            const liveApproverMap = parseJsonColumn<ApproverMap>(row.approver_map, 'approver_map', `审批流 #${String(row.id)}`) ?? {}
            const liveStates = await io.list('wfl_flow_states', { flow_id: Number(row.id) })
            const liveTransitions = await io.list('wfl_flow_transitions', { flow_id: Number(row.id) })
            const live: LiveFlowRows = { stateField, approverMap: liveApproverMap, extras: preserveExtras, states: liveStates, transitions: liveTransitions }
            const roundTripErrors: string[] = []
            const imported = rowsToGraph(live)
            if (!imported.ok) {
              roundTripErrors.push(...imported.errors.map(error => `round-trip：${error}`))
            } else {
              const recompiled = await compileGraphToRows(imported.graph, ctx)
              if (!recompiled.ok) {
                roundTripErrors.push(...recompiled.errors.map(error => `round-trip 重编译失败：${error}`))
              } else {
                const drift = assertRowsEquivalent(live, recompiled.rows)
                if (drift.length > 0) roundTripErrors.push(...drift.map(error => `round-trip 等价断言失败：${error}`))
              }
            }
            if (roundTripErrors.length > 0) {
              const errors = [...roundTripErrors, '（编译器无法无损重现当前行表——拒绝发布，现有 states/transitions 继续生效）']
              console.warn(`approval-engine: publish round-trip gate refused — doc_type=${docType}\n - ${errors.join('\n - ')}`)
              return writeJson(response, 400, { ok: false, errors, error: `发布被 round-trip 等价断言拒绝（${String(errors.length)} 处）：\n - ${errors.join('\n - ')}` }, marker)
            }
            const compiled = await compileGraphToRows(row.graph, ctx)
            if (!compiled.ok) {
              console.warn(`approval-engine: publish gates refused — doc_type=${docType}（${String(compiled.errors.length)} 处）\n - ${compiled.errors.join('\n - ')}`)
              return writeJson(response, 400, { ok: false, errors: compiled.errors, error: `发布门禁未通过（${String(compiled.errors.length)} 处）：\n - ${compiled.errors.join('\n - ')}` }, marker)
            }
            const publishedAt = new Date().toISOString()
            // The rollback anchor: the pre-publish derived rows, replayable from config_note.
            const snapshot = JSON.stringify({
              states: liveStates.map(stateRow => ({ state: String(stateRow.state), anchor: Number(stateRow.doc_status_anchor ?? 0), role: String(stateRow.allow_edit_role ?? '') })),
              transitions: liveTransitions.map(transitionRow => ({ state: String(transitionRow.state), action: String(transitionRow.action), next: String(transitionRow.next_state), role: String(transitionRow.allowed_role ?? ''), cond: String(transitionRow.condition_expr ?? ''), self: Boolean(transitionRow.allow_self_approval) })),
              approver_map: liveApproverMap,
              extras: preserveExtras,
            })
            const note = `${String(row.config_note ?? '').trimEnd()}\n${publishedAt} w5b1 publish: graph v${String(baseVersion)}→v${String(baseVersion + 1)} derived ${String(compiled.rows.states.length)} states / ${String(compiled.rows.transitions.length)} transitions (${compiled.rows.vocabulary}); snapshot=${snapshot}; operator=designer`
            const outcome = psql(publishSql(Number(row.id), docType, baseVersion, compiled.rows, note, publishedAt)).trim()
            const counts = outcome.split('|').map(part => Number(part.trim()))
            if (counts.length !== 3 || !counts.every(count => Number.isFinite(count))) {
              console.error(`approval-engine: publish unexpected psql output — doc_type=${docType} ${outcome.slice(0, 200)}`)
              return writeJson(response, 500, { ok: false, error: '发布写入返回异常（psql 输出无法解析）——事务未落库或整体回滚，请检查服务日志' }, marker)
            }
            if ((counts[0] ?? 0) === 0) {
              const currentVersion = Number((await flowConfigRow(io, docType))?.graph_version ?? 0)
              console.warn(`approval-engine: publish 409 — doc_type=${docType} base_version=${String(baseVersion)} current_version=${String(currentVersion)}（并发保存/发布一胜一败，败者需重载）`)
              return writeJson(response, 409, { ok: false, error: `版本冲突：发布基于 graph v${String(baseVersion)}，库里已是 v${String(currentVersion)}（他端已保存/发布过）。请点「重新加载」拉取最新版本后再发布。` }, marker)
            }
            if ((counts[1] ?? 0) !== compiled.rows.states.length || (counts[2] ?? 0) !== compiled.rows.transitions.length) {
              console.error(`approval-engine: publish row-count mismatch — doc_type=${docType} inserted ${String(counts[1])}/${String(counts[2])} vs expected ${String(compiled.rows.states.length)}/${String(compiled.rows.transitions.length)}`)
              return writeJson(response, 500, { ok: false, error: '发布写入行数与编译产物不一致（事务已整体落库或整体回滚）——请检查服务日志' }, marker)
            }
            console.log(`approval-engine: published — doc_type=${docType} graph v${String(baseVersion)}→v${String(baseVersion + 1)}（${String(counts[1])} states / ${String(counts[2])} transitions, ${compiled.rows.vocabulary}, cc=${String(compiled.rows.ccCount)}）`)
            return writeJson(response, 200, {
              ok: true,
              doc_type: docType,
              graph_version: baseVersion + 1,
              published_at: publishedAt,
              derived: { states: counts[1], transitions: counts[2], vocabulary: compiled.rows.vocabulary, cc: compiled.rows.ccCount, roles: Object.keys(compiled.rows.approverMap) },
            }, marker)
          }
          throw new HttpError(405, `设计器端点不接受 ${String(request.method)} ${url.pathname}`)
        }
        // W3-B6: the operator terminals — static touch pages, card queues,
        // and the three narrow verbs (every write rides the engine functions).
        if (url.pathname.startsWith('/terminals/') || url.pathname.startsWith('/terminal/') || url.pathname === '/report-job' || url.pathname === '/inspect-submit' || url.pathname === '/receive-goods') {
          if ((process.env['W3_TERMINAL_ENABLED'] ?? 'true') === 'false') {
            throw new HttpError(404, '终端端点已关闭（W3_TERMINAL_ENABLED=false）；引擎其余路由不受影响')
          }
          checkTerminalToken(request, url)
          const marker = { 'x-terminal-auth': process.env['W3_TERMINAL_TOKEN'] !== undefined && process.env['W3_TERMINAL_TOKEN'] !== '' ? 'strict' : 'lenient-demo' }
          if (request.method === 'GET' && url.pathname.startsWith('/terminals/')) {
            const name = url.pathname.slice('/terminals/'.length)
            const contentType = TERMINAL_STATIC_FILES[name]
            if (contentType === undefined) throw new HttpError(404, `no terminal page ${url.pathname}`)
            const body = await readFile(fileURLToPath(new URL(`./w3-terminals/${name}`, import.meta.url)))
            response.writeHead(200, { 'content-type': contentType, ...marker })
            response.end(body)
            return
          }
          if (request.method === 'GET' && url.pathname === '/terminal/report') {
            const operator = await terminalOperator(io, url.searchParams.get('operator'), 'report')
            const mos = await io.list('mfg_orders', { doc_status: 'in_progress' })
            const operations = await io.list('mfg_order_operations')
            const posted = await io.list('mfg_job_reports', { status: 'posted' })
            const productName = new Map((await io.list('hub_inv_products')).map(row => [Number(row.id), String(row.name ?? row.title ?? row.code ?? `#${String(row.id)}`)]))
            const centerName = new Map((await io.list('mfg_work_centers')).map(row => [Number(row.id), String(row.name ?? `#${String(row.id)}`)]))
            const cards = mos.map(mo => {
              const moId = Number(mo.id)
              const ops = operations.filter(row => Number(row.order_id) === moId).sort((a, b) => Number(a.seq) - Number(b.seq))
              return {
                mo: { id: moId, code: String(mo.code), qty: Number(mo.qty), product: productName.get(Number(mo.product_id)) ?? `#${String(mo.product_id)}`, need_date: mo.need_date ?? null },
                operations: ops.map(op => {
                  const seq = Number(op.seq)
                  const reported = posted
                    .filter(row => Number(row.mo_id) === moId && Number(row.op_seq) === seq)
                    .reduce((sum, row) => sum + Number(row.qty_good ?? 0) + Number(row.qty_scrap ?? 0), 0)
                  return {
                    seq, name: String(op.name ?? ''), workcenter: centerName.get(Number(op.workcenter_id)) ?? `#${String(op.workcenter_id)}`,
                    planned_date: op.planned_date ?? null, planned_min: Number(op.planned_min ?? 0), status: String(op.status ?? 'planned'),
                    reported, remaining: Number(mo.qty) - reported,
                  }
                }),
              }
            })
            return writeJson(response, 200, { ok: true, operator, cards }, marker)
          }
          if (request.method === 'GET' && url.pathname === '/terminal/inspect') {
            const operator = await terminalOperator(io, url.searchParams.get('operator'), 'inspect')
            const productName = new Map((await io.list('hub_inv_products')).map(row => [Number(row.id), String(row.name ?? row.title ?? row.code ?? `#${String(row.id)}`)]))
            const supplierName = new Map((await io.list('srm_suppliers')).map(row => [Number(row.id), String(row.name ?? row.code ?? `#${String(row.id)}`)]))
            const cards = (await io.list('qm_inspections', { status: 'pending' })).map(row => ({
              id: Number(row.id), code: String(row.code), insp_type: String(row.insp_type ?? ''), ref_type: String(row.ref_type ?? ''), ref_no: String(row.ref_no ?? ''),
              product: productName.get(Number(row.product_id)) ?? `#${String(row.product_id)}`,
              supplier: row.supplier_id === null || row.supplier_id === undefined ? null : supplierName.get(Number(row.supplier_id)) ?? `#${String(row.supplier_id)}`,
              lot_no: String(row.lot_no ?? ''), lot_qty: Number(row.lot_qty ?? 0),
            }))
            return writeJson(response, 200, { ok: true, operator, cards }, marker)
          }
          if (request.method === 'GET' && url.pathname === '/terminal/receive') {
            const operator = await terminalOperator(io, url.searchParams.get('operator'), 'receive')
            const productName = new Map((await io.list('hub_inv_products')).map(row => [Number(row.id), String(row.name ?? row.title ?? row.code ?? `#${String(row.id)}`)]))
            const supplierName = new Map((await io.list('srm_suppliers')).map(row => [Number(row.id), String(row.name ?? row.code ?? `#${String(row.id)}`)]))
            const lines = await io.list('pur_order_lines')
            const cards = (await io.list('pur_orders', { doc_status: 'approved' }))
              .filter(po => String(po.receiving_status ?? 'none') !== 'received')
              .map(po => {
                const poLines = lines.filter(line => Number(line.order_id) === Number(po.id)).map(line => ({
                  product_id: Number(line.product_id), product: productName.get(Number(line.product_id)) ?? `#${String(line.product_id)}`,
                  qty: Number(line.qty), qty_received: Number(line.qty_received ?? 0),
                }))
                return {
                  po: { id: Number(po.id), code: String(po.code), supplier: supplierName.get(Number(po.supplier_id)) ?? `#${String(po.supplier_id)}`, expected_date: po.expected_date ?? null, receiving_status: String(po.receiving_status ?? 'none') },
                  lines: poLines, outstanding: poLines.filter(line => line.qty_received + 1e-9 < line.qty).length,
                }
              })
            return writeJson(response, 200, { ok: true, operator, cards }, marker)
          }
          if (request.method === 'POST' && url.pathname === '/report-job') {
            const body = await readBody(request)
            const operator = await terminalOperator(io, body['operator'], 'report')
            const moRow = await resolveOrderByCode(io, 'mfg_orders', body['mo_code'], Number(body['mo_id']), 'MO')
            if (String(moRow.doc_status) !== 'in_progress') {
              throw new Error(`报工被拒：MO ${String(moRow.code)} 状态为 ${String(moRow.doc_status)}——需已领料开工（in_progress）才能报工`)
            }
            const opSeq = Number(body['op_seq'])
            const operation = (await io.list('mfg_order_operations')).find(row => Number(row.order_id) === Number(moRow.id) && Number(row.seq) === opSeq)
            if (operation === undefined) throw new Error(`报工被拒：MO ${String(moRow.code)} 无工序 seq=${String(opSeq)}（先排产）`)
            const reportedSoFar = (await io.list('mfg_job_reports', { mo_id: Number(moRow.id), status: 'posted' }))
              .filter(row => Number(row.op_seq) === opSeq)
              .reduce((sum, row) => sum + Number(row.qty_good ?? 0) + Number(row.qty_scrap ?? 0), 0)
            const qtyGood = Number(body['qty_good'])
            const qtyPending = Number(body['qty_pending'])
            const qtyScrap = Number(body['qty_scrap'])
            const { planForCycle } = validateReportEquation(Number(moRow.qty), reportedSoFar, qtyGood, qtyPending, qtyScrap)
            const code = await nextDocCode(io, 'mfg_job_reports', 'JR')
            const durationMin = Number(body['duration_min'])
            await io.create('mfg_job_reports', {
              code, mo: { id: Number(moRow.id) }, op_seq: opSeq, report_date: today(),
              qty_good: qtyGood, qty_scrap: qtyScrap,
              duration_min: Number.isFinite(durationMin) && durationMin > 0 ? Math.round(durationMin) : 0,
              operator, qc_status: body['send_qc'] === true ? 'pending' : '',
              status: 'draft', remark: `W3-B6 报工终端；待求数 ${String(qtyPending)}（本循环未完成部分，下循环续报）`,
            })
            await postJobReport(wmsToken, code)
            const opNow = (await io.list('mfg_order_operations')).find(row => Number(row.order_id) === Number(moRow.id) && Number(row.seq) === opSeq)
            return writeJson(response, 200, { ok: true, code, mo_code: String(moRow.code), op_seq: opSeq, op_status: String(opNow?.status ?? ''), plan_for_cycle: planForCycle, pending_carried: qtyPending }, marker)
          }
          if (request.method === 'POST' && url.pathname === '/inspect-submit') {
            const body = await readBody(request)
            const operator = await terminalOperator(io, body['operator'], 'inspect')
            const code = typeof body['code'] === 'string' && body['code'] !== '' ? body['code'] : ''
            if (code === '') throw new Error('需要检验单号 code')
            const inspection = (await io.list('qm_inspections')).find(row => String(row.code) === code)
            if (inspection === undefined) throw new Error(`找不到检验单 ${code}`)
            if (String(inspection.result) !== 'pending') {
              throw new Error(`检验单 ${code} 已判定（result=${String(inspection.result)}；判定 single-shot，重判走再提交批流程）`)
            }
            const rawReadings = Array.isArray(body['readings']) ? body['readings'] as Array<Record<string, unknown>> : []
            if (rawReadings.length === 0) throw new Error('逐项打分被拒：至少一行检验读数')
            const readings = rawReadings.map(raw => ({
              parameter: String(raw['parameter'] ?? ''),
              spec_min: raw['spec_min'] === null || raw['spec_min'] === undefined || raw['spec_min'] === '' ? null : Number(raw['spec_min']),
              spec_max: raw['spec_max'] === null || raw['spec_max'] === undefined || raw['spec_max'] === '' ? null : Number(raw['spec_max']),
              criteria: raw['criteria'] === null || raw['criteria'] === undefined || raw['criteria'] === '' ? null : String(raw['criteria']),
              actual: raw['actual'] === null || raw['actual'] === undefined || raw['actual'] === '' ? null : Number(raw['actual']),
              pass: raw['pass'] === true ? true : raw['pass'] === false ? false : null,
              critical: raw['critical'] === true,
            } as TerminalReading))
            for (const row of readings) {
              if (row.parameter === '') throw new Error('检验行缺参数名（parameter）')
            }
            const { defects, judged } = defectsFromReadings(readings)
            // Readings persist first, the verdict second; a failed verdict
            // removes the rows it just wrote (库内无残留).
            const created: number[] = []
            try {
              for (const { row, pass } of judged) {
                const written = await io.create('qm_inspection_readings', {
                  inspection: { id: Number(inspection.id) }, parameter: row.parameter,
                  spec_min: row.spec_min, spec_max: row.spec_max, criteria: row.criteria, actual: row.actual, pass,
                })
                created.push(Number(written.id))
              }
              const aql = typeof body['aql'] === 'string' && body['aql'] !== '' ? body['aql'] : '2.5'
              const verdict = await inspectInspection(wmsToken, code, defects, operator, aql)
              return writeJson(response, 200, { ok: true, code, defects, readings_written: created.length, verdict }, marker)
            } catch (error) {
              for (const id of created) await io.destroy('qm_inspection_readings', id).catch(() => undefined)
              throw error
            }
          }
          if (request.method === 'POST' && url.pathname === '/receive-goods') {
            const body = await readBody(request)
            const operator = await terminalOperator(io, body['operator'], 'receive')
            const poRow = await resolveOrderByCode(io, 'pur_orders', typeof body['po_code'] === 'string' ? body['po_code'] : '', Number(body['po_id']), 'PO')
            // The PO-effectiveness gate (wfl_gate_configs: wms_receipts→pur_orders).
            await enforceGates(io, 'wms_receipts', { po_id: Number(poRow.id) })
            const poLines = (await io.list('pur_order_lines'))
              .filter(line => Number(line.order_id) === Number(poRow.id))
              .map(line => ({ product_id: Number(line.product_id), qty: Number(line.qty), qty_received: Number(line.qty_received ?? 0) }))
            const lines = (Array.isArray(body['lines']) ? body['lines'] as Array<Record<string, unknown>> : []).map(raw => ({
              product_id: Number(raw['product_id']), lot_no: String(raw['lot_no'] ?? ''), qty: Number(raw['qty']),
            }))
            validateReceiveLines(poLines, lines)
            const receipts: Array<{ receipt_no: string, product_id: number, lot_no: string, qty: number }> = []
            for (const line of lines) {
              const receiptNo = await nextDocCode(io, 'wms_receipts', 'RCV-TERM', 'receipt_no')
              await io.create('wms_receipts', {
                receipt_no: receiptNo, receipt_type: 'purchase',
                supplier: { id: Number(poRow.supplier_id) }, po: { id: Number(poRow.id) }, product: { id: line.product_id },
                lot_no: line.lot_no, qty: line.qty, status: 'pending', iqc_status: 'pending',
                note: `W3-B6 收货终端（${String(poRow.code)}；操作员 ${operator}）`,
              })
              await postReceipt(wmsToken, receiptNo)
              receipts.push({ receipt_no: receiptNo, product_id: line.product_id, lot_no: line.lot_no, qty: line.qty })
            }
            return writeJson(response, 200, { ok: true, po_code: String(poRow.code), receipts, quarantine_note: 'PO 来源收货已入待检区（lot 隔离 hold）——IQC 判定通过后放行转合格' }, marker)
          }
          throw new HttpError(404, `no terminal route ${request.method} ${url.pathname}`)
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
        writeJson(response, error instanceof HttpError ? error.status : 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    })()
  })
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  console.log(`approval-engine: serving on http://127.0.0.1:${port} (POST /act, POST /submit, POST /post-count-adjust, POST /scan-reorder, POST /calc-scorecard, POST /run-mrp, POST /calc-kpi, POST /run-nightly, POST /confirm-suggestion, GET /todos, GET /healthz)`)
  console.log(`approval-engine: W3-B6 terminals on :${String(port)} — GET /terminals/{report,inspect,receive}.html + terminal.css; GET /terminal/{report,inspect,receive}; POST /report-job, /inspect-submit, /receive-goods (enabled=${String((process.env['W3_TERMINAL_ENABLED'] ?? 'true') !== 'false')}, token=${String(process.env['W3_TERMINAL_TOKEN'] !== undefined && process.env['W3_TERMINAL_TOKEN'] !== '' ? 'strict' : 'lenient-demo（生产必须设 W3_TERMINAL_TOKEN）')})`)
  console.log(`approval-engine: W5-B0 designer on :${String(port)} — GET /designer (SPA) + GET /designer/meta + GET/POST /flow-graph → wfl_flow_configs.graph json（编辑态落库）+ POST /flow-graph/publish → 门禁+round-trip 等价断言+单向编译派生 wfl 行表（一条 data-modifying CTE，CAS 败则整条 no-op）；保存与发布同走 graph_version 原子 CAS——同刻并发恰好一胜一败(enabled=${String((process.env['W5_DESIGNER_ENABLED'] ?? 'true') !== 'false')})`)
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

  // W3-B5: department routing — {type:'department', value} expands to the
  // department's member usernames (质检部 = quality_lead + admin), the mixed
  // username+department entry unions both sides, unknown and member-less
  // departments fail loud before any todo lands, and a pure-username map
  // expands exactly as W2 did (缺省零漂移).
  {
    const qcDept = await io.create('departments', { title: '质检部' })
    await io.create('departments', { title: '储备人才池' })
    const qcUsers = (await io.list('users', {})).filter(row => row.username === 'quality_lead' || row.username === 'admin')
    for (const user of qcUsers) {
      await io.create('departmentsUsers', { departmentId: qcDept.id, userId: user.id })
    }
    expect('部门成员数', qcUsers.length, 2)
    await seedDocFlow(io, 'test_dept_flow', '部门路由流', {
      approverMap: { manager: { type: 'department', value: '质检部' }, gm: 'admin' },
    })
    const deptDoc = await io.create('test_dept_flow', { code: 'NC-W3B5-1', doc_status: 'draft' })
    await submitForApproval(io, 'test_dept_flow', Number(deptDoc.id), '陈立群')
    const deptTodos = (await io.list('wfl_approval_todos', { doc_id: Number(deptDoc.id), status: 'open' }))
      .map(row => String(row.user)).sort()
    expect('部门展开全员待办', deptTodos, ['admin', 'quality_lead'])
    result = await act(io, 'test_dept_flow', Number(deptDoc.id), 'approve', 'quality_lead', '质检部任一人可审')
    expect('部门路由一审生效', result.to_state, 'approved')
    const deptTodosAfter = await io.list('wfl_approval_todos', { doc_id: Number(deptDoc.id) })
    expect('部门路由任一人 act 全档作废', deptTodosAfter.every(row => row.status === 'completed'), true)
    // Mixed entry: a username beside the department form unions both sides.
    await seedDocFlow(io, 'test_mixed_flow', '混合路由流', {
      approverMap: { manager: ['quality_lead', { type: 'department', value: '质检部' }], gm: 'admin' },
    })
    const mixedDoc = await io.create('test_mixed_flow', { code: 'NC-W3B5-2', doc_status: 'draft' })
    await submitForApproval(io, 'test_mixed_flow', Number(mixedDoc.id), '陈立群')
    const mixedTodos = (await io.list('wfl_approval_todos', { doc_id: Number(mixedDoc.id), status: 'open' }))
      .map(row => String(row.user)).sort()
    expect('混合条目并集去重', mixedTodos, ['admin', 'quality_lead'])
    await act(io, 'test_mixed_flow', Number(mixedDoc.id), 'approve', 'admin', '混合档清尾')
    // Negative: an unknown department fails loud at submit, zero todos, doc stays draft.
    await seedDocFlow(io, 'test_ghost_dept_flow', '幽灵部门流', {
      approverMap: { manager: { type: 'department', value: '幽灵部' }, gm: 'admin' },
    })
    const ghostDeptDoc = await io.create('test_ghost_dept_flow', { code: 'NC-GHOST-1', doc_status: 'draft' })
    const ghostDept = await failureOf(() => submitForApproval(io, 'test_ghost_dept_flow', Number(ghostDeptDoc.id), '陈立群'))
    if (!ghostDept.includes('不存在的部门')) throw new Error(`selftest 失败：幽灵部门未拦截（${ghostDept}）`)
    expect('幽灵部门零待办', (await io.list('wfl_approval_todos', { doc_id: Number(ghostDeptDoc.id) })).length, 0)
    // The state write precedes todo expansion (the W2 ghost-user semantics);
    // the refusal lands as pending-with-zero-todos, not a reverted draft.
    expect('幽灵部门单据停提交态', (await io.get('test_ghost_dept_flow', Number(ghostDeptDoc.id)))?.doc_status, 'pending')
    // Negative: a member-less department fails loud (储备人才池 has no departmentsUsers rows).
    await seedDocFlow(io, 'test_empty_dept_flow', '空部门流', {
      approverMap: { manager: { type: 'department', value: '储备人才池' }, gm: 'admin' },
    })
    const emptyDeptDoc = await io.create('test_empty_dept_flow', { code: 'NC-EMPTY-1', doc_status: 'draft' })
    const emptyDept = await failureOf(() => submitForApproval(io, 'test_empty_dept_flow', Number(emptyDeptDoc.id), '陈立群'))
    if (!emptyDept.includes('没有成员')) throw new Error(`selftest 失败：空部门未拦截（${emptyDept}）`)
    expect('空部门零待办', (await io.list('wfl_approval_todos', { doc_id: Number(emptyDeptDoc.id) })).length, 0)
    // Negative: a malformed department object (no value) fails loud at submit.
    await seedDocFlow(io, 'test_bad_dept_flow', '坏部门流', {
      approverMap: { manager: [{ type: 'department' }], gm: 'admin' } as unknown as ApproverMap,
    })
    const badDeptDoc = await io.create('test_bad_dept_flow', { code: 'NC-BAD-1', doc_status: 'draft' })
    const badDept = await failureOf(() => submitForApproval(io, 'test_bad_dept_flow', Number(badDeptDoc.id), '陈立群'))
    if (!badDept.includes('值非法')) throw new Error(`selftest 失败：坏部门形态未拦截（${badDept}）`)
    // 缺省零漂移: a pure-username array map expands to exactly the W2 shape —
    // the same rows, the same order-insensitive set, the same one-row-per-user.
    await seedDocFlow(io, 'test_pure_flow', '纯用户名流', {
      approverMap: { manager: ['admin', 'quality_lead'], gm: 'admin' },
    })
    const pureDoc = await io.create('test_pure_flow', { code: 'PO-PURE-1', amount: 1, doc_status: 'draft' })
    await submitForApproval(io, 'test_pure_flow', Number(pureDoc.id), '陈立群')
    const pureTodos = (await io.list('wfl_approval_todos', { doc_id: Number(pureDoc.id), status: 'open' }))
      .map(row => String(row.user)).sort()
    expect('纯用户名零漂移', pureTodos, ['admin', 'quality_lead'])
    expect('纯用户名逐人一行', (await io.list('wfl_approval_todos', { doc_id: Number(pureDoc.id), status: 'open' })).length, 2)
    await act(io, 'test_pure_flow', Number(pureDoc.id), 'approve', 'admin', '纯用户名路径清尾')
  }

  // W2-R1: the nightly env contract stays fail-loud — the three malformed
  // shapes the deployment doc names, plus the all-absent defaults.
  {
    const rejects: ReadonlyArray<[Record<string, string | undefined>, string]> = [
      [{ W1_NIGHTLY_AT: '25:99' }, 'W1_NIGHTLY_AT'],
      [{ W1_NIGHTLY_ENABLED: 'abc' }, 'W1_NIGHTLY_ENABLED'],
      [{ W1_NIGHTLY_TZ: 'Mars/Olympus' }, 'W1_NIGHTLY_TZ'],
    ]
    for (const [env, key] of rejects) {
      try {
        parseNightlyEnv(env)
        throw new Error(`parseNightlyEnv 负例 ${key} 未被拒绝`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes(key)) throw new Error(`selftest 失败：负例 ${key} 报错错位（${message}）`)
      }
    }
    expect('parseNightlyEnv 默认全关', parseNightlyEnv({}), { enabled: false, at: '02:30', tz: 'Asia/Shanghai' })
  }

  // W3-B6: the operator-terminal validation layer (pure functions the
  // endpoints call — equation clamp, reading judgement, receive clamps).
  {
    // The report equation: 完成 + 待求 + 损失 = 本循环计划数.
    expect('三数等式正例', validateReportEquation(1_000, 400, 400, 150, 50), { planForCycle: 600 })
    const equationReject = await failureOf(() => validateReportEquation(1_000, 400, 400, 100, 50))
    if (!equationReject.includes('三数等式被拒')) throw new Error(`selftest 失败：等式不闭合未拦截（${equationReject}）`)
    const negativeReject = await failureOf(() => validateReportEquation(1_000, 400, -1, 601, 0))
    if (!negativeReject.includes('不小于 0')) throw new Error(`selftest 失败：负数量未拦截（${negativeReject}）`)
    const exhaustedReject = await failureOf(() => validateReportEquation(1_000, 1_000, 0, 0, 0))
    if (!exhaustedReject.includes('已报满')) throw new Error(`selftest 失败：报满后继续报未拦截（${exhaustedReject}）`)

    // Reading judgement: numeric rows auto-judge against [min, max].
    expect('数值行区间内', judgeReading({ parameter: '水分(%)', spec_min: 0, spec_max: 5, actual: 3.2 }), true)
    expect('数值行超上限', judgeReading({ parameter: '水分(%)', spec_min: 0, spec_max: 5, actual: 5.1 }), false)
    expect('数值行低于下限', judgeReading({ parameter: '重量(g)', spec_min: 95, spec_max: null, actual: 90 }), false)
    expect('非数值行人工判定', judgeReading({ parameter: '外观', criteria: '无破损', pass: false }), false)
    const missingActual = await failureOf(() => judgeReading({ parameter: '水分(%)', spec_min: 0, spec_max: 5 }))
    if (!missingActual.includes('缺实测读数')) throw new Error(`selftest 失败：数值行缺读数未拦截（${missingActual}）`)
    const missingVerdict = await failureOf(() => judgeReading({ parameter: '外观', criteria: '无破损' }))
    if (!missingVerdict.includes('大按钮')) throw new Error(`selftest 失败：非数值行缺判定未拦截（${missingVerdict}）`)

    // Defect folding: one over-limit row flagged critical + one judged fail → critical 1 / major 1.
    const folded = defectsFromReadings([
      { parameter: '菌落总数', spec_min: 0, spec_max: 1000, actual: 2400, critical: true },
      { parameter: '外观', criteria: '无破损', pass: false },
      { parameter: '水分(%)', spec_min: 0, spec_max: 5, actual: 4.1 },
    ])
    expect('缺陷汇总（严重1+主要1+次要0）', folded.defects, { critical: 1, major: 1, minor: 0 })
    expect('行级判定序列', folded.judged.map(entry => entry.pass), [false, false, true])

    // Receive clamps: wrong product, over-receipt, blank lot, zero qty.
    const poLines = [
      { product_id: 11, qty: 800, qty_received: 500 },
      { product_id: 12, qty: 200, qty_received: 0 },
    ]
    validateReceiveLines(poLines, [{ product_id: 11, lot_no: 'L-1', qty: 300 }])
    const wrongProduct = await failureOf(() => validateReceiveLines(poLines, [{ product_id: 99, lot_no: 'L-9', qty: 1 }]))
    if (!wrongProduct.includes('不在本 PO')) throw new Error(`selftest 失败：错品收货未拦截（${wrongProduct}）`)
    const overReceive = await failureOf(() => validateReceiveLines(poLines, [{ product_id: 11, lot_no: 'L-1', qty: 301 }]))
    if (!overReceive.includes('超收被拒')) throw new Error(`selftest 失败：超收未拦截（${overReceive}）`)
    const blankLot = await failureOf(() => validateReceiveLines(poLines, [{ product_id: 12, lot_no: ' ', qty: 10 }]))
    if (!blankLot.includes('缺批次号')) throw new Error(`selftest 失败：空批次未拦截（${blankLot}）`)
    const zeroQty = await failureOf(() => validateReceiveLines(poLines, [{ product_id: 12, lot_no: 'L-2', qty: 0 }]))
    if (!zeroQty.includes('大于 0')) throw new Error(`selftest 失败：零数量未拦截（${zeroQty}）`)
  }
  await compilerSelftest()
  console.log('approval-engine: selftest OK — 状态机全序列/金额阈值加签/驳回重提/非法转移/卡口/幂等/锁编辑/供应商准入流/准入卡口/B5阈值配置+多审批人/W3-B5部门路由(全员展开/混合并集/幽灵部门/空部门/坏形态/纯用户名零漂移)/夜间env负例/W3-B6终端校验(三数等式/读数判定/缺陷汇总/收货卡口)/W5-B1编译器(门禁矩阵/两级阈值/角色快照/round-trip等价/准入词汇表) 全部通过')
}

// ─── W5-B1: the publish-compiler assertion matrix (pure; shared with w5b1-publish.mts --selftest) ───

/** One node fixture for the compiler matrix. */
interface FixtureNode {
  readonly id: string
  readonly type: string
  readonly title?: string
  readonly approval?: Record<string, unknown>
  readonly condition?: Record<string, unknown>
  readonly cc?: Record<string, unknown>
}

/** Build one graph document from nodes and (source, target) pairs on a fixed grid. */
function fixtureGraph(nodes: ReadonlyArray<FixtureNode>, edges: ReadonlyArray<readonly [string, string]>): Record<string, unknown> {
  return {
    version: 1,
    nodes: nodes.map((node, index) => ({
      id: node.id,
      type: node.type,
      position: { x: 40 + index * 200, y: 160 },
      data: {
        title: node.title ?? node.id,
        ...(node.approval === undefined ? {} : { approval: node.approval }),
        ...(node.condition === undefined ? {} : { condition: node.condition }),
        ...(node.cc === undefined ? {} : { cc: node.cc }),
      },
    })),
    edges: edges.map(([source, target], index) => ({ id: `e${String(index)}`, source, target })),
  }
}

/** The compile-context fixture: three known users, one resolvable role. */
function fixtureCompileContext(overrides: Partial<CompileContext> = {}): CompileContext {
  return {
    stateField: 'doc_status',
    formFields: ['total', 'amount', 'qty'],
    preserveExtras: { approved_by_field: 'approved_by', approved_at_field: 'approved_at' },
    knownUsernames: new Set(['admin', 'quality_lead', 'chenliqun']),
    usersOfRole: async (role) => role === 'finance' ? ['admin', 'quality_lead'] : [],
    ...overrides,
  }
}

/**
 * The W5-B1 compiler matrix: gate negatives (each illegal construction
 * refused with its readable family), compile positives (one-round,
 * two-round threshold, structural two-level, role snapshot, empty-policy),
 * and the rowsToGraph → compile round-trip over both vocabularies.
 */
export async function compilerSelftest(): Promise<void> {
  const user = (assignees: string[]): Record<string, unknown> => ({ assigneeType: 'user', assignees, mode: 'or', emptyPolicy: 'transferAdmin' })
  const role = (roles: string[], emptyPolicy = 'autoReject'): Record<string, unknown> => ({ assigneeType: 'role', assignees: roles, mode: 'or', emptyPolicy })
  const rows = (...pairs: ReadonlyArray<readonly [string, string]>): ReadonlyArray<readonly [string, string]> => pairs
  const compileErrors = async (graph: Record<string, unknown>, ctx: CompileContext = fixtureCompileContext()): Promise<string[]> => {
    const outcome = await compileGraphToRows(graph, ctx)
    return outcome.ok ? [] : outcome.errors
  }
  const expectRefused = async (that: string, graph: Record<string, unknown>, marker: string, ctx?: CompileContext): Promise<void> => {
    const errors = await compileErrors(graph, ctx)
    if (!errors.some(error => error.includes(marker))) {
      throw new Error(`selftest 失败：${that} 未拦截或报错错位（期望含「${marker}」，实际 ${JSON.stringify(errors)}）`)
    }
  }
  const expectRows = async (that: string, graph: Record<string, unknown>, ctx: CompileContext): Promise<CompiledRows> => {
    const outcome = await compileGraphToRows(graph, ctx)
    if (!outcome.ok) throw new Error(`selftest 失败：${that} 正例被拒（${JSON.stringify(outcome.errors)}）`)
    return outcome.rows
  }

  // ── gate negatives (every illegal family fails loud with a readable message) ──
  await expectRefused('孤立节点', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: user(['admin']) }, { id: 'e', type: 'end' }, { id: 'loose', type: 'cc', cc: { assignees: ['admin'] } },
  ], rows(['s', 'a'], ['a', 'e'])), '孤立节点')
  await expectRefused('缺开始节点', fixtureGraph([
    { id: 'a', type: 'approval', approval: user(['admin']) }, { id: 'e', type: 'end' },
  ], rows(['a', 'e'])), '缺开始节点')
  await expectRefused('多个开始节点', fixtureGraph([
    { id: 's1', type: 'start' }, { id: 's2', type: 'start' }, { id: 'a', type: 'approval', approval: user(['admin']) }, { id: 'e', type: 'end' },
  ], rows(['s1', 'a'], ['a', 'e'], ['s2', 'e'])), '开始节点')
  await expectRefused('缺结束节点', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: user(['admin']) },
  ], rows(['s', 'a'])), '缺结束节点')
  await expectRefused('环', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a1', type: 'approval', approval: user(['admin']) }, { id: 'a2', type: 'approval', approval: user(['quality_lead']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a1'], ['a1', 'a2'], ['a2', 'a1'], ['a2', 'e'])), '存在环')
  await expectRefused('不可达节点', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: user(['admin']) }, { id: 'e1', type: 'end' }, { id: 'a2', type: 'approval', approval: user(['quality_lead']) }, { id: 'e2', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e1'], ['a2', 'e2'])), '不可达节点')
  await expectRefused('条件缺行', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a1', type: 'approval', approval: user(['admin']) }, { id: 'c', type: 'condition', condition: { join: 'and', rows: [] } }, { id: 'a2', type: 'approval', approval: user(['quality_lead']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a1'], ['a1', 'c'], ['c', 'a2'], ['c', 'e'], ['a2', 'e'])), '缺条件行')
  await expectRefused('条件操作符 <=', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a1', type: 'approval', approval: user(['admin']) }, { id: 'c', type: 'condition', condition: { join: 'and', rows: [{ field: 'total', op: '<=', value: '100000' }] } }, { id: 'a2', type: 'approval', approval: user(['quality_lead']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a1'], ['a1', 'c'], ['c', 'a2'], ['c', 'e'], ['a2', 'e'])), '操作符需为 >')
  await expectRefused('条件字段不在词表', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a1', type: 'approval', approval: user(['admin']) }, { id: 'c', type: 'condition', condition: { join: 'and', rows: [{ field: 'price', op: '>', value: '100000' }] } }, { id: 'a2', type: 'approval', approval: user(['quality_lead']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a1'], ['a1', 'c'], ['c', 'a2'], ['c', 'e'], ['a2', 'e'])), '不在单据字段词表')
  await expectRefused('supervisorChain', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: { assigneeType: 'supervisorChain', assignees: [], mode: 'or', emptyPolicy: 'transferAdmin' } }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), '连续多级主管')
  await expectRefused('formField', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: { assigneeType: 'formField', assignees: ['owner'], mode: 'or', emptyPolicy: 'transferAdmin' } }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), '表单联系人字段')
  await expectRefused('deptLeader', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: { assigneeType: 'deptLeader', assignees: ['质检部'], mode: 'or', emptyPolicy: 'transferAdmin' } }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), '部门主管')
  await expectRefused('依次审批', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: { assigneeType: 'user', assignees: ['admin', 'quality_lead'], mode: 'sequential', emptyPolicy: 'transferAdmin' } }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), '依次审批')
  await expectRefused('会签', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: { assigneeType: 'user', assignees: ['admin', 'quality_lead'], mode: 'countersign', emptyPolicy: 'transferAdmin' } }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), '会签')
  await expectRefused('autoPass', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: { assigneeType: 'user', assignees: ['admin'], mode: 'or', emptyPolicy: 'autoPass' } }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), '自动通过')
  await expectRefused('assignUser', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: { assigneeType: 'user', assignees: ['admin'], mode: 'or', emptyPolicy: 'assignUser' } }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), '指定人员')
  await expectRefused('三级审批', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a1', type: 'approval', approval: user(['admin']) }, { id: 'a2', type: 'approval', approval: user(['quality_lead']) }, { id: 'a3', type: 'approval', approval: user(['chenliqun']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'e'])), '至多支持两级审批')
  await expectRefused('条件分支无审批承接', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a1', type: 'approval', approval: user(['admin']) }, { id: 'c', type: 'condition', condition: { join: 'and', rows: [{ field: 'total', op: '>', value: '100000' }] } }, { id: 'e1', type: 'end' }, { id: 'e2', type: 'end' },
  ], rows(['s', 'a1'], ['a1', 'c'], ['c', 'e1'], ['c', 'e2'])), '两条分支需分别指向二级审批节点和结束节点')
  await expectRefused('条件先于审批', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: user(['admin']) }, { id: 'c', type: 'condition', condition: { join: 'and', rows: [{ field: 'total', op: '>', value: '100000' }] } }, { id: 'e', type: 'end' },
  ], rows(['s', 'c'], ['c', 'a'], ['c', 'e'], ['a', 'e'])), '一级审批与二级审批之间')
  await expectRefused('未知状态字段', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: user(['admin']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), '未知状态字段', fixtureCompileContext({ stateField: 'moon_phase' }))
  await expectRefused('准入词汇表带条件', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a1', type: 'approval', approval: user(['admin']) }, { id: 'c', type: 'condition', condition: { join: 'and', rows: [{ field: 'total', op: '>', value: '100000' }] } }, { id: 'a2', type: 'approval', approval: user(['quality_lead']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a1'], ['a1', 'c'], ['c', 'a2'], ['c', 'e'], ['a2', 'e'])), '准入词汇表', fixtureCompileContext({ stateField: SUPPLIER_ADMISSION_STATE_FIELD }))
  await expectRefused('幽灵用户', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: user(['ghost_user']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), '不存在的用户')
  await expectRefused('空角色autoReject', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: role(['ghost_role']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), '没有任何成员')

  // ── compile positives ──
  const oneRound = await expectRows('一审直批', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: user(['admin']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), fixtureCompileContext())
  expect('一审派生6状态', oneRound.states.length, 6)
  expect('一审派生8转移', oneRound.transitions.length, 8)
  expect('一审直批条件为空', oneRound.transitions.find(row => row.state === 'pending' && row.action === 'approve' && row.next_state === 'approved')?.condition_expr, '')
  expect('一审审批人映射', oneRound.approverMap, { manager: 'admin' })
  expect('一审extras不含金额键', 'amount_field' in oneRound.extras, false)

  const twoRound = await expectRows('两级阈值', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a1', type: 'approval', approval: user(['admin']) }, { id: 'c', type: 'condition', condition: { join: 'and', rows: [{ field: 'total', op: '>', value: '100000' }] } }, { id: 'a2', type: 'approval', approval: user(['quality_lead']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a1'], ['a1', 'c'], ['c', 'a2'], ['c', 'e'], ['a2', 'e'])), fixtureCompileContext())
  expect('两级≤字面量', twoRound.transitions.find(row => row.state === 'pending' && row.action === 'approve' && row.next_state === 'approved')?.condition_expr, 'total <= 100000')
  expect('两级路由进阶条件为空', twoRound.transitions.find(row => row.state === 'pending' && row.action === 'approve' && row.next_state === 'pending_level2')?.condition_expr, '')
  expect('两级审批人映射', twoRound.approverMap, { manager: 'admin', gm: 'quality_lead' })
  expect('两级extras金额键', { amount_field: twoRound.extras.amount_field, amount_threshold: twoRound.extras.amount_threshold }, { amount_field: 'total', amount_threshold: 100000 })
  expect('两级extras保留引擎键', twoRound.extras.approved_by_field, 'approved_by')

  const structural = await expectRows('结构两级无条件', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a1', type: 'approval', approval: user(['admin']) }, { id: 'a2', type: 'approval', approval: user(['quality_lead']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a1'], ['a1', 'a2'], ['a2', 'e'])), fixtureCompileContext({ preserveExtras: { approved_by_field: 'approved_by', approved_at_field: 'approved_at', amount_field: 'amount', amount_threshold: 200000, invoice_match_tolerance: 0.1 } }))
  expect('结构两级直批条件为空', structural.transitions.find(row => row.state === 'pending' && row.action === 'approve' && row.next_state === 'approved')?.condition_expr, '')
  expect('结构两级删除金额字段键', structural.extras.amount_field, undefined)
  expect('结构两级删除阈值键', structural.extras.amount_threshold, undefined)
  expect('结构两级保留容差键', structural.extras.invoice_match_tolerance, 0.1)

  const roleSnapshot = await expectRows('角色快照', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: role(['finance']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), fixtureCompileContext())
  expect('角色快照展开', roleSnapshot.approverMap, { manager: ['admin', 'quality_lead'] })

  const transferAdmin = await expectRows('空角色转管理员', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: role(['ghost_role'], 'transferAdmin') }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), fixtureCompileContext())
  expect('空角色转管理员', transferAdmin.approverMap, { manager: 'admin' })

  const ccPass = await expectRows('抄送透传', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: user(['admin']) }, { id: 'ncc', type: 'cc', cc: { assignees: ['quality_lead'] } }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'ncc'], ['ncc', 'e'])), fixtureCompileContext())
  expect('抄送计数', ccPass.ccCount, 1)
  expect('抄送不影响转移数', ccPass.transitions.length, 8)

  const admission = await expectRows('准入词汇表', fixtureGraph([
    { id: 's', type: 'start' }, { id: 'a', type: 'approval', approval: user(['admin']) }, { id: 'e', type: 'end' },
  ], rows(['s', 'a'], ['a', 'e'])), fixtureCompileContext({ stateField: SUPPLIER_ADMISSION_STATE_FIELD, preserveExtras: { approved_at_field: 'admitted_at' } }))
  expect('准入派生4状态', admission.states.length, 4)
  expect('准入派生4转移', admission.transitions.length, 4)
  expect('准入审批人映射', admission.approverMap, { srm_manager: 'admin' })
  expect('准入extras保留', admission.extras, { approved_at_field: 'admitted_at' })

  // ── rowsToGraph → compile round-trip over both vocabularies ──
  const liveDocRows: LiveFlowRows = {
    stateField: 'doc_status',
    approverMap: { manager: ['admin', 'quality_lead'], gm: 'admin' },
    extras: { approved_by_field: 'approved_by', approved_at_field: 'approved_at', amount_field: 'amount', amount_threshold: 200000, invoice_match_tolerance: 0.1 },
    states: docStateRows().map(row => ({ ...row })),
    transitions: docTransitionRows('amount', 200000).map(row => ({ ...row })),
  }
  const importedDoc = rowsToGraph(liveDocRows)
  if (!importedDoc.ok) throw new Error(`selftest 失败：六态行表逆向导入被拒（${JSON.stringify(importedDoc.errors)}）`)
  const recompiledDoc = await compileGraphToRows(importedDoc.graph, fixtureCompileContext({ preserveExtras: liveDocRows.extras }))
  if (!recompiledDoc.ok) throw new Error(`selftest 失败：六态 round-trip 重编译被拒（${JSON.stringify(recompiledDoc.errors)}）`)
  const docDrift = assertRowsEquivalent(liveDocRows, recompiledDoc.rows)
  if (docDrift.length > 0) throw new Error(`selftest 失败：六态 round-trip 不等价（${docDrift.join('；')}）`)
  // Threshold drift must be caught: a literal out of step with extras refuses.
  const driftedRows: LiveFlowRows = {
    ...liveDocRows,
    transitions: liveDocRows.transitions.map(row => row.state === 'pending' && row.action === 'approve' && row.next_state === 'approved' ? { ...row, condition_expr: 'amount <= 250000' } : row),
  }
  const driftedImport = rowsToGraph(driftedRows)
  if (!driftedImport.ok) throw new Error('selftest 失败：漂移行表逆向导入被拒（不应发生）')
  const driftedRecompile = await compileGraphToRows(driftedImport.graph, fixtureCompileContext({ preserveExtras: driftedRows.extras }))
  if (driftedRecompile.ok && assertRowsEquivalent(driftedRows, driftedRecompile.rows).length === 0) {
    throw new Error('selftest 失败：阈值漂移未被 round-trip 断言捕获')
  }
  // The pur_rfqs live shape: two approvals, no literal, no amount keys.
  const structuralLive: LiveFlowRows = {
    stateField: 'doc_status',
    approverMap: { manager: 'admin', gm: 'admin' },
    extras: { approved_by_field: 'approved_by', approved_at_field: 'approved_at' },
    states: docStateRows().map(row => ({ ...row })),
    transitions: docTransitionRows(null, null).map(row => ({ ...row })),
  }
  const structuralImport = rowsToGraph(structuralLive)
  if (!structuralImport.ok) throw new Error(`selftest 失败：结构两级逆向导入被拒（${JSON.stringify(structuralImport.errors)}）`)
  const structuralRecompile = await compileGraphToRows(structuralImport.graph, fixtureCompileContext({ preserveExtras: structuralLive.extras }))
  if (!structuralRecompile.ok) throw new Error('selftest 失败：结构两级 round-trip 重编译被拒')
  const structuralDrift = assertRowsEquivalent(structuralLive, structuralRecompile.rows)
  if (structuralDrift.length > 0) throw new Error(`selftest 失败：结构两级 round-trip 不等价（${structuralDrift.join('；')}）`)
  const admissionLive: LiveFlowRows = {
    stateField: SUPPLIER_ADMISSION_STATE_FIELD,
    approverMap: { srm_manager: 'admin' },
    extras: { approved_at_field: 'admitted_at' },
    states: admissionStateRows().map(row => ({ ...row })),
    transitions: admissionTransitionRows().map(row => ({ ...row })),
  }
  const admissionImport = rowsToGraph(admissionLive)
  if (!admissionImport.ok) throw new Error(`selftest 失败：准入行表逆向导入被拒（${JSON.stringify(admissionImport.errors)}）`)
  const admissionRecompile = await compileGraphToRows(admissionImport.graph, fixtureCompileContext({ stateField: SUPPLIER_ADMISSION_STATE_FIELD, preserveExtras: admissionLive.extras }))
  if (!admissionRecompile.ok) throw new Error('selftest 失败：准入 round-trip 重编译被拒')
  const admissionDrift = assertRowsEquivalent(admissionLive, admissionRecompile.rows)
  if (admissionDrift.length > 0) throw new Error(`selftest 失败：准入 round-trip 不等价（${admissionDrift.join('；')}）`)
  console.log('approval-engine: compiler selftest OK — 门禁矩阵（孤立/缺端点/多开始/环/不可达/条件DSL/词表/特性矩阵/幽灵用户/空角色）+ 编译正例（一审/两级阈值/结构两级/角色快照/转管理员/抄送透传/准入）+ round-trip（六态阈值/阈值漂移捕获/结构两级/准入）')
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
