/**
 * The deterministic widget resolver (W22-R1): which on-screen control a draft
 * field renders is a mechanical fact of the field's name and label, so the
 * server rewrites the model-declared `widget` on the two widget-bearing
 * payload branches instead of trusting the model to pick correctly every
 * time. The resolver is deliberately fail-open — a name it cannot classify
 * keeps the declared widget — because only the quantity/price/amount and
 * date families are mechanically decidable; enum-style fields still need the
 * model to carry `options`, which no server table can invent.
 *
 * @module @deepseek-ai/dsh-tool-present-card/widget
 */

import type { PresentCardPayload } from './index.ts'

/** The widget enum every draft field and ask_field field declares. */
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

/** Chinese label fragments that force `number` (label 品名 like 合计金额). */
const NUMBER_LABEL_FRAGMENTS: readonly string[] = ['数量', '单价', '价格', '金额', '总额', '合计', '成本', '费用']

/** Chinese label fragments that force `date` (labels like 需求日期/交期). */
const DATE_LABEL_FRAGMENTS: readonly string[] = ['日期', '到期', '交期', '截止']

/**
 * Classify one field into the widget the card must render. Name evidence
 * outranks label evidence, both outrank the options heuristic, and an
 * unclassifiable field keeps whatever the model declared.
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
  if (NUMBER_LABEL_FRAGMENTS.some(fragment => label.includes(fragment))) return 'number'
  if (DATE_LABEL_FRAGMENTS.some(fragment => label.includes(fragment))) return 'date'
  if (hasNonEmptyOptions) return 'select'
  return undefined
}

/**
 * Rewrite the widget-bearing branches of a resolved payload with the
 * deterministic classification: `form_draft` fields (options count as select
 * evidence) and the lone `ask_field` field (suggestions are free-text hints,
 * never select candidates). Every other branch passes through untouched.
 * @param payload - the structurally validated, normalized payload.
 * @returns the payload with mechanically decidable widgets corrected.
 */
export function applyDeterministicWidgets(payload: PresentCardPayload): PresentCardPayload {
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
