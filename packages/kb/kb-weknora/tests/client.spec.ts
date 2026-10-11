import { describe, expect, it } from 'vitest'
import { WeknoraApiError, WeknoraClient } from '../src/client.ts'

/** Recorded request handed to the fake fetch. */
interface Recorded {
  url: string
  init: RequestInit
}

/** One canned JSON object shape the stub answers with. */
type RouteData =
  | ReadonlyArray<Record<string, unknown>>
  | Record<string, unknown>
  | ((url: string) => ReadonlyArray<Record<string, unknown>> | Record<string, unknown>)

/** Route table entry: match by URL and method, answer with a data value or an HTTP error status. */
interface Route {
  match: (url: string, method: string) => boolean
  status?: number
  /** Static data value, or a function of the request URL (for page-parameterized responses). */
  data?: RouteData
}

/** Build a fetch stub answering per-route with a `{success, data}` envelope, recording calls. */
function fakeFetch(routes: Route[]): { fetch: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = []
  const stub = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    if ((init.signal as AbortSignal | undefined)?.aborted === true) {
      throw new DOMException('The operation was aborted', 'AbortError')
    }
    const url = String(input)
    const method = String(init.method ?? 'GET')
    calls.push({ url, init })
    const route = routes.find(entry => entry.match(url, method))
    if (route === undefined) return new Response('{"success":true,"data":[]}', { status: 200 })
    const payload = typeof route.data === 'function' ? route.data(url) : route.data ?? []
    return new Response(JSON.stringify({ success: true, data: payload }), { status: route.status ?? 200 })
  }
  return { fetch: stub as unknown as typeof fetch, calls }
}

describe('WeknoraClient', () => {
  it('omits the API key header when none is configured', async () => {
    const { fetch, calls } = fakeFetch([{ match: url => url.endsWith('/api/v1/knowledge-bases') }])
    const client = new WeknoraClient({ baseUrl: 'http://host', fetch })
    await client.listKnowledgeBases()
    expect(calls[0]?.init.headers).not.toHaveProperty('X-API-Key')
  })

  it('stringifies a non-Error transport cause in the thrown error', async () => {
    const raw = (async () => { throw 'plain string failure' }) as unknown as typeof fetch
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch: raw })
    const error = await client.listKnowledgeBases().then(() => undefined, (cause: unknown) => cause)
    expect(error).toBeInstanceOf(WeknoraApiError)
    expect((error as WeknoraApiError).message).toContain('plain string failure')
  })

  it('carries the knowledge-base document count when the API ships one', async () => {
    const { fetch } = fakeFetch([{ match: url => url.endsWith('/api/v1/knowledge-bases'), data: [{ id: 'kb-1', name: 'demo/a', knowledge_count: 7 }] }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await expect(client.listKnowledgeBases()).resolves.toEqual([{ id: 'kb-1', name: 'demo/a', knowledge_count: 7 }])
  })

  it('parses null and scalar envelopes into the empty-record fallback', async () => {
    for (const body of ['null', '5', '"text"']) {
      const raw = async (): Promise<Response> => new Response(body, { status: 200 })
      const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch: raw as unknown as typeof fetch })
      await expect(client.createKnowledgeBase('demo/x')).rejects.toBeInstanceOf(WeknoraApiError)
      await expect(client.createManualKnowledge('kb-1', 't', 'c')).rejects.toBeInstanceOf(WeknoraApiError)
    }
  })

  it('parses an envelope whose data member is a scalar into the record fallback', async () => {
    const raw = async (): Promise<Response> => new Response(JSON.stringify({ success: true, data: 'flat' }), { status: 200 })
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch: raw as unknown as typeof fetch })
    await expect(client.createManualKnowledge('kb-1', 't', 'c')).rejects.toBeInstanceOf(WeknoraApiError)
  })

  it('drops null entries from hybrid-search results too', async () => {
    const mixed = [{ id: 'h1' }, null] as unknown as Array<Record<string, unknown>>
    const { fetch } = fakeFetch([{ match: url => url.includes('/hybrid-search'), data: mixed }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await expect(client.hybridSearch('kb-1', 'q', new Float32Array([1]), 4)).resolves.toEqual([{ id: 'h1' }])
  })

  it('sends the API key header and JSON bodies against the api/v1 root', async () => {
    const { fetch, calls } = fakeFetch([{ match: url => url.endsWith('/api/v1/knowledge-bases') }])
    const client = new WeknoraClient({ baseUrl: 'http://host:18081/', apiKey: 'key-1', fetch })
    await client.listKnowledgeBases()
    expect(calls[0]?.url).toBe('http://host:18081/api/v1/knowledge-bases')
    expect(calls[0]?.init.headers).toMatchObject({ 'X-API-Key': 'key-1' })
  })

  it('aborts through the per-request timeout', async () => {
    const stub = (_input: string | URL | Request, init: RequestInit = {}): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted', 'AbortError')), { once: true })
      })
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch: stub as unknown as typeof fetch, timeoutMs: 10 })
    const error = await client.listKnowledgeBases().then(() => undefined, (cause: unknown) => cause)
    expect(error).toBeInstanceOf(WeknoraApiError)
    expect((error as WeknoraApiError).status).toBeUndefined()
  })

  it('honors a live caller signal through the abort forwarding', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const stub = async (_input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
      await gate
      if ((init.signal as AbortSignal | undefined)?.aborted === true) {
        throw new DOMException('The operation was aborted', 'AbortError')
      }
      return new Response('{"success":true,"data":[]}', { status: 200 })
    }
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch: stub as unknown as typeof fetch })
    const controller = new AbortController()
    const pending = client.listKnowledgeBases(controller.signal)
    controller.abort(new Error('mid-flight cancellation'))
    release?.()
    const error = await pending.then(() => undefined, (cause: unknown) => cause)
    expect(error).toBeInstanceOf(WeknoraApiError)
    expect((error as WeknoraApiError).status).toBeUndefined()
  })

  it('maps an HTTP error status onto the thrown error', async () => {
    const { fetch } = fakeFetch([{ match: url => url.includes('/knowledge-bases'), status: 403 }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    const error = await client.listKnowledgeBases().then(() => undefined, (cause: unknown) => cause)
    expect(error).toBeInstanceOf(WeknoraApiError)
    expect((error as WeknoraApiError).status).toBe(403)
  })

  it('marks a transport failure with no status', async () => {
    const failing = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch: failing })
    const error = await client.listKnowledgeBases().then(() => undefined, (cause: unknown) => cause)
    expect(error).toBeInstanceOf(WeknoraApiError)
    expect((error as WeknoraApiError).status).toBeUndefined()
  })

  it('healthy() answers true on 2xx and false on transport failure', async () => {
    const up = fakeFetch([{ match: url => url.endsWith('/health'), status: 200 }])
    const down: typeof fetch = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    expect(await new WeknoraClient({ baseUrl: 'http://host', fetch: up.fetch }).healthy()).toBe(true)
    expect(await new WeknoraClient({ baseUrl: 'http://host', fetch: down }).healthy()).toBe(false)
  })

  it('creates a knowledge base and surfaces the id', async () => {
    const { fetch, calls } = fakeFetch([{ match: url => url.endsWith('/api/v1/knowledge-bases'), data: { id: 'kb-9', name: 't/c' } }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await expect(client.createKnowledgeBase('t/c')).resolves.toEqual({ id: 'kb-9', name: 't/c' })
    expect(String(calls[0]?.init.method)).toBe('POST')
    expect(String(calls[0]?.init.body)).toBe('{"name":"t/c"}')
  })

  it('fails loud when the create response carries no id', async () => {
    const { fetch } = fakeFetch([{ match: url => url.endsWith('/api/v1/knowledge-bases'), data: { name: 't/c' } }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await expect(client.createKnowledgeBase('t/c')).rejects.toBeInstanceOf(WeknoraApiError)
  })

  it('skips malformed document entries while keeping valid ones', async () => {
    const hostile = [null, 'junk', { id: 5 }, { id: 'bare' }, { id: 'named', file_name: 'x.pdf', title: 't' }] as unknown as Array<Record<string, unknown>>
    const { fetch } = fakeFetch([{
      match: url => url.includes('/knowledge?'),
      data: hostile,
    }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await expect(client.listDocuments('kb-1')).resolves.toEqual([
      { id: 'bare' },
      { id: 'named', file_name: 'x.pdf', title: 't' },
    ])
  })

  it('walks every document page until a short page arrives', async () => {
    const pages = new Map<string, ReadonlyArray<Record<string, unknown>>>([
      ['1', Array.from({ length: 100 }, (_, index) => ({ id: `k-${index}` }))],
      ['2', [{ id: 'k-100', title: 'a' }]],
    ])
    const { fetch } = fakeFetch([{
      match: url => url.includes('/knowledge?'),
      data: url => pages.get(new URL(url).searchParams.get('page') ?? '') ?? [],
    }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    const documents = await client.listDocuments('kb-1')
    expect(documents).toHaveLength(101)
    expect(documents[100]).toMatchObject({ id: 'k-100', title: 'a' })
  })

  it('fails loud when the manual-create response carries no id in every degenerate shape', async () => {
    const shapes: Array<{ status: number; data: RouteData }> = [
      { status: 200, data: [] },
      { status: 200, data: { id: 5 } },
    ]
    for (const shape of shapes) {
      const { fetch } = fakeFetch([{ match: url => url.includes('/knowledge/manual'), status: shape.status, data: shape.data }])
      const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
      await expect(client.createManualKnowledge('kb-1', 't', 'c')).rejects.toBeInstanceOf(WeknoraApiError)
    }
  })

  it('drops null entries from retrieval results', async () => {
    const mixed = [{ id: 'c1' }, null, 'junk'] as unknown as Array<Record<string, unknown>>
    const { fetch } = fakeFetch([{ match: url => url.endsWith('/knowledge-search'), data: mixed }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await expect(client.knowledgeSearch('q', ['kb-1'], 3)).resolves.toEqual([{ id: 'c1' }])
  })

  it('creates manual knowledge with the encoded title and reassembled content', async () => {
    const { fetch, calls } = fakeFetch([{ match: url => url.includes('/knowledge/manual'), data: { id: 'kn-1' } }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await expect(client.createManualKnowledge('kb-1', '[report] a/b.md', 'body')).resolves.toBe('kn-1')
    expect(String(calls[0]?.init.body)).toBe('{"title":"[report] a/b.md","content":"body","status":"publish"}')
  })

  it('deletes knowledge by id', async () => {
    const { fetch, calls } = fakeFetch([{ match: (url, method) => url.includes('/knowledge/kn-1') && method === 'DELETE', status: 200 }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await client.deleteKnowledge('kn-1')
    expect(calls[0]?.url).toContain('/api/v1/knowledge/kn-1')
  })

  it('posts knowledge-search with the kb scope and match count', async () => {
    const { fetch, calls } = fakeFetch([{ match: url => url.endsWith('/knowledge-search'), data: [{ id: 'c1', knowledge_id: 'kn-1' }] }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    const hits = await client.knowledgeSearch('q', ['kb-1', 'kb-2'], 5)
    expect(hits).toEqual([{ id: 'c1', knowledge_id: 'kn-1' }])
    expect(String(calls[0]?.init.body)).toBe('{"query":"q","knowledge_base_ids":["kb-1","kb-2"],"match_count":5}')
  })

  it('rejects an already-aborted caller signal before any request work', async () => {
    const { fetch, calls } = fakeFetch([])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    const controller = new AbortController()
    controller.abort(new Error('caller gave up'))
    const error = await client.listKnowledgeBases(controller.signal).then(() => undefined, (cause: unknown) => cause)
    expect(error).toBeInstanceOf(WeknoraApiError)
    expect(calls).toHaveLength(0)
  })

  it('skips malformed knowledge-base entries and missing names', async () => {
    const hostile = [null, 'junk', { id: 7 }, { name: 'no-id' }, { id: 'kb-1', name: 'demo/a' }] as unknown as Array<Record<string, unknown>>
    const { fetch } = fakeFetch([{
      match: url => url.endsWith('/api/v1/knowledge-bases'),
      data: hostile,
    }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await expect(client.listKnowledgeBases()).resolves.toEqual([{ id: 'kb-1', name: 'demo/a' }])
  })

  it('falls back to the requested name when the created entry ships none', async () => {
    const { fetch } = fakeFetch([{ match: url => url.endsWith('/api/v1/knowledge-bases'), data: { id: 'kb-x' } }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await expect(client.createKnowledgeBase('demo/x')).resolves.toEqual({ id: 'kb-x', name: 'demo/x' })
  })

  it('keeps document entries without title or file name', async () => {
    const { fetch } = fakeFetch([{ match: url => url.includes('/knowledge?'), data: [{ id: 'bare' }, { id: 'named', file_name: 'x.pdf' }] }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await expect(client.listDocuments('kb-1')).resolves.toEqual([{ id: 'bare' }, { id: 'named', file_name: 'x.pdf' }])
  })

  it('parses a bare-array envelope with no success wrapper', async () => {
    const raw = async (): Promise<Response> => new Response(JSON.stringify([{ id: 'c1' }]), { status: 200 })
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch: raw as unknown as typeof fetch })
    await expect(client.knowledgeSearch('q', ['kb-1'], 3)).resolves.toEqual([{ id: 'c1' }])
  })

  it('parses an envelope whose data is not an array into no hits', async () => {
    const raw = async (): Promise<Response> => new Response(JSON.stringify({ success: true, data: { note: 'object' } }), { status: 200 })
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch: raw as unknown as typeof fetch })
    await expect(client.knowledgeSearch('q', ['kb-1'], 3)).resolves.toEqual([])
  })

  it('parses an empty response body as an empty envelope', async () => {
    const raw = async (): Promise<Response> => new Response('', { status: 200 })
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch: raw as unknown as typeof fetch })
    await expect(client.listKnowledgeBases()).resolves.toEqual([])
  })

  it('posts hybrid-search with the query embedding array', async () => {
    const { fetch, calls } = fakeFetch([{ match: url => url.includes('/hybrid-search'), data: [] }])
    const client = new WeknoraClient({ baseUrl: 'http://host', apiKey: 'key-1', fetch })
    await client.hybridSearch('kb-1', 'q', new Float32Array([0.5, -0.5]), 4)
    expect(String(calls[0]?.init.body)).toBe('{"query_text":"q","query_embedding":[0.5,-0.5],"top_k":4}')
  })
})
