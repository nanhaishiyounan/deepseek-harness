/**
 * The overview home's KPI band: the live tier the scenarios portal leads
 * with. KPI chips ride the gateway's `lakehouse.overview` read (the
 * configured seed SQL evaluated live); the read degrades inline — an
 * unavailable overview renders its refusal line, and a failing KPI chip
 * shows its own error text, never blanking the band.
 * @module @deepseek-ai/dsh-client-ui-kb/client/hero/KbOverviewBand
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { LakehouseKpiView } from '@deepseek-ai/dsh-client-connection/client'
import css from './overview.module.css'

/** KbOverviewBand props: the loader and the locale seat. */
export interface KbOverviewBandProps {
  /** Evaluate the configured overview KPI seed (rejects when unconfigured). */
  readonly loadOverview: () => Promise<readonly LakehouseKpiView[]>
  readonly t: PropsLocale<'kb'>['t']
}

/** One load's outcome (undefined = not loaded). */
type Load<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' }

const formatNumber = (value: number): string => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)

/** One KPI chip's body: value + unit, or the per-item error line. */
function KpiChip({ kpi, t }: { kpi: LakehouseKpiView; t: PropsLocale<'kb'>['t'] }): JSX.Element {
  return (
    <div className={css.kpi} data-testid="overview-kpi">
      <span className={css.kpiLabel}>{kpi.label}</span>
      {kpi.error === undefined
        ? (
          <span className={css.kpiValue}>
            {formatNumber(kpi.value)}
            {kpi.unit === undefined ? '' : <span className={css.kpiUnit}>{kpi.unit}</span>}
            {kpi.trend === undefined ? '' : (
              <span className={css.kpiTrend} data-positive={kpi.trend >= 0 || undefined}>
                {kpi.trend >= 0 ? '▲' : '▼'}{formatNumber(Math.abs(kpi.trend))}%
              </span>
            )}
          </span>
        )
        : <span className={css.kpiError}>{t('overview.kpiError')}</span>}
    </div>
  )
}

/**
 * Render the KPI band.
 * @param props - see {@link KbOverviewBandProps}.
 * @returns the band element.
 */
export function KbOverviewBand({ loadOverview, t }: KbOverviewBandProps): JSX.Element {
  const [overview, setOverview] = useState<Load<readonly LakehouseKpiView[]>>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    loadOverview().then(
      (kpis) => { if (alive) setOverview({ status: 'ready', value: kpis }) },
      () => { if (alive) setOverview({ status: 'error' }) },
    )
    return () => { alive = false }
  }, [loadOverview])

  return (
    <section className={css.band} aria-label={t('overview.title')} data-testid="overview-band">
      <div className={css.kpis}>
        {overview.status === 'ready'
          ? overview.value.map(kpi => <KpiChip key={kpi.id} kpi={kpi} t={t} />)
          : overview.status === 'loading'
            ? <span className={css.bandNote}>{t('overview.loading')}</span>
            : <span className={css.bandNote}>{t('overview.unavailable')}</span>}
      </div>
    </section>
  )
}
