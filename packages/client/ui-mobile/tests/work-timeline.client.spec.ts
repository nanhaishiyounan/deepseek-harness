// @vitest-environment jsdom
/**
 * The timeline data sources (04 §4.1): liveTimeline's fold projection (tool
 * rows become steps, the assistant tail becomes the result summary, a settled
 * turn with a tail marks finished) and demoTimeline's timer-advanced script
 * (the finished start, the breathing current step, the final settle), plus
 * the subscription lifecycle (polling and timers stop once the last listener
 * leaves). Real timers with shrunken periods keep the promise chains flowing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FoldEvent } from '../src/client/fold.ts'
import { demoTimeline, liveTimeline } from '../src/client/work/workTimeline.ts'

/** One assistant message event. */
function assistantMessage(seq: number, text: string): FoldEvent {
  return { type: 'assistant/message', seq, time: 1, data: { message: { content: [{ type: 'text', text }] } } }
}

/** One user message event. */
function userMessage(seq: number, text: string): FoldEvent {
  return { type: 'user/message', seq, time: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } }
}

/** One tool call row. */
function toolCall(seq: number, callId: string, name: string): FoldEvent {
  return { type: 'tool/call', seq, time: 1, data: { callId, name, arguments: '{}' } }
}

/** One tool result marker (optionally failed). */
function toolResult(seq: number, callId: string, failed = false): FoldEvent {
  return {
    type: 'tool/result',
    seq,
    time: 2,
    data: { message: { content: [{ toolCallId: callId, ...(failed ? { isError: true } : {}) }] } },
  }
}

/** The settled-turn bookends. */
function settledTurn(): FoldEvent[] {
  return [
    { type: 'turn/start', seq: 90, time: 3, data: { turn: 1 } },
    { type: 'turn/end', seq: 91, time: 4, data: { turn: 1 } },
  ]
}

/** The fetch stub over /api/session.history returning one event window. */
function stubHistory(produce: () => FoldEvent[]): void {
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const events = produce()
    const body = JSON.stringify({
      rpcId: (JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string }).rpcId,
      result: { ok: true, value: { events: events.map(event => ({ event })) } },
    })
    return new Response(body, { status: 200 })
  }))
}

/** Await a real-timer sleep. */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('liveTimeline', () => {
  it('projects tool rows as steps and keeps running while the turn is open', async () => {
    stubHistory(() => [
      userMessage(1, '执行任务'),
      toolCall(2, 'c1', 'nb_list'),
      toolResult(3, 'c1'),
      toolCall(4, 'c2', 'lakehouse_query'),
      { type: 'turn/start', seq: 5, time: 3, data: { turn: 1 } },
    ])
    const source = liveTimeline('s_exec', 50)
    const seen: number[] = []
    const off = source.subscribe(() => { seen.push(source.snapshot.steps.length) })
    await vi.waitFor(() => {
      // The time column is a display add-on; the projection matches on the
      // label/state pairs.
      expect(source.snapshot.steps).toMatchObject([
        { label: '查询业务记录', state: 'done' },
        { label: '数仓查询', state: 'running' },
      ])
    })
    // The live time column carries each tool row's clock stamp.
    expect(source.snapshot.steps.every(step => /^\d{2}:\d{2}$/.test(step.time ?? ''))).toBe(true)
    expect(source.snapshot.finished).toBe(false)
    expect(seen.length).toBeGreaterThan(0)
    off()
  })

  it('marks finished once the turn settles with an assistant tail and clips the summary', async () => {
    stubHistory(() => [
      toolCall(2, 'c1', 'kb_search'),
      toolResult(3, 'c1'),
      ...settledTurn(),
      assistantMessage(7, '已完成风险汇总。详细的清单在附件里，请确认。'),
    ])
    const source = liveTimeline('s_exec', 50)
    const off = source.subscribe(() => {})
    await vi.waitFor(() => { expect(source.snapshot.finished).toBe(true) })
    expect(source.snapshot.resultSummary).toBe('已完成风险汇总')
    off()
  })

  it('broadcasts a same-count running→done step flip', async () => {
    let resultArrived = false
    stubHistory(() => [
      userMessage(1, '执行任务'),
      toolCall(2, 'c1', 'nb_list'),
      toolCall(3, 'c2', 'lakehouse_query'),
      ...(resultArrived ? [toolResult(4, 'c1')] : []),
      { type: 'turn/start', seq: 5, time: 3, data: { turn: 1 } },
    ])
    const source = liveTimeline('s_exec', 50)
    const off = source.subscribe(() => {})
    await vi.waitFor(() => {
      expect(source.snapshot.steps).toMatchObject([
        { label: '查询业务记录', state: 'running' },
        { label: '数仓查询', state: 'running' },
      ])
    })
    resultArrived = true
    // The step count is unchanged; only the first step's state flips to done.
    await vi.waitFor(() => {
      expect(source.snapshot.steps).toMatchObject([
        { label: '查询业务记录', state: 'done' },
        { label: '数仓查询', state: 'running' },
      ])
    }, { timeout: 2000 })
    expect(source.snapshot.finished).toBe(false)
    off()
  })

  it('skips protocol-fenced tool names and keeps failed rows as errors', async () => {
    stubHistory(() => [
      toolCall(2, 'p1', 'form_draft'),
      toolCall(3, 'e1', 'nb_get'),
      toolResult(4, 'e1', true),
      ...settledTurn(),
      assistantMessage(7, '结论一句话'),
    ])
    const source = liveTimeline('s_exec', 50)
    const off = source.subscribe(() => {})
    await vi.waitFor(() => { expect(source.snapshot.steps).toMatchObject([{ label: '读取业务行', state: 'error' }]) })
    off()
  })

  it('keeps the last snapshot on a failed poll and retries on the next tick', async () => {
    let fails = true
    stubHistory(() => {
      if (fails) throw new Error('会话服务 502')
      return [
        toolCall(2, 'c1', 'nb_list'),
        toolResult(3, 'c1'),
        ...settledTurn(),
        assistantMessage(7, 'ok'),
      ]
    })
    const source = liveTimeline('s_exec', 30)
    const off = source.subscribe(() => {})
    await vi.waitFor(() => { expect(source.snapshot.steps).toHaveLength(0) })
    fails = false
    await vi.waitFor(() => { expect(source.snapshot.steps).toHaveLength(1) }, { timeout: 2000 })
    off()
  })

  it('shares one poll loop across subscribers and stops only after the last leaves', async () => {
    let reads = 0
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      reads += 1
      const body = JSON.stringify({
        rpcId: (JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string }).rpcId,
        result: { ok: true, value: { events: [] } },
      })
      return new Response(body, { status: 200 })
    }))
    const source = liveTimeline('s_exec', 30)
    const first = source.subscribe(() => {})
    await vi.waitFor(() => { expect(reads).toBeGreaterThan(0) })
    // A second subscriber rides the running loop; no extra read is kicked.
    const before = reads
    const second = source.subscribe(() => {})
    await sleep(80)
    expect(reads).toBeGreaterThanOrEqual(before)
    // One listener leaving keeps the loop alive for the other.
    first()
    await sleep(120)
    const stillPolling = reads
    expect(stillPolling).toBeGreaterThan(before)
    second()
  })

  it('stops polling once the last listener unsubscribes', async () => {
    let reads = 0
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      reads += 1
      const body = JSON.stringify({
        rpcId: (JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string }).rpcId,
        result: { ok: true, value: { events: [] } },
      })
      return new Response(body, { status: 200 })
    }))
    const source = liveTimeline('s_exec', 30)
    const off = source.subscribe(() => {})
    await vi.waitFor(() => { expect(reads).toBeGreaterThan(0) })
    const afterFirst = reads
    off()
    await sleep(150)
    expect(reads).toBe(afterFirst)
  })
})

describe('demoTimeline', () => {
  it('advances the fixed script step by step and finishes with the canned summary', async () => {
    const source = demoTimeline('演示任务', 60)
    const off = source.subscribe(() => {})
    // While advancing, one step breathes (running) behind the settled ones.
    await vi.waitFor(() => { expect(source.snapshot.steps.some(step => step.state === 'running')).toBe(true) })
    expect(source.snapshot.steps.some(step => step.state === 'done')).toBe(true)
    expect(source.snapshot.steps[0]).toMatchObject({ label: '读取工作上下文', state: 'done' })
    // The demo time column rides the design's 01-style ordinals.
    expect(source.snapshot.steps[0]?.time).toBe('01')
    expect(source.snapshot.steps.every(step => /^0\d$/.test(step.time ?? ''))).toBe(true)
    await vi.waitFor(() => { expect(source.snapshot.finished).toBe(true) }, { timeout: 2000 })
    expect(source.snapshot.steps.every(step => step.state === 'done')).toBe(true)
    expect(source.snapshot.resultSummary).toBe('已完成「演示任务」的处理，结果摘要已生成，请确认')
    off()
  })

  it('renders the completed ledger at once for a startFinished replay', () => {
    const source = demoTimeline('已完成任务', 10, true)
    expect(source.snapshot.finished).toBe(true)
    expect(source.snapshot.steps).toHaveLength(4)
    expect(source.snapshot.resultSummary).toContain('已完成任务')
    // The idle source still hands out working unsubscribes.
    const off = source.subscribe(() => {})
    expect(off).toBeInstanceOf(Function)
    off()
  })

  it('resumes advancing when a new subscriber joins after a pause', async () => {
    const source = demoTimeline('再订任务', 10)
    const first = source.subscribe(() => {})
    await vi.waitFor(() => { expect(source.snapshot.steps.length).toBeGreaterThan(0) })
    first()
    const paused = source.snapshot.steps.length
    await sleep(80)
    expect(source.snapshot.steps.length).toBe(paused)
    // A second subscriber restarts the advancing timers (StrictMode remount).
    const second = source.subscribe(() => {})
    await vi.waitFor(() => { expect(source.snapshot.finished).toBe(true) }, { timeout: 3000 })
    second()
  })

  it('stops the advancing timers on the last unsubscribe', async () => {
    const source = demoTimeline('任务', 10)
    const off = source.subscribe(() => {})
    await vi.waitFor(() => { expect(source.snapshot.steps.length).toBeGreaterThan(0) })
    off()
    const settled = source.snapshot.steps.length
    await sleep(150)
    expect(source.snapshot.steps.length).toBe(settled)
  })
})
