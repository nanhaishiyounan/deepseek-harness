/**
 * Keyless N25 think-filter tests: the proxy's `<think>…</think>` stripping is
 * a cross-chunk state machine, so the risky cases — a tag split mid-chunk, a
 * closing tag sharing a delta with answer text, an unterminated think, a
 * dangling literal that only looks like a tag, an upstream truncation before
 * any finish frame, and per-choice state isolation — are pinned here
 * deterministically instead of depending on where MiniMax happens to split
 * SSE frames. Real-wire acceptance (both switch states through the running
 * proxy) lives in demos/nocobase-full-features/N25-think-filter-and-selfheal.md.
 */
import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import { ThinkFilter, SseThinkRewriter, filterNonStreamBody } from '../scripts/nocobase-n22-llm-proxy.mts'

function sseDelta(content: string, extra: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ id: 't', created: 1, model: 'MiniMax-M3', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content, role: 'assistant' }, ...extra }] })}\n\n`
}

function sseChoiceDelta(index: number, content: string): string {
  return `data: ${JSON.stringify({ id: 't', created: 1, model: 'MiniMax-M3', object: 'chat.completion.chunk', choices: [{ index, delta: { content, role: 'assistant' } }] })}\n\n`
}

async function rewrite(
  input: string,
  chunkSize?: number,
): Promise<{ text: string; stats: { segments: number; charsStripped: number; unterminated: boolean } }> {
  const rewriter = new SseThinkRewriter()
  const chunks = chunkSize === undefined ? [input] : input.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, 'g')) ?? []
  const readable = Readable.from(chunks)
  const parts: string[] = []
  for await (const piece of readable.pipe(rewriter)) parts.push(String(piece))
  return { text: parts.join(''), stats: rewriter.stats }
}

/** Concatenate `delta.content` from a rewritten SSE stream, optionally for one choice index only. */
function contentOf(stream: string, index?: number): string {
  let out = ''
  for (const line of stream.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try {
      const parsed = JSON.parse(line.slice(6)) as { choices?: Array<{ index?: number; delta?: { content?: unknown } }> }
      for (const choice of parsed.choices ?? []) {
        if (index !== undefined && choice.index !== index) continue
        if (typeof choice.delta?.content === 'string') out += choice.delta.content
      }
    } catch {
      // Non-JSON data lines (e.g. [DONE]) carry no content.
    }
  }
  return out
}

describe('ThinkFilter state machine', () => {
  it('strips a whole think segment and keeps surrounding text', () => {
    const filter = new ThinkFilter()
    const out = `${filter.push('前<think>推理中</think>后')}${filter.flush()}`
    expect(out).toBe('前后')
    expect(filter.segments).toBe(1)
  })

  it('holds a tag prefix split across pushes and completes it on the next push', () => {
    const filter = new ThinkFilter()
    expect(filter.push('答案在<th')).toBe('答案在')
    expect(filter.push('ink>秘密')).toBe('')
    expect(filter.push('内容</th')).toBe('')
    expect(`${filter.push('ink>！后面')}${filter.flush()}`).toBe('！后面')
    expect(filter.segments).toBe(1)
  })

  it('emits a literal that only looked like a tag prefix', () => {
    const filter = new ThinkFilter()
    expect(`${filter.push('a<b')}${filter.flush()}`).toBe('a<b')
    expect(filter.segments).toBe(0)
  })

  it('drops everything after an unterminated think and flags it', () => {
    const filter = new ThinkFilter()
    expect(`${filter.push('正文<think>没写完')}${filter.flush()}`).toBe('正文')
    expect(filter.unterminated).toBe(true)
  })

  it('counts stripped characters as tag + think content + closing tag', () => {
    const filter = new ThinkFilter()
    filter.push('<think>abc</think>x')
    expect(filter.charsStripped).toBe('<think>abc</think>'.length)
  })

  it('emits a dangling </think> literal when no open tag preceded it', () => {
    const filter = new ThinkFilter()
    expect(`${filter.push('abc</think>def')}${filter.flush()}`).toBe('abc</think>def')
    expect(filter.segments).toBe(0)
    expect(filter.unterminated).toBe(false)
  })

  it('preserves a held prefix across empty pushes', () => {
    const filter = new ThinkFilter()
    expect(filter.push('答案<')).toBe('答案')
    expect(filter.push('')).toBe('')
    expect(`${filter.push('b')}${filter.flush()}`).toBe('<b')
    expect(filter.segments).toBe(0)
  })
})

describe('SseThinkRewriter', () => {
  it('removes think frames from the real wire shape (close tag shares a delta with answer text)', async () => {
    const stream = [
      sseDelta(''),
      sseDelta('<think>The user wants a one-sentence explanation'),
      sseDelta('. I will answer in Chinese.'),
      sseDelta('</think>\n\n复利就是利滚利。'),
      `data: ${JSON.stringify({ id: 't', choices: [{ index: 0, finish_reason: 'stop', delta: { role: 'assistant' } }] })}\n\n`,
    ].join('')
    const { text, stats } = await rewrite(stream)
    expect(contentOf(text)).toBe('\n\n复利就是利滚利。')
    expect(stats.segments).toBe(1)
    expect(stats.charsStripped).toBeGreaterThan(0)
    expect(stats.unterminated).toBe(false)
    // The role and finish frames survive untouched.
    expect(text).toContain('"finish_reason":"stop"')
    expect((text.match(/"role":"assistant"/g) ?? []).length).toBe(5)
  })

  it('keeps frames byte-identical when no think tag is present', async () => {
    const frame = sseDelta('普通回复')
    const { text, stats } = await rewrite(frame + frame)
    expect(text).toBe(frame + frame)
    expect(stats.segments).toBe(0)
    expect(stats.charsStripped).toBe(0)
  })

  it('survives arbitrary socket chunk splits, including inside both tags', async () => {
    const stream = [
      sseDelta('<thi'),
      sseDelta('nk>推理'),
      sseDelta('</th'),
      sseDelta('ink>正文A'),
      sseDelta('<th'),
      sseDelta('ink>二段</think>正文B'),
      `data: ${JSON.stringify({ id: 't', choices: [{ index: 0, finish_reason: 'stop', delta: {} }] })}\n\n`,
    ].join('')
    for (const size of [1, 2, 3, 7, 40]) {
      const { text, stats } = await rewrite(stream, size)
      expect(contentOf(text), `chunk size ${size}`).toBe('正文A正文B')
      expect(stats.segments, `chunk size ${size}`).toBe(2)
    }
  })

  it('flushes text held back at the finish frame when the last delta ends in a partial prefix', async () => {
    const stream = [
      sseDelta('结尾是<h'),
      `data: ${JSON.stringify({ id: 't', choices: [{ index: 0, finish_reason: 'stop', delta: { role: 'assistant' } }] })}\n\n`,
    ].join('')
    const { text } = await rewrite(stream)
    expect(contentOf(text)).toBe('结尾是<h')
  })

  it('passes non-data and unparseable frames through verbatim', async () => {
    const stream = ': keep-alive\n\ndata: [DONE]\n\ndata: not-json\n\n'
    const { text } = await rewrite(stream)
    expect(text).toBe(stream)
  })

  it('forwards empty-content frames byte-identical', async () => {
    const stream = [sseDelta(''), sseDelta('前'), sseDelta(''), sseDelta('后')].join('')
    const { text, stats } = await rewrite(stream, 7)
    expect(text).toBe(stream)
    expect(contentOf(text)).toBe('前后')
    expect(stats.segments).toBe(0)
  })

  it('passes a dangling </think> with no open tag through as plain text', async () => {
    const stream = [
      sseDelta('abc'),
      sseDelta('</think>def'),
      `data: ${JSON.stringify({ id: 't', choices: [{ index: 0, finish_reason: 'stop', delta: {} }] })}\n\n`,
    ].join('')
    const { text, stats } = await rewrite(stream)
    expect(text).toBe(stream)
    expect(contentOf(text)).toBe('abc</think>def')
    expect(stats.segments).toBe(0)
    expect(stats.unterminated).toBe(false)
  })

  it('releases held answer text at EOF when upstream truncates before any finish frame', async () => {
    const { text, stats } = await rewrite(sseDelta('结尾是<th'))
    expect(contentOf(text)).toBe('结尾是<th')
    // The released text arrives as one synthesized delta frame.
    expect(text).toContain('"content":"<th"')
    expect(stats.unterminated).toBe(false)
  })

  it('drops held reasoning at EOF inside an unterminated think and flags it', async () => {
    const { text, stats } = await rewrite(sseDelta('正文<think>推理到一半</t'))
    expect(contentOf(text)).toBe('正文')
    expect(text).not.toContain('推理')
    expect(stats.unterminated).toBe(true)
    expect(stats.charsStripped).toBeGreaterThan(0)
  })

  it('isolates filter state per choice index', async () => {
    const stream = [
      sseChoiceDelta(0, '<think>甲的推理'),
      sseChoiceDelta(1, '乙一'),
      sseChoiceDelta(0, '</think>甲答'),
      sseChoiceDelta(1, '乙二'),
      `data: ${JSON.stringify({ id: 't', choices: [{ index: 0, finish_reason: 'stop', delta: {} }, { index: 1, finish_reason: 'stop', delta: {} }] })}\n\n`,
    ].join('')
    const { text, stats } = await rewrite(stream)
    expect(contentOf(text, 0)).toBe('甲答')
    expect(contentOf(text, 1)).toBe('乙一乙二')
    // Choice 1 never contained think, so its frames stay byte-identical.
    expect(text).toContain(sseChoiceDelta(1, '乙一'))
    expect(stats.segments).toBe(1)
  })
})

describe('filterNonStreamBody', () => {
  it('strips think from message.content and updates content bytes', () => {
    const raw = Buffer.from(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: '<think>想</think>答' } }] }))
    const { body, stats } = filterNonStreamBody(raw)
    expect(JSON.parse(body.toString('utf8')).choices[0].message.content).toBe('答')
    expect(stats.segments).toBe(1)
    expect(body.equals(raw)).toBe(false)
  })

  it('returns error bodies and shape surprises verbatim (fail-open)', () => {
    for (const raw of [
      Buffer.from(JSON.stringify({ error: { message: 'bad request' } })),
      Buffer.from('not json at all'),
      Buffer.from(JSON.stringify({ choices: [{ index: 0, message: { content: 42 } }] })),
    ]) {
      const { body, stats } = filterNonStreamBody(raw)
      expect(body.equals(raw)).toBe(true)
      expect(stats.segments).toBe(0)
    }
  })

  it('leaves think-free bodies byte-identical', () => {
    const raw = Buffer.from(JSON.stringify({ choices: [{ index: 0, message: { content: '普通回复' } }] }))
    const { body, stats } = filterNonStreamBody(raw)
    expect(body.equals(raw)).toBe(true)
    expect(stats.changed).toBe(false)
  })
})
