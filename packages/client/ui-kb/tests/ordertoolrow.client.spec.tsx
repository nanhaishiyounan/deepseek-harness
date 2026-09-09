// @vitest-environment jsdom
// The order_create/order_status toolview rows: the render matrix over frozen
// call slices — the running subject summary, the settled order receipt (with
// the deliverable path) off the presentation meta, the status counts, the
// error row's first result line, and the expanded raw receipt text.

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { OrderToolRow } from '../src/client/toolviews/OrderToolRow.tsx'
import { orderRowModel } from '../src/client/toolviews/order-tool-model.ts'
import { zh } from '../src/client/locales.ts'
import { SESSION_KIT } from './kb-fixture.client.ts'

/** The zh dictionary as the row's t (params rendered the way the runtime does). */
const t = ((key: string, params?: Record<string, string | number>) => {
  const template = zh[key as keyof typeof zh]
  if (template === undefined) return key
  return template.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}) as never

/** A running order tool call. */
function running(toolName: 'order_create' | 'order_status', argsRaw: string): ToolCallBlock {
  return {
    callId: 'c1', name: toolName, argsRaw, turn: 1, step: 1, time: 1,
    callView: null, subCalls: [],
  }
}

/** A settled order tool result. */
function settled(toolName: 'order_create' | 'order_status', options: {
  argsRaw?: string
  content?: readonly { type: 'text'; text: string }[]
  isError?: boolean
  error?: { name: string; code: string }
  meta?: unknown
}): ToolCallBlock {
  return {
    kind: 'tool-result', seq: 2, time: 2, callId: 'c1',
    call: options.argsRaw === undefined ? null : { name: toolName, argsRaw: options.argsRaw },
    callTime: 1,
    content: options.content ?? [],
    isError: options.isError ?? false,
    ...options.error === undefined ? {} : { error: options.error },
    ...options.meta === undefined ? {} : { meta: options.meta },
    callView: null, resultView: null, subCalls: [],
  }
}

/** The create receipt exactly as formatOrderCreateOutput renders it. */
const CREATE_OUTPUT = [
  '订单已创建并完成生成：ORD-20260905-00a1',
  '- 服务：海外仓风险应对咨询',
  '- 状态：已交付',
  '- 方案 PDF：workspace/deliverables/ORD-20260905-00a1.pdf',
].join('\n')

/** The status listing exactly as formatOrderStatusOutput renders it. */
const STATUS_OUTPUT = '- ORD-20260905-00a1（海外仓风险应对咨询）：已交付，方案 PDF：workspace/deliverables/ORD-20260905-00a1.pdf'

function mount(toolName: 'order_create' | 'order_status', block: ToolCallBlock): void {
  render(<OrderToolRow {...SESSION_KIT} toolName={toolName} callId="c1" block={block} openFile={() => {}} t={t} />)
}

afterEach(cleanup)

describe('orderRowModel', () => {
  it('derives the create receipt off the presentation meta', () => {
    const model = orderRowModel(settled('order_create', {
      argsRaw: '{"service_id":"expert_services/2","brief":"海外仓应急。"}',
      content: [{ type: 'text', text: CREATE_OUTPUT }],
      meta: { order_no: 'ORD-20260905-00a1', status: 'delivered', service_name: '海外仓风险应对咨询' },
    }), 'order_create')
    expect(model).toMatchObject({
      state: 'ok',
      subject: 'expert_services/2',
      receipt: 'ORD-20260905-00a1 · 海外仓风险应对咨询 — delivered',
      counts: null,
      errorSummary: null,
    })
  })

  it('derives the status counts off the presentation meta', () => {
    const model = orderRowModel(settled('order_status', {
      argsRaw: '{"order_id":1}',
      content: [{ type: 'text', text: STATUS_OUTPUT }],
      meta: { orders: 1, delivered: 1 },
    }), 'order_status')
    expect(model.subject).toBe('1')
    expect(model.receipt).toBeNull()
    expect(model.counts).toBe('1 / 1')
  })

  it('rejects every malformed meta and missing-arg shape', () => {
    // create meta: non-object, array, blank or wrong-typed fields.
    for (const meta of [undefined, null, [], { order_no: 7 }, { order_no: '', status: 'delivered', service_name: 's' },
      { order_no: 'ORD-1', status: '', service_name: 's' }, { order_no: 'ORD-1', status: 'delivered', service_name: '' }]) {
      expect(orderRowModel(settled('order_create', { meta }), 'order_create').receipt).toBeNull()
    }
    // status meta: non-object, array, fractional, negative, wrong-typed.
    for (const meta of [undefined, null, [], { orders: 'x', delivered: 0 }, { orders: 1.5, delivered: 0 }, { orders: -1, delivered: 0 },
      { orders: 1, delivered: 'x' }, { orders: 1, delivered: -2 }]) {
      expect(orderRowModel(settled('order_status', { meta }), 'order_status').counts).toBeNull()
    }
    // Subjects degrade to blank on missing or wrong-typed args.
    expect(orderRowModel(settled('order_create', {}), 'order_create').subject).toBe('')
    expect(orderRowModel(settled('order_create', { argsRaw: '{"brief":"b"}' }), 'order_create').subject).toBe('')
    expect(orderRowModel(settled('order_status', {}), 'order_status').subject).toBe('')
    expect(orderRowModel(settled('order_status', { argsRaw: '{"order_id":"x"}' }), 'order_status').subject).toBe('')
    // The cross-tool meta never crosses: a create meta on a status row stays null, and vice versa.
    expect(orderRowModel(settled('order_status', { meta: { order_no: 'ORD-1', status: 'delivered', service_name: 's' } }), 'order_status').receipt).toBeNull()
    expect(orderRowModel(settled('order_create', { meta: { orders: 1, delivered: 1 } }), 'order_create').counts).toBeNull()
  })

  it('degrades to the subject when the meta does not validate', () => {
    const create = orderRowModel(settled('order_create', { argsRaw: '{"service_id":"expert_services/2","brief":"b"}', meta: { order_no: 7 } }), 'order_create')
    expect(create.receipt).toBeNull()
    expect(create.subject).toBe('expert_services/2')
    const status = orderRowModel(settled('order_status', { meta: { orders: 'x', delivered: 0 } }), 'order_status')
    expect(status.counts).toBeNull()
  })

  it('carries the error state with the first result line', () => {
    const model = orderRowModel(settled('order_create', {
      isError: true,
      content: [{ type: 'text', text: 'ORDERS_SOURCE_UNAVAILABLE: no NocoBase source\nsecond line' }],
    }), 'order_create')
    expect(model.state).toBe('error')
    expect(model.errorSummary).toBe('ORDERS_SOURCE_UNAVAILABLE: no NocoBase source')
  })
})

describe('OrderToolRow', () => {
  it('renders the running create row titled with the service id summary', () => {
    mount('order_create', running('order_create', '{"service_id":"expert_services/2","brief":"海外仓应急。"}'))
    expect(screen.getByText(zh['tool.orderCreateTitle'])).toBeDefined()
    expect(screen.getByText('expert_services/2')).toBeDefined()
  })

  it('renders the settled create receipt and expands the raw deliverable text', () => {
    mount('order_create', settled('order_create', {
      argsRaw: '{"service_id":"expert_services/2","brief":"海外仓应急。"}',
      content: [{ type: 'text', text: CREATE_OUTPUT }],
      meta: { order_no: 'ORD-20260905-00a1', status: 'delivered', service_name: '海外仓风险应对咨询' },
    }))
    expect(screen.getByText('ORD-20260905-00a1 · 海外仓风险应对咨询 — delivered')).toBeDefined()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/订单已创建并完成生成：ORD-20260905-00a1/u)).toBeDefined()
    expect(screen.getByText(/方案 PDF：workspace\/deliverables\/ORD-20260905-00a1\.pdf/u)).toBeDefined()
  })

  it('renders the settled status row with the counts summary', () => {
    mount('order_status', settled('order_status', {
      argsRaw: '{"order_id":1}',
      content: [{ type: 'text', text: STATUS_OUTPUT }],
      meta: { orders: 1, delivered: 1 },
    }))
    expect(screen.getByText(zh['tool.orderStatusTitle'])).toBeDefined()
    expect(screen.getByText('1 / 1')).toBeDefined()
  })

  it('renders an error row with the failure dot and first result line', () => {
    mount('order_create', settled('order_create', {
      isError: true,
      content: [{ type: 'text', text: 'ORDERS_SOURCE_UNAVAILABLE: no NocoBase source' }],
    }))
    expect(screen.getByText('ORDERS_SOURCE_UNAVAILABLE: no NocoBase source')).toBeDefined()
    cleanup()
    // A settled failure with an error object (stopped) keeps the summary blank.
    mount('order_status', settled('order_status', { isError: true, error: { name: 'ToolError', code: 'interrupted' } }))
    expect(screen.getByRole('button', { name: /订单状态查询/u })).toBeTruthy()
  })

  it('keeps the row collapsed and disabled without result text', () => {
    mount('order_create', settled('order_create', { isError: true }))
    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})
