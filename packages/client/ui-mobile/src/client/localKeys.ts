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
  // Snapshot the key list first (W11-R5): mutating while walking the live
  // collection reindexes it under the cursor, so the doomed set is decided
  // up front and every removal then reads from the frozen snapshot.
  const doomed = Object.keys(localStorage).filter(key =>
    MOBILE_SESSION_KEY_PREFIXES.some(prefix => key.startsWith(prefix)))
  for (const key of doomed) localStorage.removeItem(key)
  return doomed
}
