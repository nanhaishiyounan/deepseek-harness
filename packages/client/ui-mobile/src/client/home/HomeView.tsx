/**
 * The home tab (v6「消息」, the design's page-home): the gradient hero
 * greeting card (daypart + identity over the user gradient), the search-box
 * entry (a visual affordance that lands on the all-chats layer, which owns
 * the real filtering), the compact today-ledger chip strip (the four status
 * counts routing to work), the quick-task chips (two preset directs, one
 * route, one new-chat sheet), the colleagues' horizontal avatar rail, and
 * the recent-chats list in the conv-item form — the stamp avatar with the
 * presence dot, the one-line projection preview, the relative time, and the
 * unread dot badge off the draftStore read watermark (work sessions stay
 * filtered out, 02 §9).
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { Toast } from 'antd-mobile'
import { Search } from 'lucide-react'
import type { SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api'
import { Avatar, SkelRow } from '../ui.tsx'
import { messageOf, useAsync } from '../hooks.ts'
import { colleagueColor, colleagueOf } from '../colleagues.ts'
import { navigate } from '../router.ts'
import { createSession, listAiEmployees, listSessions, relativeTimeOf, subtitleOf, titleOf } from '../sessionsService.ts'
import { readWatermarkOf } from '../draftStore.ts'
import { isWorkSession, subscribeWork, todayStats, workSnapshot } from '../workStore.ts'
import { cachedProjectionOf, loadProjection } from '../messages/projection.ts'
import { NewChatSheet } from '../messages/NewChatSheet.tsx'
import css from './home.module.css'

/** Home props: the current identity. */
export interface HomeViewProps {
  readonly identityName: string
}

/**
 * The daypart greeting word (03 §6.1: 早上好/下午好/晚上好).
 * @param hour - the local hour.
 * @returns the greeting word.
 */
export function greetingWordOf(hour: number): string {
  if (hour < 5 || hour >= 18) return '晚上好'
  if (hour < 11) return '早上好'
  return '下午好'
}

/** One quick-task chip: the label plus its real action. */
interface QuickChip {
  readonly label: string
  readonly run: (openSheet: () => void) => void
}

/** The quick-task action set (02 §10.4): two preset directs, one route, one sheet. */
const QUICK_CHIPS: readonly QuickChip[] = [
  {
    label: '登记一条单据',
    run: () => { void startChat('mobile-form-assistant') },
  },
  {
    label: '问经营',
    run: () => { void startChat('business-advisor') },
  },
  {
    label: '查看工作',
    run: () => { navigate('#/work') },
  },
  {
    label: '找 AI 同事',
    run: (openSheet) => { openSheet() },
  },
]

/** Start one colleague's session and land on its chat, toasting a failure (the agents page's behavior). */
async function startChat(preset: string): Promise<void> {
  try {
    const sessionId = await createSession(preset)
    navigate(`#/chat/${sessionId}`)
  } catch (cause) {
    // The chat row never appears; the failed tap stays on home with a toast.
    Toast.show({ content: messageOf(cause) })
  }
}

/** The home tab. */
export function HomeView({ identityName }: HomeViewProps): JSX.Element {
  const store = useSyncExternalStore(subscribeWork, workSnapshot)
  const roster = useAsync(listAiEmployees)
  const sessions = useAsync(listSessions)
  const [sheetOpen, setSheetOpen] = useState(false)
  /** The projection texts keyed by session id (tail reads). */
  const [projections, setProjections] = useState<ReadonlyMap<string, string>>(new Map())

  const stats = useMemo(() => todayStats(store.items, Date.now()), [store.items])
  const pendingCount = stats.todo + stats.review

  // The three most recent chats, work sessions excluded (02 §9).
  const recentRows = useMemo(() => (sessions.value ?? [])
    .filter(summary => !isWorkSession(summary.sessionId))
    .slice(0, 3), [sessions.value])

  // Keep the recent rows' one-line projections warm (the chats list's C1).
  useEffect(() => {
    let alive = true
    void Promise.all(recentRows.map(async (summary) => {
      const cached = cachedProjectionOf(summary.sessionId, summary.updatedAt)
      if (cached !== undefined) return [summary.sessionId, cached] as const
      try {
        return [summary.sessionId, await loadProjection(summary.sessionId, summary.updatedAt)] as const
      } catch {
        return [summary.sessionId, undefined] as const
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
  }, [recentRows])

  const openSession = (summary: SessionSummary): void => {
    navigate(`#/chat/${summary.sessionId}`)
  }

  return (
    <div className={css.homePage}>
      <section className={css.heroCard} aria-label="工作概览">
        <h1 className={css.heroTitle}>{greetingWordOf(new Date().getHours())}，{identityName}</h1>
        <p className={css.heroDesc}>
          {pendingCount > 0 ? `今天有 ${String(pendingCount)} 件事等你` : '今天没有待办，随时找 AI 同事聊聊'}
        </p>
      </section>

      <button type="button" className={css.searchEntry} aria-label="搜索会话与同事" onClick={() => { navigate('#/chats') }}>
        <Search size={17} strokeWidth={1.8} aria-hidden="true" />
        <span className={css.searchEntryText}>搜索会话 / AI 同事</span>
      </button>

      <button type="button" className={css.statsCard} aria-label="今日台账" onClick={() => { navigate('#/work') }}>
        <span className={css.statsHeadLabel}>{headDateOf(new Date())}</span>
        <span className={css.statsGrid}>
          <span className={css.statCell}>
            <span className={`${css.statValue} ${css.statTodo}`}>{String(stats.todo)}</span>
            <span className={css.statLabel}>待处理</span>
          </span>
          <span className={css.statCell}>
            <span className={`${css.statValue} ${css.statDoing}`}>{String(stats.doing)}</span>
            <span className={css.statLabel}>进行中</span>
          </span>
          <span className={css.statCell}>
            <span className={`${css.statValue} ${css.statReview}`}>{String(stats.review)}</span>
            <span className={css.statLabel}>待确认</span>
          </span>
          <span className={css.statCell}>
            <span className={`${css.statValue} ${css.statDone}`}>{String(stats.doneToday)}</span>
            <span className={css.statLabel}>已完成</span>
          </span>
        </span>
      </button>

      <div className={css.quickRow}>
        {QUICK_CHIPS.map(chip => (
          <button
            key={chip.label}
            type="button"
            className={css.quickChip}
            onClick={() => { chip.run(() => { setSheetOpen(true) }) }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className={css.sectionRow}>
        <h2 className={css.sectionTitle}>AI 同事</h2>
        <button type="button" className={css.sectionLink} onClick={() => { navigate('#/agents') }}>查看全部 ›</button>
      </div>
      <div className={css.rosterScroller} aria-label="AI 同事">
        {roster.status === 'loading' && (
          <div className={css.rosterSkelGroup} role="status" aria-label="正在加载 AI 同事">
            <span className={css.rosterSkel} aria-hidden="true">
              <span className={css.rosterSkelStamp} />
              <span className={css.rosterSkelName} />
            </span>
            <span className={css.rosterSkel} aria-hidden="true">
              <span className={css.rosterSkelStamp} />
              <span className={css.rosterSkelName} />
            </span>
            <span className={css.rosterSkel} aria-hidden="true">
              <span className={css.rosterSkelStamp} />
              <span className={css.rosterSkelName} />
            </span>
          </div>
        )}
        {roster.status === 'error' && (
          <span className={css.rosterEmpty} role="alert">
            同事目录加载失败：{roster.error}
            <button type="button" className={css.retryLink} onClick={roster.refresh}>重试</button>
          </span>
        )}
        {(roster.value ?? []).map((employee) => {
          const visual = colleagueOf(employee.id)
          return (
            <button
              key={employee.id}
              type="button"
              className={css.rosterCard}
              aria-label={`找 ${employee.name}`}
              onClick={() => { void startChat(employee.id) }}
            >
              <span className={css.rosterAva}>
                <Avatar background={visual.color} acronym={visual.acronym} size={42} />
                <span className={css.rosterAvaDot} aria-hidden="true" />
              </span>
              <span className={css.rosterName}>{employee.name}</span>
            </button>
          )
        })}
        {roster.status === 'ready' && roster.value.length === 0 && (
          <span className={css.rosterEmpty}>部署未配置 AI 同事预设</span>
        )}
      </div>

      <div className={css.sectionRow}>
        <h2 className={css.sectionTitle}>最近对话</h2>
        <button type="button" className={css.sectionLink} onClick={() => { navigate('#/chats') }}>查看全部 ›</button>
      </div>
      {sessions.status === 'loading'
        ? (
          <div className={css.recentSkelGroup} role="status" aria-label="正在加载最近对话">
            <SkelRow />
            <SkelRow />
          </div>
        )
        : sessions.status === 'error'
          ? (
            <div className={css.recentEmpty} role="alert">
              最近对话加载失败：{sessions.error}
              <button type="button" className={css.retryLink} onClick={sessions.refresh}>重试</button>
            </div>
          )
          : recentRows.length === 0
            ? <div className={css.recentEmpty}>还没有对话，找 AI 同事开个头</div>
            : (
              <div className={css.recentList}>
                {recentRows.map((summary) => {
                  const preset = summary.agentPreset
                  const visual = colleagueOf(preset)
                  const subtitle = projections.get(summary.sessionId) ?? subtitleOf(summary)
                  const unread = summary.updatedAt > readWatermarkOf(summary.sessionId)
                  return (
                    <button key={summary.sessionId} type="button" className={css.recentRow} onClick={() => { openSession(summary) }}>
                      <span className={css.recentAva}>
                        <Avatar background={colleagueColor(preset)} acronym={visual.acronym} size={42} />
                        {preset !== undefined && <span className={css.recentAvaDot} aria-hidden="true" />}
                      </span>
                      <span className={css.recentMain}>
                        <span className={css.recentTop}>
                          <span className={css.recentTitle}>{titleOf(summary)}</span>
                          <span className={css.recentTime}>{relativeTimeOf(summary.updatedAt)}</span>
                          {unread && <span className={css.recentBadge} aria-label="有新消息" />}
                        </span>
                        <span className={css.recentSummary}>{subtitle}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

      <NewChatSheet visible={sheetOpen} onClose={() => { setSheetOpen(false) }} />
    </div>
  )
}

/** The hero card's date line: 今日台账·09-22周二. */
function headDateOf(now: Date): string {
  const weekday = now.toLocaleDateString('zh-CN', { weekday: 'short' })
  return `今日台账 · ${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}${weekday}`
}
