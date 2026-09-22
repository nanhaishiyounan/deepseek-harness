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

import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button, EmptyState, ErrorStrip, IconBranchOutline16, PageHero, PageSkeleton,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the view seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { KgClientState } from './kgStore.ts'
import type {
  KgNodeHitRow, KgOntologyEditResultRow, KgOntologyOpRow, KgReviewEntryRow, KgRollbackResultRow,
} from './kgTypes.ts'
import { communityColorOf, nodeColorOf, parseKgPhrase, semanticColorOf, semanticRootOf } from './presentation.ts'
import { KgGraphCanvas } from './KgGraphCanvas.tsx'
import { OntoTree } from './OntoTree.tsx'
import { ChangeFeed } from './ChangeFeed.tsx'
import css from './kg.module.css'

/** Registration-side business face for the kg view. */
export interface KgViewInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useKg. */
    kg: SnapshotStore<KgClientState>
  }
  /** Load or reload the legend + counters. */
  refresh: () => void
  /** Load the default canvas view once per client session (stats-gated walk). */
  ensureDefaultView: () => void
  /** Run one subgraph walk from name seeds. */
  walk: (seeds: readonly string[], hops: number) => void
  /** Expand one minted node id (load-on-demand). */
  expandNode: (nodeId: string) => void
  /** Resolve an entity name to seed hits. */
  searchSeeds: (query: string) => void
  /** Load or reload the quality panel (stats extension + mappings). */
  loadPanel: () => void
  /** Compile one phrase server-side and land the walked canvas; resolves with the restatement. */
  queryPhrase: (phrase: string) => Promise<string>
  /** Select one node (details panel) or clear the selection. */
  selectNode: (nodeId: string | undefined) => void
  /** Toggle one type in the canvas type filter. */
  toggleTypeFilter: (typeId: string) => void
  /** Clear the canvas type filter. */
  clearTypeFilter: () => void
  /** Load or reload the episode ledger + the review queue (the change feed). */
  loadFeed: () => void
  /** Load the precomputed louvain communities (community coloring's input). */
  loadCommunities: () => void
  /** Roll back one episode (`kg.rollback`); resolves with the receipt. */
  rollbackEpisode: (episodeUuid: string) => Promise<KgRollbackResultRow>
  /** Record one gray-zone review verdict (`kg.reviewDecide`); rejects with the refusal message. */
  decideReview: (entry: KgReviewEntryRow, decision: 'merge' | 'reject' | 'skip') => Promise<void>
  /** Apply one KGCL ontology op set (`kg.ontologyEdit`); resolves with the receipt. */
  applyOntoEdit: (ops: readonly KgOntologyOpRow[]) => Promise<KgOntologyEditResultRow>
  /** Replay the canvas at one instant (`kg.history`); the graph mode renders the snapshot. */
  replayAt: (asOf: string) => void
  /** Leave replay; the live canvas renders again. */
  leaveReplay: () => void
  /** Switch the canvas coloring mode (type hash / ontology semantic / louvain community). */
  setColorMode: (mode: 'type' | 'semantic' | 'community') => void
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
  phraseError: string | undefined
  query: string
}

/**
 * Render the kg view tab.
 * @param props - the standard view kit plus the page's inject face.
 * @returns the graph column.
 */
export function KgView(
  {
    inputActions, useKg, refresh, ensureDefaultView, walk, expandNode, searchSeeds, selectNode,
    loadPanel, queryPhrase, toggleTypeFilter, clearTypeFilter,
    loadFeed, loadCommunities, rollbackEpisode, decideReview, applyOntoEdit, replayAt, leaveReplay,
    setColorMode,
    requestView, t,
  }: KgViewProps,
): JSX.Element {
  const state = useKg(snapshot => snapshot)
  const [input, setInput] = useState<KgLocalInput>({ phrase: '', restatement: undefined, phraseError: undefined, query: '' })
  const [mode, setMode] = useState<'graph' | 'onto' | 'feed'>('graph')
  // The last ready legend: an ontology-edit refresh flips the legend cache
  // to loading, but the tree keeps rendering the known registry instead of
  // blinking away under the editor's receipt.
  const legendRef = useRef<KgClientState['legend']>(undefined)
  if (state.legend?.status === 'ready') legendRef.current = state.legend
  const ontoLegend = state.legend?.status === 'ready'
    ? state.legend
    : legendRef.current?.status === 'ready' ? legendRef.current : undefined

  useEffect(() => {
    if (state.legend === undefined) refresh()
  }, [state.legend, refresh])

  useEffect(() => {
    if (state.panel === undefined) loadPanel()
  }, [state.panel, loadPanel])

  // Opening the tab is itself the default-view trigger: an untouched canvas
  // asks for one automatic walk, a walked or failed one stays as it is.
  useEffect(() => {
    if (state.canvas === undefined) ensureDefaultView()
  }, [state.canvas, ensureDefaultView])

  // Opening the change feed is its data trigger: an untouched feed loads once.
  useEffect(() => {
    if (mode === 'feed' && state.episodes === undefined) loadFeed()
  }, [mode, state.episodes, loadFeed])

  // Community coloring reads the precomputed louvain partition: load it once
  // per client session when the mode first selects it.
  useEffect(() => {
    if (state.colorMode === 'community' && state.communities === undefined) loadCommunities()
  }, [state.colorMode, state.communities, loadCommunities])

  // The registry lookup the semantic colorer walks (`extends` chains).
  const typesById = useMemo(
    () => state.legend?.status === 'ready'
      ? new Map(state.legend.value.types.map(type => [type.id, type]))
      : undefined,
    [state.legend],
  )
  const communityOfNode = useMemo(() => {
    const readout = state.communities
    if (readout?.status !== 'ready') return undefined
    const assignment = new Map<string, number>()
    for (const community of readout.value.communities) {
      for (const node of community.nodes) assignment.set(node, community.id)
    }
    return assignment
  }, [state.communities])
  const colorOf = useMemo(
    () => (typeId: string): string => {
      if (state.colorMode === 'semantic' && typesById !== undefined) {
        return semanticColorOf(semanticRootOf(typeId, id => typesById.get(id)?.extends))
      }
      return nodeColorOf(typeId)
    },
    [state.colorMode, typesById],
  )
  const nodeColor = useMemo(
    () => (node: { readonly id: string; readonly type: string }): string => {
      if (state.colorMode === 'community' && communityOfNode !== undefined) {
        return communityColorOf(communityOfNode.get(node.id) ?? 0)
      }
      return colorOf(node.type)
    },
    [state.colorMode, communityOfNode, colorOf],
  )

  const legend = state.legend
  const canvas = state.canvas
  const search = state.search

  /**
   * Phrase-box submit: the server compiles the template first (`kg.query` —
   * the richer set). When the call fails, a built-in three-template match is
   * the offline fallback (an older gateway); a phrase no template knows
   * surfaces the unsupported-shape hint instead of walking a nonsense seed.
   */
  const submitPhrase = (): void => {
    const text = input.phrase.trim()
    if (text.length === 0) return
    const builtin = /^(.+?)的供货(链|路径)?$/u.test(text)
      || /^(.+?)的订单$/u.test(text)
      || /^(?:含|包含)(.+?)的(?:商品|产品)$/u.test(text)
      || /^(.+?)的原料来自哪些供应商$/u.test(text)
      || /^(.+?)(?:批次)?流向(?:了)?(?:哪些|什么)?客户$/u.test(text)
      || /^(.+?)的供应商$/u.test(text)
      || /^(.+?)的客户$/u.test(text)
      || /^(.+?)由(?:哪些|什么)?原料(?:制成|做成|生产)?$/u.test(text)
    queryPhrase(text).then((restated) => {
      setInput({ ...input, restatement: restated, phraseError: undefined })
    }).catch(() => {
      if (builtin) {
        const plan = parseKgPhrase(text, (kind, entity) => t(`phrase.restate.${kind}`, { entity }))
        /* v8 ignore next -- a builtin template match always carries non-blank keywords, so parseKgPhrase never returns undefined for it. */
        if (plan !== undefined) {
          setInput({ ...input, restatement: plan.restated, phraseError: undefined })
          walk(plan.seeds, plan.hops)
          return
        }
      }
      setInput({ ...input, restatement: undefined, phraseError: t('phrase.unsupported') })
    })
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
    /* v8 ignore start -- the details card calls degreeOf only for a resolved
       selectedNode, which the same render derived from a ready canvas. */
    canvas?.status === 'ready'
      ? canvas.value.edges.filter(edge => edge.source === nodeId || edge.target === nodeId).length
      : 0
  /* v8 ignore stop */
  const typeLabel = (typeId: string): string =>
    legend?.status === 'ready'
      ? (legend.value.types.find(type => type.id === typeId)?.label ?? typeId)
      : typeId

  /** The frozen snapshot during replay; `undefined` renders the live canvas. */
  const replay = state.history?.status === 'ready' ? state.history.value : undefined

  const unbuilt = canvas?.status === 'ready' && canvas.value.nodes.length === 0

  return (
    // data-conversation-composer-overlay opts the view into the skeleton's
    // self-managed-scroll channel (the trajectory precedent): the viewArea
    // gets a bounded box and this .page becomes the page's one scroller, so
    // the canvas flex chain resolves against real viewport height and the
    // wheel never fights the session-level scrollBody.
    <div
      className={css.page}
      data-conversation-composer-overlay=""
      data-testid="kg-page"
    >
      {legend !== undefined && legend.status === 'error' && (
        <ErrorStrip
          message={<>{t('error.unavailable')} — {legend.error}</>}
          action={<Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>}
        />
      )}

      <PageHero eyebrow={t('view.kg')} title={t('page.title')} tagline={t('page.tagline')} />

      <div className={css.modeSwitch} role="tablist" aria-label={t('page.title')} data-testid="kg-mode-switch">
        <button type="button" role="tab" aria-selected={mode === 'graph'} data-active={mode === 'graph'}
          onClick={() => { setMode('graph') }}>{t('mode.graph')}</button>
        <button type="button" role="tab" aria-selected={mode === 'onto'} data-active={mode === 'onto'}
          onClick={() => { setMode('onto') }}>{t('mode.onto')}</button>
        <button type="button" role="tab" aria-selected={mode === 'feed'} data-active={mode === 'feed'}
          onClick={() => { setMode('feed') }}>{t('mode.feed')}</button>
      </div>

      {mode === 'graph' && (
        <div className={css.colorSwitch} data-testid="kg-color-mode">
          {(['type', 'semantic', 'community'] as const).map(candidate => (
            <button
              type="button"
              key={candidate}
              data-active={state.colorMode === candidate}
              onClick={() => { setColorMode(candidate) }}
            >
              {t(`color.${candidate}`)}
            </button>
          ))}
        </div>
      )}

      {mode === 'graph' && state.history?.status === 'ready' && (
        <div className={css.replayBanner} data-testid="kg-replay-banner">
          <span>{t('replay.banner', { time: state.history.value.asOf.slice(0, 19).replace('T', ' ') })}</span>
          <Button variant="ghost" size="sm" onClick={leaveReplay}>{t('replay.back')}</Button>
        </div>
      )}

      {mode !== 'graph'
        ? mode === 'onto'
          ? (ontoLegend !== undefined
            ? (
              <OntoTree
                types={ontoLegend.value.types}
                relations={ontoLegend.value.relations}
                revisions={ontoLegend.value.revisions}
                onEdit={ops => applyOntoEdit(ops).then((result) => {
                  // The legend (and its revision tail) reload with the
                  // receipt: the tree and the semantic colors re-derive
                  // from the new registry in the same paint.
                  refresh()
                  return result
                })}
                t={t}
              />
            )
            : <p className={css.legendLoading}>{t('legend.loading')}</p>)
          : (
            <ChangeFeed
              episodes={state.episodes?.status === 'ready' ? state.episodes.value : []}
              review={state.review?.status === 'ready' ? state.review.value.entries : []}
              loading={state.episodes?.status === 'loading'}
              error={state.episodes?.status === 'error' ? state.episodes.error : undefined}
              onReload={loadFeed}
              onRollback={rollbackEpisode}
              onDecide={decideReview}
              onReplay={(asOf) => {
                replayAt(asOf)
                setMode('graph')
              }}
              t={t}
            />
          )
        : (
          <>
            <section className={css.toolbar}>
              <div className={css.phraseBox}>
                <input
                  className={css.phraseInput}
                  value={input.phrase}
                  placeholder={t('phrase.placeholder')}
                  aria-label={t('phrase.action')}
                  onChange={(event) => {
                    setInput({ ...input, phrase: event.target.value, restatement: undefined, phraseError: undefined })
                  }}
                  onKeyDown={(event) => { if (event.key === 'Enter') submitPhrase() }}
                />
                <Button variant="ghost" size="sm" onClick={submitPhrase}>{t('phrase.action')}</Button>
                {input.restatement !== undefined && <span className={css.phraseRestate}>{input.restatement}</span>}
                {input.phraseError !== undefined && (
                  <span className={css.phraseError} data-testid="kg-phrase-error">
                    {input.phraseError}（{t('phrase.examples')}）
                  </span>
                )}
                <span className={css.traceHint}>{t('phrase.traceExamples')}</span>
              </div>
              <span
                className={css.freshness}
                data-testid="kg-freshness"
                title={t('kg.freshnessUnknown')}
              >
                {state.panel?.status === 'ready' && state.panel.value.quality.last_run_at !== undefined
                  ? t('kg.freshness', { time: state.panel.value.quality.last_run_at.slice(0, 19).replace('T', ' ') })
                  : t('kg.freshnessUnknown')}
              </span>
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
                          <span className={css.searchHitDot} style={{ background: colorOf(hit.type) }} aria-hidden="true" />
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

            <div className={css.mainSplit} data-testid="kg-main-split">
              <section className={css.canvasZone}>
                <h3 className={css.zoneTitle}>{t('canvas.title')}</h3>
                {state.history?.status === 'error' ? (
                  <ErrorStrip
                    message={<>{t('error.unavailable')} — {state.history.error}</>}
                    action={<Button variant="ghost" size="sm" onClick={leaveReplay}>{t('replay.back')}</Button>}
                  />
                ) : replay !== undefined ? (
                  <>
                    {replay.truncated && <p className={css.truncatedNote}>{t('canvas.truncated')}</p>}
                    <KgGraphCanvas
                      nodes={replay.nodes}
                      edges={replay.edges}
                      typeFilter={state.typeFilter}
                      selected={state.selected}
                      nodeColor={nodeColor}
                      onSelect={selectNode}
                      onExpand={() => {}}
                      t={t}
                    />
                  </>
                ) : state.history?.status === 'loading' ? (
                  <PageSkeleton variant="block" />
                ) : canvas !== undefined && canvas.status === 'error' ? (
                  <ErrorStrip
                    message={<>{t('error.unavailable')} — {canvas.error}</>}
                    action={<Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>}
                  />
                ) : canvas?.status === 'ready' ? (
                  <>
                    {canvas.value.truncated && <p className={css.truncatedNote}>{t('canvas.truncated')}</p>}
                    {unbuilt ? (
                      <EmptyState
                        title={t('build.unbuiltTitle')}
                        hint={t('build.unbuiltHint')}
                        icon={<IconBranchOutline16 />}
                      />
                    ) : (
                      <KgGraphCanvas
                        nodes={canvas.value.nodes}
                        edges={canvas.value.edges}
                        typeFilter={state.typeFilter}
                        selected={state.selected}
                        nodeColor={nodeColor}
                        onSelect={selectNode}
                        onExpand={expandNode}
                        t={t}
                      />
                    )}
                  </>
                ) : canvas?.status === 'loading' ? (
                  <PageSkeleton variant="block" />
                ) : (
                  <EmptyState title={t('canvas.emptyTitle')} hint={t('canvas.emptyHint')} icon={<IconBranchOutline16 />} />
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
                            <span className={css.legendDot} style={{ background: colorOf(type.id) }} aria-hidden="true" />
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
                            <span className={css.legendDot} style={{ background: colorOf(type.id) }} aria-hidden="true" />
                            {type.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className={css.legendHint}>{t('legend.filterHint')}</p>
                </section>

                <section className={css.qualityZone} data-testid="kg-quality-panel">
                  <h3 className={css.zoneTitle}>{t('quality.title')}</h3>
                  {state.panel === undefined || state.panel.status === 'loading' ? (
                    <p className={css.legendLoading}>{t('legend.loading')}</p>
                  ) : state.panel.status === 'error' ? (
                    <p className={css.legendLoading}>{t('error.unavailable')}</p>
                  ) : (
                    <>
                      <dl className={css.qualityRows}>
                        <div className={css.qualityRow}>
                          <dt>{t('quality.nodes')}</dt>
                          <dd data-testid="kg-quality-nodes">{String(state.panel.value.stats.entities)}</dd>
                        </div>
                        <div className={css.qualityRow}>
                          <dt>{t('quality.edges')}</dt>
                          <dd>{String(state.panel.value.stats.triples)}</dd>
                        </div>
                        <div className={css.qualityRow}>
                          <dt>{t('quality.islands')}</dt>
                          <dd data-testid="kg-quality-islands">{String(state.panel.value.quality.islands)}</dd>
                        </div>
                        <div className={css.qualityRow}>
                          <dt>{t('quality.conflicts')}</dt>
                          <dd>{String(state.panel.value.quality.conflicts)}</dd>
                        </div>
                        {state.panel.value.quality.coverage !== undefined && (
                          <div className={css.qualityRow}>
                            <dt>{t('quality.coverage')}</dt>
                            <dd>
                              {`${String(state.panel.value.quality.coverage.numerator)}/${String(state.panel.value.quality.coverage.denominator)}（${String(Math.round(state.panel.value.quality.coverage.ratio * 100))}%）`}
                            </dd>
                          </div>
                        )}
                        {state.panel.value.quality.last_run_at !== undefined && (
                          <div className={css.qualityRow}>
                            <dt>{t('quality.lastRun')}</dt>
                            <dd>{state.panel.value.quality.last_run_at.slice(0, 19).replace('T', ' ')}</dd>
                          </div>
                        )}
                      </dl>
                      {state.panel.value.mappings !== undefined && (
                        <>
                          <h4 className={css.qualitySubTitle}>{t('quality.mappingsTitle')}</h4>
                          <ul className={css.mappingList} data-testid="kg-mapping-list">
                            {state.panel.value.mappings.collections.map((collection) => {
                              /* v8 ignore start -- the mapping rows render only inside the
                                 panel-ready branch above; this recheck narrows the closure's
                                 panel type. */
                              const run = state.panel?.status === 'ready'
                                ? state.panel.value.mappings?.lastRun?.collections.find(entry => entry.scope === collection.name)
                                : undefined
                              /* v8 ignore stop */
                              return (
                                <li key={collection.name} className={css.mappingRow}>
                                  <span className={css.mappingName}>{collection.name}</span>
                                  <span className={css.mappingMeta}>
                                    {run === undefined
                                      ? t('quality.mappingPending')
                                      : `${t('quality.mappingNodes')} ${String(run.nodesUpserted)} · ${t('quality.mappingEdges')} ${String(run.edgesUpserted)}`}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </>
                      )}
                    </>
                  )}
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
          </>
        )}
    </div>
  )
}
