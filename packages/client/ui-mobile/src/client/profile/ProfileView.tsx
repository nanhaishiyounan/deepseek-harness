/**
 * The me tab (v3, 03 §4.10): the identity card, the two derived ledger
 * metrics (本月登记 counts this month's submit-receipt fences in the fill
 * assistant's sessions; 待审核 counts the locally marked review sessions),
 * and the settings rows — the dark switch flips data-theme immediately and
 * persists, data/about open their dialogs.
 */

import { useEffect, useMemo, useState, type JSX } from 'react'
import { Dialog, Switch } from 'antd-mobile'
import { Database, Info, Moon } from 'lucide-react'
import type { MobileIdentity } from '../auth.ts'
import { Avatar } from '../ui.tsx'
import { pendingReviewSessions } from '../draftStore.ts'
import { listSessions, readHistory } from '../sessionsService.ts'
import { foldHistory } from '../fold.ts'
import css from './profile.module.css'

/** Profile props: the identity, the theme pair, and the logout action. */
export interface ProfileViewProps {
  readonly identity: MobileIdentity
  readonly dark: boolean
  readonly onDarkChange: (dark: boolean) => void
  readonly onLogout: () => void
}

/** The me tab. */
export function ProfileView({ identity, dark, onDarkChange, onLogout }: ProfileViewProps): JSX.Element {
  const [monthlyCount, setMonthlyCount] = useState<number | undefined>(undefined)
  const pendingCount = useMemo(() => pendingReviewSessions().size, [])

  // 本月登记: count the submit-receipt fences across this month's fill
  // assistant sessions (derived from the durable log, 01 ④f-2).
  useEffect(() => {
    let alive = true
    void listSessions().then(async (sessions) => {
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      const monthly = sessions
        .filter(row => (row.agentPreset === 'mobile-form-assistant' || row.agentPreset === undefined)
          && row.updatedAt >= monthStart.getTime())
        .slice(0, 20)
      const windows = await Promise.all(monthly.map(async row => readHistory(row.sessionId).catch(() => [])))
      if (!alive) return
      const count = windows.reduce((sum, events) => sum + foldHistory(events).items
        .filter(item => item.kind === 'receipt').length, 0)
      setMonthlyCount(count)
    }, () => {
      // A failed read leaves the metric unrevealed rather than wrong.
      if (alive) setMonthlyCount(undefined)
    })
    return () => { alive = false }
  }, [])

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h1 className={css.headerTitle}>我的</h1>
      </header>

      <section className={css.userCard} aria-label="身份卡">
        <Avatar background="#1c2b29" acronym="我" size={48} />
        <div className={css.userMain}>
          <span className={css.userName}>{identity.name}</span>
          <span className={css.userMeta}>{identity.phone} · 演示租户 · 管理员</span>
        </div>
        <button type="button" className={css.logout} onClick={onLogout}>退出登录</button>
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

      <section className={css.group} aria-label="设置">
        <div className={css.entry}>
          <span className={css.entryIcon}><Moon size={18} aria-hidden="true" /></span>
          <span className={css.entryMain}>
            <span className={css.entryTitle}>外观</span>
            <span className={css.entryHint}>深色模式</span>
          </span>
          <Switch checked={dark} aria-label="深色模式" onChange={onDarkChange} />
        </div>
        <button
          type="button"
          className={css.entry}
          onClick={() => {
            void Dialog.alert({
              title: '数据',
              content: '会话与业务数据存储于服务端，与 PC 工作台同库；本机仅保留主题与输入中的草稿。',
              confirmText: '知道了',
            })
          }}
        >
          <span className={css.entryIcon}><Database size={18} aria-hidden="true" /></span>
          <span className={css.entryMain}>
            <span className={css.entryTitle}>数据</span>
            <span className={css.entryHint}>会话与缓存</span>
          </span>
          <span className={css.chevron} aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className={css.entry}
          onClick={() => {
            void Dialog.alert({ title: '关于', content: '食链通移动端 v3.0 · DeepSeek Harness', confirmText: '知道了' })
          }}
        >
          <span className={css.entryIcon}><Info size={18} aria-hidden="true" /></span>
          <span className={css.entryMain}>
            <span className={css.entryTitle}>关于</span>
            <span className={css.entryHint}>版本 v3.0</span>
          </span>
          <span className={css.chevron} aria-hidden="true">›</span>
        </button>
      </section>

      <footer className={css.footer}>DeepSeek Harness 移动端 v3 · NocoBase 业务系统的 AI 员工入口</footer>
    </div>
  )
}
