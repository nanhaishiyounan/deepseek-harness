/**
 * Real-API smoke against MiniMax when a key exists; self-skips without one.
 * Run: MINIMAX_API_KEY=... pnpm vitest run packages/llm/llm-minimax/tests/adapter.e2e.ts
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '../src/index.ts'
import { assemble } from './assemble.ts'

function user(text: string): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'test' } })
}

const apiKey = process.env.MINIMAX_API_KEY

describe.skipIf(apiKey === undefined)('llm-minimax real API', () => {
  it('streams a real MiniMax-M3 completion with inline think separation', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmMiniMax, {})
    const result = await assemble(ctx, {
      model: 'MiniMax-M3',
      messages: [user('用一句话回答：法国的首都是哪里？')],
    })
    expect(result.finish.kind).toBe('stop')
    expect(result.usage?.outputTokens).toBeGreaterThan(0)
    const text = result.message.content.filter(b => b.type === 'text').map(b => b.type === 'text' && b.text).join('')
    expect(text).toMatch(/巴黎|Paris/u)
  }, 120_000)

  it('parallel tool calls keep unique ids and names, and replay with results never trips 2013', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmMiniMax, {})
    const tools: NonNullable<GenerateOptions['tools']> = [
      { name: 'kb_stats', description: '返回知识库统计', parameters: { type: 'object', properties: {}, additionalProperties: false } },
      { name: 'kb_search', description: '检索知识库文档', parameters: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'number' } }, required: ['query'], additionalProperties: false } },
    ]
    const step1 = await assemble(ctx, {
      model: 'MiniMax-M3',
      system: '你是出口退税助手。需要资料时，在同一个回复中并行发起全部工具调用。',
      messages: [user('退税 报关单 申报')],
      tools,
    })
    const calls = step1.message.content.filter(b => b.type === 'tool-call')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    for (const call of calls) {
      if (call.type !== 'tool-call') continue
      expect(call.id.length).toBeGreaterThan(0)
      expect(call.name.length).toBeGreaterThan(0)
      expect(['kb_stats', 'kb_search']).toContain(call.name)
    }
    expect(new Set(calls.map(c => c.type === 'tool-call' && c.id)).size).toBe(calls.length)

    const results = calls.map((call, i) => {
      const id = call.type === 'tool-call' ? call.id : CallId('')
      return createUserMessage({
        content: [{ type: 'tool-result', toolCallId: id, content: [{ type: 'text', text: `result ${i}: tenant demo-food-co, 7 documents, 41 chunks` }] }],
        source: { kind: 'plugin', plugin: 'test' },
      })
    })
    const step2 = await assemble(ctx, {
      model: 'MiniMax-M3',
      system: '你是出口退税助手。',
      messages: [user('退税 报关单 申报'), step1.message, ...results, user('请基于以上检索结果，用两句话总结要点')],
      tools,
    })
    expect(step2.finish.kind).not.toBe('error')
  }, 240_000)
})
