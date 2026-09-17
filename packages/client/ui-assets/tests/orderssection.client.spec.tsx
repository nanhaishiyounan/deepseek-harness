// @vitest-environment jsdom
// The market's orders section: the state matrix (mount load, loading
// skeleton, error retry, empty guidance), the row rendering with per-status
// actions (delivered view/download, failed error note, pending badge only),
// the 5-second poll that stops once every row is terminal and on unmount,
// and the PDF preview modal (iframe src, footer links, Escape close).

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarketOrderRow } from '../src/client/marketTypes.ts'
import { OrdersSection } from '../src/client/OrdersSection.tsx'
// Type-only: pulls the LocaleNamespaceMap merge so PropsLocale<'market'> resolves.
import type {} from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'

/** The zh dictionary rendered the way the runtime's t does. */
const translate = (key: string, params?: Record<string, string | number>): string => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}

/** The same dictionary as the component's props-level t (props accept never). */
const t = translate as never

const PENDING: MarketOrderRow = {
  id: 1, order_no: 'ORD-20260917-0001', service_name: '中亚货运动线方案', price: '¥8,800/份',
  status: 'pending', created_at: '2026-09-17T08:00:00.000Z',
}

const DELIVERED: MarketOrderRow = {
  id: 2, order_no: 'ORD-20260917-0002', service_name: '海外仓风险应对咨询', price: '¥6,800/份',
  status: 'delivered', generated_at: '2026-09-17T09:00:00.000Z', created_at: '2026-09-17T08:30:00.000Z',
}

const FAILED: MarketOrderRow = {
  id: 3, order_no: 'ORD-20260917-0003', service_name: '中亚货运动线方案',
  status: 'failed', error: '专家排期冲突，生成失败', created_at: '2026-09-17T07:00:00.000Z',
}

function mount(orders: Parameters<typeof OrdersSection>[0]['orders'], refreshOrders = vi.fn()) {
  const view = render(<OrdersSection orders={orders} refreshOrders={refreshOrders} t={t} />)
  return { view, refreshOrders }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('OrdersSection state matrix', () => {
  it('loads on mount while no snapshot exists and shows the loading skeleton', () => {
    const { refreshOrders } = mount(undefined)
    expect(refreshOrders).toHaveBeenCalled()
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('shows the error strip with a retry that reloads the orders', () => {
    const { refreshOrders } = mount({ status: 'error', error: 'orders-not-composed' })
    expect(screen.getByRole('alert').textContent).toContain('orders-not-composed')
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    expect(refreshOrders).toHaveBeenCalled()
  })

  it('renders the empty guidance when the list is ready and empty', () => {
    mount({ status: 'ready', value: [] })
    expect(screen.getByText(zh['orders.empty'])).toBeTruthy()
    expect(screen.getByText(zh['orders.emptyHint'])).toBeTruthy()
  })

  it('offers the manual refresh action on every state', () => {
    const { refreshOrders } = mount({ status: 'ready', value: [PENDING] })
    fireEvent.click(screen.getByRole('button', { name: zh['orders.refresh'] }))
    expect(refreshOrders).toHaveBeenCalled()
  })
})

describe('OrdersSection rows', () => {
  it('renders every row with its status badge and the per-status actions', () => {
    mount({ status: 'ready', value: [PENDING, DELIVERED, FAILED] })
    expect(screen.getByText(PENDING.order_no)).toBeTruthy()
    expect(screen.getByText(DELIVERED.service_name)).toBeTruthy()
    expect(screen.getByText(FAILED.error!)).toBeTruthy()
    expect(document.querySelector('[data-status="pending"]')?.textContent).toBe(zh['order.status.pending'])
    expect(document.querySelector('[data-status="delivered"]')?.textContent).toBe(zh['order.status.delivered'])
    expect(document.querySelector('[data-status="failed"]')?.textContent).toBe(zh['order.status.failed'])
    // Only the delivered row carries the view action; the download anchor is
    // the attachment direct link.
    expect(screen.getAllByRole('button', { name: zh['orders.viewDeliverable'] })).toHaveLength(1)
    expect(screen.getByRole('link', { name: zh['orders.download'] }).getAttribute('href'))
      .toBe(`/api/orders.download?orderId=${DELIVERED.id}`)
    expect(screen.getAllByText(PENDING.created_at.slice(0, 10))).toHaveLength(3)
  })
})

describe('OrdersSection polling', () => {
  it('polls every 5 seconds while a row is non-terminal and stops when all rows are terminal or the section unmounts', () => {
    vi.useFakeTimers()
    const refreshOrders = vi.fn()
    const { view } = mount({ status: 'ready', value: [PENDING] }, refreshOrders)
    // A ready cache never re-triggers the mount load; only the interval fires.
    expect(refreshOrders).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(5_000) })
    expect(refreshOrders).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(5_000) })
    expect(refreshOrders).toHaveBeenCalledTimes(2)
    // Every row terminal clears the interval…
    view.rerender(<OrdersSection orders={{ status: 'ready', value: [DELIVERED] }} refreshOrders={refreshOrders} t={t} />)
    act(() => { vi.advanceTimersByTime(15_000) })
    expect(refreshOrders).toHaveBeenCalledTimes(2)
    // …and unmount keeps it cleared.
    view.unmount()
    act(() => { vi.advanceTimersByTime(15_000) })
    expect(refreshOrders).toHaveBeenCalledTimes(2)
  })
})

describe('OrdersSection preview modal', () => {
  it('opens the deliverable preview with the inline iframe and both footer links, and closes on Escape', () => {
    mount({ status: 'ready', value: [DELIVERED] })
    fireEvent.click(screen.getByRole('button', { name: zh['orders.viewDeliverable'] }))
    const dialog = screen.getByRole('dialog')
    expect(document.querySelector('iframe')?.getAttribute('src'))
      .toBe(`/api/orders.download?orderId=${DELIVERED.id}&inline=1`)
    // The footer links scope inside the dialog (the row's download link shares its copy).
    expect(within(dialog).getByRole('link', { name: zh['orders.download'] }).getAttribute('href'))
      .toBe(`/api/orders.download?orderId=${DELIVERED.id}`)
    expect(within(dialog).getByRole('link', { name: zh['orders.openExternal'] }).getAttribute('href'))
      .toBe(`/api/orders.download?orderId=${DELIVERED.id}&inline=1`)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
