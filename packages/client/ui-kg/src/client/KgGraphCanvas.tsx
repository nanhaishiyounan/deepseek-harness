/**
 * The graph canvas: sigma.js v3 over graphology with a force-atlas2 layout
 * run per walk, statically imported — a dsh.client bundle is a single
 * client.js artifact (the browser module table serves no relative-path
 * chunks), so the renderer stack rides the bundle. Environments without
 * WebGL (tests, forced-colors VMs) degrade to the relation-list view with
 * the same click/double-click semantics — the page never blanks.
 *
 * Interaction surface: bounded zoom (min/maxCameraRatio) with wheel and
 * pinch, node dragging (down → move → up with a 4px threshold so clicks
 * stay clicks), a control cluster (zoom in / out / reset-to-fit), a
 * selection highlight ring over the node's neighborhood, and camera state
 * carried across the renderer rebuilds a filter or walk switch triggers.
 * @module @deepseek-ai/dsh-client-ui-kg/client/KgGraphCanvas
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  Button, IconFullscreenOutline16, IconMinusOutline16, IconPlusOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import Sigma from 'sigma'
import Graph from 'graphology'
import fa2Module from 'graphology-layout-forceatlas2'
import { nodeColorOf } from './presentation.ts'
import type { KgEdgeRow, KgSubgraphNodeRow } from './kgTypes.ts'
import type GraphologyGraph from 'graphology'
import css from './kg.module.css'

/** The interactions the canvas reports upward. */
export interface KgCanvasActions {
  /** One node was clicked (details panel). */
  onSelect: (nodeId: string) => void
  /** One node was double-clicked (load-on-demand expansion). */
  onExpand: (nodeId: string) => void
}

/** Full component props. */
export interface KgGraphCanvasProps extends KgCanvasActions {
  /** The walk's nodes (stable identity by minted id). */
  nodes: readonly KgSubgraphNodeRow[]
  /** The walk's edges (endpoints both inside `nodes`). */
  edges: readonly KgEdgeRow[]
  /** Type-filter whitelist; `undefined` keeps every type. */
  typeFilter: ReadonlySet<string> | undefined
  /** The selected node id. */
  selected: string | undefined
  /**
   * Node color resolver (the semantic/community coloring modes); absent
   * falls back to the per-type hash ladder.
   */
  nodeColor?: (node: KgSubgraphNodeRow) => string
  /** Locale lookup (control labels and the degraded list). */
  t: (key: 'canvas.degradedTitle' | 'canvas.degradedHint' | 'canvas.expandHint' | 'canvas.zoomIn' | 'canvas.zoomOut' | 'canvas.reset' | 'details.expand') => string
}

/**
 * Sigma camera state carried across renderer rebuilds (sigma's CameraState
 * shape, kept structural so the type rides no separate sigma export).
 */
interface CameraSnapshot {
  x: number
  y: number
  angle: number
  ratio: number
}

/** The selected node plus its direct neighbors, for the highlight reducer. */
interface HighlightRing {
  self: string
  neighbors: ReadonlySet<string>
}

/** The FA2 layout entry: the package's default export, typed at the call shape. */
const fa2 = fa2Module as unknown as {
  assign(graph: GraphologyGraph, options: { iterations: number }): void
}

/**
 * Resolve a selection to its highlight ring: the node itself plus its
 * direct neighbors, or `undefined` when nothing is selected.
 * @param selected - the selected node id, if any.
 * @param edges - the walk's full edge list (neighbors may sit outside the filter).
 * @returns the ring to feed the sigma nodeReducer.
 */
function neighborhoodOf(
  selected: string | undefined,
  edges: readonly KgEdgeRow[],
): HighlightRing | undefined {
  if (selected === undefined) return undefined
  const neighbors = new Set<string>()
  for (const edge of edges) {
    if (edge.source === selected) neighbors.add(edge.target)
    else if (edge.target === selected) neighbors.add(edge.source)
  }
  return { self: selected, neighbors }
}

/**
 * Render the subgraph: sigma on WebGL hosts, the relation list everywhere
 * else. Mount-safe (the renderer is killed on unmount or graph swap).
 * @param props - the walk, the filter, and the interactions.
 * @returns the canvas or its degraded list.
 */
export function KgGraphCanvas(
  { nodes, edges, typeFilter, selected, nodeColor, onSelect, onExpand, t }: KgGraphCanvasProps,
): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // WebGL failure is sticky for the page session: retrying the renderer
  // inside one session never helps, the list stays until reload.
  const [degraded, setDegraded] = useState(false)
  const rendererRef = useRef<Sigma | null>(null)
  // Camera position survives renderer rebuilds (filter/walk switches):
  // captured on teardown, reapplied on construction.
  const cameraSnapshotRef = useRef<CameraSnapshot | undefined>(undefined)
  // The selection's highlight ring, re-read by the sigma nodeReducer on
  // every refresh (the reducer closure must not capture render state).
  const highlightRef = useRef<HighlightRing | undefined>(undefined)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  // Memoized so a render from an unrelated state change (typing in the
  // search box) does not rebuild the renderer: the effect keys on identity.
  const visibleNodes = useMemo(
    () => typeFilter === undefined ? nodes : nodes.filter(node => typeFilter.has(node.type)),
    [nodes, typeFilter],
  )
  const visibleEdges = useMemo(() => {
    const visibleIds = new Set(visibleNodes.map(node => node.id))
    return edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target))
  }, [edges, visibleNodes])

  useEffect(() => {
    if (containerRef.current === null || visibleNodes.length === 0) return
    let renderer: Sigma | undefined
    let resizeObserver: ResizeObserver | undefined
    const container = containerRef.current
    try {
      const graph = new Graph({ multi: false, type: 'directed' })
      // Deterministic seed positions: the ring spread gives FA2 a sane
      // start before it pulls the structure into place.
      visibleNodes.forEach((node, index) => {
        const angle = (index / Math.max(visibleNodes.length, 1)) * Math.PI * 2
        graph.addNode(node.id, {
          label: node.name,
          x: Math.cos(angle) * 10,
          y: Math.sin(angle) * 10,
          size: 8,
          color: nodeColor?.(node) ?? nodeColorOf(node.type),
        })
      })
      visibleEdges.forEach((edge) => { graph.addEdge(edge.source, edge.target, { size: 1 }) })
      /* v8 ignore next -- the effect returns early without visible nodes, and
         each visible node was just added, so order is always positive here. */
      if (graph.order > 0) fa2.assign(graph, { iterations: 60 })
      highlightRef.current = neighborhoodOf(selectedRef.current, edges)
      const sigma = new Sigma(graph, container, {
        renderEdgeLabels: false,
        // Double-click owns node expansion, so the built-in double-click
        // zoom targets ratio 1 (no zoom); the wheel and pinch still zoom.
        doubleClickZoomingRatio: 1,
        // Bounded zoom: from the whole-walk overview (ratio 1) down to a
        // 0.05 far view and up to a 15× close-up, so the graph can never
        // be zoomed out to nothing or in past usefulness.
        minCameraRatio: 0.05,
        maxCameraRatio: 15,
        // The selection's neighborhood ring: the node itself glows with
        // its label forced, direct neighbors glow, the rest stays as-is.
        nodeReducer: (node, data) => {
          const ring = highlightRef.current
          if (ring === undefined) return data
          if (node === ring.self) return { ...data, highlighted: true, forceLabel: true }
          if (ring.neighbors.has(node)) return { ...data, highlighted: true }
          return data
        },
      })
      if (cameraSnapshotRef.current !== undefined) sigma.getCamera().setState(cameraSnapshotRef.current)

      // Node drag: downNode arms a candidate; a move past the 4px
      // threshold starts moving the node; the stage-level up ends it. The
      // threshold keeps sub-threshold presses clickable, and one drag
      // suppresses the trailing click.
      let dragNode: string | undefined
      let dragArmedAt: { x: number; y: number } | undefined
      let dragMoved = false
      let clickSuppressed = false
      sigma.on('downNode', (payload) => {
        dragNode = payload.node
        dragArmedAt = { x: payload.event.x, y: payload.event.y }
        payload.event.preventSigmaDefault()
      })
      sigma.on('moveBody', (payload) => {
        if (dragNode === undefined || dragArmedAt === undefined) return
        const dx = payload.event.x - dragArmedAt.x
        const dy = payload.event.y - dragArmedAt.y
        if (!dragMoved && dx * dx + dy * dy < 16) return
        dragMoved = true
        const pos = sigma.viewportToGraph({ x: payload.event.x, y: payload.event.y })
        graph.setNodeAttribute(dragNode, 'x', pos.x)
        graph.setNodeAttribute(dragNode, 'y', pos.y)
        sigma.refresh({ skipIndexation: true })
      })
      sigma.on('upStage', () => {
        if (dragMoved) clickSuppressed = true
        dragNode = undefined
        dragArmedAt = undefined
        dragMoved = false
      })
      sigma.on('clickNode', (payload) => {
        if (clickSuppressed) {
          clickSuppressed = false
          return
        }
        onSelect(payload.node)
      })
      sigma.on('doubleClickNode', (payload) => { onExpand(payload.node) })

      // The canvas follows its container, not the window: the product's
      // sidebar is a draggable grid, so a sidebar drag never fires a
      // window resize but does resize this box.
      resizeObserver = new ResizeObserver(() => { sigma.resize() })
      resizeObserver.observe(container)

      rendererRef.current = sigma
      renderer = sigma
    } catch {
      setDegraded(true)
    }
    return () => {
      if (renderer !== undefined) {
        cameraSnapshotRef.current = renderer.getCamera().getState()
        renderer.kill()
      }
      resizeObserver?.disconnect()
      rendererRef.current = null
    }
    // The render signature: the walk content and the filter (selection rides
    // sigma's own state, not a re-mount).
  }, [visibleNodes, visibleEdges, typeFilter, onSelect, onExpand, edges])

  // A selection change repaints the highlight ring without rebuilding the
  // renderer: the reducer re-reads highlightRef on the refresh.
  useEffect(() => {
    highlightRef.current = neighborhoodOf(selected, edges)
    rendererRef.current?.refresh({ skipIndexation: true })
  }, [selected, edges])

  /** Drive the camera from a control; a dead renderer (degraded or gone) no-ops. */
  const zoom = (action: 'zoom-in' | 'zoom-out' | 'reset'): void => {
    const camera = rendererRef.current?.getCamera()
    /* v8 ignore next -- the zoom controls render only on the non-degraded canvas,
       where the renderer effect already installed a live sigma instance. */
    if (camera === undefined) return
    if (action === 'zoom-in') void camera.animatedZoom()
    else if (action === 'zoom-out') void camera.animatedUnzoom()
    else void camera.animatedReset()
  }

  if (visibleNodes.length === 0) {
    return <div className={css.canvasEmpty} />
  }

  return (
    <div className={css.canvasFrame}>
      {degraded ? (
        <div className={css.canvasList} data-testid="kg-canvas-list">
          <p className={css.canvasListTitle}>{t('canvas.degradedTitle')}</p>
          <p className={css.canvasListHint}>{t('canvas.degradedHint')}</p>
          <ul className={css.canvasListRows}>
            {visibleNodes.map(node => (
              <li
                key={node.id}
                className={css.canvasListNode}
                data-selected={node.id === selected}
                onClick={() => { onSelect(node.id) }}
                onDoubleClick={() => { onExpand(node.id) }}
              >
                <span className={css.canvasListDot} style={{ background: nodeColorOf(node.type) }} aria-hidden="true" />
                <span className={css.canvasListName}>{node.name}</span>
                <Button variant="ghost" size="sm" onClick={() => { onExpand(node.id) }}>{t('details.expand')}</Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div ref={containerRef} className={css.canvasViewport} data-testid="kg-canvas-viewport">
            <div className={css.canvasControls}>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('canvas.zoomIn')}
                title={t('canvas.zoomIn')}
                onClick={() => { zoom('zoom-in') }}
              >
                <IconPlusOutline16 />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('canvas.zoomOut')}
                title={t('canvas.zoomOut')}
                onClick={() => { zoom('zoom-out') }}
              >
                <IconMinusOutline16 />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('canvas.reset')}
                title={t('canvas.reset')}
                onClick={() => { zoom('reset') }}
              >
                <IconFullscreenOutline16 />
              </Button>
            </div>
          </div>
          <p className={css.canvasHint}>{t('canvas.expandHint')}</p>
        </>
      )}
    </div>
  )
}
