/**
 * The portal's recent-search log: the last distinct queries the user ran in
 * the workbench, newest first, capped at five, persisted whole-value to
 * localStorage. Storage failures (quota, private mode, non-browser runs)
 * only disable persistence — the in-memory list still serves the session.
 * @module @deepseek-ai/dsh-client-ui-kb/client/recentSearches
 */

/** How many distinct queries the portal rail keeps. */
export const RECENT_SEARCH_LIMIT = 5

/** localStorage entry the log persists to. */
const STORAGE_KEY = 'dsh-kb-recent-searches'

/** The in-memory fallback when localStorage is unavailable or corrupted. */
let memory: string[] = []

/** Read the persisted log; a missing or corrupted entry reads as empty. */
function readPersisted(): string[] {
  if (typeof localStorage === 'undefined') return memory
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return memory
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string')
      ? parsed.slice(0, RECENT_SEARCH_LIMIT)
      : memory
  } catch {
    return memory
  }
}

/** Persist the log; a storage failure keeps the in-memory copy. */
function writePersisted(next: string[]): void {
  memory = next
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota or private mode: persistence silently disables.
  }
}

/**
 * List the recent searches, newest first, capped at {@link RECENT_SEARCH_LIMIT}.
 * @returns the distinct queries in recency order.
 */
export function recentSearches(): string[] {
  return readPersisted()
}

/**
 * Record one completed search: deduplicated, moved to the front, capped.
 * @param query - the trimmed query the search ran with.
 * @returns the updated list, newest first.
 */
export function noteRecentSearch(query: string): string[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return readPersisted()
  const next = [trimmed, ...readPersisted().filter(item => item !== trimmed)]
    .slice(0, RECENT_SEARCH_LIMIT)
  writePersisted(next)
  return next
}

/** Drop every recorded search. */
export function clearRecentSearches(): void {
  writePersisted([])
}
