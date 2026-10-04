/**
 * Mobile auth over the real NocoBase account system: the login handshake is
 * `nocobase.signIn` (the gateway proxies NocoBase's basic authenticator, so
 * the rehearsal role accounts verify with their real passwords), and the
 * returned profile plus gateway session token persist in localStorage as the
 * page identity. Every session prompt and nocobase read re-carries the token
 * (`authToken`) — the host derives the acting user from it server-side and
 * stamps/gates the nb_* tools on that identity. Records from the retired
 * any-code demo channel, and identities without a token (pre-credential
 * shapes), fail the shape check and read as logged out.
 */

import { Toast } from 'antd-mobile'

/** localStorage key carrying the mobile identity. */
const AUTH_STORAGE_KEY = 'dsh-mobile-auth'

/** The persisted mobile identity (a real NocoBase account + its gateway session). */
export interface MobileIdentity {
  readonly username: string
  readonly nickname: string
  /** The gateway session token from nocobase.signIn (the credential the wire re-carries). */
  readonly token: string
  readonly loggedAt: number
}

/**
 * Read the persisted identity, if any.
 * @returns the stored identity, or undefined when absent, malformed, from the
 * retired phone+code demo shape, or carrying no session token (re-login).
 */
export function loadIdentity(): MobileIdentity | undefined {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY)
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const record = parsed as Record<string, unknown>
    if (typeof record['username'] !== 'string' || record['username'] === ''
      || typeof record['nickname'] !== 'string' || record['nickname'] === ''
      || typeof record['token'] !== 'string' || record['token'] === ''
      || typeof record['loggedAt'] !== 'number') {
      return undefined
    }
    return {
      username: record['username'],
      nickname: record['nickname'],
      token: record['token'],
      loggedAt: record['loggedAt'],
    }
  } catch {
    return undefined
  }
}

/**
 * Persist the identity after a successful login.
 * @param identity - the identity to store.
 */
export function saveIdentity(identity: MobileIdentity): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(identity))
}

/** Clear the identity (退出登录). */
export function clearIdentity(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

/** Listeners the expiry path notifies (the App root re-renders onto the login gate). */
const expiryListeners = new Set<() => void>()

/**
 * Subscribe to session-expiry events (W8-B3): `handleSessionExpired` fires
 * every listener after clearing the dead token.
 * @param listener - called once per expiry.
 * @returns the unsubscribe function.
 */
export function subscribeSessionExpired(listener: () => void): () => void {
  expiryListeners.add(listener)
  return () => { expiryListeners.delete(listener) }
}

/**
 * The graceful expiry path (W8-B3): a gateway `nocobase-unauthorized` means
 * the sign-in session died server-side. This clears the token (the app root
 * lands on the login gate via the subscription) and tells the user once —
 * and deliberately touches nothing else: work items, drafts, and both
 * outboxes survive so the re-login backfill re-dispatches them.
 */
export function handleSessionExpired(): void {
  if (localStorage.getItem(AUTH_STORAGE_KEY) === null) return
  clearIdentity()
  console.warn(JSON.stringify({ type: 'session_expired', at: new Date().toISOString() }))
  Toast.show({ content: '登录已过期，请重新登录（本地数据已保留）' })
  for (const listener of expiryListeners) listener()
}
