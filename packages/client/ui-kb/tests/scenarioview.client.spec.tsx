// @vitest-environment jsdom
// The scenarios view tab: renders the full portal in every session state
// (blank or with history — the view seat owns the column), walks the usage
// meta matrix (loading / error / empty / ready), fills sample questions into
// the draft and lands on the chat tab, and starts a scenario through the
// confirm dialog (success fills the probe; failure shows the retry copy).
// The scenario catalog's information architecture gets its own cases: six
// featured cards on the default view, category rows that expand in place, and
// the live search that filters all thirty cards.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { KbClientState } from '../src/client/kbStore.ts'
import { KB_SCENARIOS } from '../src/client/hero/scenarios.ts'
import { ScenarioView } from '../src/client/scenarios/ScenarioView.tsx'
import { KbHeroHeadline } from '../src/client/hero/KbHeroHeadline.tsx'
import { KbOverviewBand } from '../src/client/hero/KbOverviewBand.tsx'
import { setScenarioPinned } from '../src/client/hero/pinnedScenarios.ts'
import { zh } from '../src/client/locales.ts'
import { clearRecentSearches, noteRecentSearch } from '../src/client/recentSearches.ts'
import { bindStoreHook, GLOBAL_KIT, READY_USAGE, SESSION_KIT } from './kb-fixture.client.ts'

/** The zh dictionary as the view's t (params rendered the way the runtime does). */
const t = ((key: string, params?: Record<string, string | number>) => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never

function mount(state: KbClientState, options: {
  selectScenario?: (scenarioId: string) => Promise<void>
  refresh?: () => void
  language?: () => 'zh' | 'en'
  loadOverview?: () => Promise<readonly { id: string; label: string; value: number }[]>
  loadDeliverables?: () => Promise<readonly { orderNo: string; serviceName: string | undefined; generatedAt: string | undefined }[]>
} = {}) {
  const store = createSnapshotStore<KbClientState>(state)
  const refresh = options.refresh ?? vi.fn()
  const selectScenario = options.selectScenario ?? vi.fn(async (_scenarioId: string) => {})
  const setDraft = vi.fn()
  const requestView = vi.fn()
  render(
    <ScenarioView
      {...SESSION_KIT}
      inputActions={{ setDraft } as never}
      useKb={bindStoreHook(store) as never}
      refresh={refresh}
      selectScenario={(_sessionId: string, scenarioId: string) => selectScenario(scenarioId)}
      language={options.language ?? (() => 'zh')}
      requestView={requestView}
      loadOverview={options.loadOverview ?? (vi.fn(async () => {
        throw new Error('fixture: overview unconfigured')
      }) as never)}
      loadDeliverables={options.loadDeliverables ?? (vi.fn(async () => []) as never)}
      t={t}
    />,
  )
  return { refresh, selectScenario, setDraft, requestView, store }
}

/** Type into the scenario catalog's search box (input type=search ⇒ searchbox role). */
function searchScenarios(text: string): void {
  fireEvent.change(screen.getByRole('searchbox', { name: zh['scenario.searchLabel'] }), { target: { value: text } })
}

/** Click one collapsed category row in the browse zone (zh label + its count). */
function expandCategory(label: string): void {
  // Anchored: scenario-card descriptions also carry words like 工艺/供应链,
  // and those cards must not swallow the category-row click.
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}\\d+$`, 'u') }))
}

/** Every scenario card currently in the document (featured, expanded, or search hits). */
function scenarioCards(): HTMLElement[] {
  return screen.getAllByRole('button').filter(button => button.className.includes('scenarioCard'))
}

afterEach(() => {
  cleanup()
  clearRecentSearches()
})

describe('ScenarioView', () => {
  it('renders the full portal on a session with history (non-blank sessions keep the catalog)', () => {
    // The view seat owns the column in every session state; the blank-phase
    // gate the input-dock portal carried is gone with the seat.
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(screen.getByRole('heading', { name: zh['scenarios.page.title'] })).toBeTruthy()
    expect(screen.getByText(zh['scenarios.page.tagline'])).toBeTruthy()
    expect(screen.getByText(zh['scenario.railCount'].replaceAll('{n}', String(KB_SCENARIOS.length)))).toBeTruthy()
    expect(scenarioCards()).toHaveLength(6)
  })

  it('loads stats on first mount and shows the hero skeleton while loading', () => {
    const { refresh } = mount({ stats: undefined, records: [] })
    expect(refresh).toHaveBeenCalled()
    expect(document.querySelector('[class*="skeleton"]')).not.toBeNull()
  })

  it('shows the unavailable strip with retry when stats fail', () => {
    const { refresh } = mount({ stats: { status: 'error', error: 'kb-not-composed' }, records: [] })
    expect(screen.getByRole('alert').textContent).toContain(zh['error.unavailable'])
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    expect(refresh).toHaveBeenCalled()
  })

  it('renders the empty guidance inside the page hero when the KB has no documents', () => {
    const { setDraft, requestView } = mount({ stats: { status: 'ready', usage: { documents: 0, searches: 0, ingestedDocuments: 0 } }, records: [] })
    expect(screen.getByText(zh['hero.empty'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['hero.emptyAction'] }))
    // The degraded jump fills a starter question and lands on the chat tab.
    expect(setDraft).toHaveBeenCalledWith(zh['hero.sample1'])
    expect(requestView).toHaveBeenCalledWith('chat')
  })

  it('shows the ready usage chips in the hero meta and fills a sample question into the chat draft', () => {
    const { setDraft, requestView } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(screen.getByText(zh['usage.chipDocuments'].replaceAll('{n}', '12'))).toBeTruthy()
    expect(screen.getByText(zh['usage.chipSearches'].replaceAll('{n}', '35'))).toBeTruthy()
    expect(screen.getByText(zh['usage.chipScenarios'].replaceAll('{n}', String(KB_SCENARIOS.length)))).toBeTruthy()
    expect(screen.getByText(zh['scenario.railCount'].replaceAll('{n}', String(KB_SCENARIOS.length)))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['hero.sample1'] }))
    expect(setDraft).toHaveBeenCalledWith(zh['hero.sample1'])
    expect(requestView).toHaveBeenCalledWith('chat')
    fireEvent.click(screen.getByRole('button', { name: zh['hero.sample2'] }))
    expect(setDraft).toHaveBeenCalledWith(zh['hero.sample2'])
    expect(requestView).toHaveBeenLastCalledWith('chat')
  })

  it('shows only the six featured cards on the default browse view', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    // The featured front row is the whole default card surface: every
    // non-featured scenario folds behind its collapsed category row.
    expect(scenarioCards()).toHaveLength(6)
    expect(screen.getByText('AI 营销洞察主管')).toBeTruthy()
    expect(screen.queryByText('智能品控主管')).toBeNull()
    // Both browse zones are present with their labels.
    expect(screen.getByRole('group', { name: zh['scenario.featuredTitle'] })).toBeTruthy()
    expect(screen.getByRole('group', { name: zh['scenario.browseTitle'] })).toBeTruthy()
    // Every category row starts collapsed.
    const rows = screen.getAllByRole('button', { expanded: false })
    expect(rows.map(row => row.textContent)).toContain('市场洞察5')
    for (const row of rows) expect(row.getAttribute('aria-expanded')).toBe('false')
  })

  it('expands a category row in place and keeps other categories collapsed', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expandCategory('工艺')
    // The process bucket's four cards appear beside the featured six.
    expect(scenarioCards()).toHaveLength(10)
    expect(screen.getByText('智能品控主管')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^工艺\d+$/u }).getAttribute('aria-expanded')).toBe('true')
    // Sibling categories stay folded.
    expect(screen.getByRole('button', { name: /^食品安全\d+$/u }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('AI 食安合规官')).toBeNull()
    // A second click folds the group back.
    expandCategory('工艺')
    expect(screen.getByRole('button', { name: /^工艺\d+$/u }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('智能品控主管')).toBeNull()
  })

  it('filters all thirty cards through the live search and recovers the browse view on clear', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    searchScenarios('食安')
    // Four hits across two categories (three food-safety names plus the
    // enterprise-data description), each still under its category label.
    expect(scenarioCards()).toHaveLength(4)
    expect(screen.getByText('AI 食安服务主管')).toBeTruthy()
    expect(screen.queryByText('AI 营销洞察主管')).toBeNull()
    expect(screen.getByText(zh['scenario.searchResultCount']
      .replaceAll('{n}', '4')
      .replaceAll('{total}', String(KB_SCENARIOS.length)))).toBeTruthy()
    // A miss renders the empty state instead of cards.
    searchScenarios('不存在的关键词')
    expect(screen.getByText(zh['scenario.searchEmpty'])).toBeTruthy()
    expect(scenarioCards()).toHaveLength(0)
    // Clearing the query restores the featured + browse view.
    searchScenarios('')
    expect(scenarioCards()).toHaveLength(6)
    expect(screen.getByRole('group', { name: zh['scenario.featuredTitle'] })).toBeTruthy()
  })

  it('renders the English catalog copy and fills the English probe', async () => {
    const { setDraft } = mount(
      { stats: { status: 'ready', usage: READY_USAGE }, records: [] },
      { language: () => 'en', selectScenario: vi.fn(async () => {}) },
    )
    expect(screen.getByText('AI Marketing Insight Lead')).toBeTruthy()
    // The confirm dialog mirrors the language, including the probe. The
    // process-quality card reaches through the search box (not featured).
    searchScenarios('UHT')
    expect(screen.getByRole('button', { name: /Smart Quality Control Lead/u })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Smart Quality Control Lead/u }))
    expect(screen.getByRole('dialog').textContent).toContain('standard parameters, limits, and exception handling')
    expect(screen.getByText(`${zh['scenario.probeLabel']}${zh['scenario.probeColon']}UHT 137 hold test`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['scenario.start'] }))
    await waitFor(() => { expect(setDraft).toHaveBeenCalledWith('UHT 137 hold test') })
  })

  it('closes the confirm dialog through the cancel action and the escape key', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expandCategory('工艺')
    fireEvent.click(screen.getByRole('button', { name: /智能品控主管/u }))
    fireEvent.click(screen.getByRole('button', { name: zh['scenario.cancel'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // Reopen and dismiss through the modal's own escape handling.
    fireEvent.click(screen.getByRole('button', { name: /智能品控主管/u }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ignores a second start click while one selection is in flight', async () => {
    const selectScenario = vi.fn(() => new Promise<void>(() => {}))
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { selectScenario })
    expandCategory('工艺')
    fireEvent.click(screen.getByRole('button', { name: /智能品控主管/u }))
    fireEvent.click(screen.getByRole('button', { name: zh['scenario.start'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['scenario.start'] }))
    expect(selectScenario).toHaveBeenCalledTimes(1)
  })

  it('starts a scenario from the confirm dialog for the view session and fills its probe', async () => {
    const { selectScenario, setDraft, requestView } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expandCategory('工艺')
    fireEvent.click(screen.getByRole('button', { name: /智能品控主管/u }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(`${zh['scenario.probeLabel']}${zh['scenario.probeColon']}UHT 137 保温试验`)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['scenario.start'] }))
    await waitFor(() => { expect(selectScenario).toHaveBeenCalledWith('process-quality') })
    await waitFor(() => { expect(setDraft).toHaveBeenCalledWith('UHT 137 保温试验') })
    expect(requestView).toHaveBeenCalledWith('chat')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the failure copy and keeps the dialog open when selection rejects', async () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, {
      selectScenario: vi.fn(async () => { throw new Error('roster refused') }),
    })
    expandCategory('供应链')
    fireEvent.click(screen.getByRole('button', { name: /供应商风险评估员/u }))
    fireEvent.click(screen.getByRole('button', { name: zh['scenario.start'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(zh['scenario.failed']) })
    // The dialog is portaled to the body, so query the screen, not the container.
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('lists the recorded recent searches and fills one into the chat draft', () => {
    noteRecentSearch('山梨酸 酱油')
    noteRecentSearch('车间虫控')
    const { setDraft, requestView } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(screen.getByRole('region', { name: zh['hero.recent'] })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '车间虫控' }))
    expect(setDraft).toHaveBeenCalledWith('车间虫控')
    expect(requestView).toHaveBeenCalledWith('chat')
    // Clearing drops every entry and shows the empty guidance.
    fireEvent.click(screen.getByRole('button', { name: zh['hero.recentClear'] }))
    expect(screen.getByText(zh['hero.recentEmpty'])).toBeTruthy()
  })

  it('shows the recent-search empty guidance on a fresh session', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(screen.getByText(zh['hero.recentEmpty'])).toBeTruthy()
  })
})

describe('ScenarioView overview home', () => {
  it('renders the KPI band from the overview loader and pins a scenario into the front rail', async () => {
    const pinned = await import('../src/client/hero/pinnedScenarios.ts')
    localStorage.clear()
    const loadOverview = vi.fn(async () => [
      { id: 'export-value', label: '本月出口额', value: 4318, unit: '万美元', trend: 4.6 },
      { id: 'dest-count', label: '出口目的地', value: 12 },
      { id: 'price-rises', label: '原料涨价项', value: 7, trend: -2, error: undefined },
    ] as never)
    const loadDeliverables = vi.fn(async () => [
      { orderNo: 'ORD-20260917-2c5c436b', serviceName: '海外仓风险应对咨询', generatedAt: '2026-09-17T08:00:00.000Z' },
    ] as never)
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { loadOverview, loadDeliverables })

    const band = await screen.findByTestId('overview-band')
    expect(band.textContent).toContain('本月出口额')
    expect(band.textContent).toContain('4,318')
    expect(band.textContent).toContain('▲4.6%')
    expect(band.textContent).toContain('ORD-20260917-2c5c436b')
    expect(loadOverview).toHaveBeenCalledTimes(1)

    // Pin the first featured card: the pinned rail appears above the catalog.
    const pinButtons = await screen.findAllByRole('button', { name: '钉选场景' })
    fireEvent.click(pinButtons[0]!)
    const rail = await screen.findByRole('region', { name: '钉选场景' })
    expect(rail.textContent).toContain('AI 营销洞察主管')
    expect(pinned.pinnedScenarios()).toEqual(['market-insight'])
    localStorage.clear()
  })

  it('degrades the band inline when the overview read refuses', async () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, {
      loadOverview: vi.fn(async () => { throw new Error('unconfigured') }),
    })
    const band = await screen.findByTestId('overview-band')
    await waitFor(() => {
      expect(band.textContent).toContain('概览数据暂不可用')
    })
  })
})

describe('KbHeroHeadline', () => {
  it('renders the product name and tagline the hero seat swaps in', () => {
    render(<KbHeroHeadline {...GLOBAL_KIT} useSessions={() => undefined as never} t={t} />)
    expect(screen.getByText(zh['hero.title'])).toBeTruthy()
    expect(screen.getByText(zh['hero.tagline'])).toBeTruthy()
  })
})

describe('KbOverviewBand loads', () => {
  /** One manual-settling promise. */
  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }

  it('ignores tier settlements that land after unmount', async () => {
    const overview = deferred<readonly object[]>()
    const deliverables = deferred<readonly object[]>()
    render(
      <KbOverviewBand
        loadOverview={() => overview.promise as never}
        loadDeliverables={() => deliverables.promise as never}
        t={t}
      />,
    )
    // Unmount first: the resolves below must stop at the alive guard.
    cleanup()
    overview.resolve([])
    deliverables.resolve([])
    // The reject arm shares the same guard: an orders-less deployment that
    // answers after the tab switch never touches unmounted state either.
    const rejected = deferred<readonly object[]>()
    render(
      <KbOverviewBand
        loadOverview={() => rejected.promise as never}
        loadDeliverables={() => rejected.promise as never}
        t={t}
      />,
    )
    cleanup()
    rejected.reject(new Error('late'))
    await Promise.allSettled([overview.promise, deliverables.promise, rejected.promise])
  })

  it('renders the per-KPI error line and a bare deliverable row', async () => {
    render(
      <KbOverviewBand
        loadOverview={vi.fn(async () => [
          { id: 'no-seed', label: '本月出口额', value: 0, error: 'seed not configured' },
        ] as never)}
        loadDeliverables={vi.fn(async () => [
          { orderNo: 'ORD-BARE', serviceName: undefined, generatedAt: undefined },
        ] as never)}
        t={t}
      />,
    )
    const band = await screen.findByTestId('overview-band')
    await waitFor(() => { expect(band.textContent).toContain(zh['overview.kpiError']) })
    expect(band.textContent).toContain('ORD-BARE')
    expect(band.textContent).not.toContain(' · ')
  })

  it('renders the empty rail when the deliverables read rejects', async () => {
    render(
      <KbOverviewBand
        loadOverview={vi.fn(async () => [] as never)}
        loadDeliverables={vi.fn(async () => { throw new Error('no orders seam') })}
        t={t}
      />,
    )
    const band = await screen.findByTestId('overview-band')
    await waitFor(() => { expect(band.textContent).toContain(zh['overview.deliverablesEmpty']) })
  })
})

describe('ScenarioView pinned rail', () => {
  // The pin set keeps a module-level in-memory fallback that earlier specs
  // may have written; an empty-array seed keeps reads on the storage leg.
  beforeEach(() => { localStorage.setItem('dsh-kb-pinned-scenarios', '[]') })
  afterEach(() => { localStorage.setItem('dsh-kb-pinned-scenarios', '[]') })

  it('picks from the featured row directly through the confirm dialog', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    // The card's accessible name concatenates its description, so anchor on
    // the leading card name (the existing pick-path convention).
    fireEvent.click(screen.getByRole('button', { name: /AI 营销洞察主管/u }))
    expect(screen.getByRole('dialog').textContent).toContain('AI 营销洞察主管')
    fireEvent.click(screen.getByRole('button', { name: zh['scenario.cancel'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('unpins through the rail card and shows the empty guidance', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    fireEvent.click(screen.getAllByRole('button', { name: zh['scenario.pin'] })[0]!)
    const rail = screen.getByRole('region', { name: zh['overview.pinned'] })
    expect(rail.textContent).toContain('AI 营销洞察主管')
    // Picking from the rail opens the same confirm dialog; the rail copy
    // precedes the featured row in the document.
    fireEvent.click(screen.getAllByRole('button', { name: /AI 营销洞察主管/u })[0]!)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['scenario.cancel'] }))
    // The rail card's own star toggles the pin off; the featured twin of the
    // same scenario carries the same unpin label, and the rail precedes it.
    fireEvent.click(screen.getAllByRole('button', { name: zh['scenario.unpin'] })[0]!)
    expect(screen.getByText(zh['overview.pinnedEmpty'])).toBeTruthy()
  })

  it('pins a card from an expanded category group', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expandCategory('工艺')
    const groupPin = screen.getAllByRole('button', { name: zh['scenario.pin'] })
      .find(button => button.closest('[class*="categoryGroup"]') !== null)!
    fireEvent.click(groupPin)
    const rail = screen.getByRole('region', { name: zh['overview.pinned'] })
    expect(rail.textContent).toContain('智能品控主管')
    expect(setScenarioPinned('process-quality', true)[0]).toBe('process-quality')
  })

  it('pins a card from a search result row', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    searchScenarios('食安')
    const resultPin = screen.getAllByRole('button', { name: zh['scenario.pin'] })
      .find(button => button.closest('[class*="resultsZone"]') !== null)!
    fireEvent.click(resultPin)
    const rail = screen.getByRole('region', { name: zh['overview.pinned'] })
    expect(rail.textContent).toContain('AI 食安服务主管')
  })
})
