/**
 * The scenarios view tab: the scenario portal as its own business page — a
 * PageHero header with the usage counters in its meta row, the sample
 * questions, the scenario catalog (a featured front row, a category browse
 * with collapsed groups, and a live search that filters all thirty cards),
 * and the recent-search rail (the localStorage-backed last five queries).
 * Registered as the `scenarios` entry of the conversation view ring; the
 * portal renders in every session state — a session with history keeps the
 * full catalog reachable (the presenter is a pure function of the shared
 * store, never of the session's blank phase).
 * @module @deepseek-ai/dsh-client-ui-kb/client/scenarios/ScenarioView
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import clsx from 'clsx'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button, IconChevronDownOutline14, IconChevronRightOutline14, IconSearchOutline16, Input, Modal,
  PageHero, PageSkeleton,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the view seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { LakehouseKpiView } from '@deepseek-ai/dsh-client-connection/client'
import type { KbClientState } from '../kbStore.ts'
import {
  KB_SCENARIOS, featuredScenarios, filterScenarios, scenariosByCategory, type KbScenario, type KbScenarioCategory,
} from '../hero/scenarios.ts'
import { KbOverviewBand, type OverviewDeliverable } from '../hero/KbOverviewBand.tsx'
import { pinnedScenarios, setScenarioPinned } from '../hero/pinnedScenarios.ts'
import { clearRecentSearches, recentSearches } from '../recentSearches.ts'
import css from './scenarios.module.css'

/** Registration-side business face for the scenarios view. */
export interface ScenarioViewInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useKb. */
    kb: SnapshotStore<KbClientState>
  }
  /** Load or reload the shared stats cache. */
  refresh: () => void
  /** Apply one scenario preset to the session; rejects on failure. */
  selectScenario: (sessionId: string, scenarioId: string) => Promise<void>
  /** Active display language for the scenario catalog's own copy. */
  language: () => 'zh' | 'en'
  /** Best-effort view switch through the header bridge. */
  requestView: (view: string) => void
  /** Evaluate the overview-home KPI seed (the gateway's lakehouse.overview). */
  loadOverview: () => Promise<readonly LakehouseKpiView[]>
  /** List the latest delivered orders for the overview rail. */
  loadDeliverables: () => Promise<readonly OverviewDeliverable[]>
}

/** Full component props: the view-seat runtime share plus the inject face and locale seat. */
export type ScenarioViewProps =
  PropsRuntime<'conversation.view'>
  & PropsLocale<'kb'>
  & InjectFace<ScenarioViewInjected>

/**
 * Render the scenario portal page.
 * @param props - the view seat's standard kit plus the inject face and locale seat.
 * @returns the scenarios column.
 */
export function ScenarioView({
  sessionId, inputActions, useKb, refresh, selectScenario, language, requestView, loadOverview, loadDeliverables, t,
}: ScenarioViewProps): JSX.Element {
  const state = useKb(snapshot => snapshot)
  const [pending, setPending] = useState<KbScenario | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // The scenario catalog's browse state: a live search query plus the set of
  // category groups the user has expanded. Both live only in this component —
  // the catalog itself stays static.
  const [query, setQuery] = useState('')
  const [openCategories, setOpenCategories] = useState<ReadonlySet<KbScenarioCategory>>(() => new Set())
  // The recent rail reads on mount: every view switch remounts this component,
  // which is exactly the window in which the persisted log can change (the
  // workbench tab records searches while this tab is unmounted).
  const [recent, setRecent] = useState<string[]>(() => recentSearches())
  // The pinned rail: like the recent log, it reads on mount — every view
  // switch remounts this component, which is exactly when another tab's pin
  // writes could have landed.
  const [pinned, setPinned] = useState<string[]>(() => pinnedScenarios())

  useEffect(() => {
    if (state.stats === undefined) refresh()
  }, [state.stats, refresh])

  const zh = language() === 'zh'
  // Null query = the browse view (featured + collapsed categories); otherwise
  // the catalog-wide filter result replaces both zones.
  const matches = filterScenarios(KB_SCENARIOS, query)
  const toggleCategory = (category: KbScenarioCategory): void => {
    setOpenCategories((previous) => {
      const next = new Set(previous)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }
  const fillDraft = (text: string): void => {
    inputActions.setDraft(text)
    document.querySelector<HTMLTextAreaElement>('textarea')?.focus()
  }
  /** Fill the draft and land on the chat tab, where the answer will arrive. */
  const askInChat = (text: string): void => {
    fillDraft(text)
    requestView('chat')
  }

  const startScenario = (): void => {
    /* v8 ignore next -- the start button lives inside the confirm modal, whose
       open state is pending itself, and busy disables it; both guards are
       defense against a dispatch outside the rendered chrome. */
    if (pending === undefined || busy) return
    setBusy(true)
    setFailed(false)
    selectScenario(sessionId, pending.id).then(() => {
      askInChat(language() === 'zh' ? pending.probeZh : pending.probeEn)
      setPending(undefined)
    }).catch(() => {
      setFailed(true)
    }).finally(() => {
      setBusy(false)
    })
  }

  const stats = state.stats

  return (
    <div className={css.scenarios}>
      <PageHero
        eyebrow={t('view.scenarios')}
        title={t('scenarios.page.title')}
        tagline={t('scenarios.page.tagline')}
        meta={stats === undefined || stats.status === 'loading'
          ? <PageSkeleton variant="list" rows={1} />
          : stats.status === 'ready'
            ? <UsageMeta state={state} t={t} />
            : undefined}
      >
        {stats !== undefined && stats.status === 'ready' && stats.usage.documents === 0 && (
          <p className={css.empty}>
            <span>{t('hero.empty')}</span>
            <Button variant="ghost" size="sm" onClick={() => { askInChat(t('hero.sample1')) }}>{t('hero.emptyAction')}</Button>
          </p>
        )}
      </PageHero>

      {stats !== undefined && stats.status === 'error' && (
        <div className={css.unavailable} role="alert">
          <span>{t('error.unavailable')}</span>
          <Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>
        </div>
      )}

      <KbOverviewBand loadOverview={loadOverview} loadDeliverables={loadDeliverables} t={t} />

      <section className={css.pinnedZone} aria-label={t('overview.pinned')}>
        <span className={css.zoneLabel}>{t('overview.pinned')}</span>
        {pinned.length === 0
          ? <p className={css.pinnedEmpty}>{t('overview.pinnedEmpty')}</p>
          : (
            <div className={css.cardGrid}>
              {pinned.flatMap((id) => {
                const scenario = KB_SCENARIOS.find(entry => entry.id === id)
                /* v8 ignore next -- both pinned readers (pinnedScenarios.ts
                   readPersisted and setScenarioPinned) filter ids against the
                   shipped catalog, so the find always resolves. */
                return scenario === undefined ? [] : [(
                  <ScenarioCard
                    key={scenario.id}
                    scenario={scenario}
                    zh={zh}
                    t={t}
                    pinned
                    onTogglePin={() => { setPinned(setScenarioPinned(scenario.id, false)) }}
                    onPick={() => { setFailed(false); setPending(scenario) }}
                  />
                )]
              })}
            </div>
          )}
      </section>

      <div className={css.samples} role="group" aria-label={t('hero.sample1')}>
        <Button variant="ghost" size="sm" onClick={() => { askInChat(t('hero.sample1')) }}>{t('hero.sample1')}</Button>
        <Button variant="ghost" size="sm" onClick={() => { askInChat(t('hero.sample2')) }}>{t('hero.sample2')}</Button>
      </div>

      <section className={css.catalog} aria-label={t('scenario.title')}>
        <div className={css.scenarioToolbar}>
          <span className={css.scenarioHeading}>
            {t('scenario.title')}
            <span className={css.railCount}>{t('scenario.railCount', { n: KB_SCENARIOS.length })}</span>
          </span>
          <Input
            className={clsx(css.scenarioSearch)}
            icon={<IconSearchOutline16 size={16} className={css.searchIcon} aria-hidden="true" />}
            type="search"
            aria-label={t('scenario.searchLabel')}
            placeholder={t('scenario.searchPlaceholder')}
            value={query}
            onChange={(event) => { setQuery(event.target.value) }}
          />
        </div>
        {matches === null
          ? (
            <>
              <div className={css.featuredZone} role="group" aria-label={t('scenario.featuredTitle')}>
                <span className={css.zoneLabel}>{t('scenario.featuredTitle')}</span>
                <div className={css.cardGrid}>
                  {featuredScenarios().map(scenario => (
                    <ScenarioCard
                      key={scenario.id}
                      scenario={scenario}
                      zh={zh}
                      t={t}
                      pinned={pinned.includes(scenario.id)}
                      onTogglePin={() => { setPinned(setScenarioPinned(scenario.id, !pinned.includes(scenario.id))) }}
                      onPick={() => { setFailed(false); setPending(scenario) }}
                    />
                  ))}
                </div>
              </div>
              <div className={css.browseZone} role="group" aria-label={t('scenario.browseTitle')}>
                <span className={css.zoneLabel}>{t('scenario.browseTitle')}</span>
                {scenariosByCategory().map((group) => {
                  const lead = group[0]
                  /* v8 ignore next -- every KB_SCENARIO_CATEGORIES bucket is non-empty
                     in the shipped catalog; the guard is the map's own default. */
                  if (lead === undefined) return null
                  const open = openCategories.has(lead.category)
                  return (
                    <div key={lead.category} className={css.categoryGroup}>
                      <button
                        type="button"
                        className={css.categoryRow}
                        aria-expanded={open}
                        onClick={() => { toggleCategory(lead.category) }}
                      >
                        <IconChevronDownOutline14
                          className={open ? css.chevronOpen : css.chevronClosed}
                          size={12}
                          aria-hidden="true"
                        />
                        <span className={css.categoryName}>{t(`scenario.category.${lead.category}`)}</span>
                        <span className={css.categoryCount}>{group.length}</span>
                      </button>
                      {open && (
                        <div className={css.cardGrid}>
                          {group.map(scenario => (
                            <ScenarioCard
                              key={scenario.id}
                              scenario={scenario}
                              zh={zh}
                              t={t}
                              pinned={pinned.includes(scenario.id)}
                              onTogglePin={() => { setPinned(setScenarioPinned(scenario.id, !pinned.includes(scenario.id))) }}
                              onPick={() => { setFailed(false); setPending(scenario) }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )
          : matches.length === 0
            ? <p className={css.searchEmpty}>{t('scenario.searchEmpty')}</p>
            : (
              <div className={css.resultsZone} role="group" aria-label={t('scenario.searchResultCount', { n: matches.length, total: KB_SCENARIOS.length })}>
                <span className={css.zoneLabel}>
                  {t('scenario.searchResultCount', { n: matches.length, total: KB_SCENARIOS.length })}
                </span>
                {scenariosByCategory(matches).map((group) => {
                  const lead = group[0]
                  if (lead === undefined) return null
                  return (
                    <div key={lead.category} className={css.categoryGroup}>
                      <span className={css.categoryName}>
                        {t(`scenario.category.${lead.category}`)}
                        <IconChevronRightOutline14 className={css.categoryChevron} size={12} aria-hidden="true" />
                      </span>
                      <div className={css.cardGrid}>
                        {group.map(scenario => (
                          <ScenarioCard
                            key={scenario.id}
                            scenario={scenario}
                            zh={zh}
                            t={t}
                            pinned={pinned.includes(scenario.id)}
                            onTogglePin={() => { setPinned(setScenarioPinned(scenario.id, !pinned.includes(scenario.id))) }}
                            onPick={() => { setFailed(false); setPending(scenario) }}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
      </section>

      <section className={css.recents} aria-label={t('hero.recent')}>
        <span className={css.scenarioHeading}>{t('hero.recent')}</span>
        {recent.length === 0
          ? <p className={css.recentEmpty}>{t('hero.recentEmpty')}</p>
          : (
            <div className={css.recentRow} role="list">
              {recent.map(item => (
                <Button key={item} variant="ghost" size="sm" onClick={() => { askInChat(item) }}>{item}</Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearRecentSearches()
                  setRecent([])
                }}
              >
                {t('hero.recentClear')}
              </Button>
            </div>
          )}
      </section>

      <Modal
        open={pending !== undefined}
        onClose={() => { setPending(undefined); setFailed(false) }}
        title={pending === undefined ? '' : zh ? pending.nameZh : pending.nameEn}
        closeLabel={t('ingest.close')}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setPending(undefined); setFailed(false) }}>
              {t('scenario.cancel')}
            </Button>
            <Button variant="primary" disabled={busy} onClick={startScenario}>{t('scenario.start')}</Button>
          </>
        }
      >
        {pending !== undefined && (
          <div className={css.confirm}>
            <p className={css.confirmDescription}>{zh ? pending.descriptionZh : pending.descriptionEn}</p>
            <p className={css.confirmProbe}>
              {t('scenario.probeLabel')}{t('scenario.probeColon')}{zh ? pending.probeZh : pending.probeEn}
            </p>
            {failed && <p className={css.scenarioError} role="alert">{t('scenario.failed')}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}

/**
 * One scenario card as every zone renders it — featured row, expanded
 * category, or search result. Presentation only; the pick action routes
 * through the confirm modal.
 * @param props - the scenario, the active language face, and the pick action.
 * @returns the card button.
 */
function ScenarioCard({ scenario, zh, t, pinned = false, onTogglePin, onPick }: {
  scenario: KbScenario
  zh: boolean
  t: PropsLocale<'kb'>['t']
  /** Whether this scenario currently sits in the pinned rail. */
  pinned?: boolean
  /** Toggle the pin state; absent renders no pin control (the pinned rail's own cards unpin through it). */
  onTogglePin?: () => void
  onPick: () => void
}): JSX.Element {
  return (
    <div className={css.scenarioCardWrap}>
      <button type="button" className={css.scenarioCard} onClick={onPick}>
        <span className={css.scenarioName}>{zh ? scenario.nameZh : scenario.nameEn}</span>
        <span className={css.scenarioDescription}>
          {zh ? scenario.descriptionZh : scenario.descriptionEn}
        </span>
      </button>
      {onTogglePin !== undefined && (
        <button
          type="button"
          className={css.scenarioPin}
          data-pinned={pinned || undefined}
          aria-label={pinned ? t('scenario.unpin') : t('scenario.pin')}
          title={pinned ? t('scenario.unpin') : t('scenario.pin')}
          onClick={onTogglePin}
        >
          {pinned ? '★' : '☆'}
        </button>
      )}
    </div>
  )
}

/**
 * The usage chip row for the PageHero meta tier (the ready state of the
 * load/empty/error matrix; loading renders the PageSkeleton, error the
 * strip below the hero, and the empty guidance rides the hero's content).
 * @param props - the shared snapshot and the locale seat.
 * @returns the chip row.
 */
function UsageMeta({ state, t }: {
  state: KbClientState
  t: PropsLocale<'kb'>['t']
}): JSX.Element {
  /* v8 ignore start -- the sole call site renders UsageMeta only after
     narrowing stats to 'ready', so the fallback arms answer the shared-state
     type, not a reachable render. */
  const usage = state.stats?.status === 'ready' ? state.stats.usage : undefined
  if (usage === undefined) return <></>
  /* v8 ignore stop */
  return (
    <span className={css.chips}>
      <span className={css.chip}>{t('usage.chipDocuments', { n: usage.documents })}</span>
      <span className={css.chip}>{t('usage.chipSearches', { n: usage.searches })}</span>
      <span className={css.chip}>{t('usage.chipScenarios', { n: KB_SCENARIOS.length })}</span>
    </span>
  )
}
