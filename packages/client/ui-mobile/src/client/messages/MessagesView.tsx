/**
 * The all-chats full-screen layer (v6 IA): the session list — the PageNav
 * back header with the new-chat plus in its right slot, SearchBar, CapsuleTabs
 * filter (全部/AI 同事/待审核), the 64px rows (stamp avatar, Tag kind badge, the
 * last-message projection, relative time, running/pending Tag, unread Badge),
 * SwipeAction 置顶/已读 on each row, pull-to-refresh, and incremental paging
 * over the list. Polls while mounted so cross-device activity appears without
 * pulling; pinned sessions order above the rest.
 */

import { useEffect, useMemo, useState, type JSX } from 'react'
import { Badge, CapsuleTabs, ErrorBlock, InfiniteScroll, PullToRefresh, SearchBar, SwipeAction, Tag } from 'antd-mobile'
import { MessageCircle, Plus } from 'lucide-react'
import type { SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api'
import { goBackOr, navigate } from '../router.ts'
import { PageNav } from '../PageNav.tsx'
import { usePoll } from '../hooks.ts'
import { Avatar, EmptyState, SkelRow } from '../ui.tsx'
import { colleagueColor, colleagueOf } from '../colleagues.ts'
import { listSessions, relativeTimeOf, titleOf } from '../sessionsService.ts'
import { markSessionRead, pendingReviewSessions, pinSession, pinnedSessions, readWatermarkOf, unpinSession } from '../draftStore.ts'
import { isWorkSession } from '../workStore.ts'
import { cachedProjectionOf, loadProjection } from './projection.ts'
import { NewChatSheet } from './NewChatSheet.tsx'
import css from './messages.module.css'

/** The filter chips (全部 / AI 同事 / 待审核). */
type ChatFilter = 'all' | 'colleagues' | 'pending'

/** Rows loaded per incremental page. */
const PAGE_SIZE = 20

/** Rows whose projection (a tail history read) stays warm. */
const PROJECTION_WINDOW = 15

/** The kind badge of one row (03 §4.7): registration vs advisory vs local. */
function kindBadgeOf(preset: string | undefined): { label: string; advisor: boolean } | undefined {
  if (preset === 'mobile-form-assistant') return { label: '表单', advisor: false }
  if (preset === 'business-advisor') return { label: '参谋', advisor: true }
  return undefined
}

/** The chats tab. */
export function MessagesView(): JSX.Element {
  const sessionsPoll = usePoll(listSessions, 4000, true)
  const sessions = sessionsPoll.value
  const [filter, setFilter] = useState<ChatFilter>('all')
  const [keyword, setKeyword] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pins, setPins] = useState<ReadonlySet<string>>(() => pinnedSessions())
  /** Locally-visible row count over the filtered list (incremental paging). */
  const [visible, setVisible] = useState(PAGE_SIZE)
  /** The projection texts keyed by session id (loaded tails, C1). */
  const [projections, setProjections] = useState<ReadonlyMap<string, string>>(new Map())

  const pendingSet = useMemo(() => pendingReviewSessions(), [sessionsPoll.value])
  const rows = useMemo(() => {
    if (sessions === undefined) return undefined
    const filtered = sessions.filter((summary) => {
      // Registered exec sessions never surface here (02 §9 isolation).
      if (isWorkSession(summary.sessionId)) return false
      if (filter === 'colleagues' && summary.agentPreset === undefined) return false
      if (filter === 'pending' && !pendingSet.has(summary.sessionId)) return false
      if (keyword.trim() !== '') {
        const needle = keyword.trim()
        const projection = cachedProjectionOf(summary.sessionId, summary.updatedAt)
        return titleOf(summary).includes(needle)
          || (projection !== undefined && projection.includes(needle))
      }
      return true
    })
    // Pinned sessions order above the rest, newest first within each band.
    return [...filtered].sort((a, b) => {
      const aPin = pins.has(a.sessionId) ? 1 : 0
      const bPin = pins.has(b.sessionId) ? 1 : 0
      if (aPin !== bPin) return bPin - aPin
      return b.updatedAt - a.updatedAt
    })
  }, [sessions, filter, keyword, pendingSet, pins])

  // Keep the projection window warm (C1): tail reads for the visible top
  // rows, cached by updatedAt so quiet sessions never re-read.
  const windowKey = useMemo(
    () => (rows ?? []).slice(0, PROJECTION_WINDOW).map(row => `${row.sessionId}:${String(row.updatedAt)}`).join('|'),
    [rows],
  )
  useEffect(() => {
    let alive = true
    const missing = (rows ?? [])
      .slice(0, PROJECTION_WINDOW)
      .filter(row => cachedProjectionOf(row.sessionId, row.updatedAt) === undefined)
    if (missing.length === 0) return
    void Promise.all(missing.map(async (row) => {
      try {
        return [row.sessionId, await loadProjection(row.sessionId, row.updatedAt)] as const
      } catch {
        // A failed tail read leaves the row on its roster fallback.
        return [row.sessionId, undefined] as const
      }
    })).then((entries) => {
      if (!alive) return
      setProjections((current) => {
        const next = new Map(current)
        for (const [sessionId, text] of entries) {
          if (text !== undefined) next.set(sessionId, text)
        }
        return next
      })
    })
    return () => { alive = false }
    // The string key re-runs only when the window's stamps actually change.
  }, [windowKey])

  const open = (summary: SessionSummary): void => {
    markSessionRead(summary.sessionId, summary.updatedAt)
    navigate(`#/chat/${summary.sessionId}`)
  }

  const togglePin = (summary: SessionSummary, pinned: boolean): void => {
    if (pinned) unpinSession(summary.sessionId)
    else pinSession(summary.sessionId)
    setPins(pinnedSessions())
  }

  const markRead = (summary: SessionSummary): void => {
    markSessionRead(summary.sessionId, summary.updatedAt)
    // Re-read the pin set (new identity) to re-render the unread badges.
    setPins(pinnedSessions())
  }

  /** The pull-to-refresh arm: an immediate re-read, resolved when it lands. */
  /* v8 ignore next 3 -- the drag gesture needs real touch layout; the poll refresh covers the lane elsewhere. */
  const onPullRefresh = (): Promise<void> => {
    sessionsPoll.refresh()
    return Promise.resolve()
  }

  return (
    <div className={css.page}>
      <PageNav
        title="消息"
        onBack={() => { goBackOr('#/') }}
        right={(
          <button
            type="button"
            className={css.plus}
            aria-label="新建会话"
            title="新建会话"
            onClick={() => { setSheetOpen(true) }}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        )}
      />

      <div className={css.searchWrap}>
        <SearchBar
          placeholder="搜索会话/同事"
          value={keyword}
          onChange={setKeyword}
          className={css.searchBar}
        />
      </div>

      <CapsuleTabs
        activeKey={filter}
        onChange={(key) => { setFilter(key as ChatFilter) }}
        className={css.filterTabs as string}
      >
        <CapsuleTabs.Tab title="全部" key="all" />
        <CapsuleTabs.Tab title="AI 同事" key="colleagues" />
        <CapsuleTabs.Tab title="待审核" key="pending" />
      </CapsuleTabs>

      <section className={css.list} aria-label="会话列表">
        <PullToRefresh onRefresh={onPullRefresh}>
          {sessions === undefined && sessionsPoll.error === undefined && (
            <div className={css.skelGroup} role="status" aria-label="正在加载会话">
              {Array.from({ length: 5 }, (_, index) => <SkelRow key={index} />)}
            </div>
          )}
          {sessionsPoll.error !== undefined && (
            <ErrorBlock status="disconnected" title={sessionsPoll.error} className={css.empty as string} />
          )}
          {rows?.length === 0 && (
            <EmptyState
              icon={<MessageCircle size={22} strokeWidth={1.8} />}
              title={filter === 'all' && keyword.trim() === '' ? '还没有会话' : '没有匹配的会话'}
              description={filter === 'all' && keyword.trim() === '' ? '右上角 + 找 AI 同事开聊' : '换个筛选或关键词，右上角 + 开个新会话'}
            />
          )}
          {rows?.slice(0, visible).map((summary: SessionSummary) => {
            const preset = summary.agentPreset
            const visual = colleagueOf(preset)
            const unread = summary.updatedAt > readWatermarkOf(summary.sessionId)
            const kind = kindBadgeOf(preset)
            const pinned = pins.has(summary.sessionId)
            const projection = cachedProjectionOf(summary.sessionId, summary.updatedAt)
              ?? projections.get(summary.sessionId)
            const subtitle = projection ?? (preset === undefined ? '本地会话' : visual.duty)
            return (
              <SwipeAction
                key={summary.sessionId}
                rightActions={[
                  {
                    key: 'pin',
                    text: pinned ? '取消置顶' : '置顶',
                    color: 'primary',
                    onClick: () => { togglePin(summary, pinned) },
                  },
                  {
                    key: 'read',
                    text: '标记已读',
                    color: 'default',
                    onClick: () => { markRead(summary) },
                  },
                ]}
              >
                <button
                  type="button"
                  className={`${css.sessionRow} ${pinned ? css.sessionPinned : ''}`}
                  onClick={() => { open(summary) }}
                >
                  <Avatar background={colleagueColor(preset)} acronym={visual.acronym} size={44} />
                  <span className={css.sessionMain}>
                    <span className={css.sessionTop}>
                      <span className={css.sessionTitle}>{titleOf(summary)}</span>
                      {unread
                        ? (
                          <Badge
                            content={Badge.dot}
                            color="var(--dshm-danger)"
                            aria-label="有新消息"
                            className={css.timeBadge as string}
                          >
                            <span className={css.sessionTime}>{relativeTimeOf(summary.updatedAt)}</span>
                          </Badge>
                        )
                        : <span className={css.sessionTime}>{relativeTimeOf(summary.updatedAt)}</span>}
                    </span>
                    <span className={css.sessionBottom}>
                      <span className={css.sessionSummary}>{subtitle}</span>
                      <span className={css.sessionSide}>
                        {kind !== undefined && (
                          <Tag
                            color={kind.advisor ? 'default' : 'primary'}
                            fill="outline"
                            className={css.kindTag as string}
                          >
                            {kind.label}
                          </Tag>
                        )}
                        {summary.running && (
                          <Tag color="success" fill="outline" className={css.kindTag as string}>处理中</Tag>
                        )}
                        {pendingSet.has(summary.sessionId) && (
                          <Tag color="warning" fill="outline" className={css.kindTag as string}>待审</Tag>
                        )}
                      </span>
                    </span>
                  </span>
                </button>
              </SwipeAction>
            )
          })}
          {rows !== undefined && rows.length > visible && (
            <InfiniteScroll
              loadMore={() => { setVisible(current => current + PAGE_SIZE); return Promise.resolve() }}
              hasMore={rows.length > visible}
            />
          )}
        </PullToRefresh>
      </section>

      <footer className={css.identityCard}>
        <span>NocoBase 业务系统 · AI 员工入口</span>
        <span>与 PC 工作台共享会话 / 业务表</span>
      </footer>

      <NewChatSheet visible={sheetOpen} onClose={() => { setSheetOpen(false) }} />
    </div>
  )
}
