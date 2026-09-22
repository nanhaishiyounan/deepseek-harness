// @vitest-environment jsdom
/**
 * The apply-owned view-action executor loop against a hand-driven sessions
 * double on a real Cordis Context: the branches the real TestSessions cannot
 * stage — the bounded backoff before a just-created session's binding record
 * appears, the attempt ceiling, session switches dropping the old
 * subscription, in-flight key suppression, and effect teardown — plus the
 * slots-inject contribution shapes (header rider + the three generator-yielded
 * toolview claims).
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PendingWait } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientResponse, RpcId, RpcReceipt } from '@deepseek-ai/dsh-api-remotes/client'
import { apply } from '../src/client/index.ts'
import { ViewContextService } from '../src/client/viewContextService.ts'
import { en, zh } from '../src/client/locales.ts'

const S1 = 's1' as SessionId
const S2 = 's2' as SessionId

/** One session's carrier: mutable pending list plus its drain subscribers. */
interface SessionCell {
  pending: unknown[]
  listeners: Set<() => void>
}

interface FakeBench {
  ctx: Context
  svc: ViewContextService
  cells: Map<string, SessionCell>
  registered: Array<Record<string, unknown>>
  localeRegister: ReturnType<typeof vi.fn>
  /** Publish a new current session the way the list store would. */
  setCurrent: (id: SessionId | undefined) => void
  /** Fire the cell's snapshot listeners (the session store change event). */
  notifySession: (id: string) => void
  listListeners: Set<() => void>
}

function fakeBench(initialCurrent: SessionId | undefined): FakeBench {
  const cells = new Map<string, SessionCell>()
  const listListeners = new Set<() => void>()
  const registered: Array<Record<string, unknown>> = []
  const localeRegister = vi.fn(() => () => {})
  let current = initialCurrent

  const sessions = {
    list: {
      subscribe: (fn: () => void): (() => void) => {
        listListeners.add(fn)
        return () => { listListeners.delete(fn) }
      },
      getSnapshot: (): { current: SessionId | undefined } => ({ current }),
    },
    binding: (id: string) => {
      const cell = cells.get(id)
      if (cell === undefined) return undefined
      return {
        session: {
          getSnapshot: (): { pending: unknown[] } => ({ pending: cell.pending }),
          subscribe: (fn: () => void): (() => void) => {
            cell.listeners.add(fn)
            return () => { cell.listeners.delete(fn) }
          },
        },
      }
    },
  }
  const slots = {
    inject: (_name: string, factory: () => unknown): (() => void) => {
      const produced = factory()
      const disposers: Array<() => void> = []
      if (typeof produced === 'function') {
        disposers.push(produced as () => void)
      } else if (produced !== null && typeof produced === 'object' && Symbol.iterator in produced) {
        for (const dispose of produced as Iterable<() => void>) disposers.push(dispose)
      }
      return () => { for (const dispose of disposers) dispose() }
    },
    register: (options: Record<string, unknown>): (() => void) => {
      registered.push({ name: options['name'], ...options })
      return () => {}
    },
  }

  const ctx = new Context()
  ctx.provide('connection', { api: { sessions: {} } })
  ctx.provide('sessions', sessions)
  ctx.provide('slots', slots)
  ctx.provide('locale', { register: localeRegister })
  apply(ctx)
  const svc = ctx.get('viewContext') as ViewContextService
  return {
    ctx, svc, cells, registered, localeRegister, listListeners,
    setCurrent: (id) => {
      current = id
      for (const fn of [...listListeners]) fn()
    },
    notifySession: (id) => {
      const cell = cells.get(id)
      if (cell === undefined) return
      for (const fn of [...cell.listeners]) fn()
    },
  }
}

/** A view-action carrier with a recorded answer arm. */
function wait(rpcId: string, view = 'kg', action = 'set_filter') {
  const answers: ClientResponse['result'][] = []
  const respond = (message: ClientResponse): Promise<RpcReceipt> => {
    answers.push(message.result)
    return Promise.resolve({ accepted: true })
  }
  return {
    answers,
    wait: new PendingWait('viewAction', rpcId as RpcId, S1, { view, action, args: {} }, respond),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(async () => {
  vi.useRealTimers()
})

describe('view-action executor loop', () => {
  it('binds the current session, drains pending waits, and re-drains on snapshot changes', async () => {
    const b = fakeBench(undefined)
    b.svc.registerActions({ view: 'kg', actions: { set_filter: () => ({ summary: 'ok' }) } })
    b.cells.set(S1, { pending: [], listeners: new Set() })
    const first = wait('r1')
    const second = wait('r2')
    b.cells.get(S1)!.pending.push(first.wait, second.wait)
    b.setCurrent(S1)
    await vi.advanceTimersByTimeAsync(0)
    expect(first.answers).toHaveLength(1)
    expect(second.answers).toHaveLength(1)
    // A frame landing later rides the session subscription, not a rebind.
    const third = wait('r3')
    b.cells.get(S1)!.pending.push(third.wait)
    b.notifySession(S1)
    await vi.advanceTimersByTimeAsync(0)
    expect(third.answers).toHaveLength(1)
    // A list refresh that keeps the same current session re-binds nothing:
    // the existing subscription keeps serving frames.
    b.setCurrent(S1)
    expect(b.cells.get(S1)!.listeners.size).toBe(1)
    const fourth = wait('r4')
    b.cells.get(S1)!.pending.push(fourth.wait)
    b.notifySession(S1)
    await vi.advanceTimersByTimeAsync(0)
    expect(fourth.answers).toHaveLength(1)
    await b.ctx.fiber.dispose()
  })

  it('the initial drain skips non-view-action kinds', async () => {
    const b = fakeBench(undefined)
    b.cells.set(S1, { pending: [], listeners: new Set() })
    const questionRespond = vi.fn((): Promise<RpcReceipt> => Promise.resolve({ accepted: true }))
    const question = new PendingWait('question', 'rq' as RpcId, S1, {} as never, questionRespond)
    b.cells.get(S1)!.pending.push(question)
    b.setCurrent(S1)
    await vi.advanceTimersByTimeAsync(0)
    expect(questionRespond).not.toHaveBeenCalled()
    await b.ctx.fiber.dispose()
  })

  it('retries on backoff until the binding record appears', async () => {
    const b = fakeBench(S1)
    await vi.advanceTimersByTimeAsync(1_100)
    // The scope record lands; the pending retry binds and drains it.
    const carrier = wait('r1')
    b.cells.set(S1, { pending: [carrier.wait], listeners: new Set() })
    await vi.advanceTimersByTimeAsync(500)
    expect(carrier.answers).toHaveLength(1)
    await b.ctx.fiber.dispose()
  })

  it('gives up after the bounded attempt ceiling', async () => {
    const b = fakeBench(S1)
    await vi.advanceTimersByTimeAsync(30_000)
    const carrier = wait('r1')
    b.cells.set(S1, { pending: [carrier.wait], listeners: new Set() })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(carrier.answers).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    await b.ctx.fiber.dispose()
  })

  it('a session switch re-binds and drops the old session subscription', async () => {
    const b = fakeBench(undefined)
    b.svc.registerActions({ view: 'kg', actions: { set_filter: () => ({ summary: 'ok' }) } })
    b.cells.set(S1, { pending: [], listeners: new Set() })
    b.cells.set(S2, { pending: [], listeners: new Set() })
    b.setCurrent(S1)
    expect(b.cells.get(S1)!.listeners.size).toBe(1)
    b.setCurrent(S2)
    expect(b.cells.get(S1)!.listeners.size).toBe(0)
    expect(b.cells.get(S2)!.listeners.size).toBe(1)
    // A late frame on the retired session cannot drain through the loop.
    const stale = wait('r-old')
    b.cells.get(S1)!.pending.push(stale.wait)
    b.notifySession(S1)
    await vi.advanceTimersByTimeAsync(0)
    expect(stale.answers).toHaveLength(0)
    await b.ctx.fiber.dispose()
  })

  it('suppresses an identical key while its serve is in flight, then re-serves it', async () => {
    const b = fakeBench(undefined)
    const resolveExecutor: Array<(value: { summary: string }) => void> = []
    b.svc.registerActions({
      view: 'kg',
      actions: { set_filter: () => new Promise((resolve) => { resolveExecutor.push(resolve) }) },
    })
    b.cells.set(S1, { pending: [], listeners: new Set() })
    b.setCurrent(S1)
    const first = wait('dup', 'kg', 'set_filter')
    b.cells.get(S1)!.pending.push(first.wait)
    b.notifySession(S1)
    await vi.advanceTimersByTimeAsync(0)
    expect(resolveExecutor).toHaveLength(1)
    // A duplicate frame with the same key arrives while the executor runs.
    const duplicate = wait('dup', 'kg', 'set_filter')
    const pending = b.cells.get(S1)!.pending
    pending.push(duplicate.wait)
    b.notifySession(S1)
    await vi.advanceTimersByTimeAsync(0)
    expect(resolveExecutor).toHaveLength(1)
    expect(duplicate.answers).toHaveLength(0)
    // The in-flight serve settles: the runtime drops the answered frame from
    // the pending list, the key frees, and the next drain serves the duplicate.
    resolveExecutor[0]!({ summary: 'done' })
    pending.splice(pending.indexOf(first.wait), 1)
    await vi.advanceTimersByTimeAsync(0)
    expect(first.answers).toHaveLength(1)
    b.notifySession(S1)
    await vi.advanceTimersByTimeAsync(0)
    expect(resolveExecutor).toHaveLength(2)
    resolveExecutor[1]!({ summary: 'done' })
    await vi.advanceTimersByTimeAsync(0)
    expect(duplicate.answers).toHaveLength(1)
    await b.ctx.fiber.dispose()
  })

  it('teardown unsubscribes both stores and cancels a pending retry', async () => {
    const b = fakeBench(undefined)
    b.cells.set(S1, { pending: [], listeners: new Set() })
    b.setCurrent(S1)
    // Stage a pending retry: the current session loses its scope record.
    b.cells.delete(S1)
    b.setCurrent(S2)
    expect(b.cells.has(S2)).toBe(false)
    expect(vi.getTimerCount()).toBe(1)
    await b.ctx.fiber.dispose()
    expect(b.listListeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('apply slot contributions', () => {
  it('claims the header rider and the three keyed toolview rows with the package locale', () => {
    const b = fakeBench(undefined)
    const header = b.registered.find(options => options['name'] === 'conversation.session.header.actions')
    expect(header).toMatchObject({ id: 'view-context', order: 0.5, locale: 'viewContext' })
    expect(typeof header!['inject']).toBe('function')
    const keys = b.registered
      .filter(options => options['name'] === 'tool.call.toolview')
      .map(options => options['key'])
    expect(keys).toEqual(['switch_view', 'view_apply', 'view_state_get'])
    expect(b.localeRegister).toHaveBeenCalledWith('viewContext', { zh, en })
    void b.ctx.fiber.dispose()
  })
})
