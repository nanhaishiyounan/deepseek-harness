import { describe, expect, it } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { CallId, createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import { serializeRequest } from '../src/serialize.ts'

function user(text: string): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'test' } })
}

function base(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return { provider: 'minimax', model: 'MiniMax-M3', messages: [], ...overrides }
}

function assistant(content: Message['content']): Message {
  return createAssistantMessage({ content, source: { provider: 'minimax', model: 'MiniMax-M3' } })
}

function userToolResult(callId: string, text: string): Message {
  return createUserMessage({
    content: [{ type: 'tool-result', toolCallId: CallId(callId), content: [{ type: 'text', text }] }],
    source: { kind: 'plugin', plugin: 'test' },
  })
}

describe('serializeRequest', () => {
  it('maps the system slot, user text, and sampling fields', () => {
    const body = serializeRequest(base({
      system: 'be brief',
      messages: [user('hi')],
      temperature: 0.2,
      maxTokens: 128,
      stop: ['END'],
    }))
    expect(body.model).toBe('MiniMax-M3')
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
    expect(body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
    ])
    expect(body.temperature).toBe(0.2)
    expect(body.max_tokens).toBe(128)
    expect(body.stop).toEqual(['END'])
  })

  it('replays assistant reasoning as an inline <think> prefix', () => {
    const body = serializeRequest(base({
      messages: [assistant([
        { type: 'reasoning', text: '内部思考' },
        { type: 'text', text: '回答' },
      ])],
    }))
    expect(body.messages).toEqual([{ role: 'assistant', content: '<think>内部思考</think>\n\n回答' }])
  })

  it('sends empty string content on tool-call-only turns, never null', () => {
    const body = serializeRequest(base({
      messages: [assistant([
        { type: 'tool-call', id: CallId('c1'), name: 'kb_search', arguments: '{"query":"x"}' },
      ])],
    }))
    expect(body.messages).toEqual([{
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'kb_search', arguments: '{"query":"x"}' } }],
    }])
  })

  it('expands tool results into role:tool messages keyed by call id', () => {
    const body = serializeRequest(base({
      messages: [
        user('查一下'),
        userToolResult('c1', '结果'),
      ],
    }))
    expect(body.messages).toEqual([
      { role: 'user', content: '查一下' },
      { role: 'tool', tool_call_id: 'c1', content: '结果' },
    ])
  })

  it('synthesizes unique ids for empty tool-call ids and pairs the results in order', () => {
    // The shape a parallel-call aggregation bug leaves in history: one valid
    // call plus two empty-id calls whose dispatch failed. MiniMax rejects the
    // replay with 2013 (`duplicate tool_call id: ""`), so the wire repair
    // must send only unique, non-empty ids — pairing each orphaned empty
    // tool_call_id with the synthesized call ids in call order.
    const body = serializeRequest(base({
      messages: [
        assistant([
          { type: 'tool-call', id: CallId('chatcmpl-tool-9f281cffe8b73ee6'), name: 'kb_stats', arguments: '{}' },
          { type: 'tool-call', id: CallId(''), name: 'kb_search', arguments: '{"query":"a"}' },
          { type: 'tool-call', id: CallId(''), name: 'kb_search', arguments: '{"query":"b"}' },
        ]),
        userToolResult('chatcmpl-tool-9f281cffe8b73ee6', '7 docs'),
        userToolResult('', 'unknown tool error'),
        userToolResult('', 'unknown tool error'),
      ],
    }))
    const messages = body.messages as Array<{ role: string; tool_calls?: { id: string }[]; tool_call_id?: string }>
    const callIds = messages.find(m => m.role === 'assistant')?.tool_calls?.map(c => c.id) ?? []
    expect(callIds[0]).toBe('chatcmpl-tool-9f281cffe8b73ee6')
    expect(callIds[1]).toMatch(/^chatcmpl-tool-synth-/u)
    expect(callIds[2]).toMatch(/^chatcmpl-tool-synth-/u)
    expect(callIds[1]).not.toBe(callIds[2])
    expect(messages.filter(m => m.role === 'tool').map(m => m.tool_call_id)).toEqual(callIds)
  })

  it('de-duplicates repeated tool-call ids across calls, pairing the surplus result with the synthesized id', () => {
    const body = serializeRequest(base({
      messages: [
        assistant([
          { type: 'tool-call', id: CallId('dup'), name: 't1', arguments: '{}' },
          { type: 'tool-call', id: CallId('dup'), name: 't2', arguments: '{}' },
        ]),
        userToolResult('dup', 'r1'),
        userToolResult('dup', 'r2'),
      ],
    }))
    const messages = body.messages as Array<{ role: string; tool_calls?: { id: string }[]; tool_call_id?: string }>
    const callIds = messages.find(m => m.role === 'assistant')?.tool_calls?.map(c => c.id) ?? []
    expect(callIds[0]).toBe('dup')
    expect(callIds[1]).toMatch(/^chatcmpl-tool-synth-/u)
    expect(messages.filter(m => m.role === 'tool').map(m => m.tool_call_id)).toEqual(callIds)
  })

  it('keeps synthetic ids unique against collisions and passes orphans through visibly', () => {
    // A raw id already occupying the first synthetic slot must not collide
    // with a synthesized one; an id no call ever claimed passes through so
    // the endpoint reports the mismatch instead of the repair hiding it.
    const body = serializeRequest(base({
      messages: [
        assistant([
          { type: 'tool-call', id: CallId('chatcmpl-tool-synth-0'), name: 't1', arguments: '{}' },
          { type: 'tool-call', id: CallId(''), name: 't2', arguments: '{}' },
        ]),
        userToolResult('chatcmpl-tool-synth-0', 'r1'),
        userToolResult('ghost', 'orphan'),
        userToolResult('', 'surplus'),
      ],
    }))
    const messages = body.messages as Array<{ role: string; tool_calls?: { id: string }[]; tool_call_id?: string }>
    expect(messages.find(m => m.role === 'assistant')?.tool_calls?.map(c => c.id))
      .toEqual(['chatcmpl-tool-synth-0', 'chatcmpl-tool-synth-1'])
    expect(messages.filter(m => m.role === 'tool').map(m => m.tool_call_id))
      .toEqual(['chatcmpl-tool-synth-0', 'ghost', 'chatcmpl-tool-synth-1'])
  })

  it('mints a fresh id for an empty surplus result and passes an unmatched duplicate through', () => {
    const body = serializeRequest(base({
      messages: [
        assistant([
          { type: 'tool-call', id: CallId('c1'), name: 't1', arguments: '{}' },
          { type: 'tool-call', id: CallId('dup'), name: 't2', arguments: '{}' },
        ]),
        userToolResult('c1', 'r1'),
        userToolResult('dup', 'r2'),
        userToolResult('', 'empty surplus'),
        userToolResult('dup', 'unmatched dup'),
      ],
    }))
    const messages = body.messages as Array<{ role: string; tool_call_id?: string }>
    expect(messages.filter(m => m.role === 'tool').map(m => m.tool_call_id))
      .toEqual(['c1', 'dup', 'chatcmpl-tool-synth-0', 'dup'])
  })

  it('leaves already-unique ids untouched on both sides', () => {
    const body = serializeRequest(base({
      messages: [
        assistant([
          { type: 'tool-call', id: CallId('a'), name: 't1', arguments: '{}' },
          { type: 'tool-call', id: CallId('b'), name: 't2', arguments: '{}' },
        ]),
        userToolResult('a', 'r1'),
        userToolResult('b', 'r2'),
      ],
    }))
    const messages = body.messages as Array<{ role: string; tool_calls?: { id: string }[]; tool_call_id?: string }>
    expect(messages.find(m => m.role === 'assistant')?.tool_calls?.map(c => c.id)).toEqual(['a', 'b'])
    expect(messages.filter(m => m.role === 'tool').map(m => m.tool_call_id)).toEqual(['a', 'b'])
  })

  it('maps tool schemas onto the wire tools array', () => {
    const body = serializeRequest(base({
      tools: [{ name: 'kb_search', description: 'search kb', parameters: { type: 'object' } }],
    }))
    expect(body.tools).toEqual([{
      type: 'function',
      function: { name: 'kb_search', description: 'search kb', parameters: { type: 'object' } },
    }])
  })

  it('omits optional fields instead of sending null', () => {
    const body = serializeRequest(base({ messages: [user('x')] }))
    expect('tools' in body).toBe(false)
    expect('temperature' in body).toBe(false)
    expect('max_tokens' in body).toBe(false)
    expect('stop' in body).toBe(false)
  })

  it('rejects image content the endpoint cannot accept', () => {
    const imageMessage = {
      role: 'user',
      content: [{ type: 'image' as const, attachment: { attachmentId: 'a' as never, mediaType: 'image/png' as const, bytes: 1, width: 1, height: 1 } }],
      id: 'm1' as never,
      source: { kind: 'plugin' as const, plugin: 'test' },
    } as Message
    expect(() => serializeRequest(base({ messages: [imageMessage] }))).toThrow(LlmError)
  })

  it('rejects a reasoning effort the endpoint cannot honor', () => {
    expect(() => serializeRequest(base({ reasoningEffort: 'high' as never }))).toThrow(/UNSUPPORTED|reasoning/u)
  })
})
