/**
 * The home tab (W9「酱园琥珀」: the brand hero — the display greeting over the
 * warm-paper canvas with the 84px 鲜酿 round seal as the page's signature
 * stamp, the solar-term line computed from the real sun longitude, the
 * two-column big stat cards (32px mono tabular digits, the zero-neutral
 * narrative kept), the quick-task chips in the seal language (one solid
 * persimmon CTA + paper capsules), the colleagues' avatar rail, and the
 * recent-chats list in the conv-item form — the stamp avatar with the
 * presence dot, the one-line projection preview, the relative time, and the
 * unread dot badge off the draftStore read watermark (work sessions stay
 * filtered out, 02 §9).
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { Badge, Button, Skeleton, Toast } from 'antd-mobile'
import { MessageCircle, Search } from 'lucide-react'
import type { SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api'
import { Avatar, EmptyState, SkelRow } from '../ui.tsx'
import { messageOf, useAsync } from '../hooks.ts'
import { colleagueColor, colleagueOf, stampAcronymOf } from '../colleagues.ts'
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

/** The current solar term plus the days elapsed since its crossing. */
export interface SolarTerm {
  readonly name: string
  /** 1 on the crossing day itself (the 「今日霜降」 day). */
  readonly day: number
}

const DEG = Math.PI / 180
const DAY_MS = 86_400_000

/**
 * The apparent solar longitude at a UTC instant (Meeus low-precision series:
 * ±0.01° ≈ ±15 min of term time — enough to pin the Gregorian day of every
 * 15° crossing through the 21st century).
 * @param utcMs - the epoch milliseconds.
 * @returns the apparent longitude in [0, 360).
 */
function sunLongitudeOf(utcMs: number): number {
  const t = (utcMs / 86400000 + 2440587.5 - 2451545) / 36525
  const l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t
  const m = 357.52911 + 35999.05029 * t - 0.0001537 * t * t
  const center = (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(m * DEG)
    + (0.019993 - 0.000101 * t) * Math.sin(2 * m * DEG)
    + 0.000289 * Math.sin(3 * m * DEG)
  const omega = 125.04 - 1934.136 * t
  const lambda = l0 + center - 0.00569 - 0.00478 * Math.sin(omega * DEG)
  return ((lambda % 360) + 360) % 360
}

/** The 24 terms in longitude order: index k is the k·15° crossing, 春分 = 0°. */
const TERM_NAMES = ['春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒', '立春', '雨水', '惊蛰'] as const

/** The midnight instant (UTC ms) that opens the local calendar day. */
function localMidnightOf(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * The solar term the calendar day sits in: the most recent 15° crossing at or
 * before today's Beijing-midnight sampling. The scan window (16 days) covers
 * the longest gap between crossings (≈15.2 days around 冬至→小寒).
 * @param date - the local day.
 * @returns the term name and its day count, or undefined when no crossing sits
 * within the window (only reachable outside the formula's validity).
 */
export function solarTermOf(date: Date): SolarTerm | undefined {
  const start = localMidnightOf(date)
  for (let back = 0; back <= 16; back += 1) {
    const midnight = start - back * DAY_MS
    const before = sunLongitudeOf(midnight)
    const after = sunLongitudeOf(midnight + DAY_MS)
    for (let index = TERM_NAMES.length - 1; index >= 0; index -= 1) {
      const degree = index * 15
      // A crossing when the day's arc sweeps over the boundary (the wrap day
      // around 360° matches either half).
      const crossed = before < after
        ? before < degree && degree <= after
        : before < degree || degree <= after
      if (crossed) {
        const name = TERM_NAMES[index]
        if (name !== undefined) return { name, day: back + 1 }
      }
    }
  }
  return undefined
}

/**
 * The hero's solar-term phrase: 「今日霜降」 on the crossing day, the plain
 * 「霜降时节」 afterwards.
 * @param date - the local day.
 * @returns the phrase, or undefined outside the term table's reach.
 */
export function solarTermPhraseOf(date: Date): string | undefined {
  const term = solarTermOf(date)
  if (term === undefined) return undefined
  return term.day === 1 ? `今日${term.name}` : `${term.name}时节`
}

/**
 * The hero seal's batch number: the brewing batch of the day, `B-MMDD` off the
 * local calendar (design §六.1 — derived, never a pinned string).
 * @param date - the local day.
 * @returns the batch code.
 */
export function batchOf(date: Date): string {
  return `B-${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

/** One quick-task chip: the label, its face, and its real action. */
interface QuickChip {
  readonly label: string
  /** `primary` = the one solid persimmon CTA; the rest ride paper capsules. */
  readonly variant: 'primary' | 'neutral'
  readonly run: () => void
}

/** The quick-task action set (02 §10.4 + W6-B1/B2, folded 7→4 in W8-B2):
 * the register direct stays the page's single solid action (the one
 * seal-CTA per screen), with one capsule chip per ledger/alert/doc surface.
 * 查看工作 (the work Tab), 找 AI 同事 (the agents Tab and the roster rail
 * below), and 问经营 (the roster's 经营参谋 card) duplicated other entries
 * on the same screen and left the set. */
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
  const now = new Date()
  const termPhrase = solarTermPhraseOf(now)

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
        <div className={css.heroTexts}>
          <h1 className={css.heroTitle}>
            <span className={css.heroHi}>{greetingWordOf(now.getHours())}</span>
            {termPhrase === undefined ? identityName : `${identityName}，${termPhrase}`}
          </h1>
          <p className={css.heroDate}>
            {headDateOf(now)}
            {alertCount !== undefined && alertCount > 0
              ? <b> · {String(Math.min(alertCount, 99))} 项预警待看</b>
              : pendingCount > 0
                ? ` · 今天有 ${String(pendingCount)} 件事等你`
                : ' · 今天没有待办，随时找 AI 同事聊聊'}
          </p>
        </div>
        <span className={css.heroSeal} aria-label="今日酱印" title="鲜酿">
          <span className={css.heroSealGlyph} aria-hidden="true">鲜酿</span>
          <span className={css.heroSealBatch} aria-hidden="true">{batchOf(now)}</span>
        </span>
      </section>

      <button type="button" className={css.searchEntry} aria-label="搜索会话与同事" onClick={() => { navigate('#/chats') }}>
        <Search size={17} strokeWidth={1.8} aria-hidden="true" />
        <span className={css.searchEntryText}>搜索会话 / AI 同事</span>
      </button>

      <button type="button" className={css.statsGrid} aria-label="今日台账" onClick={() => { navigate('#/work') }}>
        <span className={css.statCell}>
          <span className={`${css.statValue} ${stats.todo === 0 ? css.statZero : css.statTodo}`}>
            {String(stats.todo)}<small>项</small>
          </span>
          <span className={css.statLabel}>待处理</span>
        </span>
        <span className={css.statCell}>
          <span className={`${css.statValue} ${stats.doing === 0 ? css.statZero : css.statDoing}`}>
            {String(stats.doing)}<small>项</small>
          </span>
          <span className={css.statLabel}>进行中</span>
        </span>
        <span className={css.statCell}>
          <span className={`${css.statValue} ${stats.review === 0 ? css.statZero : css.statReview}`}>
            {String(stats.review)}<small>项</small>
          </span>
          <span className={css.statLabel}>待确认</span>
        </span>
        <span className={css.statCell}>
          <span className={`${css.statValue} ${css.statDone}`}>
            {String(stats.doneToday)}<small>项</small>
          </span>
          <span className={css.statLabel}>已完成</span>
        </span>
      </button>

      <div className={css.quickRow}>
        {QUICK_CHIPS.map((chip) => {
          const chipButton = (
            <button
              key={chip.label}
              type="button"
              className={chip.variant === 'primary' ? `dshm-seal-cta ${css.quickChipCta}` : `dshm-seal-chip ${css.quickChip}`}
              onClick={chip.run}
            >
              {chip.label}
            </button>
          )
          // W6-R2: the alert chip carries its routed count; an unreadable or
          // empty alert set keeps the plain chip (no badge noise).
          return chip.label === '我的预警' && alertCount !== undefined && alertCount > 0
            ? <Badge key={chip.label} color="var(--dshm-danger)" content={String(Math.min(alertCount, 99))} className={css.alertBadge as string}>{chipButton}</Badge>
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
                  <Avatar background={visual.color} acronym={stampAcronymOf(employee.id, employee.name)} size={42} />
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
                  const subtitle = projections.get(summary.sessionId) ?? subtitleOf(summary)
                  const unread = summary.updatedAt > readWatermarkOf(summary.sessionId)
                  return (
                    <button key={summary.sessionId} type="button" className={css.recentRow} onClick={() => { openSession(summary) }}>
                      <span className={css.recentAva}>
                        {preset !== undefined
                          ? (
                            <Badge color="var(--dshm-success)" content={Badge.dot} className={css.recentAvaDot as string}>
                              <Avatar background={colleagueColor(preset)} acronym={stampAcronymOf(preset, titleOf(summary))} size={42} />
                            </Badge>
                          )
                          : <Avatar background={colleagueColor(preset)} acronym={stampAcronymOf(preset, titleOf(summary))} size={42} />}
                      </span>
                      <span className={css.recentMain}>
                        <span className={css.recentTop}>
                          <span className={css.recentTitle}>{titleOf(summary)}</span>
                          <span className={css.recentTime}>{relativeTimeOf(summary.updatedAt)}</span>
                          {unread && (
                            <span className={css.recentBadge} aria-label="有新消息">
                              <Badge color="var(--dshm-danger)" content={Badge.dot} />
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

/** The hero date line: 10月5日 周一. */
function headDateOf(now: Date): string {
  const weekday = now.toLocaleDateString('zh-CN', { weekday: 'short' })
  return `${now.getMonth() + 1}月${now.getDate()}日 ${weekday}`
}
