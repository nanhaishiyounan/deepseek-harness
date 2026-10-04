/**
 * The per-session acting-user registry: the business identity whose NocoBase
 * writes a session performs, keyed by the opaque session id. The gateway
 * (`dsh-host-apiproxy`) records the identity after a real sign-in and rebinds
 * it on every carrying prompt; the `nb_create`/`nb_approve` tools read it to
 * stamp the audit columns (requester/operator/inspector, the wfl submit
 * approver) and to gate approvals on the acting user's own todo — the
 * deployment-wide API key stays the transport credential, the acting user is
 * the audit identity. Sessions without an entry (the PC surface, CLI runs)
 * keep the pre-registry behavior.
 *
 * Process-global by design: both writers and readers import this one module
 * instance from the same harness install, and the map is bounded by the live
 * session count (cleared when the gateway unbinds a session). Not a Cordis
 * service on purpose — preset subtrees may not publish root-realm services,
 * and this channel predates no per-session service seam.
 * @module @deepseek-ai/dsh-connector-nocobase/acting-user
 */

/** The business identity one session acts as (from a real NocoBase sign-in). */
export interface ActingUser {
  /** The NocoBase username (the audit value every column and record carries). */
  readonly username: string
  /** The display name (narratives and receipts show it). */
  readonly nickname: string
}

/** Session id → acting user. */
const actingUsers = new Map<string, ActingUser>()

/**
 * Bind or rebind one session's acting user. Idempotent; a later prompt from a
 * different signed-in user on the same session overwrites the binding, so the
 * newest binding is always the one tools enforce.
 * @param sessionId - the opaque session id the gateway keyed the prompt by.
 * @param user - the signed-in identity the session's writes stamp.
 */
export function setSessionActingUser(sessionId: string, user: ActingUser): void {
  actingUsers.set(sessionId, user)
}

/**
 * Read one session's bound acting user.
 * @param sessionId - the session id a tool execution runs under, or undefined
 * when the caller has no session (anonymous flows answer undefined).
 * @returns the bound identity, or undefined when the session carries none.
 */
export function sessionActingUserOf(sessionId: string | undefined): ActingUser | undefined {
  if (sessionId === undefined) return undefined
  return actingUsers.get(sessionId)
}

/**
 * Drop one session's binding (the gateway unbinds on session teardown so the
 * map tracks live sessions only).
 * @param sessionId - the session id whose binding to drop.
 */
export function clearSessionActingUser(sessionId: string): void {
  actingUsers.delete(sessionId)
}
