/**
 * The W6-B2 alerts page (`#/alerts`): the signed-in user's routed alerts read
 * live from wfl_alerts over the gateway's realtime nocobase forward (the
 * gateway's row scope carries the routed-user cut server-side since W6-R2).
 * Segmented counts by rule type, the red/yellow severity tiers on every row
 * (critical rows carry the red rail), pull-to-refresh plus a 30s poll, and
 * the read failure leaves the error card plus a client_error trace (never a
 * silent dash). W6-R2 C-1: every row carries its own actions — 认领 for a
 * routed user, 关闭 for the claimant — through nocobase.alertAct → the
 * engine's single write entrance; the engine's (from_state, action,
 * actor_role) transition table decides and a refusal surfaces inline (the
 * 403 with its fact, never a silent no-op). W8-B2: adjacent still-open rows
 * of the same rule + title fold into one collapsible group card (the count
 * badge and the newest raised time on the header; claimed/closed rows never
 * join a group), and every row carries its raised timestamp.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { Button, PullToRefresh, Toast } from 'antd-mobile'
import { BellRing, ChevronDown } from 'lucide-react'
import { loadIdentity } from '../auth.ts'
import { EmptyState, SkelCard } from '../ui.tsx'
import { PageNav } from '../PageNav.tsx'
import { goBackOr } from '../router.ts'
import { logClientError, messageOf } from '../hooks.ts'
import { relativeTimeOf } from '../sessionsService.ts'
import { actMyAlert, listMyAlerts, listMyRecallNotices, type AlertRow, type RecallNoticeRow } from '../ledgerService.ts'
import css from './alerts.module.css'

/** The rule-type segment labels (the PC alert center shares the vocabulary). */
const RULE_LABELS: Readonly<Record<string, string>> = {
  expiry: '效期',
  cert_due: '资质',
  ar_overdue: '账期',
  quality_abnormal: '质量',
  ccp_deviation: 'CCP',
  inspection_fail: '检退',
  calibration_due: '计量',
  maint_overdue: '维保',
}

/** The page's load state (one shape for the first read and every refresh). */
type AlertsRead = { readonly rows: readonly AlertRow[] } | { readonly error: string }

/** The severity tier's display pair (the label plus the red/yellow rail class). */
function severityMeta(row: AlertRow): { label: string; tier: string | undefined } {
  return row.severity === 'critical'
    ? { label: '紧急', tier: css.critical }
    : { label: '关注', tier: css.warning }
}

/** The days-left cell: negative = overdue days, positive = days to the date. */
function daysText(row: AlertRow): string | undefined {
  if (row.daysLeft === undefined) return undefined
  if (row.daysLeft < 0) return `逾期 ${String(-row.daysLeft)} 天`
  if (row.daysLeft === 0) return '今日到期'
  return `${String(row.daysLeft)} 天后到期`
}

/** One in-flight row action (the button disables and shows the acting word). */
type Pending = { readonly id: number; readonly verb: string }

/** One grouping pass over the read: a run of adjacent still-open, unclaimed rows of the same rule + title. */
interface AlertEntry {
  /** Whether the run's rows may fold (open, unclaimed). */
  readonly foldable: boolean
  readonly rows: AlertRow[]
}

/**
 * Group the read's rows (W8-B2): adjacent open-and-unclaimed rows sharing
 * ruleType + title gather into one run (the group card); every other row
 * stays its own single-row run. The wire order (newest first) is preserved.
 * @param rows - the routed rows as read.
 * @returns the ordered runs.
 */
function groupAlerts(rows: readonly AlertRow[]): AlertEntry[] {
  const entries: AlertEntry[] = []
  for (const row of rows) {
    const foldable = row.status === 'open' && row.owner === undefined
    const last = entries[entries.length - 1]
    const head = last?.rows[0]
    if (foldable && last !== undefined && head !== undefined
      && head.ruleType === row.ruleType && head.title === row.title) {
      last.rows.push(row)
      continue
    }
    entries.push({ foldable, rows: [row] })
  }
  return entries
}

/** The alerts page. */
export function AlertsView(): JSX.Element {
  const identity = loadIdentity()
  const [read, setRead] = useState<AlertsRead | undefined>(undefined)
  const [pending, setPending] = useState<Pending | undefined>(undefined)
  /** The group headers the user opened (W8-B2 local memory, keyed rule+title). */
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set())
  // The alert-center in-app notices (recall orders' owner notifications,
  // W6-R3): a separate read that degrades on its own — a notices failure
  // never blanks the alerts list.
  const [notices, setNotices] = useState<readonly RecallNoticeRow[] | 'error'>([])

  const refresh = useCallback(async (): Promise<void> => {
    // The identity is read at call time, never from a render-closure object:
    // `loadIdentity()` parses a fresh object per call, so keying this callback
    // on it re-runs the read effect after every render (an unbounded refetch
    // loop). Account switches remount this page via the App identity gate, so
    // no identity dependency is owed here.
    if (loadIdentity() === undefined) return
    try {
      setRead({ rows: await listMyAlerts() })
    } catch (cause) {
      logClientError('alerts.list', cause)
      setRead({ error: messageOf(cause) })
    }
    try {
      setNotices(await listMyRecallNotices())
    } catch (cause) {
      logClientError('alerts.notices', cause)
      setNotices('error')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The 30s poll: the hourly scan and other surfaces' acts move rows
  // server-side; the next poll lands the change here.
  useEffect(() => {
    const timer = window.setInterval(() => { void refresh() }, 30_000)
    return () => { window.clearInterval(timer) }
  }, [refresh])

  /** Run one row action through the engine entrance; a refusal toasts its fact. */
  const act = useCallback(async (row: AlertRow, action: 'claim' | 'resolve'): Promise<void> => {
    const verb = action === 'claim' ? '认领' : '关闭'
    setPending({ id: row.id, verb })
    try {
      await actMyAlert(row, action, action === 'resolve' ? '移动端关闭' : undefined)
      Toast.show({ content: `${verb}成功` })
      await refresh()
    } catch (cause) {
      logClientError('alerts.act', cause)
      Toast.show({ content: `${verb}被拒：${messageOf(cause)}` })
    } finally {
      setPending(undefined)
    }
  }, [refresh])

  const segments = useMemo(() => {
    if (read === undefined || 'error' in read) return []
    const counts = new Map<string, number>()
    for (const row of read.rows) {
      const label = RULE_LABELS[row.ruleType] ?? row.ruleType
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()]
  }, [read])

  const criticalCount = useMemo(() => {
    if (read === undefined || 'error' in read) return 0
    return read.rows.filter(row => row.severity === 'critical').length
  }, [read])

  const me = identity?.username ?? ''
  const rowSink = { me, pending, act }
  return (
    <div className={css.page}>
      <PageNav title="我的预警" onBack={() => { goBackOr('#/') }} />
      <PullToRefresh onRefresh={async () => { await refresh() }}>
        <div className={css.body}>
          <section className={css.segRow} aria-label="按规则类型">
            {segments.length > 0
              ? <span className={css.segChip}>
                <span className={css.segCount}>{String(criticalCount)}</span>
                紧急
              </span>
              : <span className={css.segHint}>{read === undefined ? '加载中…' : '预警'}</span>}
            {segments.map(([label, count]) => (
              <span key={label} className={css.segChip}>
                <span className={css.segCount}>{String(count)}</span>
                {label}
              </span>
            ))}
            {notices !== 'error' && notices.filter(n => n.category === 'recall').length > 0 && (
              <span className={css.segChip}>
                <span className={css.segCount}>{String(notices.filter(n => n.category === 'recall').length)}</span>
                召回
              </span>
            )}
            {notices !== 'error' && notices.filter(n => n.category === 'dunning').length > 0 && (
              <span className={css.segChip}>
                <span className={css.segCount}>{String(notices.filter(n => n.category === 'dunning').length)}</span>
                催收
              </span>
            )}
          </section>

          {read === undefined && (
            <div className={css.skelGroup} role="status" aria-label="正在加载预警">
              <SkelCard />
              <SkelCard />
              <SkelCard />
            </div>
          )}
          {'error' in (read ?? {}) && read !== undefined && 'error' in read && (
            <div className={css.errorCard} role="alert">
              预警加载失败：{read.error}
              <Button type="button" fill="none" size="small" className={css.retryLink} onClick={() => { void refresh() }}>重试</Button>
            </div>
          )}
          {read !== undefined && !('error' in read) && read.rows.length === 0 && (
            <EmptyState
              icon={<BellRing size={22} strokeWidth={1.8} />}
              title="当前没有路由给你的预警"
              description="效期/资质/账期/质量四路规则的扫描结果会出现在这里"
            />
          )}
          {read !== undefined && !('error' in read) && groupAlerts(read.rows).map((entry) => {
            const head = entry.rows[0]
            if (head === undefined || !entry.foldable || entry.rows.length < 2) {
              return entry.rows.map(row => <AlertRowCard key={row.id} row={row} {...rowSink} />)
            }
            const groupKey = `${head.ruleType}:${head.title}`
            const expanded = openGroups.has(groupKey)
            const newest = groupTimeOf(entry.rows)
            return (
              <article key={groupKey} className={css.alertGroup} data-testid="alert-group">
                <button
                  type="button"
                  className={css.groupHead}
                  aria-expanded={expanded}
                  aria-label={`${RULE_LABELS[head.ruleType] ?? head.ruleType}预警 共${String(entry.rows.length)}条`}
                  onClick={() => {
                    setOpenGroups((current) => {
                      const next = new Set(current)
                      if (next.has(groupKey)) next.delete(groupKey)
                      else next.add(groupKey)
                      return next
                    })
                  }}
                >
                  <span className={css.sevTag} data-severity={head.severity}>
                    {severityMeta(head).label}
                  </span>
                  <span className={css.groupTitle}>
                    {RULE_LABELS[head.ruleType] ?? head.ruleType}预警
                  </span>
                  <span className={css.groupCount}>×{String(entry.rows.length)}</span>
                  {newest !== undefined && (
                    <span className={css.groupTime}>最新 {relativeTimeOf(newest)}</span>
                  )}
                  <ChevronDown
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className={expanded ? `${css.groupChevron} ${css.groupChevronOpen}` : css.groupChevron}
                  />
                </button>
                {expanded && (
                  <div className={css.groupBody}>
                    {entry.rows.map(row => <AlertRowCard key={row.id} row={row} {...rowSink} />)}
                  </div>
                )}
              </article>
            )
          })}
          {read !== undefined && !('error' in read) && read.rows.length > 0 && (
            <p className={css.footNote}>行内「认领」把预警认到本人名下，「关闭」仅认领人可用；引擎按路由责任人白名单与状态流校验，越权或越态操作会被拒绝并提示原因</p>
          )}
          {notices === 'error' && (
            <p className={css.footNote}>召回通知读取失败（alert-center 渠道）——预警列表不受影响</p>
          )}
          {notices !== 'error' && notices.length > 0 && (
            <>
              {notices.map(notice => (
                <article key={notice.id} className={css.alertCard} data-testid="recall-notice" data-severity={notice.category === 'dunning' ? 'warning' : 'critical'}>
                  <header className={css.alertHead}>
                    <span className={css.sevTag} data-severity={notice.category === 'dunning' ? 'warning' : 'critical'}>
                      {notice.category === 'dunning' ? '催收' : notice.category === 'recall' ? '召回' : '通知'}
                    </span>
                    <span className={css.ruleLabel}>{notice.category === 'dunning' ? '催收任务' : notice.category === 'recall' ? '召回任务' : '任务通知'}</span>
                  </header>
                  <div className={css.alertTitle}>{notice.title}</div>
                  <p className={css.footNote}>{notice.content}</p>
                </article>
              ))}
              <p className={css.footNote}>任务通知来自预警中心渠道（notificationInAppMessages）：催收任务在 财务工作台 跟进，召回任务在 食品合规→召回管理 流转</p>
            </>
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}

/** The newest raised time of one group's rows (undefined when no row carries one). */
function groupTimeOf(rows: readonly AlertRow[]): number | undefined {
  let newest: number | undefined = undefined
  for (const row of rows) {
    if (row.createdAt !== undefined && (newest === undefined || row.createdAt > newest)) newest = row.createdAt
  }
  return newest
}

/** One alert row's render sinks (the busy action state and the act entrance). */
interface RowSink {
  readonly me: string
  readonly pending: Pending | undefined
  readonly act: (row: AlertRow, action: 'claim' | 'resolve') => Promise<void>
}

/** One routed alert row: the tiered card with its claim/close action. */
function AlertRowCard({ row, me, pending, act }: { readonly row: AlertRow } & RowSink): JSX.Element {
  const meta = severityMeta(row)
  const days = daysText(row)
  const mineClaimed = row.owner === me && row.status === 'acknowledged'
  const busy = pending?.id === row.id
  return (
    <article className={`${css.alertCard} ${meta.tier}`} data-testid="alert-row">
      <header className={css.alertHead}>
        <span className={css.sevTag} data-severity={row.severity}>{meta.label}</span>
        <span className={css.ruleLabel}>{RULE_LABELS[row.ruleType] ?? row.ruleType}预警</span>
        {row.owner === undefined
          ? <span className={css.claimHint}>待认领</span>
          : <span className={css.claimed}>{row.status === 'acknowledged' ? `已认领 · ${row.owner}` : row.status}</span>}
      </header>
      <div className={css.alertTitle}>{row.title}</div>
      <footer className={css.alertFoot}>
        <span className={css.entityCode}>{row.entityCode}</span>
        <span className={css.actGroup}>
          {row.createdAt !== undefined && <span className={css.timeCell}>{relativeTimeOf(row.createdAt)}</span>}
          {days !== undefined && <span className={css.daysCell}>{days}</span>}
          {row.status !== 'resolved' && !mineClaimed && (
            <Button
              type="button" size="small" fill="outline" color="primary"
              className={css.actBtn} disabled={busy} aria-label={`认领预警 ${row.entityCode}`}
              onClick={() => { void act(row, 'claim') }}
            >
              {busy === true && pending?.verb === '认领' ? '认领中…' : '认领'}
            </Button>
          )}
          {mineClaimed && (
            <Button
              type="button" size="small" fill="solid" color="primary"
              className={css.actBtn} disabled={busy} aria-label={`关闭预警 ${row.entityCode}`}
              onClick={() => { void act(row, 'resolve') }}
            >
              {busy === true && pending?.verb === '关闭' ? '关闭中…' : '关闭'}
            </Button>
          )}
        </span>
      </footer>
    </article>
  )
}
