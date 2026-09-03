import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

/** One scripted behavior for the next request the mock server receives. */
export type Behavior =
  | { kind: 'sse'; events: string[]; delayMs?: number }
  | { kind: 'http-error'; status: number; body: string; contentType?: string; headers?: Record<string, string> }
  | { kind: 'close-early'; events: string[] }
  | { kind: 'reset-mid-event' }

export interface MockServer {
  url: string
  /** Bodies of received requests, in order. */
  requests: unknown[]
  /** Header bags of received requests, in order (parallel to `requests`). */
  headers: IncomingMessage['headers'][]
  script: Behavior[]
  close(): Promise<void>
}

const servers: Server[] = []

/** Close every server opened since the last call; run from each spec's afterEach. */
export async function closeMockServers(): Promise<void> {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
}

/** Frame one SSE data event. */
export function sse(payload: string): string {
  return `data: ${payload}\n\n`
}

/**
 * A minimal complete M3-style text generation: inline `<think>` reasoning,
 * visible text, an empty-string finish_reason on intermediate chunks, the
 * terminal finish chunk, and a trailing usage-only chunk with NO `[DONE]`.
 */
export const textEvents = [
  '{"choices":[{"index":0,"delta":{"role":"assistant"}}]}',
  '{"choices":[{"index":0,"delta":{"content":"<think>think"},"finish_reason":""}]}',
  '{"choices":[{"index":0,"delta":{"content":"ing</think>\\n\\nhello"},"finish_reason":""}]}',
  '{"choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":"stop"}]}',
  '{"choices":[],"usage":{"total_tokens":4,"prompt_tokens":3,"completion_tokens":1,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens_details":{"cached_tokens":0}}}',
]

/** Local MiniMax chat-completions stand-in: replays scripted behaviors per request. */
export async function mockServer(script: Behavior[]): Promise<MockServer> {
  const requests: unknown[] = []
  const headers: IncomingMessage['headers'][] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      headers.push(request.headers)
      const behavior = script.shift()
      if (!behavior) {
        response.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"unexpected request"}')
        return
      }
      if (behavior.kind === 'http-error') {
        response.writeHead(behavior.status, {
          'content-type': behavior.contentType ?? 'application/json',
          ...behavior.headers,
        }).end(behavior.body)
        return
      }
      if (behavior.kind === 'reset-mid-event') {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        // A partial event frame, then a socket reset after the headers have
        // been delivered: the client's body read fails mid-stream instead of
        // the whole fetch rejecting before any response arrives.
        response.write('data: {"choices":[')
        setTimeout(() => { response.destroy() }, 50)
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      if (behavior.kind === 'close-early') {
        response.write(behavior.events.join(''))
        response.destroy()
        return
      }
      if (behavior.delayMs === undefined) {
        response.end(behavior.events.join(''))
        return
      }
      setTimeout(() => response.end(behavior.events.join('')), behavior.delayMs)
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server has no address')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    headers,
    script,
    close: async () => { await new Promise(resolve => server.close(resolve)) },
  }
}
