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

/**
 * One business action the engine also routes (W5-B5 terminal-vocabulary
 * extension): terminal transitions a flow declares in graph extras and the
 * derived wfl_flow_transitions rows carry. Unlike approve/reject they open no
 * todos and aggregate nothing — the transition is a direct CAS move.
 */
export type BusinessAction = 'settle' | 'promote' | 'demote' | 'restrict' | 'freeze' | 'eliminate' | 'restore'

/** One approval action (what the actor performs, never a state name). */
export type ApprovalAction = 'submit' | 'approve' | 'reject' | 'void' | 'resubmit' | BusinessAction

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
  settle: '结算付款',
  promote: '升为优选',
  demote: '降回合格',
  restrict: '设为受限',
  freeze: '冻结',
  eliminate: '淘汰',
  restore: '恢复',
}

/** The graph extras' terminal-transition actions the publish compiler accepts (the W5-B5 vocabulary extension's whitelist). */
export const DOC_TERMINAL_ACTIONS: readonly string[] = ['settle', 'promote', 'demote', 'restrict', 'freeze', 'eliminate', 'restore']

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
 * row. The DSL is one or more comparison clauses joined by a single AND or OR
 * (W5-B2; the seeded flows' bare `<field> <= <number>` / `<field> > <number>`
 * literals keep parsing unchanged). Clause operators: `> >= < <= == !=`
 * compare numerically when both sides are numeric (`== / !=` also compare as
 * strings), `contains` does a substring test on the field's string form.
 * Anything else fails loud as an unsupported condition rather than being
 * silently skipped.
 * @param condition - the condition expression (e.g. `total <= 100000`,
 * `total > 500 AND qty < 10`, `name contains '钢'`), or undefined for an
 * unconditional transition.
 * @param row - the upstream document row the condition reads.
 * @returns true when the transition applies to this row.
 */
export function conditionApplies(condition: string | undefined, row: Readonly<Record<string, unknown>>): boolean {
  if (condition === undefined || condition.trim() === '') return true
  const clauses = parseConditionClauses(condition)
  if (clauses.joiner === 'AND') return clauses.parts.every(clause => conditionClauseApplies(clause, row, condition))
  return clauses.parts.some(clause => conditionClauseApplies(clause, row, condition))
}

/** One parsed comparison clause: a field, an operator, and the raw literal text. */
interface ConditionClause {
  readonly field: string
  readonly operator: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'contains'
  readonly literal: string
}

/** The parsed condition expression: its clauses and the one joiner between them. */
interface ParsedCondition {
  readonly parts: ReadonlyArray<ConditionClause>
  readonly joiner: 'AND' | 'OR'
}

/**
 * Parse one condition expression into clauses plus its joiner. Every clause is
 * `ident OP number` or `ident OP 'single-quoted string'`; clauses sit behind
 * at most one joiner kind (mixed AND/OR in one expression fails loud — the
 * publish compiler never emits it, and a hand-written row that mixes them is a
 * configuration error, not a policy).
 * @param condition - the raw condition_expr text.
 * @returns the clauses in order and their joiner.
 */
function parseConditionClauses(condition: string): ParsedCondition {
  const text = condition.trim()
  const parts: ConditionClause[] = []
  let joiner: 'AND' | 'OR' | null = null
  let rest = text
  while (rest !== '') {
    const head = /^([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|==|!=|>|<|contains)\s*(-?\d+(?:\.\d+)?|'[^']*')/u.exec(rest)
    if (head === null) {
      throw new Error(`审批条件表达式不支持：${condition}（需为「字段 <比较符> 数值或'字符串'」，多行以 AND/OR 连接）`)
    }
    parts.push({ field: head[1] as string, operator: head[2] as ConditionClause['operator'], literal: head[3] as string })
    rest = rest.slice(head[0].length).trim()
    if (rest === '') break
    const connector = /^(AND|OR)\s+/u.exec(rest)
    if (connector === null) {
      throw new Error(`审批条件表达式不支持：${condition}（子句之间需以 AND/OR 连接）`)
    }
    const kind = connector[1] as 'AND' | 'OR'
    if (joiner !== null && joiner !== kind) {
      throw new Error(`审批条件表达式不支持：${condition}（AND 与 OR 不能混用于同一表达式）`)
    }
    joiner = kind
    rest = rest.slice(connector[0].length).trim()
  }
  if (parts.length === 0) {
    throw new Error(`审批条件表达式不支持：${condition}`)
  }
  return { parts, joiner: joiner ?? 'AND' }
}

/**
 * Evaluate one parsed clause against the row. Numeric operators require a
 * finite numeric field value (fail loud, as ever); == / != fall back to
 * string comparison when either side is non-numeric; contains compares the
 * field's string form.
 * @param clause - the parsed clause.
 * @param row - the document row the field reads.
 * @param whole - the full condition text (error context).
 * @returns whether the clause holds.
 */
function conditionClauseApplies(clause: ConditionClause, row: Readonly<Record<string, unknown>>, whole: string): boolean {
  const raw = row[clause.field]
  if (raw === undefined) {
    throw new Error(`审批条件字段 ${clause.field} 不存在（无法评估条件 ${whole}）`)
  }
  const literalIsNumeric = clause.literal !== '' && !clause.literal.startsWith("'")
  const literalNumber = Number(clause.literal)
  const literalString = clause.literal.startsWith("'") ? clause.literal.slice(1, -1) : clause.literal
  /** The field's string form (numbers stringify plainly, objects JSON — never '[object Object]'). */
  const textOf = (value: unknown): string => typeof value === 'string' ? value : JSON.stringify(value)
  if (clause.operator === 'contains') {
    return textOf(raw).includes(literalString)
  }
  if (literalIsNumeric) {
    const value = Number(raw)
    if (Number.isFinite(value)) {
      switch (clause.operator) {
        case '>': return value > literalNumber
        case '>=': return value >= literalNumber
        case '<': return value < literalNumber
        case '<=': return value <= literalNumber
        case '==': return value === literalNumber
        case '!=': return value !== literalNumber
      }
    }
    if (clause.operator !== '==' && clause.operator !== '!=') {
      throw new Error(`审批条件字段 ${clause.field} 不是数字（当前值 ${JSON.stringify(raw)}），无法评估条件 ${whole}`)
    }
  }
  const text = textOf(raw)
  return clause.operator === '!=' ? text !== literalString : text === literalString
}

// ─── the supplier-admission vocabulary (B2: one flow per state_field word-set) ───

/**
 * The supplier-admission flow's state field: a flow config whose state_field
 * carries this value runs on the supplier-lifecycle vocabulary
 * (potential → reviewing → qualified | rejected) instead of the six-state
 * doc_status machine.
 */
export const SUPPLIER_ADMISSION_STATE_FIELD = 'lifecycle_status'

/** The admission core (the pre-W5-B3 four states the engine transitions among). */
export type AdmissionCoreState = 'potential' | 'reviewing' | 'qualified' | 'rejected'

/**
 * The supplier-admission flow's full state set: the W5-B3 extension folds
 * h4's four post-admission lifecycle grades (preferred/restricted/frozen/
 * eliminated) into the same controlled machine, so grade moves ride engine
 * transitions instead of direct writes.
 */
export type SupplierAdmissionState = AdmissionCoreState | 'preferred' | 'restricted' | 'frozen' | 'eliminated'

/** Every admission state in flow order (seed order for wfl_flow_states). */
export const SUPPLIER_ADMISSION_STATES: readonly SupplierAdmissionState[] = ['potential', 'reviewing', 'qualified', 'rejected', 'preferred', 'restricted', 'frozen', 'eliminated']

/** The admission states that existed before the W5-B3 grade extension (round-trip and template compat). */
export const ADMISSION_CORE_STATES: readonly AdmissionCoreState[] = ['potential', 'reviewing', 'qualified', 'rejected']

/** Chinese labels for the admission states (shared by both engine entry points). */
export const SUPPLIER_ADMISSION_LABELS: Readonly<Record<SupplierAdmissionState, string>> = {
  potential: '潜在',
  reviewing: '准入评审中',
  qualified: '合格',
  rejected: '已拒绝',
  preferred: '优选',
  restricted: '受限',
  frozen: '冻结',
  eliminated: '已淘汰',
}

/**
 * The doc_status anchor per admission state: qualified/preferred keep the AVL
 * effective anchor (both may receive POs per the existing gate sets); the
 * restricted/frozen/eliminated grades leave it.
 */
export const SUPPLIER_ADMISSION_ANCHORS: Readonly<Record<SupplierAdmissionState, 0 | 1 | 2>> = {
  potential: 0,
  reviewing: 0,
  qualified: 1,
  rejected: 0,
  preferred: 1,
  restricted: 0,
  frozen: 0,
  eliminated: 0,
}

/** The admission flow's effective state: qualified enters the AVL and may receive POs. */
export const ADMISSION_EFFECTIVE_STATE: SupplierAdmissionState = 'qualified'

/** The admission states under which direct edits refuse (the档案 is under review). */
export const ADMISSION_EDIT_LOCKED_STATES: readonly SupplierAdmissionState[] = ['reviewing']

/**
 * Resolve the next admission state for one transition. The core legs: submit
 * pushes a potential supplier into review; resubmit re-pushes a rejected one
 * (and re-admits an eliminated one); approve lands qualified; reject lands
 * rejected. The W5-B3 grade legs: promote/demote move between qualified and
 * preferred; restrict demotes to restricted; freeze escalates restricted to
 * frozen; eliminate terminates a frozen supplier; restore walks a sanctioned
 * grade back to the AVL.
 * @param state - the supplier's current admission state.
 * @param action - the actor's action.
 * @returns the next state, or undefined when no transition exists.
 */
export function nextAdmissionStateOf(state: SupplierAdmissionState, action: ApprovalAction): SupplierAdmissionState | undefined {
  switch (action) {
    case 'submit':
      return state === 'potential' ? 'reviewing' : undefined
    case 'resubmit':
      return state === 'rejected' || state === 'eliminated' ? 'reviewing' : undefined
    case 'approve':
      return state === 'reviewing' ? 'qualified' : undefined
    case 'reject':
      return state === 'reviewing' ? 'rejected' : undefined
    case 'promote':
      return state === 'qualified' ? 'preferred' : undefined
    case 'demote':
      return state === 'preferred' ? 'qualified' : undefined
    case 'restrict':
      return state === 'qualified' || state === 'preferred' ? 'restricted' : undefined
    case 'freeze':
      return state === 'restricted' ? 'frozen' : undefined
    case 'eliminate':
      return state === 'frozen' ? 'eliminated' : undefined
    case 'restore':
      return state === 'restricted' ? 'qualified' : state === 'frozen' ? 'restricted' : undefined
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

/**
 * The Chinese label of either vocabulary's state (receipts echo what landed
 * regardless of which flow the document rides; the gate message also renders
 * the full eight-state lifecycle).
 * @param state - a workflow, admission, or lifecycle state value.
 * @returns the label, or the raw value when unknown.
 */
export function flowStateLabel(state: string): string {
  const flow = (STATE_LABELS as Record<string, string | undefined>)[state]
  if (flow !== undefined) return flow
  return (SUPPLIER_ADMISSION_LABELS as Record<string, string | undefined>)[state] ?? state
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
 * Extend one vocabulary with a flow's declared terminal states (the W5-B5
 * mechanism: a flow whose graph extras name terminal states — pur_payments'
 * paid, pur_requests' converted/closed — reads those values as legal states,
 * so a business-terminal document keeps acting through the engine instead of
 * failing the vocabulary check). Terminal states join `states` (transition
 * lookups and legal-next filters see them), gain the effective-side anchor
 * default, never join the edit-locked set, and resolve no fallback transition
 * (their moves ride the derived terminal transition rows only).
 * @param base - the vocabulary the flow's state_field selects.
 * @param terminals - the flow-declared terminal state names (duplicates of base states are ignored).
 * @returns the extended vocabulary (base untouched).
 */
export function extendVocabulary(base: FlowVocabulary, terminals: readonly string[]): FlowVocabulary {
  const fresh = terminals.filter(name => !base.states.includes(name))
  const anchors: Record<string, 0 | 1 | 2> = { ...base.anchors }
  const labels: Record<string, string> = { ...base.labels }
  for (const name of fresh) {
    anchors[name] = 1
    labels[name] = name
  }
  const states = [...base.states, ...fresh]
  return {
    ...base,
    states,
    labels,
    anchors,
    isState: (value: unknown): value is string => typeof value === 'string' && states.includes(value),
    nextOf: (state, action, amount, threshold) => (fresh.includes(state) ? undefined : base.nextOf(state, action, amount, threshold)),
  }
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
