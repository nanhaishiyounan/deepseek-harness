/**
 * The home tab (v7: the neutral hero card — daypart + identity on white with
 * the date capsule as the one brand accent, W7-M1's de-blue move that retires
 * the v6 gradient hero), the search-box entry (a visual affordance that lands
 * on the all-chats layer, which owns the real filtering), the compact
 * today-ledger grid (the four status counts routing to work; a zero renders
 * neutral, a live count keeps its status hue), the quick-task chips (one
 * solid primary CTA, the rest neutral capsules), the colleagues' horizontal
 * avatar rail, and the recent-chats list in the conv-item form — the stamp
 * avatar with the presence dot, the one-line projection preview, the relative
 * time, and the unread dot badge off the draftStore read watermark (work
 * sessions stay filtered out, 02 §9).
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { Badge, Button, Skeleton, Toast } from 'antd-mobile'
import { MessageCircle, Search } from 'lucide-react'
import type { SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api'
import { Avatar, EmptyState, SkelRow } from '../ui.tsx'
import { messageOf, useAsync } from '../hooks.ts'
import { colleagueColor, colleagueOf } from '../colleagues.ts'
import { navigate } from '../router.ts'
import { createSession, listAiEmployees, listSessions, relativeTimeOf, subtitleOf, titleOf } from '../sessionsService.ts'
import { listMyAlerts } from '../ledgerService.ts'
import { readWatermarkOf } from '../draftStore.ts'
import { isWorkSession, subscribeWork, todayStats, workSnapshot } from '../workStore.ts'
import { cachedProjectionOf, loadProjection } from '../messages/projection.ts'
import css from './home.module.css'

/** Home props: the current identity, and the keep-alive visibility gate. */
export interface HomeViewProps {
  readonly identityName: string
  /** Suspends the data reads while the keep-alive page is hidden (default true). */
  readonly active?: boolean
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

/** One quick-task chip: the label, its face, and its real action. */
interface QuickChip {
  readonly label: string
  /** `primary` = the one solid brand CTA; the rest ride neutral capsules. */
  readonly variant: 'primary' | 'neutral'
  readonly run: () => void
}

/** The quick-task action set (02 §10.4 + W6-B1/B2, folded 7→4 in W8-B2):
 * the register direct stays the page's single primary action (the brand
 * budget, plan §3.1 ≤2 brand hits), with one neutral chip per
 * ledger/alert/doc surface. 查看工作 (the work Tab), 找 AI 同事 (the agents
 * Tab and the roster rail below), and 问经营 (the roster's 经营参谋 card)
 * duplicated other entries on the same screen and left the set. */
const QUICK_CHIPS: readonly QuickChip[] = [
  {
    label: '我的待办',
    variant: 'neutral',
    run: () => { navigate('#/todos') },
  },
  {
    label: '我的预警',
    variant: 'neutral',
    run: () => { navigate('#/alerts') },
  },
  {
    label: '看单据',
    variant: 'neutral',
    run: () => { navigate('#/docs') },
  },
  {
    label: '登记一条单据',
    variant: 'primary',
    run: () => { void startChat('mobile-form-assistant') },
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
export function HomeView({ identityName, active = true }: HomeViewProps): JSX.Element {
  const store = useSyncExternalStore(subscribeWork, workSnapshot)
  const roster = useAsync(listAiEmployees, active)
  const sessions = useAsync(listSessions, active)
  /** The projection texts keyed by session id (tail reads). */
  const [projections, setProjections] = useState<ReadonlyMap<string, string>>(new Map())
  /** The routed-alert count for the「我的预警」chip badge (undefined = not loaded / unreadable — no badge shown). */
  const [alertCount, setAlertCount] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!active) return
    let alive = true
    listMyAlerts()
      .then((rows) => { if (alive) setAlertCount(rows.length) })
      .catch(() => { if (alive) setAlertCount(undefined) })
    return () => { alive = false }
  }, [active])

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
        <div className={css.heroTop}>
          <h1 className={css.heroTitle}>{greetingWordOf(new Date().getHours())}，{identityName}</h1>
          <span className={css.heroDate}>{headDateOf(new Date())}</span>
        </div>
        <p className={css.heroDesc}>
          {pendingCount > 0 ? `今天有 ${String(pendingCount)} 件事等你` : '今天没有待办，随时找 AI 同事聊聊'}
        </p>
      </section>

      <button type="button" className={css.searchEntry} aria-label="搜索会话与同事" onClick={() => { navigate('#/chats') }}>
        <Search size={17} strokeWidth={1.8} aria-hidden="true" />
        <span className={css.searchEntryText}>搜索会话 / AI 同事</span>
      </button>

      <button type="button" className={css.statsCard} aria-label="今日台账" onClick={() => { navigate('#/work') }}>
        <span className={css.statsGrid}>
          <span className={css.statCell}>
            <span className={`${css.statValue} ${stats.todo === 0 ? css.statZero : css.statTodo}`}>{String(stats.todo)}</span>
            <span className={css.statLabel}>待处理</span>
          </span>
          <span className={css.statCell}>
            <span className={`${css.statValue} ${stats.doing === 0 ? css.statZero : css.statDoing}`}>{String(stats.doing)}</span>
            <span className={css.statLabel}>进行中</span>
          </span>
          <span className={css.statCell}>
            <span className={`${css.statValue} ${stats.review === 0 ? css.statZero : css.statReview}`}>{String(stats.review)}</span>
            <span className={css.statLabel}>待确认</span>
          </span>
          <span className={css.statCell}>
            <span className={`${css.statValue} ${css.statDone}`}>{String(stats.doneToday)}</span>
            <span className={css.statLabel}>已完成</span>
          </span>
        </span>
      </button>

      <div className={css.quickRow}>
        {QUICK_CHIPS.map((chip) => {
          const chipButton = (
            <Button
              key={chip.label}
              type="button"
              color="primary"
              fill="solid"
              size="small"
              className={`${css.quickChip} ${chip.variant === 'primary' ? css.quickChipPrimary : css.quickChipNeutral}`}
              style={
                chip.variant === 'primary'
                  ? { '--border-radius': 'var(--dshm-radius-pill)' }
                  : {
                    '--background-color': 'var(--dshm-card)',
                    '--text-color': 'var(--dshm-foreground)',
                    '--border-color': 'var(--dshm-border)',
                    '--border-radius': 'var(--dshm-radius-pill)',
                  }
              }
              onClick={chip.run}
            >
              {chip.label}
            </Button>
          )
          // W6-R2: the alert chip carries its routed count; an unreadable or
          // empty alert set keeps the plain chip (no badge noise).
          return chip.label === '我的预警' && alertCount !== undefined && alertCount > 0
            ? <Badge key={chip.label} color="var(--dshm-destructive)" content={String(Math.min(alertCount, 99))}>{chipButton}</Badge>
            : chipButton
        })}
      </div>

      <div className={css.sectionRow}>
        <h2 className={css.sectionTitle}>AI 同事</h2>
        <Button type="button" fill="none" size="small" className={css.sectionLink} onClick={() => { navigate('#/agents') }}>查看全部 ›</Button>
      </div>
      <div className={css.rosterScroller} aria-label="AI 同事">
        {roster.status === 'loading' && (
          <div className={css.rosterSkelGroup} role="status" aria-label="正在加载 AI 同事">
            <span className={css.rosterSkel} aria-hidden="true">
              <Skeleton animated className={css.rosterSkelStamp as string} />
              <Skeleton animated className={css.rosterSkelName as string} />
            </span>
            <span className={css.rosterSkel} aria-hidden="true">
              <Skeleton animated className={css.rosterSkelStamp as string} />
              <Skeleton animated className={css.rosterSkelName as string} />
            </span>
            <span className={css.rosterSkel} aria-hidden="true">
              <Skeleton animated className={css.rosterSkelStamp as string} />
              <Skeleton animated className={css.rosterSkelName as string} />
            </span>
          </div>
        )}
        {roster.status === 'error' && (
          <span className={css.rosterEmpty} role="alert">
            同事目录加载失败：{roster.error}
            <Button type="button" fill="none" size="small" className={css.retryLink} onClick={roster.refresh}>重试</Button>
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
                <Badge color="var(--dshm-success)" content={Badge.dot} className={css.rosterAvaDot as string}>
                  <Avatar background={visual.color} acronym={visual.acronym} size={42} />
                </Badge>
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
        <Button type="button" fill="none" size="small" className={css.sectionLink} onClick={() => { navigate('#/chats') }}>查看全部 ›</Button>
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
              <Button type="button" fill="none" size="small" className={css.retryLink} onClick={sessions.refresh}>重试</Button>
            </div>
          )
          : recentRows.length === 0
            ? (
              <div className={css.recentCard}>
                <EmptyState
                  variant="section"
                  icon={<MessageCircle size={20} strokeWidth={1.8} />}
                  title="还没有对话"
                  description="上面的快捷入口或同事卡片，点一下就开聊"
                />
              </div>
            )
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
                        {preset !== undefined
                          ? (
                            <Badge color="var(--dshm-success)" content={Badge.dot} className={css.recentAvaDot as string}>
                              <Avatar background={colleagueColor(preset)} acronym={visual.acronym} size={42} />
                            </Badge>
                          )
                          : <Avatar background={colleagueColor(preset)} acronym={visual.acronym} size={42} />}
                      </span>
                      <span className={css.recentMain}>
                        <span className={css.recentTop}>
                          <span className={css.recentTitle}>{titleOf(summary)}</span>
                          <span className={css.recentTime}>{relativeTimeOf(summary.updatedAt)}</span>
                          {unread && (
                            <span className={css.recentBadge} aria-label="有新消息">
                              <Badge color="var(--dshm-destructive)" content={Badge.dot} />
                            </span>
                          )}
                        </span>
                        <span className={css.recentSummary}>{subtitle}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

    </div>
  )
}

/** The hero date capsule's line: 09-22周二. */
function headDateOf(now: Date): string {
  const weekday = now.toLocaleDateString('zh-CN', { weekday: 'short' })
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}${weekday}`
}
