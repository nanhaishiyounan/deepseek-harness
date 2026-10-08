/**
 * The tool-run cluster (W23-B2 P1-10): consecutive settled tool rows fold
 * into one summary line the user can expand — a nine-call nb_* chain reads
 * as 「已完成 8 步查询」 instead of nine stacked status rows before the card.
 * Assistant narration wedged between the calls (the model's
 * 换个思路 asides) joins the expanded body, out of the bubble lane; the
 * turn's leading and trailing text (before the first call / after the last)
 * never enter a cluster. A running tool row breaks the run — live progress
 * stays visible row by row.
 */

import { useState, type JSX } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import type { ChatItem, ChatTextMessage, ChatToolRow } from '../../fold.ts'
import { dayLabelOf } from '../../sessionsService.ts'
import { sanitizeBizText } from '../rich.ts'
import css from '../chat.module.css'

/** One folded run of settled tool rows plus the narration wedged between them. */
export interface ToolClusterUnit {
  readonly kind: 'tool-cluster'
  /** The settled tool rows, in order. */
  readonly tools: readonly ChatToolRow[]
  /** Assistant texts whose neighbors on both sides are cluster tools. */
  readonly notes: readonly ChatTextMessage[]
  /** The folded items' index of the run's first tool (the previous-item seam). */
  readonly firstIndex: number
  /** The stable render key (the first tool's kind:seq). */
  readonly key: string
}

/** One render unit: an ordinary flow item or a tool cluster. */
export type FlowUnit = ChatItem | ToolClusterUnit

const isSettledTool = (item: ChatItem): item is ChatToolRow =>
  item.kind === 'tool' && item.state !== 'running'

const isAssistantText = (item: ChatItem): item is ChatTextMessage =>
  item.kind === 'text' && item.role === 'assistant'

/**
 * Split the folded items into render units (W23-B2 P1-10): maximal runs of
 * consecutive settled tool rows (≥2) with their wedged assistant narration
 * become one cluster unit; every other item passes through untouched.
 * @param items - the fold's items in seq order.
 * @returns the render units with each ordinary item's own index preserved.
 */
export function clusterFlowUnits(items: readonly ChatItem[]): readonly {
  readonly unit: FlowUnit
  /** The unit's item index (the cluster's first tool) for the previous-item seam. */
  readonly index: number
}[] {
  const units: { unit: FlowUnit; index: number }[] = []
  let cursor = 0
  while (cursor < items.length) {
    if (!isSettledTool(items[cursor] as ChatItem)) {
      units.push({ unit: items[cursor] as ChatItem, index: cursor })
      cursor += 1
      continue
    }
    const firstIndex = cursor
    const tools: ChatToolRow[] = [items[cursor] as ChatToolRow]
    const notes: ChatTextMessage[] = []
    cursor += 1
    // Absorb following settled tools; assistant texts join only when another
    // tool follows them inside the run (the wedge rule).
    while (cursor < items.length) {
      const item = items[cursor] as ChatItem
      if (isSettledTool(item)) {
        tools.push(item)
        cursor += 1
        continue
      }
      if (isAssistantText(item)) {
        let scan = cursor
        while (scan < items.length && isAssistantText(items[scan] as ChatItem)) scan += 1
        if (scan < items.length && isSettledTool(items[scan] as ChatItem)) {
          for (let wedge = cursor; wedge < scan; wedge += 1) {
            notes.push(items[wedge] as ChatTextMessage)
          }
          cursor = scan
          continue
        }
      }
      break
    }
    if (tools.length < 2) {
      units.push({ unit: items[firstIndex] as ChatItem, index: firstIndex })
      cursor = firstIndex + 1
      continue
    }
    const head = tools[0] as ChatToolRow
    units.push({
      unit: { kind: 'tool-cluster', tools, notes, firstIndex, key: `cluster:${String(head.seq)}` },
      index: firstIndex,
    })
  }
  return units
}

/** One folded tool run: the summary line, the expandable calls and wedged notes. */
export function ToolClusterRow({ cluster, previous }: {
  readonly cluster: ToolClusterUnit
  /** The item before the run (the day-separator seam). */
  readonly previous: ChatItem | undefined
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const showDay = previous === undefined || dayLabelOf(cluster.tools[0]?.time ?? 0) !== dayLabelOf(previous.time)
  const separator = showDay ? <div className={css.daySeparator}>{dayLabelOf(cluster.tools[0]?.time ?? 0)}</div> : null
  return (
    <>
      {separator}
      <div className={css.toolCluster} data-testid="tool-cluster">
        <button
          type="button"
          className={css.toolClusterHead}
          aria-expanded={expanded}
          aria-label={`已完成 ${String(cluster.tools.length)} 步查询，展开查看过程`}
          onClick={() => { setExpanded(open => !open) }}
        >
          <span className={css.toolDot}>
            <Check size={10} strokeWidth={3} aria-hidden="true" />
          </span>
          <span className={css.toolClusterLabel}>
            已完成 {String(cluster.tools.length)} 步查询
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.8}
            aria-hidden="true"
            className={expanded ? `${css.groupChevron} ${css.groupChevronOpen}` : css.groupChevron}
          />
        </button>
        {expanded && (
          <div className={css.toolClusterBody}>
            {cluster.tools.map(tool => (
              <div key={`tool:${String(tool.seq)}`} className={css.toolRow}>
                <span className={tool.state === 'error' ? css.toolDotError : css.toolDot}>
                  {tool.state === 'error'
                    ? <X size={10} strokeWidth={3} aria-hidden="true" />
                    : <Check size={10} strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className={css.toolLabel}>{tool.label}</span>
              </div>
            ))}
            {cluster.notes.map(note => (
              <p key={`note:${String(note.seq)}`} className={css.toolClusterNote}>
                {sanitizeBizText(note.text)}
              </p>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
