/**
 * The restricted filter vocabulary every NocoBase consumer (the nb_* tools,
 * the apiproxy nocobase domain) accepts: a flat list of field conditions
 * (eq/in/gt/lt/includes) joined by one top-level and/or, compiled onto the
 * NocoBase filter tree. `includes` maps to NocoBase `$includes` (substring
 * fuzzy match) — the vocabulary's only containment-semantics operator.
 * Arbitrary operator trees never cross a consumer boundary — callers name
 * fields and operands, never raw `$operators` beyond these five.
 * @module @deepseek-ai/dsh-connector-nocobase/filter
 */

/** The closed comparison-operator set the restricted vocabulary accepts. */
export type NbFilterOp = 'eq' | 'in' | 'gt' | 'lt' | 'includes'

/** One field condition in the restricted vocabulary. */
export interface NbFilterCondition {
  readonly field: string
  readonly op: NbFilterOp
  /** Scalar for eq/gt/lt/includes; non-empty array for in. */
  readonly value: string | number | boolean | readonly (string | number | boolean)[]
}

/** Raw condition shape as consumers receive it from JSON boundaries (the operand is unvalidated until parsed). */
export interface NbFilterConditionInput {
  readonly field: string
  readonly op: NbFilterOp
  readonly value: unknown
}

/** How multiple conditions join: all-of (default) or any-of. */
export type NbFilterMatch = 'and' | 'or'

/** Wire operand of one operator inside the NocoBase filter tree. */
const OPERATOR_KEYS: Readonly<Record<NbFilterOp, string>> = {
  eq: '$eq',
  in: '$in',
  gt: '$gt',
  lt: '$lt',
  includes: '$includes',
}

/**
 * Validate and narrow one raw condition object from consumer input.
 * @param condition - the schema-validated condition.
 * @returns the canonical condition, or an error string naming the refusal.
 */
export function parseNbFilterCondition(
  condition: NbFilterConditionInput,
): { ok: true; value: NbFilterCondition } | { ok: false; error: string } {
  const field = condition.field.trim()
  if (field.length === 0) return { ok: false, error: 'filter condition field must be a non-empty field name' }
  if (condition.op === 'in') {
    if (!Array.isArray(condition.value) || condition.value.length === 0) {
      return { ok: false, error: `filter on ${field}: op "in" needs a non-empty array value` }
    }
    for (const item of condition.value) {
      if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') {
        return { ok: false, error: `filter on ${field}: op "in" items must be strings, numbers, or booleans` }
      }
    }
    return { ok: true, value: { field, op: condition.op, value: condition.value as readonly (string | number | boolean)[] } }
  }
  if (Array.isArray(condition.value)) {
    return { ok: false, error: `filter on ${field}: op "${condition.op}" needs a scalar value, not an array` }
  }
  if (typeof condition.value !== 'string' && typeof condition.value !== 'number' && typeof condition.value !== 'boolean') {
    return { ok: false, error: `filter on ${field}: op "${condition.op}" needs a string, number, or boolean value` }
  }
  return { ok: true, value: { field, op: condition.op, value: condition.value } }
}

/**
 * Compile the restricted conditions onto one NocoBase filter tree: `and`
 * merges every condition into the top-level object (same-field conditions
 * merge into one operator cell); `or` wraps each condition in one `$or`
 * clause.
 * @param conditions - validated conditions; an empty list compiles to an empty tree.
 * @param match - the join mode, `and` by default.
 * @returns the NocoBase filter tree for the list call's `filter` parameter.
 */
export function compileNbFilter(conditions: readonly NbFilterCondition[], match: NbFilterMatch = 'and'): Record<string, unknown> {
  if (conditions.length === 0) return {}
  if (match === 'or') {
    return { $or: conditions.map(condition => ({ [condition.field]: { [OPERATOR_KEYS[condition.op]]: condition.value } })) }
  }
  const tree: Record<string, unknown> = {}
  for (const condition of conditions) {
    const key = OPERATOR_KEYS[condition.op]
    const cell = tree[condition.field]
    tree[condition.field] = typeof cell === 'object' && cell !== null && !Array.isArray(cell)
      ? { ...(cell as Record<string, unknown>), [key]: condition.value }
      : { [key]: condition.value }
  }
  return tree
}

/**
 * Describe one raw condition as human-facing text (the preview line a diff
 * confirmation shows); the operand prints as-is before any validation.
 * @param condition - a condition as it arrived from a JSON boundary.
 * @returns the display line.
 */
export function describeNbFilterCondition(condition: NbFilterConditionInput): string {
  const value = Array.isArray(condition.value) ? `[${condition.value.join(', ')}]` : String(condition.value)
  return `${condition.field} ${condition.op} ${value}`
}
