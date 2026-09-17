// @vitest-environment jsdom
// The market view tab: the four-state matrix (loading skeletons, ready
// catalog, empty guidance, error retry), the featured rail and counters, the
// search + kind-chip filtering, the asset detail panel with the ask/cite
// conversation handoff, and the order journey — confirm card (read-only
// pairs + the single editable brief slot) → placing → receipt with the
// status badge, plus the failure strip and the not-orderable degradation.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { MarketClientState } from '../src/client/marketStore.ts'
import type { MarketAssetRow, MarketOrderReceipt } from '../src/client/marketTypes.ts'
import { MarketView } from '../src/client/MarketView.tsx'
import { MarketEntry } from '../src/client/MarketEntry.tsx'
// Type-only: pulls the LocaleNamespaceMap merge so PropsLocale<'market'> resolves.
import type {} from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'
import { filterCatalog, providerLabelOf } from '../src/client/presentation.ts'
import { bindStoreHook, GLOBAL_KIT, SESSION_KIT, sessionListState } from './market-fixture.client.ts'

/** The zh dictionary rendered the way the runtime's t does. */
const translate = (key: string, params?: Record<string, string | number>): string => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}

/** The same dictionary as the components' props-level t (props accept never). */
const t = translate as never

const SERVICE: MarketAssetRow = {
  provider_id: 'connector-nocobase',
  dataset_id: 'expert_services/1',
  title: '中亚货运动线方案',
  kind: 'service',
  description: '中亚五国货运路线与清关建议',
  service_name: '中亚货运动线方案',
  price: '¥8,800/份',
  deliverable: 'PDF 方案',
  service_id: 'expert_services/1',
}

const EXPERT: MarketAssetRow = {
  provider_id: 'connector-nocobase',
  dataset_id: 'experts/1',
  title: '张红喜 · 食品出海关税专家',
  kind: 'expert-profile',
  expert_org: '漯河市电子商务协会（会长）',
  domains: ['食品出海', '中亚五国'],
}

const TABLE: MarketAssetRow = {
  provider_id: 'connector-file',
  dataset_id: 'orders.csv',
  title: '海关进出口明细（样例）',
  kind: 'tabular',
  description: '2026 年样例行',
  updated_at: '2026-09-02T00:00:00.000Z',
}

const CATALOG: readonly MarketAssetRow[] = [SERVICE, EXPERT, TABLE]

const READY: MarketClientState = {
  stats: {
    status: 'ready',
    value: {
      products: 3,
      providers: 2,
      monthly_orders: 1,
      featured: [{ title: '中亚市场准入指南', blurb: '五国准入法规与认证要点', tags: ['出海', '合规'] }],
    },
  },
  catalog: { status: 'ready', value: CATALOG },
  orders: { status: 'ready', value: [] },
}

const RECEIPT: MarketOrderReceipt = {
  id: 7,
  order_no: 'ORD-20260906-0007',
  service_name: '中亚货运动线方案',
  status: 'pending',
  created_at: '2026-09-06T00:00:00.000Z',
}

function mount(state: MarketClientState, overrides: {
  placeOrder?: (asset: MarketAssetRow, brief: string) => Promise<MarketOrderReceipt>
} = {}) {
  const store = createSnapshotStore<MarketClientState>(state)
  const refresh = vi.fn()
  const refreshOrders = vi.fn()
  const placeOrder = overrides.placeOrder ?? vi.fn(async () => RECEIPT)
  const requestView = vi.fn()
  const setDraft = vi.fn()
  const view = render(
    <MarketView
      {...SESSION_KIT}
      inputActions={{ setDraft } as never}
      useMarket={bindStoreHook(store) as never}
      refresh={refresh}
      refreshOrders={refreshOrders}
      placeOrder={placeOrder}
      requestView={requestView}
      t={t}
    />,
  )
  return { view, refresh, refreshOrders, placeOrder, requestView, setDraft }
}

afterEach(cleanup)

describe('MarketView state matrix', () => {
  it('renders skeletons while the first load is in flight and loads on mount', () => {
    const { refresh } = mount({ stats: undefined, catalog: undefined, orders: undefined })
    expect(refresh).toHaveBeenCalled()
    // The hero copy renders without counters; the catalog zone shows its skeleton.
    expect(screen.getByText(zh['hero.title'])).toBeTruthy()
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('renders counters, the featured rail, and the catalog when ready', () => {
    mount(READY)
    expect(screen.getByText(/数据产品 3 · 供方 2 · 本月成交 1/u)).toBeTruthy()
    expect(screen.getByText('中亚市场准入指南')).toBeTruthy()
    expect(screen.getByText('出海')).toBeTruthy()
    expect(screen.getByText(SERVICE.title)).toBeTruthy()
    expect(screen.getByText(EXPERT.title)).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(SERVICE.title) })).toBeTruthy()
    expect(screen.getByText(`共 ${CATALOG.length} / ${CATALOG.length} 项`)).toBeTruthy()
  })

  it('shows the empty guidance when the catalog is ready and empty', () => {
    mount({
      stats: READY.stats,
      catalog: { status: 'ready', value: [] },
      orders: undefined,
    })
    expect(screen.getByText(zh['catalog.empty'])).toBeTruthy()
    expect(screen.getByText(zh['catalog.emptyHint'])).toBeTruthy()
  })

  it('shows the error strip with a retry action on a failed load', () => {
    const { refresh } = mount({
      stats: { status: 'error', error: 'assets-not-composed' },
      catalog: { status: 'error', error: 'assets-not-composed' },
      orders: undefined,
    })
    expect(screen.getAllByText(/assets-not-composed/u).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: zh['error.retry'] })[0]!)
    expect(refresh).toHaveBeenCalled()
  })
})

describe('MarketView catalog filtering', () => {
  it('narrows by free text and by kind chip with a showing counter', () => {
    mount(READY)
    // "中亚" hits the service title and the expert's domain tag alike.
    fireEvent.change(screen.getByPlaceholderText(zh['catalog.searchPlaceholder']), { target: { value: '中亚' } })
    expect(screen.getByText('共 2 / 3 项')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(zh['catalog.searchPlaceholder']), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: zh['catalog.kind.service'] }))
    expect(screen.getByText('共 1 / 3 项')).toBeTruthy()
    expect(screen.getByText(SERVICE.title)).toBeTruthy()
    expect(screen.queryByText(TABLE.title)).toBeNull()
  })

  it('filterCatalog and providerLabelOf behave as the catalog renders them', () => {
    expect(filterCatalog(CATALOG, '中亚', 'all').map(row => row.dataset_id)).toEqual(['expert_services/1', 'experts/1'])
    expect(filterCatalog(CATALOG, '货运动线', 'all').map(row => row.dataset_id)).toEqual(['expert_services/1'])
    expect(filterCatalog(CATALOG, '', 'tabular').map(row => row.dataset_id)).toEqual(['orders.csv'])
    expect(filterCatalog(CATALOG, '', 'all')).toHaveLength(3)
    expect(providerLabelOf('connector-nocobase')).toBe('NocoBase 业务后台')
    expect(providerLabelOf('partner-feed')).toBe('partner-feed')
  })
})

describe('MarketView detail panel and order journey', () => {
  function openService(): ReturnType<typeof mount> {
    const mounted = mount(READY)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(SERVICE.title) }))
    return mounted
  }

  it('shows the detail pairs and the ask handoff fills the chat draft', () => {
    const { setDraft, requestView } = openService()
    expect(screen.getByText(SERVICE.description!)).toBeTruthy()
    expect(screen.getByText(SERVICE.price!)).toBeTruthy()
    expect(screen.getByText(SERVICE.deliverable!)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['detail.ask'] }))
    expect(setDraft).toHaveBeenCalledWith(translate('ask.prefix', { title: SERVICE.title }))
    expect(requestView).toHaveBeenCalledWith('chat')
  })

  it('walks the confirm card: read-only pairs, single editable brief slot, place, receipt', async () => {
    const { placeOrder } = openService()
    fireEvent.click(screen.getByRole('button', { name: zh['detail.order'] }))
    // The confirm card shows the read-only snapshot and the terms note.
    expect(screen.getByText(zh['order.termsNote'])).toBeTruthy()
    // The detail pair and the card pair both carry the price.
    expect(screen.getAllByText(SERVICE.price!).length).toBe(2)
    // The brief slot is the only editable field.
    fireEvent.change(screen.getByPlaceholderText(zh['order.briefPlaceholder']), { target: { value: '我们走铁路，重点看清关' } })
    fireEvent.click(screen.getByRole('button', { name: zh['order.confirm'] }))
    await waitFor(() => { expect(screen.getByText(RECEIPT.order_no)).toBeTruthy() })
    expect(placeOrder).toHaveBeenCalledWith(SERVICE, '我们走铁路，重点看清关')
    expect(screen.getByText(zh['order.status.pending'])).toBeTruthy()
  })

  it('scrolls from the receipt to the orders section through the view-order entry', async () => {
    const scrollIntoView = vi.fn()
    // oxlint-disable-next-line typescript/unbound-method -- saving the prototype slot for restoration; never invoked.
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      openService()
      fireEvent.click(screen.getByRole('button', { name: zh['detail.order'] }))
      fireEvent.click(screen.getByRole('button', { name: zh['order.confirm'] }))
      await waitFor(() => { expect(screen.getByText(RECEIPT.order_no)).toBeTruthy() })
      // The orders section anchor exists once the receipt lands.
      expect(document.getElementById('market-orders')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: zh['order.receiptViewOrder'] }))
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('surfaces a placement failure inside the card and keeps the snapshot editable', async () => {
    const mounted = mount(READY, {
      placeOrder: vi.fn(async () => { throw new Error('orders-not-composed') }),
    })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(SERVICE.title) }))
    fireEvent.click(screen.getByRole('button', { name: zh['detail.order'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['order.confirm'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('orders-not-composed') })
    expect(mounted.requestView).not.toHaveBeenCalled()
  })

  it('hides the order action on non-service assets', () => {
    mount(READY)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(TABLE.title) }))
    expect(screen.queryByRole('button', { name: zh['detail.order'] })).toBeNull()
    expect(screen.getByText(providerLabelOf(TABLE.provider_id))).toBeTruthy()
  })
})

describe('MarketEntry', () => {
  function mountEntry(state: MarketClientState, options: { wide?: boolean; current?: { id: string; blank: boolean } } = {}) {
    const store = createSnapshotStore<MarketClientState>(state)
    const sessions = createSnapshotStore(sessionListState(options.current ?? { id: 's1', blank: true }))
    const refresh = vi.fn()
    const requestMarketView = vi.fn()
    render(
      <MarketEntry
        wide={options.wide ?? true}
        useSessions={bindStoreHook(sessions) as never}
        {...GLOBAL_KIT}
        useMarket={bindStoreHook(store) as never}
        refresh={refresh}
        requestMarketView={requestMarketView}
        t={t}
      />,
    )
    return { refresh, requestMarketView }
  }

  it('loads on mount, badges the product count, and switches views on click', () => {
    const idle = mountEntry({ stats: undefined, catalog: undefined, orders: undefined })
    expect(idle.refresh).toHaveBeenCalled()
    expect(screen.queryByText('3')).toBeNull()
    cleanup()
    const { refresh, requestMarketView } = mountEntry(READY)
    expect(screen.getByText('3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['entry.productsBadge'] }))
    expect(requestMarketView).toHaveBeenCalled()
    // A ready cache does not re-trigger the mount load.
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows the question mark on error and refreshes when no session exists', () => {
    const failing: MarketClientState = {
      stats: { status: 'error', error: 'x' },
      catalog: { status: 'error', error: 'x' },
      orders: undefined,
    }
    mountEntry(failing)
    expect(screen.getByText('?')).toBeTruthy()
    cleanup()
    const store = createSnapshotStore<MarketClientState>(READY)
    const none = createSnapshotStore({
      ids: [], byId: {}, current: undefined,
      phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    } as never)
    const refresh = vi.fn()
    render(
      <MarketEntry
        wide
        {...GLOBAL_KIT}
        useSessions={bindStoreHook(none) as never}
        useMarket={bindStoreHook(store) as never}
        refresh={refresh}
        requestMarketView={vi.fn()}
        t={t}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: zh['entry.productsBadge'] }))
    expect(refresh).toHaveBeenCalled()
  })
})
