/**
 * The report card (02 §4.4, 03 §6.4) — the v5 signature component: the
 * structured AI output rendered as a report slip of the ledger family. The
 * card head pairs the title/subtitle with the 28px report stamp; metrics lay
 * out as the muted three-column grid (tone colors the value), rows as the
 * severity-dot entries, the table as the compact ticket table, and the
 * actions as the primary + secondary button row (create-task owns the last
 * primary slot; at most three buttons render). An absent `onAction` renders
 * the card read-only (the FilesView/WorkDetailView previews) — the protocol
 * itself never shows: fences, field names, and payload keys stay invisible.
 */

import type { JSX } from 'react'
import { Button } from 'antd-mobile'
import type { ReportAction, ReportPayload } from '../protocol.ts'
import css from './messages.module.css'

/** Report-card props: the payload and the action dispatch callback. */
export interface ReportCardProps {
  readonly payload: ReportPayload
  /** The dispatch callback; absent renders read-only (no action row). */
  readonly onAction?: (action: ReportAction) => void
}

/** The metric value's tone classes (03 §6.4: positive→success, danger→destructive). */
const TONE_CLASSES = {
  positive: css.metricTonePositive,
  warning: css.metricToneWarning,
  danger: css.metricToneDanger,
} as const

/** The severity dot's level classes (high→destructive / medium→warning / low→青灰). */
const LEVEL_CLASSES = {
  high: css.rowDotHigh,
  medium: css.rowDotMedium,
  low: css.rowDotLow,
} as const

/** The metric value's tone class; undefined renders the neutral foreground. */
function metricToneClass(tone: 'positive' | 'warning' | 'danger' | undefined): string | undefined {
  return tone === undefined ? undefined : TONE_CLASSES[tone]
}

/** The severity dot's level class. */
function levelClass(level: 'high' | 'medium' | 'low'): string | undefined {
  return LEVEL_CLASSES[level]
}

/**
 * The report stamp's seal character: the report type's lead character
 * (风险→险 / 周报→报 / 对比→比, 报 as the default).
 * @param title - the report title.
 * @returns the single seal character.
 */
export function stampCharOf(title: string): string {
  if (title.includes('风险')) return '险'
  if (title.includes('对比') || title.includes('比较')) return '比'
  if (title.includes('周报') || title.includes('月报') || title.includes('概览')) return '报'
  return title.trim().charAt(0) || '报'
}

/**
 * Order the actions into the render row: create-task (when present) is the
 * sole primary and sits last (thumb reach); at most three buttons render.
 * @param actions - the payload's action buttons.
 * @returns the ordered actions plus which one is primary.
 */
export function orderedActionsOf(actions: ReadonlyArray<ReportAction>): { row: readonly ReportAction[]; primaryIndex: number } {
  const createTask = actions.find(action => action.kind === 'create-task')
  if (createTask !== undefined) {
    const others = actions.filter(action => action.kind !== 'create-task').slice(0, 2)
    return { row: [...others, createTask], primaryIndex: others.length }
  }
  return { row: actions.slice(0, 3), primaryIndex: 0 }
}

/**
 * The report card.
 * @param props - the payload and the optional dispatch callback.
 * @returns the card element.
 */
export function ReportCard({ payload, onAction }: ReportCardProps): JSX.Element {
  const { row: actionRow, primaryIndex } = payload.actions === undefined
    ? { row: [], primaryIndex: -1 }
    : orderedActionsOf(payload.actions)
  // The ledger divider always renders: metrics are protocol-required (≥1).
  return (
    <section className={css.reportCard} data-testid="report-card" aria-label={`报告 ${payload.title}`}>
      <header className={css.reportHead}>
        <span className={css.reportTitles}>
          <span className={css.reportTitle}>{payload.title}</span>
          {payload.subtitle !== undefined && <span className={css.reportSubtitle}>{payload.subtitle}</span>}
        </span>
        <span className={css.reportStamp} aria-hidden="true">{stampCharOf(payload.title)}</span>
      </header>
      {payload.metrics.length > 0 && (
        <div className={css.reportMetrics}>
          {payload.metrics.map(metric => (
            <span key={metric.label} className={css.metricMiniCell}>
              <span className={`${css.metricMiniValue} ${metricToneClass(metric.tone) ?? ''}`}>{metric.value}</span>
              <span className={css.metricMiniLabel}>{metric.label}</span>
            </span>
          ))}
        </div>
      )}
      <div className={css.reportDivider} aria-hidden="true" />
      {payload.rows !== undefined && payload.rows.length > 0 && (
        <ul className={css.reportRows}>
          {payload.rows.map(row => (
            <li key={row.label} className={css.reportRow}>
              <span className={`${css.rowDot} ${levelClass(row.level)}`} aria-hidden="true" />
              <span className={css.rowTexts}>
                <span className={css.rowLabel}>{row.label}</span>
                {row.hint !== undefined && <span className={css.rowHint}>{row.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {payload.table !== undefined && (
        <div className={css.reportTableWrap}>
          <table className={css.reportTable}>
            <thead>
              <tr>
                {payload.table.columns.map((column, index) => (
                  <th key={`${index}-${column.label}`}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payload.table.rows.map((cells, rowIndex) => (
                <tr key={rowIndex}>
                  {cells.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cellIndex === 0 ? css.reportTableFirst : css.reportTableCell}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {onAction !== undefined && actionRow.length > 0 && (
        <div className={css.reportActions}>
          {actionRow.map((action, index) => (
            <Button
              key={`${action.kind}-${action.label}`}
              type="button"
              color="primary"
              fill="solid"
              size="small"
              className={index === primaryIndex ? css.reportPrimary : css.reportSecondary}
              style={index === primaryIndex
                ? undefined
                : {
                  '--background-color': 'var(--dshm-primary-soft)',
                  '--text-color': 'var(--dshm-on-soft)',
                  '--border-color': 'transparent',
                  '--border-radius': '11px',
                }}
              onClick={() => { onAction(action) }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
