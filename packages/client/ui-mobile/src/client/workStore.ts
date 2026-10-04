/**
 * The work-space store (localStorage `dsh-mobile-work`): the local source of
 * truth for work items — the four-status state machine, the exec-session
 * isolation set, and the derived selectors the work/tasks/files surfaces
 * project. Every write serializes the whole store (item counts stay under
 * 100²); a failed write degrades to the in-memory state with a toast, and a
 * remote tab's `storage` write merges in (newer rows win) instead of the last
 * write clobbering the other tab. A corrupt or unrecognized payload resets to
 * an empty, seeded store (warned on console, never crashing the page).
 * Subscribe/snapshot feed `useSyncExternalStore`; no React component imports
 * (antd-mobile's imperative Toast is the only UI reach).
 */

import { Toast } from 'antd-mobile'
import type { ReportPayload } from './protocol.ts'

/** The four work statuses (todo → doing → review → done, with the review loop back). */
export type WorkStatus = 'todo' | 'doing' | 'review' | 'done'

/** The execution result, written when a run completes (review onward). */
export interface WorkResult {
  /** One-sentence outcome (the assistant tail message clipped). */
  readonly summary: string
  readonly finishedAt: number
}

/** One work task. */
export interface WorkItem {
  /** `'w_' + Date.now().toString(36) + random suffix`, generated locally. */
  readonly id: string
  readonly title: string
  /** Team-member name or identity.nickname. */
  readonly owner: string
  /** `'YYYY-MM-DD'` or undefined (undated). */
  readonly due: string | undefined
  /** The AI suggestion's read-only text (the report row's hint). */
  readonly suggestion: string | undefined
  readonly status: WorkStatus
  /** The source session (the report card's chat); absent on manual creation. */
  readonly sourceSessionId: string | undefined
  /** The source message anchor (the report's assistant seq, stringified). */
  readonly sourceAnchor: string | undefined
  /** The exec session (the isolation mark); written once a live run starts. */
  readonly execSessionId: string | undefined
  /** Present from review onward. */
  readonly result: WorkResult | undefined
  /** The work artifact (the FilesView projection source). */
  readonly artifact: ReportPayload | undefined
  /** Artifact favorite (pure local UI state). */
  readonly pinned: boolean
  /** First-run demo seed mark. */
  readonly demo: boolean
  readonly createdAt: number
  readonly updatedAt: number
}

/** The whole localStorage shape (version gates future migrations). */
export interface WorkStoreShape {
  readonly version: 1
  readonly items: readonly WorkItem[]
  /** Exec-session isolation set (ids of deleted items linger on, for filtering). */
  readonly execSessionIds: readonly string[]
  /** First-run seed written. */
  readonly seeded: boolean
}

/** The legal status transitions (the state machine guard's single source). */
const TRANSITIONS: Readonly<Record<WorkStatus, readonly WorkStatus[]>> = {
  todo: ['doing'],
  doing: ['review'],
  review: ['doing', 'done'],
  done: [],
}

const STORAGE_KEY = 'dsh-mobile-work'

/** The empty, unseeded store. */
const EMPTY_STORE: WorkStoreShape = { version: 1, items: [], execSessionIds: [], seeded: false }

/** Module-level listeners (jsdom-testable); every commit broadcasts. */
const listeners = new Set<() => void>()

/** The durable-boundary shape check: a version we know plus array/boolean fields. */
function isWorkStoreShape(value: unknown): value is WorkStoreShape {
  if (typeof value !== 'object' || value === null) return false
  const shape = value as Record<string, unknown>
  return shape['version'] === 1
    && Array.isArray(shape['items'])
    && Array.isArray(shape['execSessionIds'])
    && typeof shape['seeded'] === 'boolean'
}

/**
 * Read the store from localStorage. A corrupt or unrecognized payload resets
 * to an empty store already marked seeded — a damaged store must never replay
 * the first-run demo seed over the user's traces.
 */
function loadWorkStore(): WorkStoreShape {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return EMPTY_STORE
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn('dsh-mobile-work 存储损坏，已重置为空工作空间')
    return { ...EMPTY_STORE, seeded: true }
  }
  if (!isWorkStoreShape(parsed)) {
    console.warn('dsh-mobile-work 版本不可识别，已重置为空工作空间')
    return { ...EMPTY_STORE, seeded: true }
  }
  return parsed
}

let store: WorkStoreShape = loadWorkStore()

/** Install the next store state: persist whole (a failed write degrades to the in-memory state), then broadcast. */
function commit(next: WorkStoreShape): void {
  store = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota-exceeded / privacy-mode write failures: the in-memory state stays
    // this page's truth; no other failure can reach this single write.
    Toast.show({ content: '本地存储写入失败，本页数据暂存内存' })
  }
  for (const listener of listeners) listener()
}

/**
 * Merge a remote tab's persisted write (the browser fires `storage` in the
 * other tabs only): remote-only items join, a same-id row takes the newer
 * updatedAt, the exec isolation set unions, and seeded latches — a two-tab
 * session keeps both sides' work instead of the last write winning. A corrupt
 * or foreign-key payload never touches this tab's store.
 * @param event - the storage event over the work key.
 */
function mergeRemoteWorkStore(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY) return
  let parsed: unknown
  try {
    parsed = event.newValue === null ? undefined : JSON.parse(event.newValue)
  } catch {
    return
  }
  if (!isWorkStoreShape(parsed)) return
  const byId = new Map(store.items.map(item => [item.id, item]))
  for (const remoteItem of parsed.items) {
    const local = byId.get(remoteItem.id)
    if (local === undefined || remoteItem.updatedAt > local.updatedAt) byId.set(remoteItem.id, remoteItem)
  }
  const next: WorkStoreShape = {
    version: 1,
    items: [...byId.values()],
    execSessionIds: [...new Set([...store.execSessionIds, ...parsed.execSessionIds])],
    seeded: store.seeded || parsed.seeded,
  }
  if (JSON.stringify(next) === JSON.stringify(store)) return
  commit(next)
}

// The store only ever loads in a browser bundle (jsdom in tests), so the
// listener registers unconditionally — a non-browser import fails loud here.
window.addEventListener('storage', mergeRemoteWorkStore)

/**
 * Create one work item and append it to the store.
 * @param input - the item's fields (status defaults to todo; 'doing' models 立即执行).
 * @returns the created item (already persisted).
 */
export function createWorkItem(input: {
  title: string
  owner: string
  due?: string
  suggestion?: string
  sourceSessionId?: string
  sourceAnchor?: string
  status?: WorkStatus
  demo?: boolean
}): WorkItem {
  const now = Date.now()
  const item: WorkItem = {
    id: `w_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: input.title,
    owner: input.owner,
    due: input.due,
    suggestion: input.suggestion,
    status: input.status ?? 'todo',
    sourceSessionId: input.sourceSessionId,
    sourceAnchor: input.sourceAnchor,
    execSessionId: undefined,
    result: undefined,
    artifact: undefined,
    pinned: false,
    demo: input.demo === true,
    createdAt: now,
    updatedAt: now,
  }
  commit({ ...store, items: [...store.items, item] })
  return item
}

/**
 * Patch one work item (id and createdAt immutable).
 * @param id - the item to patch.
 * @param patch - the fields to overwrite.
 * @returns the updated item.
 * @throws {Error} when no item carries the id.
 */
export function updateWorkItem(id: string, patch: Partial<Omit<WorkItem, 'id' | 'createdAt'>>): WorkItem {
  const { item, index } = locateWorkItem(id)
  const updated: WorkItem = { ...item, ...patch, id: item.id, createdAt: item.createdAt, updatedAt: Date.now() }
  const items = [...store.items]
  items[index] = updated
  commit({ ...store, items })
  return updated
}

/**
 * Move one work item along the state machine.
 * @param id - the item to move.
 * @param to - the target status.
 * @returns the updated item.
 * @throws {Error} when the transition is not in TRANSITIONS, or the id is unknown.
 */
export function transitionWorkItem(id: string, to: WorkStatus): WorkItem {
  const { item } = locateWorkItem(id)
  if (!TRANSITIONS[item.status].includes(to)) {
    throw new Error(`非法工作状态转移：${item.status} → ${to}`)
  }
  return updateWorkItem(id, { status: to })
}

/**
 * Delete one work item. Its exec-session registrations linger in the
 * isolation set (list filtering must keep excluding them).
 * @param id - the item to delete.
 * @throws {Error} when no item carries the id.
 */
export function deleteWorkItem(id: string): void {
  const { index } = locateWorkItem(id)
  const items = [...store.items]
  items.splice(index, 1)
  commit({ ...store, items })
}

/**
 * Register one exec session: the isolation set and the item's execSessionId
 * update together.
 * @param workId - the work item entering execution.
 * @param sessionId - the exec session's id.
 * @throws {Error} when no item carries the work id.
 */
export function registerExecSession(workId: string, sessionId: string): void {
  updateWorkItem(workId, { execSessionId: sessionId })
  if (store.execSessionIds.includes(sessionId)) return
  commit({ ...store, execSessionIds: [...store.execSessionIds, sessionId] })
}

/**
 * The work-session filter predicate (MessagesView/HomeView rows).
 * @param sessionId - the session the lists are deciding to show.
 * @returns true when the session is a registered exec session (hidden from lists).
 */
export function isWorkSession(sessionId: string): boolean {
  return store.execSessionIds.includes(sessionId)
}

/**
 * Mark the first-run seed as written (demoSeed owns the call).
 */
export function markWorkSeeded(): void {
  if (store.seeded) return
  commit({ ...store, seeded: true })
}

/**
 * Unlatch the seeded flag (the demo cleanup owns the call): the next shell
 * mount may re-seed the demo workspace.
 */
export function resetWorkSeeded(): void {
  if (!store.seeded) return
  commit({ ...store, seeded: false })
}

/**
 * Subscribe to store writes.
 * @param listener - called after every commit.
 * @returns the unsubscribe function.
 */
export function subscribeWork(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * The current store snapshot (idempotent read; feed to useSyncExternalStore).
 * @returns the live store shape.
 */
export function workSnapshot(): WorkStoreShape {
  return store
}

/** Locate one item's slot.
 * @throws {Error} when no item carries the id.
 */
function locateWorkItem(id: string): { item: WorkItem; index: number } {
  const index = store.items.findIndex(entry => entry.id === id)
  if (index === -1) throw new Error(`工作项不存在：${id}`)
  return { item: store.items[index] as WorkItem, index }
}

/** The home/profile stats card counts. */
export interface TodayStats {
  readonly todo: number
  readonly doing: number
  readonly review: number
  readonly doneToday: number
}

/**
 * The stats-card counts: live statuses by state, done counted only when its
 * result landed today.
 * @param items - the store's items.
 * @param now - the reference clock (epoch ms).
 * @returns the four counts.
 */
export function todayStats(items: readonly WorkItem[], now: number): TodayStats {
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  let todo = 0
  let doing = 0
  let review = 0
  let doneToday = 0
  for (const item of items) {
    if (item.status === 'todo') todo += 1
    else if (item.status === 'doing') doing += 1
    else if (item.status === 'review') review += 1
    else if (item.result !== undefined && item.result.finishedAt >= startOfToday) doneToday += 1
  }
  return { todo, doing, review, doneToday }
}

/**
 * The items of one status, newest update first.
 * @param items - the store's items.
 * @param status - the status to filter by.
 * @returns the matching items ordered by updatedAt descending.
 */
export function byStatus(items: readonly WorkItem[], status: WorkStatus): WorkItem[] {
  return items.filter(item => item.status === status).sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * One item by id (the detail view's entry).
 * @param items - the store's items.
 * @param id - the work item id.
 * @returns the item, or undefined when absent.
 */
export function workOf(items: readonly WorkItem[], id: string): WorkItem | undefined {
  return items.find(item => item.id === id)
}

/**
 * The tasks owned by the current identity, newest update first.
 * @param items - the store's items.
 * @param myOwner - the current identity.nickname.
 * @returns the items whose owner matches.
 */
export function myTasks(items: readonly WorkItem[], myOwner: string): WorkItem[] {
  return items.filter(item => item.owner === myOwner).sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * The tasks owned by everyone else (the 演示团队 section), newest update first.
 * @param items - the store's items.
 * @param myOwner - the current identity.nickname.
 * @returns the items whose owner differs.
 */
export function teamTasks(items: readonly WorkItem[], myOwner: string): WorkItem[] {
  return items.filter(item => item.owner !== myOwner).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** One FilesView card row (the artifact projection). */
export interface FileCardRow {
  /** The owning work item's id. */
  readonly id: string
  readonly title: string
  readonly subtitle: string | undefined
  /** The artifact's generation time (the item's createdAt). */
  readonly createdAt: number
  readonly pinned: boolean
  readonly demo: boolean
  /** The source chat to link back into, when the item carried one. */
  readonly sourceSessionId: string | undefined
  /** Where the file came from; v5 files are all AI report artifacts. */
  readonly origin: 'ai'
}

/**
 * Project every artifact-bearing item onto a FilesView card row, newest
 * generation first.
 * @param items - the store's items.
 * @returns the AI-generated and pinned cards' rows.
 */
export function fileProjections(items: readonly WorkItem[]): FileCardRow[] {
  return items
    .flatMap((item): FileCardRow[] => {
      if (item.artifact === undefined) return []
      return [{
        id: item.id,
        title: item.artifact.title,
        subtitle: item.artifact.subtitle,
        createdAt: item.createdAt,
        pinned: item.pinned,
        demo: item.demo,
        sourceSessionId: item.sourceSessionId,
        origin: 'ai',
      }]
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}
