// @vitest-environment jsdom
// MarketView's remaining presentation branches: the stats skeleton, the
// ready-but-empty featured rail, the expert detail panel (affiliation,
// domains, update date, cite handoff), a service without pricing or
// deliverable (the em-dash pairs), and the receipt's conversation handoff.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { MarketClientState } from '../src/client/marketStore.ts'
import type { MarketAssetRow, MarketOrderReceipt } from '../src/client/marketTypes.ts'
import { MarketView } from '../src/client/MarketView.tsx'
import { OrderConfirmCard } from '../src/client/OrderConfirmCard.tsx'
import { zh } from '../src/client/locales.ts'
// Type-only: pulls the LocaleNamespaceMap merge so PropsLocale<'market'> resolves.
import type {} from '../src/client/index.ts'
import { bindStoreHook, SESSION_KIT } from './market-fixture.client.ts'

const translate = (key: string, params?: Record<string, string | number>): string => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}
const t = translate as never

/** The confirm/cancel buttons' disabled flag (the card's submit gate under test). */
// oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- oxlint's types miss the overload; tsc needs the button face.
const buttonDisabled = (name: string): boolean => (screen.getByRole('button', { name }) as HTMLButtonElement).disabled

const EXPERT: MarketAssetRow = {
  provider_id: 'connector-nocobase', dataset_id: 'experts/1', title: '张红喜 · 食品出海关税专家', kind: 'expert-profile',
  description: '漯河市电子商务协会会长', updated_at: '2026-09-01T00:00:00.000Z',
  expert_org: '漯河市电子商务协会（会长）', domains: ['食品出海', '中亚五国'],
}

const BARE_SERVICE: MarketAssetRow = {
  provider_id: 'connector-nocobase', dataset_id: 'expert_services/2', title: '裸服务', kind: 'service',
  service_id: 'expert_services/2', service_name: '裸服务',
}

const RECEIPT: MarketOrderReceipt = {
  id: 3, order_no: 'ORD-20260907-0003', service_name: '中亚货运动线方案', status: 'delivered', created_at: '',
}

function mountWithPlaceOrder(placeOrder: (asset: MarketAssetRow, brief: string) => Promise<MarketOrderReceipt>) {
  const store = createSnapshotStore<MarketClientState>({
    stats: { status: 'ready', value: { products: 1, providers: 1, monthly_orders: 0, featured: [] } },
    catalog: { status: 'ready', value: [BARE_SERVICE] },
  })
  const requestView = vi.fn()
  render(
    <MarketView
      {...SESSION_KIT}
      inputActions={{ setDraft: vi.fn() } as never}
      useMarket={bindStoreHook(store) as never}
      refresh={vi.fn()}
      placeOrder={placeOrder}
      requestView={requestView}
      t={t}
    />,
  )
  return { requestView }
}

function mount(state: MarketClientState) {
  const store = createSnapshotStore<MarketClientState>(state)
  const refresh = vi.fn()
  const placeOrder = vi.fn(async () => RECEIPT)
  const requestView = vi.fn()
  const setDraft = vi.fn()
  render(
    <MarketView
      {...SESSION_KIT}
      inputActions={{ setDraft } as never}
      useMarket={bindStoreHook(store) as never}
      refresh={refresh}
      placeOrder={placeOrder}
      requestView={requestView}
      t={t}
    />,
  )
  return { refresh, placeOrder, requestView, setDraft, store }
}

afterEach(cleanup)

describe('MarketView remaining branches', () => {
  it('renders the counters and catalog skeletons while both loads run and clears a stale selection', () => {
    mount({
      stats: { status: 'loading' },
      catalog: { status: 'loading' },
    })
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(screen.queryByText(zh['hero.featured'])).toBeNull()
  })

  it('stringifies a non-Error placement rejection into the card error strip', async () => {
    const mounted = mountWithPlaceOrder(vi.fn(async () => { throw 'raw-refusal' }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(BARE_SERVICE.title) }))
    fireEvent.click(screen.getByRole('button', { name: zh['detail.order'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['order.confirm'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('raw-refusal') })
    // Cancel clears the card back to the action bar.
    fireEvent.click(screen.getByRole('button', { name: zh['order.cancel'] }))
    expect(screen.getByRole('button', { name: zh['detail.order'] })).toBeTruthy()
    expect(mounted.requestView).not.toHaveBeenCalled()
  })

  it('shows the expert detail pairs and the cite handoff prefills the draft', () => {
    const { setDraft, requestView } = mount({
      stats: { status: 'ready', value: { products: 1, providers: 1, monthly_orders: 0, featured: [] } },
      catalog: { status: 'ready', value: [EXPERT] },
    })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(EXPERT.title) }))
    expect(screen.getByText(EXPERT.expert_org!)).toBeTruthy()
    expect(screen.getByText(EXPERT.domains![0]!)).toBeTruthy()
    expect(screen.getByText('2026-09-01')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['detail.cite'] }))
    expect(setDraft).toHaveBeenCalledWith(translate('ask.prefix', { title: EXPERT.title }))
    expect(requestView).toHaveBeenCalledWith('chat')
  })

  it('renders the summary line, follows the back link, and falls back to the title in the card', () => {
    const summarized: MarketAssetRow = { ...BARE_SERVICE, summary: '覆盖清关与仓配' }
    mount({
      stats: { status: 'ready', value: { products: 1, providers: 1, monthly_orders: 0, featured: [] } },
      catalog: { status: 'ready', value: [summarized] },
    })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(summarized.title) }))
    expect(screen.getByText('覆盖清关与仓配')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['detail.back'] }))
    expect(screen.getByRole('button', { name: new RegExp(summarized.title) })).toBeTruthy()
  })

  it('renders the em-dash pairs for a service without pricing or deliverable', () => {
    mount({
      stats: { status: 'ready', value: { products: 1, providers: 1, monthly_orders: 0, featured: [] } },
      catalog: { status: 'ready', value: [BARE_SERVICE] },
    })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(BARE_SERVICE.title) }))
    fireEvent.click(screen.getByRole('button', { name: zh['detail.order'] }))
    // The confirm card's price and deliverable rows both fall back to —.
    expect(screen.getAllByText('—').length).toBe(2)
  })

  it('hands the receipt back to the conversation on the progress action', async () => {
    const { placeOrder, setDraft, requestView } = mount({
      stats: { status: 'ready', value: { products: 1, providers: 1, monthly_orders: 0, featured: [] } },
      catalog: { status: 'ready', value: [BARE_SERVICE] },
    })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(BARE_SERVICE.title) }))
    fireEvent.click(screen.getByRole('button', { name: zh['detail.order'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['order.confirm'] }))
    await waitFor(() => { expect(screen.getByText(RECEIPT.order_no)).toBeTruthy() })
    expect(screen.getByText(zh['order.status.delivered'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['order.receiptAskProgress'] }))
    expect(setDraft).toHaveBeenCalledWith(translate('ask.prefix', { title: RECEIPT.service_name }))
    expect(requestView).toHaveBeenCalledWith('chat')
    expect(placeOrder).toHaveBeenCalled()
  })
})

describe('OrderConfirmCard title fallback', () => {
  it('falls back to the asset title when no service name is published', () => {
    render(
      <OrderConfirmCard
        t={t}
        asset={{ ...EXPERT, kind: 'service', service_id: 'experts/1' }}
        brief="需求"
        onBriefChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        submitting={false}
      />,
    )
    expect(screen.getAllByText(EXPERT.title).length).toBeGreaterThan(0)
  })
})

describe('OrderConfirmCard brief slot', () => {
  it('keeps the confirm disabled on an empty brief and follows an edit', () => {
    const onBriefChange = vi.fn()
    const { rerender } = render(
      <OrderConfirmCard
        t={t}
        asset={BARE_SERVICE}
        brief=""
        onBriefChange={onBriefChange}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        submitting={false}
      />,
    )
    expect(buttonDisabled(zh['order.confirm'])).toBe(true)
    rerender(
      <OrderConfirmCard
        t={t}
        asset={BARE_SERVICE}
        brief="补充后的需求"
        onBriefChange={onBriefChange}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        submitting={false}
      />,
    )
    expect(buttonDisabled(zh['order.confirm'])).toBe(false)
    expect(onBriefChange).not.toHaveBeenCalled()
  })
})

describe('OrderConfirmCard disabled confirm while submitting', () => {
  it('keeps both actions disabled during submission', () => {
    const onBriefChange = vi.fn()
    render(
      <OrderConfirmCard
        t={t}
        asset={BARE_SERVICE}
        brief="已填写的需求"
        onBriefChange={onBriefChange}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        submitting
      />,
    )
    expect(buttonDisabled(zh['order.cancel'])).toBe(true)
    expect(buttonDisabled(zh['order.submitting'])).toBe(true)
    expect(screen.queryByRole('button', { name: zh['order.confirm'] })).toBeNull()
  })
})
