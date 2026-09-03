import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { translate } from '../src/translate.ts'

/** Feed payloads as an async iterable, collecting every emitted chunk. */
async function run(values: string[]): Promise<StreamChunk[]> {
  const source = (async function* () { yield* values })()
  const chunks: StreamChunk[] = []
  for await (const chunk of translate(source)) chunks.push(chunk)
  return chunks
}

function chunk(delta: unknown, finish?: string, usage?: unknown): string {
  return JSON.stringify({
    choices: finish === undefined ? [{ index: 0, delta }] : [{ index: 0, delta, finish_reason: finish }],
    ...usage === undefined ? {} : { usage },
  })
}

function usageChunk(): string {
  return JSON.stringify({
    choices: [],
    usage: {
      total_tokens: 466, prompt_tokens: 413, completion_tokens: 53,
      completion_tokens_details: { reasoning_tokens: 17 },
      prompt_tokens_details: { cached_tokens: 128 },
    },
  })
}

describe('translate: inline <think> separation', () => {
  it('splits a simple think-then-answer stream', async () => {
    const chunks = await run([
      chunk({ role: 'assistant' }),
      chunk({ content: '<think>思考' }),
      chunk({ content: '内容</think>' }),
      chunk({ content: '\n\n回答' }),
      chunk({ content: '文本' }),
      chunk({ role: 'assistant' }, 'stop'),
      usageChunk(),
    ])
    const starts = chunks.filter(c => c.type === 'block-start')
    expect(starts.map(c => c.type === 'block-start' && c.blockType)).toEqual(['reasoning', 'text'])
    const reasoning = chunks.filter(c => c.type === 'reasoning-delta').map(c => c.type === 'reasoning-delta' && c.text).join('')
    expect(reasoning).toBe('思考内容')
    const text = chunks.filter(c => c.type === 'text-delta').map(c => c.type === 'text-delta' && c.text).join('')
    expect(text).toBe('回答文本')
    const finish = chunks.at(-1)
    expect(finish?.type).toBe('finish')
    if (finish?.type === 'finish') expect(finish.reason.kind).toBe('stop')
    const usage = chunks.find(c => c.type === 'usage')
    expect(usage).toBeDefined()
  })

  it('reassembles tags split across chunk boundaries', async () => {
    const chunks = await run([
      chunk({ content: '<th' }),
      chunk({ content: 'ink>abc</th' }),
      chunk({ content: 'ink>\n\nxyz' }),
      chunk({ role: 'assistant' }, 'stop'),
    ])
    const reasoning = chunks.filter(c => c.type === 'reasoning-delta').map(c => c.type === 'reasoning-delta' && c.text).join('')
    expect(reasoning).toBe('abc')
    const text = chunks.filter(c => c.type === 'text-delta').map(c => c.type === 'text-delta' && c.text).join('')
    expect(text).toBe('xyz')
  })

  it('passes through content with no think tag as plain text', async () => {
    const chunks = await run([
      chunk({ content: '直接回答' }),
      chunk({ role: 'assistant' }, 'stop'),
    ])
    expect(chunks.filter(c => c.type === 'block-start').map(c => c.type === 'block-start' && c.blockType)).toEqual(['text'])
  })

  it('keeps text emitted before an opening tag as text', async () => {
    const chunks = await run([
      chunk({ content: '前文<think>思考' }),
      chunk({ content: '完毕</think>\n\n后文' }),
      chunk({ role: 'assistant' }, 'stop'),
    ])
    const text = chunks.filter(c => c.type === 'text-delta').map(c => c.type === 'text-delta' && c.text).join('')
    expect(text).toBe('前文后文')
    const reasoning = chunks.filter(c => c.type === 'reasoning-delta').map(c => c.type === 'reasoning-delta' && c.text).join('')
    expect(reasoning).toBe('思考完毕')
  })

  it('flushes a truncated trailing tag fragment as text at EOF', async () => {
    const chunks = await run([
      chunk({ content: '<think>思考</think>\n\n回答<' }),
      chunk({ role: 'assistant' }, 'stop'),
    ])
    const text = chunks.filter(c => c.type === 'text-delta').map(c => c.type === 'text-delta' && c.text).join('')
    expect(text).toBe('回答<')
  })

  it('drops only the whitespace run directly after the closing tag', async () => {
    const chunks = await run([
      chunk({ content: '<think>x</think>   \n\n  首行' }),
      chunk({ role: 'assistant' }, 'stop'),
    ])
    const text = chunks.filter(c => c.type === 'text-delta').map(c => c.type === 'text-delta' && c.text).join('')
    expect(text).toBe('首行')
  })
})

describe('translate: tool calls and finish', () => {
  it('accumulates fragmented tool calls and maps tool_calls finish', async () => {
    const chunks = await run([
      chunk({ content: '<think>要调用工具</think>\n\n' }),
      chunk({ tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'get_weather', arguments: '{"ci' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: 'ty":"北京"}' } }] }),
      chunk({ role: 'assistant' }, 'tool_calls'),
      usageChunk(),
    ])
    const toolStart = chunks.find(c => c.type === 'block-start' && c.blockType === 'tool-call')
    expect(toolStart).toBeDefined()
    const blockEnd = chunks.find(c => c.type === 'block-end' && c.block?.type === 'tool-call')
    expect(blockEnd).toBeDefined()
    if (blockEnd?.type === 'block-end' && blockEnd.block.type === 'tool-call') {
      expect(blockEnd.block.id).toBe('call-1')
      expect(blockEnd.block.name).toBe('get_weather')
      expect(blockEnd.block.arguments).toBe('{"city":"北京"}')
    }
    const finish = chunks.at(-1)
    if (finish?.type === 'finish') expect(finish.reason.kind).toBe('tool-calls')
  })

  it('ignores empty-string finish_reason values', async () => {
    const chunks = await run([
      chunk({ content: 'x' }, ''),
      chunk({ role: 'assistant' }, ''),
      chunk({ role: 'assistant' }, 'stop'),
    ])
    const finish = chunks.at(-1)
    if (finish?.type === 'finish') expect(finish.reason.kind).toBe('stop')
  })

  it('defaults an absent finish_reason to stop at EOF', async () => {
    const chunks = await run([chunk({ content: 'x' })])
    const finish = chunks.at(-1)
    if (finish?.type === 'finish') expect(finish.reason.kind).toBe('stop')
  })

  it('maps length to max-tokens and unknown reasons to error', async () => {
    const length = await run([chunk({ content: 'x' }, 'length')])
    const finishLength = length.at(-1)
    if (finishLength?.type === 'finish') expect(finishLength.reason.kind).toBe('max-tokens')
    const weird = await run([chunk({ content: 'x' }, 'content_filter')])
    const finishWeird = weird.at(-1)
    if (finishWeird?.type === 'finish' && finishWeird.reason.kind === 'error') {
      expect(finishWeird.reason.failure.code).toBe('CONTENT_FILTER')
    }
  })

  it('emits an EMPTY_RESPONSE error finish for a contentless completion', async () => {
    const chunks = await run([chunk({ role: 'assistant' }, 'stop'), usageChunk()])
    const finish = chunks.at(-1)
    if (finish?.type === 'finish' && finish.reason.kind === 'error') {
      expect(finish.reason.failure.code).toMatch(/EMPTY_RESPONSE/u)
    } else {
      throw new Error('expected an error finish')
    }
  })

  it('accepts an explicit [DONE] sentinel as the terminator', async () => {
    const chunks = await run([chunk({ content: 'x' }), '[DONE]'])
    expect(chunks.at(-1)?.type).toBe('finish')
  })

  it('throws MALFORMED_RESPONSE on a non-JSON payload', async () => {
    await expect(run(['{not json'])).rejects.toThrow(/malformed/iu)
  })

  it('drops a whitespace-only chunk after the closing tag before the answer arrives', async () => {
    const chunks = await run([
      chunk({ content: '<think>reasoning</think>' }),
      chunk({ content: '\n\n' }),
      chunk({ content: 'answer' }),
      chunk({ role: 'assistant' }, 'stop'),
    ])
    const text = chunks.filter(c => c.type === 'text-delta').map(c => c.type === 'text-delta' && c.text).join('')
    expect(text).toBe('answer')
  })

  it('flushes a buffered partial tag as visible text when no text block opened', async () => {
    const chunks = await run([
      chunk({ content: '<thi' }),
      chunk({ role: 'assistant' }, 'stop'),
    ])
    const starts = chunks.filter(c => c.type === 'block-start')
    expect(starts.map(c => c.type === 'block-start' && c.blockType)).toEqual(['text'])
    const text = chunks.filter(c => c.type === 'text-delta').map(c => c.type === 'text-delta' && c.text).join('')
    expect(text).toBe('<thi')
  })

  it('maps a usage chunk without token detail objects', async () => {
    const chunks = await run([
      chunk({ content: 'x' }, 'stop'),
      JSON.stringify({ choices: [], usage: { total_tokens: 5, prompt_tokens: 4, completion_tokens: 1 } }),
    ])
    const usage = chunks.find(c => c.type === 'usage')
    if (usage?.type !== 'usage') throw new Error('no usage chunk')
    expect(usage.usage.inputTokens).toBe(4)
    expect(usage.usage.cacheReadTokens).toBeUndefined()
    expect(usage.usage.reasoningTokens).toBeUndefined()
  })

  it('synthesizes a unique id for a tool-call block whose fragments carried no id, name, or function', async () => {
    const chunks = await run([
      JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0 }] } }] }),
      chunk({ role: 'assistant' }, 'stop'),
    ])
    const starts = chunks.filter(c => c.type === 'block-start')
    expect(starts.map(c => c.type === 'block-start' && c.blockType)).toEqual(['tool-call'])
    const deltas = chunks.filter(c => c.type === 'tool-call-delta')
    expect(deltas).toHaveLength(1)
    const end = chunks.find(c => c.type === 'block-end')
    if (end?.type !== 'block-end') throw new Error('no block-end')
    if (end.block.type !== 'tool-call') throw new Error('not a tool-call block')
    expect(end.block.id).toMatch(/^chatcmpl-tool-synth-/u)
    expect(end.block.name).toBe('')
    expect(end.block.arguments).toBe('')
  })

  it('skips the choice loop for a payload with no choices key', async () => {
    const chunks = await run(['{}', chunk({ role: 'assistant' }, 'stop')])
    expect(chunks.at(-1)?.type).toBe('finish')
  })
})

describe('translate: parallel tool calls', () => {
  /**
   * Wire capture from the live M3 endpoint (session 5fb8303b, turn 1 step 1;
   * evidence excerpt in fixtures/parallel-tool-calls.session-excerpt.jsonl):
   * each parallel call carries its full id and name on the FIRST delta, then
   * RE-EMITS them as empty strings on continuation deltas. The assembled
   * blocks must keep the first-delta values — empty strings must not clobber
   * them, or dispatch fails with `unknown tool ""` and history replay hits
   * MiniMax error 2013 (`duplicate tool_call id: ""`).
   */
  const parallelEvents = JSON.parse(
    readFileSync(new URL('./fixtures/parallel-tool-calls.events.json', import.meta.url), 'utf8'),
  ) as string[]

  function toolCallEnds(chunks: StreamChunk[]): { id: string; name: string; arguments: string }[] {
    const ends: { id: string; name: string; arguments: string }[] = []
    for (const chunk of chunks) {
      if (chunk.type === 'block-end' && chunk.block.type === 'tool-call') {
        ends.push({ id: chunk.block.id, name: chunk.block.name, arguments: chunk.block.arguments })
      }
    }
    return ends
  }

  it('replays the captured sequence into three fully-identified parallel calls', async () => {
    const chunks = await run(parallelEvents)
    const ends = toolCallEnds(chunks)
    expect(ends).toEqual([
      { id: 'chatcmpl-tool-9f281cffe8b73ee6', name: 'kb_stats', arguments: '{}' },
      { id: 'chatcmpl-tool-8e4832d39e59add9', name: 'kb_search', arguments: '{"query":"出口退税 报关单 申报 要求","max_results":8}' },
      { id: 'chatcmpl-tool-b044ae041c114f56', name: 'kb_search', arguments: '{"query":"退税申报流程 报关单 数据","max_results":8}' },
    ])
  })

  it('keeps the first-delta id and name on every continuation delta chunk', async () => {
    const chunks = await run(parallelEvents)
    const deltas = chunks.filter(c => c.type === 'tool-call-delta')
    if (deltas.some(c => c.type === 'tool-call-delta' && (c.id === '' || c.name === ''))) {
      throw new Error('a tool-call-delta lost its id or name after the first delta')
    }
    const finish = chunks.at(-1)
    if (finish?.type === 'finish') expect(finish.reason.kind).toBe('tool-calls')
  })

  it('synthesizes distinct ids for parallel calls when the wire never supplies ids', async () => {
    const chunks = await run([
      chunk({ tool_calls: [{ index: 0, type: 'function', function: { name: 'kb_search', arguments: '{"q":' } }] }),
      chunk({ tool_calls: [{ index: 0, type: 'function', function: { name: '', arguments: '"a"}' } }] }),
      chunk({ tool_calls: [{ index: 1, type: 'function', function: { name: 'kb_search', arguments: '{"q":"b"}' } }] }),
      chunk({ role: 'assistant' }, 'tool_calls'),
      usageChunk(),
    ])
    const ends = toolCallEnds(chunks)
    expect(ends).toHaveLength(2)
    expect(ends[0]?.id).toMatch(/^chatcmpl-tool-synth-/u)
    expect(ends[1]?.id).toMatch(/^chatcmpl-tool-synth-/u)
    expect(ends[0]?.id).not.toBe(ends[1]?.id)
    expect(ends.map(e => e.name)).toEqual(['kb_search', 'kb_search'])
    expect(ends.map(e => e.arguments)).toEqual(['{"q":"a"}', '{"q":"b"}'])
  })
})

describe('mapUsage', () => {
  it('subtracts cached tokens from prompt_tokens and reports reasoning tokens', async () => {
    const chunks = await run([
      chunk({ content: 'x' }, 'stop'),
      usageChunk(),
    ])
    const usage = chunks.find(c => c.type === 'usage')
    if (usage?.type !== 'usage') throw new Error('no usage chunk')
    expect(usage.usage.inputTokens).toBe(413 - 128)
    expect(usage.usage.outputTokens).toBe(53)
    expect(usage.usage.cacheReadTokens).toBe(128)
    expect(usage.usage.reasoningTokens).toBe(17)
  })
})
