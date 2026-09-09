/**
 * The graph canvas: sigma.js v3 over graphology with a force-atlas2 layout
 * run per walk, statically imported — a dsh.client bundle is a single
 * client.js artifact (the browser module table serves no relative-path
 * chunks), so the renderer stack rides the bundle. Environments without
 * WebGL (tests, forced-colors VMs) degrade to the relation-list view with
 * the same click/double-click semantics — the page never blanks.
 * @module @deepseek-ai/dsh-client-ui-kg/client/KgGraphCanvas
 */

import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
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
  /** Locale lookup (labels for the degraded list). */
  t: (key: 'canvas.degradedTitle' | 'canvas.degradedHint' | 'canvas.expandHint' | 'details.expand') => string
}

/** The FA2 layout entry: the package's default export, typed at the call shape. */
const fa2 = fa2Module as unknown as {
  assign(graph: GraphologyGraph, options: { iterations: number }): void
}

/**
 * Render the subgraph: sigma on WebGL hosts, the relation list everywhere
 * else. Mount-safe (the renderer is killed on unmount or graph swap).
 * @param props - the walk, the filter, and the interactions.
 * @returns the canvas or its degraded list.
 */
export function KgGraphCanvas(
  { nodes, edges, typeFilter, selected, onSelect, onExpand, t }: KgGraphCanvasProps,
): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // WebGL failure is sticky for the page session: retrying the renderer
  // inside one session never helps, the list stays until reload.
  const [degraded, setDegraded] = useState(false)
  const visibleNodes = typeFilter === undefined ? nodes : nodes.filter(node => typeFilter.has(node.type))
  const visibleIds = new Set(visibleNodes.map(node => node.id))
  const visibleEdges = edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target))

  useEffect(() => {
    if (containerRef.current === null || visibleNodes.length === 0) return
    let renderer: { kill: () => void } | undefined
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
          color: nodeColorOf(node.type),
        })
      })
      visibleEdges.forEach((edge) => { graph.addEdge(edge.source, edge.target, { size: 1 }) })
      if (graph.order > 0) fa2.assign(graph, { iterations: 60 })
      const sigma = new Sigma(graph, container, {
        renderEdgeLabels: false,
        // Double-click owns node expansion, so the built-in double-click
        // zoom targets ratio 1 (no zoom); the wheel and pinch still zoom.
        doubleClickZoomingRatio: 1,
      })
      sigma.on('clickNode', (payload) => { onSelect(payload.node) })
      sigma.on('doubleClickNode', (payload) => { onExpand(payload.node) })
      renderer = sigma
    } catch {
      setDegraded(true)
    }
    return () => {
      renderer?.kill()
    }
    // The render signature: the walk content and the filter (selection rides
    // sigma's own state, not a re-mount).
  }, [visibleNodes, visibleEdges, typeFilter, onSelect, onExpand])

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
          <div ref={containerRef} className={css.canvasViewport} data-testid="kg-canvas-viewport" />
          <p className={css.canvasHint}>{t('canvas.expandHint')}</p>
        </>
      )}
    </div>
  )
}
