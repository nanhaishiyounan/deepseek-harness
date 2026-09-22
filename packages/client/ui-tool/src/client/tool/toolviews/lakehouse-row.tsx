// Lakehouse query toolview registrant: the keyed toolview hole for
// `lakehouse_query`. The row owns its chrome (icon + title + summary, whole
// row expands) and its expanded body renders the zero-dependency chart stack:
// number cards over the leading numeric column, a chart/table view toggle
// (a mini line chart when the first column reads temporal, horizontal bars
// otherwise; the plain table when nothing plots), the executed-SQL
// disclosure, and the CSV export (a Blob download — no server round trip).
// A running call renders the summary row alone; a failed call shows the
// result's first line, the shared row semantics every keyed toolview keeps.

import { useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { IconDataOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '../../contract/slots.ts'
import {
  chartPlanOf, csvOf, lakehouseQueryView, numericColumnOf, statCardsOf,
} from '../models/lakehouse-card-model.ts'
import { MiniBarChart, MiniLineChart, NumberCards } from '../charts/ChartViews.tsx'
import { CONVERSATION_NS as NS } from '../../locale.ts'
import css from './lakehouse.module.css'

/** Full row props: the toolview runtime share plus the standard locale seat. */
type LakehouseRowProps = ToolCallViewProps & { t: TranslateNS<'conversation'> }

/** First physical line of a text (the collapsed error summary). */
function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/** Trigger the browser download of the parsed view as CSV. */
function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * The lakehouse_query row: summary chrome with the chart stack as the
 * expanded body.
 */
export function LakehouseRow({ toolName, block, t }: LakehouseRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [chartMode, setChartMode] = useState(true)
  const view = lakehouseQueryView(block)
  const running = view === undefined
  const error = view !== undefined && 'kind' in block && block.isError
  const numeric = view === undefined ? -1 : numericColumnOf(view)
  const plan = view === undefined ? undefined : chartPlanOf(view)
  const summary = running
    ? t('lakehouse.running')
    : error
      ? firstLine(resultTextOf(block))
      : t('lakehouse.summary', {
        rows: view.rows.length,
        tables: view.tables.length === 0 ? t('lakehouse.tablesUnknown') : view.tables.join(', '),
      })
  return (
    <div className={css.row} data-tool={toolName}>
      <button
        type="button"
        className={css.head}
        aria-expanded={expanded}
        disabled={running}
        onClick={() => { setExpanded(open => !open) }}
      >
        <span className={css.icon} aria-hidden="true">
          {error ? <StateDot state="error" /> : <IconDataOutline16 size={14} />}
        </span>
        <span className={css.title}>{t('lakehouse.queryTitle')}</span>
        <span className={css.summary}>{summary}</span>
      </button>
      {expanded && view !== undefined && !error && (
        <div className={css.body} data-testid="lakehouse-query-body">
          {numeric !== -1 && (
            <NumberCards
              cards={statCardsOf(view, numeric)}
              labels={{
                rows: t('lakehouse.stat.rows'),
                sum: t('lakehouse.stat.sum'),
                mean: t('lakehouse.stat.mean'),
                max: t('lakehouse.stat.max'),
                min: t('lakehouse.stat.min'),
              }}
            />
          )}
          {plan !== undefined && (
            <div className={css.viewBar} role="group" aria-label={t('lakehouse.viewToggleLabel')}>
              <button
                type="button"
                className={css.viewToggle}
                data-active={chartMode || undefined}
                onClick={() => { setChartMode(true) }}
              >{t('lakehouse.chartView')}</button>
              <button
                type="button"
                className={css.viewToggle}
                data-active={!chartMode || undefined}
                onClick={() => { setChartMode(false) }}
              >{t('lakehouse.tableView')}</button>
            </div>
          )}
          {plan?.kind === 'line' && chartMode
            ? <MiniLineChart labels={plan.labels} values={plan.values} />
            : null}
          {plan?.kind === 'bar' && chartMode
            ? <MiniBarChart items={plan.items} />
            : null}
          {(!chartMode || plan === undefined) && (
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead>
                  <tr>{view.columns.map(column => <th key={column}>{column}</th>)}</tr>
                </thead>
                <tbody>
                  {view.rows.map((row, index) => (
                    <tr key={index}>{row.map((cell, at) => <td key={at}>{String(cell)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {view.truncated && <p className={css.note}>{t('lakehouse.truncated')}</p>}
          {view.rows.length > 0 && (
            <div className={css.actions}>
              <button
                type="button"
                className={css.action}
                onClick={() => { downloadCsv(`${view.tables[0] ?? 'lakehouse'}.csv`, csvOf(view)) }}
              >{t('lakehouse.exportCsv')}</button>
            </div>
          )}
          {view.sql.length > 0 && (
            <details className={css.sqlDisclosure}>
              <summary className={css.sqlSummary}>{t('lakehouse.sqlTitle')}</summary>
              <pre className={css.sql}>{view.sql}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

/** Flatten a settled result's text blocks (the error summary source). */
function resultTextOf(block: ToolCallViewProps['block']): string {
  if (!('kind' in block)) return ''
  const parts: string[] = []
  for (const item of block.content) {
    if (item.type === 'text') parts.push(item.text)
  }
  return parts.join('\n')
}

/**
 * The lakehouse row as a plain registrant plugin following the atomic
 * Tool-view declaration across independent activation and reload lifetimes.
 */
export const lakehouseToolview = {
  name: 'lakehouse-toolview',
  inject: ['slots'],
  /**
   * Register the lakehouse_query row into the Tool-owned keyed view slot.
   * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
   */
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: 'lakehouse_query', locale: NS }, LakehouseRow))
  },
}
