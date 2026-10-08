// @vitest-environment jsdom
/**
 * The fold's remaining branches: malformed wire payloads on every event kind
 * (non-array contents, agent-kind sources, blank text, unnamed calls,
 * unstringifiable ids, empty tool results), the KG-query collection's guard
 * rails (non-string arguments, unparseable JSON, non-object payloads, bad
 * slot shapes), and the form-draft parser's rejection shapes.
 */

import { describe, expect, it } from 'vitest'
import { foldHistory, type FoldEvent } from '../src/client/fold.ts'
import { parseFormDrafts, parsePushReceipt } from '../src/client/form-draft.ts'

describe('foldHistory wire-shape guards', () => {
  it('drops agent-kind sources and contentless text blocks, keeping whitespace text', () => {
    const events: FoldEvent[] = [
      { type: 'user/message', seq: 1, time: 1, data: { source: { kind: 'agent' }, content: [{ type: 'text', text: '代发' }] } },
      { type: 'user/message', seq: 2, time: 1, data: { source: { kind: 'user' }, content: 'not-an-array' } },
      { type: 'user/message', seq: 3, time: 1, data: { source: { kind: 'user' }, content: [{ type: 'text' }, { type: 'image' }] } },
      { type: 'user/message', seq: 4, time: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '  ' }] } },
    ]
    const { items } = foldHistory(events)
    expect(items).toEqual([{ kind: 'text', seq: 4, time: 1, role: 'user', text: '  ' }])
  })

  it('drops assistant messages without message-shaped or text-bearing content', () => {
    const events: FoldEvent[] = [
      { type: 'assistant/message', seq: 1, time: 1, data: {} },
      { type: 'assistant/message', seq: 2, time: 1, data: { message: { content: 'plain' } } },
      { type: 'assistant/message', seq: 3, time: 1, data: { message: { content: [{ type: 'reasoning', text: '深思' }] } } },
    ]
    expect(foldHistory(events).items).toEqual([])
  })

  it('labels unnamed tool calls and leaves resultless rows running', () => {
    const events: FoldEvent[] = [
      { type: 'tool/call', seq: 1, time: 1, data: { name: 7, arguments: {} } },
      { type: 'tool/call', seq: 2, time: 1, data: { callId: 'c1', name: 'nb_list', arguments: {} } },
      { type: 'tool/result', seq: 3, time: 1, data: { message: { content: [{ toolCallId: 'c2' }] } } },
      { type: 'tool/result', seq: 4, time: 1, data: { message: { content: [{ kind: 'text' }] } } },
    ]
    const { items } = foldHistory(events)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ kind: 'tool', name: 'tool', label: 'tool', state: 'running' })
    expect(items[1]).toMatchObject({ kind: 'tool', name: 'nb_list', state: 'running' })
  })

  it('flips rows to done or error through either call-id field, ignoring resultless bodies', () => {
    const events: FoldEvent[] = [
      { type: 'tool/call', seq: 1, time: 1, data: { callId: 'by-tool-call', name: 'nb_get' } },
      { type: 'tool/call', seq: 2, time: 1, data: { callId: 'by-use-id', name: 'nb_create' } },
      { type: 'tool/result', seq: 3, time: 1, data: { message: { content: [{ toolCallId: 'by-tool-call' }] } } },
      { type: 'tool/result', seq: 4, time: 1, data: { message: { content: [{ tool_use_id: 'by-use-id', isError: true }] } } },
      { type: 'tool/result', seq: 5, time: 1, data: { message: { content: [] } } },
      { type: 'tool/result', seq: 6, time: 1, data: {} },
      { type: 'tool/result', seq: 7, time: 1, data: { message: { content: [{ toolCallId: 'unknown' }] } } },
    ]
    const { items } = foldHistory(events)
    expect(items[0]).toMatchObject({ state: 'done' })
    expect(items[1]).toMatchObject({ state: 'error' })
  })

  it('collects KG queries only from string JSON arguments with the right slot shapes, deduplicated', () => {
    const events: FoldEvent[] = [
      { type: 'tool/call', seq: 1, time: 1, data: { callId: 'a', name: 'kg_subgraph', arguments: { seeds: ['x'] } } },
      { type: 'tool/call', seq: 2, time: 1, data: { callId: 'b', name: 'kg_subgraph', arguments: 'not json' } },
      { type: 'tool/call', seq: 3, time: 1, data: { callId: 'c', name: 'kg_subgraph', arguments: '"just a string"' } },
      { type: 'tool/call', seq: 4, time: 1, data: { callId: 'd', name: 'kg_subgraph', arguments: '{"seeds":["宏发食品"]}' } },
      { type: 'tool/call', seq: 5, time: 1, data: { callId: 'e', name: 'kg_subgraph', arguments: '{"seeds":["宏发食品"]}' } },
      { type: 'tool/call', seq: 6, time: 1, data: { callId: 'f', name: 'kg_subgraph', arguments: '{"seeds":["宏发食品", 7]}' } },
      { type: 'tool/call', seq: 7, time: 1, data: { callId: 'g', name: 'kg_query', arguments: '{"phrase":"宏发食品的供货链"}' } },
      { type: 'tool/call', seq: 8, time: 1, data: { callId: 'h', name: 'kg_query', arguments: '{"phrase":""}' } },
      { type: 'tool/call', seq: 9, time: 1, data: { callId: 'i', name: 'kg_query', arguments: '{"phrase":"宏发食品的供货链"}' } },
      { type: 'tool/call', seq: 10, time: 1, data: { callId: 'j', name: 'kb_search', arguments: '{"phrase":"别的工具"}' } },
    ]
    expect(foldHistory(events).kgQueries).toEqual([
      { kind: 'subgraph', seeds: ['宏发食品'] },
      { kind: 'phrase', phrase: '宏发食品的供货链' },
    ])
  })

  it('sorts events by seq before folding and keeps the turn running only while open', () => {
    const open = foldHistory([
      { type: 'turn/end', seq: 2, time: 1, data: { turn: 1 } },
      { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } },
      { type: 'turn/start', seq: 3, time: 1, data: { turn: 2 } },
    ])
    expect(open.running).toBe(true)
    const closed = foldHistory([
      { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } },
      { type: 'turn/end', seq: 2, time: 1, data: { turn: 1 } },
    ])
    expect(closed.running).toBe(false)
    expect(foldHistory([{ type: 'unrelated', seq: 1, time: 1, data: null }]).running).toBe(false)
  })
})

describe('parseFormDrafts rejection shapes', () => {
  const fenced = (body: string): string => `\`\`\`json\n${body}\n\`\`\``

  it('rejects blocks that parse to non-objects, empty collections, or non-object fields', () => {
    expect(parseFormDrafts(fenced('null'))).toEqual([])
    expect(parseFormDrafts(fenced('42'))).toEqual([])
    expect(parseFormDrafts(fenced('{"collection":"","fields":{"a":"b"}}'))).toEqual([])
    expect(parseFormDrafts(fenced('{"collection":"t","fields":[]}'))).toEqual([])
    expect(parseFormDrafts(fenced('{"collection":"t","fields":[["a","b"]]}'))).toEqual([])
    expect(parseFormDrafts(fenced('{"collection":"t","fields":{"n":1,"b":true,"s":"ok"}}'))).toEqual([
      { collection: 't', title: 't', fields: { n: '1', b: 'true', s: 'ok' } },
    ])
  })

  it('keeps the given title and needs at least one coercible field', () => {
    expect(parseFormDrafts(fenced('{"collection":"t","title":"采购单","fields":{"x":"y"}}'))).toEqual([
      { collection: 't', title: '采购单', fields: { x: 'y' } },
    ])
    expect(parseFormDrafts(fenced('{"collection":"t","fields":{"obj":{"nested":1}}}}'))).toEqual([])
  })

  it('detects receipts only when both the row id and the collection name are present', () => {
    expect(parsePushReceipt('推送已落库（业务表 hub_po_orders 行 id=42）')).toEqual({ collection: 'hub_po_orders', rowId: 42 })
    expect(parsePushReceipt('collection `hub_po` id: 7')).toEqual({ collection: 'hub_po', rowId: 7 })
    expect(parsePushReceipt('没有 id 的回复')).toBeUndefined()
    expect(parsePushReceipt('行 id=9 但没有表名')).toBeUndefined()
  })
})

describe('foldHistory user-side report fences', () => {
  /** One legal report fence (the assistant-side shape). */
  const reportFence = '```dsh\n{"v":3,"type":"report","id":"r_1","title":"项目风险",'
    + '"metrics":[{"label":"待处理","value":"5","kind":"count"}]}\n```'

  it('renders a user message carrying a report fence as a plain bubble, never a report item', () => {
    const folded = foldHistory([
      { type: 'user/message', seq: 1, time: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: reportFence }] } },
    ])
    expect(folded.items).toHaveLength(1)
    const bubble = folded.items[0]
    if (bubble?.kind !== 'text') throw new Error('expected text bubble')
    expect(bubble.role).toBe('user')
    expect(bubble.text).toContain('```dsh')
    expect(folded.degradedCards).toBe(0)
  })
})
