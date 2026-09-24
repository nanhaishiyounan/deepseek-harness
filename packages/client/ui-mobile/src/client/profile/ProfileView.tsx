/**
 * The me tab (v6「我的」, the design's page-me over the v5 ledger): the
 * identity card (the 54px gradient avatar over the user gradient), the ledger
 * metrics (本月登记 counts this month's submit-receipt fences; 待审核 counts
 * the locally marked review sessions), the recent receipts strip, the
 * workspace card, quick-start shortcuts, and the settings in the design's
 * set-group cards (偏好 / 数据与关于) — the dark switch flips data-theme
 * immediately and persists; the run-mode switch, the local notification
 * toggle, and the demo-data cleanup keep their behavior. The footer rides
 * the dashed disclaimer note. Logout confirms first in its own destructive
 * block.
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { Dialog, List, Switch, Toast } from 'antd-mobile'
import { Bell, Bot, Database, Info, LogOut, Moon, Trash2 } from 'lucide-react'
import type { MobileIdentity } from '../auth.ts'
import { Avatar } from '../ui.tsx'
import { navigate } from '../router.ts'
import { createSession } from '../sessionsService.ts'
import { currentRunMode, setRunMode, type RunMode } from '../runMode.ts'
import { clearDemoData } from '../demoSeed.ts'
import { subscribeWork, todayStats, workSnapshot } from '../workStore.ts'
import { pendingReviewSessions } from '../draftStore.ts'
import { listSessions, readHistory } from '../sessionsService.ts'
import { foldHistory } from '../fold.ts'
import type { SubmitReceiptPayload } from '../protocol.ts'
import css from './profile.module.css'

/** Profile props: the identity, the theme pair, and the logout action. */
export interface ProfileViewProps {
  readonly identity: MobileIdentity
  readonly dark: boolean
  readonly onDarkChange: (dark: boolean) => void
  readonly onLogout: () => void
}

/** One recent receipt strip row. */
export interface ReceiptStripRow {
  readonly sessionId: string
  readonly payload: SubmitReceiptPayload
}

/** The about entry's single version source (the list row and the dialog read one constant). */
const APP_VERSION = 'v6'

/** The quick-start shortcuts (label + the session preset they open). */
const SHORTCUTS: ReadonlyArray<{ readonly label: string; readonly preset: string }> = [
  { label: '登记采购单', preset: 'mobile-form-assistant' },
  { label: '登记出库单', preset: 'mobile-form-assistant' },
  { label: '问经营参谋', preset: 'business-advisor' },
]

/** The me tab. */
export function ProfileView({ identity, dark, onDarkChange, onLogout }: ProfileViewProps): JSX.Element {
  const [monthlyCount, setMonthlyCount] = useState<number | undefined>(undefined)
  const [recent, setRecent] = useState<readonly ReceiptStripRow[] | undefined>(undefined)
  const [starting, setStarting] = useState(false)
  const pendingCount = useMemo(() => pendingReviewSessions().size, [])
  const store = useSyncExternalStore(subscribeWork, workSnapshot)
  const stats = useMemo(() => todayStats(store.items, Date.now()), [store.items])
  const cumulativeDone = useMemo(() => store.items.filter(item => item.status === 'done').length, [store.items])
  /** The resolved run mode (live=true); the explicit switch is synchronous. */
  const [liveMode, setLiveMode] = useState(false)
  const [notify, setNotify] = useState(false)

  useEffect(() => {
    let alive = true
    void currentRunMode().then((mode) => { if (alive) setLiveMode(mode === 'live') })
    return () => { alive = false }
  }, [])

  // 本月登记 + 最近回执: fold the newest fill-assistant sessions (derived
  // from the durable log, 01 ④f-2); this month's fences count, and the strip
  // leads with the newest receipts (sessions list newest-first, so the head
  // of the collected order is the latest three, newest first).
  useEffect(() => {
    let alive = true
    void listSessions().then(async (sessions) => {
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      const rows = sessions
        .filter(row => row.agentPreset === 'mobile-form-assistant' || row.agentPreset === undefined)
        .slice(0, 10)
      const windows = await Promise.all(rows.map(async row => [row.sessionId, await readHistory(row.sessionId).catch(() => [])] as const))
      if (!alive) return
      let count = 0
      const receipts: ReceiptStripRow[] = []
      for (const [sessionId, events] of windows) {
        for (const item of foldHistory(events).items) {
          if (item.kind !== 'receipt') continue
          if (item.time >= monthStart.getTime()) count += 1
          receipts.push({ sessionId, payload: item.payload })
        }
      }
      setMonthlyCount(count)
      setRecent(receipts.slice(0, 3))
    }, () => {
      // A failed read leaves the metric unrevealed rather than wrong.
      if (alive) {
        setMonthlyCount(undefined)
        setRecent(undefined)
      }
    })
    return () => { alive = false }
  }, [])

  const startShortcut = async (preset: string): Promise<void> => {
    /* v8 ignore next -- the disabled shortcut buttons screen the busy re-entry arm. */
    if (starting) return
    setStarting(true)
    try {
      const sessionId = await createSession(preset)
      navigate(`#/chat/${sessionId}`)
    } catch {
      // The session row will not exist; the shortcut stays on the page.
      setStarting(false)
      return
    }
    setStarting(false)
  }

  const confirmLogout = (): void => {
    void Dialog.confirm({
      title: '退出登录',
      content: '退出后需要重新验证手机号；会话与业务数据保留在服务端。',
      confirmText: '退出',
      cancelText: '取消',
      onConfirm: onLogout,
    })
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h1 className={css.headerTitle}>我的</h1>
      </header>

      <section className={css.userCard} aria-label="身份卡">
        <Avatar background="var(--dshm-user-grad)" acronym="我" size={54} />
        <div className={css.userMain}>
          <span className={css.userName}>{identity.name}</span>
          <span className={css.userMeta}>{identity.phone} · 演示租户 · 管理员</span>
        </div>
      </section>

      <section className={css.metrics} aria-label="本月台账">
        <div className={css.metricRow}>
          <span className={css.metricLabel}>本月登记</span>
          <span className={css.metricValue}>{monthlyCount === undefined ? '—' : `${String(monthlyCount)} 条`}</span>
        </div>
        <div className={css.metricDivider} aria-hidden="true" />
        <div className={css.metricRow}>
          <span className={css.metricLabel}>待审核</span>
          <span className={css.metricValue}>{String(pendingCount)} 条</span>
        </div>
      </section>

      <button type="button" className={css.workspace} aria-label="工作空间" onClick={() => { navigate('#/work') }}>
        <span className={css.workspaceTitle}>工作空间</span>
        <span className={css.workspaceGrid}>
          <span className={css.workspaceCell}>
            <span className={css.workspaceValue}>{String(stats.todo)}</span>
            <span className={css.workspaceLabel}>今日待处理</span>
          </span>
          <span className={css.workspaceCell}>
            <span className={css.workspaceValue}>{String(stats.doing)}</span>
            <span className={css.workspaceLabel}>进行中</span>
          </span>
          <span className={css.workspaceCell}>
            <span className={css.workspaceValue}>{String(stats.review)}</span>
            <span className={css.workspaceLabel}>待确认</span>
          </span>
          <span className={css.workspaceCell}>
            <span className={css.workspaceValue}>{String(cumulativeDone)}</span>
            <span className={css.workspaceLabel}>累计完成</span>
          </span>
        </span>
      </button>

      {recent !== undefined && recent.length > 0 && (
        <section className={css.recentBlock} aria-label="最近回执">
          <h2 className={css.recentTitle}>最近回执</h2>
          {recent.map(row => (
            <button
              key={`${row.sessionId}:${row.payload.rowId}`}
              type="button"
              className={css.recentRow}
              onClick={() => { navigate(`#/chat/${row.sessionId}`) }}
            >
              <span className={css.receiptNo}>№{row.payload.rowId}</span>
              <span className={css.recentForm}>{row.payload.form.label}</span>
              <span className={css.recentHero}>
                {row.payload.summary.find(entry => entry.kind === 'money')?.value ?? '已登记'}
              </span>
            </button>
          ))}
        </section>
      )}

      <section className={css.shortcuts} aria-label="常用操作">
        {SHORTCUTS.map(shortcut => (
          <button
            key={shortcut.label}
            type="button"
            className={css.shortcut}
            disabled={starting}
            onClick={() => { void startShortcut(shortcut.preset) }}
          >
            {shortcut.label}
          </button>
        ))}
      </section>

      <section className={css.setGroup} aria-label="偏好设置">
        <h2 className={css.setTitle}>偏好</h2>
        <List className={css.settings}>
          <List.Item
            prefix={<Moon size={18} aria-hidden="true" />}
            title="深色模式"
            extra={<Switch checked={dark} aria-label="深色模式" onChange={onDarkChange} />}
          />
          <List.Item
            prefix={<Bot size={18} aria-hidden="true" />}
            title="真实模式"
            description="关闭即演示模式：模拟执行，不调用模型"
            extra={(
              <Switch
                checked={liveMode}
                aria-label="真实模式"
                onChange={(next) => {
                  setLiveMode(next)
                  const mode: RunMode = next ? 'live' : 'demo'
                  setRunMode(mode)
                  Toast.show({ content: next ? '已切换为真实模式' : '已切换为演示模式' })
                }}
              />
            )}
          />
          <List.Item
            prefix={<Bell size={18} aria-hidden="true" />}
            title="通知"
            description="本地开关占位，默认关闭"
            extra={<Switch checked={notify} aria-label="通知" onChange={setNotify} />}
          />
        </List>
      </section>

      <section className={css.setGroup} aria-label="数据与关于">
        <h2 className={css.setTitle}>数据与关于</h2>
        <List className={css.settings}>
          <List.Item
            prefix={<Trash2 size={18} aria-hidden="true" />}
            title="清除演示数据"
            description="删除全部带「示例」标记的工作与文件，可重新生成"
            onClick={() => {
              void Dialog.confirm({
                title: '清除演示数据',
                content: '将删除全部带「示例」标记的工作与文件；真实数据不受影响，示例可重新生成。',
                confirmText: '清除',
                cancelText: '取消',
                onConfirm: () => {
                  clearDemoData()
                  Toast.show({ content: '演示数据已清除，重新进入应用可再次生成' })
                },
              })
            }}
          />
          <List.Item
            prefix={<Database size={18} aria-hidden="true" />}
            title="数据"
            description="会话与业务数据存储于服务端，与 PC 工作台同库；本机仅保留主题与输入中的草稿。"
            onClick={() => {
              void Dialog.alert({ title: '数据', content: '会话与业务数据存储于服务端，与 PC 工作台同库；本机仅保留主题与输入中的草稿。', confirmText: '知道了' })
            }}
          />
          <List.Item
            prefix={<Info size={18} aria-hidden="true" />}
            title="关于"
            extra={APP_VERSION}
            onClick={() => {
              void Dialog.alert({ title: '关于', content: `食链通移动端 ${APP_VERSION} · DeepSeek Harness`, confirmText: '知道了' })
            }}
          />
        </List>
      </section>

      <button type="button" className={css.logout} onClick={confirmLogout}>
        <LogOut size={16} aria-hidden="true" />
        退出登录
      </button>

      <footer className={css.disclaimerNote}>DeepSeek Harness 移动端 · NocoBase 业务系统的 AI 员工入口</footer>
    </div>
  )
}
