/**
 * The shared approval-engine rules: the workflow-state vocabulary, the
 * doc_status anchor mapping, the transition table with the amount-threshold
 * routing, and the gate refusal message. This module is the single code
 * source of truth both approval entry points compile against — the script
 * engine (`examples/kb-agent/scripts/approval-engine.mts`, the NocoBase
 * workflow request callback) and the `nb_approve` tool — so the two entry
 * points cannot drift apart. The `wfl_*` collection seeds
 * (nocobase-w1-approval.mts) are generated from these same constants.
 * Pure data and functions; no network, no React.
 * @module @deepseek-ai/dsh-tool-nocobase/approval-rules
 */

/** One workflow state of the general approval engine (stored on the document's doc_status column). */
export type WorkflowState = 'draft' | 'pending' | 'pending_level2' | 'approved' | 'rejected' | 'void'

/** One approval action (what the actor performs, never a state name). */
export type ApprovalAction = 'submit' | 'approve' | 'reject' | 'void' | 'resubmit'

/** Every workflow state in engine order (seed order for wfl_flow_states). */
export const WORKFLOW_STATES: readonly WorkflowState[] = ['draft', 'pending', 'pending_level2', 'approved', 'rejected', 'void']

/**
 * The ERPNext doc_status anchor per state: 0 = saved/draft-side (not
 * effective), 1 = submitted (effective — the only state that may drive
 * downstream documents), 2 = cancelled. The pilot's doc_status column stores
 * the state string; the anchor is this mapping (recorded on every
 * wfl_approval_records row as from_anchor/to_anchor).
 */
export const DOC_STATUS_ANCHORS: Readonly<Record<WorkflowState, 0 | 1 | 2>> = {
  draft: 0,
  pending: 0,
  pending_level2: 0,
  approved: 1,
  rejected: 0,
  void: 2,
}

/** The only state that may drive downstream document creation. */
export const EFFECTIVE_STATE: WorkflowState = 'approved'

/**
 * The default amount threshold for the two-level approval route (Odoo
 * po_double_validation semantics): at or below it one approval lands the
 * document; above it the first approval routes to pending_level2 and a
 * second approval is required. Per-flow overrides ride the flow config's
 * extras (`amount_threshold`); this constant is the fallback when the
 * extras carry no key (the W-round pilot behavior).
 */
export const DEFAULT_AMOUNT_THRESHOLD = 100_000

/**
 * The shape of a flow config's extras column both threshold-bearing reads
 * accept: an open JSON object (the engine writes more keys than any reader
 * consumes) whose `amount_threshold` names the routing override.
 */
export interface ThresholdExtras {
  readonly [key: string]: unknown
  /** The two-level routing threshold override (a positive finite number). */
  readonly amount_threshold?: unknown
}

/**
 * Resolve one role's approver list from a flow config's approver_map: the
 * value may be one username or an array of usernames — an array means any
 * one of them may act (OR-sign-off; counter-sign belongs to the enterprise
 * edition). A missing, empty, or non-username value fails loud.
 * @param map - the flow config's parsed approver_map (or null/undefined when the column is empty).
 * @param role - the transition's allowed_role the todo expansion reads.
 * @returns the role's approver usernames, map order.
 */
export function approversOfRole(map: Readonly<Record<string, unknown>> | null | undefined, role: string): readonly string[] {
  const raw = map?.[role]
  if (raw === undefined || raw === null || raw === '') {
    throw new Error(`审批流角色 ${role} 未配置审批人（approver_map）`)
  }
  const users = Array.isArray(raw) ? raw : [raw]
  if (users.length === 0 || users.some(user => typeof user !== 'string' || user.trim() === '')) {
    throw new Error(`审批流角色 ${role} 的 approver_map 值非法：${JSON.stringify(raw)}（应为用户名或用户名数组）`)
  }
  return users as readonly string[]
}

/**
 * Resolve one flow's two-level approval threshold from its extras: a present
 * `amount_threshold` must be a positive finite number (a malformed value — a
 * string like `"abc"`, zero, negative, NaN — fails loud as misconfiguration);
 * a missing key or null extras falls back to {@link DEFAULT_AMOUNT_THRESHOLD}.
 * @param extras - the flow config's parsed extras JSON (or null/undefined when the column is empty).
 * @returns the flow's amount threshold.
 */
export function thresholdOf(extras: ThresholdExtras | null | undefined): number {
  if (extras === null || extras === undefined) return DEFAULT_AMOUNT_THRESHOLD
  const raw = extras.amount_threshold
  if (raw === undefined || raw === null) return DEFAULT_AMOUNT_THRESHOLD
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    throw new Error(`审批流 extras.amount_threshold 非法：${JSON.stringify(raw)}（应为正数；删除该键回退缺省 ${String(DEFAULT_AMOUNT_THRESHOLD)}）`)
  }
  return raw
}

/** The document column the threshold condition reads (the pilot amount field). */
export const AMOUNT_FIELD = 'total'

/** Chinese labels for the workflow states (receipts, errors, and todo cards). */
export const STATE_LABELS: Readonly<Record<WorkflowState, string>> = {
  draft: '草稿',
  pending: '待审批',
  pending_level2: '二级审批中',
  approved: '已生效',
  rejected: '已驳回',
  void: '已作废',
}

/** Chinese labels for the approval actions. */
export const ACTION_LABELS: Readonly<Record<ApprovalAction, string>> = {
  submit: '提交审批',
  approve: '同意',
  reject: '驳回',
  void: '作废',
  resubmit: '重新提交',
}

/**
 * The states under which the document is locked for direct edits
 * (nb_update refuses): pending* per「审批中不可改单」, approved/void per the
 * ERPNext submitted/cancelled anchor (Odoo po_lock). Draft and rejected stay
 * editable — rejected exists so the submitter can revise and resubmit.
 */
export const EDIT_LOCKED_STATES: readonly WorkflowState[] = ['pending', 'pending_level2', 'approved', 'void']

/**
 * Resolve the next state for one transition.
 * @param state - the document's current workflow state.
 * @param action - the actor's action.
 * @param amount - the document's amount for threshold routing (approve only);
 * `undefined` means the document type carries no amount column (purchase
 * requests, RFQs) — an amount that is not present cannot exceed the
 * threshold, so the approval lands in one round.
 * @param threshold - the flow's two-level routing threshold (from
 * `thresholdOf(flow.extras)`); omitted = {@link DEFAULT_AMOUNT_THRESHOLD}.
 * @returns the next state, or undefined when no transition exists (the caller
 * fails loud with {@link illegalTransitionMessage}).
 */
export function nextStateOf(
  state: WorkflowState, action: ApprovalAction, amount: number | undefined, threshold: number = DEFAULT_AMOUNT_THRESHOLD,
): WorkflowState | undefined {
  switch (action) {
    case 'submit':
      return state === 'draft' ? 'pending' : undefined
    case 'resubmit':
      return state === 'rejected' ? 'pending' : undefined
    case 'approve':
      if (state === 'pending') {
        return amount !== undefined && amount > threshold ? 'pending_level2' : 'approved'
      }
      return state === 'pending_level2' ? 'approved' : undefined
    case 'reject':
      return state === 'pending' || state === 'pending_level2' ? 'rejected' : undefined
    case 'void':
      return state === 'approved' ? 'void' : undefined
    default:
      return undefined
  }
}

/**
 * The fail-loud message for a transition no rule admits (misconfiguration
 * fails loud, never silently skips).
 * @param state - the document's current workflow state.
 * @param action - the refused action.
 * @returns the Chinese illegal-transition error text.
 */
export function illegalTransitionMessage(state: WorkflowState, action: ApprovalAction): string {
  return `非法审批转移：单据当前状态「${STATE_LABELS[state]}」(${state}) 不支持动作「${ACTION_LABELS[action]}」(${action})`
}

/**
 * Whether one state may drive downstream document creation (the gate passes
 * only on this).
 * @param state - the workflow state to test.
 * @returns true only for the effective state.
 */
export function isEffectiveState(state: WorkflowState): boolean {
  return state === EFFECTIVE_STATE
}

/**
 * Whether one document column value names a known workflow state (the
 * engine's state read).
 * @param value - the raw column value.
 * @returns true when the value is one of the six workflow states.
 */
export function isWorkflowState(value: unknown): value is WorkflowState {
  return typeof value === 'string' && (WORKFLOW_STATES as readonly string[]).includes(value)
}

/**
 * The gate refusal message: the downstream-creation precondition failed
 * because the referenced upstream document is not effective yet.
 * @param upstream - the upstream collection's business label (e.g. 采购单).
 * @param ref - how the downstream row referenced it (a document number).
 * @param state - the upstream row's actual workflow state.
 * @returns the Chinese fail-loud error text (contains 未生效).
 */
export function gateNotEffectiveMessage(upstream: string, ref: string, state: WorkflowState): string {
  return `上游单据未生效：${upstream} ${ref} 的审批状态为「${STATE_LABELS[state]}」（doc_status=${DOC_STATUS_ANCHORS[state]}），未生效单据不能驱动下游业务；请先提交并通过审批`
}

/**
 * The edit-lock refusal message for nb_update on a locked document.
 * @param label - the document's business label.
 * @param state - its current workflow state.
 * @returns the Chinese fail-loud error text.
 */
export function editLockedMessage(label: string, state: WorkflowState): string {
  return `单据已锁定编辑：${label} 当前状态「${STATE_LABELS[state]}」，审批中/已生效/已作废的单据禁止直接修改`
}

/**
 * Evaluate one wfl_flow_transitions condition expression against a document
 * row. The engine accepts only the restricted comparison DSL
 * `<field> <= <number>` / `<field> > <number>` (the seeded threshold
 * conditions); anything else fails loud as an unsupported condition rather
 * than being silently skipped.
 * @param condition - the condition expression (e.g. `total <= 100000`), or
 * undefined for an unconditional transition.
 * @param row - the upstream document row the condition reads.
 * @returns true when the transition applies to this row.
 */
export function conditionApplies(condition: string | undefined, row: Readonly<Record<string, unknown>>): boolean {
  if (condition === undefined || condition.trim() === '') return true
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*(<=|>)\s*(-?\d+(?:\.\d+)?)$/u.exec(condition.trim())
  if (match === null) {
    throw new Error(`审批条件表达式不支持：${condition}（引擎仅支持「字段 <= 阈值 / 字段 > 阈值」形式）`)
  }
  const field = match[1]
  const operator = match[2]
  if (field === undefined || operator === undefined) {
    throw new Error(`审批条件表达式不支持：${condition}（引擎仅支持「字段 <= 阈值 / 字段 > 阈值」形式）`)
  }
  const bound = Number(match[3])
  const value = Number(row[field])
  if (!Number.isFinite(value)) {
    throw new Error(`审批条件字段 ${field} 不是数字（当前值 ${JSON.stringify(row[field])}），无法评估条件 ${condition}`)
  }
  return operator === '<=' ? value <= bound : value > bound
}

// ─── the supplier-admission vocabulary (B2: one flow per state_field word-set) ───

/**
 * The supplier-admission flow's state field: a flow config whose state_field
 * carries this value runs on the supplier-lifecycle vocabulary
 * (potential → reviewing → qualified | rejected) instead of the six-state
 * doc_status machine.
 */
export const SUPPLIER_ADMISSION_STATE_FIELD = 'lifecycle_status'

/** The supplier-admission flow's states (the four the engine transitions among). */
export type SupplierAdmissionState = 'potential' | 'reviewing' | 'qualified' | 'rejected'

/** Every admission state in flow order (seed order for wfl_flow_states). */
export const SUPPLIER_ADMISSION_STATES: readonly SupplierAdmissionState[] = ['potential', 'reviewing', 'qualified', 'rejected']

/** Chinese labels for the admission states (shared by both engine entry points). */
export const SUPPLIER_ADMISSION_LABELS: Readonly<Record<SupplierAdmissionState, string>> = {
  potential: '潜在',
  reviewing: '准入评审中',
  qualified: '合格',
  rejected: '已拒绝',
}

/** The doc_status anchor per admission state (qualified is the effective one). */
export const SUPPLIER_ADMISSION_ANCHORS: Readonly<Record<SupplierAdmissionState, 0 | 1 | 2>> = {
  potential: 0,
  reviewing: 0,
  qualified: 1,
  rejected: 0,
}

/** The admission flow's effective state: qualified enters the AVL and may receive POs. */
export const ADMISSION_EFFECTIVE_STATE: SupplierAdmissionState = 'qualified'

/** The admission states under which direct edits refuse (the档案 is under review). */
export const ADMISSION_EDIT_LOCKED_STATES: readonly SupplierAdmissionState[] = ['reviewing']

/**
 * Resolve the next admission state for one transition (submit pushes a
 * potential supplier into review; resubmit re-pushes a rejected one; approve
 * lands qualified; reject lands rejected).
 * @param state - the supplier's current admission state.
 * @param action - the actor's action.
 * @returns the next state, or undefined when no transition exists.
 */
export function nextAdmissionStateOf(state: SupplierAdmissionState, action: ApprovalAction): SupplierAdmissionState | undefined {
  switch (action) {
    case 'submit':
      return state === 'potential' ? 'reviewing' : undefined
    case 'resubmit':
      return state === 'rejected' ? 'reviewing' : undefined
    case 'approve':
      return state === 'reviewing' ? 'qualified' : undefined
    case 'reject':
      return state === 'reviewing' ? 'rejected' : undefined
    default:
      return undefined
  }
}

/**
 * Whether one document column value names a known admission state.
 * @param value - the raw lifecycle_status value.
 * @returns true when the value is one of the four admission states.
 */
export function isSupplierAdmissionState(value: unknown): value is SupplierAdmissionState {
  return typeof value === 'string' && (SUPPLIER_ADMISSION_STATES as readonly string[]).includes(value)
}

/**
 * The fail-loud message for an admission transition no rule admits.
 * @param state - the supplier's current admission state.
 * @param action - the refused action.
 * @returns the Chinese illegal-transition error text.
 */
export function illegalAdmissionTransitionMessage(state: SupplierAdmissionState, action: ApprovalAction): string {
  return `非法准入转移：供应商当前状态「${SUPPLIER_ADMISSION_LABELS[state]}」(${state}) 不支持动作「${ACTION_LABELS[action]}」(${action})`
}

/** The four lifecycle states outside the admission machine (h4's full LIFECYCLE vocabulary; the gate message renders them). */
const EXTENDED_LIFECYCLE_LABELS: Readonly<Record<string, string>> = {
  preferred: '优选',
  restricted: '受限',
  frozen: '冻结',
  eliminated: '已淘汰',
}

/**
 * The Chinese label of either vocabulary's state (receipts echo what landed
 * regardless of which flow the document rides; the gate message also renders
 * the full eight-state lifecycle).
 * @param state - a workflow, admission, or lifecycle state value.
 * @returns the label, or the raw value when unknown.
 */
export function flowStateLabel(state: string): string {
  return STATE_LABELS[state as WorkflowState]
    ?? SUPPLIER_ADMISSION_LABELS[state as SupplierAdmissionState]
    ?? EXTENDED_LIFECYCLE_LABELS[state]
    ?? state
}

/**
 * Parse a gate's required_status column: a single value or a comma-separated
 * enum set (`qualified,preferred`); the admission gate's lifecycle check
 * reads the set.
 * @param raw - the wfl_gate_configs.required_status value (null allowed).
 * @returns the non-empty trimmed values in order, or [] when unset.
 */
export function parseRequiredStatuses(raw: string | null | undefined): readonly string[] {
  if (raw === null || raw === undefined) return []
  return raw.split(',').map(part => part.trim()).filter(part => part !== '')
}

/**
 * The admission-gate refusal message: the referenced supplier's lifecycle
 * state is not in the required set (qualified/preferred), so the downstream
 * creation refuses.
 * @param label - the upstream's business label (e.g. 供应商).
 * @param ref - how the downstream row referenced the supplier.
 * @param actual - the supplier's current lifecycle_status value.
 * @param required - the admitted lifecycle values, in order.
 * @returns the Chinese fail-loud error text (contains 未准入 and 不合格供方).
 */
export function gateNotAdmittedMessage(label: string, ref: string, actual: string, required: readonly string[]): string {
  const requiredText = required.map(value => `${flowStateLabel(value)}(${value})`).join('、')
  return `供应商卡口未通过：${label} ${ref} 的生命周期状态为「${flowStateLabel(actual)}」(${actual})，属未准入/不合格供方，不能向其下达采购单；供应商需先通过准入审核进入 ${requiredText}`
}

/**
 * The generic set-gate refusal message: the referenced upstream row's state
 * column holds a value outside the required set (B3's invoice gate — a
 * payment needs an invoice whose match_result is confirmed). Supplier-lifecycle
 * gates keep {@link gateNotAdmittedMessage}; every other state-field gate
 * renders this text.
 * @param label - the upstream's business label (e.g. 发票).
 * @param ref - how the downstream row referenced the upstream.
 * @param stateField - the upstream column the set reads (e.g. match_result).
 * @param actual - the upstream row's current value on that column.
 * @param required - the admitted values, in order.
 * @returns the Chinese fail-loud error text.
 */
export function gateNotInSetMessage(label: string, ref: string, stateField: string, actual: string, required: readonly string[]): string {
  const requiredText = required.map(value => `${flowStateLabel(value)}(${value})`).join('、')
  return `卡口未通过：${label} ${ref} 的 ${stateField} 为「${flowStateLabel(actual)}」(${actual})，不在要求集合 ${requiredText} 内；请先完成上游单据要求的状态再驱动下游业务`
}

/**
 * One flow's resolved vocabulary: the state word-set, labels, anchors,
 * effective state, edit-locked set, and transition resolver a flow config's
 * state_field selects. Two instances exist — the six-state doc_status machine
 * and the supplier-admission lifecycle machine.
 */
export interface FlowVocabulary {
  /** The flow-config state_field this vocabulary binds to. */
  readonly stateField: string
  readonly states: readonly string[]
  readonly labels: Readonly<Record<string, string>>
  readonly anchors: Readonly<Record<string, 0 | 1 | 2>>
  /** The state that may drive downstream creation and lands the extras write-back. */
  readonly effectiveState: string
  /** The states under which direct edits (nb_update) refuse. */
  readonly lockedStates: readonly string[]
  readonly isState: (value: unknown) => value is string
  readonly nextOf: (state: string, action: ApprovalAction, amount: number | undefined, threshold?: number) => string | undefined
  readonly illegalMessage: (state: string, action: ApprovalAction) => string
}

/** The six-state doc_status vocabulary every approval document rides by default. */
export const DOC_FLOW_VOCABULARY: FlowVocabulary = {
  stateField: 'doc_status',
  states: WORKFLOW_STATES,
  labels: STATE_LABELS,
  anchors: DOC_STATUS_ANCHORS,
  effectiveState: EFFECTIVE_STATE,
  lockedStates: EDIT_LOCKED_STATES,
  isState: isWorkflowState,
  nextOf: (state, action, amount, threshold) => nextStateOf(state as WorkflowState, action, amount, threshold),
  illegalMessage: (state, action) => illegalTransitionMessage(state as WorkflowState, action),
}

/** The supplier-admission vocabulary (state_field=lifecycle_status). */
export const ADMISSION_FLOW_VOCABULARY: FlowVocabulary = {
  stateField: SUPPLIER_ADMISSION_STATE_FIELD,
  states: SUPPLIER_ADMISSION_STATES,
  labels: SUPPLIER_ADMISSION_LABELS,
  anchors: SUPPLIER_ADMISSION_ANCHORS,
  effectiveState: ADMISSION_EFFECTIVE_STATE,
  lockedStates: ADMISSION_EDIT_LOCKED_STATES,
  isState: isSupplierAdmissionState,
  nextOf: (state, action) => nextAdmissionStateOf(state as SupplierAdmissionState, action),
  illegalMessage: (state, action) => illegalAdmissionTransitionMessage(state as SupplierAdmissionState, action),
}

/**
 * Resolve the vocabulary one flow config's state_field names, failing loud on
 * an unknown field (misconfiguration fails loud).
 * @param stateField - the flow config's state_field value.
 * @returns the bound vocabulary.
 */
export function vocabularyForStateField(stateField: string): FlowVocabulary {
  if (stateField === DOC_FLOW_VOCABULARY.stateField) return DOC_FLOW_VOCABULARY
  if (stateField === ADMISSION_FLOW_VOCABULARY.stateField) return ADMISSION_FLOW_VOCABULARY
  throw new Error(`未知的审批状态字段 ${stateField}（支持 doc_status 与 ${SUPPLIER_ADMISSION_STATE_FIELD}）；检查 wfl_flow_configs.state_field`)
}
