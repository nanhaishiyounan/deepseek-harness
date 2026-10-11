/**
 * Quality-rule evaluation: every rule compiles to one read-only SQL statement
 * against the lakehouse engine and a numeric verdict the threshold compares
 * against. Rules that cannot run (missing table/column, guard refusal) come
 * back as failures with the error text — never silently skipped.
 * @module @deepseek-ai/dsh-governance-engine/quality
 */

import type { QualityRule, QualityRuleOutcome } from '@deepseek-ai/dsh-governance'

/** Identifier guard: quality tables and columns are plain SQL identifiers. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u

/** The engine query surface the evaluator reads. */
export interface QualityQueryEngine {
  /** Run one read-only SQL statement; first row's first cell is the verdict. */
  query(sql: string): Promise<{ rows: (null | boolean | number | string)[][] }>
}

/** Validate one rule's fields for its kind before storage or evaluation. */
export function validateRule(rule: QualityRule): string | undefined {
  const parts = rule.table.split('.')
  if (parts.length !== 3 || parts.some(part => !IDENTIFIER.test(part))) {
    return `table must be lake.<schema>.<table> with plain identifiers, got "${rule.table}"`
  }
  switch (rule.kind) {
    case 'row_count_threshold':
      return rule.threshold === undefined ? 'row_count_threshold requires threshold' : undefined
    case 'null_rate':
    case 'uniqueness':
      if (rule.column === undefined || !IDENTIFIER.test(rule.column)) return `${rule.kind} requires a plain column name`
      if (rule.threshold === undefined) return `${rule.kind} requires threshold`
      return undefined
    case 'freshness':
      if (rule.column === undefined || !IDENTIFIER.test(rule.column)) return 'freshness requires a plain column name'
      if (rule.threshold === undefined) return 'freshness requires threshold (max age in hours)'
      return undefined
    case 'custom_sql':
      return rule.sql === undefined || rule.sql.trim() === '' ? 'custom_sql requires sql' : undefined
    default:
      return `unsupported rule kind "${String(rule.kind)}"`
  }
}

/** Compile one rule into its verdict SQL (first cell of the first row). */
export function ruleSql(rule: QualityRule): string {
  const table = rule.table
  switch (rule.kind) {
    case 'row_count_threshold':
      return `SELECT count(*) FROM ${table}`
    case 'null_rate': {
      const column = rule.column as string
      return `SELECT CASE WHEN count(*) = 0 THEN 0.0 ELSE avg(CASE WHEN ${column} IS NULL THEN 1.0 ELSE 0.0 END) END FROM ${table}`
    }
    case 'uniqueness': {
      const column = rule.column as string
      return `SELECT count(*) - count(DISTINCT ${column}) FROM ${table}`
    }
    case 'freshness': {
      const column = rule.column as string
      return `SELECT CASE WHEN count(${column}) = 0 THEN NULL ELSE date_diff('hour', max(${column}), now()) END FROM ${table}`
    }
    case 'custom_sql':
      return rule.sql as string
    default:
      throw new Error(`unsupported rule kind "${String(rule.kind)}"`)
  }
}

/**
 * Evaluate one rule against the engine.
 * @param rule - the configured rule.
 * @param engine - the lakehouse engine's read surface.
 * @returns the rule's outcome.
 */
export async function evaluateRule(rule: QualityRule, engine: QualityQueryEngine): Promise<QualityRuleOutcome> {
  try {
    const outcome = await engine.query(ruleSql(rule))
    const measured = outcome.rows[0]?.[0]
    const numeric = typeof measured === 'number' ? measured : null
    switch (rule.kind) {
      case 'row_count_threshold':
        if (numeric === null) throw new Error('verdict is not numeric')
        return { rule, status: numeric >= (rule.threshold as number) ? 'pass' : 'fail', measured: numeric }
      case 'uniqueness':
      case 'null_rate':
        // duplicates and null-rate are both lower-is-better verdicts
        if (numeric === null) throw new Error('verdict is not numeric')
        return { rule, status: numeric <= (rule.threshold as number) ? 'pass' : 'fail', measured: numeric }
      case 'freshness':
        if (numeric === null) return { rule, status: 'fail', measured: null, error: 'no rows / no timestamps' }
        return { rule, status: numeric <= (rule.threshold as number) ? 'pass' : 'fail', measured: numeric }
      case 'custom_sql':
        // passing = at least one row came back
        return { rule, status: outcome.rows.length > 0 ? 'pass' : 'fail', measured: outcome.rows.length }
      default:
        throw new Error(`unsupported rule kind "${String(rule.kind)}"`)
    }
  } catch (error: unknown) {
    return { rule, status: 'fail', measured: null, error: String(error).slice(0, 220) }
  }
}
