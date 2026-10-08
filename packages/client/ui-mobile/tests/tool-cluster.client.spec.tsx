// @vitest-environment jsdom
/**
 * The tool-run cluster split (W23-B2 P1-10): consecutive settled tool rows
 * fold into one cluster unit; wedged assistant narration joins the cluster;
 * running rows, single tools, and the turn's leading/trailing text pass
 * through untouched.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatItem, ChatTextMessage, ChatToolRow } from '../src/client/fold.ts'
import { clusterFlowUnits, ToolClusterRow } from '../src/client/messages/chat/ToolClusterRow.tsx'

afterEach(cleanup)

/** One settled tool row at a seq. */
const tool = (seq: number, state: ChatToolRow['state'] = 'done'): ChatToolRow =>
  ({ kind: 'tool', seq, time: 1000, name: 'nb_list', label: '查询业务记录', state })

/** One protocol-marked tool row (an ask_/form_ fence name) at a seq. */
const protocolTool = (seq: number, state: ChatToolRow['state'] = 'error'): ChatToolRow =>
  ({ kind: 'tool', seq, time: 1000, name: 'ask_field', label: '补充信息…', state, protocol: true })

/** One assistant text row. */
const text = (seq: number, body: string): ChatTextMessage =>
  ({ kind: 'text', seq, time: 1000, role: 'assistant', text: body })

/** The user bubble that opens a turn. */
const userText = (seq: number, body: string): ChatItem =>
  ({ kind: 'text', seq, time: 1000, role: 'user', text: body })

describe('clusterFlowUnits (W23-B2)', () => {
  it('folds consecutive settled tool rows into one cluster and keeps the wedged narration inside', () => {
    const items: readonly ChatItem[] = [
      userText(1, '看下最近订单'),
      tool(2), tool(3), tool(4),
      text(5, '换个思路再查一次'),
      tool(6), tool(7),
      text(8, '这是最终结论。'),
    ]
    const units = clusterFlowUnits(items).map(entry => entry.unit)
    expect(units.map(unit => unit.kind)).toEqual(['text', 'tool-cluster', 'text'])
    const cluster = units[1]
    if (cluster?.kind !== 'tool-cluster') throw new Error('expected a cluster')
    expect(cluster.tools.map(row => row.seq)).toEqual([2, 3, 4, 6, 7])
    expect(cluster.notes.map(note => note.seq)).toEqual([5])
    expect(cluster.firstIndex).toBe(1)
  })

  it('breaks the run at a running row and leaves single tools unclustered', () => {
    const items: readonly ChatItem[] = [
      tool(1),
      tool(2, 'running'),
      tool(3),
    ]
    const units = clusterFlowUnits(items).map(entry => entry.unit)
    expect(units.map(unit => unit.kind)).toEqual(['tool', 'tool', 'tool'])
  })

  it('keeps the trailing answer outside the cluster when no tool follows the text', () => {
    const items: readonly ChatItem[] = [tool(1), tool(2), text(3, '结案陈词')]
    const units = clusterFlowUnits(items).map(entry => entry.unit)
    expect(units.map(unit => unit.kind)).toEqual(['tool-cluster', 'text'])
    const cluster = units[0]
    if (cluster?.kind !== 'tool-cluster') throw new Error('expected a cluster')
    expect(cluster.notes).toEqual([])
  })

  it('carries each pass-through item with its original index (the previous seam)', () => {
    const items: readonly ChatItem[] = [tool(1), tool(2), text(3, '答案')]
    const entries = clusterFlowUnits(items)
    expect(entries.map(entry => entry.index)).toEqual([0, 2])
  })

  it('never clusters a protocol-marked row, even a failed one (W23-R3 F3)', () => {
    const items: readonly ChatItem[] = [
      tool(1),
      tool(2),
      protocolTool(3, 'error'),
      protocolTool(4, 'error'),
    ]
    const units = clusterFlowUnits(items).map(entry => entry.unit)
    // The two protocol rows pass through as their own neutral status lines;
    // only the two plain tools form the cluster.
    expect(units.map(unit => unit.kind)).toEqual(['tool-cluster', 'tool', 'tool'])
  })
})

describe('cluster key stability (W23-R3)', () => {
  it('derives the same key for a re-ordered run of the same three calls', () => {
    const before = clusterFlowUnits([tool(2), tool(3), tool(4)])
    const after = clusterFlowUnits([tool(3), tool(2), tool(4)])
    if (before[0]?.unit.kind !== 'tool-cluster' || after[0]?.unit.kind !== 'tool-cluster') {
      throw new Error('expected clusters')
    }
    expect(after[0].unit.key).toBe(before[0].unit.key)
    expect(before[0].unit.key).toBe('cluster:2::nb_list|3::nb_list|4::nb_list')
  })

  it('keeps the expanded cluster alive across a re-ordered re-fold (3 calls)', () => {
    const ClusterHarness = ({ rows }: { rows: readonly ChatItem[] }) => (
      <>
        {clusterFlowUnits(rows).map(({ unit }) => unit.kind === 'tool-cluster'
          ? <ToolClusterRow key={unit.key} cluster={unit} previous={userText(1, '问')} />
          : null)}
      </>
    )
    const { rerender } = render(<ClusterHarness rows={[tool(2), tool(3), tool(4)]} />)
    fireEvent.click(screen.getByRole('button', { name: /已完成 3 步查询/ }))
    expect(screen.getAllByText('查询业务记录').length).toBe(3)
    // The re-ordered fold re-derives the same key, so React reuses the
    // component and the user's expanded state survives.
    rerender(<ClusterHarness rows={[tool(4), tool(2), tool(3)]} />)
    expect(screen.getAllByText('查询业务记录').length).toBe(3)
    expect(screen.getByRole('button', { name: /已完成 3 步查询/ }).getAttribute('aria-expanded')).toBe('true')
  })
})

describe('ToolClusterRow (W23-B2)', () => {
  it('summarizes the run and expands to the rows plus the wedged note', () => {
    const cluster = {
      kind: 'tool-cluster',
      tools: [tool(2), tool(3)],
      notes: [text(4, '换个思路')],
      firstIndex: 1,
      key: 'cluster:2',
    } as const
    render(<ToolClusterRow cluster={cluster} previous={userText(1, '问')} />)
    const head = screen.getByRole('button', { name: /已完成 2 步查询/ })
    expect(screen.queryByText('查询业务记录')).toBeNull()
    fireEvent.click(head)
    expect(screen.getAllByText('查询业务记录').length).toBe(2)
    expect(screen.getByText('换个思路')).toBeTruthy()
  })
})
