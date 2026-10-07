/**
 * The v3 receipt card: the landing-row receipt as a ledger-paper ticket
 * (W9-B5) — the「收」round seal heading the copy, the money summary as the big
 * number in the monospace face, the date/count/id summaries in a two-column
 * grid, the three-dot ticket trail (对话→确认→已落库), the row-number phase
 * stamp, the ticket-number strip, the view-record entry, and the「收讫」
 * sign-off stamp floating off the bottom-right corner (rotated -6°, the F3
 * fusion — like the chop on a paper ledger). No raw JSON ever renders.
 */

import { type JSX } from 'react'
import { Button } from 'antd-mobile'
import type { SubmitReceiptPayload } from '../../protocol.ts'
import css from './v3.module.css'
import { PhaseStamp } from './PhaseStamp.tsx'

/** v3 receipt-card props: the receipt payload and the view-record sink. */
export interface ReceiptCardProps {
  readonly payload: SubmitReceiptPayload
  /** Sends the view-record follow-up when the entry is offered. */
  readonly onView?: (() => void) | undefined
}

/** The three-step trail labels (all complete on a receipt). */
const TRAIL = ['对话', '确认', '已落库'] as const

/** The receipt summary rows the ticket-number strip carries (id-kind, or a
 *  row a model labeled 单号 with a text kind). */
function ticketOf(payload: SubmitReceiptPayload): { readonly label: string; readonly value: string } | undefined {
  return payload.summary.find(row => row.kind === 'id')
    ?? payload.summary.find(row => row.label.includes('单号'))
}

/**
 * The v3 receipt card.
 * @param props - the submit_receipt payload and the optional view sink.
 * @returns the receipt card.
 */
export function ReceiptCard({ payload, onView }: ReceiptCardProps): JSX.Element {
  const [hero, ...rest] = payload.summary
  const heroIsMoney = hero?.kind === 'money'
  const ticket = ticketOf(payload)
  return (
    <section className={`${css.card} ${css.receiptCard}`} data-testid="receipt-card-v3" aria-label="落库回执卡">
      <header className={css.cardHeader}>
        <div className={css.cardTitles}>
          <span className={css.cardBiz}>
            <span className={css.receiptSeal} aria-hidden="true">收</span>
            {payload.form.label}已登记
          </span>
        </div>
        <PhaseStamp phase="submitted" rowId={payload.rowId} />
      </header>
      {heroIsMoney && (
        <div className={css.metricHero}>
          <span className={css.metricHeroValue}>{hero.value}</span>
          <span className={css.metricHeroLabel}>{hero.label}</span>
        </div>
      )}
      <div className={css.metricGrid}>
        {(heroIsMoney ? rest : payload.summary).map(row => (
          <div key={`${row.label}:${row.value}`} className={css.metricCell}>
            <span className={css.metricValue}>{row.value}</span>
            <span className={css.metricLabel}>{row.label}</span>
          </div>
        ))}
      </div>
      <span className={css.receiptSign} aria-hidden="true">收讫</span>
      <div className={css.steps} aria-label="三步流程">
        {TRAIL.map((label, index) => (
          <span key={label} className={css.stepRun}>
            {index > 0 && <span className={css.stepLine} aria-hidden="true" />}
            <span className={css.stepDot} aria-hidden="true" />
            <span className={css.stepLabel}>{label}</span>
          </span>
        ))}
      </div>
      {ticket !== undefined && (
        <div className={css.ticketStrip}>
          <span className={css.ticketLabel}>{ticket.label}</span>
          <span className={css.ticketValue}>{ticket.value}</span>
        </div>
      )}
      {onView !== undefined && (
        <footer className={css.receiptFooter}>
          <Button size="small" onClick={onView}>查看这条记录</Button>
        </footer>
      )}
    </section>
  )
}
