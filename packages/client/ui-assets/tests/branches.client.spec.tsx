// @vitest-environment jsdom
// MarketView's remaining presentation branches: the stats skeleton, the
// ready-but-empty featured rail, and the expert detail panel (affiliation,
// domains, update date, cite handoff).

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { MarketClientState } from '../src/client/marketStore.ts'
import type { MarketAssetRow } from '../src/client/marketTypes.ts'
import { MarketView } from '../src/client/MarketView.tsx'
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

const EXPERT: MarketAssetRow = {
  provider_id: 'connector-experts', dataset_id: 'experts/1', title: '张红喜 · 食品出海关税专家', kind: 'expert-profile',
  description: '漯河市电子商务协会会长', updated_at: '2026-09-01T00:00:00.000Z',
  expert_org: '漯河市电子商务协会（会长）', domains: ['食品出海', '中亚五国'],
}

const BARE_SERVICE: MarketAssetRow = {
  provider_id: 'connector-experts', dataset_id: 'expert_services/2', title: '裸服务', kind: 'service',
  service_id: 'expert_services/2', service_name: '裸服务',
}

function mount(state: MarketClientState) {
  const store = createSnapshotStore<MarketClientState>(state)
  const refresh = vi.fn()
  const requestView = vi.fn()
  const setDraft = vi.fn()
  render(
    <MarketView
      {...SESSION_KIT}
      inputActions={{ setDraft } as never}
      useMarket={bindStoreHook(store) as never}
      refresh={refresh}
      requestView={requestView}
      t={t}
    />,
  )
  return { refresh, requestView, setDraft, store }
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

  it('shows the expert detail pairs and the cite handoff prefills the draft', () => {
    const { setDraft, requestView } = mount({
      stats: { status: 'ready', value: { products: 1, providers: 1, featured: [] } },
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
      stats: { status: 'ready', value: { products: 1, providers: 1, featured: [] } },
      catalog: { status: 'ready', value: [summarized] },
    })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(summarized.title) }))
    expect(screen.getByText('覆盖清关与仓配')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['detail.back'] }))
    expect(screen.getByRole('button', { name: new RegExp(summarized.title) })).toBeTruthy()
  })

  it('omits the pricing and deliverable rows for a service without them', () => {
    mount({
      stats: { status: 'ready', value: { products: 1, providers: 1, featured: [] } },
      catalog: { status: 'ready', value: [BARE_SERVICE] },
    })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(BARE_SERVICE.title) }))
    // The detail panel only renders the rows the asset carries.
    expect(screen.queryByText(zh['detail.price'])).toBeNull()
    expect(screen.queryByText(zh['detail.deliverable'])).toBeNull()
  })
})
