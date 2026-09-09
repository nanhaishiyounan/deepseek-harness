/**
 * The kg view tab: the phrase box (natural-language wrappers over subgraph
 * walks), the entity seed search, the sigma canvas with its type legend, and
 * the node details panel — read-only by design (graph writes belong to the
 * build pipeline, never to "search"). Four states render inline: the unbuilt
 * guide (legend ready but zero entities), loading skeletons, the structured
 * refusal (human text + retry), and the canvas degradation inside the canvas
 * component itself.
 * @module @deepseek-ai/dsh-client-ui-kg/client/KgView
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the view seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { KgClientState } from './kgStore.ts'
import type { KgNodeHitRow } from './kgTypes.ts'
import { nodeColorOf, parseKgPhrase } from './presentation.ts'
import { KgGraphCanvas } from './KgGraphCanvas.tsx'
import css from './kg.module.css'

/** Registration-side business face for the kg view. */
export interface KgViewInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useKg. */
    kg: SnapshotStore<KgClientState>
  }
  /** Load or reload the legend + counters. */
  refresh: () => void
  /** Run one subgraph walk from name seeds. */
  walk: (seeds: readonly string[], hops: number) => void
  /** Expand one minted node id (load-on-demand). */
  expandNode: (nodeId: string) => void
  /** Resolve an entity name to seed hits. */
  searchSeeds: (query: string) => void
  /** Select one node (details panel) or clear the selection. */
  selectNode: (nodeId: string | undefined) => void
  /** Toggle one type in the canvas type filter. */
  toggleTypeFilter: (typeId: string) => void
  /** Clear the canvas type filter. */
  clearTypeFilter: () => void
  /** Best-effort view switch through the header bridge. */
  requestView: (view: string) => void
}

/** Full component props: the view-seat runtime share plus the inject face and locale seat. */
export type KgViewProps =
  PropsRuntime<'conversation.view'>
  & PropsLocale<'kg'>
  & InjectFace<KgViewInjected>

/** The interaction row's local state (uncontrolled inputs; no session state). */
interface KgLocalInput {
  phrase: string
  restatement: string | undefined
  query: string
}

/**
 * Render the kg view tab.
 * @param props - the standard view kit plus the page's inject face.
 * @returns the graph column.
 */
export function KgView(
  {
    inputActions, useKg, refresh, walk, expandNode, searchSeeds, selectNode,
    toggleTypeFilter, clearTypeFilter, requestView, t,
  }: KgViewProps,
): JSX.Element {
  const state = useKg(snapshot => snapshot)
  const [input, setInput] = useState<KgLocalInput>({ phrase: '', restatement: undefined, query: '' })

  useEffect(() => {
    if (state.legend === undefined) refresh()
  }, [state.legend, refresh])

  const legend = state.legend
  const canvas = state.canvas
  const search = state.search

  /** Phrase-box submit: parse the template (or fall back to a raw seed) and walk. */
  const submitPhrase = (): void => {
    const plan = parseKgPhrase(input.phrase, (kind, entity) => t(`phrase.restate.${kind}`, { entity }))
    if (plan === undefined) return
    setInput({ ...input, restatement: plan.restated })
    walk(plan.seeds, plan.hops)
  }

  /** One seed hit from the search box starts its own walk. */
  const walkFromHit = (hit: KgNodeHitRow): void => {
    setInput({ ...input, query: hit.name })
    walk([hit.name], 1)
  }

  /** Hand the entity question to the conversation. */
  const askAbout = (name: string): void => {
    inputActions.setDraft(t('details.ask') === '问此实体' ? `在图谱里，${name} 有哪些关联？` : `What is related to ${name} in the graph?`)
    requestView('chat')
  }

  const selectedNode = canvas?.status === 'ready'
    ? canvas.value.nodes.find(node => node.id === state.selected)
    : undefined
  const degreeOf = (nodeId: string): number =>
    canvas?.status === 'ready'
      ? canvas.value.edges.filter(edge => edge.source === nodeId || edge.target === nodeId).length
      : 0
  const typeLabel = (typeId: string): string =>
    legend?.status === 'ready'
      ? (legend.value.types.find(type => type.id === typeId)?.label ?? typeId)
      : typeId

  const unbuilt = canvas?.status === 'ready' && canvas.value.nodes.length === 0

  return (
    <div className={css.page}>
      {legend !== undefined && legend.status === 'error' && (
        <div className={css.errorStrip} role="alert">
          <span>{t('error.unavailable')} — {legend.error}</span>
          <Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>
        </div>
      )}

      <section className={css.hero}>
        <h2 className={css.heroTitle}>{t('page.title')}</h2>
        <p className={css.heroTagline}>{t('page.tagline')}</p>
      </section>

      <section className={css.toolbar}>
        <div className={css.phraseBox}>
          <input
            className={css.phraseInput}
            value={input.phrase}
            placeholder={t('phrase.placeholder')}
            aria-label={t('phrase.action')}
            onChange={(event) => { setInput({ ...input, phrase: event.target.value, restatement: undefined }) }}
            onKeyDown={(event) => { if (event.key === 'Enter') submitPhrase() }}
          />
          <Button variant="ghost" size="sm" onClick={submitPhrase}>{t('phrase.action')}</Button>
          {input.restatement !== undefined && <span className={css.phraseRestate}>{input.restatement}</span>}
        </div>
        <div className={css.searchBox}>
          <input
            className={css.searchInput}
            value={input.query}
            placeholder={t('search.placeholder')}
            aria-label={t('search.action')}
            onChange={(event) => {
              setInput({ ...input, query: event.target.value })
              if (event.target.value.trim().length > 0) searchSeeds(event.target.value.trim())
            }}
          />
          {search?.status === 'ready' && search.value.length > 0 && (
            <ul className={css.searchHits}>
              {search.value.slice(0, 6).map(hit => (
                <li key={hit.id}>
                  <button type="button" className={css.searchHit} onClick={() => { walkFromHit(hit) }}>
                    <span className={css.searchHitDot} style={{ background: nodeColorOf(hit.type) }} aria-hidden="true" />
                    {hit.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {search?.status === 'ready' && search.value.length === 0 && input.query.trim().length > 0 && (
            <p className={css.searchNoHits}>{t('search.noHits')}</p>
          )}
        </div>
      </section>

      <div className={css.mainSplit}>
        <section className={css.canvasZone}>
          <h3 className={css.zoneTitle}>{t('canvas.title')}</h3>
          {canvas !== undefined && canvas.status === 'error' ? (
            <div className={css.errorStrip} role="alert">
              <span>{t('error.unavailable')} — {canvas.error}</span>
              <Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>
            </div>
          ) : canvas?.status === 'ready' ? (
            <>
              {canvas.value.truncated && <p className={css.truncatedNote}>{t('canvas.truncated')}</p>}
              {unbuilt ? (
                <div className={css.emptyState}>
                  <p className={css.emptyTitle}>{t('build.unbuiltTitle')}</p>
                  <p className={css.emptyHint}>{t('build.unbuiltHint')}</p>
                </div>
              ) : (
                <KgGraphCanvas
                  nodes={canvas.value.nodes}
                  edges={canvas.value.edges}
                  typeFilter={state.typeFilter}
                  selected={state.selected}
                  onSelect={selectNode}
                  onExpand={expandNode}
                  t={t}
                />
              )}
            </>
          ) : canvas?.status === 'loading' ? (
            <div className={css.canvasSkeleton} aria-hidden="true" />
          ) : (
            <div className={css.emptyState}>
              <p className={css.emptyTitle}>{t('canvas.emptyTitle')}</p>
              <p className={css.emptyHint}>{t('canvas.emptyHint')}</p>
            </div>
          )}
        </section>

        <aside className={css.sideZone}>
          <section className={css.legendZone}>
            <h3 className={css.zoneTitle}>{t('legend.title')}</h3>
            {legend === undefined || legend.status === 'loading' ? (
              <p className={css.legendLoading}>{t('legend.loading')}</p>
            ) : legend.status === 'error' ? (
              <p className={css.legendLoading}>{t('error.unavailable')}</p>
            ) : (
              <ul className={css.legendList}>
                <li>
                  <button
                    type="button"
                    className={css.legendRow}
                    data-active={state.typeFilter === undefined}
                    onClick={clearTypeFilter}
                  >
                    {t('legend.all')}
                  </button>
                </li>
                {legend.value.types.some(type => type.source === 'nocobase-derived') && (
                  <li className={css.legendGroupLabel} aria-hidden="true">{t('legend.groupOntology')}</li>
                )}
                {legend.value.types.filter(type => type.source !== 'nocobase-derived').map(type => (
                  <li key={type.id}>
                    <button
                      type="button"
                      className={css.legendRow}
                      data-active={state.typeFilter?.has(type.id) === true}
                      onClick={() => { toggleTypeFilter(type.id) }}
                    >
                      <span className={css.legendDot} style={{ background: nodeColorOf(type.id) }} aria-hidden="true" />
                      {type.label}
                    </button>
                  </li>
                ))}
                {legend.value.types.some(type => type.source === 'nocobase-derived') && (
                  <li className={css.legendGroupLabel} aria-hidden="true">{t('legend.groupBusiness')}</li>
                )}
                {legend.value.types.filter(type => type.source === 'nocobase-derived').map(type => (
                  <li key={type.id}>
                    <button
                      type="button"
                      className={css.legendRow}
                      data-active={state.typeFilter?.has(type.id) === true}
                      onClick={() => { toggleTypeFilter(type.id) }}
                    >
                      <span className={css.legendDot} style={{ background: nodeColorOf(type.id) }} aria-hidden="true" />
                      {type.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className={css.legendHint}>{t('legend.filterHint')}</p>
          </section>

          <section className={css.detailsZone}>
            <h3 className={css.zoneTitle}>{t('details.title')}</h3>
            {selectedNode === undefined ? (
              <p className={css.detailsHint}>{t('details.selectHint')}</p>
            ) : (
              <div className={css.detailsCard}>
                <p className={css.detailsName}>{selectedNode.name}</p>
                <dl className={css.detailsRows}>
                  <div className={css.detailsRow}><dt>{t('details.type')}</dt><dd>{typeLabel(selectedNode.type)}</dd></div>
                  <div className={css.detailsRow}><dt>{t('details.degree')}</dt><dd>{String(degreeOf(selectedNode.id))}</dd></div>
                  {selectedNode.natural_key !== undefined && (
                    <div className={css.detailsRow}><dt>{t('details.naturalKey')}</dt><dd>{selectedNode.natural_key}</dd></div>
                  )}
                </dl>
                <div className={css.detailsActions}>
                  <Button variant="ghost" size="sm" onClick={() => { askAbout(selectedNode.name) }}>{t('details.ask')}</Button>
                  <Button variant="ghost" size="sm" onClick={() => { expandNode(selectedNode.id) }}>{t('details.expand')}</Button>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
