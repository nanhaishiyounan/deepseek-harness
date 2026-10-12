/**
 * The governance conversation view: four tabs over the gateway's governance
 * domain — the cross-source catalog with search, the lineage edge list, the
 * quality rules with run-evaluation, and the alert events with the webhook
 * test. A deployment without the governance engine shows the structured
 * refusal inline.
 * @module @deepseek-ai/dsh-client-ui-governance/client/GovernanceView
 */

import { useState } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import clsx from 'clsx'
import type { GovernanceClientState, GovernanceOutcomeRow } from './governanceStore.ts'
import type { GovernanceAssetRow, GovernanceEdgeRow, GovernanceEventRow, GovernanceRuleRow } from './governanceStore.ts'
import css from './view.module.css'

/** Registration-side business face for the conversation view. */
export interface GovernanceViewInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useGovernance. */
    governance: SnapshotStore<GovernanceClientState>
  }
  /** Load or reload the inventory cache. */
  refresh: () => void
  /** Load or reload the lineage edges. */
  refreshLineage: () => void
  /** Load or reload the quality rules. */
  refreshRules: () => void
  /** Load or reload the alert events. */
  refreshEvents: () => void
  /** Run the quality evaluation (outcomes land in the store). */
  runEvaluation: () => void
  /** Fire the webhook test event. */
  testWebhook: () => void
  /** Update the catalog search query. */
  setSearch: (query: string) => void
}

/** View props: the conversation-view seat's locale share plus the inject face. */
export type GovernanceViewProps =
  PropsLocale<'governance'>
  & InjectFace<GovernanceViewInjected>

type TabId = 'catalog' | 'lineage' | 'quality' | 'alerts'

/** Latest outcome for one rule, when an evaluation has run. */
function outcomeFor(outcomes: readonly GovernanceOutcomeRow[] | undefined, ruleId: string): GovernanceOutcomeRow | undefined {
  return outcomes?.find(outcome => outcome.ruleId === ruleId)
}

/**
 * Render the governance panel page.
 * @param props - the locale seat plus the store hook and the data actions.
 * @returns the four-tab governance panel.
 */
export function GovernanceView({
  useGovernance, refresh, refreshLineage, refreshRules, refreshEvents, runEvaluation, testWebhook, setSearch, t,
}: GovernanceViewProps): JSX.Element {
  const state = useGovernance(snapshot => snapshot)
  const [tab, setTab] = useState<TabId>('catalog')
  const [levelFilter, setLevelFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all')

  const needle = state.searchQuery.trim().toLowerCase()
  const assets = state.assets?.status === 'ready' ? state.assets.value : []
  const filtered = needle === '' ? assets : assets.filter(asset => asset.qualifiedName.toLowerCase().includes(needle))
  const edges = state.edges?.status === 'ready' ? state.edges.value : []
  const rules = state.rules?.status === 'ready' ? state.rules.value : []
  const events = (state.events?.status === 'ready' ? state.events.value : [])
    .filter(event => levelFilter === 'all' || event.level === levelFilter)

  const tabs: readonly { id: TabId; label: string }[] = [
    { id: 'catalog', label: t('tab.catalog') },
    { id: 'lineage', label: t('tab.lineage') },
    { id: 'quality', label: t('tab.quality') },
    { id: 'alerts', label: t('tab.alerts') },
  ]

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h2 className={css.title}>{t('panel.title')}</h2>
        <div className={css.columns} role="tablist">
          {tabs.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={clsx(css.tabButton, tab === item.id && css.tabActive)}
              onClick={() => {
                setTab(item.id)
                if (item.id === 'catalog' && state.assets === undefined) refresh()
                if (item.id === 'lineage' && state.edges === undefined) refreshLineage()
                if (item.id === 'quality' && state.rules === undefined) refreshRules()
                if (item.id === 'alerts' && state.events === undefined) refreshEvents()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'catalog' && (
        <section className={css.card}>
          <input
            className={css.sqlInput}
            type="search"
            placeholder={t('catalog.search')}
            value={state.searchQuery}
            onChange={(event) => { setSearch(event.target.value) }}
          />
          {state.assets?.status === 'loading' && <p className={css.hint}>…</p>}
          {state.assets?.status === 'error' && <p className={css.error}>{state.assets.message}</p>}
          {state.assets?.status === 'ready' && (filtered.length === 0
            ? <p className={css.hint}>{t('catalog.empty')}</p>
            : (
              <table className={css.resultTable}>
                <thead>
                  <tr><th>{t('catalog.source')}</th><th>{t('catalog.asset')}</th><th>{t('catalog.count')}</th></tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map(asset => <AssetRowView key={asset.qualifiedName} asset={asset} />)}
                </tbody>
              </table>
            )
          )}
        </section>
      )}

      {tab === 'lineage' && (
        <section className={css.card}>
          {state.edges?.status === 'loading' && <p className={css.hint}>…</p>}
          {state.edges?.status === 'error' && <p className={css.error}>{state.edges.message}</p>}
          {state.edges?.status === 'ready' && (edges.length === 0
            ? <p className={css.hint}>{t('lineage.empty')}</p>
            : (
              <table className={css.resultTable}>
                <thead>
                  <tr><th>{t('lineage.source')}</th><th>→</th><th>{t('lineage.target')}</th><th>{t('lineage.transform')}</th></tr>
                </thead>
                <tbody>
                  {edges.map(edge => <EdgeRowView key={`${edge.source}|${edge.target}|${edge.transform}`} edge={edge} />)}
                </tbody>
              </table>
            )
          )}
        </section>
      )}

      {tab === 'quality' && (
        <section className={css.card}>
          <button type="button" className={css.runButton} disabled={state.evaluating} onClick={runEvaluation}>
            {state.evaluating ? t('quality.running') : t('quality.run')}
          </button>
          {state.evaluatingError !== undefined && <p className={css.error}>{state.evaluatingError}</p>}
          {state.rules?.status === 'loading' && <p className={css.hint}>…</p>}
          {state.rules?.status === 'error' && <p className={css.error}>{state.rules.message}</p>}
          {state.rules?.status === 'ready' && (rules.length === 0
            ? <p className={css.hint}>{t('quality.empty')}</p>
            : (
              <table className={css.resultTable}>
                <thead>
                  <tr><th>{t('quality.rule')}</th><th>{t('quality.kind')}</th><th>{t('quality.table')}</th><th>{t('quality.threshold')}</th><th>{t('quality.measured')}</th><th>{t('quality.status')}</th></tr>
                </thead>
                <tbody>
                  {rules.map(rule => <RuleRowView key={rule.id} rule={rule} outcome={outcomeFor(state.evaluation, rule.id)} passLabel={t('quality.pass')} failLabel={t('quality.fail')} />)}
                </tbody>
              </table>
            )
          )}
        </section>
      )}

      {tab === 'alerts' && (
        <section className={css.card}>
          <button type="button" className={css.runButton} onClick={testWebhook}>{t('alerts.webhookTest')}</button>
          <select
            className={css.sqlInput}
            value={levelFilter}
            onChange={(event) => { setLevelFilter(event.target.value as typeof levelFilter) }}
          >
            <option value="all">全部级别</option>
            <option value="critical">critical</option>
            <option value="warning">warning</option>
            <option value="info">info</option>
          </select>
          {state.events?.status === 'loading' && <p className={css.hint}>…</p>}
          {state.events?.status === 'error' && <p className={css.error}>{state.events.message}</p>}
          {state.events?.status === 'ready' && (events.length === 0
            ? <p className={css.hint}>{t('alerts.empty')}</p>
            : (
              <table className={css.resultTable}>
                <thead>
                  <tr><th>{t('alerts.at')}</th><th>{t('alerts.level')}</th><th>{t('alerts.title')}</th></tr>
                </thead>
                <tbody>
                  {events.map(event => <EventRowView key={event.id} event={event} />)}
                </tbody>
              </table>
            )
          )}
        </section>
      )}
    </div>
  )
}

/** One inventory asset row. */
function AssetRowView({ asset }: { asset: GovernanceAssetRow }): JSX.Element {
  return (
    <tr>
      <td><span className={css.tag}>{asset.source}</span></td>
      <td>{asset.qualifiedName}{asset.detail === undefined ? '' : <span className={css.hint}> · {asset.detail}</span>}</td>
      <td>{asset.count === undefined ? '—' : String(asset.count)}</td>
    </tr>
  )
}

/** One lineage edge row. */
function EdgeRowView({ edge }: { edge: GovernanceEdgeRow }): JSX.Element {
  return (
    <tr>
      <td>{edge.source}</td>
      <td aria-hidden>→</td>
      <td>{edge.target}</td>
      <td><span className={css.hint}>{edge.transform}</span></td>
    </tr>
  )
}

/** One quality rule row with its latest outcome. */
function RuleRowView({ rule, outcome, passLabel, failLabel }: {
  rule: GovernanceRuleRow
  outcome: GovernanceOutcomeRow | undefined
  passLabel: string
  failLabel: string
}): JSX.Element {
  return (
    <tr>
      <td>{rule.name}</td>
      <td><span className={css.tag}>{rule.kind}</span></td>
      <td>{rule.table}{rule.column === undefined ? '' : ` · ${rule.column}`}</td>
      <td>{rule.threshold === undefined ? '—' : String(rule.threshold)}</td>
      <td>{outcome === undefined ? '—' : outcome.measured === null ? 'NULL' : String(outcome.measured)}</td>
      <td>{outcome === undefined ? '—' : outcome.status === 'pass'
        ? <span className={css.passTag}>{passLabel}</span>
        : <span className={css.failTag}>{failLabel}</span>}
      </td>
    </tr>
  )
}

/** One alert event row. */
function EventRowView({ event }: { event: GovernanceEventRow }): JSX.Element {
  return (
    <tr>
      <td><span className={css.hint}>{event.at}</span></td>
      <td><span className={event.level === 'critical' ? css.failTag : event.level === 'warning' ? css.warnTag : css.tag}>{event.level}</span></td>
      <td>{event.title}{event.detail === undefined ? '' : <span className={css.hint}> · {event.detail}</span>}</td>
    </tr>
  )
}
