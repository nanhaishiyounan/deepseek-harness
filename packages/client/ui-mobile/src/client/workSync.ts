/**
 * The work store's server projection (W8-B3): `wfl_mobile_work` is the
 * per-account mirror the gateway row-scopes, this module is the mobile
 * side's single translation layer. Reads ride the generic `nocobase.list`
 * (the gateway forces the acting username into the row filter — a foreign
 * account's rows never cross the wire); writes ride the dedicated
 * `nocobase.mobileWorkSave` / `nocobase.mobileWorkDelete` entrances (the
 * acting account derives from the session token server-side).
 *
 * Write-through: the store's durable writes notify the registered sink
 * (see `setWorkSyncSink`); each op coalesces per work-item id (a rapid
 * status flip sends only the last state) and drains over one serial chain.
 * A failed drain parks the op in a localStorage outbox with exponential
 * backoff and retried on `online` and on every login backfill — the local
 * store keeps working regardless (the degrade the demo mode already was).
 * Logout clears the queue (a departed account's ops must never land under
 * the next login); a session expiry keeps it (re-login re-dispatches).
 */

import type { RequestPayload } from '@deepseek-ai/dsh-host-apiproxy/api'
import { loadIdentity } from './auth.ts'
import { logClientError } from './hooks.ts'
import { rpc } from './rpc.ts'
import { applyServerItems, setWorkSyncSink, type WorkItem, type WorkStatus } from './workStore.ts'

/** The save payload's values slot as the wire schema declares it. */
type MobileWorkValues = RequestPayload<'nocobase.mobileWorkSave'>['values']

/** The projection row's wire shape (snake_case columns; opaque cells stay unknown until mapped). */
type WorkRow = Record<string, unknown>

const str = (value: unknown): string | undefined => typeof value === 'string' && value !== '' ? value : undefined
const num = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined

/**
 * One durable outbound op: the item's last state (save) or its removal
 * (delete), keyed by the work-item id for coalescing.
 */
type WorkOp = { readonly kind: 'save'; readonly item: WorkItem } | { readonly kind: 'delete'; readonly id: string }

/** The statuses the wire accepts (mirrors the store's state machine set). */
const STATUSES: readonly WorkStatus[] = ['todo', 'doing', 'review', 'done']

/**
 * Map one projection row onto a work item. The structural cells must be
 * present (client id, title, a legal status, finite timestamps); anything
 * else skips the row with a warn — a malformed projection row must never
 * replace a good local item.
 * @param row - the wire row.
 * @returns the mapped item, or undefined when the row's shape fails.
 */
export function rowToWorkItem(row: WorkRow): WorkItem | undefined {
  const id = str(row['client_id'])
  const title = str(row['title'])
  const status = str(row['status'])
  const createdAt = num(row['created_at'])
  const updatedAt = num(row['updated_at'])
  if (id === undefined || title === undefined || createdAt === undefined || updatedAt === undefined
    || !STATUSES.includes(status as WorkStatus)) {
    console.warn(JSON.stringify({ type: 'client_error', scope: 'workSync.row', message: 'projection row dropped', at: new Date().toISOString() }))
    return undefined
  }
  const resultSummary = str(row['result_summary'])
  const resultFinishedAt = num(row['result_finished_at'])
  const artifact = row['artifact']
  return {
    id,
    title,
    owner: str(row['owner_display']) ?? '',
    due: str(row['due']),
    suggestion: str(row['suggestion']),
    status: status as WorkStatus,
    sourceSessionId: str(row['source_session_id']),
    sourceAnchor: str(row['source_anchor']),
    execSessionId: str(row['exec_session_id']),
    result: resultSummary === undefined && resultFinishedAt === undefined
      ? undefined
      : { summary: resultSummary ?? '', finishedAt: resultFinishedAt ?? updatedAt },
    artifact: artifact === null || artifact === undefined ? undefined : artifact as WorkItem['artifact'],
    pinned: row['pinned'] === true,
    demo: row['demo'] === true,
    createdAt,
    updatedAt,
  }
}

/**
 * Map one work item onto the wire's save payload (undefined fields ride
 * absent; the account and client key never travel — the gateway owns them).
 * @param item - the item to project.
 * @returns the save values.
 */
export function workItemToValues(item: WorkItem): MobileWorkValues {
  const values: {
    title: string
    status: WorkStatus
    created_at: number
    updated_at: number
    owner_display?: string
    due?: string
    suggestion?: string
    source_session_id?: string
    source_anchor?: string
    exec_session_id?: string
    result_summary?: string
    result_finished_at?: number
    artifact?: unknown
    pinned?: boolean
    demo?: boolean
  } = {
    title: item.title,
    status: item.status,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    pinned: item.pinned,
    demo: item.demo,
  }
  if (item.owner !== '') values.owner_display = item.owner
  if (item.due !== undefined) values.due = item.due
  if (item.suggestion !== undefined) values.suggestion = item.suggestion
  if (item.sourceSessionId !== undefined) values.source_session_id = item.sourceSessionId
  if (item.sourceAnchor !== undefined) values.source_anchor = item.sourceAnchor
  if (item.execSessionId !== undefined) values.exec_session_id = item.execSessionId
  if (item.result !== undefined) {
    values.result_summary = item.result.summary
    values.result_finished_at = item.result.finishedAt
  }
  if (item.artifact !== undefined) values.artifact = item.artifact
  return values
}

/** The durable outbox shape (localStorage `dsh-mobile-work-outbox`). */
interface WorkOutboxShape {
  readonly version: 1
  readonly ops: readonly WorkOp[]
  /** Failed drain passes so far (backoff = 2^attempts seconds, capped). */
  readonly attempts: number
}

const OUTBOX_KEY = 'dsh-mobile-work-outbox'
const MAX_OUTBOX_OPS = 100
const MAX_BACKOFF_MS = 60_000

function loadWorkOutbox(): WorkOutboxShape {
  const raw = localStorage.getItem(OUTBOX_KEY)
  if (raw === null) return { version: 1, ops: [], attempts: 0 }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { version: 1, ops: [], attempts: 0 }
    const shape = parsed as Record<string, unknown>
    if (shape['version'] !== 1 || !Array.isArray(shape['ops']) || typeof shape['attempts'] !== 'number') {
      return { version: 1, ops: [], attempts: 0 }
    }
    return { version: 1, ops: shape['ops'] as readonly WorkOp[], attempts: shape['attempts'] }
  } catch {
    // A corrupt queue is an empty queue: the local store never depended on it.
    return { version: 1, ops: [], attempts: 0 }
  }
}

function commitWorkOutbox(next: WorkOutboxShape): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(next))
  } catch {
    // Quota-exceeded: the in-memory ops keep draining this page's writes.
  }
}

let outbox: WorkOutboxShape = loadWorkOutbox()

/**
 * The parking queue's size (the profile surface's 同步状态 line and the
 * specs read it).
 * @returns the durable queue's op count.
 */
export function workOutboxDepth(): number {
  return outbox.ops.length
}

/** The in-flight coalescing map + the serial drain chain (module-level, jsdom-testable). */
const pendingOps = new Map<string, WorkOp>()
let draining = false

function scheduleDrain(delayMs: number): void {
  if (typeof window === 'undefined') return
  window.setTimeout(() => { void drainOps() }, delayMs)
}

/**
 * Drain every pending op over one serial chain: per op, save or delete
 * through the dedicated entrances; a failure parks all remaining ops in the
 * durable outbox and backs off. The next `online` event, login backfill, or
 * a later store write re-kicks the drain.
 */
async function drainOps(): Promise<void> {
  if (draining || pendingOps.size === 0 || loadIdentity() === undefined) return
  draining = true
  try {
    while (pendingOps.size > 0) {
      const [id, op] = [...pendingOps.entries()][0] as readonly [string, WorkOp]
      pendingOps.delete(id)
      try {
        if (op.kind === 'save') {
          await rpc('nocobase.mobileWorkSave', { clientId: op.item.id, values: workItemToValues(op.item) })
        } else {
          await rpc('nocobase.mobileWorkDelete', { clientId: op.id })
        }
        outbox = { ...outbox, attempts: 0 }
        commitWorkOutbox(outbox)
      } catch (cause) {
        logClientError('workSync.push', cause)
        pendingOps.set(id, op)
        parkPending()
        scheduleDrain(backoffMs(outbox.attempts))
        return
      }
    }
  } finally {
    draining = false
  }
}

/** Park every pending op into the durable outbox (bounded, newest-first). */
function parkPending(): void {
  const ops = [...outbox.ops.filter(op => !pendingOps.has(op.kind === 'save' ? op.item.id : op.id)), ...pendingOps.values()]
  outbox = {
    version: 1,
    ops: ops.length > MAX_OUTBOX_OPS ? ops.slice(ops.length - MAX_OUTBOX_OPS) : ops,
    attempts: outbox.attempts + 1,
  }
  commitWorkOutbox(outbox)
}

/** The backoff after N failed drains: immediate first, then 2^N seconds, capped. */
function backoffMs(attempts: number): number {
  return attempts === 0 ? 0 : Math.min(2 ** attempts * 1000, MAX_BACKOFF_MS)
}

/**
 * Queue one save (the store's write-through sink): coalesces per id — a
 * rapid flip replaces the earlier op, so the wire sees the last state only.
 * @param item - the item's post-write state.
 */
export function pushWorkItem(item: WorkItem): void {
  if (loadIdentity() === undefined) return
  pendingOps.set(item.id, { kind: 'save', item })
  scheduleDrain(0)
}

/**
 * Queue one delete (the store's write-through sink); coalesces with a
 * queued save of the same id (the removal wins).
 * @param id - the removed item's id.
 */
export function queueWorkDelete(id: string): void {
  if (loadIdentity() === undefined) return
  pendingOps.set(id, { kind: 'delete', id })
  scheduleDrain(0)
}

// The store's write-through registration: loading this module wires every
// durable write (App → MobileShell → workSync keeps the import live).
setWorkSyncSink({ push: pushWorkItem, remove: queueWorkDelete })

/**
 * The login backfill (W8-B3): read the account's projected rows, merge them
 * into the store (server newer wins, local-only rows ride up next), flush
 * the durable outbox, and re-dispatch its parked ops. Unauthenticated or
 * offline runs degrade silently to the local store (the demo posture) with
 * one structured trace.
 */
export async function syncWorkFromServer(): Promise<void> {
  const identity = loadIdentity()
  if (identity === undefined) return
  try {
    const page = await rpc('nocobase.list', {
      collection: 'wfl_mobile_work',
      page: 1,
      page_size: 100,
      sort: ['-updated_at'],
    })
    const serverItems = page.rows
      .map(rowToWorkItem)
      .flatMap(item => item === undefined ? [] : [item])
    const localOnly = applyServerItems(serverItems)
    for (const item of localOnly) pendingOps.set(item.id, { kind: 'save', item })
    for (const op of outbox.ops) pendingOps.set(op.kind === 'save' ? op.item.id : op.id, op)
    outbox = { version: 1, ops: [], attempts: 0 }
    commitWorkOutbox(outbox)
    await drainOps()
  } catch (cause) {
    logClientError('workSync.pull', cause)
  }
}

/** Clear the durable outbox (logout): a departed account's ops never land under the next login. */
export function clearWorkOutbox(): void {
  pendingOps.clear()
  outbox = { version: 1, ops: [], attempts: 0 }
  commitWorkOutbox(outbox)
}

// Browser-bundle wiring: coming back online re-drains whatever parked.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { scheduleDrain(0) })
}
