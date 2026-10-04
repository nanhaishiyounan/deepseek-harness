/**
 * The v3 确认写入 payload builder (split from ChatView, W8-B2; the field
 * fold order is unchanged): user edits folded over the draft's payload
 * fields, missing values falling back to the payload's own (or empty).
 */

import type { FormConfirmPayload, FormDraftPayload } from '../../protocol.ts'

/**
 * Build the confirm payload a v3 card's 确认写入 sends.
 * @param payload - the draft payload being confirmed.
 * @param values - the card's merged state (edits over generated numbers).
 * @returns the fenced form_confirm payload.
 */
export function confirmPayloadOf(
  payload: FormDraftPayload,
  values: Readonly<Record<string, string>>,
): FormConfirmPayload {
  return {
    v: 3,
    type: 'form_confirm',
    draftId: payload.draftId,
    revision: payload.revision,
    form: payload.form,
    fields: payload.fields.map(field => ({
      name: field.name,
      label: field.label,
      /* v8 ignore next -- mergeCardValues seeds every payload field; the arm satisfies the unchecked-index type. */
      value: values[field.name] ?? (field.value ?? ''),
    })),
  }
}
