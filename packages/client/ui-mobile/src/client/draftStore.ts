/**
 * Local draft persistence: the user's unsubmitted edits on a draft card
 * (localStorage, keyed by session id + a content hash of the AI draft so a
 * changed draft invalidates stale edits), plus the locally-derived marks the
 * chats list needs — the pending-review session set and the per-session read
 * watermark. Everything here is a local, resettable convenience; the durable
 * session log stays the source of truth for card phases.
 */

import type { FormDraft } from './form-draft.ts'

/** Prefix for one draft's edit values. */
const DRAFT_KEY_PREFIX = 'dsh-mobile-draft-'
/** Key of the pending-review session set. */
const PENDING_KEY = 'dsh-mobile-pending'
/** Key of the per-session read watermark map. */
const READ_KEY = 'dsh-mobile-read'

/** FNV-1a 32-bit hash of a string (hex), the draft-content digest. */
function contentHash(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16)
}

/** The storage key of one draft card's edits. */
function draftKey(sessionId: string, draft: FormDraft): string {
  return `${DRAFT_KEY_PREFIX}${sessionId}-${contentHash(JSON.stringify(draft.fields))}`
}

/**
 * Persist one draft's unsubmitted edits.
 * @param sessionId - the owning session.
 * @param draft - the AI draft the edits ride on.
 * @param values - the edited field values.
 */
export function saveDraftEdits(sessionId: string, draft: FormDraft, values: Readonly<Record<string, string>>): void {
  localStorage.setItem(draftKey(sessionId, draft), JSON.stringify(values))
}

/**
 * Read one draft's persisted edits (a changed draft hash yields undefined).
 * @param sessionId - the owning session.
 * @param draft - the AI draft the edits rode on.
 * @returns the stored values, or undefined when none survive.
 */
export function loadDraftEdits(sessionId: string, draft: FormDraft): Record<string, string> | undefined {
  const raw = localStorage.getItem(draftKey(sessionId, draft))
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const values: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') values[key] = value
    }
    return values
  } catch {
    return undefined
  }
}

/**
 * Drop one draft's persisted edits (after confirm/reject consumed them).
 * @param sessionId - the owning session.
 * @param draft - the AI draft whose edits are cleared.
 */
export function clearDraftEdits(sessionId: string, draft: FormDraft): void {
  localStorage.removeItem(draftKey(sessionId, draft))
}

/** Read and parse a stored string set, tolerating corruption. */
function readSet(key: string): Set<string> {
  const raw = localStorage.getItem(key)
  if (raw === null) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'))
  } catch {
    return new Set()
  }
}

/** Serialize a string set back to storage. */
function writeSet(key: string, values: ReadonlySet<string>): void {
  localStorage.setItem(key, JSON.stringify([...values]))
}

/**
 * Mark one session as holding a card awaiting review (chats-list filter).
 * @param sessionId - the session with a pending card.
 */
export function markPendingReview(sessionId: string): void {
  const set = readSet(PENDING_KEY)
  set.add(sessionId)
  writeSet(PENDING_KEY, set)
}

/**
 * Clear one session's pending-review mark (after confirm/reject settles it).
 * @param sessionId - the session whose pending mark is dropped.
 */
export function clearPendingReview(sessionId: string): void {
  const set = readSet(PENDING_KEY)
  if (!set.delete(sessionId)) return
  writeSet(PENDING_KEY, set)
}

/**
 * The sessions currently holding a locally-known pending-review card.
 * @returns the marked session ids (empty when none).
 */
export function pendingReviewSessions(): Set<string> {
  return readSet(PENDING_KEY)
}

/**
 * Record the read watermark of one session (the unread dot's baseline).
 * @param sessionId - the session that was opened.
 * @param updatedAt - the session summary's updatedAt the user has seen.
 */
export function markSessionRead(sessionId: string, updatedAt: number): void {
  const raw = localStorage.getItem(READ_KEY)
  let map: Record<string, number> = {}
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        map = parsed as Record<string, number>
      }
    } catch {
      map = {}
    }
  }
  map[sessionId] = updatedAt
  localStorage.setItem(READ_KEY, JSON.stringify(map))
}

/**
 * The read watermark of one session.
 * @param sessionId - the session to look up.
 * @returns the last-seen updatedAt, or 0 when never opened.
 */
export function readWatermarkOf(sessionId: string): number {
  const raw = localStorage.getItem(READ_KEY)
  if (raw === null) return 0
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 0
    const value = (parsed as Record<string, unknown>)[sessionId]
    return typeof value === 'number' ? value : 0
  } catch {
    return 0
  }
}
