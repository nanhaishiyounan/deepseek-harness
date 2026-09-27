/**
 * The session-list projection: the last business-meaningful item of one
 * session's fold, rendered as the row's one-line subtitle — a receipt
 * projects as 「已登记 №1042 · 采购单」, a report as 「报告：{title}」, an
 * open ask as 「等你选择：…」, the last bubble as its clipped text. The
 * roster duty only projects when the session has no messages yet. Reads ride
 * a per-session cache keyed by the summary's updatedAt, so the polling list
 * never re-reads a quiet session.
 */

import { foldHistory, type ChatItem } from '../fold.ts'
import { readHistory } from '../sessionsService.ts'
import { sanitizeBizText } from './rich.ts'

/** The clip ceiling of a projected bubble text. */
const CLIP = 24

/** One cached projection: the summary stamp it was derived from. */
interface ProjectionEntry {
  readonly updatedAt: number
  readonly text: string | undefined
}

/** The per-session projection cache (module lifetime; entries self-invalidate). */
const cache = new Map<string, ProjectionEntry>()

/** Strip markdown decorations a one-line projection never shows. */
function stripMarkdown(text: string): string {
  return text
    .replace(/\|/g, ' ')
    .replace(/-{2,}/g, ' ')
    .replace(/[*`#~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Clip one display string to the projection width. Term mapping runs first:
 * underscore stripping would break the snake-id terms it recognizes. */
function clip(text: string, max: number): string {
  const clean = stripMarkdown(sanitizeBizText(text).replace(/\s+/g, ' ').trim())
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

/**
 * The one-line projection of one session's folded items (C1): the newest
 * business-meaningful item in people language.
 * @param items - the session's folded chat items in seq order.
 * @returns the subtitle line, or undefined when nothing projects.
 */
export function lastProjectionOf(items: readonly ChatItem[]): string | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as ChatItem
    if (item.kind === 'tool' || item.kind === 'degraded') continue
    if (item.kind === 'receipt') {
      return `已登记 №${item.payload.rowId} · ${item.payload.form.label}`
    }
    if (item.kind === 'report') {
      return `报告：${item.payload.title}`
    }
    if (item.kind === 'approval') {
      return item.payload.type === 'approval_pending'
        ? `待审批：${item.payload.doc.title}`
        : `审批${item.payload.state === 'approved' ? '通过' : '已驳回'}：${item.payload.doc.title}`
    }
    if (item.kind === 'task-card') {
      const label = item.payload?.form.label ?? item.draft.title
      return item.payload !== undefined ? `正在确认${label}草稿` : `${label}草稿待确认`
    }
    if (item.kind === 'ask' || item.kind === 'field-ask') {
      // An answered ask is superseded by the answer that follows it.
      if (item.answered === undefined) return `等你选择：${clip(item.payload.question, 12)}`
      continue
    }
    if (item.kind === 'action') {
      return item.action === 'confirm' ? '确认写入，等待落库' : '已驳回'
    }
    if (item.kind === 'plan') {
      return item.payload.type === 'plan_suggest'
        ? `计划建议：${clip(item.payload.product, 12)}`
        : item.payload.outcome === 'converted' ? `已转单：${clip(item.payload.product, 12)}` : `已忽略：${clip(item.payload.product, 12)}`
    }
    // The remaining kind is text.
    return item.role === 'user' ? `我：${clip(item.text, 20)}` : clip(item.text, CLIP)
  }
  return undefined
}

/**
 * The cached projection of one session, when the cache already holds this
 * exact summary stamp.
 * @param sessionId - the session.
 * @param updatedAt - the summary stamp the cache must match.
 * @returns the subtitle line, or undefined when not cached at this stamp.
 */
export function cachedProjectionOf(sessionId: string, updatedAt: number): string | undefined {
  const hit = cache.get(sessionId)
  if (hit === undefined || hit.updatedAt !== updatedAt) return undefined
  return hit.text
}

/**
 * Read one session's tail and derive (and cache) its projection.
 * @param sessionId - the session to project.
 * @param updatedAt - the summary stamp the projection is cached under.
 * @returns the subtitle line, or undefined when the session has no messages.
 */
export async function loadProjection(sessionId: string, updatedAt: number): Promise<string | undefined> {
  // A tiny newest-message window: the last message rides dozens of tool and
  // reasoning events, so even this reads a few hundred events, never the
  // whole turn history.
  const events = await readHistory(sessionId, 6)
  const text = lastProjectionOf(foldHistory(events).items)
  cache.set(sessionId, { updatedAt, text })
  return text
}
