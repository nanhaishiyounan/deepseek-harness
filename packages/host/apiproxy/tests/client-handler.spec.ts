/**
 * Wire-protocol coverage over the isomorphic point: InProcessApiClient →
 * toFetchHandler(scripted impl) runs the real envelope wrap/unwrap, zod
 * two-level parse, rpcId discipline, and SSE framing with no network and no
 * browser. Each case scripts its own minimal ApiProxy.
 */

import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ApiProxy, GoalRef, HostFrame, MuxFrame, RpcMessage, RpcRequest, RpcResponse } from '@deepseek-ai/dsh-host-apiproxy'
import { InProcessApiClient, RpcId, toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'

const sid = (id: string): SessionId => id as SessionId

function ok<T>(request: RpcRequest<unknown>, value: T): Promise<RpcResponse<T>> {
  return Promise.resolve({ rpcId: request.rpcId, result: { ok: true, value } })
}

/** Scripted impl: every method resolves an empty-ish OK unless a case overrides it. */
function scriptedApi(overrides: {
  sessions?: Partial<ApiProxy['sessions']>
  subagents?: Partial<ApiProxy['subagents']>
  host?: Partial<ApiProxy['host']>
  skills?: Partial<ApiProxy['skills']>
  agentPresets?: Partial<ApiProxy['agentPresets']>
  events?: Partial<ApiProxy['events']>
  goals?: Partial<ApiProxy['goals']>
  settings?: Partial<ApiProxy['settings']>
  credentials?: Partial<ApiProxy['credentials']>
  llm?: Partial<ApiProxy['llm']>
  data?: Partial<ApiProxy['data']>
  orders?: Partial<ApiProxy['orders']>
  assets?: Partial<ApiProxy['assets']>
  connectors?: Partial<ApiProxy['connectors']>
  lakehouse?: Partial<ApiProxy['lakehouse']>
  kg?: Partial<ApiProxy['kg']>
  nocobase?: Partial<ApiProxy['nocobase']>
  downloads?: Partial<ApiProxy['downloads']>
  respond?: ApiProxy['respond']
} = {}): ApiProxy {
  async function *empty<F>(): AsyncGenerator<RpcRequest<F>> { /* no frames */ }
  const err = <T>(r: RpcRequest<unknown>): Promise<RpcResponse<T>> =>
    Promise.resolve({ rpcId: r.rpcId, result: { ok: false, error: { code: 'internal' as const, message: 'stub', details: {} } } })
  const kbRefuse = <T>(r: RpcRequest<unknown>): Promise<RpcResponse<T>> =>
    Promise.resolve({ rpcId: r.rpcId, result: { ok: false, error: { code: 'kb-not-composed' as never, message: 'stub', details: {} } } })
  return {
    data: { upload: kbRefuse, ...overrides.data },
    lakehouse: { overview: err, ...overrides.lakehouse },
    orders: {
      create: err,
      get: err,
      list: err,
      fulfill: err,
      async download() { return new Response('stub', { status: 500 }) },
      ...overrides.orders,
    },
    assets: {
      list: err,
      detail: err,
      stats: err,
      ...overrides.assets,
    },
    connectors: {
      list: err,
      connections: err,
      transfers: err,
      ...overrides.connectors,
    },
    kg: {
      mappings: err,
      schema: err,
      query: err,
      search: err,
      subgraph: err,
      expand: err,
      stats: err,
      episodes: err,
      rollback: err,
      ontologyEdit: err,
      reviewQueue: err,
      reviewDecide: err,
      communities: err,
      history: err,
      ...overrides.kg,
    },
    kb: {
      stats: kbRefuse,
      search: kbRefuse,
      ingest: kbRefuse,
      ingestUrl: kbRefuse,
      upload: kbRefuse,
    },
    nocobase: {
      listMeta: err,
      list: err,
      get: err,
      update: err,
      ...overrides.nocobase,
    },
    sessions: {
      list: r => ok(r, { items: [] }),
      search: r => ok(r, { items: [], hasMore: false }),
      create: r => ok(r, { sessionId: sid('s-new') }),
      history: r => ok(r, {
        events: [],
        hasMore: false,
        modelSelection: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      }),
      models: r => ok(r, {
        current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
        routable: true,
        groups: [],
        failures: [],
      }),
      selectModel: r => ok(r, {
        selected: { provider: r.payload.provider, model: r.payload.model },
      }),
      rename: r => ok(r, { title: 'renamed', seq: 0 }),
      fork: r => ok(r, { sessionId: sid('s-fork') }),
      prompt: r => ok(r, { accepted: true as const }),
      attachment: r => ok(r, {
        attachment: { attachmentId: 'a' as never, mediaType: 'image/png', bytes: 1, width: 1, height: 1 },
        data: 'AA==',
      }),
      updateQueue: r => ok(r, { accepted: true as const }),
      cancel: r => ok(r, { accepted: true as const }),
      viewStateReport: r => ok(r, { accepted: true as const }),
      ...overrides.sessions,
    },
    subagents: {
      list: r => ok(r, { entries: [], parentAvailable: false }),
      history: r => ok(r, { events: [], hasMore: false }),
      prompt: r => ok(r, { messageId: 'message-1' as never }),
      interrupt: r => ok(r, { accepted: true as const }),
      ...overrides.subagents,
    },
    host: {
      describe: r => ok(r, {
        version: '0-test', cwd: '/t', attachedSessions: 0, home: '/h', canOpenPath: true,
      }),
      pickDirectory: r => ok(r, { path: null }),
      listDirectory: r => ok(r, { path: '/t', home: '/t', crumbs: [], entries: [], truncated: false }),
      createDirectory: r => ok(r, { path: '/t/new' }),
      openPath: r => ok(r, { opened: true as const }),
      ...overrides.host,
    },
    workspace: {
      list: r => ok(r, { items: [], archivedSessionIds: [] }),
      create: r => ok(r, { workspace: { workspaceId: 'w1' as never, path: '/t', title: 't', sessionIds: [], createdAt: '0', updatedAt: '0' }, created: true }),
      rename: r => ok(r, { workspace: { workspaceId: 'w1' as never, path: '/t', title: 't', sessionIds: [], createdAt: '0', updatedAt: '0' } }),
      delete: r => ok(r, { deleted: true as const }),
      insertBefore: r => ok(r, { workspaceIds: [r.payload.workspaceId] }),
      insertSessionBefore: r => ok(r, { workspace: { workspaceId: 'w1' as never, path: '/t', title: 't', sessionIds: [], createdAt: '0', updatedAt: '0' } }),
      archiveSession: r => ok(r, { archivedSessionIds: [r.payload.sessionId] }),
    },
    skills: { list: r => ok(r, { skills: [] }), ...overrides.skills },
    agentPresets: {
      list: r => ok(r, { presets: [], authorable: false, hasDocument: false }),
      select: r => ok(r, { agentPreset: r.payload.agentPreset }),
      read: r => ok(r, { agentPreset: r.payload.agentPreset, trust: 'user' as const, content: '' }),
      copy: r => ok(r, { agentPreset: r.payload.agentPreset }),
      openDocument: r => ok(r, { opened: true as const }),
      remove: r => ok(r, {}),
      ...overrides.agentPresets,
    },
    goals: {
      create: err,
      edit: err,
      pause: err,
      resume: err,
      complete: err,
      clear: err,
      ...overrides.goals,
    },
    settings: {
      describe: r => ok(r, { writable: true, hasDocument: false, namespaces: [] }),
      openDocument: r => ok(r, { opened: true as const }),
      update: err,
      replace: err,
      mutate: err,
      ...overrides.settings,
    },
    credentials: {
      describe: r => ok(r, { credentials: {} }),
      set: err,
      unset: err,
      ...overrides.credentials,
    },
    llm: {
      providers: r => ok(r, { providers: [] }),
      models: r => ok(r, { groups: [], failures: [] }),
      discoverModels: err,
      ...overrides.llm,
    },
    events: { mux: () => empty<MuxFrame>(), host: () => empty<HostFrame>(), ...overrides.events },
    respond: overrides.respond ?? (() => Promise.resolve({ accepted: false as const, reason: 'not-pending' as const })),
    downloads: { sessionLog: async () => new Response('stub', { status: 404 }), ...overrides.downloads },
  }
}

function client(api: ApiProxy, timeoutMs?: number): InProcessApiClient {
  return new InProcessApiClient(toFetchHandler(api), timeoutMs)
}

/** Wrap one scripted method to record its invocation into `seen` before responding. */
function recorderInto(seen: { method: string; payload: unknown }[]) {
  return <P, V>(method: string, respond: (r: RpcRequest<P>) => Promise<RpcResponse<V>>) =>
    (r: RpcRequest<P>): Promise<RpcResponse<V>> => {
      seen.push({ method, payload: r.payload })
      return respond(r)
    }
}

describe('unary round trip', () => {
  it('carries payload out and value back through the full wire form', async () => {
    let seen: RpcRequest<{ cursor?: string }> | undefined
    const api = scriptedApi({
      sessions: {
        list: (r) => {
          seen = r
          return ok(r, { items: [{ sessionId: sid('s1'), updatedAt: 7, running: false, blank: false }] })
        },
      },
    })
    const response = await client(api).sessions.list({ cursor: 'c1' })
    // Impl received the narrow form with a minted id; client returned the same id and value.
    expect(seen?.payload).toEqual({ cursor: 'c1' })
    expect(seen?.rpcId).toBeTruthy()
    expect(response.rpcId).toBe(seen?.rpcId)
    expect(response.result).toEqual({ ok: true, value: { items: [{ sessionId: 's1', updatedAt: 7, running: false, blank: false }] } })
  })

  it('round-trips a trimmed session search query and its bounded result metadata', async () => {
    let seen: RpcRequest<{ query: string }> | undefined
    const api = scriptedApi({
      sessions: {
        search: (request) => {
          seen = request
          return ok(request, {
            items: [{ sessionId: sid('s1'), snippet: 'matching message text' }],
            hasMore: true,
          })
        },
      },
    })
    const response = await client(api).sessions.search({ query: '  message text  ' })
    expect(seen?.payload).toEqual({ query: 'message text' })
    expect(response.result).toEqual({
      ok: true,
      value: {
        items: [{ sessionId: 's1', snippet: 'matching message text' }],
        hasMore: true,
      },
    })
  })

  it('rejects an overlong session-search snippet at the client value boundary', async () => {
    const api = scriptedApi({
      sessions: {
        search: request => ok(request, {
          items: [{ sessionId: sid('s1'), snippet: '😀'.repeat(241) }],
          hasMore: false,
        }),
      },
    })

    await expect(client(api).sessions.search({ query: 'message' }))
      .rejects.toThrow(/240 Unicode code points/)
  })

  it('routes session fork with its optional cut anchor through the wire', async () => {
    let seen: RpcRequest<{ sessionId: SessionId; atSeq?: number }> | undefined
    const api = scriptedApi({
      sessions: {
        fork: (request) => {
          seen = request
          return ok(request, { sessionId: sid('s-child') })
        },
      },
    })
    const response = await client(api).sessions.fork({ sessionId: sid('s-parent'), atSeq: 7 })
    expect(seen?.payload).toEqual({ sessionId: 's-parent', atSeq: 7 })
    expect(response.result).toEqual({ ok: true, value: { sessionId: 's-child' } })
  })

  it('routes workspace rename, delete, and ordering through the wire', async () => {
    const api = scriptedApi()
    const c = client(api)
    const renamed = await c.workspace.rename({ workspaceId: 'w1' as never, title: 'next' })
    expect(renamed.result.ok).toBe(true)
    const blankTitle = await c.workspace.rename({ workspaceId: 'w1' as never, title: '   ' })
    expect(blankTitle.result).toMatchObject({ ok: false, error: { code: 'bad-request' } })
    const deleted = await c.workspace.delete({ workspaceId: 'w1' as never })
    expect(deleted.result).toEqual({ ok: true, value: { deleted: true } })
    const workspaceOrder = await c.workspace.insertBefore({
      workspaceId: 'w1' as never,
      beforeWorkspaceId: 'w2' as never,
    })
    expect(workspaceOrder.result).toEqual({ ok: true, value: { workspaceIds: ['w1'] } })
    const anchored = await c.workspace.insertSessionBefore({ workspaceId: 'w1' as never, sessionId: sid('s1'), beforeSessionId: sid('s2') })
    expect(anchored.result.ok).toBe(true)
    const appended = await c.workspace.insertSessionBefore({ workspaceId: 'w1' as never, sessionId: sid('s1') })
    expect(appended.result.ok).toBe(true)
  })

  it('routes the agent-preset roster and switch through the wire', async () => {
    const c = client(scriptedApi())

    const listed = await c.agentPresets.list({})
    expect(listed.result).toEqual({ ok: true, value: { presets: [], authorable: false, hasDocument: false } })

    // The switch carries the session it is about: the host refuses one whose
    // conversation has started, and it can only know which by id.
    const selected = await c.agentPresets.select({ sessionId: sid('s1'), agentPreset: 'standard' })
    expect(selected.result).toEqual({ ok: true, value: { agentPreset: 'standard' } })
  })

  it('passes business errors through as 200 + err result, not a throw', async () => {
    const api = scriptedApi({
      sessions: {
        cancel: r => Promise.resolve({ rpcId: r.rpcId, result: { ok: false, error: { code: 'session-not-found', message: 'nope', details: { sessionId: sid('sx') } } } }),
      },
    })
    const response = await client(api).sessions.cancel({ sessionId: sid('sx') })
    expect(response.result).toEqual({ ok: false, error: { code: 'session-not-found', message: 'nope', details: { sessionId: 'sx' } } })
  })

  it('throws on rpcId echo mismatch', async () => {
    const api = scriptedApi({
      sessions: { list: () => Promise.resolve({ rpcId: RpcId('forged'), result: { ok: true, value: { items: [] } } }) },
    })
    await expect(client(api).sessions.list({})).rejects.toThrow(/rpcId mismatch/)
  })

  it('rejects an invalid payload at the handler as 200 + bad-request with issues', async () => {
    const api = scriptedApi()
    const response = await client(api).sessions.history({ sessionId: 123 as unknown as SessionId })
    expect(response.result.ok).toBe(false)
    if (!response.result.ok) {
      expect(response.result.error.code).toBe('bad-request')
      expect((response.result.error.details as { issues: unknown[] }).issues.length).toBeGreaterThan(0)
    }
  })

  it('round-trips subagent.interrupt and rejects a one-shot or incomplete address', async () => {
    const interrupt = vi.fn((r: RpcRequest<unknown>) => ok(r, { accepted: true as const }))
    const api = scriptedApi({ subagents: { interrupt } })
    const c = client(api)

    const accepted = await c.subagents.interrupt({
      parentSessionId: sid('parent'), childSessionId: sid('child'), mode: 'continuable',
    })
    expect(accepted.result).toEqual({ ok: true, value: { accepted: true } })
    expect(interrupt).toHaveBeenCalledTimes(1)

    // The wire schema owns the mode fence: a one-shot address never reaches the impl.
    const oneShot = await c.subagents.interrupt({
      parentSessionId: sid('parent'), childSessionId: sid('child'), mode: 'one-shot',
    } as never)
    expect(oneShot.result.ok).toBe(false)
    if (!oneShot.result.ok) expect(oneShot.result.error.code).toBe('bad-request')

    const incomplete = await c.subagents.interrupt({
      parentSessionId: sid('parent'), mode: 'continuable',
    } as never)
    expect(incomplete.result.ok).toBe(false)
    if (!incomplete.result.ok) expect(incomplete.result.error.code).toBe('bad-request')
    expect(interrupt).toHaveBeenCalledTimes(1)
  })

  it('rejects a method/path mismatch as bad-request', async () => {
    const handler = toFetchHandler(scriptedApi())
    const body = { type: 'client-request', rpcId: 'r1', method: 'session.create', payload: {} }
    const response = await handler.fetch('http://dsh.internal/api/session.list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect(response.status).toBe(200)
    const parsed = await response.json() as { result: { ok: boolean; error?: { code: string; message: string } } }
    expect(parsed.result.ok).toBe(false)
    expect(parsed.result.error?.code).toBe('bad-request')
    expect(parsed.result.error?.message).toMatch(/does not match path/)
  })

  it('rejects a malformed envelope as bad-request, salvaging the rpcId or falling back to the sentinel', async () => {
    const handler = toFetchHandler(scriptedApi())
    // No salvageable rpcId → the fixed invalid-request sentinel keeps the response a valid ServerResponse.
    const noId = await handler.fetch('http://dsh.internal/api/session.list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nonsense: true }) })
    expect(noId.status).toBe(200)
    const noIdParsed = await noId.json() as { rpcId: string; result: { ok: boolean } }
    expect(noIdParsed.result.ok).toBe(false)
    expect(noIdParsed.rpcId).toBe('invalid-request')
    // A string rpcId in the otherwise-bad body is salvaged for correlation.
    const withId = await handler.fetch('http://dsh.internal/api/session.list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rpcId: 'salvage-me', nonsense: true }) })
    const withIdParsed = await withId.json() as { rpcId: string; result: { ok: boolean } }
    expect(withIdParsed.result.ok).toBe(false)
    expect(withIdParsed.rpcId).toBe('salvage-me')
  })

  it('maps carrier failures to HTTP statuses and the client throws transport failure', async () => {
    const handler = toFetchHandler(scriptedApi())
    // Unknown method → 404.
    const notFound = await handler.fetch('http://dsh.internal/api/no.such', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(notFound.status).toBe(404)
    // Non-JSON body → 400.
    const badBody = await handler.fetch('http://dsh.internal/api/session.list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' })
    expect(badBody.status).toBe(400)
    // Impl crash → 500, and through the client that is a throw, not an err result.
    const crashing = scriptedApi({ sessions: { list: () => { throw new Error('impl exploded') } } })
    await expect(client(crashing).sessions.list({})).rejects.toThrow(/transport failure .*500/)
  })

  it('rejects non-JSON media types before executing anything (cross-site simple-request fence)', async () => {
    const list = vi.fn((r: RpcRequest<{}>) => ok(r, { items: [] }))
    const handler = toFetchHandler(scriptedApi({ sessions: { list } }))
    const body = JSON.stringify({ type: 'client-request', rpcId: 'r1', method: 'session.list', payload: {} })
    // A "simple" browser POST (text/plain — sent with no CORS preflight) is
    // refused at the carrier before the impl runs.
    const plain = await handler.fetch('http://dsh.internal/api/session.list', { method: 'POST', headers: { 'content-type': 'text/plain' }, body })
    expect(plain.status).toBe(415)
    // A string body with no explicit header defaults to text/plain — same fence.
    const unlabelled = await handler.fetch('http://dsh.internal/api/session.list', { method: 'POST', body })
    expect(unlabelled.status).toBe(415)
    expect(list).not.toHaveBeenCalled()
    // Media-type parameters pass: the fence checks the type, not the exact string.
    const charset = await handler.fetch('http://dsh.internal/api/session.list', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body })
    expect(charset.status).toBe(200)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('rejects when the transport never resolves within timeoutMs', async () => {
    // AbortSignal.timeout is immune to fake timers; a short real timeout keeps this fast.
    const never = new InProcessApiClient({
      fetch: (_i: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => { reject(new Error('aborted by timeout')) })
      }),
    }, 25)
    await expect(never.sessions.list({})).rejects.toThrow()
  })

  it('aborts a unary call through the caller-supplied external signal', async () => {
    // Real-fetch semantics: on abort the rejection is the signal's reason, and the abort
    // works even when the transport ignores the signal entirely (hung impl).
    const gate = new AbortController()
    const hung = new InProcessApiClient({ fetch: () => new Promise<Response>(() => {}) }, 60_000)
    const call = hung.sessions.list({}, gate.signal)
    gate.abort(new Error('externally aborted'))
    await expect(call).rejects.toThrow(/externally aborted/)
  })

  it('rejects an already-aborted signal before touching the transport, mapping a string reason to an Error', async () => {
    let touched = false
    const c = new InProcessApiClient({
      fetch: () => {
        touched = true
        return Promise.resolve(new Response('{}'))
      },
    }, 60_000)
    const gate = new AbortController()
    gate.abort('gone before start')
    await expect(c.sessions.list({}, gate.signal)).rejects.toThrow('gone before start')
    expect(touched).toBe(false)
  })

  it('maps a non-Error, non-string abort reason to the default AbortError message', async () => {
    const gate = new AbortController()
    const hung = new InProcessApiClient({ fetch: () => new Promise<Response>(() => {}) }, 60_000)
    const call = hung.sessions.list({}, gate.signal)
    gate.abort(42)
    await expect(call).rejects.toThrow('This operation was aborted')
  })

  it('passes a signal-less doFetch straight through to the handler', async () => {
    class Probe extends InProcessApiClient {
      direct(url: URL): Promise<Response> {
        return this.doFetch(url)
      }
    }
    const probe = new Probe({ fetch: () => Promise.resolve(new Response('raw')) })
    const response = await probe.direct(new URL('http://dsh.internal/probe'))
    expect(await response.text()).toBe('raw')
  })

  it('throws on an S→C ok value that fails the method value schema (second-level parse)', async () => {
    // Impl echoes rpcId but returns a wrong-shaped value: envelope parse passes, value parse must reject.
    const api = scriptedApi({
      sessions: { list: r => Promise.resolve({ rpcId: r.rpcId, result: { ok: true, value: { items: 'not-an-array' } } }) as never },
    })
    await expect(client(api).sessions.list({})).rejects.toThrow()
  })
})

describe('workspace domain round trip', () => {
  it('routes both workspace methods through their handler rows and value schemas', async () => {
    const c = client(scriptedApi())
    const list = await c.workspace.list({})
    expect(list.result).toEqual({ ok: true, value: { items: [], archivedSessionIds: [] } })
    const created = await c.workspace.create({ path: '/t' })
    expect(created.result.ok).toBe(true)
    if (created.result.ok) expect(created.result.value.created).toBe(true)
    const archivedResponse = await c.workspace.archiveSession({ sessionId: 's-arch' as never })
    expect(archivedResponse.result).toEqual({ ok: true, value: { archivedSessionIds: ['s-arch'] } })
  })

  it('round-trips data.upload through the wire form on both destination branches', async () => {
    const c = client(scriptedApi({
      data: {
        upload: async request => request.payload.filename === 'a.csv'
          ? { rpcId: request.rpcId, result: { ok: true, value: { destination: 'lakehouse', replaced: false, table: 'a', rows: 2 } } }
          : { rpcId: request.rpcId, result: { ok: true, value: { destination: 'kb', replaced: false, document: { doc_id: 1, chunks: 2, embedded: false } } } },
      },
    }))
    const csv = await c.data.upload({ filename: 'a.csv', data: 'awi=' })
    expect(csv.result).toEqual({ ok: true, value: { destination: 'lakehouse', replaced: false, table: 'a', rows: 2 } })
    const doc = await c.data.upload({ filename: 'a.md', data: 'IyB4' })
    expect(doc.result).toEqual({
      ok: true, value: { destination: 'kb', replaced: false, document: { doc_id: 1, chunks: 2, embedded: false } },
    })
  })

  it('rejects a pathless create payload at the handler schema', async () => {
    const response = await client(scriptedApi()).workspace.create({} as never)
    expect(response.result.ok).toBe(false)
    if (!response.result.ok) expect(response.result.error.code).toBe('bad-request')
  })
})

describe('SSE stream path', () => {
  it('yields frames in order and skips the comment preamble', async () => {
    const frames: MuxFrame[] = [
      { type: 'session/subscribed', sessionId: sid('s1'), lastSeq: 3 },
      { type: 'stream/error', error: { code: 'internal', message: 'x', details: {} } },
    ]
    const api = scriptedApi({
      events: {
        async *mux(request) {
          let n = 0
          for (const frame of frames) yield { rpcId: RpcId(`push-${n++}-${request.rpcId}`), payload: frame }
        },
      },
    })
    const seen: MuxFrame[] = []
    for await (const envelope of client(api).events.mux({}, new AbortController().signal)) {
      seen.push(envelope.payload)
    }
    expect(seen).toEqual(frames)
  })

  it('reassembles frames across arbitrary chunk boundaries', async () => {
    // Two SSE frames split so one frame spans chunks and one chunk carries parts of both.
    const f1 = { type: 'server-request', rpcId: 'a', method: 'session/subscribed', payload: { type: 'session/subscribed', sessionId: 's1', lastSeq: 1 } }
    const f2 = { type: 'server-request', rpcId: 'b', method: 'session/subscribed', payload: { type: 'session/subscribed', sessionId: 's2', lastSeq: 2 } }
    const wire = `: connected\n\ndata: ${JSON.stringify(f1)}\n\ndata: ${JSON.stringify(f2)}\n\n`
    const cuts = [5, 40, wire.indexOf('data: ', 40) + 3]
    const encoder = new TextEncoder()
    const doFetch = (): Promise<Response> => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        let prev = 0
        for (const cut of [...cuts, wire.length]) {
          controller.enqueue(encoder.encode(wire.slice(prev, cut)))
          prev = cut
        }
        controller.close()
      },
    }), { status: 200 }))
    const chopped = new InProcessApiClient({ fetch: doFetch })
    const seen: string[] = []
    for await (const envelope of chopped.events.mux({}, new AbortController().signal)) {
      seen.push((envelope.payload as { sessionId: string }).sessionId)
      expect(envelope.rpcId).toBe(seen.length === 1 ? 'a' : 'b')
    }
    expect(seen).toEqual(['s1', 's2'])
  })

  it('emits a stream/error frame then closes when the impl throws mid-stream', async () => {
    const api = scriptedApi({
      events: {
        async *host(request): AsyncGenerator<RpcRequest<HostFrame>> {
          yield { rpcId: RpcId(`p-${request.rpcId}`), payload: { type: 'host/session-added', sessionId: sid('s1'), blank: true } }
          throw new Error('impl died mid-stream')
        },
      },
    })
    const seen: HostFrame[] = []
    for await (const envelope of client(api).events.host({}, new AbortController().signal)) {
      seen.push(envelope.payload)
    }
    expect(seen.map(f => f.type)).toEqual(['host/session-added', 'stream/error'])
    const last = seen.at(-1)
    if (last?.type === 'stream/error') expect(last.error.message).toMatch(/impl died mid-stream/)
  })

  it('drops a malformed SSE frame and keeps the stream alive (S→C two-level parse)', async () => {
    const good = { type: 'server-request', rpcId: 'g1', method: 'session/subscribed', payload: { type: 'session/subscribed', sessionId: 's1', lastSeq: 1 } }
    const badEnvelope = { type: 'server-response', rpcId: 'x' } // wrong quadrant for a stream
    const badFrame = { type: 'server-request', rpcId: 'b1', method: 'nope', payload: { type: 'no/such-frame' } }
    const wire = [
      'data: {oops', // not JSON
      `data: ${JSON.stringify(badEnvelope)}`,
      `data: ${JSON.stringify(badFrame)}`,
      `data: ${JSON.stringify(good)}`,
    ].map(l => `${l}\n\n`).join('')
    const doFetch = (): Promise<Response> => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire))
        controller.close()
      },
    }), { status: 200 }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const seen: MuxFrame[] = []
      for await (const envelope of new InProcessApiClient({ fetch: doFetch }).events.mux({}, new AbortController().signal)) {
        seen.push(envelope.payload)
      }
      // The three corrupt frames are reported and skipped; the good one still arrives.
      expect(seen).toEqual([{ type: 'session/subscribed', sessionId: 's1', lastSeq: 1 }])
      expect(errorSpy.mock.calls.length).toBe(3)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('fires onOpen once headers are in, before the first frame, and not on transport failure', async () => {
    const api = scriptedApi({
      events: {
        async *mux(request): AsyncGenerator<RpcRequest<MuxFrame>> {
          yield { rpcId: RpcId(`p-${request.rpcId}`), payload: { type: 'session/subscribed', sessionId: sid('s1'), lastSeq: 0 } }
        },
      },
    })
    const order: string[] = []
    const iterator = client(api).events.mux({}, new AbortController().signal, () => order.push('open'))
    expect(order).toEqual([]) // lazy generator: no fetch (and no onOpen) before iteration
    for await (const _ of iterator) order.push('frame')
    expect(order).toEqual(['open', 'frame'])

    // Transport failure path: onOpen must not fire.
    const failing = new InProcessApiClient({ fetch: () => Promise.resolve(new Response('down', { status: 503 })) })
    const failOrder: string[] = []
    await expect((async () => {
      for await (const _ of failing.events.mux({}, new AbortController().signal, () => failOrder.push('open'))) { /* unreachable */ }
    })()).rejects.toThrow(/transport failure/)
    expect(failOrder).toEqual([])
  })

  it('stops consuming when the caller aborts', async () => {
    let implSawAbort = false
    const api = scriptedApi({
      events: {
        async *mux(_request, signal): AsyncGenerator<RpcRequest<MuxFrame>> {
          try {
            let n = 0
            while (true) {
              yield { rpcId: RpcId(`p${n}`), payload: { type: 'session/subscribed', sessionId: sid('s1'), lastSeq: n++ } }
              await new Promise(resolve => setTimeout(resolve, 5))
              if (signal.aborted) return
            }
          } finally {
            implSawAbort = true
          }
        },
      },
    })
    const abort = new AbortController()
    let count = 0
    // In-process abort ends the stream (impl returns on signal.aborted); over a real
    // network fetch the same abort surfaces as a rejection — both stop the loop.
    await (async () => {
      for await (const _ of client(api).events.mux({}, abort.signal)) {
        if (++count === 2) abort.abort()
      }
    })().catch(() => undefined)
    expect(count).toBe(2)
    // Generator teardown may lag the abort by a microtask; poll briefly.
    await vi.waitFor(() => { expect(implSawAbort).toBe(true) })
  })
})

describe('goals unary surface', () => {
  const ref: GoalRef = { id: 'goal-1' as GoalRef['id'], revision: 1 }
  /** The `{ ref }` acknowledgement every non-clear mutation answers (state travels on the projection). */
  const ack = { ref: { id: 'goal-1' as GoalRef['id'], revision: 2 } }

  it('round-trips every goal method with its own payload and value shape', async () => {
    const seen: { method: string; payload: unknown }[] = []
    const record = recorderInto(seen)
    const api = scriptedApi({
      goals: {
        create: record('goal.create', r => ok(r, ack)),
        edit: record('goal.edit', r => ok(r, { ref: { ...ack.ref, revision: 3 } })),
        pause: record('goal.pause', r => ok(r, ack)),
        resume: record('goal.resume', r => ok(r, ack)),
        complete: record('goal.complete', r => ok(r, ack)),
        clear: record('goal.clear', r => ok(r, { cleared: true as const })),
      },
    })
    const c = client(api)

    const created = await c.goals.create({ sessionId: sid('s1'), objective: 'ship it', maxGoalRounds: 4 })
    expect(created.result).toEqual({ ok: true, value: ack })
    const edited = await c.goals.edit({ sessionId: sid('s1'), ref, objective: 'ship v2' })
    expect(edited.result).toEqual({ ok: true, value: { ref: { ...ack.ref, revision: 3 } } })
    expect((await c.goals.pause({ sessionId: sid('s1'), ref })).result).toEqual({ ok: true, value: ack })
    expect((await c.goals.resume({ sessionId: sid('s1'), ref })).result).toEqual({ ok: true, value: ack })
    expect((await c.goals.complete({ sessionId: sid('s1'), ref })).result).toEqual({ ok: true, value: ack })
    const cleared = await c.goals.clear({ sessionId: sid('s1'), ref })
    expect(cleared.result).toEqual({ ok: true, value: { cleared: true } })

    // The handler dispatched each call through its own route row: payload parsed per method.
    expect(seen.map(s => s.method)).toEqual(['goal.create', 'goal.edit', 'goal.pause', 'goal.resume', 'goal.complete', 'goal.clear'])
    expect(seen[0]?.payload).toEqual({ sessionId: 's1', objective: 'ship it', maxGoalRounds: 4 })
    expect(seen[1]?.payload).toEqual({ sessionId: 's1', ref, objective: 'ship v2' })
  })

  it('passes business errors through as results, not throws', async () => {
    // Default scripted goals impl answers an err result: it must arrive as a result, not a throw.
    const failed = await client(scriptedApi()).goals.pause({ sessionId: sid('s1'), ref })
    expect(failed.result.ok).toBe(false)
    if (!failed.result.ok) expect(failed.result.error.code).toBe('internal')
  })

  it('rejects an invalid goal payload at the handler as bad-request', async () => {
    const response = await client(scriptedApi()).goals.create({ sessionId: sid('s1'), objective: '' })
    expect(response.result.ok).toBe(false)
    if (!response.result.ok) expect(response.result.error.code).toBe('bad-request')

    let editCalls = 0
    const api = scriptedApi({ goals: { edit: (r) => { editCalls++; return ok(r, ack) } } })
    const emptyEdit = await client(api).goals.edit({ sessionId: sid('s1'), ref })
    expect(emptyEdit.result.ok).toBe(false)
    if (!emptyEdit.result.ok) expect(emptyEdit.result.error.code).toBe('bad-request')
    expect(editCalls).toBe(0)
  })
})

describe('respond path', () => {
  it('round-trips a client-response to a receipt', async () => {
    const seen: unknown[] = []
    const api = scriptedApi({
      respond: (message) => {
        seen.push(message)
        return Promise.resolve({ accepted: true as const })
      },
    })
    const receipt = await client(api).respond({ type: 'client-response', rpcId: RpcId('req-1'), result: { ok: true, value: { behavior: 'allow' } } })
    expect(receipt).toEqual({ accepted: true })
    expect(seen).toEqual([{ type: 'client-response', rpcId: 'req-1', result: { ok: true, value: { behavior: 'allow' } } }])
  })

  it('returns bad-response for a malformed client-response without reaching the impl', async () => {
    const respond = vi.fn()
    const handler = toFetchHandler(scriptedApi({ respond }))
    const response = await handler.fetch('http://dsh.internal/api/respond', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-response' }) })
    expect(await response.json()).toEqual({ accepted: false, reason: 'bad-response' })
    expect(respond).not.toHaveBeenCalled()
  })
})

describe('envelope tap', () => {
  it('delivers one microtask batch of full forms per unary call', async () => {
    const api = scriptedApi()
    const tapped = client(api)
    const batches: (readonly RpcMessage[])[] = []
    tapped.subscribeEnvelopes(batch => batches.push(batch))
    await tapped.sessions.list({})
    await vi.waitFor(() => { expect(batches.length).toBeGreaterThan(0) })
    const all = batches.flat()
    expect(all.map(m => m.type)).toEqual(['client-request', 'server-response'])
    expect(all[0]?.rpcId).toBe(all[1]?.rpcId)
  })

  it('isolates a throwing listener and keeps serving the call', async () => {
    const api = scriptedApi()
    const tapped = client(api)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const good: string[] = []
      tapped.subscribeEnvelopes(() => { throw new Error('listener bug') })
      tapped.subscribeEnvelopes(batch => good.push(...batch.map(m => m.type)))
      const response = await tapped.sessions.list({})
      expect(response.result.ok).toBe(true)
      await vi.waitFor(() => { expect(good).toContain('server-response') })
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('buffers nothing with zero subscribers and unsubscribes cleanly', async () => {
    const api = scriptedApi()
    const tapped = client(api)
    await tapped.sessions.list({}) // no subscribers: must not accumulate
    const batches: (readonly RpcMessage[])[] = []
    const unsubscribe = tapped.subscribeEnvelopes(batch => batches.push(batch))
    unsubscribe()
    await tapped.sessions.list({})
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(batches).toEqual([])
  })
})

describe('config unary surface', () => {
  it('round-trips every settings/credentials/llm method with its own payload and value shape', async () => {
    const seen: { method: string; payload: unknown }[] = []
    const record = recorderInto(seen)
    const view = {
      ns: 'llm-deepseek',
      schema: { uid: 1, refs: { 1: { type: 'object' } } },
      value: { baseURL: 'https://next' },
      user: { baseURL: 'https://next' },
      applies: 'live' as const,
      secrets: [{ path: ['apiKey'], set: true }],
      revision: 0,
    }
    const providerRow = {
      provider: 'openai',
      displayName: 'openai',
      settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'openai'],
      active: false,
    }
    const group = { id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-v4-flash', name: 'Flash' }] }
    const api = scriptedApi({
      settings: {
        describe: record('settings.describe', r => ok(r, { writable: true, hasDocument: false, namespaces: [view] })),
        openDocument: record('settings.openDocument', r => ok(r, { opened: true as const })),
        update: record('settings.update', r => ok(r, view)),
        replace: record('settings.replace', r => ok(r, view)),
        mutate: record('settings.mutate', r => ok(r, view)),
      },
      credentials: {
        describe: record('credentials.describe', r => ok(r, { credentials: { OPENAI_API_KEY: { configured: true, source: 'file', writable: true } } })),
        set: record('credentials.set', r => ok(r, {})),
        unset: record('credentials.unset', r => ok(r, {})),
      },
      llm: {
        providers: record('llm.providers', r => ok(r, { providers: [providerRow] })),
        models: record('llm.models', r => ok(r, { groups: [group], failures: [] })),
        discoverModels: record('llm.discoverModels', r => ok(r, { models: [{ id: 'acme-large', contextWindow: 65536 }] })),
      },
    })
    const c = client(api)

    const described = await c.settings.describe({})
    expect(described.result).toEqual({ ok: true, value: { writable: true, hasDocument: false, namespaces: [view] } })
    expect((await c.settings.openDocument({})).result).toEqual({ ok: true, value: { opened: true } })
    const updated = await c.settings.update({ ns: 'llm-deepseek', patch: { baseURL: 'https://next' } })
    expect(updated.result).toEqual({ ok: true, value: view })
    const replaced = await c.settings.replace({ ns: 'llm-deepseek', section: {} })
    expect(replaced.result).toEqual({ ok: true, value: view })
    const mutated = await c.settings.mutate({
      ns: 'llm-deepseek',
      ops: [{ op: 'unset', path: ['baseURL'] }],
      expectedRevision: 0,
    })
    expect(mutated.result).toEqual({ ok: true, value: view })
    const creds = await c.credentials.describe({ refs: ['OPENAI_API_KEY'] })
    expect(creds.result).toEqual({ ok: true, value: { credentials: { OPENAI_API_KEY: { configured: true, source: 'file', writable: true } } } })
    expect((await c.credentials.set({ ref: 'OPENAI_API_KEY', value: 'sk-x' })).result).toEqual({ ok: true, value: {} })
    expect((await c.credentials.unset({ ref: 'OPENAI_API_KEY' })).result).toEqual({ ok: true, value: {} })
    const providers = await c.llm.providers({})
    expect(providers.result).toEqual({ ok: true, value: { providers: [providerRow] } })
    const models = await c.llm.models({})
    expect(models.result).toEqual({ ok: true, value: { groups: [group], failures: [] } })
    const discovered = await c.llm.discoverModels({
      settingsNs: 'llm-pi-ai',
      baseURL: 'https://gateway.acme.example/v1',
      api: 'openai-completions',
      apiKey: 'probe-key',
    })
    expect(discovered.result).toEqual({ ok: true, value: { models: [{ id: 'acme-large', contextWindow: 65536 }] } })

    expect(seen.map(call => call.method)).toEqual([
      'settings.describe', 'settings.openDocument', 'settings.update', 'settings.replace', 'settings.mutate',
      'credentials.describe', 'credentials.set', 'credentials.unset',
      'llm.providers', 'llm.models', 'llm.discoverModels',
    ])
    expect(seen[2]?.payload).toEqual({ ns: 'llm-deepseek', patch: { baseURL: 'https://next' } })
    expect(seen[4]?.payload)
      .toEqual({ ns: 'llm-deepseek', ops: [{ op: 'unset', path: ['baseURL'] }], expectedRevision: 0 })
    expect(seen[6]?.payload).toEqual({ ref: 'OPENAI_API_KEY', value: 'sk-x' })
    // The draft crosses whole, credential included: the host needs it for this
    // one interrogation and stores none of it.
    expect(seen[10]?.payload).toEqual({
      settingsNs: 'llm-pi-ai',
      baseURL: 'https://gateway.acme.example/v1',
      api: 'openai-completions',
      apiKey: 'probe-key',
    })
  })

  it('rejects an invalid credential reference name at the carrier boundary', async () => {
    const api = scriptedApi()
    const response = await client(api).credentials.set({ ref: 'not a var', value: 'x' })
    expect(response.result.ok).toBe(false)
    if (response.result.ok) throw new Error('unreachable')
    expect(response.result.error.code).toBe('bad-request')
  })
})

describe('M1/M2/M3 domain routes over the fetch wire', () => {
  interface WireCase {
    readonly method: string
    readonly payload: unknown
  }

  const CASES: readonly WireCase[] = [
    { method: 'orders.create', payload: { service_id: 'srv-1', brief: '两个月的动线评估' } },
    { method: 'orders.get', payload: { order_id: 7 } },
    { method: 'orders.list', payload: {} },
    { method: 'orders.fulfill', payload: { order_id: 7 } },
    { method: 'assets.list', payload: { query: '豆腐' } },
    { method: 'assets.detail', payload: { provider_id: 'p1', dataset_id: 'd1' } },
    { method: 'assets.stats', payload: {} },
    { method: 'lakehouse.overview', payload: {} },
    { method: 'connectors.list', payload: {} },
    { method: 'connectors.connections', payload: {} },
    { method: 'connectors.transfers', payload: {} },
    { method: 'kg.mappings', payload: {} },
    { method: 'kg.schema', payload: {} },
    { method: 'kg.query', payload: { phrase: '宏发食品的供应商' } },
    { method: 'kg.episodes', payload: { limit: 5 } },
    { method: 'kg.rollback', payload: { episode_uuid: 'ep-1', reason: '回滚' } },
    { method: 'kg.ontologyEdit', payload: { ops: [{ op: 'add_node', target_id: 'dish', label: '菜品' }] } },
    { method: 'kg.reviewQueue', payload: {} },
    { method: 'kg.reviewDecide', payload: { doc_id: 'd1', row_id: 'r1', decision: 'merge' } },
    { method: 'kg.communities', payload: {} },
    { method: 'kg.history', payload: { as_of: '2026-09-19T00:00:00.000Z' } },
    { method: 'kg.search', payload: { query: '宏发', k: 5 } },
    { method: 'kg.subgraph', payload: { seeds: ['宏发食品'], hops: 1 } },
    { method: 'kg.expand', payload: { node_id: 'n:1', limit: 10 } },
    { method: 'kg.stats', payload: {} },
    { method: 'nocobase.listMeta', payload: {} },
    { method: 'nocobase.list', payload: { collection: 'experts' } },
    { method: 'nocobase.get', payload: { collection: 'experts', id: 1 } },
    { method: 'nocobase.update', payload: { collection: 'experts', id: 1, values: { name: '张三' } } },
  ]

  /** POST one wire envelope through the raw fetch handler. */
  function post(handler: { fetch: typeof fetch }, method: string, payload: unknown): Promise<Response> {
    return handler.fetch(new Request(`http://host/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'wire-1', method, payload }),
    }))
  }

  it('routes every domain method with its schema-validated payload and the value back', async () => {
    const seen: { method: string; payload: unknown }[] = []
    const overrides: Record<string, Record<string, unknown>> = {}
    for (const wireCase of CASES) {
      const [domain = '', fn = ''] = wireCase.method.split('.')
      const domainOverrides = overrides[domain] ?? {}
      domainOverrides[fn] = recorderInto(seen)(wireCase.method, r => ok(r, { via: wireCase.method }))
      overrides[domain] = domainOverrides
    }
    const handler = toFetchHandler(scriptedApi(overrides))
    for (const wireCase of CASES) {
      const response = await post(handler, wireCase.method, wireCase.payload)
      expect(response.status).toBe(200)
      const body = await response.json() as { type: string; rpcId: string; result: { ok: boolean; value?: { via: string } } }
      expect(body.type, wireCase.method).toBe('server-response')
      expect(body.rpcId, wireCase.method).toBe('wire-1')
      expect(body.result.ok, JSON.stringify(body.result)).toBe(true)
      expect(body.result.value?.via).toBe(wireCase.method)
    }
    expect(seen).toEqual(CASES.map(wireCase => ({ method: wireCase.method, payload: wireCase.payload })))
  })

  it('serves orders.download and session.export as no-envelope GET routes with HEAD variants', async () => {
    const downloads: { orderId?: number; inline?: boolean }[] = []
    const handler = toFetchHandler(scriptedApi({
      orders: {
        download: async (payload) => {
          downloads.push(payload)
          return new Response('PDF', { status: 200, headers: { 'content-type': 'application/pdf' } })
        },
      },
      downloads: { sessionLog: async () => new Response('log', { status: 200, headers: { 'content-type': 'text/plain' } }) },
    }))
    const pdf = await handler.fetch(new Request('http://host/api/orders.download?orderId=5'))
    expect(pdf.status).toBe(200)
    expect(await pdf.text()).toBe('PDF')
    const inline = await handler.fetch(new Request('http://host/api/orders.download?orderId=6&inline=1'))
    expect(inline.status).toBe(200)
    const head = await handler.fetch(new Request('http://host/api/orders.download?orderId=7', { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(head.headers.get('content-type')).toBe('application/pdf')
    expect(head.body).toBeNull()
    expect(downloads).toEqual([{ orderId: 5 }, { orderId: 6, inline: true }, { orderId: 7 }])
    const badId = await handler.fetch(new Request('http://host/api/orders.download?orderId=abc'))
    expect(badId.status).toBe(400)
    const log = await handler.fetch(new Request('http://host/api/session.export?sessionId=s1'))
    expect(log.status).toBe(200)
    expect(await log.text()).toBe('log')
    const headLog = await handler.fetch(new Request('http://host/api/session.export?sessionId=s1', { method: 'HEAD' }))
    expect(headLog.status).toBe(200)
    expect(headLog.body).toBeNull()
    const badLog = await handler.fetch(new Request('http://host/api/session.export'))
    expect(badLog.status).toBe(400)
  })

  it('routes the tab-context uplink through the wire envelope', async () => {
    const handler = toFetchHandler(scriptedApi())
    const response = await post(handler, 'session.viewStateReport', {
      sessionId: 's-tab', view: 'kg-workbench', snapshot: {}, actions: {},
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { result: { ok: boolean; value?: { accepted: boolean } } }
    expect(body.result.ok).toBe(true)
    expect(body.result.value?.accepted).toBe(true)
  })

  it('wraps every M1/M2/M3 domain method through the in-process client', async () => {
    const NOW = '2026-09-19T00:00:00.000Z'
    const order = { id: 1, order_no: 'ORD-1', service_id: 'srv-1', service_name: '动线评估', brief: '评估', status: 'delivered' as const, created_at: NOW }
    const asset = { provider_id: 'p1', dataset_id: 'd1', title: '湖仓表', kind: 'tabular' as const }
    const edge = { id: 'e:1', relation: 'produces', source: 'n:1', target: 'n:2', asserted_by: 'kb' as const }
    const node = { id: 'n:1', type: 'company', name: '宏发食品', depth: 0 }
    const api = scriptedApi({
      orders: {
        create: r => ok(r, order),
        get: r => ok(r, order),
        list: r => ok(r, { orders: [order] }),
        fulfill: r => ok(r, order),
      },
      assets: {
        list: r => ok(r, { assets: [asset] }),
        detail: r => ok(r, asset),
        stats: r => ok(r, { products: 1, providers: 1, monthly_orders: 0, featured: [{ title: '精选', blurb: '说明', tags: ['tabular'] }] }),
      },
      connectors: {
        list: r => ok(r, { providers: [{ id: 'c1', available: true, capabilities: ['discover' as const] }] }),
        connections: r => ok(r, { connections: [{ provider_id: 'c1', transfers: 0, rows: 0 }] }),
        transfers: r => ok(r, { transfers: [{ transfer_id: 1, source: 's3', destination: 'kb' as const, dataset_id: 'd1', rows: 0, transferred_at: NOW }] }),
      },
      lakehouse: { overview: r => ok(r, { generated_at: NOW, kpis: [{ id: 'tables', label: '表数', value: 3 }] }) },
      kg: {
        mappings: r => ok(r, {
          file: 'kg-mappings.yml', version: 1,
          rules: { skipHiddenCollections: true, emptyFkNoEdge: true, derivesTitle: true },
          collections: [{ name: 'experts', fkLinkCount: 0 }],
          lastRun: { finishedAt: NOW, ruleHits: { R12: 1 }, collections: [{ scope: 'experts', nodesUpserted: 1, edgesUpserted: 0, skipped: false, skippedRelationFields: [] }] },
        }),
        schema: r => ok(r, {
          ontology_version: '1.2.0',
          node_types: [{ id: 'company', label: '企业', layer: 'domain' as const, prop_keys: [], status: 'active' as const, source: 'builtin-ontology' as const }],
          relations: [{ id: 'produces', label: '生产', constraints: [{ domain: 'company', range: 'product' }], kind: 'object' as const, source: 'builtin-ontology' as const }],
          revisions: [],
        }),
        query: r => ok(r, { nodes: [node], edges: [], seeds_resolved: ['n:1'], truncated: false, template: 'supplies', hops: 1, restated: '宏发食品的供应商' }),
        episodes: r => ok(r, { episodes: [{ uuid: 'ep-1', source: 'ai-edit' as const, name: '编辑', content: '内容', created_at: NOW, mentions: 1 }] }),
        rollback: r => ok(r, { rollback_uuid: 'ep-2', rolled_back: 'ep-1', retired: 1, restored: 1 }),
        ontologyEdit: r => ok(r, { applied: ['新增类型 dish'], revision_id: 5, episode_uuid: 'ep-3' }),
        reviewQueue: r => ok(r, { entries: [], source_episode: 'ep-4' }),
        reviewDecide: r => ok(r, { episode_uuid: 'ep-5', decided: 'merge' as const }),
        communities: r => ok(r, { communities: [{ id: 0, nodes: ['n:1', 'n:2'] }], modularity: 0.5, node_count: 2 }),
        history: r => ok(r, { nodes: [], edges: [], truncated: false, as_of: NOW }),
        search: r => ok(r, { nodes: [{ id: 'n:1', type: 'company', name: '宏发食品' }] }),
        subgraph: r => ok(r, { nodes: [node], edges: [edge], seeds_resolved: ['n:1'], truncated: false }),
        expand: r => ok(r, { nodes: [node], edges: [edge], truncated: false }),
        stats: r => ok(r, {
          triples: 1, entities: 2, node_types: 3, relations: 4, ontology_version: '1.2.0', islands: 0, conflicts: 0,
          coverage: { numerator: 1, denominator: 2, ratio: 0.5 }, last_run_at: NOW,
        }),
      },
      nocobase: {
        listMeta: r => ok(r, { collections: [{ name: 'experts', fields: [] }] }),
        list: r => ok(r, { count: 1, page: 1, page_size: 50, rows: [{ id: 1 }] }),
        get: r => ok(r, { collection: 'experts', row: { id: 1 } }),
        update: r => ok(r, { collection: 'experts', row: { id: 1, name: '张三' } }),
      },
    })
    const wire = client(api)
    type WireResult<T> = { result: { ok: true; value: T } | { ok: false; error: { message: string } } }
    const expectOk = async <T>(pending: Promise<WireResult<T>>): Promise<T> => {
      const response = await pending
      if (!response.result.ok) throw new Error(`wire rejected: ${response.result.error.message}`)
      return response.result.value
    }
    expect(await expectOk(wire.orders.create({ service_id: 'srv-1', brief: '评估' }))).toMatchObject({ order_no: 'ORD-1' })
    expect(await expectOk(wire.orders.get({ order_id: 1 }))).toMatchObject({ status: 'delivered' })
    expect(await expectOk(wire.orders.list({}))).toMatchObject({ orders: [{ id: 1 }] })
    expect(await expectOk(wire.orders.fulfill({ order_id: 1 }))).toMatchObject({ id: 1 })
    expect(await expectOk(wire.assets.list({ query: '湖仓' }))).toMatchObject({ assets: [{ dataset_id: 'd1' }] })
    expect(await expectOk(wire.assets.detail({ provider_id: 'p1', dataset_id: 'd1' }))).toMatchObject({ kind: 'tabular' })
    expect(await expectOk(wire.assets.stats({}))).toMatchObject({ products: 1 })
    expect(await expectOk(wire.connectors.list({}))).toMatchObject({ providers: [{ id: 'c1' }] })
    expect(await expectOk(wire.connectors.connections({}))).toMatchObject({ connections: [{ provider_id: 'c1' }] })
    expect(await expectOk(wire.connectors.transfers({}))).toMatchObject({ transfers: [{ transfer_id: 1 }] })
    expect(await expectOk(wire.lakehouse.overview({}))).toMatchObject({ kpis: [{ id: 'tables' }] })
    expect(await expectOk(wire.kg.mappings({}))).toMatchObject({ file: 'kg-mappings.yml' })
    expect(await expectOk(wire.kg.schema({}))).toMatchObject({ ontology_version: '1.2.0' })
    expect(await expectOk(wire.kg.query({ phrase: '宏发食品的供应商' }))).toMatchObject({ template: 'supplies' })
    expect(await expectOk(wire.kg.episodes({ limit: 5 }))).toMatchObject({ episodes: [{ uuid: 'ep-1' }] })
    expect(await expectOk(wire.kg.rollback({ episode_uuid: 'ep-1', reason: '回滚' }))).toMatchObject({ rolled_back: 'ep-1' })
    expect(await expectOk(wire.kg.ontologyEdit({ ops: [{ op: 'add_node', target_id: 'dish', label: '菜品' }] }))).toMatchObject({ revision_id: 5 })
    expect(await expectOk(wire.kg.reviewQueue({}))).toMatchObject({ source_episode: 'ep-4' })
    expect(await expectOk(wire.kg.reviewDecide({ doc_id: 'd1', row_id: 'r1', decision: 'merge' }))).toMatchObject({ decided: 'merge' })
    expect(await expectOk(wire.kg.communities({}))).toMatchObject({ node_count: 2 })
    expect(await expectOk(wire.kg.history({ as_of: NOW }))).toMatchObject({ as_of: NOW })
    expect(await expectOk(wire.kg.search({ query: '宏发', k: 5 }))).toMatchObject({ nodes: [{ name: '宏发食品' }] })
    expect(await expectOk(wire.kg.subgraph({ seeds: ['宏发食品'], hops: 1 }))).toMatchObject({ seeds_resolved: ['n:1'] })
    expect(await expectOk(wire.kg.expand({ node_id: 'n:1', limit: 10 }))).toMatchObject({ truncated: false })
    expect(await expectOk(wire.kg.stats({}))).toMatchObject({ entities: 2 })
    expect(await expectOk(wire.nocobase.listMeta({}))).toMatchObject({ collections: [{ name: 'experts' }] })
    expect(await expectOk(wire.nocobase.list({ collection: 'experts' }))).toMatchObject({ count: 1 })
    expect(await expectOk(wire.nocobase.get({ collection: 'experts', id: 1 }))).toMatchObject({ row: { id: 1 } })
    expect(await expectOk(wire.nocobase.update({ collection: 'experts', id: 1, values: { name: '张三' } }))).toMatchObject({ row: { name: '张三' } })
    expect(await expectOk(wire.sessions.viewStateReport({ sessionId: sid('s-tab'), view: 'kg-workbench', snapshot: {}, actions: {} }))).toEqual({ accepted: true })
  })

  it('streams the mux event channel as SSE and keeps the write fence tight', async () => {
    const handler = toFetchHandler(scriptedApi())
    const mux = await handler.fetch(new Request('http://host/api/events.mux'))
    expect(mux.headers.get('content-type')).toContain('text/event-stream')
    // The connected keepalive frame precedes the scripted empty stream.
    expect(await mux.text()).toBe(': connected\n\n')
    const wrongMedia = await handler.fetch(new Request('http://host/api/kg.stats', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not json',
    }))
    expect(wrongMedia.status).toBe(415)
    const notPost = await handler.fetch(new Request('http://host/api/kg.stats'))
    expect(notPost.status).toBe(404)
    const mismatched = await handler.fetch(new Request('http://host/api/kg.stats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'wire-1', method: 'kg.schema', payload: {} }),
    }))
    expect(mismatched.status).toBe(200)
    const body = await mismatched.json() as { result: { ok: boolean; error?: { message: string } } }
    expect(body.result.ok).toBe(false)
    expect(body.result.error?.message).toContain('does not match path')
  })
})
