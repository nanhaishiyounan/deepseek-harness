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
 * 403 with its fact, never a silent no-op).
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { Button, PullToRefresh, Toast } from 'antd-mobile'
import { BellRing } from 'lucide-react'
import { loadIdentity } from '../auth.ts'
import { EmptyState, SkelCard } from '../ui.tsx'
import { PageNav } from '../PageNav.tsx'
import { goBackOr } from '../router.ts'
import { logClientError, messageOf } from '../hooks.ts'
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

/** The alerts page. */
export function AlertsView(): JSX.Element {
  const identity = loadIdentity()
  const [read, setRead] = useState<AlertsRead | undefined>(undefined)
  const [pending, setPending] = useState<Pending | undefined>(undefined)
  // The alert-center in-app notices (recall orders' owner notifications,
  // W6-R3): a separate read that degrades on its own — a notices failure
  // never blanks the alerts list.
  const [notices, setNotices] = useState<readonly RecallNoticeRow[] | 'error'>([])

  const refresh = useCallback(async (): Promise<void> => {
    if (identity === undefined) return
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
  }, [identity])

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
          {read !== undefined && !('error' in read) && read.rows.map((row) => {
            const meta = severityMeta(row)
            const days = daysText(row)
            const mineClaimed = row.owner === me && row.status === 'acknowledged'
            const busy = pending?.id === row.id
            return (
              <article key={row.id} className={`${css.alertCard} ${meta.tier}`} data-testid="alert-row">
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
