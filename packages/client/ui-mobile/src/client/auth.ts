/**
 * Demo-grade local auth for the mobile page: a phone + code handshake that
 * accepts any six-digit code (the prototype's mock verification stance) and
 * persists the identity in localStorage. Structure kept ready for a real
 * channel: `verifyCode` is the single seam a production implementation
 * replaces, and the stored record already carries the login timestamp a real
 * session expiry would read. Single-tenant deployments stay protected by the
 * host's disk-level access control, exactly like the PC page.
 */

/** localStorage key carrying the mobile identity. */
const AUTH_STORAGE_KEY = 'dsh-mobile-auth'

/** The persisted mobile identity. */
export interface MobileIdentity {
  readonly phone: string
  readonly name: string
  readonly loggedAt: number
}

/**
 * Read the persisted identity, if any.
 * @returns the stored identity, or undefined when absent or malformed.
 */
export function loadIdentity(): MobileIdentity | undefined {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY)
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const record = parsed as Record<string, unknown>
    if (typeof record['phone'] !== 'string' || typeof record['name'] !== 'string' || typeof record['loggedAt'] !== 'number') {
      return undefined
    }
    return { phone: record['phone'], name: record['name'], loggedAt: record['loggedAt'] }
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

/**
 * Verify one submitted code against the requested phone.
 * @param phone - the phone number the code was issued for.
 * @param code - the submitted six-digit code.
 * @returns the identity to persist.
 * @throws {Error} when the code is not six digits.
 */
export function verifyCode(phone: string, code: string): MobileIdentity {
  if (!/^\d{6}$/.test(code)) {
    throw new Error('验证码为 6 位数字（演示通道：任意 6 位数字均可）')
  }
  return { phone, name: '业务员', loggedAt: Date.now() }
}
