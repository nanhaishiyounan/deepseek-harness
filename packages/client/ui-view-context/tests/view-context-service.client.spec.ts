/**
 * ViewContextService behavior with a stub connection api: provider registry,
 * debounced session.viewStateReport uplink, active-view publication, and
 * chat/unknown-view minimal projection. No renderer machinery.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcResponse } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { ViewContextService } from '../src/client/viewContextService.ts'

interface Recorded {
  sessionId: unknown
  view: string
  label?: string
  snapshot: unknown
  actions: Record<string, string[]>
}

function stubApi() {
  const reports: Recorded[] = []
  const api = {
    sessions: {
      viewStateReport: (payload: unknown): Promise<RpcResponse<{ accepted: true }>> => {
        const { sessionId, view, label, snapshot, actions } = payload as Recorded
        reports.push({ sessionId, view, ...label === undefined ? {} : { label }, snapshot, actions })
        return Promise.resolve({ rpcId: 'r' as never, result: { ok: true, value: { accepted: true } } })
      },
    },
  }
  return { api: api as unknown as ConnectionHandle['api'], reports }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ViewContextService', () => {
  it('reports the active view with its provider projection after the debounce', async () => {
    const { api, reports } = stubApi()
    const ctx = new Context()
    const service = new ViewContextService(ctx, api)
    service.provide({
      view: 'kg',
      label: () => '知识图谱',
      snapshot: () => ({ '选中实体': '海天味业', '类型过滤': ['Supplier'] }),
    })
    service.reportActiveView('s1' as SessionId, 'kg')
    expect(reports).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(500)
    expect(reports).toEqual([{
      sessionId: 's1' as SessionId,
      view: 'kg',
      label: '知识图谱',
      snapshot: { '选中实体': '海天味业', '类型过滤': ['Supplier'] },
      actions: {},
    }])
  })

  it('coalesces rapid changes into one report reading the latest state', async () => {
    const { api, reports } = stubApi()
    const ctx = new Context()
    const service = new ViewContextService(ctx, api)
    let value = 1
    service.provide({ view: 'kg', snapshot: () => ({ n: value }) })
    service.reportActiveView('s1' as SessionId, 'kg')
    await vi.advanceTimersByTimeAsync(300)
    value = 2
    service.notify()
    await vi.advanceTimersByTimeAsync(500)
    expect(reports).toHaveLength(1)
    expect(reports[0]?.snapshot).toEqual({ n: 2 })
  })

  it('falls back to the minimal empty snapshot for chat and unregistered views', async () => {
    const { api, reports } = stubApi()
    const ctx = new Context()
    const service = new ViewContextService(ctx, api)
    service.reportActiveView('s1' as SessionId, 'chat')
    await vi.advanceTimersByTimeAsync(500)
    expect(reports[0]?.view).toBe('chat')
    expect(reports[0]?.snapshot).toEqual({})
    expect('label' in (reports[0] as Recorded)).toBe(false)
  })

  it('does not report before any active view is published', async () => {
    const { api, reports } = stubApi()
    const ctx = new Context()
    const service = new ViewContextService(ctx, api)
    service.provide({ view: 'kg', snapshot: () => ({}) })
    await vi.advanceTimersByTimeAsync(500)
    expect(reports).toHaveLength(0)
  })

  it('swallows uplink transport failures without throwing', async () => {
    const api = {
      sessions: {
        viewStateReport: () => Promise.reject(new Error('offline')),
      },
    } as unknown as ConnectionHandle['api']
    const ctx = new Context()
    const service = new ViewContextService(ctx, api)
    service.reportActiveView('s1' as SessionId, 'kg')
    await vi.advanceTimersByTimeAsync(500)
    await Promise.resolve()
  })

  it('disposes providers: the disposer removes the projection', async () => {
    const { api, reports } = stubApi()
    const ctx = new Context()
    const service = new ViewContextService(ctx, api)
    const dispose = service.provide({ view: 'kg', label: () => '知识图谱', snapshot: () => ({ a: 1 }) })
    dispose()
    service.reportActiveView('s1' as SessionId, 'kg')
    await vi.advanceTimersByTimeAsync(500)
    expect(reports[0]?.snapshot).toEqual({})
  })
})
