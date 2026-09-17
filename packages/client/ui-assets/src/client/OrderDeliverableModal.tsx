/**
 * The delivered order's in-page PDF preview: the modal body embeds the
 * same-origin inline download route in an iframe; the footer keeps the
 * attachment download link and the open-in-new-window fallback (the inline
 * URL opened directly, for platforms whose iframes cannot host a PDF viewer).
 * @module @deepseek-ai/dsh-client-ui-assets/client/OrderDeliverableModal
 */

import type { JSX } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { MarketOrderRow } from './marketTypes.ts'
import css from './market.module.css'

/** The modal's controlled props; `order === undefined` keeps it closed. */
export interface OrderDeliverableModalProps {
  /** The delivered order to preview; `undefined` renders nothing. */
  order: MarketOrderRow | undefined
  /** Close (Escape, mask, close button). */
  onClose: () => void
  /** The locale-bound translate (zh primary). */
  t: PropsLocale<'market'>['t']
}

/**
 * Render the PDF preview modal for one delivered order.
 * @param props - the previewed order plus the control callbacks.
 * @returns the modal tree (null while closed).
 */
export function OrderDeliverableModal({ order, onClose, t }: OrderDeliverableModalProps): JSX.Element {
  const title = order === undefined ? '' : `${order.order_no} · ${t('orders.previewTitle')}`
  return (
    <Modal
      open={order !== undefined}
      onClose={onClose}
      title={title}
      closeLabel={t('orders.close')}
      {...css.previewModal === undefined ? {} : { className: css.previewModal }}
      {...order === undefined ? {} : { footer: (
        <>
          <a
            className={css.linkAction}
            href={`/api/orders.download?orderId=${order.id}`}
            download
          >
            {t('orders.download')}
          </a>
          <a
            className={css.linkAction}
            href={`/api/orders.download?orderId=${order.id}&inline=1`}
            target="_blank"
            rel="noreferrer"
          >
            {t('orders.openExternal')}
          </a>
        </>
      ) }}
    >
      {order !== undefined && (
        <iframe
          className={css.previewFrame}
          src={`/api/orders.download?orderId=${order.id}&inline=1`}
          title={title}
        />
      )}
    </Modal>
  )
}
