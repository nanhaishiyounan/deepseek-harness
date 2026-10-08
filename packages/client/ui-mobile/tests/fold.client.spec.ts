// @vitest-environment jsdom
/** foldHistory: the mobile chat surface's projection from raw session events. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { foldHistory, type FoldEvent } from '../src/client/fold.ts'

/**
 * The present_card fixture corpus (P1), reused as the tool-call arguments
 * source so the fold's tool branch stays same-sourced with the server-side
 * validator (a protocol change on either side must update both in one PR).
 * Resolved off the process cwd because jsdom rewrites import.meta.url to an
 * http URL (vitest always starts at the repository root).
 */
const FIXTURES_DIR = join(process.cwd(), 'packages/interaction/tool-present-card/tests/fixtures')

/** One present_card tool/call event data with a fixture payload as arguments. */
function presentCardCall(callId: string, fixtureName: string): { callId: string; name: 'present_card'; arguments: string } {
  const raw = readFileSync(`${FIXTURES_DIR}/${fixtureName}.json`, 'utf8')
  return { callId, name: 'present_card', arguments: `{"payload":${raw.replace(/\s+/g, '')}}` }
}

/** One present_card tool/call event data with arbitrary raw arguments. */
function presentCardRawCall(callId: string, arguments_: string): { callId: string; name: 'present_card'; arguments: string } {
  return { callId, name: 'present_card', arguments: arguments_ }
}

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

  it('labels a kpi_snapshots nb_list as the 看板指标 status line (B9)', () => {
    const folded = foldHistory([
      event('tool/call', { callId: 'k1', name: 'nb_list', arguments: '{"collection":"kpi_snapshots","filter":{"kpi_code":"otif"},"sort":["-calc_date"],"pageSize":8}' }, 0),
      event('tool/call', { callId: 'k2', name: 'nb_list', arguments: '{"collection":"pur_orders","pageSize":5}' }, 1),
      event('tool/call', { callId: 'k3', name: 'nb_list', arguments: 'not json' }, 2),
    ])
    const labels = folded.items.map(item => item.kind === 'tool' ? item.label : '')
    expect(labels).toEqual(['查询看板指标', '查询业务记录', '查询业务记录'])
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
    expect(foldHistory([])).toEqual({ items: [], running: false, kgQueries: [], degradedCards: 0 })
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
      // W6-B1 ①: the receipt needs its successful nb_create landing line in
      // the window before the fence renders as the receipt card.
      event('tool/call', { callId: 'c9', name: 'nb_create', arguments: '{"collection":"hub_po_purchase_orders"}' }, 2),
      event('tool/result', { message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'c9', isError: false, content: [{ type: 'text', text: '已在 hub_po_purchase_orders 创建第 1042 行：\n- code: "PO-1"' }] }] } }, 3),
      event('assistant/message', { message: { content: [{ type: 'text', text: `已登记。\n${receiptFence}` }] } }, 4),
    ])
    const card = folded.items[1]
    if (card?.kind !== 'task-card' || card.payload === undefined) throw new Error('expected v3 draft card')
    expect(card.payload.draftId).toBe('d_1')
    expect(card.payload.fields[0]?.tier).toBe('required')
    expect(card.draft.collection).toBe('hub_po_purchase_orders')
    const receipt = folded.items[4]
    if (receipt?.kind !== 'receipt') throw new Error('expected receipt item')
    expect(receipt.payload.rowId).toBe('1042')
  })

  it('degrades a submit_receipt with no matching nb_create landing (W6-B1 ①)', () => {
    // The pathological round: a confirm+reject pair with no nb_create behind
    // it — the fabricated receipt must not render as the landed card.
    const fabricated = '```dsh\n{"v":3,"type":"submit_receipt","draftId":"d_9","form":{"collection":"pur_orders","label":"采购单"},"rowId":"7","summary":[{"label":"合计金额","value":"¥1","kind":"money"}]}\n```'
    const failedResult = { message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'cx', isError: true, content: [{ type: 'text', text: '单据编号撞号' }] }] } }
    const folded = foldHistory([
      event('tool/call', { callId: 'cx', name: 'nb_create', arguments: '{"collection":"pur_orders"}' }, 0),
      event('tool/result', failedResult, 1),
      event('assistant/message', { message: { content: [{ type: 'text', text: `已提交。\n${fabricated}` }] } }, 2),
    ])
    expect(folded.items.some(item => item.kind === 'receipt')).toBe(false)
    expect(folded.degradedCards).toBe(1)
    const notice = folded.items.find(item => item.kind === 'degraded')
    if (notice?.kind !== 'degraded') throw new Error('expected degraded notice')
    expect(notice.text.includes('回执未经落库核实')).toBe(true)
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
    expect(folded.degradedCards).toBe(1)
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

describe('foldHistory (present_card tool calls)', () => {
  it('folds a present_card ask_choice call into the ask card with no tool row', () => {
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: '这笔可以从两个方向登记，请点选：' }] } }, 0),
      event('tool/call', { turn: 1, step: 1, ...presentCardCall('pc1', 'ask-choice.valid') }, 1),
      event('tool/result', { message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'pc1', isError: false, content: [{ type: 'text', text: '卡片已呈现，本回合到此结束' }] }] } }, 2),
    ])
    expect(folded.items.map(item => item.kind)).toEqual(['text', 'ask'])
    const ask = folded.items[1]
    if (ask?.kind !== 'ask') throw new Error('expected ask item')
    expect(ask.payload.options).toHaveLength(2)
    // The tool row never appears and the result has no row to flip.
    expect(folded.items.some(item => item.kind === 'tool')).toBe(false)
  })

  it('folds a present_card form_draft call into the v3 task card', () => {
    const folded = foldHistory([
      event('tool/call', presentCardCall('pc2', 'form-draft.valid'), 1),
    ])
    const card = folded.items[0]
    if (card?.kind !== 'task-card' || card.payload === undefined) throw new Error('expected v3 draft card')
    expect(card.payload.draftId).toBe('d_20261006_1')
    expect(card.draft.collection).toBe('pur_orders')
  })

  it('folds a present_card report call into the report card', () => {
    const folded = foldHistory([
      event('tool/call', presentCardCall('pc3', 'report.valid'), 1),
    ])
    const report = folded.items[0]
    if (report?.kind !== 'report') throw new Error('expected report item')
    expect(report.payload.title).toBe('库存查询')
    expect(report.payload.metrics).toHaveLength(2)
  })

  it('folds a numeric-leaf ask_choice into the ask card with coerced strings', () => {
    const folded = foldHistory([
      event('tool/call', presentCardCall('pc16', 'ask-choice.numeric-values.valid'), 1),
    ])
    const ask = folded.items[0]
    if (ask?.kind !== 'ask') throw new Error('expected ask item')
    expect(ask.payload.id).toBe('7')
    expect(ask.payload.options.map(option => option.value)).toEqual(['1', '13', 'hf-001'])
    expect(folded.degradedCards).toBe(0)
  })

  it('folds a stringified-payload present_card call (double serialization) into the card', () => {
    const raw = readFileSync(`${FIXTURES_DIR}/payload-string.ask-choice.valid.json`, 'utf8').replace(/\s+/g, '')
    const folded = foldHistory([
      event('tool/call', presentCardRawCall('pc17', `{"payload":${raw}}`), 1),
    ])
    const ask = folded.items[0]
    if (ask?.kind !== 'ask') throw new Error('expected ask item')
    expect(ask.payload.id).toBe('choice_s')
    expect(folded.degradedCards).toBe(0)
  })

  it('degrades a present_card call whose payload fails validation, with no tool row', () => {
    const folded = foldHistory([
      event('tool/call', presentCardCall('pc4', 'report.metrics-over'), 1),
    ])
    expect(folded.degradedCards).toBe(1)
    expect(folded.items).toHaveLength(1)
    const notice = folded.items[0]
    if (notice?.kind !== 'degraded') throw new Error('expected degraded notice')
    expect(notice.text).toContain('present_card')
    // The over-limit payload never leaks its raw JSON into the surface.
    expect(folded.items.some(item => item.kind === 'report')).toBe(false)
  })

  it('degrades a present_card call with malformed arguments', () => {
    const folded = foldHistory([
      event('tool/call', presentCardRawCall('pc5', 'not json'), 1),
      event('tool/call', presentCardRawCall('pc6', '{}'), 2),
      event('tool/call', presentCardRawCall('pc7', '{"payload":"ask_choice"}'), 3),
    ])
    expect(folded.degradedCards).toBe(3)
    expect(folded.items.every(item => item.kind === 'degraded')).toBe(true)
  })

  it('degrades a present_card submit_receipt without a matching nb_create landing', () => {
    const folded = foldHistory([
      event('tool/call', presentCardCall('pc8', 'submit-receipt.valid'), 1),
    ])
    expect(folded.items.some(item => item.kind === 'receipt')).toBe(false)
    expect(folded.degradedCards).toBe(1)
    const notice = folded.items.find(item => item.kind === 'degraded')
    if (notice?.kind !== 'degraded') throw new Error('expected degraded notice')
    expect(notice.text).toContain('回执未经落库核实')
  })

  describe('render-side deterministic widget rewrite (W22-R2)', () => {
    it('folds a model-declared text quantity into the number-widget task card (tool/call channel)', () => {
      const folded = foldHistory([
        event('tool/call', presentCardCall('pcr1', 'form-draft.widget-coercion.valid'), 1),
      ])
      const card = folded.items[0]
      if (card?.kind !== 'task-card' || card.payload === undefined) throw new Error('expected v3 draft card')
      const widgets = Object.fromEntries(card.payload.fields.map(field => [field.name, field.widget]))
      expect(widgets).toEqual({
        supplier_id: 'relation',
        product_name: 'text',
        quantity: 'number',
        unit_price: 'number',
        amount: 'number',
        need_date: 'date',
        currency: 'text',
        code: 'text',
      })
    })

    it('applies the same classification to a legacy ```dsh fence (fence channel parity)', () => {
      const raw = readFileSync(`${FIXTURES_DIR}/form-draft.widget-coercion.valid.json`, 'utf8').replace(/\s+/g, '')
      const folded = foldHistory([
        event('assistant/message', { message: { content: [{ type: 'text', text: `先看下这张草稿\n\`\`\`dsh\n${raw}\n\`\`\`\n如需调整请直接说` }] } }, 0),
      ])
      const card = folded.items.find(item => item.kind === 'task-card')
      if (card?.kind !== 'task-card' || card.payload === undefined) throw new Error('expected v3 draft card')
      const quantity = card.payload.fields.find(field => field.name === 'quantity')
      expect(quantity?.widget).toBe('number')
      const unitPrice = card.payload.fields.find(field => field.name === 'unit_price')
      expect(unitPrice?.widget).toBe('number')
    })

    it('keeps a note-family declared text even when the label quotes a money word', () => {
      const folded = foldHistory([
        event('tool/call', presentCardRawCall('pcr2', JSON.stringify({
          payload: {
            v: 3,
            type: 'form_draft',
            draftId: 'd_note',
            revision: 1,
            form: { collection: 'pur_orders', label: '采购单' },
            title: '带备注的采购单',
            fields: [{ name: 'customer_note', label: '客户备注（含单价上限说明）', value: '按合同', tier: 'required', widget: 'text' }],
          },
        })), 1),
      ])
      const card = folded.items[0]
      if (card?.kind !== 'task-card' || card.payload === undefined) throw new Error('expected v3 draft card')
      expect(card.payload.fields[0]?.widget).toBe('text')
    })
  })

  describe('rejected present_card calls fold to the collapsed notice (W22-R2)', () => {
    it('never renders the interactive card when the tool/result landed isError', () => {
      const folded = foldHistory([
        event('tool/call', presentCardCall('pcx1', 'form-draft.widget-coercion.valid'), 1),
        event('tool/result', { message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'pcx1', isError: true, content: [{ type: 'text', text: 'ToolArgsError: payload.fields缺少必答字段' }] }] } }, 2),
        event('tool/call', presentCardCall('pcx2', 'form-draft.valid'), 3),
        event('tool/result', { message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'pcx2', isError: false, content: [{ type: 'text', text: '卡片已呈现' }] }] } }, 4),
      ])
      expect(folded.items.map(item => item.kind)).toEqual(['degraded', 'task-card'])
      const notice = folded.items[0]
      if (notice?.kind !== 'degraded') throw new Error('expected the rejected card to degrade')
      expect(notice.text).toContain('未通过校验')
      expect(folded.degradedCards).toBe(1)
    })

    it('keeps rendering the card while the result has not landed yet (running turn)', () => {
      const folded = foldHistory([
        event('tool/call', presentCardCall('pcx3', 'form-draft.widget-coercion.valid'), 1),
      ])
      expect(folded.items.map(item => item.kind)).toEqual(['task-card'])
      expect(folded.degradedCards).toBe(0)
    })
  })

  it('renders a present_card submit_receipt against its landed nb_create', () => {
    const folded = foldHistory([
      event('tool/call', { callId: 'c9', name: 'nb_create', arguments: '{"collection":"pur_orders"}' }, 0),
      event('tool/result', { message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'c9', isError: false, content: [{ type: 'text', text: '已在 pur_orders 创建第 7 行：\n- code: "PO-1"' }] }] } }, 1),
      event('tool/call', presentCardCall('pc9', 'submit-receipt.valid'), 2),
    ])
    // The nb_create keeps its tool row; the present_card call does not.
    expect(folded.items.map(item => item.kind)).toEqual(['tool', 'receipt'])
    const receipt = folded.items[1]
    if (receipt?.kind !== 'receipt') throw new Error('expected receipt item')
    expect(receipt.payload.rowId).toBe('7')
  })

  it('drops the four user-action payloads a model sends through present_card', () => {
    const confirm = {
      v: 3, type: 'form_confirm', draftId: 'd_1', revision: 1,
      form: { collection: 'c', label: '采购单' },
      fields: [{ name: 'n', label: '数量', value: '200' }],
    }
    const folded = foldHistory([
      event('tool/call', presentCardRawCall('pc10', JSON.stringify({ payload: confirm })), 1),
    ])
    // A valid-but-user-action payload renders nothing, same as the fence path.
    expect(folded.items).toHaveLength(0)
    expect(folded.degradedCards).toBe(0)
  })

  it('renders the fence source and the tool source in one window (dual-source replay)', () => {
    const askFence = '```dsh\n{"v":3,"type":"ask_choice","id":"choice_1","mode":"single","variant":"cards","question":"这笔要登记成什么单据？","options":[{"label":"采购单","value":"hub_po_purchase_orders","hint":"我们向鲜丰买进","send":"是采购单，我们从鲜丰买进"},{"label":"出库单","value":"hub_wms_outbound","hint":"我们向鲜丰发货","send":"是出库单，我们发货给鲜丰"}],"allowFreeText":true}\n```'
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: `先确认单据类型。\n${askFence}` }] } }, 1),
      event('tool/call', presentCardCall('pc11', 'report.valid'), 2),
    ])
    expect(folded.items.map(item => item.kind)).toEqual(['text', 'ask', 'report'])
  })

  it('folds two parallel present_card calls into both cards in call order', () => {
    const folded = foldHistory([
      event('tool/call', presentCardCall('pc12', 'ask-choice.valid'), 1),
      event('tool/call', presentCardCall('pc13', 'ask-field.valid'), 2),
    ])
    expect(folded.items.map(item => item.kind)).toEqual(['ask', 'field-ask'])
  })

  it('derives the answered state for a tool-sourced ask like the fence path', () => {
    const folded = foldHistory([
      event('tool/call', presentCardCall('pc14', 'ask-choice.valid'), 1),
      event('user/message', { content: [{ type: 'text', text: '是采购单，我们从鲜丰买进' }], source: { kind: 'user' } }, 2),
    ])
    const ask = folded.items[0]
    if (ask?.kind !== 'ask') throw new Error('expected ask item')
    expect(ask.answered).toEqual({ selected: 'pur_orders' })
  })

  it('retires a tool-sourced ask when the next-turn assistant moves on', () => {
    const folded = foldHistory([
      event('tool/call', presentCardCall('pc15', 'ask-choice.valid'), 1),
      event('assistant/message', { message: { content: [{ type: 'text', text: '先说别的。' }] } }, 2),
      event('user/message', { content: [{ type: 'text', text: '是采购单，我们从鲜丰买进' }], source: { kind: 'user' } }, 3),
    ])
    const ask = folded.items[0]
    if (ask?.kind !== 'ask') throw new Error('expected ask item')
    expect(ask.answered).toBeUndefined()
  })
})

describe('foldHistory (report fences)', () => {
  const reportFence = '```dsh\n{"v":3,"type":"report","id":"r_1","title":"项目风险",'
    + '"metrics":[{"label":"待处理","value":"5","kind":"count","tone":"warning"},{"label":"采购额","value":"¥16,000","kind":"money"}],'
    + '"rows":[{"label":"接口联调延期","hint":"影响测试开始 1～2 天","level":"high"}],'
    + '"actions":[{"kind":"create-task","label":"创建处理任务","title":"接口联调延期处理"}]}\n```'

  it('folds a report fence into a report item in narrative order', () => {
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: `帮你看了一下。\n${reportFence}\n有需要跟进的随时说。` }] } }, 1),
    ])
    expect(folded.items.map(item => item.kind)).toEqual(['text', 'report', 'text'])
    const report = folded.items[1]
    if (report?.kind !== 'report') throw new Error('expected report item')
    expect(report.payload.title).toBe('项目风险')
    expect(report.payload.metrics).toHaveLength(2)
    expect(report.payload.rows?.[0]?.level).toBe('high')
    expect(report.payload.actions?.[0]?.kind).toBe('create-task')
    // The fence itself never leaks into a bubble.
    for (const item of folded.items) {
      if (item.kind === 'text') expect(item.text.includes('```dsh')).toBe(false)
    }
  })

  it('mixes a report with the v3 fences in one assistant message', () => {
    const draftFence = '```dsh\n{"v":3,"type":"form_draft","draftId":"d_1","revision":1,'
      + '"form":{"collection":"c","label":"采购单"},"title":"t",'
      + '"fields":[{"name":"n","label":"数量","value":"1","tier":"required","widget":"number"}]}\n```'
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: `先看报告。\n${reportFence}\n另有草稿。\n${draftFence}` }] } }, 1),
    ])
    expect(folded.items.map(item => item.kind)).toEqual(['text', 'report', 'text', 'task-card'])
  })

  it('degrades an over-limit report fence to the collapsed notice', () => {
    const overLimit = '```dsh\n{"v":3,"type":"report","id":"r_9","title":"超限","metrics":[]}\n```'
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: `报告来了。\n${overLimit}` }] } }, 1),
    ])
    expect(folded.degradedCards).toBe(1)
    expect(folded.items.map(item => item.kind)).toEqual(['text', 'degraded'])
  })

  it('folds away a legacy session-opening identity stamp line, keeping the rest of the message (W9-B2)', () => {
    const stamped = '【登录身份】buyer（采购员·蔡俊）——本行由系统注入：当前用户=buyer，查待办只看该用户的待办。'
    const folded = foldHistory([
      event('user/message', { content: [{ type: 'text', text: `${stamped}\n帮我登记采购单` }], source: { kind: 'user' } }, 0),
      event('user/message', { content: [{ type: 'text', text: stamped }], source: { kind: 'user' } }, 1),
      event('user/message', { content: [{ type: 'text', text: `第一行不是注入行\n${stamped}` }], source: { kind: 'user' } }, 2),
    ])
    // The first line's stamp folds away; the prose underneath still bubbles.
    const first = folded.items[0]
    if (first?.kind !== 'text') throw new Error('expected user text')
    expect(first.role).toBe('user')
    expect(first.text).toBe('帮我登记采购单')
    // A stamp-only message produces no bubble at all.
    expect(folded.items).toHaveLength(2)
    // Only a first-line stamp folds: the same text mid-message stays verbatim.
    const third = folded.items[1]
    if (third?.kind !== 'text') throw new Error('expected user text')
    expect(third.text).toBe(`第一行不是注入行\n${stamped}`)
  })

  it('keeps a hand-typed 【登录身份】 line without the injection tail visible (W9-R1)', () => {
    const folded = foldHistory([
      event('user/message', { content: [{ type: 'text', text: '【登录身份】foo' }], source: { kind: 'user' } }, 0),
    ])
    // The tail ——本行由系统注入 is the server-injection marker; without it the
    // line is the user's own words and its bubble stays.
    const first = folded.items[0]
    if (first?.kind !== 'text') throw new Error('expected user text')
    expect(first.role).toBe('user')
    expect(first.text).toBe('【登录身份】foo')
  })

  it('folds an identity-empty stamp and keeps a tail-only line verbatim (W9-R2)', () => {
    const emptyIdentity = '【登录身份】——本行由系统注入：当前用户=buyer。'
    const tailOnly = '——本行由系统注入：当前用户=buyer'
    const folded = foldHistory([
      event('user/message', { content: [{ type: 'text', text: `${emptyIdentity}\n帮我登记采购单` }], source: { kind: 'user' } }, 0),
      event('user/message', { content: [{ type: 'text', text: emptyIdentity }], source: { kind: 'user' } }, 1),
      event('user/message', { content: [{ type: 'text', text: tailOnly }], source: { kind: 'user' } }, 2),
    ])
    // The injection tail with nothing between the prefix still marks the
    // server-stamped sentence, so the first line folds and the prose bubbles.
    const first = folded.items[0]
    if (first?.kind !== 'text') throw new Error('expected user text')
    expect(first.text).toBe('帮我登记采购单')
    // The identity-empty stamp-only message produces no bubble; the tail-only
    // line lacks the 【登录身份】 prefix the server always writes, so it is
    // the user's own words and keeps its bubble.
    expect(folded.items).toHaveLength(2)
    const third = folded.items[1]
    if (third?.kind !== 'text') throw new Error('expected user text')
    expect(third.text).toBe(tailOnly)
  })

  it('retires a stale ask when a report follows it', () => {
    const askFence = '```dsh\n{"v":3,"type":"ask_choice","id":"choice_1","question":"登记成什么？",'
      + '"options":[{"label":"采购单","value":"hub_po"}]}\n```'
    const folded = foldHistory([
      event('assistant/message', { message: { content: [{ type: 'text', text: askFence }] } }, 1),
      event('assistant/message', { message: { content: [{ type: 'text', text: reportFence }] } }, 2),
      event('user/message', { content: [{ type: 'text', text: '是采购单' }], source: { kind: 'user' } }, 3),
    ])
    const ask = folded.items[0]
    if (ask?.kind !== 'ask') throw new Error('expected ask item')
    expect(ask.answered).toBeUndefined()
  })
})
