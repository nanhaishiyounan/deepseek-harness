// @vitest-environment jsdom
/**
 * The W8-B3 experience-depth additions without React: the history feed's
 * incremental accumulator (append/dedupe, storm and periodic re-base), the
 * work projection's row/item mapping and login backfill (server-newer wins,
 * local-only rows ride up), the rpc expiry path (code narrows, the token
 * clears, listeners fire — nothing else is touched), and the afterSeq
 * payload the sessions service puts on the wire.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// antd-mobile's Toast portal renders asynchronously under jsdom; the expiry
// path's user notice asserts through the mock instead of the DOM.
vi.mock('antd-mobile', () => ({ Toast: { show: vi.fn() } }))
import { clearIdentity, loadIdentity, saveIdentity, subscribeSessionExpired } from '../src/client/auth.ts'
import { rpc, RpcFailure, isSessionExpiredError } from '../src/client/rpc.ts'
import { readHistory } from '../src/client/sessionsService.ts'
import { CALIBRATE_EVERY_POLLS, CALIBRATE_THRESHOLD, EMPTY_FEED, fullFeed, mergeFeed, needsFullRead } from '../src/client/messages/chat/historyFeed.ts'
import { rowToWorkItem, syncWorkFromServer, workItemToValues } from '../src/client/workSync.ts'
import { createWorkItem, workSnapshot } from '../src/client/workStore.ts'
import type { FoldEvent } from '../src/client/fold.ts'

let calls: Array<Record<string, unknown>>

/** Install the gateway fetch stub recording payloads (see services.client.spec.ts's stubGateway). */
function stubGateway(routes: Record<string, unknown>): void {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const body = JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string; payload?: Record<string, unknown>; method?: string }
    calls.push({ url, ...body.payload ?? {} })
    const method = url.replace('/api/', '')
    const route = routes[method]
    if (route === undefined) {
      return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: false, error: { message: `no stub for ${method}` } } }), { status: 200 })
    }
    const produced = typeof route === 'function' ? await (route as (payload: Record<string, unknown>) => unknown)(body.payload ?? {}) : route
    if (produced !== undefined && (produced as { __error?: unknown }).__error !== undefined) {
      const failure = (produced as { __error: { code?: string; message: string } }).__error
      return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: false, error: failure } }), { status: 200 })
    }
    return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value: produced } }), { status: 200 })
  }))
}

const event = (seq: number): FoldEvent => ({ type: 'user/message', seq, time: 0, data: {} })

beforeEach(() => {
  localStorage.clear()
  clearIdentity()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('history feed accumulator', () => {
  it('adopts the full window, appends cursor pages deduped, and calibrates on storms and poll budget', () => {
    const feed = fullFeed([event(1), event(2), event(3)])
    expect(feed.cursor).toBe(3)
    expect(needsFullRead(feed)).toBe(false)

    const grown = mergeFeed(feed, [event(4), event(5)])
    expect(grown.events.map(entry => entry.seq)).toEqual([1, 2, 3, 4, 5])
    expect(grown.cursor).toBe(5)

    // A re-delivered seq replaces its slot instead of duplicating.
    const idempotent = mergeFeed(grown, [event(5), event(6)])
    expect(idempotent.events.map(entry => entry.seq)).toEqual([1, 2, 3, 4, 5, 6])

    // The empty page just counts.
    const idle = mergeFeed(grown, [])
    expect(idle.events).toHaveLength(5)
    expect(idle.polls).toBe(grown.polls + 1)

    // A storm page parks the feed for the next full re-base.
    const storm = mergeFeed(grown, Array.from({ length: CALIBRATE_THRESHOLD + 1 }, (_, index) => event(10 + index)))
    expect(storm.events).toHaveLength(5)
    expect(needsFullRead(storm)).toBe(true)

    // The periodic budget forces a re-base too.
    let spent = grown
    while (spent.polls < CALIBRATE_EVERY_POLLS) spent = mergeFeed(spent, [])
    expect(needsFullRead(spent)).toBe(true)

    // And the empty feed always needs its first full read.
    expect(needsFullRead(EMPTY_FEED)).toBe(true)
  })
})

describe('work projection mapping', () => {
  it('maps rows both ways; a malformed row drops', () => {
    const item = createWorkItem({ title: '投影验证', owner: '陈晨', due: '2026-10-05', status: 'doing' })
    const values = workItemToValues(item)
    const roundTrip = rowToWorkItem({ client_id: item.id, title: values['title'], status: values['status'], created_at: values['created_at'], updated_at: values['updated_at'], owner_display: values['owner_display'], due: values['due'], pinned: values['pinned'], demo: values['demo'] })
    expect(roundTrip).toMatchObject({ id: item.id, title: '投影验证', owner: '陈晨', due: '2026-10-05', status: 'doing' })
    expect(rowToWorkItem({ client_id: 'x', title: '无状态行', created_at: 1, updated_at: 1, status: 'nope' })).toBeUndefined()
    expect(rowToWorkItem({ title: '缺 id 行', created_at: 1, updated_at: 1, status: 'todo' })).toBeUndefined()
  })
})

describe('work login backfill', () => {
  it('merges server rows (newer wins), uploads local-only rows, and no-ops signed out', async () => {
    stubGateway({
      'nocobase.list': { count: 0, page: 1, page_size: 100, rows: [] },
      'nocobase.mobileWorkSave': { clientId: 'x', user: 'buyer' },
    })
    // Signed out: the pull is a no-op and the store keeps its local items.
    const local = createWorkItem({ title: '本地新增项', owner: '我' })
    await syncWorkFromServer()
    expect(calls).toHaveLength(0)

    // Signed in: the server carries a NEW row only — the local-only items
    // (this test's and the mapping block's leftovers in the module store)
    // ride up through mobileWorkSave, and the server row joins the store.
    saveIdentity({ username: 'buyer', nickname: 'buyer', token: 't', loggedAt: 1 })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const body = JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string; payload?: Record<string, unknown> }
      calls.push({ url, ...body.payload ?? {} })
      if (url === '/api/nocobase.list') {
        return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value: {
          count: 1, page: 1, page_size: 100,
          rows: [
            { client_id: 'w_server_new', title: '服务端新项', owner_display: '服务端', status: 'todo', created_at: 5, updated_at: 5, pinned: false, demo: false },
          ],
        } } }), { status: 200 })
      }
      return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value: { clientId: 'x', user: 'buyer' } } }), { status: 200 })
    }))
    await syncWorkFromServer()
    const items = workSnapshot().items
    expect(items.find(entry => entry.id === 'w_server_new')?.title).toBe('服务端新项')
    expect(items.find(entry => entry.id === local.id)?.title).toBe('本地新增项')
    const saves = calls.filter(call => call['url'] === '/api/nocobase.mobileWorkSave')
    expect(saves.map(call => (call['clientId'] as string))).toContain(local.id)
  })

  it('takes the server row when it is newer than the local twin', async () => {
    // Created while signed out: the write-through sink stays idle for it, so
    // the only save the backfill could issue is a local-only upload.
    const twin = createWorkItem({ title: '本地旧版', owner: '我', status: 'todo' })
    saveIdentity({ username: 'buyer', nickname: 'buyer', token: 't', loggedAt: 1 })
    stubGateway({
      'nocobase.list': {
        count: 1, page: 1, page_size: 100,
        rows: [{ client_id: twin.id, title: '服务端更新版', owner_display: '服务端', status: 'doing', created_at: twin.createdAt, updated_at: twin.updatedAt + 100, pinned: false, demo: false }],
      },
      'nocobase.mobileWorkSave': { clientId: 'x', user: 'buyer' },
    })
    await syncWorkFromServer()
    expect(workSnapshot().items.find(entry => entry.id === twin.id)).toMatchObject({ title: '服务端更新版', status: 'doing' })
    // The twin was on the server: nothing rides up for it.
    const saves = calls.filter(call => call['url'] === '/api/nocobase.mobileWorkSave')
    expect(saves.map(call => call['clientId'])).not.toContain(twin.id)
  })
})

describe('session expiry over the rpc wire', () => {
  it('narrows by code, clears the token, and notifies — other errors keep the identity', async () => {
    saveIdentity({ username: 'buyer', nickname: 'buyer', token: 't', loggedAt: 1 })
    let expired = 0
    const unsubscribe = subscribeSessionExpired(() => { expired += 1 })
    stubGateway({
      'kg.stats': { __error: { code: 'nocobase-unauthorized', message: '登录会话已失效，请重新登录后再试' } },
      'llm.models': { __error: { code: 'internal', message: '别的错误' } },
    })
    await expect(rpc('kg.stats', {})).rejects.toSatisfy((cause: unknown) => isSessionExpiredError(cause))
    await expect(rpc('kg.stats', {})).rejects.toBeInstanceOf(RpcFailure)
    expect(loadIdentity()).toBeUndefined()
    expect(expired).toBeGreaterThanOrEqual(1)
    const { Toast } = await import('antd-mobile')
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('登录已过期') }))

    // A non-expiry failure neither clears nor notifies.
    saveIdentity({ username: 'buyer', nickname: 'buyer', token: 't2', loggedAt: 2 })
    await expect(rpc('llm.models', {})).rejects.toSatisfy((cause: unknown) => !isSessionExpiredError(cause))
    expect(loadIdentity()?.token).toBe('t2')
    unsubscribe()
  })
})

describe('readHistory afterSeq payload', () => {
  it('sends the cursor without maxMessages on the incremental read', async () => {
    stubGateway({ 'session.history': { events: [], hasMore: false } })
    await readHistory('s1', 200, 42)
    expect(calls[0]).toMatchObject({ sessionId: 's1', afterSeq: 42 })
    expect(calls[0]?.['maxMessages']).toBeUndefined()
    await readHistory('s1')
    expect(calls[1]).toMatchObject({ sessionId: 's1', maxMessages: 200 })
    expect(calls[1]?.['afterSeq']).toBeUndefined()
  })
})
