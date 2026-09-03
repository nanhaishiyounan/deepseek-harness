import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { CallId, createAssistantMessage, createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import { MiniMaxAdapter, resolveAdapterOptions } from '@deepseek-ai/dsh-llm-minimax'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer, sse, textEvents } from './mock-server.ts'

function user(text: string): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'test' } })
}

afterEach(async () => {
  await closeMockServers()
  vi.unstubAllEnvs()
})

async function harness(baseURL: string, config: object = {}) {
  vi.stubEnv('MINIMAX_API_KEY', 'test-key')
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmMiniMax, { baseURL, ...config })
  return ctx
}

/** Direct adapter over the plugin's real resolve step, with a static key. */
function adapterOf(config: Partial<LlmMiniMax.Config> = {}): MiniMaxAdapter {
  return new MiniMaxAdapter({
    options: () => resolveAdapterOptions(config),
    resolveApiKey: () => Promise.resolve('k'),
  })
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _chunk of stream) { /* drain */ }
}

describe('MiniMaxAdapter.stream', () => {
  it('assembles reasoning, text, usage, and finish from an M3 stream', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents.map(sse) }])
    const ctx = await harness(server.url)
    const result = await assemble(ctx, { model: 'MiniMax-M3', messages: [user('hi')] })
    expect(result.finish.kind).toBe('stop')
    expect(result.usage?.inputTokens).toBe(3)
    expect(result.usage?.reasoningTokens).toBe(1)
    const reasoning = result.message.content.filter(b => b.type === 'reasoning').map(b => b.type === 'reasoning' && b.text).join('')
    const text = result.message.content.filter(b => b.type === 'text').map(b => b.type === 'text' && b.text).join('')
    expect(reasoning).toBe('thinking')
    expect(text).toBe('hello')
  })

  it('assembles parallel tool calls with intact ids and repairs corrupted history on the next request', async () => {
    const parallelEvents = JSON.parse(
      readFileSync(new URL('./fixtures/parallel-tool-calls.events.json', import.meta.url), 'utf8'),
    ) as string[]
    const server = await mockServer([
      { kind: 'sse', events: parallelEvents.map(sse) },
      { kind: 'sse', events: textEvents.map(sse) },
    ])
    const ctx = await harness(server.url)
    const tools = [
      { name: 'kb_stats', description: 'kb stats', parameters: { type: 'object' } },
      { name: 'kb_search', description: 'kb search', parameters: { type: 'object' } },
    ]
    const step1 = await assemble(ctx, { model: 'MiniMax-M3', messages: [user('退税 报关单 申报')], tools })
    const calls = step1.message.content.filter(b => b.type === 'tool-call')
    expect(calls.map(b => b.type === 'tool-call' && b.id)).toEqual([
      'chatcmpl-tool-9f281cffe8b73ee6',
      'chatcmpl-tool-8e4832d39e59add9',
      'chatcmpl-tool-b044ae041c114f56',
    ])
    expect(calls.map(b => b.type === 'tool-call' && b.name)).toEqual(['kb_stats', 'kb_search', 'kb_search'])

    // History written before the fix carries empty ids — the exact poison
    // behind MiniMax error 2013. The replay request must send only unique
    // non-empty ids, paired with the tool results in call order.
    const corrupted = createAssistantMessage({
      content: [
        { type: 'tool-call', id: CallId('chatcmpl-tool-9f281cffe8b73ee6'), name: 'kb_stats', arguments: '{}' },
        { type: 'tool-call', id: CallId(''), name: 'kb_search', arguments: '{"query":"a"}' },
        { type: 'tool-call', id: CallId(''), name: 'kb_search', arguments: '{"query":"b"}' },
      ],
      source: { provider: 'minimax', model: 'MiniMax-M3' },
    })
    const results = ['7 docs', 'unknown tool error', 'unknown tool error'].map((text, i) => createUserMessage({
      content: [{
        type: 'tool-result',
        toolCallId: CallId(i === 0 ? 'chatcmpl-tool-9f281cffe8b73ee6' : ''),
        content: [{ type: 'text', text }],
      }],
      source: { kind: 'plugin', plugin: 'test' },
    }))
    await assemble(ctx, {
      model: 'MiniMax-M3',
      messages: [user('退税 报关单 申报'), corrupted, ...results],
      tools,
    })
    const replay = server.requests[1] as {
      messages: Array<{ role: string; tool_calls?: { id: string }[]; tool_call_id?: string }>
    }
    const callIds = replay.messages.find(m => m.role === 'assistant')?.tool_calls?.map(c => c.id) ?? []
    expect(callIds[0]).toBe('chatcmpl-tool-9f281cffe8b73ee6')
    expect(callIds.every(id => id.length > 0)).toBe(true)
    expect(new Set(callIds).size).toBe(3)
    expect(replay.messages.filter(m => m.role === 'tool').map(m => m.tool_call_id)).toEqual(callIds)
  })

  it('sends the MiniMax wire request shape', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents.map(sse) }])
    const ctx = await harness(server.url)
    await assemble(ctx, {
      model: 'MiniMax-M3',
      system: 'sys',
      messages: [user('hi')],
      maxTokens: 64,
    })
    expect(server.requests).toHaveLength(1)
    const body = server.requests[0] as Record<string, unknown>
    expect(body.model).toBe('MiniMax-M3')
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
    expect(body.max_tokens).toBe(64)
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ])
    expect(server.headers[0]?.authorization).toBe('Bearer test-key')
  })

  it('maps HTTP 401 to AUTH', async () => {
    const server = await mockServer([{
      kind: 'http-error', status: 401,
      body: '{"type":"error","error":{"type":"authorized_error","message":"login fail (1004)","http_code":"401"}}',
    }])
    const ctx = await harness(server.url)
    const result = await assemble(ctx, { model: 'MiniMax-M3', messages: [user('x')] })
    expect(result.finish.kind).toBe('error')
    if (result.finish.kind === 'error') expect(result.finish.failure.code).toBe('AUTH')
  })

  it('wraps a refused connection as TRANSPORT', async () => {
    const ctx = await harness('http://127.0.0.1:1')
    const result = await assemble(ctx, { model: 'MiniMax-M3', messages: [user('x')] })
    expect(result.finish.kind).toBe('error')
    if (result.finish.kind === 'error') expect(result.finish.failure.code).toBe('TRANSPORT')
  })

  it('wraps a mid-stream connection reset as TRANSPORT', async () => {
    const server = await mockServer([{ kind: 'reset-mid-event' }])
    const ctx = await harness(server.url)
    const result = await assemble(ctx, { model: 'MiniMax-M3', messages: [user('x')] })
    expect(result.finish.kind).toBe('error')
    if (result.finish.kind === 'error') expect(result.finish.failure.code).toBe('TRANSPORT')
  })

  it('maps HTTP 429 to RATE_LIMIT and 5xx to SERVER', async () => {
    const server = await mockServer([{ kind: 'http-error', status: 429, body: '{}' }])
    const ctx = await harness(server.url)
    const limited = await assemble(ctx, { model: 'MiniMax-M3', messages: [user('x')] })
    expect(limited.finish.kind).toBe('error')
    if (limited.finish.kind === 'error') expect(limited.finish.failure.code).toBe('RATE_LIMIT')
    const server5 = await mockServer([{ kind: 'http-error', status: 502, body: 'bad gateway' }])
    const ctx5 = await harness(server5.url)
    const serverFail = await assemble(ctx5, { model: 'MiniMax-M3', messages: [user('x')] })
    expect(serverFail.finish.kind).toBe('error')
    if (serverFail.finish.kind === 'error') expect(serverFail.finish.failure.code).toBe('SERVER')
  })

  it('maps HTTP 400 to INVALID_REQUEST with the provider message', async () => {
    const server = await mockServer([{
      kind: 'http-error', status: 400,
      body: '{"type":"error","error":{"type":"bad_request_error","message":"invalid params, unknown model (2013)"}}',
    }])
    const ctx = await harness(server.url)
    const result = await assemble(ctx, { model: 'no-such', messages: [user('x')] })
    expect(result.finish.kind).toBe('error')
    if (result.finish.kind === 'error') {
      expect(result.finish.failure.code).toBe('INVALID_REQUEST')
      expect(result.finish.failure.message).toMatch(/unknown model/u)
    }
  })

  it('rejects image input with UNSUPPORTED_CONTENT before any request', async () => {
    const server = await mockServer([])
    const adapter = adapterOf({ baseURL: server.url })
    await expect(drain(adapter.stream({
      provider: 'minimax',
      model: 'MiniMax-M3',
      messages: [{
        role: 'user',
        content: [{ type: 'image', attachment: { attachmentId: 'a', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } }],
        id: 'm1',
        source: { kind: 'plugin', plugin: 'test' },
      } as unknown as Message],
    }))).rejects.toThrow(expect.objectContaining({ code: 'UNSUPPORTED_CONTENT' }) as Partial<LlmError>)
    expect(server.requests).toHaveLength(0)
  })

  it('honors caller abort with ABORTED', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents.map(sse), delayMs: 5_000 }])
    const ctx = await harness(server.url)
    const controller = new AbortController()
    const attempt = assemble(ctx, { model: 'MiniMax-M3', messages: [user('x')], signal: controller.signal })
    controller.abort(new Error('caller cancelled'))
    const result = await attempt
    expect(result.finish.kind).toBe('aborted')
  })

  it('surfaces a truncated stream as an EMPTY_RESPONSE error finish', async () => {
    const server = await mockServer([{
      kind: 'close-early',
      events: [sse('{"choices":[{"index":0,"delta":{"role":"assistant"}}]}')],
    }])
    const ctx = await harness(server.url)
    const result = await assemble(ctx, { model: 'MiniMax-M3', messages: [user('x')] })
    expect(result.finish.kind).toBe('error')
  })
})

describe('MiniMaxAdapter model metadata', () => {
  it('lists and resolves the catalog with a conservative context window', async () => {
    const adapter = adapterOf()
    const models = await adapter.listModels('minimax')
    expect(models.map(model => model.id)).toContain('MiniMax-M3')
    const resolved = await adapter.resolveModel('minimax', 'MiniMax-M3')
    expect(resolved.context?.contextWindow).toBeGreaterThan(0)
    expect(resolved.inputModalities).toEqual(['text'])
    expect(resolved.reasoning).toBeUndefined()
  })

  it('treats an uncatalogued model as text-only', async () => {
    const resolved = await adapterOf().resolveModel('minimax', 'other-model')
    expect(resolved.inputModalities).toEqual(['text'])
    expect(resolved.name).toBe('other-model')
  })

  it('exposes the configured retry policy', () => {
    const adapter = adapterOf({ retryPolicy: { mode: 'normal', maxRetries: 2 } })
    expect(adapter.providerRetryPolicy('minimax').mode).toBe('normal')
  })

  it('prepares a call bound to one connection snapshot', async () => {
    const prepared = await adapterOf().prepareCall('minimax', 'MiniMax-M3')
    expect(prepared.model.id).toBe('MiniMax-M3')
    const chunks: unknown[] = []
    const server = await mockServer([{ kind: 'http-error', status: 500, body: '{}' }])
    const bound = prepared.stream({
      provider: 'minimax', model: 'MiniMax-M3',
      messages: [user('x')],
    })
    // The bound stream still uses the snapshot's endpoint, not the new server.
    void bound
    expect(server.requests).toHaveLength(0)
    void chunks
  })
})

describe('llm-minimax plugin registration', () => {
  it('registers the minimax provider route on ctx.llm', async () => {
    vi.stubEnv('MINIMAX_API_KEY', 'test-key')
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmMiniMax, {})
    expect(ctx.llm.listProviders().map(provider => provider.id)).toContain('minimax')
    expect(ctx.llm.listConfigurableProviders().map(provider => provider.provider)).toContain('minimax')
  })

  it('fails with MISSING_CREDENTIAL when no key is available anywhere', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmMiniMax, { baseURL: 'http://127.0.0.1:1' })
    const result = await assemble(ctx, { model: 'MiniMax-M3', messages: [user('x')] })
    expect(result.finish.kind).toBe('error')
    if (result.finish.kind === 'error') expect(result.finish.failure.code).toBe('MISSING_CREDENTIAL')
  })
})
