/**
 * ViewContextService.serve behavior with a stubbed runtime carrier: whitelist
 * dispatch, switch_view (built-in, needs a captured switch), auto-switch
 * before cross-view actions, executor failure mapping, and idempotent repeat
 * semantics (the executors are pure store writes; the serve layer adds no
 * extra state).
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientResponse, RpcReceipt } from '@deepseek-ai/dsh-api-remotes/client'
import { ViewContextService } from '../src/client/viewContextService.ts'
import type { ViewProviderEntry } from '../src/client/viewContextService.ts'

interface Answered {
  ok: boolean
  summary?: string
  message?: string
}

/** Minimal fake of PendingWait<'viewAction'>: payload + respond capturing the wire answer. */
function fakeWait(view: string, action: string, args: Record<string, unknown> = {}) {
  const answers: Answered[] = []
  const wait = {
    kind: 'viewAction' as const,
    key: `v:test-${String(answers.length)}`,
    sessionId: 's1' as SessionId,
    payload: { view, action, args } as never,
    respond: (result: ClientResponse['result']): Promise<RpcReceipt> => {
      answers.push(result.ok
        ? { ok: true, summary: (result.value as { summary: string }).summary }
        : { ok: false, message: result.error.message })
      return Promise.resolve({ accepted: true })
    },
  }
  return { wait: wait as never, answers }
}

async function service(entries: Partial<Parameters<ViewContextService['registerActions']>[0]> = {}) {
  const reports: unknown[] = []
  const api = {
    sessions: {
      viewStateReport: (payload: unknown): Promise<never> => {
        reports.push(payload)
        return Promise.resolve({ rpcId: 'r' as never, result: { ok: true, value: { accepted: true } } }) as never
      },
    },
  }
  const ctx = new Context()
  const svc = new ViewContextService(ctx, api as never)
  if (entries.view !== undefined && entries.actions !== undefined) {
    svc.registerActions({ view: entries.view, actions: entries.actions })
  }
  return { svc, reports, ctx }
}

describe('ViewContextService.serve', () => {
  it('dispatches a whitelisted action and answers with the executor summary', async () => {
    const calls: Array<Record<string, unknown>> = []
    const { svc } = await service({
      view: 'kg',
      actions: {
        set_type_filter: (args) => {
          calls.push(args)
          return { summary: `filtered:${(args['types'] as string[]).join('+')}` }
        },
      },
    })
    const { wait, answers } = fakeWait('kg', 'set_type_filter', { types: ['Supplier'] })
    await svc.serve(wait)
    expect(calls).toEqual([{ types: ['Supplier'] }])
    expect(answers).toEqual([{ ok: true, summary: 'filtered:Supplier' }])
  })

  it('fails loud for an unregistered action, naming the known set', async () => {
    const { svc } = await service({
      view: 'kg',
      actions: { set_type_filter: () => ({ summary: 'x' }) },
    })
    const { wait, answers } = fakeWait('kg', 'focus_entity', { entity: '海天味业' })
    await svc.serve(wait)
    expect(answers[0]?.ok).toBe(false)
    expect(String(answers[0]?.message)).toContain('set_type_filter')
  })

  it('serves switch_view through a captured live switch and fails without one', async () => {
    const { svc } = await service()
    const switched: string[] = []
    svc.publishViewSwitch((view) => { switched.push(view) })
    const okWait = fakeWait('kg', 'switch_view')
    await svc.serve(okWait.wait)
    expect(switched).toEqual(['kg'])
    expect(okWait.answers).toEqual([{ ok: true, summary: '已切换到视图 kg' }])
    const noSwitch = await service()
    const failWait = fakeWait('market', 'switch_view')
    await noSwitch.svc.serve(failWait.wait)
    expect(failWait.answers[0]?.ok).toBe(false)
    expect(String(failWait.answers[0]?.message)).toContain('没有可用的视图切换入口')
  })

  it('maps an executor throw into a readable failure answer', async () => {
    const { svc } = await service({
      view: 'kg',
      actions: { focus_entity: () => { throw new Error('当前画布中找不到实体「X」') } },
    })
    const { wait, answers } = fakeWait('kg', 'focus_entity', { entity: 'X' })
    await svc.serve(wait)
    expect(answers).toEqual([{ ok: false, message: '当前画布中找不到实体「X」' }])
  })

  it('auto-switches to the target view before executing a cross-view action', async () => {
    const switched: string[] = []
    const { svc } = await service({
      view: 'market',
      actions: { filter_category: () => ({ summary: 'ok' }) },
    })
    svc.publishViewSwitch((view) => { switched.push(view) })
    svc.reportActiveView('s1' as SessionId, 'kg')
    const { wait, answers } = fakeWait('market', 'filter_category', { category: '合规' })
    await svc.serve(wait)
    expect(switched).toEqual(['market'])
    expect(answers).toEqual([{ ok: true, summary: 'ok' }])
  })

  it('repeat serve with identical args yields an identical answer (idempotent surface)', async () => {
    let counter = 0
    const { svc } = await service({
      view: 'kg',
      actions: { clear_selection: () => { counter += 1; return { summary: 'cleared' } } },
    })
    const first = fakeWait('kg', 'clear_selection')
    const second = fakeWait('kg', 'clear_selection')
    await svc.serve(first.wait)
    await svc.serve(second.wait)
    expect(first.answers).toEqual([{ ok: true, summary: 'cleared' }])
    expect(second.answers).toEqual([{ ok: true, summary: 'cleared' }])
  })

  it('reports the registered action catalog so the host gate follows', async () => {
    vi.useFakeTimers()
    try {
      const { svc, reports } = await service({
        view: 'kg',
        actions: { focus_entity: () => ({ summary: 'x' }), set_type_filter: () => ({ summary: 'y' }) },
      })
      svc.provide({ view: 'kg', snapshot: () => ({}) } satisfies ViewProviderEntry)
      svc.reportActiveView('s1' as SessionId, 'kg')
      await vi.advanceTimersByTimeAsync(500)
      expect(reports[0]).toMatchObject({ actions: { kg: ['focus_entity', 'set_type_filter'] } })
    } finally {
      vi.useRealTimers()
    }
  })
})
