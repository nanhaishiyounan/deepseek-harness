/**
 * The read-only SQL guard for model-facing lakehouse queries: one
 * single-statement read (`SELECT`, `WITH … SELECT`, `PRAGMA`, `DESCRIBE`)
 * passes; everything else — DML, DDL, `ATTACH`/`INSTALL`/`COPY`, `SET`,
 * multi-statement text, and `SELECT … INTO` — is rejected with a structured
 * error before the statement ever reaches DuckDB. String literals and
 * comments are stripped before the checks, so payload text can never mask a
 * second statement or an `INTO` clause.
 * @module @deepseek-ai/dsh-lakehouse-engine/sql-guard
 */

/** Error code carried by {@link SqlGuardError}. */
export type SqlGuardCode =
  | 'LAKEHOUSE_SQL_EMPTY'
  | 'LAKEHOUSE_SQL_MULTI_STATEMENT'
  | 'LAKEHOUSE_SQL_NOT_READONLY'

/** Structured rejection raised by {@link assertReadOnlySql}. */
export class SqlGuardError extends Error {
  readonly code: SqlGuardCode

  /**
   * @param message - operator-facing reason.
   * @param code - the structured rejection code.
   */
  constructor(message: string, code: SqlGuardCode) {
    super(message)
    this.name = 'SqlGuardError'
    this.code = code
  }
}

/** Statement openers the read-only surface accepts. */
const READONLY_OPENERS = /^(?:SELECT|WITH|PRAGMA|DESCRIBE)\b/iu

/**
 * Blank SQL text is rejected as `LAKEHOUSE_SQL_EMPTY`.
 * @param sql - the statement text to check.
 * @throws {@link SqlGuardError} when the text is blank.
 */
export function assertNonBlank(sql: string): void {
  if (sql.trim().length === 0) {
    throw new SqlGuardError('the SQL text is blank', 'LAKEHOUSE_SQL_EMPTY')
  }
}

/**
 * Strip `--` line comments, `/* … *`/` block comments, and single- and
 * double-quoted string literals, replacing each with a space. The guard only
 * inspects statement structure, never literal contents.
 * @param sql - raw statement text.
 * @returns the same statement with masked literals and comments.
 */
function stripLiteralsAndComments(sql: string): string {
  let out = ''
  let index = 0
  while (index < sql.length) {
    const char = sql[index]
    const next = sql[index + 1]
    if (char === '-' && next === '-') {
      const end = sql.indexOf('\n', index)
      index = end === -1 ? sql.length : end
      out += ' '
    } else if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2)
      index = end === -1 ? sql.length : end + 2
      out += ' '
    } else if (char === "'" || char === '"') {
      // Quoted text: double the quote character to close (SQL escaping).
      let cursor = index + 1
      let closed = false
      while (cursor < sql.length) {
        if (sql[cursor] === char) {
          if (sql[cursor + 1] === char) {
            cursor += 2
            continue
          }
          closed = true
          break
        }
        cursor += 1
      }
      out += char === "'" ? "' '" : '" "'
      index = closed ? cursor + 1 : sql.length
    } else {
      out += char
      index += 1
    }
  }
  return out
}

/**
 * The guard's verdict for one statement text.
 */
export interface SqlGuardVerdict {
  /** True when the statement may run on the read-only surface. */
  readonly allowed: boolean
  /** The structured rejection code, set when `allowed` is false. */
  readonly code: SqlGuardCode | undefined
}

/**
 * Decide whether one SQL text is a single read-only statement. Pure and
 * side-effect free: consumers call this before touching the engine.
 * @param sql - the raw statement text.
 * @returns the verdict with a rejection code on refusal.
 */
export function readOnlyVerdict(sql: string): SqlGuardVerdict {
  const stripped = stripLiteralsAndComments(sql).trim()
  if (stripped.length === 0) {
    return { allowed: false, code: 'LAKEHOUSE_SQL_EMPTY' }
  }
  // One trailing statement separator is idiomatic; any earlier semicolon
  // means a second statement (or a payload smuggled after one).
  const withoutTrailing = stripped.replace(/;\s*$/u, '')
  if (withoutTrailing.includes(';')) {
    return { allowed: false, code: 'LAKEHOUSE_SQL_MULTI_STATEMENT' }
  }
  if (!READONLY_OPENERS.test(withoutTrailing)) {
    return { allowed: false, code: 'LAKEHOUSE_SQL_NOT_READONLY' }
  }
  // `SELECT … INTO` writes a table; `PRAGMA x = y` assigns a setting. Both
  // stay out of the read-only surface even though the opener is allowed.
  if (/\bINTO\b/iu.test(withoutTrailing)) {
    return { allowed: false, code: 'LAKEHOUSE_SQL_NOT_READONLY' }
  }
  if (/^PRAGMA\b[^=]*=/iu.test(withoutTrailing)) {
    return { allowed: false, code: 'LAKEHOUSE_SQL_NOT_READONLY' }
  }
  return { allowed: true, code: undefined }
}

/**
 * Assert that one SQL text is a single read-only statement.
 * @param sql - the raw statement text.
 * @throws {@link SqlGuardError} with the matching code on refusal.
 */
export function assertReadOnlySql(sql: string): void {
  const verdict = readOnlyVerdict(sql)
  if (verdict.allowed) return
  const opener = sql.trim().slice(0, 40)
  // A refused verdict always carries its code; the fallback only narrows the type.
  const code = verdict.code ?? 'LAKEHOUSE_SQL_NOT_READONLY'
  throw new SqlGuardError(
    code === 'LAKEHOUSE_SQL_EMPTY'
      ? 'the SQL text is blank'
      : code === 'LAKEHOUSE_SQL_MULTI_STATEMENT'
        ? 'multiple SQL statements are not allowed; submit exactly one read statement'
        : `the statement is not read-only (starts with "${opener}"); only SELECT, WITH … SELECT, PRAGMA, and DESCRIBE are accepted`,
    code,
  )
}
