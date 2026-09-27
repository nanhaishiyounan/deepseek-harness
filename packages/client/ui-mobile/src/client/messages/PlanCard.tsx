/**
 * The plan card (B7) — the MRP suggestion's conversation-side confirmation
 * surface (ERPNext's 计划单人工确认范式): one open suggestion rendered as
 * the pending card (plan type stamp, 物料/数量/建议下单日/驱动 SO summary
 * rows, 确认转单/忽略 dual actions that send the fenced plan_confirm user
 * message), and the post-confirm outcome as the read-only result card (the
 * converted doc's back-reference or the dismissal). Visual family is the
 * approval card's ledger material (reportCard head / metric grid) plus the
 * stamp and chip vocabulary.
 */

import type { JSX } from 'react'
import { Button } from 'antd-mobile'
import type { PlanConfirmPayload, PlanResultPayload, PlanSuggestPayload } from '../protocol.ts'
import { buildPlanConfirmMessage } from '../protocol.ts'
import css from './messages.module.css'

/** Plan-card props: the pending/result payload, the send sink, and the busy gate. */
export interface PlanCardProps {
  readonly payload: PlanSuggestPayload | PlanResultPayload
  /** Sends the fenced plan_confirm user message (pending cards only). */
  readonly onSend: (text: string) => void
  readonly disabled: boolean
}

/** The plan type's stamp seal and label. */
const PLAN_TYPE_VIEW: Readonly<Record<PlanSuggestPayload['planType'], { seal: string; label: string }>> = {
  MO: { seal: '产', label: '生产建议' },
  PR: { seal: '购', label: '采购建议' },
}

/** Serialize one plan_confirm message the way the wire fence carries it. */
const serialize = (payload: PlanConfirmPayload): string => JSON.stringify(payload)

/**
 * The plan card.
 * @param props - the payload, send sink, busy gate.
 * @returns the card element.
 */
export function PlanCard({ payload, onSend, disabled }: PlanCardProps): JSX.Element {
  const pending = payload.type === 'plan_suggest'
  const view = PLAN_TYPE_VIEW[payload.planType]
  const confirm = (action: 'confirm' | 'dismiss'): void => {
    if (payload.type !== 'plan_suggest') return
    onSend(`\`\`\`dsh\n${serialize(buildPlanConfirmMessage(payload, action))}\n\`\`\``)
  }
  return (
    <section
      className={css.reportCard}
      data-testid={pending ? 'plan-card' : 'plan-card-result'}
      aria-label={`计划卡 ${view.label} ${payload.product}`}
    >
      <header className={css.reportHead}>
        <span className={css.reportTitles}>
          <span className={css.reportTitle}>{payload.product}</span>
          <span className={css.reportSubtitle}>
            {view.label}
            {pending && payload.driverSo !== undefined ? ` · 驱动 ${payload.driverSo}` : ''}
            {!pending && payload.docCode !== undefined ? ` · 已转 ${payload.docCode}` : ''}
          </span>
        </span>
        <span className={css.reportStamp} aria-hidden="true">{view.seal}</span>
      </header>
      {pending && (
        <div className={css.reportMetrics}>
          <span className={css.metricMiniCell}>
            <span className={css.metricMiniValue}>{payload.qty}</span>
            <span className={css.metricMiniLabel}>建议数量</span>
          </span>
          {payload.suggestDate !== undefined && (
            <span className={css.metricMiniCell}>
              <span className={css.metricMiniValue}>{payload.suggestDate}</span>
              <span className={css.metricMiniLabel}>建议下单日</span>
            </span>
          )}
          {payload.needDate !== undefined && (
            <span className={css.metricMiniCell}>
              <span className={css.metricMiniValue}>{payload.needDate}</span>
              <span className={css.metricMiniLabel}>需求日期</span>
            </span>
          )}
        </div>
      )}
      {!pending && (
        <div className={css.reportMetrics}>
          <span className={css.metricMiniCell}>
            <span className={css.metricMiniValue}>{payload.outcome === 'converted' ? '已转单' : '已忽略'}</span>
            <span className={css.metricMiniLabel}>处理结果</span>
          </span>
          {payload.state !== undefined && (
            <span className={css.metricMiniCell}>
              <span className={css.metricMiniValue}>{payload.state}</span>
              <span className={css.metricMiniLabel}>转出单状态</span>
            </span>
          )}
          {payload.by !== undefined && (
            <span className={css.metricMiniCell}>
              <span className={css.metricMiniValue}>{payload.by}</span>
              <span className={css.metricMiniLabel}>确认人</span>
            </span>
          )}
        </div>
      )}
      {pending && (
        <footer className={css.approvalActions}>
          <Button size="small" fill="outline" disabled={disabled} onClick={() => { confirm('dismiss') }}>忽略</Button>
          <Button size="small" color="primary" disabled={disabled} onClick={() => { confirm('confirm') }}>确认转单</Button>
        </footer>
      )}
    </section>
  )
}
