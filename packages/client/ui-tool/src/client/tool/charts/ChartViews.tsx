/**
 * Zero-dependency SVG chart primitives for tabular tool results: number-card
 * strips, a mini line chart (polyline + area + first/last axis labels), and a
 * horizontal bar chart (proportional bars with value labels). Pure functions
 * of the parsed table view; no chart library, no interaction beyond title
 * attributes. Values format through Intl so 1.2 万-scale numbers stay
 * readable in zh and en alike.
 * @module @deepseek-ai/dsh-client-ui-tool/client/tool/charts/ChartViews
 */

import type { JSX } from 'react'
import type { LakehouseStatCard } from '../models/lakehouse-card-model.ts'
import css from './charts.module.css'

/** One value formatter shared by cards, bars, and the line axis. */
const formatValue = (value: number): string => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)

/** Props of the number-card strip. */
export interface NumberCardsProps {
  /** The numeric-column statistics (rows plus whatever computed). */
  readonly cards: readonly LakehouseStatCard[]
  /** Display label per stat id (the row's locale-resolved copy). */
  readonly labels: Readonly<Record<LakehouseStatCard['id'], string>>
}

/**
 * Render the number-card strip: one card per statistic.
 * @param props - see {@link NumberCardsProps}.
 * @returns the strip element.
 */
export function NumberCards({ cards, labels }: NumberCardsProps): JSX.Element {
  return (
    <div className={css.cards} data-testid="lakehouse-number-cards">
      {cards.map(card => (
        <div key={card.id} className={css.card}>
          <dd className={css.cardValue}>{formatValue(card.value)}</dd>
          <dt className={css.cardLabel}>{labels[card.id]}</dt>
        </div>
      ))}
    </div>
  )
}

/** Props of the mini line chart. */
export interface MiniLineChartProps {
  /** X labels in row order (first and last render as axis labels). */
  readonly labels: readonly string[]
  /** Y values; plotted in given order. */
  readonly values: readonly number[]
}

/**
 * Render the mini line chart: a normalized polyline with an area fill, min/max
 * gridlines, and first/last x labels.
 * @param props - see {@link MiniLineChartProps}.
 * @returns the chart element, or null with fewer than two points.
 */
export function MiniLineChart({ labels, values }: MiniLineChartProps): JSX.Element | null {
  if (values.length < 2) return null
  const width = 320
  const height = 120
  const pad = 8
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const xOf = (index: number): number => pad + (width - pad * 2) * (index / (values.length - 1))
  const yOf = (value: number): number => height - pad - (height - pad * 2) * ((value - min) / span)
  const points = values.map((value, index) => `${String(xOf(index))},${String(yOf(value))}`)
  const first = labels[0] ?? ''
  const last = labels[labels.length - 1] ?? ''
  return (
    <div className={css.chart} data-testid="lakehouse-line-chart">
      <svg viewBox={`0 0 ${String(width)} ${String(height)}`} role="img" aria-hidden="true">
        <line className={css.grid} x1={pad} x2={width - pad} y1={yOf(max)} y2={yOf(max)} />
        <line className={css.grid} x1={pad} x2={width - pad} y1={yOf(min)} y2={yOf(min)} />
        <polygon className={css.area} points={`${String(pad)},${String(height - pad)} ${points.join(' ')} ${String(width - pad)},${String(height - pad)}`} />
        <polyline className={css.line} points={points.join(' ')} fill="none" />
      </svg>
      <div className={css.axis}>
        <span>{first}</span>
        <span className={css.axisValue}>{`${formatValue(min)} – ${formatValue(max)}`}</span>
        <span>{last}</span>
      </div>
    </div>
  )
}

/** Props of the horizontal bar chart. */
export interface MiniBarChartProps {
  /** Bars in descending value order (the model caps the count). */
  readonly items: readonly { readonly label: string; readonly value: number }[]
}

/**
 * Render the horizontal bar chart: label + proportional bar + value per row.
 * @param props - see {@link MiniBarChartProps}.
 * @returns the chart element.
 */
export function MiniBarChart({ items }: MiniBarChartProps): JSX.Element {
  const max = Math.max(...items.map(item => Math.abs(item.value)), 1)
  return (
    <div className={css.bars} data-testid="lakehouse-bar-chart">
      {items.map(item => (
        <div key={item.label} className={css.barRow}>
          <span className={css.barLabel} title={item.label}>{item.label}</span>
          <span className={css.barTrack}>
            <span
              className={css.bar}
              style={{ width: `${String(Math.max(2, Math.round((Math.abs(item.value) / max) * 100)))}%` }}
              data-negative={item.value < 0 || undefined}
            />
          </span>
          <span className={css.barValue}>{formatValue(item.value)}</span>
        </div>
      ))}
    </div>
  )
}
