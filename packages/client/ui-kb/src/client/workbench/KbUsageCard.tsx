/**
 * The usage card: the three business metrics (searches, ingested documents,
 * knowledge-base documents). Business language only — chunk and embedding
 * counters never render, and the counters are cumulative, not monthly: the
 * gateway's usage query has no time window.
 * @module @deepseek-ai/dsh-client-ui-kb/client/workbench/KbUsageCard
 */

import type { JSX } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { KbClientState } from '../kbStore.ts'
import css from './workbench.module.css'

/** Props of the usage card. */
export interface KbUsageCardProps extends PropsLocale<'kb'> {
  /** The shared client-session snapshot (stats cache). */
  readonly state: KbClientState
  /** Reload the stats cache (the error strip's retry). */
  readonly refresh: () => void
  /** Best-effort jump to the chat tab (the empty-state guidance). */
  readonly requestChatView: () => void
}

/**
 * Render the usage card.
 * @param props - see {@link KbUsageCardProps}.
 * @returns the usage card element.
 */
export function KbUsageCard({ state, refresh, requestChatView, t }: KbUsageCardProps): JSX.Element {
  const stats = state.stats
  return (
    <section className={css.zone} aria-label={t('usage.title')}>
      <header className={css.zoneHead}>
        <h3 className={css.zoneTitle}>{t('usage.title')}</h3>
      </header>

      {stats === undefined || stats.status === 'loading'
        ? <span className={css.usageSkeleton} aria-busy="true" />
        : stats.status === 'error'
          ? (
            <div className={css.failure} role="alert">
              <span>{t('error.unavailable')}</span>
              <Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>
            </div>
          )
          : (
            <dl className={css.usage}>
              <div className={css.usageCell}>
                <dd>{stats.usage.searches}</dd>
                <dt>{t('usage.searches')}</dt>
              </div>
              <div className={css.usageCell}>
                <dd>{stats.usage.ingestedDocuments}</dd>
                <dt>{t('usage.ingested')}</dt>
              </div>
              <div className={css.usageCell}>
                <dd>{stats.usage.documents}</dd>
                <dt>{t('usage.documents')}</dt>
              </div>
            </dl>
          )}
      {stats?.status === 'ready'
        && stats.usage.searches === 0 && stats.usage.ingestedDocuments === 0 && stats.usage.documents === 0
        && (
          <p className={css.zoneNote}>
            {t('usage.firstSearch')}
            <Button variant="ghost" size="sm" onClick={requestChatView}>{t('workbench.goChat')}</Button>
          </p>
        )}
    </section>
  )
}
