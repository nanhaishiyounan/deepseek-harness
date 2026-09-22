/**
 * The chats tab (the default landing, v3): the session list — search, filter
 * chips (全部/AI 同事/待审核), the 64px rows (stamp avatar, kind badge 表单/参谋,
 * summary, relative time, running badge, unread dot), and the plus button
 * that opens the new-chat bottom sheet (the contacts route's replacement).
 * Polls while mounted so cross-device activity appears without
 * pull-to-refresh.
 */

import { useMemo, useState, type JSX } from 'react'
import { Plus, Search } from 'lucide-react'
import type { SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api'
import { navigate } from '../router.ts'
import { useAsync, usePoll } from '../hooks.ts'
import { Avatar, NoticeCard } from '../ui.tsx'
import { colleagueColor, colleagueOf } from '../colleagues.ts'
import { listAiEmployees, listSessions, relativeTimeOf, subtitleOf, titleOf } from '../sessionsService.ts'
import { markSessionRead, pendingReviewSessions, readWatermarkOf } from '../draftStore.ts'
import { NewChatSheet } from './NewChatSheet.tsx'
import css from './messages.module.css'

/** The filter chips (全部 / AI 同事 / 待审核). */
type ChatFilter = 'all' | 'colleagues' | 'pending'

/** The kind badge of one row (03 §4.7): registration vs advisory vs local. */
function kindBadgeOf(preset: string | undefined): { label: string; advisor: boolean } | undefined {
  if (preset === 'mobile-form-assistant') return { label: '表单', advisor: false }
  if (preset === 'business-advisor') return { label: '参谋', advisor: true }
  return undefined
}

/** The chats tab. */
export function MessagesView(): JSX.Element {
  const sessionsPoll = usePoll(listSessions, 4000, true)
  const roster = useAsync(listAiEmployees)
  const sessions = sessionsPoll.value
  const [filter, setFilter] = useState<ChatFilter>('all')
  const [keyword, setKeyword] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)

  const pendingSet = useMemo(() => pendingReviewSessions(), [sessionsPoll.value])
  const rosterById = useMemo(() => new Map((roster.value ?? []).map(row => [row.id, row])), [roster.value])
  const rows = useMemo(() => {
    if (sessions === undefined) return undefined
    return sessions.filter((summary) => {
      if (filter === 'colleagues' && summary.agentPreset === undefined) return false
      if (filter === 'pending' && !pendingSet.has(summary.sessionId)) return false
      if (keyword.trim() !== '') {
        const needle = keyword.trim()
        return titleOf(summary).includes(needle) || subtitleOf(summary).includes(needle)
      }
      return true
    })
  }, [sessions, filter, keyword, pendingSet])

  const open = (summary: SessionSummary): void => {
    markSessionRead(summary.sessionId, summary.updatedAt)
    navigate(`#/chat/${summary.sessionId}`)
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h1 className={css.headerTitle}>消息</h1>
        <button
          type="button"
          className={css.plus}
          aria-label="新建会话"
          title="新建会话"
          onClick={() => { setSheetOpen(true) }}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </header>

      <div className={css.searchWrap}>
        <span className={css.searchIcon} aria-hidden="true"><Search size={14} /></span>
        <input
          className={css.searchInput}
          type="search"
          placeholder="搜索会话/同事"
          value={keyword}
          onChange={(event) => { setKeyword(event.target.value) }}
        />
      </div>

      <div className={css.chips} role="tablist" aria-label="会话筛选">
        {([['all', '全部'], ['colleagues', 'AI 同事'], ['pending', '待审核']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={filter === id ? css.chipActive : css.chip}
            onClick={() => { setFilter(id) }}
          >
            {label}
          </button>
        ))}
      </div>

      <section className={css.list} aria-label="会话列表">
        {sessions === undefined && sessionsPoll.error === undefined && <NoticeCard kind="empty" text="会话加载中…" />}
        {sessionsPoll.error !== undefined && <NoticeCard kind="error" text={sessionsPoll.error} />}
        {rows?.length === 0 && <NoticeCard kind="empty" text="没有匹配的会话：右上角 + 找 AI 同事开聊" />}
        {rows?.map((summary: SessionSummary) => {
          const preset = summary.agentPreset
          const visual = colleagueOf(preset)
          const rosterRow = preset === undefined ? undefined : rosterById.get(preset)
          const unread = summary.updatedAt > readWatermarkOf(summary.sessionId)
          const kind = kindBadgeOf(preset)
          return (
            <button
              key={summary.sessionId}
              type="button"
              className={css.sessionRow}
              onClick={() => { open(summary) }}
            >
              <Avatar background={colleagueColor(preset)} acronym={visual.acronym} size={44} />
              <span className={css.sessionMain}>
                <span className={css.sessionTop}>
                  <span className={css.sessionTitle}>{titleOf(summary)}</span>
                  <span className={css.sessionTime}>{relativeTimeOf(summary.updatedAt)}</span>
                </span>
                <span className={css.sessionBottom}>
                  <span className={css.sessionSummary}>
                    {preset === undefined
                      ? '本地会话'
                      : rosterRow?.description !== '' && rosterRow?.description !== undefined
                        ? rosterRow.description
                        : visual.duty}
                  </span>
                  {unread && <span className={css.unreadDot} aria-label="有新消息" />}
                </span>
              </span>
              <span className={css.sessionSide}>
                {kind !== undefined && (
                  <span className={kind.advisor ? `${css.sessionKind} ${css.sessionKindAdvisor}` : css.sessionKind}>
                    {kind.label}
                  </span>
                )}
                {summary.running && <span className={css.runningTag}>处理中</span>}
                {pendingSet.has(summary.sessionId) && <span className={css.pendingTag}>待审</span>}
              </span>
            </button>
          )
        })}
      </section>

      <footer className={css.identityCard}>
        <span>NocoBase 业务系统 · AI 员工入口</span>
        <span>与 PC 工作台共享会话 / 业务表</span>
      </footer>

      <NewChatSheet visible={sheetOpen} onClose={() => { setSheetOpen(false) }} />
    </div>
  )
}
