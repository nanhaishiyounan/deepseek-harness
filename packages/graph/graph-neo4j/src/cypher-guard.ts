/**
 * The read-only Cypher guard for model-facing graph queries: one
 * single-clause read (`MATCH`/`OPTIONAL MATCH`/`WITH`/`UNWIND` openers, a
 * `RETURN` required) passes; everything else — writes (`CREATE`/`MERGE`/
 * `DELETE`/`SET`/`REMOVE`/`DETACH`), DDL (`DROP`), procedures (`CALL`),
 * `LOAD CSV`, `FOREACH`, multi-statement text, and blank input — is rejected
 * with a structured error before the statement ever reaches the driver.
 * Comments and string literals are stripped first, so payload text can never
 * mask a second statement or a smuggled write clause. The lakehouse sql-guard
 * is the template (statement-shape check, never literal contents).
 * @module @deepseek-ai/dsh-graph-neo4j/cypher-guard
 */

/** Error code carried by {@link CypherGuardError}. */
export type CypherGuardCode =
  | 'NEO4J_CYPHER_EMPTY'
  | 'NEO4J_CYPHER_MULTI_STATEMENT'
  | 'NEO4J_CYPHER_NOT_READONLY'
  | 'NEO4J_CYPHER_NO_RETURN'

/** Structured rejection raised by {@link assertReadOnlyCypher}. */
export class CypherGuardError extends Error {
  /** The structured rejection code. */
  readonly code: CypherGuardCode

  /**
   * @param message - operator-facing reason.
   * @param code - the structured rejection code.
   */
  constructor(message: string, code: CypherGuardCode) {
    super(message)
    this.name = 'CypherGuardError'
    this.code = code
  }
}

/** Clause openers the read-only surface accepts. */
const READONLY_OPENERS = /^(?:MATCH|OPTIONAL\s+MATCH|WITH|UNWIND)\b/iu

/**
 * Write/DDL/procedure tokens the read-only surface refuses anywhere in the
 * statement (word-boundary match on the literal-stripped text).
 */
const FORBIDDEN_TOKENS =
  /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|CALL|FOREACH|LOAD|IMPORT|INSERT|UPDATE|SHUTDOWN)\b/iu

/**
 * Strip `//` line comments, `/* … *`/` block comments, backtick-quoted
 * identifiers, and single- and double-quoted string literals, replacing each
 * with a space. The guard only inspects statement structure, never literal
 * contents.
 * @param cypher - raw statement text.
 * @returns the same statement with masked literals and comments.
 */
function stripLiteralsAndComments(cypher: string): string {
  let out = ''
  let index = 0
  while (index < cypher.length) {
    const char = cypher[index]
    const next = cypher[index + 1]
    if (char === '/' && next === '/') {
      const end = cypher.indexOf('\n', index)
      index = end === -1 ? cypher.length : end
      out += ' '
    } else if (char === '/' && next === '*') {
      const end = cypher.indexOf('*/', index + 2)
      index = end === -1 ? cypher.length : end + 2
      out += ' '
    } else if (char === "'" || char === '"' || char === '`') {
      let cursor = index + 1
      let closed = false
      while (cursor < cypher.length) {
        if (cypher[cursor] === char && char !== '`' && cypher[cursor + 1] === char) {
          cursor += 2
          continue
        }
        if (cypher[cursor] === char) {
          closed = true
          break
        }
        cursor += 1
      }
      out += char === "'" ? "' '" : char === '"' ? '" "' : '` `'
      index = closed ? cursor + 1 : cypher.length
    } else {
      out += char ?? ''
      index += 1
    }
  }
  return out
}

/**
 * Blank Cypher text is rejected as `NEO4J_CYPHER_EMPTY`.
 * @param cypher - the statement text to check.
 * @throws {@link CypherGuardError} when the text is blank.
 */
export function assertNonBlank(cypher: string): void {
  if (cypher.trim().length === 0) {
    throw new CypherGuardError('the Cypher text is blank', 'NEO4J_CYPHER_EMPTY')
  }
}

/** The guard's verdict for one statement text. */
export interface CypherGuardVerdict {
  /** True when the statement may run on the read-only surface. */
  readonly allowed: boolean
  /** The structured rejection code, set when `allowed` is false. */
  readonly code: CypherGuardCode | undefined
}

/**
 * Decide whether one Cypher text is a single read-only statement. Pure and
 * side-effect free: consumers call this before touching the driver.
 * @param cypher - the raw statement text.
 * @returns the verdict with a rejection code on refusal.
 */
export function readOnlyCypherVerdict(cypher: string): CypherGuardVerdict {
  const stripped = stripLiteralsAndComments(cypher).trim()
  if (stripped.length === 0) {
    return { allowed: false, code: 'NEO4J_CYPHER_EMPTY' }
  }
  // One trailing statement separator is idiomatic; any earlier semicolon
  // means a second statement (or a payload smuggled after one).
  const withoutTrailing = stripped.replace(/;\s*$/u, '')
  if (withoutTrailing.includes(';')) {
    return { allowed: false, code: 'NEO4J_CYPHER_MULTI_STATEMENT' }
  }
  if (!READONLY_OPENERS.test(withoutTrailing)) {
    return { allowed: false, code: 'NEO4J_CYPHER_NOT_READONLY' }
  }
  const forbidden = FORBIDDEN_TOKENS.exec(withoutTrailing)
  if (forbidden !== null) {
    return { allowed: false, code: 'NEO4J_CYPHER_NOT_READONLY' }
  }
  if (!/\bRETURN\b/iu.test(withoutTrailing)) {
    return { allowed: false, code: 'NEO4J_CYPHER_NO_RETURN' }
  }
  return { allowed: true, code: undefined }
}

/**
 * Assert one Cypher text is a single read-only statement.
 * @param cypher - the raw statement text.
 * @throws {@link CypherGuardError} on every refusal path.
 */
export function assertReadOnlyCypher(cypher: string): void {
  const verdict = readOnlyCypherVerdict(cypher)
  if (!verdict.allowed) {
    throw new CypherGuardError(
      `the Cypher statement is refused (${verdict.code})`,
      verdict.code ?? 'NEO4J_CYPHER_NOT_READONLY',
    )
  }
}
