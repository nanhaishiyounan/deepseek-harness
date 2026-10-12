/**
 * Mobile local identity (post-NocoBase direct entry): the page keeps a
 * nickname-only identity in localStorage — no token, no login gate. The
 * first run falls back to the「移动访客」default; a returning visitor keeps
 * the last stored nickname. The profile page can rename or reset it.
 */

/** localStorage key carrying the mobile identity. */
const AUTH_STORAGE_KEY = 'dsh-mobile-auth'

/** The persisted mobile identity (a local nickname; no credential rides it). */
export interface MobileIdentity {
  readonly username: string
  readonly nickname: string
  readonly loggedAt: number
}

/** The first-run default identity. */
const DEFAULT_IDENTITY: MobileIdentity = { username: 'visitor', nickname: '移动访客', loggedAt: 0 }

/**
 * Read the persisted identity, if any.
 * @returns the stored identity, or the visitor default when absent or
 * malformed.
 */
export function loadIdentity(): MobileIdentity {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY)
  if (raw === null) return DEFAULT_IDENTITY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_IDENTITY
    const record = parsed as Record<string, unknown>
    if (typeof record['username'] !== 'string' || record['username'] === ''
      || typeof record['nickname'] !== 'string' || record['nickname'] === ''
      || typeof record['loggedAt'] !== 'number') {
      return DEFAULT_IDENTITY
    }
    return {
      username: record['username'],
      nickname: record['nickname'],
      loggedAt: record['loggedAt'],
    }
  } catch {
    return DEFAULT_IDENTITY
  }
}

/**
 * Persist the identity after a local rename.
 * @param identity - the identity to store.
 */
export function saveIdentity(identity: MobileIdentity): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(identity))
}

/** Reset the identity to the visitor default. */
export function clearIdentity(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}
