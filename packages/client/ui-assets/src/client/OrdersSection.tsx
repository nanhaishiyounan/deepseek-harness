/**
 * The market's 「我的订单」 section: every order row with its status badge,
 * the manual refresh action, and — for delivered rows — the in-page PDF
 * preview modal plus the attachment download. While any row is still
 * `pending`/`generating` the section polls `refreshOrders` every 5 seconds;
 * once every row is terminal the poll stops, and unmounting the market tab
 * clears the timer, so the poll lives only while the tab is visible.
 * @module @deepseek-ai/dsh-client-ui-assets/client/OrdersSection
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Button, EmptyState, ErrorStrip, PageSkeleton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { MarketClientState } from './marketStore.ts'
import type { MarketOrderRow } from './marketTypes.ts'
import { OrderDeliverableModal } from './OrderDeliverableModal.tsx'
import css from './market.module.css'

/** Poll cadence while a non-terminal order exists (milliseconds). */
const ORDERS_POLL_MS = 5_000

/** The section's props: the orders cache slice plus its reload action. */
export interface OrdersSectionProps {
  /** The orders cache slice from the shared market snapshot. */
  orders: MarketClientState['orders']
  /** Reload the orders cache (mount, retry, manual refresh, poll). */
  refreshOrders: () => void
  /** The locale-bound translate (zh primary). */
  t: PropsLocale<'market'>['t']
}

/**
 * Render the 「我的订单」 section.
 * @param props - the orders cache slice, its reload action, and translate.
 * @returns the orders section.
 */
export function OrdersSection({ orders, refreshOrders, t }: OrdersSectionProps): JSX.Element {
  const [previewed, setPreviewed] = useState<MarketOrderRow | undefined>(undefined)

  useEffect(() => {
    if (orders === undefined) refreshOrders()
  }, [orders, refreshOrders])

  const rows = orders?.status === 'ready' ? orders.value : undefined
  // Poll only while some row can still move; the rows reference in the
  // dependency array restarts the cadence after every landed snapshot.
  const polling = rows !== undefined && rows.some(row => row.status === 'pending' || row.status === 'generating')
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(refreshOrders, ORDERS_POLL_MS)
    return () => { clearInterval(timer) }
  }, [polling, refreshOrders, rows])

  return (
    <section className={css.orders} id="market-orders" aria-label={t('orders.title')}>
      <div className={css.ordersHead}>
        <h3 className={css.zoneTitle}>{t('orders.title')}</h3>
        <Button variant="ghost" size="sm" onClick={refreshOrders}>{t('orders.refresh')}</Button>
      </div>

      {orders === undefined || orders.status === 'loading' ? (
        <PageSkeleton variant="list" />
      ) : orders.status === 'error' ? (
        <ErrorStrip
          message={<>{t('error.unavailable')} — {orders.error}</>}
          action={<Button variant="ghost" size="sm" onClick={refreshOrders}>{t('error.retry')}</Button>}
        />
      ) : orders.value.length === 0 ? (
        <EmptyState title={t('orders.empty')} hint={t('orders.emptyHint')} />
      ) : (
        <div className={css.ordersList}>
          {orders.value.map(row => (
            <div key={row.id} className={css.ordersRow}>
              <p className={css.ordersMeta}>
                <span className={css.ordersNo}>{row.order_no}</span>
                <span>{row.service_name}</span>
                {row.price !== undefined && <span>{row.price}</span>}
                <span className={css.statusBadge} data-status={row.status}>{t(`order.status.${row.status}`)}</span>
                <span className={css.ordersDate}>{row.created_at.slice(0, 10)}</span>
              </p>
              {row.status === 'failed' && row.error !== undefined && (
                <p className={css.ordersError} title={row.error}>{row.error}</p>
              )}
              {row.status === 'delivered' && (
                <div className={css.ordersActions}>
                  <Button variant="ghost" size="sm" onClick={() => { setPreviewed(row) }}>
                    {t('orders.viewDeliverable')}
                  </Button>
                  <a
                    className={css.linkAction}
                    href={`/api/orders.download?orderId=${row.id}`}
                    download
                  >
                    {t('orders.download')}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <OrderDeliverableModal order={previewed} onClose={() => { setPreviewed(undefined) }} t={t} />
    </section>
  )
}
