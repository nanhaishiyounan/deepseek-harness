/**
 * KG evidence for the conversation flow (v3, 02 §4.5): the walks the
 * assistant performed (kg_subgraph seeds / kg_query phrases from the durable
 * tool events) collapse into one entry row at the flow's tail; the bottom
 * sheet carries the node-and-edge card flows with the asserted_by provenance
 * badge (the same kg-graph.sqlite the PC KG view resolves).
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import { Popup } from 'antd-mobile'
import { Search, X } from 'lucide-react'
import { portalContainer } from '../portal.ts'
import type { KgEvidenceQuery } from '../fold.ts'
import { rpc } from '../rpc.ts'
import { messageOf } from '../hooks.ts'
import { Badge } from '../ui.tsx'
import css from './kg.module.css'

/** One subgraph walk's wire value. */
export interface KgSubgraphValue {
  readonly nodes: readonly { readonly id: string; readonly type: string; readonly name: string; readonly depth: number }[]
  readonly edges: readonly {
    readonly id: string
    readonly relation: string
    readonly source: string
    readonly target: string
    readonly fact?: string
    readonly asserted_by: string
  }[]
  readonly truncated: boolean
  readonly seeds_resolved: readonly string[]
}

/** Fetch one subgraph walk for seeds (hops pinned to 1 for the card form). */
export async function fetchSubgraph(seeds: readonly string[]): Promise<KgSubgraphValue> {
  return rpc('kg.subgraph', { seeds: [...seeds], hops: 1 })
}

/** Evidence section props: the folded turn's KG queries. */
export interface KgEvidenceSectionProps {
  readonly queries: readonly KgEvidenceQuery[]
}

/** The chat-side evidence entry row + sheet (renders nothing without KG usage). */
export function KgEvidenceSection({ queries }: KgEvidenceSectionProps): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => { setOpen(false) }, [])
  if (queries.length === 0) return null
  return (
    <>
      <button type="button" className={css.entryRow} aria-label="KG 证据入口" onClick={() => { setOpen(true) }}>
        <span className={css.entryIcon} aria-hidden="true"><Search size={14} /></span>
        <span className={css.entryText}>依据 · 知识图谱 {String(queries.length)} 条</span>
        <span className={css.entryChevron} aria-hidden="true">›</span>
      </button>
      <Popup
        visible={open}
        onMaskClick={close}
        destroyOnClose
        getContainer={portalContainer}
        bodyClassName={css.sheetBody as string}
        className={css.sheetWrap as string}
      >
        <section className={css.evidenceSection} aria-label="KG 证据卡">
          <header className={css.evidenceHeader}>
            <span>依据 · 知识图谱</span>
            <span className={css.evidenceHeadSide}>
              <Badge tone="muted">{String(queries.length)} 条</Badge>
              <button type="button" className={css.sheetClose} aria-label="关闭证据" onClick={close}>
                <X size={18} aria-hidden="true" />
              </button>
            </span>
          </header>
          {queries.map((query, index) => (
            query.kind === 'subgraph'
              ? <SubgraphCard key={`${String(index)}-s`} seeds={query.seeds} />
              : <PhraseCard key={`${String(index)}-p`} phrase={query.phrase} />
          ))}
        </section>
      </Popup>
    </>
  )
}

/** One seed-walk evidence card. */
function SubgraphCard({ seeds }: { seeds: readonly string[] }): JSX.Element {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; value: KgSubgraphValue }
  >({ status: 'loading' })
  useEffect(() => {
    let alive = true
    fetchSubgraph(seeds).then((value) => {
      if (alive) setState({ status: 'ready', value })
    }, (error: unknown) => {
      if (alive) setState({ status: 'error', message: messageOf(error) })
    })
    return () => { alive = false }
  }, [seeds])
  return (
    <article className={css.card}>
      <header className={css.cardHeader}>
        <span className={css.cardTitle}>实体走查</span>
        <SeedsBadge seeds={seeds} />
      </header>
      <SubgraphBody state={state} />
    </article>
  )
}

/** One phrase-walk evidence card (displays the phrase; walks on demand). */
function PhraseCard({ phrase }: { phrase: string }): JSX.Element {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; value: KgSubgraphValue }
  >({ status: 'loading' })
  useEffect(() => {
    let alive = true
    // A phrase's evidence anchors on the phrase's entity mentions: the card
    // resolves them through seed search so the card flow stays concrete.
    rpc('kg.search', { query: phrase.slice(0, 24), k: 3 }).then((search) => {
      const names = search.nodes.map(node => node.name)
      if (names.length === 0) {
        if (alive) setState({ status: 'error', message: '短语在图谱中无实体命中' })
        return
      }
      return fetchSubgraph(names).then((value) => {
        if (alive) setState({ status: 'ready', value })
      })
    }, (error: unknown) => {
      if (alive) setState({ status: 'error', message: messageOf(error) })
    })
    return () => { alive = false }
  }, [phrase])
  return (
    <article className={css.card}>
      <header className={css.cardHeader}>
        <span className={css.cardTitle}>短语走查</span>
        <span className={css.phrase}>{phrase}</span>
      </header>
      <SubgraphBody state={state} />
    </article>
  )
}

/** Shared body: node chips + edge lines. */
function SubgraphBody(
  { state }: {
    state: { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; value: KgSubgraphValue }
  },
): JSX.Element {
  if (state.status === 'loading') return <p className={css.hint}>证据加载中…</p>
  if (state.status === 'error') return <p className={css.hintError}>{state.message}</p>
  const { value } = state
  const nameOf = (id: string): string => value.nodes.find(node => node.id === id)?.name ?? id
  return (
    <>
      <div className={css.nodeRow}>
        {value.nodes.slice(0, 8).map(node => (
          <span key={node.id} className={css.nodeChip}>
            <span className={css.nodeName}>{node.name}</span>
            <span className={css.nodeType}>{node.type}</span>
          </span>
        ))}
      </div>
      <ul className={css.edgeList}>
        {value.edges.slice(0, 6).map(edge => (
          <li key={edge.id} className={css.edgeLine}>
            <span className={css.edgeEndpoint}>{nameOf(edge.source)}</span>
            <span className={css.edgeRelation}>—{edge.relation}→</span>
            <span className={css.edgeEndpoint}>{nameOf(edge.target)}</span>
            <Badge tone={assertedTone(edge.asserted_by)}>{edge.asserted_by}</Badge>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Provenance tone: kg-align/ai-edit warn (they are reviewable provenance);
 * lakehouse rides the primary tone (v3 folded the info slot away). */
function assertedTone(source: string): 'primary' | 'success' | 'warning' {
  if (source === 'nocobase' || source === 'lakehouse') return 'primary'
  if (source === 'kb' || source === 'connector') return 'success'
  return 'warning'
}

/** Seeds as a muted badge line. */
function SeedsBadge({ seeds }: { seeds: readonly string[] }): JSX.Element {
  return <Badge tone="muted">{seeds.slice(0, 3).join(' · ')}</Badge>
}
