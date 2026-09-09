/**
 * The order confirm card — the market's only "form": read-only key/value
 * pairs (service, provider, price, deliverable) plus the single inline-edit
 * slot (the need brief), with confirm/cancel as the only two actions. An
 * order is irreversible and spends money, so the interaction-design rule set
 * makes this card mandatory before `orders.create` fires.
 * @module @deepseek-ai/dsh-client-ui-assets/client/OrderConfirmCard
 */

import type { JSX } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { MarketAssetRow } from './marketTypes.ts'
import { providerLabelOf } from './presentation.ts'
import css from './market.module.css'

/** Component props: the orderable asset, the flow state, and the locale seat. */
export interface OrderConfirmCardProps extends PropsLocale<'market'> {
  /** The orderable service asset (carries price/deliverable/service_id). */
  readonly asset: MarketAssetRow
  /** The need brief — the card's single editable slot. */
  readonly brief: string
  /** Brief edit callback (the inline slot). */
  readonly onBriefChange: (brief: string) => void
  /** Fire `orders.create` with the shown snapshot. */
  readonly onConfirm: () => void
  /** Close the card without ordering. */
  readonly onCancel: () => void
  /** True while the create call is in flight. */
  readonly submitting: boolean
  /** Failure text from the create call, when one failed. */
  readonly error?: string
}

/**
 * Render the order confirm card.
 * @param props - the asset snapshot, the flow state, and the actions.
 * @returns the confirmation card (read-only pairs + one editable slot).
 */
export function OrderConfirmCard({
  asset, brief, onBriefChange, onConfirm, onCancel, submitting, error, t,
}: OrderConfirmCardProps): JSX.Element {
  return (
    <section className={css.confirmCard} aria-label={t('order.title')}>
      <h3 className={css.cardTitle}>{t('order.title')}</h3>
      <dl className={css.pairs}>
        <div className={css.pair}>
          <dt>{t('detail.summary')}</dt>
          <dd>{asset.service_name ?? asset.title}</dd>
        </div>
        <div className={css.pair}>
          <dt>{t('detail.source')}</dt>
          <dd>{providerLabelOf(asset.provider_id)}</dd>
        </div>
        <div className={css.pair}>
          <dt>{t('detail.price')}</dt>
          <dd>{asset.price ?? '—'}</dd>
        </div>
        <div className={css.pair}>
          <dt>{t('detail.deliverable')}</dt>
          <dd>{asset.deliverable ?? '—'}</dd>
        </div>
      </dl>
      <label className={css.briefLabel}>
        <span>{t('order.briefLabel')}</span>
        <textarea
          className={css.briefInput}
          value={brief}
          disabled={submitting}
          placeholder={t('order.briefPlaceholder')}
          rows={3}
          onChange={(event) => { onBriefChange(event.target.value) }}
        />
      </label>
      <p className={css.termsNote}>{t('order.termsNote')}</p>
      {error !== undefined && <p className={css.flowError} role="alert">{error}</p>}
      <div className={css.cardActions}>
        <Button variant="ghost" size="sm" disabled={submitting} onClick={onCancel}>{t('order.cancel')}</Button>
        <Button variant="primary" size="sm" disabled={submitting || brief.trim().length === 0} onClick={onConfirm}>
          {submitting ? t('order.submitting') : t('order.confirm')}
        </Button>
      </div>
    </section>
  )
}
