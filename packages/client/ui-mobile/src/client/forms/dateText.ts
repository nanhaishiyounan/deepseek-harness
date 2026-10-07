/**
 * The draft-card date vocabulary: parsing a draft's date string into the
 * DatePicker's Date and formatting a pick back into the wire's YYYY-MM-DD
 * text. Shared by the form-page FieldWidget and the v3 draft card so both
 * surfaces spell and read dates identically.
 */

/** Parse a draft's date string (YYYY-MM-DD or epoch) into a Date, or null. */
export function parseDateText(value: string): Date | null {
  if (value === '') return null
  const epoch = Number(value)
  if (Number.isFinite(epoch) && value.trim() !== '') {
    const fromEpoch = new Date(epoch)
    if (!Number.isNaN(fromEpoch.getTime())) return fromEpoch
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Format a Date back to the draft's YYYY-MM-DD string. */
export function formatDateText(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
}
