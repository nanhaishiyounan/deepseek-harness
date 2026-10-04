/**
 * The surface-owned v3 system-field guarantees (the N2/日期 contract): a
 * registry system number draws its PREVIEW before the confirm message leaves
 * the client — max-suffix+1 over the live rows read back number-descending
 * (W6-B1: the id-ascending first page read maxed out at 200 rows and drew
 * colliding previews; the number itself is now server-assigned at nb_create,
 * so this preview is display-only) — and a derived 今天 date field carries
 * the client's own calendar date, so the landing row can never miss it.
 * Numbers are cached per draft id: revisions of one draft keep one preview,
 * a fresh draft re-reads and takes the next. No React imports.
 */

import { FORM_REGISTRY } from './formRegistry.ts'
import type { FormDraftPayload, FormField } from './protocol.ts'
import { rpc } from './rpc.ts'

/** The generated-number shape one system field carries (PREFIX-YYYY-NNNN). */
export interface SystemNumberSpec {
  readonly collection: string
  readonly field: string
  readonly prefix: string
}

/** The rule text every registry system number writes (`按 PO-YYYY-NNNN 递增生成`). */
const NUMBER_RULE = /^按 ([A-Z]+)-YYYY-NNNN/

/**
 * The generation rule one collection's system field declares.
 * @param collection - the registry collection name.
 * @param field - the system field's name.
 * @returns the spec, or undefined when the registry marks no such generator.
 */
export function systemNumberSpecOf(collection: string, field: string): SystemNumberSpec | undefined {
  const entry = FORM_REGISTRY.find(candidate => candidate.collection === collection)
  const declared = entry?.system.find(candidate => candidate.name === field)
  if (declared === undefined) return undefined
  const prefix = NUMBER_RULE.exec(declared.rule)?.[1]
  /* v8 ignore next -- every registry system rule carries the PREFIX-YYYY-NNNN shape. */
  return prefix === undefined ? undefined : { collection, field, prefix }
}

/**
 * The client's local calendar date in ISO `YYYY-MM-DD` form.
 * @param now - the client clock (default now).
 * @returns the calendar date of the user's day.
 */
export function todayOf(now: number = Date.now()): string {
  const date = new Date(now)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** The time-derived fallback suffix (minutes of the client day, 4 digits). */
function clockSuffix(now: number): string {
  const date = new Date(now)
  return String(date.getHours() * 60 + date.getMinutes()).padStart(4, '0')
}

/** One landed row's field value read structurally (the list wire is untyped rows). */
function rowValueOf(row: unknown, field: string): unknown {
  if (typeof row !== 'object' || row === null) return undefined
  return (row as Record<string, unknown>)[field]
}

/**
 * Derive the next number for one spec over the rows already landed.
 * @param rows - the collection's rows (any order).
 * @param spec - the generator spec.
 * @param now - the client clock (year and fallback suffix).
 * @returns `PREFIX-YYYY-NNNN` — max same-year suffix +1, `0001` when none,
 * and the clock suffix once the numeric space is exhausted.
 */
export function deriveNextNumber(
  rows: readonly unknown[],
  spec: SystemNumberSpec,
  now: number = Date.now(),
): string {
  const year = new Date(now).getFullYear()
  const pattern = new RegExp(`^${spec.prefix}-${String(year)}-(\\d{4})$`)
  let max = 0
  for (const row of rows) {
    const value = rowValueOf(row, spec.field)
    if (typeof value !== 'string') continue
    const suffix = Number(pattern.exec(value)?.[1])
    if (Number.isInteger(suffix) && suffix > max) max = suffix
  }
  const next = max + 1
  return `${spec.prefix}-${String(year)}-${next > 9999 ? clockSuffix(now) : String(next).padStart(4, '0')}`
}

/** Generated numbers already handed out, keyed by draft id (revisions reuse theirs). */
const issuedNumbers = new Map<string, Record<string, string>>()

/**
 * The preview number one draft's blank system field shows (W6-B1: display
 * only — nb_create assigns the landing number server-side, so two clients
 * drafting the same form can share a preview without ever colliding on the
 * row).
 * @param draftId - the owning draft (one preview per draft, revisions included).
 * @param collection - the registry collection name.
 * @param field - the system field's name.
 * @param now - the client clock (fallback derivation).
 * @returns the preview number, resolved from the cache when this draft
 * already drew one.
 */
export async function nextSystemNumber(
  draftId: string,
  collection: string,
  field: string,
  now: number = Date.now(),
): Promise<string> {
  const cached = issuedNumbers.get(draftId)?.[field]
  if (cached !== undefined) return cached
  const spec = systemNumberSpecOf(collection, field)
  if (spec === undefined) return ''
  let number: string
  try {
    const page = await rpc('nocobase.list', {
      collection,
      page: 1,
      page_size: 50,
      sort: [`-${spec.field}`],
      fields: [spec.field],
    })
    number = deriveNextNumber(page.rows, spec, now)
  } catch {
    // The read-back is best effort; the clock suffix still shows a unique,
    // format-true preview — the field never renders blank.
    number = `${spec.prefix}-${String(new Date(now).getFullYear())}-${clockSuffix(now)}`
  }
  issuedNumbers.set(draftId, { ...(issuedNumbers.get(draftId) ?? {}), [field]: number })
  return number
}

/** A derived date field the registry rule pins to 今天 (its rationale says so). */
function isTodayField(field: FormField): boolean {
  return field.tier === 'derived' && field.widget === 'date' && (field.rationale?.includes('今天') ?? false)
}

/**
 * The client-calendar values one draft's system-tier blanks and 今天-derived
 * dates carry into both the card display and the confirm message.
 * @param payload - the v3 draft payload.
 * @param values - the generated system numbers keyed by field name.
 * @param now - the client clock.
 * @returns the field-name → value overrides (user edits still win upstream).
 */
export function systemOverridesOf(
  payload: FormDraftPayload,
  values: Readonly<Record<string, string>>,
  now: number = Date.now(),
): Record<string, string> {
  const overrides: Record<string, string> = {}
  const today = todayOf(now)
  for (const field of payload.fields) {
    if (field.tier === 'system' && (field.value === null || field.value.trim() === '')) {
      const generated = values[field.name]
      if (generated !== undefined && generated !== '') overrides[field.name] = generated
    }
    if (isTodayField(field) && field.value !== today) overrides[field.name] = today
  }
  return overrides
}

/**
 * The card's effective values: a cell the user edited keeps the edit; an
 * unedited system blank takes its generated number; an unedited 今天 date
 * takes the client calendar date; everything else keeps the payload value.
 * @param payload - the v3 draft payload.
 * @param edits - the card's stored edit values (seeded from the payload).
 * @param generated - the draft's generated system numbers keyed by field.
 * @param now - the client clock.
 * @returns field name → the value the card shows and the confirm sends.
 */
export function mergeCardValues(
  payload: FormDraftPayload,
  edits: Readonly<Record<string, string>>,
  generated: Readonly<Record<string, string>>,
  now: number = Date.now(),
): Record<string, string> {
  const overrides = systemOverridesOf(payload, generated, now)
  const values: Record<string, string> = {}
  for (const field of payload.fields) {
    const base = field.value ?? ''
    const edit = edits[field.name]
    const edited = edit !== undefined && edit !== base
    values[field.name] = edited ? edit : (overrides[field.name] ?? base)
  }
  return values
}
