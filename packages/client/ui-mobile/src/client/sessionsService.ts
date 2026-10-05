/**
 * Sessions service for the mobile surface: the typed read/create/prompt
 * wrappers over `session.*` plus the roster read, shared by the chats list,
 * the chat view, and the contacts page. One file owns the wire vocabulary so
 * the views stay presentation.
 */

import type {
  AgentPresetEntry, RequestPayload, SessionSearchItem, SessionSummary,
} from '@deepseek-ai/dsh-host-apiproxy/api'
import { rpc } from './rpc.ts'
import type { FoldEvent } from './fold.ts'
import { colleagueNameOf, type Welcome } from './colleagues.ts'

/** The wire's branded session id; the mobile surface carries plain strings. */
type SessionIdWire = RequestPayload<'session.history'>['sessionId']

/** One brand cast per crossing onto the wire (the mobile route id → RPC id). */
const sessionOf = (value: string): SessionIdWire => value as SessionIdWire

/** One roster row the mobile surfaces show (AI 同事通讯录). */
export interface AiEmployee {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly broken: boolean
  readonly isDefault: boolean
  /** The preset.yml welcome block, when the deployment published one. */
  readonly welcome: Welcome | undefined
}

/**
 * Read the deployment's preset roster as AI-colleague rows.
 * @returns the selectable, unbroken presets with display metadata.
 */
export async function listAiEmployees(): Promise<AiEmployee[]> {
  const value = await rpc('agentPreset.list', {})
  const rows = value.presets
    .filter((entry: AgentPresetEntry) => entry.broken === undefined)
    .map((entry: AgentPresetEntry) => ({
      id: entry.id,
      name: entry.name ?? entry.id,
      description: entry.description ?? '',
      broken: false,
      isDefault: entry.isDefault,
      welcome: entry.welcome,
    }))
  rosterNames.clear()
  for (const row of rows) rosterNames.set(row.id, row.name)
  return rows
}

/** preset id → roster display name (the roster read's cache; the subtitle reads it before the duty table). */
const rosterNames = new Map<string, string>()

/**
 * Sessions the chats tab lists (newest first).
 * @returns the session summaries sorted by updatedAt descending.
 */
export async function listSessions(): Promise<SessionSummary[]> {
  const value = await rpc('session.list', {})
  return [...value.items].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** One content-search hit (display metadata stays owned by listSessions). */
export interface SessionSearchHit {
  readonly sessionId: string
  readonly snippet: string
}

/**
 * Search the visible message surface across sessions (server-side).
 * @param query - the text to match.
 * @returns the matching session ids with their strongest excerpt.
 */
export async function searchSessions(query: string): Promise<SessionSearchHit[]> {
  const value = await rpc('session.search', { query })
  return value.items.map((item: SessionSearchItem) => ({
    sessionId: item.sessionId,
    snippet: item.snippet,
  }))
}

/**
 * Read one session's raw event window (the fold's input). The default tail
 * read pages back from the newest message; `afterSeq` (W8-B3) switches to
 * the forward cursor read — only events strictly newer than the cursor
 * cross the wire, so a running poll's payload shrinks from the whole window
 * to what happened since the last poll. The fold itself never changes: the
 * caller appends the cursor page onto its cached window before folding.
 * @param sessionId - the session whose history window to read.
 * @param maxMessages - the newest-message window size (default 200; ignored by the cursor read).
 * @param afterSeq - the forward cursor (the last seq already held), when polling incrementally.
 * @returns the raw session events in seq order.
 */
export async function readHistory(sessionId: string, maxMessages: number = 200, afterSeq?: number): Promise<readonly FoldEvent[]> {
  const value = afterSeq === undefined
    ? await rpc('session.history', { sessionId: sessionOf(sessionId), maxMessages })
    : await rpc('session.history', { sessionId: sessionOf(sessionId), afterSeq })
  return value.events.map(entry => entry.event as FoldEvent)
}

/**
 * Create a session, optionally bound to one preset (AI 同事). The response's
 * resolved `agentPreset` feeds the pending map below, so the chat view can
 * paint the colleague identity on the first screen without waiting for the
 * next `session.list` poll to carry it.
 * @param agentPreset - preset id, or undefined for the deployment default.
 * @returns the new session id.
 */
export async function createSession(agentPreset?: string): Promise<string> {
  const value = await rpc('session.create', {
    ...(agentPreset === undefined ? {} : { agentPreset }),
  })
  if (value.agentPreset !== undefined) {
    pendingPresets.set(String(value.sessionId), value.agentPreset)
  }
  return value.sessionId
}

/**
 * Presets the create response already resolved, keyed by session id: the
 * first paint of a fresh session reads this until its `session.list` row
 * arrives (the create echo exists exactly for label-without-refresh).
 */
const pendingPresets = new Map<string, string>()

/**
 * The preset a just-created session runs, before the first list read lands.
 * @param sessionId - the session created in this page.
 * @returns the resolved preset id, or undefined for a local session.
 */
export function pendingPresetOf(sessionId: string): string | undefined {
  return pendingPresets.get(sessionId)
}

/**
 * Send one user message (queue mode). The gateway session token
 * (`authToken`, auto-attached by rpc) is what the host derives the acting
 * user from — the audit identity nb_create/nb_approve stamp and gate on,
 * rendered into the system prompt by the gateway's acting-user section; the
 * message text itself carries no identity.
 * `clientMsgId` is the send's idempotency key: a retry (the offline outbox)
 * presenting the same id cannot double-dispatch server-side.
 * @param sessionId - target session.
 * @param text - the message text.
 * @param clientMsgId - the caller's idempotency key, when this send is retryable.
 */
export async function promptSession(sessionId: string, text: string, clientMsgId?: string): Promise<void> {
  await rpc('session.prompt', {
    sessionId: sessionOf(sessionId),
    mode: 'queue',
    content: [{ type: 'text', text }],
    clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(clientMsgId === undefined ? {} : { clientMsgId }),
  })
}

/**
 * The idempotency key for one outbound user message: hash of the acting
 * user, the text, the wall clock, and a per-call nonce — stable across the
 * send's retries, unique per composed message.
 * @param actor - the acting username (or '' when signed out).
 * @param text - the message text.
 * @returns the client-side message id.
 */
export function newClientMsgId(actor: string, text: string): string {
  const nonce = crypto.randomUUID().slice(0, 8)
  return `m_${actor}_${text.length}_${Date.now().toString(36)}_${nonce}`
}

/**
 * Cancel the running turn of one session (the composer's 停止生成).
 * @param sessionId - target session.
 */
export async function cancelSession(sessionId: string): Promise<void> {
  await rpc('session.cancel', { sessionId: sessionOf(sessionId) })
}

/**
 * Rename a session (pins the list title).
 * @param sessionId - the session to rename.
 * @param title - the pinned title.
 */
export async function renameSession(sessionId: string, title: string): Promise<void> {
  await rpc('session.rename', { sessionId: sessionOf(sessionId), title })
}

/**
 * The legacy session-opening identity stamp (W6-B0 through W8; retired from
 * new sessions in W9-B2): the auto-title of an old session derives from the
 * first user message, so the durable titles keep the stamp sentence as a
 * leading residue. The identification rule matches fold.ts's
 * `LEGACY_IDENTITY_STAMP_LINE` (the first line must carry the full
 * server-stamped sentence with the `——本行由系统注入` tail); the display
 * layer strips the sentence — the log data itself never moves.
 */
const LEGACY_STAMP_TITLE = /^【登录身份】[^\n]*——本行由系统注入/

/**
 * Strip a leading legacy identity-stamp sentence from a pinned title: the
 * marker plus everything up to the stamp line's closing full stop (the
 * auto-title collapses the stamp's first line into one string; a title
 * truncated inside the stamp yields nothing and falls back). A hand-typed
 * `【登录身份】…` line without the injection tail is the user's own title
 * and stays verbatim.
 * @param title - the raw pinned title.
 * @returns the stripped remainder (possibly empty).
 */
function stripLegacyStampTitle(title: string): string {
  if (!LEGACY_STAMP_TITLE.test(title)) return title
  return title.replace(/^【登录身份】[^。]*——本行由系统注入[^。]*。?/, '').trim()
}

/**
 * Display title of one session summary (the 'title' projection, with a
 * leading legacy identity-stamp sentence stripped — W9-B5).
 * @param summary - the session summary row.
 * @returns the pinned title (stamp-stripped) or the blank/new fallback.
 */
export function titleOf(summary: SessionSummary): string {
  const values = summary.projections?.values as { title?: unknown } | undefined
  const title = values?.title
  if (typeof title === 'string' && title.trim() !== '') {
    const stripped = stripLegacyStampTitle(title)
    if (stripped !== '') return stripped
    return summary.blank ? '新会话' : '未命名会话'
  }
  return summary.blank ? '新会话' : '未命名会话'
}

/**
 * Subtitle of one session summary: the owning preset's roster name (cached
 * from the roster read), its colleague-duty line before that read lands, or
 * the local-session label. A bare preset id never reaches the user. The name
 * arm reuses the stamp selector's expression (roster name, else the duty
 * tag), so the subtitle and the stamps stay same-sourced by construction.
 * @param summary - the session summary row.
 * @returns the preset's display subtitle or the local-session label.
 */
export function subtitleOf(summary: SessionSummary): string {
  if (summary.agentPreset === undefined) return '本地会话'
  const rosterName = rosterNames.get(summary.agentPreset)
  return colleagueNameOf(summary.agentPreset, rosterName === undefined ? undefined : { name: rosterName })
}

/**
 * HH:mm clock of a timestamp.
 * @param time - the epoch milliseconds.
 * @returns the zh-CN HH:mm rendering.
 */
export function clockOf(time: number): string {
  return new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/**
 * WeChat-style relative time of a timestamp (刚刚/HH:mm/昨天/周X/M月D日).
 * @param time - the epoch milliseconds.
 * @param now - the reference clock (default Date.now()).
 * @returns the list-side time label.
 */
export function relativeTimeOf(time: number, now: number = Date.now()): string {
  const date = new Date(time)
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (time >= startOfToday) {
    if (now - time < 60_000) return '刚刚'
    return clockOf(time)
  }
  if (time >= startOfToday - 86_400_000) return '昨天'
  if (time >= startOfToday - 6 * 86_400_000) {
    return date.toLocaleDateString('zh-CN', { weekday: 'short' })
  }
  return `${String(date.getMonth() + 1)}月${String(date.getDate())}日`
}

/**
 * Day-boundary label of a timestamp (the chat-flow date separator).
 * @param time - the epoch milliseconds.
 * @param now - the reference clock (default Date.now()).
 * @returns 今天/昨天/YYYY年M月D日.
 */
export function dayLabelOf(time: number, now: number = Date.now()): string {
  const date = new Date(time)
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (time >= startOfToday) return '今天'
  if (time >= startOfToday - 86_400_000) return '昨天'
  return `${String(date.getFullYear())}年${String(date.getMonth() + 1)}月${String(date.getDate())}日`
}
