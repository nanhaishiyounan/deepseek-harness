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
import type { Welcome } from './colleagues.ts'

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
  return value.presets
    .filter((entry: AgentPresetEntry) => entry.broken === undefined)
    .map((entry: AgentPresetEntry) => ({
      id: entry.id,
      name: entry.name ?? entry.id,
      description: entry.description ?? '',
      broken: false,
      isDefault: entry.isDefault,
      welcome: entry.welcome,
    }))
}

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
 * Read one session's raw event window (the fold's input).
 * @param sessionId - the session whose history window to read.
 * @returns the raw session events in seq order.
 */
export async function readHistory(sessionId: string): Promise<readonly FoldEvent[]> {
  const value = await rpc('session.history', { sessionId: sessionOf(sessionId), maxMessages: 200 })
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
 * Send one user message (queue mode).
 * @param sessionId - target session.
 * @param text - the message text.
 */
export async function promptSession(sessionId: string, text: string): Promise<void> {
  await rpc('session.prompt', {
    sessionId: sessionOf(sessionId),
    mode: 'queue',
    content: [{ type: 'text', text }],
    clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
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
 * Display title of one session summary (the 'title' projection).
 * @param summary - the session summary row.
 * @returns the pinned title or the blank/new fallback.
 */
export function titleOf(summary: SessionSummary): string {
  const values = summary.projections?.values as { title?: unknown } | undefined
  const title = values?.title
  if (typeof title === 'string' && title.trim() !== '') return title
  return summary.blank ? '新会话' : '未命名会话'
}

/**
 * Subtitle of one session summary (AI 同事 or 普通会话).
 * @param summary - the session summary row.
 * @returns the owning preset or the local-session label.
 */
export function subtitleOf(summary: SessionSummary): string {
  return summary.agentPreset === undefined ? '本地会话' : `AI 同事 · ${summary.agentPreset}`
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
