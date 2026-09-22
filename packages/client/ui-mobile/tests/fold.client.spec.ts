// @vitest-environment jsdom
/** foldHistory: the mobile chat surface's projection from raw session events. */

import { describe, expect, it } from 'vitest'
import { foldHistory, type FoldEvent } from '../src/client/fold.ts'

/** One raw event helper (seq/time implied by position). */
function event(type: string, data: unknown, seq: number): FoldEvent {
  return { type, seq, time: 1_000 + seq, data }
}

describe('foldHistory', () => {
  it('folds a form-assistant turn into bubbles, tool rows, and the task card', () => {
    const folded = foldHistory([
      event('turn/start', { turn: 1 }, 0),
      event('user/message', { content: [{ type: 'text', text: '登记采购单' }], source: { kind: 'user' } }, 1),
      event('user/message', { content: [{ type: 'text', text: 'runtime context' }], source: { kind: 'plugin' } }, 2),
      event('step/start', { turn: 1, step: 1 }, 3),
      event('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '我先看看表结构。' }] } }, 4),
      event('tool/call', { turn: 1, step: 1, callId: 'c1', name: 'nb_collections', arguments: '{}' }, 5),
      event('tool/result', { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'c1', isError: false, content: [] }] } }, 6),
      event('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '草稿：\n```json\n{"collection":"hub_po_purchase_orders","fields":{"po_number":"PO-1"}}\n```' }] } }, 7),
      event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 8),
    ])
    expect(folded.running).toBe(false)
    expect(folded.items.map(item => item.kind)).toEqual(['text', 'text', 'tool', 'text', 'task-card'])
    const user = folded.items[0]
    if (user?.kind !== 'text') throw new Error('expected user text')
    expect(user.role).toBe('user')
    // The injected plugin context is not a user bubble.
    expect(folded.items.filter(item => item.kind === 'text' && item.role === 'user')).toHaveLength(1)
    const tool = folded.items[2]
    if (tool?.kind !== 'tool') throw new Error('expected tool row')
    expect(tool.state).toBe('done')
    expect(tool.label).toBe('读取业务表结构')
    const card = folded.items[4]
    if (card?.kind !== 'task-card') throw new Error('expected task card')
    expect(card.draft.collection).toBe('hub_po_purchase_orders')
  })

  it('marks a failed tool result as error and an open turn as running', () => {
    const folded = foldHistory([
      event('turn/start', { turn: 1 }, 0),
      event('tool/call', { turn: 1, step: 1, callId: 'c9', name: 'unknown_tool', arguments: 'x' }, 1),
      event('tool/result', { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'c9', isError: true, content: [] }] } }, 2),
      event('turn/start', { turn: 2 }, 3),
    ])
    expect(folded.running).toBe(true)
    const tool = folded.items[0]
    if (tool?.kind !== 'tool') throw new Error('expected tool row')
    expect(tool.state).toBe('error')
    expect(tool.label).toBe('unknown_tool')
  })

  it('collects the KG walks from kg tool calls, deduplicated', () => {
    const folded = foldHistory([
      event('tool/call', { turn: 1, step: 1, callId: 'a', name: 'kg_subgraph', arguments: '{"seeds":["宏发食品"],"hops":1}' }, 0),
      event('tool/call', { turn: 1, step: 1, callId: 'b', name: 'kg_subgraph', arguments: '{"seeds":["宏发食品"],"hops":2}' }, 1),
      event('tool/call', { turn: 1, step: 1, callId: 'c', name: 'kg_query', arguments: '{"phrase":"谁给谁供货"}' }, 2),
      event('tool/call', { turn: 1, step: 1, callId: 'd', name: 'kg_query', arguments: 'not json' }, 3),
    ])
    expect(folded.kgQueries).toEqual([
      { kind: 'subgraph', seeds: ['宏发食品'] },
      { kind: 'phrase', phrase: '谁给谁供货' },
    ])
  })

  it('tolerates unsorted input and empty logs', () => {
    expect(foldHistory([])).toEqual({ items: [], running: false, kgQueries: [], degradedFences: 0 })
    const folded = foldHistory([
      event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 2),
      event('turn/start', { turn: 1 }, 1),
    ])
    expect(folded.running).toBe(false)
  })
})

describe('foldHistory (v3 dsh fences)', () => {
  const askFence = '```dsh\n{"v":3,"type":"ask_choice","id":"choice_1","mode":"single","variant":"cards","question":"这笔要登记成什么单据？","options":[{"label":"采购单","value":"hub_po_purchase_orders","hint":"我们向鲜丰买进","send":"是采购单，我们从鲜丰买进"},{"label":"出库单","value":"hub_wms_outbound","hint":"我们向鲜丰发货","send":"是出库单，我们发货给鲜丰"}],"allowFreeText":true}\n```'
  const draftFence = '```dsh\n{"v":3,"type":"form_draft","draftId":"d_1","revision":1,"form":{"collection":"hub_po_purchase_orders","label":"采购单"},"title":"鲜丰 · 冷链箱采购","fields":[{"name":"quantity","label":"数量","value":null,"tier":"required","widget":"number"},{"name":"order_date","label":"日期","value":"2026-09-21","tier":"derived","rationale":"今天","widget":"date"}]}\n```'
  const receiptFence = '```dsh\n{"v":3,"type":"submit_receipt","draftId":"d_1","form":{"collection":"hub_po_purchase_orders","label":"采购单"},"rowId":"1042","summary":[{"label":"合计金额","value":"¥16,000","kind":"money"}]}\n```'

  it('splits an assistant message into narrative and structured items in order', () => {
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: `好的，先确认单据类型。\n${askFence}\n请点选上面的选项。` }] } }, 4),
    ])
    expect(folded.items.map(item => item.kind)).toEqual(['text', 'ask', 'text'])
    const ask = folded.items[1]
    if (ask?.kind !== 'ask') throw new Error('expected ask item')
    expect(ask.payload.options).toHaveLength(2)
    // The fence never leaks into a bubble (01 ⑤C2/C4).
    for (const item of folded.items) {
      if (item.kind === 'text') expect(item.text.includes('```dsh')).toBe(false)
    }
  })

  it('folds form_draft and submit_receipt fences into their items', () => {
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: `草稿已备好，请过目。\n${draftFence}` }] } }, 1),
      event('assistant/message', { message: { content: [{ type: 'text', text: `已登记。\n${receiptFence}` }] } }, 2),
    ])
    const card = folded.items[1]
    if (card?.kind !== 'task-card' || card.payload === undefined) throw new Error('expected v3 draft card')
    expect(card.payload.draftId).toBe('d_1')
    expect(card.payload.fields[0]?.tier).toBe('required')
    expect(card.draft.collection).toBe('hub_po_purchase_orders')
    const receipt = folded.items[3]
    if (receipt?.kind !== 'receipt') throw new Error('expected receipt item')
    expect(receipt.payload.rowId).toBe('1042')
  })

  it('folds a fenced user action into an action item, not a bubble', () => {
    const confirmFence = '```dsh\n{"v":3,"type":"form_confirm","draftId":"d_1","revision":1,"form":{"collection":"hub_po_purchase_orders","label":"采购单"},"fields":[{"name":"quantity","label":"数量","value":"200"}]}\n```'
    const folded = foldHistory([
      event('user/message', { content: [{ type: 'text', text: `确认写入\n${confirmFence}` }], source: { kind: 'user' } }, 1),
    ])
    expect(folded.items).toHaveLength(1)
    const action = folded.items[0]
    if (action?.kind !== 'action') throw new Error('expected action item')
    expect(action.action).toBe('confirm')
    expect(action.text).toBe('确认写入')
  })

  it('still folds v2 prefix confirm and reject texts into action items', () => {
    const folded = foldHistory([
      event('user/message', { content: [{ type: 'text', text: '确认推送：…\n{"collection":"t","fields":{"a":"1"}}' }], source: { kind: 'user' } }, 1),
      event('user/message', { content: [{ type: 'text', text: '驳回：本表单草稿作废，不要写库。' }], source: { kind: 'user' } }, 2),
    ])
    expect(folded.items.map(item => item.kind)).toEqual(['action', 'action'])
    const confirm = folded.items[0]
    if (confirm?.kind !== 'action') throw new Error('expected confirm action')
    expect(confirm.legacy?.collection).toBe('t')
  })

  it('derives the answered state from the pick that follows an ask', () => {
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: askFence }] } }, 1),
      event('user/message', { content: [{ type: 'text', text: '是采购单，我们从鲜丰买进' }], source: { kind: 'user' } }, 2),
    ])
    const ask = folded.items[0]
    if (ask?.kind !== 'ask') throw new Error('expected ask item')
    expect(ask.answered).toEqual({ selected: 'hub_po_purchase_orders' })
    const reply = folded.items[1]
    if (reply?.kind !== 'text') throw new Error('expected reply bubble')
    expect(reply.choiceReply).toBe(true)
  })

  it('marks an ask answered without a highlight when the user types freely', () => {
    const fieldFence = '```dsh\n{"v":3,"type":"ask_field","id":"field_1","question":"这批冷链箱的数量是多少？","field":{"name":"quantity","label":"数量","widget":"number","unit":"箱","suggestions":[{"label":"200 箱","value":"200"}]}}\n```'
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: fieldFence }] } }, 1),
      event('user/message', { content: [{ type: 'text', text: '大概 260 箱' }], source: { kind: 'user' } }, 2),
    ])
    const ask = folded.items[0]
    if (ask?.kind !== 'field-ask') throw new Error('expected field-ask item')
    expect(ask.answered).toEqual({})
    const reply = folded.items[1]
    if (reply?.kind !== 'text') throw new Error('expected reply bubble')
    expect(reply.choiceReply).toBe(false)
  })

  it('drops user-action fences a model emits from an assistant message', () => {
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: '违规代发\n```dsh\n{"v":3,"type":"form_confirm","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"fields":[{"name":"n","label":"l","value":"1"}]}\n```' }] } }, 1),
    ])
    // The violating payload renders nothing; only the narrative remains.
    expect(folded.items).toHaveLength(1)
    const text = folded.items[0]
    if (text?.kind !== 'text') throw new Error('expected narrative text')
    expect(text.text).toBe('违规代发')
  })

  it('degrades an invalid dsh fence to a collapsed notice, never a raw-JSON bubble', () => {
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: '叙述\n```dsh\n{"v":3,"type":"nonsense"}\n```' }] } }, 1),
    ])
    expect(folded.degradedFences).toBe(1)
    // The narrative keeps only the prose; the invalid fence becomes its own
    // notice item carrying the original fenced text for the expandable view.
    expect(folded.items.map(item => item.kind)).toEqual(['text', 'degraded'])
    const narrative = folded.items[0]
    if (narrative?.kind !== 'text') throw new Error('expected narrative text')
    expect(narrative.text).toBe('叙述')
    const degraded = folded.items[1]
    if (degraded?.kind !== 'degraded') throw new Error('expected degraded notice')
    expect(degraded.text).toContain('```dsh')
  })

  it('retires a stale ask when a degraded notice follows it', () => {
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: askFence }] } }, 1),
      event('assistant/message', { message: { content: [{ type: 'text', text: '```dsh\n{"v":3,"type":"nonsense"}\n```' }] } }, 2),
      event('user/message', { content: [{ type: 'text', text: '是采购单，我们从鲜丰买进' }], source: { kind: 'user' } }, 3),
    ])
    const ask = folded.items[0]
    if (ask?.kind !== 'ask') throw new Error('expected ask item')
    expect(ask.answered).toBeUndefined()
  })

  it('retires a stale ask when the assistant moves on', () => {
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: askFence }] } }, 1),
      event('assistant/message', { message: { content: [{ type: 'text', text: '先说别的。' }] } }, 2),
      event('user/message', { content: [{ type: 'text', text: '是采购单，我们从鲜丰买进' }], source: { kind: 'user' } }, 3),
    ])
    const ask = folded.items[0]
    if (ask?.kind !== 'ask') throw new Error('expected ask item')
    expect(ask.answered).toBeUndefined()
  })
})

describe('foldHistory (v3 user-action shapes)', () => {
  it('folds a fenced reject and a fence-only confirm with no narrative line', () => {
    const folded = foldHistory([
      event('user/message', { content: [{ type: 'text', text: '驳回\n```dsh\n{"v":3,"type":"reject_flow","draftId":"d_1"}\n```' }], source: { kind: 'user' } }, 1),
      event('user/message', { content: [{ type: 'text', text: '```dsh\n{"v":3,"type":"form_confirm","draftId":"d_1","revision":1,"form":{"collection":"c","label":"采购单"},"fields":[{"name":"n","label":"数量","value":"200"}]}\n```' }], source: { kind: 'user' } }, 2),
    ])
    expect(folded.items.map(item => item.kind)).toEqual(['action', 'action'])
    const reject = folded.items[0]
    if (reject?.kind !== 'action') throw new Error('expected reject')
    expect(reject.action).toBe('reject')
    const confirm = folded.items[1]
    if (confirm?.kind !== 'action') throw new Error('expected confirm')
    expect(confirm.text).toBe('确认写入')
  })

  it('renders a non-action dsh fence from a user message as a plain bubble', () => {
    const folded = foldHistory([
      event('user/message', { content: [{ type: 'text', text: '```dsh\n{"v":3,"type":"form_draft","draftId":"d","revision":1,"form":{"collection":"c","label":"l"},"title":"t","fields":[{"name":"n","label":"l","value":"1","tier":"required","widget":"text"}]}\n```' }], source: { kind: 'user' } }, 1),
    ])
    expect(folded.items.map(item => item.kind)).toEqual(['text'])
  })

  it('drops the empty narrative when a v2 draft message carries no prose', () => {
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: '```json\n{"collection":"hub_po_orders","fields":{"a":"1"}}\n```' }] } }, 1),
    ])
    expect(folded.items.map(item => item.kind)).toEqual(['task-card'])
  })

  it('keeps a non-draft v2 fence in the narrative bubble', () => {
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: '数据如下\n```json\n{"foo":1}\n```' }] } }, 1),
    ])
    // A ```json block that does not parse as a draft is ordinary prose the
    // v2 message meant the user to read, so it stays in the bubble.
    expect(folded.items.map(item => item.kind)).toEqual(['text'])
    const text = folded.items[0]
    if (text?.kind !== 'text') throw new Error('expected narrative text')
    expect(text.text).toContain('```json')
  })
})

describe('foldHistory (fence-only reject default line)', () => {
  it('labels a fence-only reject with the bare 驳回 default', () => {
    const folded = foldHistory([
      event('user/message', { content: [{ type: 'text', text: '```dsh\n{"v":3,"type":"reject_flow","draftId":"d_1"}\n```' }], source: { kind: 'user' } }, 1),
    ])
    const action = folded.items[0]
    if (action?.kind !== 'action') throw new Error('expected action')
    expect(action.text).toBe('驳回')
  })
})

describe('foldHistory (protocol names as tool calls)', () => {
  it('folds an ask-shaped protocol tool call into the neutral status row', () => {
    const folded = foldHistory([
      event('tool/call', { callId: 'p1', name: 'ask_field_pricing', arguments: '{}' }, 1),
      event('tool/result', { message: { content: [{ toolCallId: 'p1', isError: true }] } }, 2),
    ])
    const row = folded.items[0]
    if (row?.kind !== 'tool') throw new Error('expected tool row')
    expect(row.protocol).toBe(true)
    expect(row.label).toBe('补充信息…')
    // The failed result still lands; the row keeps its protocol marking.
    expect(row.state).toBe('error')
  })

  it('labels each named protocol fence with its neutral status line', () => {
    const folded = foldHistory([
      event('tool/call', { callId: 'p1', name: 'form_draft', arguments: '{}' }, 1),
      event('tool/call', { callId: 'p2', name: 'form_confirm', arguments: '{}' }, 2),
      event('tool/call', { callId: 'p3', name: 'reject_flow', arguments: '{}' }, 3),
      event('tool/call', { callId: 'p4', name: 'submit_receipt', arguments: '{}' }, 4),
    ])
    expect(folded.items.map(item => item.kind === 'tool' ? item.label : '')).toEqual([
      '正在整理草稿…',
      '正在确认…',
      '正在处理驳回…',
      '正在登记…',
    ])
  })

  it('keeps ordinary unknown tool names on the plain tool row', () => {
    const folded = foldHistory([
      event('tool/call', { callId: 'u1', name: 'some_real_tool', arguments: '{}' }, 1),
    ])
    const row = folded.items[0]
    if (row?.kind !== 'tool') throw new Error('expected tool row')
    expect(row.protocol).toBeUndefined()
    expect(row.label).toBe('some_real_tool')
  })
})
