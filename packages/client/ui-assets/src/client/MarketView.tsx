/**
 * The market view tab: the section portal (hero + counters + featured rail +
 * tag cloud), the catalog (search + kind chips + asset cards), the asset
 * detail panel with the ask/cite/order action bar, and the order journey —
 * confirm card → `orders.create` → receipt with the status badge. Registered
 * as the `market` entry of the conversation view ring; the ask/cite actions
 * fill the composer draft and ask the bridge to switch back to the chat tab.
 * @module @deepseek-ai/dsh-client-ui-assets/client/MarketView
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { Button, EmptyState, ErrorStrip, PageHero, PageSkeleton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the view seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { MarketClientState } from './marketStore.ts'
import type { MarketAssetKind, MarketAssetRow, MarketOrderReceipt } from './marketTypes.ts'
import { OrderConfirmCard } from './OrderConfirmCard.tsx'
import { MARKET_KIND_FILTERS, filterCatalog, providerLabelOf } from './presentation.ts'
import css from './market.module.css'

/** Catalog grid page size for the load-more pagination (02-design: list-head paging stays lightweight). */
const CATALOG_PAGE_SIZE = 24

/** Registration-side business face for the market view. */
export interface MarketViewInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useMarket. */
    market: SnapshotStore<MarketClientState>
  }
  /** Load or reload both shared caches (stats + catalog). */
  refresh: () => void
  /** Place one order; rejects with the failure message. */
  placeOrder: (asset: MarketAssetRow, brief: string) => Promise<MarketOrderReceipt>
  /** Best-effort view switch through the header bridge. */
  requestView: (view: string) => void
}

/** Full component props: the view-seat runtime share plus the inject face and locale seat. */
export type MarketViewProps =
  PropsRuntime<'conversation.view'>
  & PropsLocale<'market'>
  & InjectFace<MarketViewInjected>

/** The local order-journey flow state (presentation, not session data). */
type OrderFlow =
  | { readonly stage: 'idle' }
  | { readonly stage: 'confirming'; readonly asset: MarketAssetRow; readonly brief: string }
  | { readonly stage: 'receipt'; readonly receipt: MarketOrderReceipt }

/**
 * Render the market view tab.
 * @param props - the standard view kit plus the market's inject face.
 * @returns the market column.
 */
export function MarketView({ inputActions, useMarket, refresh, placeOrder, requestView, t }: MarketViewProps): JSX.Element {
  const state = useMarket(snapshot => snapshot)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<MarketAssetKind | 'all'>('all')
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE_SIZE)
  const [selected, setSelected] = useState<MarketAssetRow | undefined>(undefined)
  const [flow, setFlow] = useState<OrderFlow>({ stage: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [flowError, setFlowError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (state.stats === undefined) refresh()
  }, [state.stats, refresh])
  // A catalog reload clears any stale selection (dataset ids may vanish).
  useEffect(() => {
    if (state.catalog?.status === 'loading') setSelected(undefined)
  }, [state.catalog?.status])

  /** Fill the chat draft with an asset-scoped question and land on the chat tab. */
  const askAbout = (asset: MarketAssetRow): void => {
    inputActions.setDraft(t('ask.prefix', { title: asset.title }))
    requestView('chat')
  }

  const confirmOrder = async (asset: MarketAssetRow, brief: string): Promise<void> => {
    setSubmitting(true)
    setFlowError(undefined)
    try {
      const receipt = await placeOrder(asset, brief)
      setFlow({ stage: 'receipt', receipt })
    } catch (error: unknown) {
      setFlowError(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  const stats = state.stats
  const catalog = state.catalog
  const filtered = catalog?.status === 'ready' ? filterCatalog(catalog.value, query, kind) : []
  // Any filter change returns to the first page of the grid.
  useEffect(() => { setVisibleCount(CATALOG_PAGE_SIZE) }, [query, kind])


  return (
    <div className={css.market}>
      {stats !== undefined && stats.status === 'error' && (
        <ErrorStrip
          message={<>{t('error.unavailable')} — {stats.error}</>}
          action={<Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>}
        />
      )}

      <PageHero
        eyebrow={t('view.market')}
        title={t('hero.title')}
        tagline={t('hero.tagline')}
        meta={stats === undefined ? undefined : stats.status === 'ready'
          ? (
            <span>
              {t('hero.products')} {stats.value.products} · {t('hero.providers')} {stats.value.providers} · {t('hero.monthlyOrders')} {stats.value.monthly_orders}
            </span>
          )
          : <PageSkeleton variant="list" rows={1} />}
      >
        {stats !== undefined && stats.status === 'ready' && stats.value.featured.length > 0 && (
          <div className={css.featured}>
            <h3 className={css.zoneTitle}>{t('hero.featured')}</h3>
            <div className={css.featuredGrid}>
              {stats.value.featured.slice(0, 3).map(card => (
                <div key={card.title} className={css.featuredCard}>
                  <p className={css.featuredTitle}>{card.title}</p>
                  <p className={css.featuredBlurb}>{card.blurb}</p>
                  <p className={css.tagRow}>{card.tags.map(tag => <span key={tag} className={css.tag}>{tag}</span>)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </PageHero>

      {flow.stage === 'receipt' && (
        <section className={css.receipt} aria-label={t('order.receiptTitle')}>
          <h3 className={css.cardTitle}>{t('order.receiptTitle')}</h3>
          <p className={css.detailLine}>
            <span className={css.detailLabel}>{t('order.receiptOrderNo')}</span>
            {flow.receipt.order_no}
            <span className={css.statusBadge} data-status={flow.receipt.status}>{t(`order.status.${flow.receipt.status}`)}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => {
            inputActions.setDraft(t('ask.prefix', { title: flow.receipt.service_name }))
            requestView('chat')
          }}>{t('order.receiptAskProgress')}</Button>
        </section>
      )}

      {catalog === undefined || catalog.status === 'loading' ? (
        <PageSkeleton variant="grid" />
      ) : catalog.status === 'error' ? (
        <ErrorStrip
          message={<>{t('error.unavailable')} — {catalog.error}</>}
          action={<Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>}
        />
      ) : selected !== undefined ? (
        <section className={css.detail} aria-label={selected.title}>
          <button type="button" className={css.backLink} onClick={() => { setSelected(undefined) }}>{t('detail.back')}</button>
          <h3 className={css.detailTitle}>{selected.title}</h3>
          <p className={css.kindBadge}>{t(`catalog.kind.${selected.kind}`)}</p>
          {selected.description !== undefined && <p className={css.detailBody}>{selected.description}</p>}
          {selected.summary !== undefined && (
            <p className={css.detailLine}><span className={css.detailLabel}>{t('detail.summary')}</span>{selected.summary}</p>
          )}
          <dl className={css.pairs}>
            <div className={css.pair}>
              <dt>{t('detail.source')}</dt>
              <dd>{providerLabelOf(selected.provider_id)}</dd>
            </div>
            {selected.price !== undefined && (
              <div className={css.pair}>
                <dt>{t('detail.price')}</dt>
                <dd>{selected.price}</dd>
              </div>
            )}
            {selected.deliverable !== undefined && (
              <div className={css.pair}>
                <dt>{t('detail.deliverable')}</dt>
                <dd>{selected.deliverable}</dd>
              </div>
            )}
            {selected.expert_org !== undefined && (
              <div className={css.pair}>
                <dt>{t('detail.org')}</dt>
                <dd>{selected.expert_org}</dd>
              </div>
            )}
            {selected.updated_at !== undefined && (
              <div className={css.pair}>
                <dt>{t('detail.updated')}</dt>
                <dd>{selected.updated_at.slice(0, 10)}</dd>
              </div>
            )}
          </dl>
          {selected.domains !== undefined && selected.domains.length > 0 && (
            <p className={css.tagRow}>{selected.domains.map(domain => <span key={domain} className={css.tag}>{domain}</span>)}</p>
          )}

          {flow.stage === 'idle' && (
            <div className={css.actionBar}>
              <Button variant="ghost" size="sm" onClick={() => { askAbout(selected) }}>{t('detail.ask')}</Button>
              <Button variant="ghost" size="sm" onClick={() => { askAbout(selected) }}>{t('detail.cite')}</Button>
              {selected.service_id !== undefined && (
                <Button variant="primary" size="sm" onClick={() => {
                  setFlow({ stage: 'confirming', asset: selected, brief: t('ask.prefix', { title: selected.title }) })
                }}>{t('detail.order')}</Button>
              )}
            </div>
          )}
          {flow.stage === 'confirming' && (
            <OrderConfirmCard
              t={t}
              asset={flow.asset}
              brief={flow.brief}
              onBriefChange={(brief) => { setFlow({ stage: 'confirming', asset: flow.asset, brief }) }}
              onConfirm={() => { void confirmOrder(flow.asset, flow.brief) }}
              onCancel={() => { setFlow({ stage: 'idle' }); setFlowError(undefined) }}
              submitting={submitting}
              {...flowError === undefined ? {} : { error: flowError }}
            />
          )}
        </section>
      ) : catalog.value.length === 0 ? (
        <EmptyState title={t('catalog.empty')} hint={t('catalog.emptyHint')} />
      ) : (
        <section className={css.catalog}>
          <h3 className={css.zoneTitle}>{t('catalog.title')}</h3>
          <div className={css.searchRow}>
            <input
              className={css.searchInput}
              value={query}
              placeholder={t('catalog.searchPlaceholder')}
              onChange={(event) => { setQuery(event.target.value) }}
            />
            <div className={css.kindChips} role="group" aria-label={t('catalog.title')}>
              {MARKET_KIND_FILTERS.map(option => (
                <button
                  key={option}
                  type="button"
                  className={kind === option ? `${css.kindChip} ${css.kindChipActive}` : css.kindChip}
                  aria-pressed={kind === option}
                  onClick={() => { setKind(option) }}
                >
                  {option === 'all' ? t('catalog.kind.all') : t(`catalog.kind.${option}`)}
                </button>
              ))}
            </div>
          </div>
          <p className={css.showing}>{t('catalog.showing', {
            shown: filtered.length,
            total: catalog.value.length,
          })}</p>
          <div className={css.grid}>
            {filtered.slice(0, visibleCount).map(asset => (
              <button key={`${asset.provider_id}/${asset.dataset_id}`} type="button" className={css.assetCard} onClick={() => { setSelected(asset); setFlow({ stage: 'idle' }) }}>
                <p className={css.assetTitleRow}>
                  <span className={css.assetTitle}>{asset.title}</span>
                  {asset.service_id !== undefined && <span className={css.orderableBadge}>{t('card.orderable')}</span>}
                </p>
                <p className={css.assetKind}>{t(`catalog.kind.${asset.kind}`)}{asset.price !== undefined ? ` · ${asset.price}` : ''}</p>
                {asset.description !== undefined && <p className={css.assetBlurb}>{asset.description}</p>}
                <p className={css.assetSource}>{providerLabelOf(asset.provider_id)}{asset.updated_at !== undefined ? ` · ${asset.updated_at.slice(0, 10)}` : ''}</p>
              </button>
            ))}
          </div>
          {filtered.length > visibleCount && (
            <Button variant="ghost" size="sm" onClick={() => { setVisibleCount(count => count + CATALOG_PAGE_SIZE) }}>
              {t('catalog.more', { count: filtered.length - visibleCount })}
            </Button>
          )}
        </section>
      )}
    </div>
  )
}
