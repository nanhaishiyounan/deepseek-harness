/**
 * The surface-owned v3 system-field guarantees (the N2/日期 contract), local
 * face: a derived 今天 date field carries the client's own calendar date, so
 * a re-confirmed historical card can never miss it. The registry system-
 * number preview (a NocoBase row read-back) is retired with the business
 * wire; generated numbers are gone and system fields keep their logged
 * values. No React imports.
 */

import type { FormDraftPayload, FormField } from './protocol.ts'

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

/** Whether one field is the derived 今天 date field. */
function isTodayField(field: FormField): boolean {
  return field.tier === 'derived' && field.widget === 'date' && (field.rationale?.includes('今天') ?? false)
}

/**
 * The local overrides the confirm contract still guarantees: an unedited
 * 今天 date field takes the client calendar date.
 * @param payload - the v3 draft payload.
 * @param now - the client clock.
 * @returns field name → the overridden value.
 */
function systemOverridesOf(
  payload: FormDraftPayload,
  now: number = Date.now(),
): Record<string, string> {
  const overrides: Record<string, string> = {}
  const today = todayOf(now)
  for (const field of payload.fields) {
    if (isTodayField(field) && field.value !== today) overrides[field.name] = today
  }
  return overrides
}

/**
 * The card's effective values: a cell the user edited keeps the edit; an
 * unedited 今天 date takes the client calendar date; everything else keeps
 * the payload value.
 * @param payload - the v3 draft payload.
 * @param edits - the card's stored edit values (seeded from the payload).
 * @param now - the client clock.
 * @returns field name → the value the card shows and the confirm sends.
 */
export function mergeCardValues(
  payload: FormDraftPayload,
  edits: Readonly<Record<string, string>>,
  now: number = Date.now(),
): Record<string, string> {
  const overrides = systemOverridesOf(payload, now)
  const values: Record<string, string> = {}
  for (const field of payload.fields) {
    const base = field.value ?? ''
    const edit = edits[field.name]
    const edited = edit !== undefined && edit !== base
    values[field.name] = edited ? edit : (overrides[field.name] ?? base)
  }
  return values
}
