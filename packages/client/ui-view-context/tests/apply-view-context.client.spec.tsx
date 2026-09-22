// @vitest-environment jsdom
/**
 * The browser-half apply on the real machinery stack (Cordis Context +
 * SlotRegistry + renderer + TestSessions): the service seat, the dictionary
 * registration, the three keyed toolview claims, the header capture rider
 * mounted through its slot (publish → switchView → setView, revoke on
 * unmount/re-render), and the executor loop draining real PendingWait
 * carriers out of the session snapshot.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { PendingWait } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConversationSnapshot, PendingInteraction, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientResponse, RpcId, RpcReceipt } from '@deepseek-ai/dsh-api-remotes/client'
import { apply, inject } from '../src/client/index.ts'
import { ViewContextService } from '../src/client/viewContextService.ts'

const SID = 's1' as SessionId

/** Mint a real view-action carrier whose respond arm records the wire answer. */
function viewActionWait(rpcId: string, view: string, action: string, args: Record<string, unknown> = {}) {
  const answers: ClientResponse['result'][] = []
  const respond = (message: ClientResponse): Promise<RpcReceipt> => {
    answers.push(message.result)
    return Promise.resolve({ accepted: true })
  }
  const wait = new PendingWait('viewAction', rpcId as RpcId, SID, { view, action, args }, respond)
  return { wait, answers }
}

/** Question-kind carrier: the loop must skip it without touching respond. */
function questionWait(rpcId: string) {
  const respond = vi.fn((): Promise<RpcReceipt> => Promise.resolve({ accepted: true }))
  return { wait: new PendingWait('question', rpcId as RpcId, SID, {} as never, respond), respond }
}

async function bench() {
  const runtime = await SlotTestRuntime.create()
  const reports: unknown[] = []
  runtime.provide('connection', {
    api: {
      sessions: {
        viewStateReport: (payload: unknown): Promise<never> => {
          reports.push(payload)
          return Promise.resolve({ rpcId: 'r' as never, result: { ok: true, value: { accepted: true } } }) as never
        },
      },
    },
  })
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.sessions.add({ id: SID })
  await runtime.declare({
    'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    'tool.call.toolview': { kind: 'keyed', scope: 'session' },
  })
  const feature = await runtime.mount({ inject: [...inject], apply })
  const svc = runtime.ctx.get('viewContext') as ViewContextService
  return { runtime, feature, svc, reports }
}

afterEach(() => {
  cleanup()
})

describe('view-context browser half on the real stack', () => {
  it('mounts the service seat, the dictionary, and the three keyed toolview claims', async () => {
    const b = await bench()
    expect(b.runtime.ctx.get('viewContext')).toBeInstanceOf(ViewContextService)
    expect(b.runtime.slots.entries('tool.call.toolview').map(e => e.options.key))
      .toEqual(['switch_view', 'view_apply', 'view_state_get'])
    const header = b.runtime.slots.entries('conversation.session.header.actions')
    expect(header.map(e => e.options.id)).toContain('view-context')
    // Every claim carries this package's locale namespace (entry-level seat).
    for (const entry of [
      ...b.runtime.slots.entries('tool.call.toolview'),
      ...header,
    ]) {
      expect(entry.locale).toBe('viewContext')
    }
    await b.runtime.dispose()
  })

  it('the mounted capture rider carries switchView to the owner setView and revokes on owner change', async () => {
    const b = await bench()
    const setView = vi.fn()
    const view = b.runtime.renderSlot('conversation.session.header.actions', { setView })
    expect(b.svc.switchView('kg')).toBe(true)
    expect(setView).toHaveBeenCalledWith('kg')
    // The owner re-renders without a switch (a header that dropped the ring):
    // the rider revokes, and later switches are refused rather than lost.
    view.update({ setView: undefined })
    expect(b.svc.switchView('kg')).toBe(false)
    await b.runtime.dispose()
  })

  it('the executor loop serves pending view-action waits from the live snapshot', async () => {
    const b = await bench()
    b.svc.registerActions({ view: 'kg', actions: { set_type_filter: () => ({ summary: 'filtered' }) } })
    const first = viewActionWait('rpc-1', 'kg', 'set_type_filter', { types: ['Supplier'] })
    await b.runtime.sessions.updateSnapshot(SID, (draft: ConversationSnapshot) => {
      (draft.pending as PendingInteraction[]).push(first.wait)
    })
    await vi.waitFor(() => {
      expect(first.answers).toEqual([{
        ok: true,
        value: { sessionId: SID, summary: 'filtered' },
      }])
    })
    // A later frame on the same session is drained through the subscription.
    const second = viewActionWait('rpc-2', 'kg', 'set_type_filter')
    await b.runtime.sessions.updateSnapshot(SID, (draft: ConversationSnapshot) => {
      (draft.pending as PendingInteraction[]).push(second.wait)
    })
    await vi.waitFor(() => {
      expect(second.answers).toHaveLength(1)
    })
    await b.runtime.dispose()
  })

  it('the loop leaves non-view-action waits to their own consumers', async () => {
    const b = await bench()
    const question = questionWait('rpc-q')
    await b.runtime.sessions.updateSnapshot(SID, (draft: ConversationSnapshot) => {
      (draft.pending as PendingInteraction[]).push(question.wait)
    })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(question.respond).not.toHaveBeenCalled()
    await b.runtime.dispose()
  })

  it('unmounting the feature releases both slot claims and the service seat', async () => {
    const b = await bench()
    await b.feature.dispose()
    expect(b.runtime.slots.entries('tool.call.toolview')).toHaveLength(0)
    expect(b.runtime.slots.entries('conversation.session.header.actions')).toHaveLength(0)
    await b.runtime.dispose()
  })
})
