// @vitest-environment jsdom
// The blank-session portal dock: renders only in the hero phase, walks the
// usage-chip matrix (loading / error / empty / ready), fills sample questions
// into the draft, and starts a scenario through the confirm dialog (success
// fills the probe; failure shows the retry copy). The scenario portal's
// information architecture gets its own cases: six featured cards on the
// default view, category rows that expand in place, and the live search that
// filters all thirty cards.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { KbClientState } from '../src/client/kbStore.ts'
import { KB_SCENARIOS } from '../src/client/hero/scenarios.ts'
import { KbHeroHeadline } from '../src/client/hero/KbHeroHeadline.tsx'
import { KbHeroDock } from '../src/client/hero/KbHeroDock.tsx'
import { zh } from '../src/client/locales.ts'
import { clearRecentSearches, noteRecentSearch } from '../src/client/recentSearches.ts'
import { bindStoreHook, conversationSnapshot, GLOBAL_KIT, READY_USAGE, SESSION_KIT } from './kb-fixture.client.ts'

/** The zh dictionary as the dock's t (params rendered the way the runtime does). */
const t = ((key: string, params?: Record<string, string | number>) => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never

/** One input-state stub (the dock reads only the actions off the zone). */
const INPUT = {} as never

function mount(state: KbClientState, options: {
  session?: ConversationSnapshot
  selectScenario?: () => Promise<void>
  refresh?: () => void
  language?: () => 'zh' | 'en'
  workbenchMounted?: boolean
} = {}) {
  const store = createSnapshotStore<KbClientState>(state)
  const workbench = createSnapshotStore(options.workbenchMounted ?? false)
  const refresh = options.refresh ?? vi.fn()
  const selectScenario = options.selectScenario ?? vi.fn(async () => {})
  const setDraft = vi.fn()
  render(
    <KbHeroDock
      {...SESSION_KIT}
      session={options.session ?? conversationSnapshot({ blank: true, composerPhase: 'blank' })}
      input={INPUT}
      inputActions={{ setDraft } as never}
      useKb={bindStoreHook(store) as never}
      useWorkbench={bindStoreHook(workbench) as never}
      refresh={refresh}
      selectScenario={selectScenario}
      language={options.language ?? (() => 'zh')}
      t={t}
    />,
  )
  return { refresh, selectScenario, setDraft, store, workbench }
}

/** Type into the scenario portal's search box (input type=search ⇒ searchbox role). */
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

describe('KbHeroHeadline', () => {
  it('renders the product name and tagline', () => {
    render(<KbHeroHeadline {...GLOBAL_KIT} useSessions={() => undefined as never} t={t} />)
    expect(screen.getByText(zh['hero.title'])).toBeTruthy()
    expect(screen.getByText(zh['hero.tagline'])).toBeTruthy()
  })
})

describe('KbHeroDock', () => {
  it('renders nothing once the session has content', () => {
    const { store } = mount({ stats: undefined, records: [] }, {
      session: conversationSnapshot({ blank: false, composerPhase: 'active' }),
    })
    expect(document.querySelector('[class*="portal"]')).toBeNull()
    expect(store.getSnapshot()).toBeDefined()
  })

  it('steps aside while the workbench view tab is mounted, then returns', () => {
    // A blank session keeps its view ring, so the workbench tab can own the
    // column while the session stays blank; the portal yields for that mount.
    const { workbench } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(document.querySelector('[class*="portal"]')).not.toBeNull()
    act(() => { workbench.set(true) })
    expect(document.querySelector('[class*="portal"]')).toBeNull()
    act(() => { workbench.set(false) })
    expect(document.querySelector('[class*="portal"]')).not.toBeNull()
  })

  it('loads stats on first mount and shows skeleton chips while loading', () => {
    const { refresh } = mount({ stats: undefined, records: [] })
    expect(refresh).toHaveBeenCalled()
    expect(document.querySelectorAll('[class*="chipSkeleton"]')).toHaveLength(3)
  })

  it('shows the unavailable strip with retry when stats fail', () => {
    const { refresh } = mount({ stats: { status: 'error', error: 'kb-not-composed' }, records: [] })
    expect(screen.getByRole('alert').textContent).toContain(zh['error.unavailable'])
    fireEvent.click(screen.getByRole('button', { name: zh['error.retry'] }))
    expect(refresh).toHaveBeenCalled()
  })

  it('replaces the chips with the empty guidance when the KB has no documents', () => {
    const { setDraft } = mount({ stats: { status: 'ready', usage: { documents: 0, searches: 0, ingestedDocuments: 0 } }, records: [] })
    expect(screen.getByText(zh['hero.empty'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['hero.emptyAction'] }))
    // The degraded jump: fill a starter question (the workbench tab is not
    // reachable from a blank session's hidden header).
    expect(setDraft).toHaveBeenCalledWith(zh['hero.sample1'])
  })

  it('shows the ready chips and fills a sample question into the draft', () => {
    const { setDraft } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(screen.getByText(zh['usage.chipDocuments'].replaceAll('{n}', '12'))).toBeTruthy()
    expect(screen.getByText(zh['usage.chipSearches'].replaceAll('{n}', '35'))).toBeTruthy()
    expect(screen.getByText(zh['usage.chipScenarios'].replaceAll('{n}', String(KB_SCENARIOS.length)))).toBeTruthy()
    expect(screen.getByText(zh['scenario.railCount'].replaceAll('{n}', String(KB_SCENARIOS.length)))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['hero.sample1'] }))
    expect(setDraft).toHaveBeenCalledWith(zh['hero.sample1'])
    fireEvent.click(screen.getByRole('button', { name: zh['hero.sample2'] }))
    expect(setDraft).toHaveBeenCalledWith(zh['hero.sample2'])
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

  it('starts a scenario from the confirm dialog and fills its probe', async () => {
    const { selectScenario, setDraft } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expandCategory('工艺')
    fireEvent.click(screen.getByRole('button', { name: /智能品控主管/u }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(`${zh['scenario.probeLabel']}${zh['scenario.probeColon']}UHT 137 保温试验`)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['scenario.start'] }))
    await waitFor(() => { expect(selectScenario).toHaveBeenCalledWith('process-quality') })
    await waitFor(() => { expect(setDraft).toHaveBeenCalledWith('UHT 137 保温试验') })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the failure copy and keeps the dialog open when selection rejects', async () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, {
      selectScenario: vi.fn(async () => { throw new Error('session not blank') }),
    })
    expandCategory('供应链')
    fireEvent.click(screen.getByRole('button', { name: /供应商风险评估员/u }))
    fireEvent.click(screen.getByRole('button', { name: zh['scenario.start'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(zh['scenario.failed']) })
    // The dialog is portaled to the body, so query the screen, not the container.
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('lists the recorded recent searches and fills one into the draft', () => {
    noteRecentSearch('山梨酸 酱油')
    noteRecentSearch('车间虫控')
    const { setDraft } = mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(screen.getByRole('region', { name: zh['hero.recent'] })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '车间虫控' }))
    expect(setDraft).toHaveBeenCalledWith('车间虫控')
    // Clearing drops every entry and shows the empty guidance.
    fireEvent.click(screen.getByRole('button', { name: zh['hero.recentClear'] }))
    expect(screen.getByText(zh['hero.recentEmpty'])).toBeTruthy()
  })

  it('shows the recent-search empty guidance on a fresh session', () => {
    mount({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(screen.getByText(zh['hero.recentEmpty'])).toBeTruthy()
  })
})
