/**
 * The W6-B1 server-projected ledger services: the signed-in user's open
 * approval todos (wfl_approval_todos over the live nocobase wire — the G2
 * read), the todo rows' document enrichment, the approval action (opens a
 * fill-assistant session and sends the fenced approval_confirm — the B0
 * acting-user gate stamps and checks the identity server-side), the monthly
 * registration count (wfl_approval_records submit rows by the acting user —
 * the G3 server projection replacing the session-log fold), and the routed
 * alerts read (wfl_alerts — the W6-B2 alert center's mobile mirror). No
 * React imports.
 */

import { rpc } from './rpc.ts'
import { docLabelOf, docTitleFieldOf } from './docsCatalog.ts'
import { createSession, promptSession } from './sessionsService.ts'
import { buildApprovalConfirmMessage, type ApprovalConfirmPayload } from './protocol.ts'

/** One open approval todo as the todos page renders it. */
export interface TodoRow {
  readonly id: number
  readonly docType: string
  readonly docId: number
  readonly user: string
  readonly state: string
  readonly kind: 'todo' | 'cc'
  /** The enriched document title (单号/名称), once the row read lands. */
  readonly docTitle: string | undefined
  readonly docLabel: string
}

const num = (value: unknown): number => Number(value ?? 0)
const str = (value: unknown): string => typeof value === 'string' ? value : ''

/**
 * Render one wire cell for display: a text cell passes through, a nullish
 * cell reads as the empty placeholder, and a structured cell degrades to
 * the '#'+id reference instead of '[object Object]'.
 * @param value - the raw wire cell.
 * @param id - the row id the structured-cell fallback renders.
 * @returns the display string.
 */
const wireCell = (value: unknown, id: string | number): string => {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return '—'
  return `#${String(id)}`
}

/**
 * Read one user's open todos (G2): the live wfl_approval_todos rows over the
 * gateway's realtime nocobase forward, exactly the set the engine's own
 * `GET /todos?user=` answers — the psql reconciliation target the acceptance
 * evidence replays.
 * @param username - the signed-in NocoBase username.
 * @returns the todo rows, todo-kind first, newest document first.
 */
export async function listMyTodos(username: string): Promise<TodoRow[]> {
  const page = await rpc('nocobase.list', {
    collection: 'wfl_approval_todos',
    filter: [
      { field: 'user', op: 'eq', value: username },
      { field: 'status', op: 'eq', value: 'open' },
    ],
    page: 1,
    page_size: 100,
    sort: ['-id'],
  })
  return page.rows.map(row => ({
    id: num(row['id']),
    docType: str(row['doc_type']),
    docId: num(row['doc_id']),
    user: str(row['user']),
    state: str(row['state']),
    kind: str(row['kind']) === 'cc' ? 'cc' : 'todo',
    docTitle: undefined,
    docLabel: docLabelOf(str(row['doc_type'])),
  }))
}

/**
 * Enrich todo rows with their documents' title cells (one get per distinct
 * document; a missing document degrades to the raw id).
 * @param rows - the todo rows to enrich.
 * @returns copies carrying docTitle.
 */
export async function enrichTodoRows(rows: readonly TodoRow[]): Promise<TodoRow[]> {
  const seen = new Map<string, string>()
  await Promise.all(rows.map(async (row) => {
    const key = `${row.docType}:${String(row.docId)}`
    if (seen.has(key) || row.docType === '') return
    try {
      const value = await rpc('nocobase.get', { collection: row.docType, id: row.docId })
      const title = value.row[docTitleFieldOf(row.docType)]
      seen.set(key, wireCell(title, row.docId))
    } catch {
      seen.set(key, `#${String(row.docId)}`)
    }
  }))
  return rows.map((row) => {
    const title = seen.get(`${row.docType}:${String(row.docId)}`)
    return title === undefined ? row : { ...row, docTitle: title }
  })
}

/**
 * Act on one todo (approve/reject): opens a fill-assistant session carrying
 * the signed-in identity and sends the fenced approval_confirm — the agent's
 * nb_approve runs under the B0 acting-user gate (the session's bound acting
 * user is the audit approver; a non-assignee's act is refused server-side),
 * so the mobile action cannot bypass the audit chain.
 * @param row - the todo row being acted on.
 * @param action - the user's chosen action.
 * @param comment - the optional remark.
 * @returns the session id the action runs in (the UI links into its chat).
 */
export async function actOnTodo(row: TodoRow, action: 'approve' | 'reject', comment: string): Promise<string> {
  const payload: ApprovalConfirmPayload = {
    v: 3,
    type: 'approval_confirm',
    approvalId: String(row.id),
    doc: { collection: row.docType, label: row.docLabel, docId: String(row.docId) },
    action,
    ...(comment.trim() === '' ? {} : { comment: comment.trim() }),
  }
  const sessionId = await createSession('mobile-form-assistant')
  await promptSession(sessionId, buildApprovalConfirmMessage(payload))
  return sessionId
}

/** One alert row as the alerts page renders it (W6-B2: the routed-user mirror of the alert center). */

/** The engine-confirmed act outcome the row action awaits (id/action + the token-derived acting user). */
export interface AlertActOutcome { readonly id: number; readonly action: 'claim' | 'ack' | 'resolve'; readonly user: string }

/** One routed alert row in its rendered form (severity + rule + claim/close affordances). */
export interface AlertRow {
  readonly id: number
  readonly ruleType: string
  readonly severity: 'critical' | 'warning'
  readonly title: string
  readonly entityCode: string
  readonly owner: string | undefined
  readonly status: string
  readonly daysLeft: number | undefined
}

/**
 * Act on one routed alert (W6-R2 C-1): claim/ack/resolve through the
 * gateway's nocobase.alertAct → the engine's single write entrance. The
 * acting identity derives from the session token server-side (never
 * narrated); the engine's (from_state, action, actor_role) transition table
 * decides, and a refusal (non-routed actor, unclaimed resolve, non-owner
 * resolve) throws the engine's refusal text for the row action to surface.
 * @param row - the alert row being acted on.
 * @param action - 'claim' | 'ack' | 'resolve'.
 * @param note - the optional resolve note.
 * @returns the engine-confirmed outcome (id/action/user).
 */
export async function actMyAlert(row: AlertRow, action: 'claim' | 'ack' | 'resolve', note?: string): Promise<AlertActOutcome> {
  return await rpc('nocobase.alertAct', {
    id: row.id,
    action,
    ...(note === undefined || note.trim() === '' ? {} : { note: note.trim() }),
  })
}

/**
 * One alert-center in-app notice as the alerts page renders it (W6-R3: the
 * channel's mobile mirror — 召回任务单/催收任务/其他任务通知 all ride the
 * same channelName; `category` keeps the badge honest (W6-R5: a dunning
 * notice must not wear the 召回 badge).
 */
export interface RecallNoticeRow {
  readonly id: number
  readonly title: string
  readonly content: string
  readonly status: string
  readonly category: 'recall' | 'dunning' | 'alert'
}

/**
 * Read the unread alert-center in-app notices (W6-R3 P1-8): the recall
 * orders' owner notifications land in notificationInAppMessages on the
 * channelName 'alert-center' (the B2 notification face both engines write);
 * this read makes them visible on mobile the same way the PC alert center
 * shows them.
 * @returns the unread channel notices, newest first.
 */
export async function listMyRecallNotices(): Promise<RecallNoticeRow[]> {
  const page = await rpc('nocobase.list', {
    collection: 'notificationInAppMessages',
    filter: [
      { field: 'channelName', op: 'eq', value: 'alert-center' },
      { field: 'status', op: 'eq', value: 'unread' },
    ],
    page: 1,
    page_size: 50,
    sort: ['-id'],
  })
  return page.rows.map((row) => {
    const title = str(row['title'])
    return {
      id: num(row['id']),
      title,
      content: str(row['content']),
      status: str(row['status']),
      category: title.startsWith('催收任务') ? 'dunning' as const : title.includes('召回') ? 'recall' as const : 'alert' as const,
    }
  })
}

/**
 * Read the open alerts routed to the signed-in user (W6-B2): the live
 * wfl_alerts rows over the gateway's realtime nocobase forward. Since W6-R2
 * the routed-user cut is the gateway's row scope (notify_users/owner match,
 * admin all) — the out-of-scope rows never cross the wire, this read only
 * maps what did, and the psql reconciliation (wfl_alerts by
 * notify_users ? username) stays the acceptance twin.
 * @returns the rows routed to the user (claimed or not), newest first.
 */
export async function listMyAlerts(): Promise<AlertRow[]> {
  const page = await rpc('nocobase.list', {
    collection: 'wfl_alerts',
    filter: [{ field: 'status', op: 'in', value: ['open', 'acknowledged'] }],
    page: 1,
    // The gateway's page-size ceiling is 100; the four first-batch rules'
    // open set fits one page.
    page_size: 100,
    sort: ['-id'],
  })
  return page.rows
    .map(row => ({
      id: num(row['id']),
      ruleType: str(row['rule_type']),
      severity: str(row['severity']) === 'critical' ? 'critical' as const : 'warning' as const,
      title: str(row['title']),
      entityCode: str(row['entity_code']),
      owner: row['owner'] === null || row['owner'] === undefined || row['owner'] === '' ? undefined : wireCell(row['owner'], num(row['id'])),
      status: str(row['status']),
      daysLeft: row['detail'] !== null && typeof row['detail'] === 'object' && !Array.isArray(row['detail'])
        ? numIf((row['detail'] as Record<string, unknown>)['days_left'])
        : undefined,
    }))
}

/** The finite-number read (a missing/non-finite detail cell answers undefined). */
function numIf(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** The local-calendar yyyy-mm-dd of one date (the date-only column's wire form). */
const localDateOf = (date: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * The month's registration count (G3): the wfl_approval_records submit rows
 * the signed-in user performed this calendar month — the server projection
 * of "who registered what", replacing the session-log fold that lost other
 * devices' work and never reconciled with NocoBase-side voids. `acted_at`
 * is the engine table's date-only column (W6-R1: `created_at` never existed,
 * and a full ISO instant compares false against date-only values), so the
 * month window rides the client calendar's local dates — gt the day before
 * the local month start, lt the first day of the next month.
 * @param username - the signed-in NocoBase username.
 * @returns the count of this month's submit records.
 */
export async function myMonthlyRegistrations(username: string): Promise<number> {
  const now = new Date()
  const dayBeforeMonthStart = new Date(now.getFullYear(), now.getMonth(), 0)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const page = await rpc('nocobase.list', {
    collection: 'wfl_approval_records',
    filter: [
      { field: 'approver', op: 'eq', value: username },
      { field: 'action', op: 'eq', value: 'submit' },
      { field: 'acted_at', op: 'gt', value: localDateOf(dayBeforeMonthStart) },
      { field: 'acted_at', op: 'lt', value: localDateOf(nextMonthStart) },
    ],
    page: 1,
    page_size: 1,
  })
  return page.count
}
