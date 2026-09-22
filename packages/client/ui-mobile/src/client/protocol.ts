/**
 * The v3 structured message protocol: the `dsh` fenced payloads that ride
 * assistant messages (ask_choice / ask_field / form_draft / submit_receipt)
 * and user action messages (form_confirm / reject_flow). This module owns the
 * wire shapes' validation and the narrative/fence splitting every fold
 * consumer rides; an invalid or unknown fence degrades to ordinary text
 * instead of breaking the chat flow. No React imports.
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

/** Every wire payload a `dsh` fence can carry. */
export type DshPayload =
  | AskChoicePayload
  | AskFieldPayload
  | FormDraftPayload
  | FormConfirmPayload
  | RejectFlowPayload
  | SubmitReceiptPayload

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
  const id = requiredText(obj['id'])
  const question = requiredText(obj['question'])
  if (id === undefined || question === undefined) return undefined
  if (!Array.isArray(obj['options']) || obj['options'].length === 0) return undefined
  const options: AskChoiceOption[] = []
  for (const raw of obj['options']) {
    if (typeof raw !== 'object' || raw === null) return undefined
    const option = raw as Record<string, unknown>
    const label = requiredText(option['label'])
    const value = requiredText(option['value'])
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
  const id = requiredText(obj['id'])
  const question = requiredText(obj['question'])
  const rawField = obj['field']
  if (id === undefined || question === undefined) return undefined
  if (typeof rawField !== 'object' || rawField === null) return undefined
  const field = rawField as Record<string, unknown>
  const name = requiredText(field['name'])
  const label = requiredText(field['label'])
  const widget = oneOf(field['widget'], ['text', 'number', 'date', 'select', 'relation'] as const)
  if (name === undefined || label === undefined || widget === undefined) return undefined
  const suggestions: AskFieldSuggestion[] = []
  if (Array.isArray(field['suggestions'])) {
    for (const raw of field['suggestions']) {
      if (typeof raw !== 'object' || raw === null) return undefined
      const suggestion = raw as Record<string, unknown>
      const sLabel = requiredText(suggestion['label'])
      const sValue = requiredText(suggestion['value'])
      if (sLabel === undefined || sValue === undefined) return undefined
      const hint = optionalText(suggestion['hint'])
      suggestions.push({ label: sLabel, value: sValue, ...hint === undefined ? {} : { hint } })
    }
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
  if (typeof row['value'] !== 'string') return undefined
  return { name, label, value: row['value'] }
}

/** Validate a form_draft fence body. */
function parseFormDraftPayload(obj: Record<string, unknown>): FormDraftPayload | undefined {
  const draftId = requiredText(obj['draftId'])
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
    const optionValue = requiredText(option['value'])
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

/** Validate a submit_receipt fence body. */
function parseSubmitReceipt(obj: Record<string, unknown>): SubmitReceiptPayload | undefined {
  const draftId = requiredText(obj['draftId'])
  const form = formOf(obj['form'])
  const rowId = requiredText(obj['rowId'])
  if (draftId === undefined || form === undefined || rowId === undefined) return undefined
  if (!Array.isArray(obj['summary']) || obj['summary'].length === 0) return undefined
  const summary: { label: string; value: string; kind: ReceiptSummaryKind }[] = []
  for (const raw of obj['summary']) {
    if (typeof raw !== 'object' || raw === null) return undefined
    const row = raw as Record<string, unknown>
    const label = requiredText(row['label'])
    const value = requiredText(row['value'])
    const kind = oneOf(row['kind'], ['money', 'date', 'id', 'count', 'text'] as const)
    if (label === undefined || value === undefined || kind === undefined) return undefined
    summary.push({ label, value, kind })
  }
  return { v: DSH_PROTOCOL_VERSION, type: 'submit_receipt', draftId, form, rowId, summary }
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
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const obj = parsed as Record<string, unknown>
  if (obj['v'] !== DSH_PROTOCOL_VERSION) return undefined
  switch (obj['type']) {
    case 'ask_choice': return parseAskChoice(obj)
    case 'ask_field': return parseAskField(obj)
    case 'form_draft': return parseFormDraftPayload(obj)
    case 'form_confirm': return parseFormConfirm(obj)
    case 'reject_flow': return parseRejectFlow(obj)
    case 'submit_receipt': return parseSubmitReceipt(obj)
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
