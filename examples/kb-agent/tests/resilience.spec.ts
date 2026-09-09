/**
 * withResilience over fake external calls: a bounded number of failures is
 * absorbed by the retry loop (the call succeeds once the fake recovers), a
 * never-recovering call exhausts into the readable error naming the call
 * site and the attempt count, and a hung attempt that respects the abort
 * signal is cut short by the per-attempt timeout budget.
 */

import { describe, expect, it } from 'vitest'
import { withResilience } from '../scripts/resilience.ts'

/** Fast options so real-timer backoffs keep the suite in milliseconds. */
const FAST = { attempts: 3, timeoutMs: 5_000, baseDelayMs: 1 } as const

describe('withResilience', () => {
  it('recovers when the call fails twice then succeeds', async () => {
    let calls = 0
    const result = await withResilience('fake:flaky', async () => {
      calls += 1
      if (calls < 3) throw new Error(`transient ${String(calls)}`)
      return 'ok'
    }, FAST)
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('returns the first attempt untouched when it succeeds', async () => {
    let calls = 0
    await withResilience('fake:stable', async () => {
      calls += 1
      return 42
    }, FAST)
    expect(calls).toBe(1)
  })

  it('exhausts into an error naming the call site and the attempt count', async () => {
    let calls = 0
    const failure = await withResilience('fake:down', async () => {
      calls += 1
      throw new Error('connection refused')
    }, FAST).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    // The message carries every element a scenario FAIL row needs: the call
    // site label, the attempt budget, and the last underlying failure.
    expect((failure as Error).message).toContain('fake:down')
    expect((failure as Error).message).toContain('attempts=3')
    expect((failure as Error).message).toContain('connection refused')
    expect(calls).toBe(3)
  })

  it('cuts a hung attempt short through the per-attempt timeout', async () => {
    const failure = await withResilience('fake:hung', signal => new Promise<string>((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(signal.reason instanceof Error ? signal.reason : new Error('aborted')) })
      // Never resolves on its own: only the timeout abort settles this attempt.
    }), { attempts: 1, timeoutMs: 30, baseDelayMs: 1 }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('fake:hung')
    expect((failure as Error).message).toContain('attempt timed out after 30ms')
  })

  it('rejects an unusable timeout budget before any attempt runs', async () => {
    for (const timeoutMs of [0, -1, Number.NaN]) {
      let ran = false
      const failure = await withResilience('fake:bogus-budget', async () => {
        ran = true
        return 'unreachable'
      }, { attempts: 1, timeoutMs }).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(Error)
      expect((failure as Error).message).toContain('timeoutMs must be a positive finite number')
      expect(ran).toBe(false)
    }
  })
})
