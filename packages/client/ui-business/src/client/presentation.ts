/**
 * Pure presentation helpers for the business page: the entity card's main
 * label (title-ish fields first, then id-ish, then the row's first string)
 * and the key-value preview cut. No state, no IO.
 * @module @deepseek-ai/dsh-client-ui-business/client/presentation
 */

/** Field names whose value makes the best card label, in priority order. */
const LABEL_FIELDS = ['title', 'name', 'nickname', 'label', 'orderNo', 'username', 'email'] as const

/** Field names never shown as preview keys (internal bookkeeping). */
const HIDDEN_FIELDS = new Set(['createdAt', 'updatedAt', 'createdById', 'updatedById', 'sort', 'id'])

/**
 * The card's main label for one row: the first populated title-ish field,
 * else the row id, else the collection's display name with an ellipsis.
 * @param row - one business row.
 * @param collectionLabel - the collection's display fallback.
 * @returns the human-facing label.
 */
export function entityLabelOf(row: Record<string, unknown>, collectionLabel: string): string {
  for (const field of LABEL_FIELDS) {
    const value = row[field]
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  if (typeof row.id === 'number') return String(row.id)
  return `${collectionLabel}…`
}

/**
 * The card's preview key-value cut: the first populated, non-hidden fields.
 * @param row - one business row.
 * @param limit - maximum pairs returned.
 * @returns the preview pairs (field name → rendered value).
 */
export function entityPreviewOf(row: Record<string, unknown>, limit: number): ReadonlyArray<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (const [key, value] of Object.entries(row)) {
    if (HIDDEN_FIELDS.has(key) || pairs.length >= limit) continue
    const rendered = value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : undefined
    // Objects and arrays (relation fields, JSON cells) stay off the card:
    // the conversation answers "what is in there" better than a flattened
    // preview ever would.
    if (rendered === undefined || rendered.length === 0) continue
    pairs.push([key, rendered])
  }
  return pairs
}
