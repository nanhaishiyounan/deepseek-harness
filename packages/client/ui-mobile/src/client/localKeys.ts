/**
 * The logout key sweep (W11-R2): every `dsh-mobile-*` surface that parks
 * user data under a per-session key lists its prefix here, so the logout
 * path drops the departed account's drafts, parked outbox entries, and
 * attachment strips from one list instead of each store remembering to
 * clear itself. Keys outside these prefixes (the theme choice, read
 * watermarks, pins) survive logout by design; `clearOutbox`/`clearWorkOutbox`
 * still run first because they also kill timers and in-memory state.
 */

/** The per-account key prefixes the logout sweep clears. */
export const MOBILE_SESSION_KEY_PREFIXES: readonly string[] = [
  'dsh-mobile-draft',
  'dsh-mobile-outbox',
  'dsh-mobile-attachments',
]

/**
 * Remove every key starting with one of the session key prefixes.
 * @returns the removed key names (the logout trace's detail).
 */
export function sweepSessionKeys(): string[] {
  const doomed: string[] = []
  // Walk backwards: each removeItem reindexes the tail.
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index)
    if (key === null) continue
    if (MOBILE_SESSION_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
      localStorage.removeItem(key)
      doomed.push(key)
    }
  }
  return doomed
}
