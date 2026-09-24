// @vitest-environment jsdom
/**
 * The session-list projection unit tests: each item kind's one-line subtitle
 * (C1) — the receipt ticket face, the open ask, the draft under review, the
 * clipped bubbles — and the cache's updatedAt stamping.
 */

import { describe, expect, it, vi } from 'vitest'
import type { ChatItem } from '../src/client/fold.ts'
import { cachedProjectionOf, lastProjectionOf, loadProjection } from '../src/client/messages/projection.ts'

/** One folded text item. */
const text = (role: 'user' | 'assistant', body: string): ChatItem => ({
  kind: 'text', seq: 1, time: 1, role, text: body,
})

const ask = (answered: boolean): ChatItem => ({
  kind: 'ask',
  seq: 2,
  time: 1,
  payload: {
    v: 3, type: 'ask_choice', id: 'a1', mode: 'single', variant: 'cards',
    question: '这笔要登记成什么单据？', options: [{ label: '采购单', value: 'po' }], allowFreeText: true,
  },
  ...(answered ? { answered: {} } : {}),
})

describe('last projection of one session', () => {
  it('projects the receipt as the ticket face', () => {
    const item: ChatItem = {
      kind: 'receipt', seq: 3, time: 1,
      payload: {
        v: 3, type: 'submit_receipt', draftId: 'd1',
        form: { collection: 'hub_po_purchase_orders', label: '采购单' },
        rowId: '1042',
        summary: [{ label: '合计金额', value: '¥4,500', kind: 'money' }],
      },
    }
    expect(lastProjectionOf([text('user', '帮我登记'), item])).toBe('已登记 №1042 · 采购单')
  })

  it('projects an open ask and skips the answered one', () => {
    expect(lastProjectionOf([ask(false)])).toBe('等你选择：这笔要登记成什么单据？')
    expect(lastProjectionOf([ask(true), text('user', '就用采购单')])).toBe('我：就用采购单')
  })

  it('projects a report as its title line', () => {
    const report: ChatItem = {
      kind: 'report', seq: 2, time: 1,
      payload: {
        v: 3, type: 'report', id: 'r_1', title: '项目风险',
        metrics: [{ label: '待处理', value: '5', kind: 'count' }],
      },
    }
    expect(lastProjectionOf([text('user', '有什么风险'), report])).toBe('报告：项目风险')
  })

  it('projects the draft under review and the actions', () => {
    const draft: ChatItem = {
      kind: 'task-card', seq: 1, time: 1,
      draft: { collection: 'hub_po_orders', title: '采购单', fields: {} },
      payload: {
        v: 3, type: 'form_draft', draftId: 'd1', revision: 1,
        form: { collection: 'hub_po_orders', label: '采购单' }, title: '鲜丰采购',
        fields: [{ name: 'quantity', label: '数量', value: '200', tier: 'required', widget: 'number' }],
      },
    }
    expect(lastProjectionOf([draft])).toBe('正在确认采购单草稿')
    const action: ChatItem = { kind: 'action', seq: 2, time: 1, action: 'confirm', text: '确认写入' }
    expect(lastProjectionOf([draft, action])).toBe('确认写入，等待落库')
  })

  it('projects an open field-ask, skips the answered one, and the reject action', () => {
    const fieldAsk: ChatItem = {
      kind: 'field-ask', seq: 3, time: 1,
      payload: {
        v: 3, type: 'ask_field', id: 'f1', question: '数量是多少？',
        field: { name: 'quantity', label: '数量', widget: 'number', suggestions: [] },
      },
    }
    expect(lastProjectionOf([fieldAsk])).toBe('等你选择：数量是多少？')
    expect(lastProjectionOf([{ ...fieldAsk, answered: {} }, text('user', '大概 260 箱')])).toBe('我：大概 260 箱')
    const reject: ChatItem = { kind: 'action', seq: 4, time: 1, action: 'reject', text: '驳回' }
    expect(lastProjectionOf([reject])).toBe('已驳回')
  })

  it('skips an answered ask on the way back and projects the v2 legacy card title', () => {
    expect(lastProjectionOf([text('user', '就用采购单'), ask(true)])).toBe('我：就用采购单')
    const legacy: ChatItem = { kind: 'task-card', seq: 5, time: 1, draft: { collection: 'hub_po_orders', title: '采购单', fields: {} } }
    expect(lastProjectionOf([legacy])).toBe('采购单草稿待确认')
  })

  it('clips long bubbles and projects nothing for tool rows alone', () => {
    expect(lastProjectionOf([text('assistant', '这是一段非常长的回答内容需要被截断处理才能放进列表摘要行里不撑破布局')]))
      .toBe('这是一段非常长的回答内容需要被截断处理才能放进列…')
    expect(lastProjectionOf([{ kind: 'tool', seq: 1, time: 1, name: 'nb_list', label: '查询业务记录', state: 'done' }])).toBeUndefined()
    expect(lastProjectionOf([])).toBeUndefined()
  })

  it('strips markdown decorations from a projected bubble', () => {
    expect(lastProjectionOf([text('assistant', '# 张红喜是谁 | 项目 | 内容 | |---|---|')]))
      .toBe('张红喜是谁 项目 内容')
    expect(lastProjectionOf([text('assistant', '收到一项明细：**大豆油 / 1000kg**，已找到 `采购单` 表')]))
      .toBe('收到一项明细：大豆油 / 1000kg，已找到 …')
  })
})

describe('the projection cache', () => {
  it('serves a hit only at the matching updatedAt stamp', async () => {
    expect(cachedProjectionOf('cache-1', 10)).toBeUndefined()
    // The stubbed global fetch answers one history window, echoing the rpcId.
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string }
      return new Response(JSON.stringify({
        rpcId: request.rpcId,
        result: { ok: true, value: { events: [
          { event: { type: 'assistant/message', seq: 1, time: 1, data: { message: { content: [{ type: 'text', text: '回答原文' }] } } } },
        ] } },
      }), { status: 200 })
    }))
    await expect(loadProjection('cache-1', 10)).resolves.toBe('回答原文')
    expect(cachedProjectionOf('cache-1', 10)).toBe('回答原文')
    expect(cachedProjectionOf('cache-1', 11)).toBeUndefined()
    vi.unstubAllGlobals()
  })
})
