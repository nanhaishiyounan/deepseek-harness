/**
 * The v3 structured message protocol: the `dsh` fenced payloads that ride
 * assistant messages (ask_choice / ask_field / form_draft / submit_receipt /
 * report / approval_pending / approval_result) and user action messages
 * (form_confirm / reject_flow / approval_confirm). This module owns the wire
 * shapes' validation and the narrative/fence splitting every fold consumer
 * rides; an invalid or unknown fence degrades to ordinary text instead of
 * breaking the chat flow. No React imports.
 *
 * W21-R1 leniency, mirrored with the server-side present_card resolve step:
 * id/value/count leaves also accept bare numbers and coerce them to strings,
 * and a stringified payload object parses before validation, so a card
 * renders identically whichever channel carried it. Narrative leaves
 * (question, label, title…) stay string-only.
 */

import { stripJsonComments } from './form-draft.ts'

/** The protocol envelope version every v3 fence carries. */
export const DSH_PROTOCOL_VERSION = 3

/** The field tier of one draft field (the card's three-way layout). */
export type FieldTier = 'required' | 'derived' | 'system'

/** The widget kinds a protocol field can ask the surface to render. */
export type FieldWidgetKind = 'text' | 'number' | 'date' | 'select' | 'relation'

/** One option of an ask_choice payload. */
export interface AskChoiceOption {
  readonly label: string
  readonly value: string
  readonly hint?: string
  /** Text sent as the user message when picked; defaults to the label. */
  readonly send?: string
}

/** The ask_choice payload: a question with pickable options. */
export interface AskChoicePayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'ask_choice'
  readonly id: string
  readonly mode: 'single' | 'multi'
  readonly variant: 'cards' | 'chips' | 'buttons'
  readonly question: string
  readonly options: readonly AskChoiceOption[]
  readonly allowFreeText: boolean
}

/** One suggested value of an ask_field payload. */
export interface AskFieldSuggestion {
  readonly label: string
  readonly value: string
  readonly hint?: string
}

/** The ask_field payload: one missing required field, asked alone. */
export interface AskFieldPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'ask_field'
  readonly id: string
  readonly question: string
  readonly field: {
    readonly name: string
    readonly label: string
    readonly widget: FieldWidgetKind
    readonly unit?: string
    readonly suggestions: readonly AskFieldSuggestion[]
  }
}

/** One field row of a form_draft payload. */
export interface FormField {
  readonly name: string
  readonly label: string
  /** null = the user still has to decide (required tier only). */
  readonly value: string | null
  readonly tier: FieldTier
  readonly rationale?: string
  readonly edited?: boolean
  readonly widget: FieldWidgetKind
  readonly options?: ReadonlyArray<{ label: string; value: string }>
}

/** The form_draft payload: the three-tier draft card. */
export interface FormDraftPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'form_draft'
  readonly draftId: string
  readonly revision: number
  readonly form: { readonly collection: string; readonly label: string }
  readonly title: string
  readonly fields: readonly FormField[]
}

/** The form_confirm payload: the user's 确认写入 action message. */
export interface FormConfirmPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'form_confirm'
  readonly draftId: string
  readonly revision: number
  readonly form: { readonly collection: string; readonly label: string }
  readonly fields: ReadonlyArray<{ readonly name: string; readonly label: string; readonly value: string }>
}

/** The reject_flow payload: the user's 驳回 action message. */
export interface RejectFlowPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'reject_flow'
  readonly draftId: string
  readonly reason?: string
}

/** The metric layout variant of one receipt summary row. */
export type ReceiptSummaryKind = 'money' | 'date' | 'id' | 'count' | 'text'

/** The submit_receipt payload: the landing-row receipt card. */
export interface SubmitReceiptPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'submit_receipt'
  readonly draftId: string
  readonly form: { readonly collection: string; readonly label: string }
  readonly rowId: string
  readonly summary: ReadonlyArray<{ label: string; value: string; kind: ReceiptSummaryKind }>
}

/** The layout variant of one report metric cell. */
export type ReportMetricKind = 'count' | 'money' | 'percent' | 'text'

/** The semantic tone of one report metric cell (absent = neutral). */
export type ReportTone = 'positive' | 'warning' | 'danger'

/** One report metric cell; the value arrives pre-formatted. */
export interface ReportMetric {
  readonly label: string
  readonly value: string
  readonly kind: ReportMetricKind
  readonly tone?: ReportTone
}

/** The severity level of one report row (the leading dot's color). */
export type ReportLevel = 'high' | 'medium' | 'low'

/** One report row (a risk / todo / advice entry). */
export interface ReportRow {
  readonly label: string
  readonly hint?: string
  readonly level: ReportLevel
}

/** The layout variant of one report table column. */
export type ReportColumnKind = 'text' | 'money' | 'percent' | 'count'

/** The report's optional comparison table. */
export interface ReportTable {
  readonly columns: ReadonlyArray<{ label: string; kind?: ReportColumnKind }>
  /** Rows as wide as `columns` (cell values arrive pre-formatted). */
  readonly rows: ReadonlyArray<ReadonlyArray<string>>
}

/** One report action button; the dispatch executor switches on the kind. */
export type ReportAction =
  | { readonly kind: 'view'; readonly label: string; readonly route: string }
  | { readonly kind: 'create-task'; readonly label: string; readonly title: string; readonly suggestion?: string }
  | { readonly kind: 'send'; readonly label: string; readonly text: string }
  | { readonly kind: 'link'; readonly label: string; readonly url: string }

/** The approval document reference every approval payload shares. */
export interface ApprovalDocRef {
  readonly collection: string
  readonly label: string
  readonly docId: string
  readonly title: string
}

/** The approval_pending payload: one open approval todo rendered as the approval card. */
export interface ApprovalPendingPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'approval_pending'
  readonly id: string
  readonly doc: ApprovalDocRef
  readonly applicant?: string
  readonly node?: string
  readonly attempt?: string
  readonly summary: ReadonlyArray<{ label: string; value: string; kind: ReceiptSummaryKind }>
}

/** The approval_confirm payload: the user's 同意/驳回 action message. */
export interface ApprovalConfirmPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'approval_confirm'
  readonly approvalId: string
  readonly doc: { collection: string; label: string; docId: string }
  readonly action: 'approve' | 'reject'
  readonly comment?: string
}

/** The approval_result payload: the post-act outcome card (state read back from the real row). */
export interface ApprovalResultPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'approval_result'
  readonly approvalId: string
  readonly doc: ApprovalDocRef
  readonly action: 'approve' | 'reject'
  /** The landed state — the six doc_status states or the four supplier-admission states (rejected is shared). */
  readonly state: 'draft' | 'pending' | 'pending_level2' | 'approved' | 'rejected' | 'void' | 'potential' | 'reviewing' | 'qualified'
  readonly by: string
  readonly comment?: string
  readonly at?: string
}

/** The report payload: the structured report card (metrics/rows/table/actions). */
export interface ReportPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'report'
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  /** 1–6 metric cells (the persona contract's self-check bound). */
  readonly metrics: ReadonlyArray<ReportMetric>
  /** 0–8 entry rows. */
  readonly rows?: ReadonlyArray<ReportRow>
  /** Optional table (columns ≤5, rows ≤10). */
  readonly table?: ReportTable
  /** 0–4 action buttons. */
  readonly actions?: ReadonlyArray<ReportAction>
}

/** The plan_suggest payload: one open MRP suggestion rendered as the plan card (ERPNext's 计划单人工确认). */
export interface PlanSuggestPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'plan_suggest'
  readonly id: string
  /** The mrp_suggestions row id the confirm action carries back. */
  readonly suggestionId: string
  readonly planType: 'MO' | 'PR'
  readonly product: string
  readonly qty: string
  readonly suggestDate?: string
  readonly driverSo?: string
  readonly needDate?: string
}

/** The plan_result payload: the post-confirm outcome card (converted doc back-reference or the dismissal). */
export interface PlanResultPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'plan_result'
  readonly planId: string
  readonly suggestionId: string
  readonly planType: 'MO' | 'PR'
  readonly product: string
  readonly outcome: 'converted' | 'dismissed'
  readonly docCode?: string
  readonly state?: string
  readonly by?: string
}

/** The plan_confirm payload: the user's 确认转单/忽略 action message. */
export interface PlanConfirmPayload {
  readonly v: typeof DSH_PROTOCOL_VERSION
  readonly type: 'plan_confirm'
  readonly planId: string
  readonly suggestionId: string
  readonly action: 'confirm' | 'dismiss'
  readonly planType: 'MO' | 'PR'
  readonly product: string
}

/** Every wire payload a `dsh` fence can carry. */
export type DshPayload =
  | AskChoicePayload
  | AskFieldPayload
  | FormDraftPayload
  | FormConfirmPayload
  | RejectFlowPayload
  | SubmitReceiptPayload
  | ReportPayload
  | ApprovalPendingPayload
  | ApprovalConfirmPayload
  | ApprovalResultPayload
  | PlanSuggestPayload
  | PlanResultPayload
  | PlanConfirmPayload

/** One piece of a split message: a narrative run, a valid fence payload, or an unvalidatable dsh fence. */
export type MessageSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'degraded'; readonly text: string }
  | { readonly kind: 'dsh'; readonly payload: DshPayload }

/** The `dsh` fence: protocol payloads never render as ordinary code blocks. */
const DSH_FENCE = /```dsh[ \t]*\r?\n([\s\S]*?)```/g

/** A non-empty string, or undefined for anything else. */
function requiredText(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * A non-empty string, or a finite number coerced to its string form, or
 * undefined for anything else — the id/value/count leaves the present_card
 * schema widens; the fence and tool channels coerce them identically.
 */
function coercedText(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** A trimmed optional string, or undefined for anything else. */
function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** One of a closed string union, or undefined for anything else. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : undefined
}

/** Validate an ask_choice fence body. */
function parseAskChoice(obj: Record<string, unknown>): AskChoicePayload | undefined {
  const id = coercedText(obj['id'])
  const question = requiredText(obj['question'])
  if (id === undefined || question === undefined) return undefined
  if (!Array.isArray(obj['options']) || obj['options'].length === 0) return undefined
  const options: AskChoiceOption[] = []
  for (const raw of obj['options']) {
    if (typeof raw !== 'object' || raw === null) return undefined
    const option = raw as Record<string, unknown>
    const label = requiredText(option['label'])
    const value = coercedText(option['value'])
    if (label === undefined || value === undefined) return undefined
    const hint = optionalText(option['hint'])
    const send = optionalText(option['send'])
    options.push({ label, value, ...hint === undefined ? {} : { hint }, ...send === undefined ? {} : { send } })
  }
  return {
    v: DSH_PROTOCOL_VERSION,
    type: 'ask_choice',
    id,
    // A fence that omits the presentation hints still answers: single choice
    // chips is the least-committal rendering.
    mode: oneOf(obj['mode'], ['single', 'multi'] as const) ?? 'single',
    variant: oneOf(obj['variant'], ['cards', 'chips', 'buttons'] as const) ?? 'chips',
    question,
    options,
    allowFreeText: obj['allowFreeText'] === true,
  }
}

/** Validate an ask_field fence body. */
function parseAskField(obj: Record<string, unknown>): AskFieldPayload | undefined {
  const id = coercedText(obj['id'])
  const question = requiredText(obj['question'])
  const rawField = obj['field']
  if (id === undefined || question === undefined) return undefined
  if (typeof rawField !== 'object' || rawField === null) return undefined
  const field = rawField as Record<string, unknown>
  const name = requiredText(field['name'])
  const label = requiredText(field['label'])
  const widget = oneOf(field['widget'], ['text', 'number', 'date', 'select', 'relation'] as const)
  if (name === undefined || label === undefined || widget === undefined) return undefined
  // The server schema marks field.suggestions required; a fence that omits it
  // (or spells it as a non-list) degrades the same way, so replayed history
  // never renders a button-less field card.
  if (!Array.isArray(field['suggestions'])) return undefined
  const suggestions: AskFieldSuggestion[] = []
  for (const raw of field['suggestions']) {
    if (typeof raw !== 'object' || raw === null) return undefined
    const suggestion = raw as Record<string, unknown>
    const sLabel = requiredText(suggestion['label'])
    const sValue = coercedText(suggestion['value'])
    if (sLabel === undefined || sValue === undefined) return undefined
    const hint = optionalText(suggestion['hint'])
    suggestions.push({ label: sLabel, value: sValue, ...hint === undefined ? {} : { hint } })
  }
  const unit = optionalText(field['unit'])
  return {
    v: DSH_PROTOCOL_VERSION,
    type: 'ask_field',
    id,
    question,
    field: { name, label, widget, ...unit === undefined ? {} : { unit }, suggestions },
  }
}

/** Validate one field row's shape against the protocol (value null allowed). */
function fieldRowOf(raw: unknown, allowNull: boolean): { name: string; label: string; value: string | null } | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as Record<string, unknown>
  const name = requiredText(row['name'])
  const label = requiredText(row['label'])
  if (name === undefined || label === undefined) return undefined
  if (row['value'] === null) return allowNull ? { name, label, value: null } : undefined
  // A field value keeps the original any-string semantics (the empty string is
  // the "generated after landing" spelling); finite numbers coerce to strings.
  if (typeof row['value'] === 'number' && Number.isFinite(row['value'])) {
    return { name, label, value: String(row['value']) }
  }
  return typeof row['value'] === 'string' ? { name, label, value: row['value'] } : undefined
}

/** Validate a form_draft fence body. */
function parseFormDraftPayload(obj: Record<string, unknown>): FormDraftPayload | undefined {
  const draftId = coercedText(obj['draftId'])
  const revision = obj['revision']
  const title = requiredText(obj['title'])
  const form = formOf(obj['form'])
  if (draftId === undefined || title === undefined || form === undefined) return undefined
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) return undefined
  if (!Array.isArray(obj['fields']) || obj['fields'].length === 0) return undefined
  const fields: FormField[] = []
  for (const raw of obj['fields']) {
    const base = fieldRowOf(raw, true)
    if (base === undefined) return undefined
    const row = raw as Record<string, unknown>
    const tier = oneOf(row['tier'], ['required', 'derived', 'system'] as const)
    const widget = oneOf(row['widget'], ['text', 'number', 'date', 'select', 'relation'] as const)
    if (tier === undefined || widget === undefined) return undefined
    if (base.value === null && tier !== 'required') return undefined
    const rationale = optionalText(row['rationale'])
    const options = parseFieldOptions(row['options'])
    fields.push({
      ...base,
      tier,
      widget,
      ...rationale === undefined ? {} : { rationale },
      ...(row['edited'] === true) ? { edited: true } : {},
      ...options === undefined ? {} : { options },
    })
  }
  return { v: DSH_PROTOCOL_VERSION, type: 'form_draft', draftId, revision, form, title, fields }
}

/** The select/relation candidates of one draft field, when present and valid. */
function parseFieldOptions(value: unknown): ReadonlyArray<{ label: string; value: string }> | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  const options: { label: string; value: string }[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return undefined
    const option = raw as Record<string, unknown>
    const label = requiredText(option['label'])
    const optionValue = coercedText(option['value'])
    if (label === undefined || optionValue === undefined) return undefined
    options.push({ label, value: optionValue })
  }
  return options
}

/** The shared {collection,label} form reference of draft/confirm/receipt. */
function formOf(value: unknown): { collection: string; label: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const form = value as Record<string, unknown>
  const collection = requiredText(form['collection'])
  const label = requiredText(form['label'])
  if (collection === undefined || label === undefined) return undefined
  return { collection, label }
}

/** Validate a form_confirm fence body. */
function parseFormConfirm(obj: Record<string, unknown>): FormConfirmPayload | undefined {
  const draftId = requiredText(obj['draftId'])
  const revision = obj['revision']
  const form = formOf(obj['form'])
  if (draftId === undefined || form === undefined) return undefined
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) return undefined
  if (!Array.isArray(obj['fields']) || obj['fields'].length === 0) return undefined
  const fields: { name: string; label: string; value: string }[] = []
  for (const raw of obj['fields']) {
    const row = fieldRowOf(raw, false)
    if (row === undefined || row.value === null) return undefined
    fields.push({ name: row.name, label: row.label, value: row.value })
  }
  return { v: DSH_PROTOCOL_VERSION, type: 'form_confirm', draftId, revision, form, fields }
}

/** Validate a reject_flow fence body. */
function parseRejectFlow(obj: Record<string, unknown>): RejectFlowPayload | undefined {
  const draftId = requiredText(obj['draftId'])
  if (draftId === undefined) return undefined
  const reason = optionalText(obj['reason'])
  return { v: DSH_PROTOCOL_VERSION, type: 'reject_flow', draftId, ...reason === undefined ? {} : { reason } }
}

/** Validate one report metric cell. */
function parseReportMetric(raw: unknown): ReportMetric | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const metric = raw as Record<string, unknown>
  const label = requiredText(metric['label'])
  const value = coercedText(metric['value'])
  const kind = oneOf(metric['kind'], ['count', 'money', 'percent', 'text'] as const)
  if (label === undefined || value === undefined || kind === undefined) return undefined
  const tone = oneOf(metric['tone'], ['positive', 'warning', 'danger'] as const)
  // A present-but-illegal tone is a violation, not a missing hint to default.
  if (metric['tone'] !== undefined && tone === undefined) return undefined
  return { label, value, kind, ...tone === undefined ? {} : { tone } }
}

/** Validate one report entry row. */
function parseReportRow(raw: unknown): ReportRow | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as Record<string, unknown>
  const label = requiredText(row['label'])
  const level = oneOf(row['level'], ['high', 'medium', 'low'] as const)
  if (label === undefined || level === undefined) return undefined
  const hint = optionalText(row['hint'])
  return { label, level, ...hint === undefined ? {} : { hint } }
}

/** Validate the report table: columns ≤5, rows ≤10, every row as wide as the columns. */
function parseReportTable(value: unknown): ReportTable | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const table = value as Record<string, unknown>
  if (!Array.isArray(table['columns']) || table['columns'].length === 0 || table['columns'].length > 5) return undefined
  if (!Array.isArray(table['rows']) || table['rows'].length > 10) return undefined
  const columns: { label: string; kind?: ReportColumnKind }[] = []
  for (const raw of table['columns']) {
    if (typeof raw !== 'object' || raw === null) return undefined
    const column = raw as Record<string, unknown>
    const label = requiredText(column['label'])
    if (label === undefined) return undefined
    const kind = oneOf(column['kind'], ['text', 'money', 'percent', 'count'] as const)
    // A present-but-illegal kind is a violation, not a missing hint to default.
    if (column['kind'] !== undefined && kind === undefined) return undefined
    columns.push({ label, ...kind === undefined ? {} : { kind } })
  }
  const rows: string[][] = []
  for (const raw of table['rows']) {
    if (!Array.isArray(raw) || raw.length !== columns.length) return undefined
    const cells: string[] = []
    for (const cell of raw) {
      if (typeof cell === 'number' && Number.isFinite(cell)) {
        cells.push(String(cell))
        continue
      }
      if (typeof cell !== 'string') return undefined
      cells.push(cell)
    }
    rows.push(cells)
  }
  return { columns, rows }
}

/** Validate one report action by its discriminated kind. */
function parseReportAction(raw: unknown): ReportAction | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const action = raw as Record<string, unknown>
  const label = requiredText(action['label'])
  if (label === undefined) return undefined
  switch (oneOf(action['kind'], ['view', 'create-task', 'send', 'link'] as const)) {
    case 'view': {
      const route = requiredText(action['route'])
      return route === undefined ? undefined : { kind: 'view', label, route }
    }
    case 'create-task': {
      // The real-LLM capture form writes the follow-up instruction into
      // `text` instead of `title`; fold it back onto the legal shape — the
      // first 32 code points become the title, the full text the suggestion
      // (an explicit suggestion still wins). Both absent stays a violation.
      const text = optionalText(action['text'])
      const title = requiredText(action['title'])
        ?? (text === undefined ? undefined : Array.from(text).slice(0, 32).join(''))
      if (title === undefined) return undefined
      const suggestion = optionalText(action['suggestion']) ?? text
      return { kind: 'create-task', label, title, ...suggestion === undefined ? {} : { suggestion } }
    }
    case 'send': {
      const text = requiredText(action['text'])
      return text === undefined ? undefined : { kind: 'send', label, text }
    }
    case 'link': {
      const url = requiredText(action['url'])
      return url === undefined ? undefined : { kind: 'link', label, url }
    }
    default:
      return undefined
  }
}

/**
 * Validate a report fence body. The metric/row/table/action ceilings are the
 * persona contract's self-check bounds: an over-limit card degrades whole
 * (its original fence stays visible) rather than silently truncating.
 */
function parseReport(obj: Record<string, unknown>): ReportPayload | undefined {
  const id = coercedText(obj['id'])
  const title = requiredText(obj['title'])
  if (id === undefined || title === undefined) return undefined
  if (!Array.isArray(obj['metrics']) || obj['metrics'].length < 1 || obj['metrics'].length > 6) return undefined
  const metrics: ReportMetric[] = []
  for (const raw of obj['metrics']) {
    const metric = parseReportMetric(raw)
    if (metric === undefined) return undefined
    metrics.push(metric)
  }
  // An explicit null is the model's "left this one out" spelling (the real
  // capture writes "table": null); treat it as absent, not as a violation.
  let rows: ReportRow[] | undefined
  if (obj['rows'] !== undefined && obj['rows'] !== null) {
    if (!Array.isArray(obj['rows']) || obj['rows'].length > 8) return undefined
    rows = []
    for (const raw of obj['rows']) {
      const row = parseReportRow(raw)
      if (row === undefined) return undefined
      rows.push(row)
    }
  }
  let table: ReportTable | undefined
  if (obj['table'] !== undefined && obj['table'] !== null) {
    table = parseReportTable(obj['table'])
    if (table === undefined) return undefined
  }
  let actions: ReportAction[] | undefined
  // An explicit null is the "left this one out" spelling here too (matching
  // rows/table above and the server-side resolve walk).
  if (obj['actions'] !== undefined && obj['actions'] !== null) {
    if (!Array.isArray(obj['actions']) || obj['actions'].length > 4) return undefined
    actions = []
    for (const raw of obj['actions']) {
      const action = parseReportAction(raw)
      if (action === undefined) return undefined
      actions.push(action)
    }
  }
  const subtitle = optionalText(obj['subtitle'])
  return {
    v: DSH_PROTOCOL_VERSION,
    type: 'report',
    id,
    title,
    ...subtitle === undefined ? {} : { subtitle },
    metrics,
    ...rows === undefined ? {} : { rows },
    ...table === undefined ? {} : { table },
    ...actions === undefined ? {} : { actions },
  }
}

/** The minimal {collection,label,docId} reference of an approval_confirm doc. */
type ApprovalDocRefLite = { collection: string; label: string; docId: string }

/** The approval document reference validator ({collection,label,docId[,title]}). */
function approvalDocOf(value: unknown, requireTitle: boolean): ApprovalDocRef | ApprovalDocRefLite | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const doc = value as Record<string, unknown>
  const collection = requiredText(doc['collection'])
  const label = requiredText(doc['label'])
  const docId = coercedText(doc['docId'])
  if (collection === undefined || label === undefined || docId === undefined) return undefined
  if (requireTitle) {
    const title = requiredText(doc['title'])
    if (title === undefined) return undefined
    return { collection, label, docId, title }
  }
  return { collection, label, docId }
}

/** Validate one approval summary row (the receipt's summary shape). */
function approvalSummaryOf(value: unknown): ReadonlyArray<{ label: string; value: string; kind: ReceiptSummaryKind }> | undefined {
  if (!Array.isArray(value)) return undefined
  const rows: { label: string; value: string; kind: ReceiptSummaryKind }[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return undefined
    const row = raw as Record<string, unknown>
    const label = requiredText(row['label'])
    const cell = coercedText(row['value'])
    const kind = oneOf(row['kind'], ['money', 'date', 'id', 'count', 'text'] as const)
    if (label === undefined || cell === undefined || kind === undefined) return undefined
    rows.push({ label, value: cell, kind })
  }
  return rows.length === 0 ? undefined : rows
}

/** Validate an approval_pending fence body. */
function parseApprovalPending(obj: Record<string, unknown>): ApprovalPendingPayload | undefined {
  const id = coercedText(obj['id'])
  const doc = approvalDocOf(obj['doc'], true)
  if (id === undefined || doc === undefined) return undefined
  const summary = approvalSummaryOf(obj['summary'])
  if (summary === undefined) return undefined
  const applicant = optionalText(obj['applicant'])
  const node = optionalText(obj['node'])
  const attempt = optionalText(obj['attempt'])
  return {
    v: DSH_PROTOCOL_VERSION,
    type: 'approval_pending',
    id,
    doc: doc as ApprovalDocRef,
    ...applicant === undefined ? {} : { applicant },
    ...node === undefined ? {} : { node },
    ...attempt === undefined ? {} : { attempt },
    summary,
  }
}

/** Validate an approval_confirm fence body. */
function parseApprovalConfirm(obj: Record<string, unknown>): ApprovalConfirmPayload | undefined {
  const approvalId = requiredText(obj['approvalId'])
  const doc = approvalDocOf(obj['doc'], false)
  if (approvalId === undefined || doc === undefined) return undefined
  const action = oneOf(obj['action'], ['approve', 'reject'] as const)
  if (action === undefined) return undefined
  const comment = optionalText(obj['comment'])
  return { v: DSH_PROTOCOL_VERSION, type: 'approval_confirm', approvalId, doc, action, ...comment === undefined ? {} : { comment } }
}

/**
 * Normalize one Chinese state spelling onto the wire's English enum (the
 * model writes the state word bilingually; the closed set covers the six
 * doc_status states and the four supplier-admission states — anything else
 * still fails validation).
 */
function normalizeApprovalState(value: unknown): ApprovalResultPayload['state'] | undefined {
  if (typeof value !== 'string') return undefined
  const chinese: Readonly<Record<string, ApprovalResultPayload['state']>> = {
    草稿: 'draft', 待审批: 'pending', 二级审批中: 'pending_level2',
    已生效: 'approved', 已驳回: 'rejected', 已作废: 'void',
    潜在: 'potential', 准入评审中: 'reviewing', 合格: 'qualified',
  }
  return oneOf(value, ['draft', 'pending', 'pending_level2', 'approved', 'rejected', 'void', 'potential', 'reviewing', 'qualified'] as const)
    ?? chinese[value]
}

/** Validate an approval_result fence body. */
function parseApprovalResult(obj: Record<string, unknown>): ApprovalResultPayload | undefined {
  const approvalId = coercedText(obj['approvalId'])
  const doc = approvalDocOf(obj['doc'], true)
  if (approvalId === undefined || doc === undefined) return undefined
  const action = oneOf(obj['action'], ['approve', 'reject'] as const)
  const state = normalizeApprovalState(obj['state'])
  const by = requiredText(obj['by'])
  if (action === undefined || state === undefined || by === undefined) return undefined
  const comment = optionalText(obj['comment'])
  const at = optionalText(obj['at'])
  return {
    v: DSH_PROTOCOL_VERSION,
    type: 'approval_result',
    approvalId,
    doc: doc as ApprovalDocRef,
    action,
    state,
    by,
    ...comment === undefined ? {} : { comment },
    ...at === undefined ? {} : { at },
  }
}

/** Validate a submit_receipt fence body. */
function parseSubmitReceipt(obj: Record<string, unknown>): SubmitReceiptPayload | undefined {
  const draftId = coercedText(obj['draftId'])
  const form = formOf(obj['form'])
  const rowId = coercedText(obj['rowId'])
  if (draftId === undefined || form === undefined || rowId === undefined) return undefined
  if (!Array.isArray(obj['summary']) || obj['summary'].length === 0) return undefined
  const summary: { label: string; value: string; kind: ReceiptSummaryKind }[] = []
  for (const raw of obj['summary']) {
    if (typeof raw !== 'object' || raw === null) return undefined
    const row = raw as Record<string, unknown>
    const label = requiredText(row['label'])
    const value = coercedText(row['value'])
    const kind = oneOf(row['kind'], ['money', 'date', 'id', 'count', 'text'] as const)
    if (label === undefined || value === undefined || kind === undefined) return undefined
    summary.push({ label, value, kind })
  }
  return { v: DSH_PROTOCOL_VERSION, type: 'submit_receipt', draftId, form, rowId, summary }
}

/** Validate a plan_suggest fence body. */
function parsePlanSuggest(obj: Record<string, unknown>): PlanSuggestPayload | undefined {
  const id = coercedText(obj['id'])
  const suggestionId = coercedText(obj['suggestionId'])
  const planType = oneOf(obj['planType'], ['MO', 'PR'] as const)
  const product = requiredText(obj['product'])
  const qty = coercedText(obj['qty'])
  if (id === undefined || suggestionId === undefined || planType === undefined || product === undefined || qty === undefined) {
    return undefined
  }
  const suggestDate = optionalText(obj['suggestDate'])
  const driverSo = optionalText(obj['driverSo'])
  const needDate = optionalText(obj['needDate'])
  return {
    v: DSH_PROTOCOL_VERSION, type: 'plan_suggest', id, suggestionId, planType, product, qty,
    ...suggestDate === undefined ? {} : { suggestDate },
    ...driverSo === undefined ? {} : { driverSo },
    ...needDate === undefined ? {} : { needDate },
  }
}

/** Validate a plan_result fence body. */
function parsePlanResult(obj: Record<string, unknown>): PlanResultPayload | undefined {
  const planId = coercedText(obj['planId'])
  const suggestionId = coercedText(obj['suggestionId'])
  const planType = oneOf(obj['planType'], ['MO', 'PR'] as const)
  const product = requiredText(obj['product'])
  const outcome = oneOf(obj['outcome'], ['converted', 'dismissed'] as const)
  if (planId === undefined || suggestionId === undefined || planType === undefined || product === undefined || outcome === undefined) {
    return undefined
  }
  const docCode = optionalText(obj['docCode'])
  const state = optionalText(obj['state'])
  const by = optionalText(obj['by'])
  return {
    v: DSH_PROTOCOL_VERSION, type: 'plan_result', planId, suggestionId, planType, product, outcome,
    ...docCode === undefined ? {} : { docCode },
    ...state === undefined ? {} : { state },
    ...by === undefined ? {} : { by },
  }
}

/** Validate a plan_confirm fence body. */
function parsePlanConfirm(obj: Record<string, unknown>): PlanConfirmPayload | undefined {
  const planId = requiredText(obj['planId'])
  const suggestionId = requiredText(obj['suggestionId'])
  const action = oneOf(obj['action'], ['confirm', 'dismiss'] as const)
  const planType = oneOf(obj['planType'], ['MO', 'PR'] as const)
  const product = requiredText(obj['product'])
  if (planId === undefined || suggestionId === undefined || action === undefined || planType === undefined || product === undefined) {
    return undefined
  }
  return { v: DSH_PROTOCOL_VERSION, type: 'plan_confirm', planId, suggestionId, action, planType, product }
}

/**
 * Build the plan_confirm user message a plan card's button sends.
 * @param payload - the plan_suggest card's payload.
 * @param action - the user's chosen action.
 * @returns the serialized user message.
 */
export function buildPlanConfirmMessage(payload: PlanSuggestPayload, action: 'confirm' | 'dismiss'): PlanConfirmPayload {
  return {
    v: payload.v, type: 'plan_confirm', planId: payload.id, suggestionId: payload.suggestionId,
    action, planType: payload.planType, product: payload.product,
  }
}

/**
 * Parse one `dsh` fence body into its payload.
 * @param body - the fence's inner text (JSON, `//` comment lines tolerated).
 * @returns the validated payload, or undefined when the body is not one.
 */
export function parseDshPayload(body: string): DshPayload | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonComments(body))
  } catch {
    return undefined
  }
  return parseDshPayloadObject(parsed)
}

/**
 * Validate one already-parsed envelope object into its payload — the
 * args-level entry the `present_card` tool-call source rides (the model's
 * arguments arrive as a JSON object, not fence text). Shares the fence path's
 * validators verbatim; the fixture corpus in
 * packages/interaction/tool-present-card/tests/fixtures is the mirror source —
 * a protocol change on either side must update both in one PR.
 * @param value - the parsed candidate envelope.
 * @returns the validated payload, or undefined when the value is not one.
 */
export function parseDshPayloadObject(value: unknown): DshPayload | undefined {
  let candidate: unknown = value
  if (typeof candidate === 'string') {
    // A stringified payload is the double-serialization shape old-fence
    // contexts induce; mirror the server-side resolve step and parse first.
    try {
      candidate = JSON.parse(candidate)
    } catch {
      return undefined
    }
  }
  if (typeof candidate !== 'object' || candidate === null) return undefined
  const obj = candidate as Record<string, unknown>
  if (obj['v'] !== DSH_PROTOCOL_VERSION) return undefined
  switch (obj['type']) {
    case 'ask_choice': return parseAskChoice(obj)
    case 'ask_field': return parseAskField(obj)
    case 'form_draft': return parseFormDraftPayload(obj)
    case 'form_confirm': return parseFormConfirm(obj)
    case 'reject_flow': return parseRejectFlow(obj)
    case 'submit_receipt': return parseSubmitReceipt(obj)
    case 'report': return parseReport(obj)
    case 'approval_pending': return parseApprovalPending(obj)
    case 'approval_confirm': return parseApprovalConfirm(obj)
    case 'approval_result': return parseApprovalResult(obj)
    case 'plan_suggest': return parsePlanSuggest(obj)
    case 'plan_result': return parsePlanResult(obj)
    case 'plan_confirm': return parsePlanConfirm(obj)
    default: return undefined
  }
}

/**
 * Split one message into narrative runs, valid `dsh` fences, and degraded
 * fences, in source order. A `dsh` fence whose body fails validation becomes
 * a `degraded` segment carrying its original fenced text (protocol payloads
 * never render as ordinary narrative) and counts in `degraded`.
 * @param text - the full message text.
 * @returns the ordered segments plus the degraded-fence count.
 */
export function splitMessage(text: string): { segments: readonly MessageSegment[]; degraded: number } {
  const segments: MessageSegment[] = []
  let degraded = 0
  let last = 0
  let match: RegExpExecArray | null
  while ((match = DSH_FENCE.exec(text)) !== null) {
    const index = match.index
    const before = text.slice(last, index).trim()
    if (before !== '') segments.push({ kind: 'text', text: before })
    // The capture group is mandatory in the pattern, so the fallback arm
    // exists for the type, not a reachable miss.
    /* v8 ignore next -- the capture group always binds. */
    const payload = parseDshPayload(match[1] ?? '')
    if (payload === undefined) {
      degraded++
      segments.push({ kind: 'degraded', text: match[0] })
    } else {
      segments.push({ kind: 'dsh', payload })
    }
    last = index + match[0].length
  }
  const tail = text.slice(last).trim()
  if (tail !== '') segments.push({ kind: 'text', text: tail })
  return { segments, degraded }
}

/**
 * The user-visible text of one ask option's pick (send overrides label).
 * @param option - the picked ask_choice option.
 * @returns the text the pick sends as the user's own message.
 */
export function answerTextOf(option: AskChoiceOption): string {
  return option.send ?? option.label
}

/**
 * Serialize one form_confirm payload as the user message the card sends:
 * the human-readable 确认写入 plus the fence the fold replays from.
 * @param payload - the confirmed final fields.
 * @returns the message text.
 */
export function buildConfirmMessage(payload: FormConfirmPayload): string {
  const json = JSON.stringify({
    v: payload.v, type: payload.type, draftId: payload.draftId, revision: payload.revision,
    form: payload.form, fields: payload.fields,
  })
  return `确认写入\n\`\`\`dsh\n${json}\n\`\`\``
}

/**
 * Serialize one reject_flow payload as the user message the card sends.
 * @param payload - the reject anchor (reason optional).
 * @returns the message text.
 */
export function buildRejectMessage(payload: RejectFlowPayload): string {
  const json = JSON.stringify(payload)
  return `驳回\n\`\`\`dsh\n${json}\n\`\`\``
}

/**
 * Serialize one approval_confirm payload as the user message the approval
 * card sends: the human-readable 同意/驳回 plus the fence the fold replays.
 * @param payload - the approval action (comment optional).
 * @returns the message text.
 */
export function buildApprovalConfirmMessage(payload: ApprovalConfirmPayload): string {
  const json = JSON.stringify(payload)
  return `${payload.action === 'approve' ? '同意' : '驳回'}\n\`\`\`dsh\n${json}\n\`\`\``
}
