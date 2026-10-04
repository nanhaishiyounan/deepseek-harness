/**
 * The W6-B1 outbox (G5, hardened W6-R1): failed sends durably queue in
 * localStorage (`dsh-mobile-outbox`) instead of dying at the composer — each
 * queued message retries with exponential backoff (2^attempts seconds,
 * capped at one minute), the `online` event and every new enqueue kick an
 * immediate flush, and a successful flush clears its row.
 *
 * W6-R1 double-send closure: every entry carries a `clientMsgId` the server
 * deduplicates `session.prompt` on, tabs stay coherent through a
 * `BroadcastChannel` sync (a commit in one tab reloads the queue in the
 * others), and the flush pass skips entries whose id already succeeded
 * locally (`outbox.dedup_hit`). A transport failure is the only retryable
 * kind — a server refusal never re-queues. Logout clears the whole queue
 * (`clearOutbox`, the `outbox.dropped` trace): a departed account's parked
 * messages must never send under the next login.
 *
 * The queue is bounded (oldest overflow rows drop) and a corrupt payload
 * resets to empty — the outbox must never brick the shell.
 * Subscribe/snapshot feed `useSyncExternalStore`; no React imports.
 */

import { promptSession } from './sessionsService.ts'

/** One queued outbound message. */
export interface OutboxEntry {
  readonly id: string
  readonly sessionId: string
  readonly text: string
  readonly createdAt: number
  /** The idempotency key the server deduplicates session.prompt on (stable across retries). */
  readonly clientMsgId: string
  /** Failed flush attempts so far (backoff = 2^attempts seconds). */
  attempts: number
}

/** The whole localStorage shape. */
interface OutboxShape {
  readonly version: 2
  readonly entries: readonly OutboxEntry[]
}

/** The queue ceiling — beyond it the oldest rows drop (the newest retries first). */
const MAX_ENTRIES = 50

/** Backoff ceiling: 2^attempts seconds capped here. */
const MAX_BACKOFF_MS = 60_000

const STORAGE_KEY = 'dsh-mobile-outbox'

/** The cross-tab sync channel (a commit in one tab reloads the queue in the others). */
const CHANNEL_NAME = 'dsh-mobile-outbox'

const listeners = new Set<() => void>()

const EMPTY: OutboxShape = { version: 2, entries: [] }

/** One structured outbox trace a BI replay can grep. */
function trace(kind: 'outbox.retry' | 'outbox.dedup_hit' | 'outbox.dropped', detail: Record<string, unknown>): void {
  console.info(JSON.stringify({ type: kind, ...detail, at: new Date().toISOString() }))
}

/** The durable-boundary shape check. */
function isOutboxShape(value: unknown): value is OutboxShape {
  if (typeof value !== 'object' || value === null) return false
  const shape = value as Record<string, unknown>
  if (shape['version'] !== 2 || !Array.isArray(shape['entries'])) return false
  return shape['entries'].every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false
    const row = entry as Record<string, unknown>
    return typeof row['id'] === 'string' && typeof row['sessionId'] === 'string'
      && typeof row['text'] === 'string' && typeof row['clientMsgId'] === 'string'
      && typeof row['createdAt'] === 'number' && typeof row['attempts'] === 'number'
  })
}

function loadOutbox(): OutboxShape {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return EMPTY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isOutboxShape(parsed)) return parsed
    return EMPTY
  } catch {
    // A corrupt queue is an empty queue: the composer keeps working, the
    // failed messages were already surfaced as errors once.
    return EMPTY
  }
}

let store: OutboxShape = loadOutbox()

/** The clientMsgIds this tab already flushed successfully (the local dedup set). */
const sentClientMsgIds = new Set<string>()

/** The cross-tab sync channel; absent where BroadcastChannel is not provided. */
const channel: BroadcastChannel | undefined = typeof BroadcastChannel === 'function'
  ? new BroadcastChannel(CHANNEL_NAME)
  : undefined

/** Reload the queue from storage (another tab committed) and notify. */
function resyncFromStorage(): void {
  store = loadOutbox()
  for (const listener of listeners) listener()
  if (store.entries.length > 0) scheduleFlush(0)
}

if (channel !== undefined) {
  channel.onmessage = () => { resyncFromStorage() }
}

function commit(next: OutboxShape, broadcast: boolean = true): void {
  store = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota-exceeded: the in-memory queue keeps retrying this page's messages.
  }
  if (broadcast && channel !== undefined) channel.postMessage('sync')
  for (const listener of listeners) listener()
}

/**
 * Queue one message the transport rejected. Newest entries append; overflow
 * beyond MAX_ENTRIES drops the oldest.
 * @param sessionId - the target session.
 * @param text - the message text.
 * @param clientMsgId - the send's idempotency key (reused across retries).
 * @returns the queued entry.
 */
export function enqueueOutbox(sessionId: string, text: string, clientMsgId: string): OutboxEntry {
  const entry: OutboxEntry = {
    id: `o_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    sessionId, text, createdAt: Date.now(), clientMsgId, attempts: 0,
  }
  const entries = [...store.entries, entry]
  commit({ version: 2, entries: entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries })
  scheduleFlush(0)
  return entry
}

/**
 * Drop one queued entry (a manual dismiss).
 * @param id - the entry's id.
 */
export function dropOutbox(id: string): void {
  commit({ version: 2, entries: store.entries.filter(entry => entry.id !== id) })
}

/**
 * Clear the whole queue (logout): the departed account's parked messages
 * must never send under the next login, so the retry timer dies with the
 * rows and one `outbox.dropped` trace records the discard.
 */
export function clearOutbox(): void {
  if (flushTimer !== undefined) {
    window.clearTimeout(flushTimer)
    flushTimer = undefined
  }
  const dropped = store.entries.length
  sentClientMsgIds.clear()
  commit({ version: 2, entries: [] })
  if (dropped > 0) trace('outbox.dropped', { count: dropped })
}

/**
 * Subscribe to queue writes.
 * @param listener - called after every commit.
 * @returns the unsubscribe function.
 */
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * The current queue snapshot (feed to useSyncExternalStore).
 * @returns The store's current shape (status + entries), reference-stable between mutations.
 */
export function outboxSnapshot(): OutboxShape {
  return store
}

/** The flush timer (module-level; the last-scheduled delay wins). */
let flushTimer: number | undefined

/** A flush pass is running (re-entrant flush calls only reschedule). */
let flushing = false

/**
 * Schedule one flush pass.
 * @param delayMs - the wait before the pass (0 for immediate).
 */
function scheduleFlush(delayMs: number): void {
  if (typeof window === 'undefined') return
  if (flushTimer !== undefined) window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(() => { void flushOutbox() }, delayMs)
}

/**
 * Flush the queue: every due entry (backoff elapsed) retries its prompt
 * carrying the same clientMsgId (server-side dedup collapses a cross-tab
 * double send); success removes the row and records the id locally, failure
 * bumps attempts and re-pends with the doubled backoff. Entry order is FIFO;
 * one poisoned message never blocks the rest.
 */
async function flushOutbox(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const due = store.entries.filter(entry => Date.now() - entry.createdAt >= backoffOf(entry.attempts))
    for (const entry of due) {
      // Local dedup: an id this tab already sent (or another tab's commit
      // removed) skips its duplicate row instead of re-dispatching.
      if (sentClientMsgIds.has(entry.clientMsgId)) {
        trace('outbox.dedup_hit', { clientMsgId: entry.clientMsgId })
        commit({ version: 2, entries: store.entries.filter(row => row.id !== entry.id) })
        continue
      }
      try {
        await promptSession(entry.sessionId, entry.text, entry.clientMsgId)
        sentClientMsgIds.add(entry.clientMsgId)
        commit({ version: 2, entries: store.entries.filter(row => row.id !== entry.id) })
      } catch (cause) {
        // Still offline (or the server is down): bump and retry later; a
        // server refusal (non-transport Error) surfaces in the trace too —
        // the server-side dedup keeps even a retried refusal harmless.
        if (!(cause instanceof TypeError)) {
          trace('outbox.retry', { clientMsgId: entry.clientMsgId, reason: cause instanceof Error ? cause.message : String(cause) })
        }
        commit({
          version: 2,
          entries: store.entries.map(row => row.id === entry.id
            ? { ...row, attempts: row.attempts + 1, createdAt: Date.now() }
            : row),
        })
      }
    }
  } finally {
    flushing = false
    if (store.entries.length > 0) scheduleFlush(Math.min(...store.entries.map(entry => backoffOf(entry.attempts))))
  }
}

/** The backoff after N failed attempts: immediate on the first try, then
 * 2^N seconds, capped. */
function backoffOf(attempts: number): number {
  return attempts === 0 ? 0 : Math.min(2 ** attempts * 1000, MAX_BACKOFF_MS)
}

/**
 * Kick one immediate flush pass (W8-B3): the shell calls it after sign-in
 * so a re-login's parked messages re-dispatch without waiting for the
 * backoff timer (module load and the online event are the other kicks).
 */
export function kickOutboxFlush(): void {
  scheduleFlush(0)
}

// The page mounts this module once (browser bundle only): going back online
// flushes immediately, and a warm queue starts its backoff loop. The module
// never loads in non-browser consumers (jsdom provides window in tests).
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { scheduleFlush(0) })
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) resyncFromStorage()
  })
  if (store.entries.length > 0) scheduleFlush(0)
}
