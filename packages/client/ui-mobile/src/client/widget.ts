/**
 * The deterministic widget resolver, mirrored from the server's
 * `@deepseek-ai/dsh-tool-present-card` src/widget.ts (W22-R2): the render fold
 * applies the same classification the server's resolve step applies, so a
 * model-declared `text` on `quantity` renders the number keypad regardless of
 * which channel carried the payload. The mirror exists because the client
 * bundle purity gate forbids cross-plugin value imports (an interaction
 * package is not an inline-safe wire layer), the same reason the payload
 * validators in protocol.ts are a mirror pair — any rule change here ships in
 * the same PR as the server's widget.ts and the shared fixtures, with the
 * same-name tables kept token-identical.
 *
 * The rewrite is render-only: the session log and the model's context keep
 * the declared widget (model-visible ⟺ logged), the card renders the
 * mechanically decidable one, and locked/read-only fields render their value
 * line either way.
 */

import type { DshPayload } from './protocol.ts'

/** The widget kinds a protocol field can ask the surface to render. */
export type WidgetKind = 'text' | 'number' | 'date' | 'select' | 'relation'

/**
 * Quantity/money field names that force `number`, lowercased before matching.
 * Registry-driven names beyond the suffix families (defect counts, scrap)
 * live here because their names carry no `_qty`/`_price`/`_amount`/`_cost`
 * suffix.
 */
const NUMBER_FIELD_NAMES: ReadonlySet<string> = new Set([
  'quantity', 'qty', 'amount', 'unit_price', 'price', 'total', 'total_est', 'std_cost',
  'estimated_cost', 'unit_cost', 'cost', 'forecast_qty', 'lot_qty', 'sample_qty', 'qty_scrap',
  'defect_critical', 'defect_major', 'defect_minor', 'payment_amount',
])

/** Name suffixes that force `number` (`forecast_qty`, `unit_price`, …). */
const NUMBER_NAME_SUFFIXES: readonly string[] = ['_qty', '_price', '_amount', '_cost']

/** Date field names that force `date`, lowercased before matching. */
const DATE_FIELD_NAMES: ReadonlySet<string> = new Set([
  'date', 'need_date', 'due_date', 'deadline', 'delivery_date', 'expiry_date', 'expire_date',
  'inbound_date', 'outbound_date', 'payment_date', 'issue_date', 'report_date', 'inspected_at',
  'received_at', 'released_at',
])

/** Name suffixes that force `date` (`need_date`, `received_at`, …). */
const DATE_NAME_SUFFIXES: readonly string[] = ['_date', '_at']

/**
 * Free-text field names that pin the declared widget (W22-R2): their labels
 * routinely quote money words in prose (客户备注（含单价上限）), so no label
 * fragment may reclassify them.
 */
const TEXT_FIELD_NAMES: ReadonlySet<string> = new Set([
  'note', 'notes', 'remark', 'remarks', 'comment', 'comments', 'description', 'memo',
])

/** Name suffixes that pin the declared widget (`customer_note`, `po_remark`, …). */
const TEXT_NAME_SUFFIXES: readonly string[] = ['_note', '_notes', '_remark', '_remarks', '_comment', '_comments', '_desc', '_memo']

/** Chinese label fragments that force `number` (label 品名 like 合计金额). */
const NUMBER_LABEL_FRAGMENTS: readonly string[] = ['数量', '单价', '价格', '金额', '总额', '合计', '成本', '费用']

/** Chinese label fragments that force `date` (labels like 需求日期/交期). */
const DATE_LABEL_FRAGMENTS: readonly string[] = ['日期', '到期', '交期', '截止']

/**
 * Free-text label words that pin the declared widget (W22-R2): a label whose
 * token is exactly one of these is a notes field no matter what the parenthetical
 * adds (备注：单价历史).
 */
const TEXT_LABEL_WORDS: ReadonlySet<string> = new Set(['备注', '说明', '描述', '摘要'])

/**
 * Split a label into its display tokens: CJK words and latin/digit runs
 * separated by brackets, punctuation, whitespace, and slashes. A fragment
 * matches when it equals a token or is the token's trailing head word
 * (入库数量/合计金额 end with 数量/金额), so parentheticals and connector-led
 * prose (含单价) stay inert.
 */
const LABEL_TOKEN_SEPARATOR = /[\s()（）[\]【】《》,，、;；:：.。/\\\-—_|a-zA-Z0-9]+/u

/** Connector prefixes that mark a token as prose, not a head word (含单价). */
const PROSE_TOKEN_PREFIXES: readonly string[] = ['含', '或', '及', '与', '和', '见']

/** Whether one label token carries the fragment as its head word. */
function tokenCarriesFragment(token: string, fragment: string): boolean {
  if (!token.endsWith(fragment)) return false
  // A bare connector glued to the fragment is prose quoting the word, not
  // the word itself: 含单价 mentions 单价 instead of naming a money field.
  return !PROSE_TOKEN_PREFIXES.some(prefix => token === `${prefix}${fragment}`)
}

/** Whether any label token carries the fragment. */
function labelCarriesFragment(label: string, fragment: string): boolean {
  return label
    .split(LABEL_TOKEN_SEPARATOR)
    .some(token => token !== '' && tokenCarriesFragment(token, fragment))
}

/**
 * Classify one field into the widget the card must render. Name evidence
 * outranks label evidence, free-text signals (name families and label words)
 * pin the declared widget before money/date label fragments can fire, both
 * outrank the options heuristic, and an unclassifiable field keeps whatever
 * the model declared.
 * @param name - the field's column name (`quantity`, `need_date`, …).
 * @param label - the user-facing Chinese label (合计金额, 入库数量（箱）…).
 * @param hasNonEmptyOptions - whether the field carries candidate options;
 * select is only forced when the candidates already exist.
 * @returns the mechanically decidable widget, or undefined to keep the
 * declared one.
 */
export function inferWidgetKind(name: string, label: string, hasNonEmptyOptions: boolean): WidgetKind | undefined {
  const normalized = name.trim().toLowerCase()
  if (NUMBER_FIELD_NAMES.has(normalized) || NUMBER_NAME_SUFFIXES.some(suffix => normalized.endsWith(suffix))) {
    return 'number'
  }
  if (DATE_FIELD_NAMES.has(normalized) || DATE_NAME_SUFFIXES.some(suffix => normalized.endsWith(suffix))) {
    return 'date'
  }
  // Free-text names keep the declared widget before any label evidence fires:
  // their labels quote money/date words in prose as a matter of course.
  if (TEXT_FIELD_NAMES.has(normalized) || TEXT_NAME_SUFFIXES.some(suffix => normalized.endsWith(suffix))) {
    return undefined
  }
  const tokens = label.split(LABEL_TOKEN_SEPARATOR).filter(token => token !== '')
  if (tokens.some(token => TEXT_LABEL_WORDS.has(token))) return undefined
  if (NUMBER_LABEL_FRAGMENTS.some(fragment => labelCarriesFragment(label, fragment))) return 'number'
  if (DATE_LABEL_FRAGMENTS.some(fragment => labelCarriesFragment(label, fragment))) return 'date'
  if (hasNonEmptyOptions) return 'select'
  return undefined
}

/**
 * Rewrite the widget-bearing branches of a validated payload with the
 * deterministic classification, the render-side twin of the server's resolve
 * step: `form_draft` fields (options count as select evidence) and the lone
 * `ask_field` field (suggestions are free-text hints, never select
 * candidates). Every other branch passes through untouched.
 * @param payload - the validated protocol payload.
 * @returns the payload with mechanically decidable widgets corrected.
 */
export function applyDeterministicWidgets(payload: DshPayload): DshPayload {
  switch (payload.type) {
    case 'form_draft':
      return {
        ...payload,
        fields: payload.fields.map((field) => {
          const inferred = inferWidgetKind(field.name, field.label, (field.options?.length ?? 0) > 0)
          return inferred === undefined || inferred === field.widget ? field : { ...field, widget: inferred }
        }),
      }
    case 'ask_field': {
      const { field } = payload
      const inferred = inferWidgetKind(field.name, field.label, false)
      return inferred === undefined || inferred === field.widget
        ? payload
        : { ...payload, field: { ...field, widget: inferred } }
    }
    default:
      return payload
  }
}
