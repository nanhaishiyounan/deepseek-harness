/**
 * The orders domain's deployment-side gates and thin forwarding: every
 * method refuses with `orders-not-composed` when no orders capability is
 * composed, writes refuse until `ordersEnabled` opts in, reads forward onto
 * the seam, unknown orders answer `orders-rejected`, and the host-only
 * deliverable download answers the PDF attachment (or inline disposition for
 * in-page preview, both with nosniff/no-store) and 404 for the seam's
 * missing/undelivered/lost-file codes.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ViewActionService from '@deepseek-ai/dsh-view-actions'
import { createApiProxy } from '../src/api-proxy.ts'
import { toFetchHandler } from '../src/fetch/handler.ts'
import type { RpcRequest } from '../src/api/rpc.ts'
import type { OrderDeliverableFile, OrderRecord } from '@deepseek-ai/dsh-expert-orders'

/** One stored order row the seam stub serves (camelCase, as the seam stores it). */
function orderRow(over: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 7,
    orderNo: 'ORD-20260905-00a1',
    serviceId: 'expert_services/2',
    serviceName: '海外仓风险应对咨询',
    price: '¥6,800/份',
    brief: '海外仓被炸后的库存转移方案。',
    clientName: '漯河宏发食品有限公司',
    expertName: '张红喜',
    expertOrg: '漯河市电子商务协会（会长）',
    status: 'pending',
    createdAt: '2026-09-05T08:00:00.000Z',
    ...over,
  }
}

/** An orders-seam stub recording every forwarded call. */
function ordersStub(options: { deliverable?: OrderDeliverableFile } = {}) {
  const calls: string[] = []
  const orders = {
    create: vi.fn(async (request: { serviceId: string; brief: string }) => {
      calls.push(`create:${request.serviceId}`)
      return orderRow()
    }),
    get: vi.fn(async (orderId: number) => {
      calls.push(`get:${orderId}`)
      return orderId === 7 ? orderRow() : undefined
    }),
    list: vi.fn(async () => {
      calls.push('list')
      return [orderRow(), orderRow({ id: 8, status: 'delivered', deliverablePath: 'workspace/deliverables/ORD-20260905-00a1.pdf' })]
    }),
    fulfill: vi.fn(async (orderId: number) => {
      calls.push(`fulfill:${orderId}`)
      return orderRow({ id: orderId, status: 'delivered', deliverablePath: 'workspace/deliverables/ORD-20260905-00a1.pdf', generatedAt: '2026-09-05T09:00:00.000Z' })
    }),
    readDeliverable: vi.fn(async (orderId: number) => {
      calls.push(`deliverable:${orderId}`)
      if (options.deliverable === undefined) {
        const failure = new Error('order 9 is "pending"; no deliverable has landed yet') as Error & { code?: string }
        failure.code = 'ORDERS_NOT_DELIVERED'
        throw failure
      }
      return options.deliverable
    }),
  }
  return { orders, calls }
}

async function harness(defaults: { ordersEnabled?: boolean; deliverable?: OrderDeliverableFile } = {}) {
  const stub = ordersStub(defaults.deliverable === undefined ? {} : { deliverable: defaults.deliverable })
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ViewActionService)
  await ctx.plugin(AgentRegistry)
  ctx.provide('orders', stub.orders as never)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    saveDefaultModelSelection: async () => {},
    cwd: '/tmp',
    kbTenant: 'demo-food-co',
    ...defaults.ordersEnabled === undefined ? {} : { ordersEnabled: defaults.ordersEnabled },
  })
  return { api, calls: stub.calls, ctx }
}

/** One typed RPC request envelope. */
function request<P>(rpcId: string, payload: P): RpcRequest<P> {
  return { rpcId: rpcId as never, payload }
}

afterEach(() => {
  // Each case disposes its own context; nothing leaks across them.
})

describe('orders domain gates and forwarding', () => {
  it('refuses every method with orders-not-composed when no orders capability is composed', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { persona: '' })
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(ViewActionService)
    await ctx.plugin(AgentRegistry)
    const api = createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      saveDefaultModelSelection: async () => {},
      cwd: '/tmp',
      kbTenant: 'demo-food-co',
      ordersEnabled: true,
    })
    for (const refused of [
      await api.orders.create(request('r', { service_id: 'expert_services/2', brief: 'b' })),
      await api.orders.get(request('r', { order_id: 7 })),
      await api.orders.list(request('r', {})),
      await api.orders.fulfill(request('r', { order_id: 7 })),
    ]) {
      expect(refused.result).toMatchObject({ ok: false, error: { code: 'orders-not-composed' } })
    }
    const download = await api.orders.download({ orderId: 7 }, new AbortController().signal)
    expect(download.status).toBe(500)
    await ctx.fiber.dispose()
  })

  it('refuses writes until ordersEnabled opts in while reads forward', async () => {
    const { api, calls, ctx } = await harness({})
    const refused = await api.orders.create(request('r', { service_id: 'expert_services/2', brief: 'b' }))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'orders-write-disabled' } })
    const fulfillRefused = await api.orders.fulfill(request('r', { order_id: 7 }))
    expect(fulfillRefused.result).toMatchObject({ ok: false, error: { code: 'orders-write-disabled' } })
    const listed = await api.orders.list(request('r', {}))
    expect(listed.result.ok).toBe(true)
    expect(calls).toEqual(['list'])
    await ctx.fiber.dispose()
  })

  it('forwards writes after the opt-in and projects rows onto the wire view', async () => {
    const { api, calls, ctx } = await harness({ ordersEnabled: true })
    const created = await api.orders.create(request('r', { service_id: 'expert_services/2', brief: '海外仓应急。', client_name: '漯河宏发食品有限公司' }))
    expect(created.result).toMatchObject({
      ok: true,
      value: {
        id: 7,
        order_no: 'ORD-20260905-00a1',
        service_name: '海外仓风险应对咨询',
        price: '¥6,800/份',
        client_name: '漯河宏发食品有限公司',
        expert_name: '张红喜',
        status: 'pending',
        created_at: '2026-09-05T08:00:00.000Z',
      },
    })
    const fulfilled = await api.orders.fulfill(request('r', { order_id: 7 }))
    expect(fulfilled.result).toMatchObject({ ok: true, value: { status: 'delivered', deliverable_path: 'workspace/deliverables/ORD-20260905-00a1.pdf' } })
    const single = await api.orders.get(request('r', { order_id: 7 }))
    expect(single.result.ok).toBe(true)
    const unknown = await api.orders.get(request('r', { order_id: 99 }))
    expect(unknown.result).toMatchObject({ ok: false, error: { code: 'orders-rejected' } })
    expect(calls).toEqual(['create:expert_services/2', 'fulfill:7', 'get:7', 'get:99'])
    await ctx.fiber.dispose()
  })

  it('streams the deliverable PDF as an attachment and answers the seam 404 codes', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    const { api, ctx } = await harness({ ordersEnabled: true, deliverable: { path: 'workspace/deliverables/ORD-20260905-00a1.pdf', bytes } })
    const download = await api.orders.download({ orderId: 7 }, new AbortController().signal)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('application/pdf')
    expect(download.headers.get('content-disposition')).toBe('attachment; filename="ORD-20260905-00a1.pdf"')
    expect(download.headers.get('x-content-type-options')).toBe('nosniff')
    expect(download.headers.get('cache-control')).toBe('private, no-store')
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes)
    await ctx.fiber.dispose()

    const pending = await harness({ ordersEnabled: true })
    const refusal = await pending.api.orders.download({ orderId: 9 }, new AbortController().signal)
    expect(refusal.status).toBe(404)
    await pending.ctx.fiber.dispose()
  })

  it('answers inline disposition for in-page PDF preview with the same filename and hardening headers', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    const { api, ctx } = await harness({ ordersEnabled: true, deliverable: { path: 'workspace/deliverables/ORD-20260905-00a1.pdf', bytes } })
    const download = await api.orders.download({ orderId: 7, inline: true }, new AbortController().signal)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('application/pdf')
    expect(download.headers.get('content-disposition')).toBe('inline; filename="ORD-20260905-00a1.pdf"')
    expect(download.headers.get('x-content-type-options')).toBe('nosniff')
    expect(download.headers.get('cache-control')).toBe('private, no-store')
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes)
    await ctx.fiber.dispose()
  })

  it('routes inline and attachment downloads through the fetch carrier for GET and HEAD', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    const { api, ctx } = await harness({ ordersEnabled: true, deliverable: { path: 'workspace/deliverables/ORD-20260905-00a1.pdf', bytes } })
    const handler = toFetchHandler(api)

    const inline = await handler.fetch(new Request('http://host/api/orders.download?orderId=7&inline=1'))
    expect(inline.status).toBe(200)
    expect(inline.headers.get('content-disposition')).toBe('inline; filename="ORD-20260905-00a1.pdf"')
    expect(inline.headers.get('x-content-type-options')).toBe('nosniff')
    expect(inline.headers.get('cache-control')).toBe('private, no-store')

    const attached = await handler.fetch(new Request('http://host/api/orders.download?orderId=7'))
    expect(attached.status).toBe(200)
    expect(attached.headers.get('content-disposition')).toBe('attachment; filename="ORD-20260905-00a1.pdf"')
    expect(attached.headers.get('x-content-type-options')).toBe('nosniff')

    const head = await handler.fetch(new Request('http://host/api/orders.download?orderId=7&inline=1', { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(head.body).toBeNull()
    expect(head.headers.get('content-disposition')).toBe('inline; filename="ORD-20260905-00a1.pdf"')
    await ctx.fiber.dispose()
  })
})
