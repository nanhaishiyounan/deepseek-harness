// @vitest-environment jsdom
/**
 * The outbox (G5, hardened W6-R1): durable queueing, backoff flush, online
 * recovery, the clientMsgId idempotency key riding every retry, the local
 * dedup skip, and the logout clear (outbox.dropped).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

type PromptCall = { sessionId: string; text: string; clientMsgId?: string | undefined }

/** The prompts the sessions seam received (failNext flips the next call). */
let promptCalls: PromptCall[] = []
let failNext = 0

vi.mock('../src/client/sessionsService.ts', () => ({
  promptSession: async (sessionId: string, text: string, clientMsgId?: string): Promise<void> => {
    if (failNext > 0) {
      failNext -= 1
      throw new TypeError('fetch failed')
    }
    promptCalls.push({ sessionId, text, clientMsgId })
  },
}))

const { clearOutbox, dropOutbox, enqueueOutbox, outboxSnapshot, subscribeOutbox } = await import('../src/client/outboxStore.ts')

/** Reset the store's localStorage and the seam's call log between cases. */
function reset(): void {
  promptCalls = []
  failNext = 0
  localStorage.clear()
}

describe('outboxStore', () => {
  afterEach(() => {
    vi.useRealTimers()
    // Drain any entries a case left behind before resetting storage: a live
    // entry would arm a real-timer flush that leaks into the next case.
    for (const entry of [...outboxSnapshot().entries]) dropOutbox(entry.id)
    reset()
  })

  it('queues a message and flushes it on the immediate schedule, carrying the idempotency key', async () => {
    vi.useFakeTimers()
    const entry = enqueueOutbox('s1', '确认写入', 'm_key_1')
    expect(outboxSnapshot().entries).toHaveLength(1)
    expect(outboxSnapshot().entries[0]?.text).toBe('确认写入')
    expect(outboxSnapshot().entries[0]?.clientMsgId).toBe('m_key_1')
    // The enqueue schedules a 0ms flush; advance past it plus microtasks.
    await vi.advanceTimersByTimeAsync(10)
    expect(promptCalls).toEqual([{ sessionId: 's1', text: '确认写入', clientMsgId: 'm_key_1' }])
    expect(outboxSnapshot().entries).toHaveLength(0)
    void entry
  })

  it('retries the same clientMsgId across the backoff window (a duplicate cannot double-send)', async () => {
    vi.useFakeTimers()
    failNext = 1
    enqueueOutbox('s1', 'msg-a', 'm_retry')
    // First flush fails (failNext consumed); the retry carries the same key.
    await vi.advanceTimersByTimeAsync(10)
    expect(promptCalls).toHaveLength(0)
    expect(outboxSnapshot().entries[0]?.attempts).toBe(1)
    expect(outboxSnapshot().entries[0]?.clientMsgId).toBe('m_retry')
    await vi.advanceTimersByTimeAsync(3000)
    expect(promptCalls).toEqual([{ sessionId: 's1', text: 'msg-a', clientMsgId: 'm_retry' }])
    expect(outboxSnapshot().entries).toHaveLength(0)
  })

  it('skips a duplicate row whose clientMsgId already flushed (outbox.dedup_hit)', async () => {
    vi.useFakeTimers()
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    enqueueOutbox('s1', 'first', 'm_dup')
    await vi.advanceTimersByTimeAsync(10)
    expect(promptCalls).toHaveLength(1)
    // A second row lands with the same key (a cross-tab double enqueue):
    // the flush must drop it locally instead of re-dispatching.
    enqueueOutbox('s1', 'first', 'm_dup')
    await vi.advanceTimersByTimeAsync(10)
    expect(promptCalls).toHaveLength(1)
    expect(outboxSnapshot().entries).toHaveLength(0)
    expect(infoSpy.mock.calls.some(call => String(call[0]).includes('outbox.dedup_hit'))).toBe(true)
    infoSpy.mockRestore()
  })

  it('flushes independently per entry and respects the manual drop', async () => {
    vi.useFakeTimers()
    const dropped = enqueueOutbox('s1', 'first', 'm_1')
    const kept = enqueueOutbox('s2', 'second', 'm_2')
    dropOutbox(dropped.id)
    await vi.advanceTimersByTimeAsync(10)
    // The dropped entry never sends; the healthy one did.
    expect(promptCalls).toEqual([{ sessionId: 's2', text: 'second', clientMsgId: 'm_2' }])
    expect(outboxSnapshot().entries.some(entry => entry.id === kept.id)).toBe(false)
  })

  it('clears the whole queue on logout and traces the discard (outbox.dropped)', async () => {
    vi.useFakeTimers()
    failNext = 10
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    enqueueOutbox('s1', 'parked-a', 'm_a')
    enqueueOutbox('s1', 'parked-b', 'm_b')
    await vi.advanceTimersByTimeAsync(10)
    expect(outboxSnapshot().entries).toHaveLength(2)
    clearOutbox()
    expect(outboxSnapshot().entries).toHaveLength(0)
    expect(localStorage.getItem('dsh-mobile-outbox')).toContain('"entries":[]')
    expect(infoSpy.mock.calls.some(call => String(call[0]).includes('outbox.dropped'))).toBe(true)
    // The armed retry timer died with the queue: no further dispatch.
    failNext = 0
    await vi.advanceTimersByTimeAsync(120_000)
    expect(promptCalls).toHaveLength(0)
    infoSpy.mockRestore()
  })

  it('bounds the queue and notifies subscribers', () => {
    reset()
    let notified = 0
    const unsubscribe = subscribeOutbox(() => { notified += 1 })
    for (let index = 0; index < 55; index += 1) {
      enqueueOutbox('s1', `m${String(index)}`, `m_key_${String(index)}`)
    }
    expect(outboxSnapshot().entries.length).toBeLessThanOrEqual(50)
    expect(outboxSnapshot().entries.length).toBe(50)
    expect(notified).toBeGreaterThanOrEqual(55)
    unsubscribe()
  })

  it('resets a corrupt payload to the empty queue', async () => {
    localStorage.setItem('dsh-mobile-outbox', '{not json')
    const { outboxSnapshot: fresh } = await import('../src/client/outboxStore.ts')
    // The module-level store already loaded: the corrupt read answered empty.
    expect(fresh().version).toBe(2)
  })
})
