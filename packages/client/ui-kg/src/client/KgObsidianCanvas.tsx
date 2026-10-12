/**
 * The Obsidian-style force-graph canvas over the Neo4j graph store: the
 * global view (capped nodes, degree-sized dots, type coloring, island stats
 * footer), search-to-locate, click-to-Local-Graph (k-hop neighborhood with
 * breadcrumb and hops selector), hover cards (type + property summary +
 * relation counts), and the relations/backlink panel for the selected node
 * (out and in lists, click-through navigation). react-force-graph-2d is
 * statically imported — a dsh.client bundle is a single client.js artifact
 * (the browser module table serves no relative-path chunks).
 * @module @deepseek-ai/dsh-client-ui-kg/client/KgObsidianCanvas
 */

import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { ErrorStrip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import ForceGraph2DModule from 'react-force-graph-2d'
/** The statically imported renderer, typed to the props this canvas passes. */
const ForceGraph2D = ForceGraph2DModule as unknown as (props: Record<string, unknown>) => JSX.Element
import { nodeColorOf } from './presentation.ts'
import css from './kg.module.css'

/** One node row the wire carries. */
export interface KgObsidianNode {
  readonly id: string
  readonly type: string
  readonly name: string
  readonly props: Readonly<Record<string, string | number | boolean>>
  readonly degree: number
}

/** One edge row the wire carries. */
export interface KgObsidianEdge {
  readonly id: string
  readonly relation: string
  readonly source: string
  readonly target: string
}

/** One relation row in the detail panel. */
export interface KgObsidianRelation {
  readonly relation: string
  readonly direction: 'out' | 'in'
  readonly other_id: string
  readonly other_name: string
  readonly other_type: string
}

/** The graphPage call face the entry binds (the connection's api.kg). */
export interface KgObsidianCalls {
  global(limit?: number): Promise<{
    nodes: readonly KgObsidianNode[]
    edges: readonly KgObsidianEdge[]
    truncated: boolean
    stats: { nodes: number; edges: number; islands: number; largest_component: number }
  }>
  local(nodeId: string, hops: number): Promise<{
    nodes: readonly KgObsidianNode[]
    edges: readonly KgObsidianEdge[]
    truncated: boolean
  }>
  search(query: string, k?: number): Promise<readonly { id: string; type: string; name: string; degree: number }[]>
  node(
    nodeId: string,
  ): Promise<KgObsidianNode & { out_relations: readonly KgObsidianRelation[]; in_relations: readonly KgObsidianRelation[] } | undefined>
}

/** Full component props. */
export type KgObsidianCanvasProps = PropsLocale<'kg'> & {
  readonly calls: KgObsidianCalls
}

/** The theme-sensitive canvas palette (the boot-theme body attribute). */
function palette(): { edge: string; label: string; halo: string } {
  const dark = document.body.hasAttribute('data-ds-dark-theme')
  return dark
    ? { edge: 'rgba(148, 163, 184, 0.35)', label: '#cbd5e1', halo: 'rgba(226, 232, 240, 0.9)' }
    : { edge: 'rgba(100, 116, 139, 0.35)', label: '#334155', halo: 'rgba(15, 23, 42, 0.85)' }
}

/**
 * Render the Obsidian canvas.
 * @param props - the locale seat and the bound graphPage calls.
 * @returns the canvas column (search box, graph pane, hover card, relations panel, stats footer).
 */
export function KgObsidianCanvas({ calls, t }: KgObsidianCanvasProps): JSX.Element {
  const [view, setView] = useState<{ mode: 'global'; data: { nodes: readonly KgObsidianNode[]; edges: readonly KgObsidianEdge[] }; truncated: boolean; stats?: { nodes: number; edges: number; islands: number; largest_component: number } } | { mode: 'local'; seed: KgObsidianNode; hops: number; data: { nodes: readonly KgObsidianNode[]; edges: readonly KgObsidianEdge[] }; truncated: boolean } | { mode: 'loading' } | { mode: 'error'; message: string }>({ mode: 'loading' })
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<readonly { id: string; type: string; name: string; degree: number }[] | undefined>(undefined)
  const [hover, setHover] = useState<{ node: KgObsidianNode; x: number; y: number } | undefined>(undefined)
  type NodeDetailState = KgObsidianNode & {
    out_relations: readonly KgObsidianRelation[]
    in_relations: readonly KgObsidianRelation[]
  }
  const [detail, setDetail] = useState<NodeDetailState | undefined>(undefined)
  const [size, setSize] = useState({ width: 960, height: 520 })
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void loadGlobal()
    const element = wrapperRef.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight })
    })
    observer.observe(element)
    setSize({ width: element.clientWidth, height: element.clientHeight })
    return () => { observer.disconnect() }
    // load once per mount; calls are stable entry bindings
  }, [])

  /** Load the global capped graph with stats. */
  async function loadGlobal(): Promise<void> {
    setView({ mode: 'loading' })
    try {
      const page = await calls.global(1200)
      setView({ mode: 'global', data: { nodes: page.nodes, edges: page.edges }, truncated: page.truncated, stats: page.stats })
    } catch (error) {
      setView({ mode: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Load one seed's k-hop neighborhood (the Local Graph). */
  async function loadLocal(seed: KgObsidianNode, hops: number): Promise<void> {
    setView({ mode: 'loading' })
    try {
      const page = await calls.local(seed.id, hops)
      setView({ mode: 'local', seed, hops, data: { nodes: page.nodes, edges: page.edges }, truncated: page.truncated })
    } catch (error) {
      setView({ mode: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Select one node: detail fetch + panel render (no canvas reload). */
  async function select(nodeId: string): Promise<void> {
    try {
      setDetail(await calls.node(nodeId))
    } catch {
      setDetail(undefined)
    }
  }

  /** The search box submit. */
  async function runSearch(): Promise<void> {
    const trimmed = query.trim()
    if (trimmed.length === 0) { setHits(undefined); return }
    try {
      setHits(await calls.search(trimmed, 10))
    } catch {
      setHits([])
    }
  }

  const graphData = useMemo(() => {
    if (view.mode !== 'global' && view.mode !== 'local') return { nodes: [], links: [] }
    return { nodes: [...view.data.nodes], links: [...view.data.edges] }
  }, [view])

  const neighborOf = useMemo(() => {
    const map = new Map<string, Set<string>>()
    if (view.mode !== 'global' && view.mode !== 'local') return map
    for (const edge of view.data.edges) {
      const a = map.get(edge.source) ?? new Set<string>()
      a.add(edge.target)
      map.set(edge.source, a)
      const b = map.get(edge.target) ?? new Set<string>()
      b.add(edge.source)
      map.set(edge.target, b)
    }
    return map
  }, [view])

  const hoveredNeighbors = hover === undefined ? undefined : neighborOf.get(hover.node.id)

  return (
    <section className={css.obsidianColumn} data-testid="kg-obsidian">
      <header className={css.obsidianToolbar}>
        <input
          className={css.obsidianSearch}
          type="search"
          placeholder={t('obsidian.searchPlaceholder')}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setHits(undefined) }}
          onKeyDown={(event) => { if (event.key === 'Enter') void runSearch() }}
          data-testid="kg-obsidian-search"
        />
        <button type="button" className={css.obsidianButton} onClick={() => { void runSearch() }}>{t('obsidian.search')}</button>
        {view.mode === 'local'
          ? <button type="button" className={css.obsidianButton} onClick={() => { void loadGlobal() }}>{t('obsidian.backToGlobal')}</button>
          : <button type="button" className={css.obsidianButton} onClick={() => { void loadGlobal() }}>{t('obsidian.refresh')}</button>}
        {view.mode === 'local'
          ? (
            <label className={css.obsidianHops}>
              {t('obsidian.hops')}
              <select
                value={view.hops}
                onChange={(event) => { void loadLocal(view.seed, Number(event.target.value)) }}
                data-testid="kg-obsidian-hops"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          )
          : null}
      </header>

      {hits !== undefined
        ? (
          <ul className={css.obsidianHits} data-testid="kg-obsidian-hits">
            {hits.length === 0 ? <li className={css.obsidianHitEmpty}>{t('obsidian.noHits')}</li> : null}
            {hits.map(hit => (
              <li key={hit.id}>
                <button
                  type="button"
                  className={css.obsidianHit}
                  onClick={() => {
                    setHits(undefined)
                    void loadLocal({ id: hit.id, type: hit.type, name: hit.name, props: {}, degree: hit.degree }, 1)
                    void select(hit.id)
                  }}
                >
                  <span className={css.obsidianHitType} data-type={hit.type}>{hit.type}</span>
                  <span className={css.obsidianHitName}>{hit.name}</span>
                  <span className={css.obsidianHitDegree}>{t('obsidian.degree', { count: hit.degree })}</span>
                </button>
              </li>
            ))}
          </ul>
        )
        : null}

      <div className={css.obsidianGraphRow}>
        <div ref={wrapperRef} className={css.obsidianCanvasWrap} data-testid="kg-obsidian-canvas">
          {view.mode === 'loading'
            ? <div className={css.obsidianLoading}>{t('obsidian.loading')}</div>
            : view.mode === 'error'
              ? <ErrorStrip message={view.message} />
              : createElement(ForceGraph2D, {
                graphData,
                height: size.height,
                width: size.width,
                cooldownTicks: 120,
                onNodeClick: (node: KgObsidianNode) => {
                  void select(node.id)
                  if (view.mode === 'global') void loadLocal(node, 1)
                },
                onNodeHover: (node: KgObsidianNode | null) => {
                  setHover(node === null ? undefined : { node, x: 0, y: 0 })
                },
                nodeLabel: (node: KgObsidianNode) => node.name,
                linkColor: () => palette().edge,
                nodeCanvasObject: (node: KgObsidianNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
                  drawNode(node, ctx, globalScale, hoveredNeighbors?.has(node.id) ?? false, view.mode === 'local' && view.seed.id === node.id)
                },
              })}
          {hover !== undefined
            ? (
              <div className={css.obsidianHoverCard} data-testid="kg-obsidian-hover">
                <strong>{hover.node.name}</strong>
                <span className={css.obsidianHoverType} data-type={hover.node.type}>{hover.node.type}</span>
                <dl>
                  {Object.entries(hover.node.props).slice(0, 5).map(([key, value]) => (
                    <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
                  ))}
                </dl>
                <small>{t('obsidian.degree', { count: hover.node.degree })}</small>
              </div>
            )
            : null}
        </div>

        {detail !== undefined
          ? (
            <aside className={css.obsidianPanel} data-testid="kg-obsidian-panel">
              <header>
                <strong>{detail.name}</strong>
                <span className={css.obsidianHoverType} data-type={detail.type}>{detail.type}</span>
                <button type="button" className={css.obsidianPanelClose} onClick={() => { setDetail(undefined) }}>×</button>
              </header>
              <h4>{t('obsidian.outRelations')}</h4>
              <ul>
                {detail.out_relations.length === 0 ? <li className={css.obsidianHitEmpty}>{t('obsidian.noRelations')}</li> : null}
                {detail.out_relations.map(relation => (
                  <li key={`${relation.direction}-${relation.other_id}-${relation.relation}`}>
                    <button type="button" onClick={() => { void loadLocal({ id: relation.other_id, type: relation.other_type, name: relation.other_name, props: {}, degree: 0 }, 1) }}>
                      <span className={css.obsidianRelationName}>{relation.relation}</span>
                      <span>→ {relation.other_name}</span>
                      <span className={css.obsidianHitType} data-type={relation.other_type}>{relation.other_type}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <h4>{t('obsidian.inRelations')}</h4>
              <ul>
                {detail.in_relations.length === 0 ? <li className={css.obsidianHitEmpty}>{t('obsidian.noRelations')}</li> : null}
                {detail.in_relations.map(relation => (
                  <li key={`${relation.direction}-${relation.other_id}-${relation.relation}`}>
                    <button type="button" onClick={() => { void loadLocal({ id: relation.other_id, type: relation.other_type, name: relation.other_name, props: {}, degree: 0 }, 1) }}>
                      <span className={css.obsidianRelationName}>{relation.relation}</span>
                      <span>← {relation.other_name}</span>
                      <span className={css.obsidianHitType} data-type={relation.other_type}>{relation.other_type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          )
          : null}
      </div>

      <footer className={css.obsidianStats}>
        {view.mode === 'global' && view.stats !== undefined
          ? t('obsidian.statsGlobal', {
            nodes: view.stats.nodes, edges: view.stats.edges,
            islands: view.stats.islands, largest: view.stats.largest_component,
          })
          : null}
        {view.mode === 'global' && view.truncated ? t('obsidian.truncated') : null}
        {view.mode === 'local'
          ? t('obsidian.statsLocal', { seed: view.seed.name, hops: view.hops, nodes: view.data.nodes.length, edges: view.data.edges.length })
          : null}
      </footer>
    </section>
  )
}

/**
 * Draw one node: degree-sized dot with the type color, neighbor halo while
 * hovering, and the label once zoomed in (the Obsidian text-fade behavior).
 * @param node - the node to draw.
 * @param ctx - the canvas 2D context.
 * @param globalScale - the current zoom scale.
 * @param isNeighbor - whether the node neighbors the hovered node.
 * @param isSeed - whether the node is the local view's seed.
 */
function drawNode(
  node: KgObsidianNode & { x?: number; y?: number }, ctx: CanvasRenderingContext2D, globalScale: number,
  isNeighbor: boolean, isSeed: boolean,
): void {
  const colors = palette()
  const radius = isSeed ? 7 : 4 + Math.sqrt(node.degree)
  ctx.beginPath()
  ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI)
  ctx.fillStyle = nodeColorOf(node.type)
  ctx.globalAlpha = isNeighbor || isSeed ? 1 : 0.75
  ctx.fill()
  if (isSeed || isNeighbor) {
    ctx.lineWidth = 1.5 / globalScale
    ctx.strokeStyle = colors.halo
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  if (globalScale > 1.1 || isSeed) {
    const fontSize = Math.max(10 / globalScale, 3.5)
    ctx.font = `${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = colors.label
    ctx.fillText(node.name.slice(0, 24), (node.x ?? 0), (node.y ?? 0) + radius + fontSize)
  }
}
