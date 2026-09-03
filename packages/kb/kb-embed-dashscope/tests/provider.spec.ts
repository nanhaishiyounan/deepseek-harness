import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { DashScopeEmbedProvider, DEFAULT_BACKOFF_BASE_MS, DEFAULT_BACKOFF_MAX_MS } from '../src/index.ts'

/** One scripted response for the next embeddings request. */
type Behavior =
  | { kind: 'ok'; vectors?: number[][]; delayMs?: number }
  | { kind: 'http-error'; status: number; body: string }
  | { kind: 'payload'; body: string }

interface EmbedMockServer {
  url: string
  /** Parsed request bodies, in order. */
  requests: Array<{ body: { model: string; input: string[]; dimensions: number }; authorization: string }>
  script: Behavior[]
  close(): Promise<void>
}

const servers: Server[] = []

async function closeServers(): Promise<void> {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
}

/** Local DashScope-compatible /embeddings stand-in replaying scripted behaviors. */
async function embedMockServer(script: Behavior[]): Promise<EmbedMockServer> {
  const requests: EmbedMockServer['requests'] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { model: string; input: string[]; dimensions: number }
      requests.push({ body, authorization: request.headers.authorization ?? '' })
      const behavior = script.shift()
      if (behavior === undefined) {
        response.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"unexpected request"}')
        return
      }
      if (behavior.kind === 'ok') {
        const vectors = behavior.vectors ?? body.input.map(() => [0.25, 0.5])
        const payload = JSON.stringify({
          data: vectors.map((embedding, index) => ({ object: 'embedding', embedding, index })),
          model: body.model,
          usage: { total_tokens: body.input.length },
        })
        if (behavior.delayMs === undefined) {
          response.writeHead(200, { 'content-type': 'application/json' }).end(payload)
        } else {
          setTimeout(() => response.writeHead(200, { 'content-type': 'application/json' }).end(payload), behavior.delayMs)
        }
        return
      }
      if (behavior.kind === 'payload') {
        // An arbitrary 200 body, for malformed-payload decode paths.
        response.writeHead(200, { 'content-type': 'application/json' }).end(behavior.body)
        return
      }
      response.writeHead(behavior.status, { 'content-type': 'application/json' }).end(behavior.body)
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server has no address')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    script,
    close: async () => { await new Promise(resolve => server.close(resolve)) },
  }
}

type ProviderOptions = ConstructorParameters<typeof DashScopeEmbedProvider>[0]

function provider(baseURL: string, overrides: Partial<ProviderOptions> = {}): DashScopeEmbedProvider {
  return new DashScopeEmbedProvider({
    baseURL,
    model: 'text-embedding-v4',
    dimensions: 2,
    batchSize: 2,
    timeoutMs: 500,
    maxRetries: 0,
    backoffBaseMs: DEFAULT_BACKOFF_BASE_MS,
    backoffMaxMs: DEFAULT_BACKOFF_MAX_MS,
    resolveKey: () => 'test-key',
    fetch: globalThis.fetch,
    ...overrides,
  })
}

afterEach(async () => { await closeServers() })

describe('DashScopeEmbedProvider.embed', () => {
  it('embeds one batch with the OpenAI-compatible wire format', async () => {
    const server = await embedMockServer([{ kind: 'ok' }])
    const instance = provider(server.url)
    const vectors = await instance.embed(['食品成本', '食安法规'])
    expect(vectors).toHaveLength(2)
    expect([...vectors[0]!]).toEqual([0.25, 0.5])
    expect(server.requests).toHaveLength(1)
    const first = server.requests[0]
    expect(first?.body.model).toBe('text-embedding-v4')
    expect(first?.body.input).toEqual(['食品成本', '食安法规'])
    expect(first?.body.dimensions).toBe(2)
    expect(first?.authorization).toBe('Bearer test-key')
  })

  it('splits oversized inputs into ordered batches', async () => {
    const server = await embedMockServer([{ kind: 'ok' }, { kind: 'ok' }, { kind: 'ok' }])
    const instance = provider(server.url) // batchSize 2
    const vectors = await instance.embed(['a', 'b', 'c', 'd', 'e'])
    expect(vectors).toHaveLength(5)
    expect(server.requests.map(request => request.body.input)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  })

  it('retries an HTTP 429 and succeeds on the second attempt', async () => {
    const server = await embedMockServer([
      { kind: 'http-error', status: 429, body: '{"error":{"message":"rate limited","code":"Throttling"}}' },
      { kind: 'ok' },
    ])
    const debug: string[] = []
    const instance = provider(server.url, { maxRetries: 1, debug: (message) => { debug.push(message) } })
    await expect(instance.embed(['a'])).resolves.toHaveLength(1)
    expect(server.requests).toHaveLength(2)
    expect(debug).toHaveLength(1)
    expect(debug[0]).toMatch(/attempt 1 failed \(HTTP 429\); retrying/u)
  })

  it('logs a network-level retry through the debug sink', async () => {
    const debug: string[] = []
    const dead = provider('http://127.0.0.1:1', { maxRetries: 1, timeoutMs: 250, debug: (message) => { debug.push(message) } })
    await expect(dead.embed(['a'])).rejects.toThrow()
    expect(debug).toHaveLength(1)
    expect(debug[0]).toContain('attempt 1 failed (Type')
  })

  it('waits a configurable backoff base before retrying', async () => {
    const server = await embedMockServer([
      { kind: 'http-error', status: 429, body: '{}' },
      { kind: 'ok' },
    ])
    const instance = provider(server.url, { maxRetries: 1, backoffBaseMs: 400 })
    const startedAt = Date.now()
    await instance.embed(['a'])
    // Jitter keeps one delay in [200, 400) ms; the default base of 100 ms
    // could never reach the 200 ms lower bound.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(200)
  })

  it('caps one backoff delay at backoffMaxMs', async () => {
    const server = await embedMockServer([
      { kind: 'http-error', status: 429, body: '{}' },
      { kind: 'http-error', status: 429, body: '{}' },
      { kind: 'ok' },
    ])
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const instance = provider(server.url, { maxRetries: 2, backoffBaseMs: 200, backoffMaxMs: 220 })
      const startedAt = Date.now()
      await instance.embed(['a'])
      // Fixed 0.995 jitter factor: 200 × 0.995 + min(400, 220) × 0.995
      // ≈ 418 ms total; uncapped doubling would exceed 590 ms.
      const elapsed = Date.now() - startedAt
      expect(elapsed).toBeGreaterThanOrEqual(380)
      expect(elapsed).toBeLessThanOrEqual(520)
    } finally {
      random.mockRestore()
    }
  })

  it('retries a 5xx response and a network failure', async () => {
    const server = await embedMockServer([
      { kind: 'http-error', status: 503, body: '{}' },
      { kind: 'ok' },
    ])
    const instance = provider(server.url, { maxRetries: 1 })
    await expect(instance.embed(['a'])).resolves.toHaveLength(1)
    const dead = provider('http://127.0.0.1:1', { maxRetries: 1, timeoutMs: 250 })
    await expect(dead.embed(['a'])).rejects.toThrow()
  })

  it('fails loud after exhausting retries', async () => {
    const server = await embedMockServer([
      { kind: 'http-error', status: 500, body: '{}' },
      { kind: 'http-error', status: 500, body: '{}' },
    ])
    const instance = provider(server.url, { maxRetries: 1 })
    await expect(instance.embed(['a'])).rejects.toThrow(/500/u)
    expect(server.requests).toHaveLength(2)
  })

  it('does not retry an authentication failure', async () => {
    const server = await embedMockServer([
      { kind: 'http-error', status: 401, body: '{"error":{"message":"Invalid API-key","code":"InvalidApiKey"}}' },
    ])
    const instance = provider(server.url, { maxRetries: 3 })
    await expect(instance.embed(['a'])).rejects.toThrow(/Invalid API-key/u)
    expect(server.requests).toHaveLength(1)
  })

  it('rejects a dimensionality mismatch', async () => {
    const server = await embedMockServer([{ kind: 'ok', vectors: [[0.1, 0.2, 0.3]] }])
    const instance = provider(server.url)
    await expect(instance.embed(['a'])).rejects.toThrow(/dimension/iu)
  })

  it('times out a slow response', async () => {
    const server = await embedMockServer([{ kind: 'ok', delayMs: 5_000 }])
    const instance = provider(server.url, { timeoutMs: 100 })
    await expect(instance.embed(['a'])).rejects.toThrow(/timed out|timeout|abort/iu)
  })

  it('rejects an already-aborted signal before any request', async () => {
    const server = await embedMockServer([])
    const instance = provider(server.url)
    const controller = new AbortController()
    controller.abort(new Error('caller cancelled'))
    await expect(instance.embed(['a'], controller.signal)).rejects.toThrow(/caller cancelled/u)
    expect(server.requests).toHaveLength(0)
  })

  it('rejects an empty input batch', async () => {
    const server = await embedMockServer([])
    const instance = provider(server.url)
    await expect(instance.embed([])).rejects.toThrow(/non-empty|empty/iu)
    expect(server.requests).toHaveLength(0)
  })

  it('fails loud at construction when backoffBaseMs exceeds backoffMaxMs', () => {
    expect(() => provider('http://127.0.0.1:1', { backoffBaseMs: 1000, backoffMaxMs: 500 })).toThrow(
      /\[kb-embed\] backoffBaseMs \(1000\) must be less than or equal to backoffMaxMs \(500\)/u,
    )
  })

  it('fails when no credential is configured', async () => {
    const server = await embedMockServer([])
    const instance = provider(server.url, { resolveKey: () => undefined })
    await expect(instance.embed(['a'])).rejects.toThrow(/DASHSCOPE_API_KEY|credential|key/iu)
    expect(server.requests).toHaveLength(0)
  })

  it('treats an empty resolved key as missing', async () => {
    const server = await embedMockServer([])
    const instance = provider(server.url, { resolveKey: () => '' })
    expect(instance.available()).toBe(false)
    await expect(instance.embed(['a'])).rejects.toThrow(/credential|key/iu)
    expect(server.requests).toHaveLength(0)
  })

  it('wraps a bare abort reason as an Error for an already-aborted signal', async () => {
    const server = await embedMockServer([])
    const instance = provider(server.url)
    const controller = new AbortController()
    controller.abort('bare-string-reason')
    await expect(instance.embed(['a'], controller.signal)).rejects.toThrow('the operation was aborted')
    expect(server.requests).toHaveLength(0)
  })

  it('surfaces the caller abort while a request is in flight', async () => {
    const server = await embedMockServer([{ kind: 'ok', delayMs: 5_000 }])
    const instance = provider(server.url, { timeoutMs: 2_000 })
    const controller = new AbortController()
    const pending = instance.embed(['a'], controller.signal)
    await new Promise((resolve) => { setTimeout(resolve, 30) })
    controller.abort(new Error('caller cancelled'))
    await expect(pending).rejects.toThrow(/caller cancelled/u)
  })

  it('cuts the retry backoff short when the caller aborts with an Error reason', async () => {
    const server = await embedMockServer([
      { kind: 'http-error', status: 429, body: '{}' },
    ])
    const instance = provider(server.url, { maxRetries: 3 })
    const controller = new AbortController()
    const pending = instance.embed(['a'], controller.signal)
    await new Promise((resolve) => { setTimeout(resolve, 30) })
    controller.abort(new Error('caller cancelled'))
    await expect(pending).rejects.toThrow(/caller cancelled/u)
    expect(server.requests).toHaveLength(1)
  })

  it('cuts the retry backoff short when the caller aborts with a bare reason', async () => {
    const server = await embedMockServer([
      { kind: 'http-error', status: 429, body: '{}' },
    ])
    const instance = provider(server.url, { maxRetries: 3 })
    const controller = new AbortController()
    const pending = instance.embed(['a'], controller.signal)
    await new Promise((resolve) => { setTimeout(resolve, 30) })
    controller.abort('bare-string-reason')
    await expect(pending).rejects.toThrow('the operation was aborted')
    expect(server.requests).toHaveLength(1)
  })

  it('rejects a 200 response whose body is not JSON', async () => {
    const server = await embedMockServer([{ kind: 'http-error', status: 200, body: '<html>not json</html>' }])
    const instance = provider(server.url)
    await expect(instance.embed(['a'])).rejects.toThrow(/not JSON/u)
  })

  it('falls back to the bare HTTP status when the error body carries no message', async () => {
    const server = await embedMockServer([{ kind: 'http-error', status: 502, body: 'null' }])
    const instance = provider(server.url)
    await expect(instance.embed(['a'])).rejects.toThrow(/HTTP 502/u)
  })

  it('reads the DashScope native top-level message envelope', async () => {
    const server = await embedMockServer([{
      kind: 'http-error', status: 401,
      body: '{"message":"Invalid API key in native envelope","code":"InvalidApiKey"}',
    }])
    const instance = provider(server.url)
    await expect(instance.embed(['a'])).rejects.toThrow(/native envelope/u)
  })

  it('skips a non-string or empty error.message and falls through', async () => {
    const nonString = await embedMockServer([{
      kind: 'http-error', status: 401, body: '{"error":{"message":42}}',
    }])
    await expect(provider(nonString.url).embed(['a'])).rejects.toThrow(/HTTP 401/u)
    const empty = await embedMockServer([{
      kind: 'http-error', status: 403, body: '{"error":{"message":""},"message":"denied by quota"}',
    }])
    await expect(provider(empty.url).embed(['a'])).rejects.toThrow(/denied by quota/u)
  })

  it('rejects a data entry that is not an object', async () => {
    const server = await embedMockServer([{ kind: 'payload', body: '{"data":["oops"]}' }])
    const instance = provider(server.url)
    await expect(instance.embed(['a'])).rejects.toThrow(/entry is not an object/u)
  })

  it('rejects a data entry without an embedding array', async () => {
    const server = await embedMockServer([{ kind: 'payload', body: '{"data":[{"index":0}]}' }])
    const instance = provider(server.url)
    await expect(instance.embed(['a'])).rejects.toThrow(/no embedding array/u)
  })

  it('rejects non-number, non-integer, and negative indices', async () => {
    const asString = await embedMockServer([{
      kind: 'payload', body: '{"data":[{"index":"0","embedding":[0.1,0.2]}]}',
    }])
    await expect(provider(asString.url).embed(['a'])).rejects.toThrow(/out-of-range index/u)
    const fractional = await embedMockServer([{
      kind: 'payload', body: '{"data":[{"index":0.5,"embedding":[0.1,0.2]}]}',
    }])
    await expect(provider(fractional.url).embed(['a'])).rejects.toThrow(/out-of-range index/u)
    const negative = await embedMockServer([{
      kind: 'payload', body: '{"data":[{"index":-1,"embedding":[0.1,0.2]}]}',
    }])
    await expect(provider(negative.url).embed(['a'])).rejects.toThrow(/out-of-range index/u)
  })
})
