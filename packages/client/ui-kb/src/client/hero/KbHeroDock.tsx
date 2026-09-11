/**
 * The KB portal dock: the blank-session hero's usage chips, sample questions,
 * the scenario portal (a featured front row, a category browse with collapsed
 * groups, and a live search that filters all thirty cards), and the
 * recent-search rail (the localStorage-backed last five queries), riding the
 * `conversation.input.dock` seat above the composer card. Renders only while
 * the session is blank in its blank phase — an active conversation sees
 * nothing (the presentation stays a pure function of the owner's session
 * snapshot).
 * @module @deepseek-ai/dsh-client-ui-kb/client/hero/KbHeroDock
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import clsx from 'clsx'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button, IconChevronDownOutline14, IconChevronRightOutline14, IconSearchOutline16, Input, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the input-dock seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { KbClientState } from '../kbStore.ts'
import {
  KB_SCENARIOS, featuredScenarios, filterScenarios, scenariosByCategory, type KbScenario, type KbScenarioCategory,
} from './scenarios.ts'
import { clearRecentSearches, recentSearches } from '../recentSearches.ts'
import css from './hero.module.css'

/** Registration-side business face for the portal dock. */
export interface KbHeroDockInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useKb. */
    kb: SnapshotStore<KbClientState>
    /** The view bridge's workbench mount mirror (the portal yields while true). */
    workbench: SnapshotStore<boolean>
  }
  /** Load or reload the shared stats cache. */
  refresh: () => void
  /** Apply one scenario preset to the blank session; rejects on failure. */
  selectScenario: (scenarioId: string) => Promise<void>
  /** Active display language for the scenario catalog's own copy. */
  language: () => 'zh' | 'en'
}

/** Full component props: the input-zone owner share plus the inject face and locale seat. */
export type KbHeroDockProps =
  PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'kb'>
  & InjectFace<KbHeroDockInjected>

/**
 * Render the portal content for the blank hero, or nothing once the session
 * has content.
 * @param props - the input-zone snapshot, the shared store hook, and the actions.
 * @returns the portal column, or null outside the hero phase.
 */
export function KbHeroDock({
  session, inputActions, useKb, useWorkbench, refresh, selectScenario, language, t,
}: KbHeroDockProps): JSX.Element | null {
  const state = useKb(snapshot => snapshot)
  // A blank session keeps its view ring (the shell renders it once tabs
  // exist), so the workbench tab can own the column while the session stays
  // blank — the portal steps aside for that mount and returns on switch-back.
  const workbenchMounted = useWorkbench(mounted => mounted)
  const [pending, setPending] = useState<KbScenario | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // The scenario portal's browse state: a live search query plus the set of
  // category groups the user has expanded. Both live only in this component —
  // the catalog itself stays static.
  const [query, setQuery] = useState('')
  const [openCategories, setOpenCategories] = useState<ReadonlySet<KbScenarioCategory>>(() => new Set())
  // The recent rail reads on mount and after every workbench occupation: the
  // dock stays mounted while the workbench tab owns the column (it renders
  // nothing), so those are exactly the windows in which the log can change.
  const [recent, setRecent] = useState<string[]>(() => recentSearches())
  useEffect(() => {
    if (!workbenchMounted) setRecent(recentSearches())
  }, [workbenchMounted])

  useEffect(() => {
    if (state.stats === undefined) refresh()
  }, [state.stats, refresh])

  if (!(session.blank && session.composerPhase === 'blank')) return null
  if (workbenchMounted) return null

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

  const startScenario = (): void => {
    /* v8 ignore next -- the start button lives inside the confirm modal, whose
       open state is pending itself, and busy disables it; both guards are
       defense against a dispatch outside the rendered chrome. */
    if (pending === undefined || busy) return
    setBusy(true)
    setFailed(false)
    selectScenario(pending.id).then(() => {
      fillDraft(language() === 'zh' ? pending.probeZh : pending.probeEn)
      setPending(undefined)
    }).catch(() => {
      setFailed(true)
    }).finally(() => {
      setBusy(false)
    })
  }

  return (
    <div className={css.portal}>
      <UsageChips state={state} refresh={refresh} onEmptyFill={() => { fillDraft(t('hero.sample1')) }} t={t} />

      <div className={css.samples} role="group" aria-label={t('hero.sample1')}>
        <Button variant="ghost" size="sm" onClick={() => { fillDraft(t('hero.sample1')) }}>{t('hero.sample1')}</Button>
        <Button variant="ghost" size="sm" onClick={() => { fillDraft(t('hero.sample2')) }}>{t('hero.sample2')}</Button>
      </div>

      <section className={css.scenarios} aria-label={t('scenario.title')}>
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
                <Button key={item} variant="ghost" size="sm" onClick={() => { fillDraft(item) }}>{item}</Button>
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
function ScenarioCard({ scenario, zh, onPick }: {
  scenario: KbScenario
  zh: boolean
  onPick: () => void
}): JSX.Element {
  return (
    <button type="button" className={css.scenarioCard} onClick={onPick}>
      <span className={css.scenarioName}>{zh ? scenario.nameZh : scenario.nameEn}</span>
      <span className={css.scenarioDescription}>
        {zh ? scenario.descriptionZh : scenario.descriptionEn}
      </span>
    </button>
  )
}

/**
 * The usage chip row with its load/empty/error matrix.
 * @param props - the shared snapshot, the reload action, the empty-state fill, and the locale seat.
 * @param props.state - shared client-session snapshot.
 * @param props.refresh - stats reload action.
 * @param props.onEmptyFill - the empty-KB guidance action (fills a starter question).
 * @param props.t - locale seat.
 * @returns the chip row, the empty guidance, or the error strip.
 */
function UsageChips({ state, refresh, onEmptyFill, t }: {
  state: KbClientState
  refresh: () => void
  onEmptyFill: () => void
  t: PropsLocale<'kb'>['t']
}): JSX.Element {
  const stats = state.stats
  if (stats === undefined || stats.status === 'loading') {
    return (
      <div className={css.chips}>
        {[0, 1, 2].map(index => <span key={index} className={css.chipSkeleton} aria-hidden="true" />)}
      </div>
    )
  }
  if (stats.status === 'error') {
    return (
      <div className={css.unavailable} role="alert">
        <span>{t('error.unavailable')}</span>
        <Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>
      </div>
    )
  }
  const usage = stats.usage
  if (usage.documents === 0) {
    return (
      <div className={css.empty}>
        <span>{t('hero.empty')}</span>
        <Button variant="ghost" size="sm" onClick={onEmptyFill}>{t('hero.emptyAction')}</Button>
      </div>
    )
  }
  return (
    <div className={css.chips}>
      <span className={css.chip}>{t('usage.chipDocuments', { n: usage.documents })}</span>
      <span className={css.chip}>{t('usage.chipSearches', { n: usage.searches })}</span>
      <span className={css.chip}>{t('usage.chipScenarios', { n: KB_SCENARIOS.length })}</span>
    </div>
  )
}
