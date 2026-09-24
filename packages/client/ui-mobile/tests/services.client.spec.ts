// @vitest-environment jsdom
/**
 * The mobile data plane without React: the unary rpc wire (ok/HTTP/mismatch/
 * server-error paths), the sessions service wrappers (roster filtering, list
 * ordering, history mapping, create/prompt/rename payloads, the display
 * projections), the hooks' async/poll state machines, the demo-auth
 * non-object branch, and the package's invariant companion.
 */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadIdentity, saveIdentity } from '../src/client/auth.ts'
import { messageOf, useAsync, usePoll } from '../src/client/hooks.ts'
import { parseRoute } from '../src/client/router.ts'
import { rpc, rpcCall } from '../src/client/rpc.ts'
import {
  clockOf, createSession, dayLabelOf, listAiEmployees, listSessions, pendingPresetOf, promptSession, readHistory,
  relativeTimeOf, renameSession, searchSessions, subtitleOf, titleOf,
} from '../src/client/sessionsService.ts'
import type { SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api'
import * as Invariant from '../src/invariant.ts'

/** One recorded gateway call. */
interface RecordedCall {
  readonly url: string
  readonly rpcId: string
  readonly payload: Record<string, unknown>
}

let calls: RecordedCall[]
let fetchMock: ReturnType<typeof vi.fn>

/**
 * Install the gateway fetch stub. `routes` maps `session.list`-style method
 * names to a value or a per-call producer; an unmapped method answers ok:false.
 */
function stubGateway(routes: Record<string, unknown>): void {
  calls = []
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const body = JSON.parse((init?.body ?? '{}') as string) as {
      rpcId?: string
      payload?: Record<string, unknown>
    }
    calls.push({ url, rpcId: body.rpcId ?? '', payload: body.payload ?? {} })
    const method = url.replace('/api/', '')
    const route = routes[method]
    if (route === undefined) {
      return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: false, error: { message: `no stub for ${method}` } } }), { status: 200 })
    }
    const produced = typeof route === 'function'
      ? await (route as (payload: Record<string, unknown>) => Promise<unknown>)(body.payload ?? {})
      : route
    const value = produced
    return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value } }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  localStorage.clear()
  location.hash = ''
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('mobile rpc wire', () => {
  it('posts the client-request envelope and unwraps the ok value', async () => {
    stubGateway({ 'kg.stats': { entities: 7, triples: 9 } })
    const value = await rpc('kg.stats', {})
    expect(value).toEqual({ entities: 7, triples: 9 })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/api/kg.stats')
    expect(calls[0]?.payload).toEqual({})
    const envelope = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined)?.body ?? '{}',
    ) as { type: string; method: string }
    expect(envelope.type).toBe('client-request')
    expect(envelope.method).toBe('kg.stats')
  })

  it('fails loud on a non-2xx transport status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })))
    await expect(rpc('kg.stats', {})).rejects.toThrow('移动端请求失败（kg.stats，HTTP 503）')
  })

  it('fails loud on a mismatched rpcId and on a server error result', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ rpcId: 'other', result: { ok: true, value: null } }), { status: 200 })
    }))
    await expect(rpc('kg.stats', {})).rejects.toThrow('移动端请求应答错配（kg.stats）')
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse((init?.body ?? '{}') as string) as { rpcId: string }
      return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: false, error: { message: '图未装配' } } }), { status: 200 })
    }))
    await expect(rpc('kg.subgraph', { seeds: [], hops: 1 })).rejects.toThrow('图未装配')
  })

  it('ties one method helper to its payload/value pair', async () => {
    stubGateway({ 'session.rename': { ok: true } })
    await rpcCall('session.rename')({ sessionId: 's1' as never, title: '新标题' })
    expect(calls[0]?.url).toBe('/api/session.rename')
    expect(calls[0]?.payload).toMatchObject({ title: '新标题' })
  })
})

describe('mobile sessions service', () => {
  it('filters broken presets and defaults the display metadata', async () => {
    stubGateway({
      'agentPreset.list': {
        presets: [
          { id: 'form-assistant', name: '填表助手', description: '帮我登记', isDefault: false },
          { id: 'raw-id', isDefault: true },
          { id: 'broken-one', name: '坏了', broken: { reason: 'load failed' }, isDefault: false },
        ],
      },
    })
    const roster = await listAiEmployees()
    expect(roster).toEqual([
      { id: 'form-assistant', name: '填表助手', description: '帮我登记', broken: false, isDefault: false },
      { id: 'raw-id', name: 'raw-id', description: '', broken: false, isDefault: true },
    ])
  })

  it('lists sessions newest-first', async () => {
    stubGateway({
      'session.list': {
        items: [
          { sessionId: 'old', updatedAt: 100, blank: true },
          { sessionId: 'new', updatedAt: 300 },
          { sessionId: 'mid', updatedAt: 200 },
        ],
      },
    })
    const sessions = await listSessions()
    expect(sessions.map(row => (row as { sessionId: string }).sessionId)).toEqual(['new', 'mid', 'old'])
  })

  it('reads the history window and maps the raw events', async () => {
    stubGateway({
      'session.history': { events: [{ event: { type: 'user/message', seq: 1, time: 5, data: {} } }, { event: { type: 'other', seq: 2 } }] },
    })
    const events = await readHistory('session-9')
    expect(events).toEqual([
      { type: 'user/message', seq: 1, time: 5, data: {} },
      { type: 'other', seq: 2 },
    ])
    expect(calls[0]?.payload).toMatchObject({ sessionId: 'session-9', maxMessages: 200 })
  })

  it('creates sessions with and without the preset binding', async () => {
    stubGateway({
      'session.create': (payload: Record<string, unknown>) => ({
        sessionId: `created:${payload.agentPreset as string | undefined ?? 'default'}`,
      }),
    })
    await expect(createSession('form-assistant')).resolves.toBe('created:form-assistant')
    await expect(createSession()).resolves.toBe('created:default')
    expect('agentPreset' in (calls[1]?.payload ?? {})).toBe(false)
  })

  it('sends queue-mode prompts with the resolved time zone and renames', async () => {
    stubGateway({ 'session.prompt': {}, 'session.rename': {} })
    await promptSession('session-1', '宏发食品本月出口情况')
    const promptPayload = calls[0]?.payload
    expect(promptPayload).toMatchObject({ sessionId: 'session-1', mode: 'queue' })
    expect(promptPayload?.['content']).toEqual([{ type: 'text', text: '宏发食品本月出口情况' }])
    expect(promptPayload?.['clientTimeZone']).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    await renameSession('session-1', '新标题')
    expect(calls[1]?.payload).toMatchObject({ sessionId: 'session-1', title: '新标题' })
  })

  it('projects the title and subtitle fallbacks and the HH:mm clock', async () => {
    const base = { sessionId: 's', updatedAt: 0 } as unknown as SessionSummary
    expect(titleOf({ ...base, projections: { values: { title: '已置顶' } } } as never)).toBe('已置顶')
    expect(titleOf({ ...base, projections: { values: { title: '   ' } } } as never)).toBe('未命名会话')
    expect(titleOf({ ...base, blank: true })).toBe('新会话')
    expect(subtitleOf(base)).toBe('本地会话')
    // Before the roster read lands, the colleague duty table (and its fallback) project; the bare preset id never does.
    expect(subtitleOf({ ...base, agentPreset: 'business-advisor' })).toBe('经营洞察问答（只读）')
    expect(subtitleOf({ ...base, agentPreset: 'not-in-any-table' })).toBe('AI 同事')
    stubGateway({
      'agentPreset.list': { presets: [{ id: 'mobile-form-assistant', name: '智能填表助手', isDefault: false }] },
    })
    await listAiEmployees()
    expect(subtitleOf({ ...base, agentPreset: 'mobile-form-assistant' })).toBe('智能填表助手')
    expect(clockOf(new Date('2026-09-19T09:05:00').getTime())).toBe('09:05')
  })

  it('searches the message surface and maps the hit rows', async () => {
    stubGateway({
      'session.search': { items: [{ sessionId: 's1', snippet: '宏发…出口' }], hasMore: false },
    })
    const hits = await searchSessions('出口')
    expect(hits).toEqual([{ sessionId: 's1', snippet: '宏发…出口' }])
    expect(calls[0]?.payload).toEqual({ query: '出口' })
  })

  it('renders WeChat-style relative times and day labels', () => {
    const now = new Date('2026-09-20T15:00:00').getTime()
    expect(relativeTimeOf(now - 30_000, now)).toBe('刚刚')
    expect(relativeTimeOf(new Date('2026-09-20T10:32:00').getTime(), now)).toBe('10:32')
    expect(relativeTimeOf(new Date('2026-09-19T10:32:00').getTime(), now)).toBe('昨天')
    expect(relativeTimeOf(new Date('2026-09-16T10:32:00').getTime(), now)).toBe('周三')
    expect(relativeTimeOf(new Date('2026-08-01T10:32:00').getTime(), now)).toBe('8月1日')
    expect(dayLabelOf(new Date('2026-09-20T10:32:00').getTime(), now)).toBe('今天')
    expect(dayLabelOf(new Date('2026-09-19T10:32:00').getTime(), now)).toBe('昨天')
    expect(dayLabelOf(new Date('2026-08-01T10:32:00').getTime(), now)).toBe('2026年8月1日')
  })
})

describe('mobile async hooks', () => {
  it('walks useAsync loading → ready and refresh reruns the fetch', async () => {
    let produced = 0
    const fetcher = async (): Promise<string> => {
      produced += 1
      return `v${String(produced)}`
    }
    const { result } = renderHook(() => useAsync(fetcher))
    expect(result.current.status).toBe('loading')
    await act(async () => {})
    expect(result.current.status).toBe('ready')
    expect(result.current.value).toBe('v1')
    act(() => { result.current.refresh() })
    await act(async () => {})
    expect(result.current.value).toBe('v2')
  })

  it('surfaces useAsync errors by message, including non-Error throws', async () => {
    const failing = async (): Promise<never> => { throw new Error('后端超时') }
    const { result } = renderHook(() => useAsync(failing))
    await act(async () => {})
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('后端超时')
    expect(messageOf('裸字符串')).toBe('裸字符串')
  })

  it('re-runs useAsync when the fetcher identity changes', async () => {
    const fetchers = [async () => 'a', async () => 'b']
    const { result, rerender } = renderHook(
      ({ index }: { index: number }) => useAsync(fetchers[index] as () => Promise<string>),
      { initialProps: { index: 0 } },
    )
    await act(async () => {})
    expect(result.current.value).toBe('a')
    rerender({ index: 1 })
    await act(async () => {})
    expect(result.current.value).toBe('b')
  })

  it('polls usePoll ready → interval refresh and clears its timer on unmount', async () => {
    let reads = 0
    const producer = async (): Promise<number> => {
      reads += 1
      return reads
    }
    const { result, unmount } = renderHook(() => usePoll(producer, 10, true))
    await act(async () => {})
    expect(result.current.status).toBe('ready')
    expect(result.current.value).toBe(1)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(result.current.value as number).toBeGreaterThanOrEqual(2)
    unmount()
    const afterUnmount = reads
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(reads).toBeLessThanOrEqual(afterUnmount + 1)
  })

  it('ignores late answers that settle after unmount, resolved or rejected', async () => {
    let releaseAsync!: () => void
    const gated = new Promise<number>((resolve) => { releaseAsync = () =>{  resolve(1) } })
    const fetcher = (): Promise<number> => gated
    const late = renderHook(() => useAsync(fetcher))
    late.unmount()
    releaseAsync()
    await act(async () => {})
    expect(late.result.current.status).toBe('loading')
    let failAsync!: (cause: unknown) => void
    const gatedFailure = new Promise<number>((_resolve, reject) => { failAsync = reject })
    const failingFetcher = (): Promise<number> => gatedFailure
    const failingLate = renderHook(() => useAsync(failingFetcher))
    failingLate.unmount()
    failAsync(new Error('迟到的失败'))
    await act(async () => {})
    expect(failingLate.result.current.status).toBe('loading')
    let releasePoll!: () => void
    const gatedPoll = new Promise<number>((resolve) => { releasePoll = () =>{  resolve(2) } })
    const producer = (): Promise<number> => gatedPoll
    const latePoll = renderHook(() => usePoll(producer, 10, true))
    latePoll.unmount()
    releasePoll()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    expect(latePoll.result.current.status).toBe('loading')
    let failPoll!: (cause: unknown) => void
    const gatedPollFailure = new Promise<number>((_resolve, reject) => { failPoll = reject })
    const failingProducer = (): Promise<number> => gatedPollFailure
    const lateFailingPoll = renderHook(() => usePoll(failingProducer, 10, true))
    lateFailingPoll.unmount()
    failPoll(new Error('迟到的轮询失败'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    expect(lateFailingPoll.result.current.status).toBe('loading')
  })

  it('keeps usePoll at loading while inactive and reports producer failures', async () => {
    const never = async (): Promise<string> => 'never'
    const idle = renderHook(() => usePoll(never, 10, false))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(idle.result.current.status).toBe('loading')
    idle.unmount()
    const failingProducer = async (): Promise<never> => { throw new Error('网关 502') }
    const failing = renderHook(() => usePoll(failingProducer, 10, true))
    await act(async () => {})
    expect(failing.result.current.status).toBe('error')
    expect(failing.result.current.error).toBe('网关 502')
    failing.unmount()
  })
})

describe('mobile auth non-object branch and routes', () => {
  it('rejects a stored identity that parses to a non-object', () => {
    localStorage.setItem('dsh-mobile-auth', '42')
    expect(loadIdentity()).toBeUndefined()
    localStorage.setItem('dsh-mobile-auth', 'null')
    expect(loadIdentity()).toBeUndefined()
    saveIdentity({ phone: '13800138000', name: '业务员', loggedAt: 1 })
    expect(loadIdentity()?.name).toBe('业务员')
  })

  it('parses the login route and reads the default route query as absent', () => {
    expect(parseRoute('#/login').name).toBe('login')
    expect(parseRoute('#/login?next=/data').query.get('next')).toBe('/data')
    const fallback = parseRoute('#/nowhere')
    expect(fallback.name).toBe('home')
    expect(fallback.query.get('seed')).toBeNull()
  })
})

describe('ui-mobile invariant companion', () => {
  it('declares the companion plugin name and its required service', () => {
    expect(Invariant.name).toBe('client-ui-mobile-invariant')
    expect(Invariant.inject).toEqual(['invariants'])
  })

  it('registers package ownership and resolves with the disposer', async () => {
    const disposer = (): void => {}
    const register = vi.fn(() => disposer)
    const ctx = { invariants: { register } } as unknown as Parameters<typeof Invariant.apply>[0]
    await expect(Invariant.apply(ctx)).resolves.toBe(disposer)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-client-ui-mobile', expect.any(Function))
    const install = (register.mock.calls[0] as unknown[])[1] as () => void
    expect(() =>{  install() }).not.toThrow()
  })
})

describe('createSession pending preset', () => {
  it('records the echoed preset for the fresh session until the list read lands', async () => {
    stubGateway({ 'session.create': { sessionId: 'fresh-1', agentPreset: 'mobile-form-assistant' } })
    await expect(createSession('mobile-form-assistant')).resolves.toBe('fresh-1')
    expect(pendingPresetOf('fresh-1')).toBe('mobile-form-assistant')
  })

  it('leaves no pending preset when the create echo carries none', async () => {
    stubGateway({ 'session.create': { sessionId: 'fresh-2' } })
    await expect(createSession()).resolves.toBe('fresh-2')
    expect(pendingPresetOf('fresh-2')).toBeUndefined()
  })
})
