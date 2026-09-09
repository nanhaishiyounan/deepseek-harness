/**
 * WorkflowLease path semantics over a stubbed NocoBase backend: every lease
 * action is a recorded fetch, so the specs assert which actions a `restore()`
 * performs and which state it retains after each outcome. A fully successful
 * restore clears both the clone id and the paused flag; a failed destroy
 * retains only the clone id; a failed re-enable toggle retains only the
 * paused flag; and a retried restore after a partial success performs only
 * the unfinished action — toggle is a flip, so repeating a succeeded toggle
 * would reverse it and disable the production workflow. `pause()` repeats
 * as a no-op for the same reason.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowLease } from '../scripts/nocobase-workflow.ts'

const ORIGIN = 'https://nocobase.test'

/** One recorded fetch stub call: the method plus path, enough to name the action. */
interface RecordedCall {
  readonly method: string
  readonly path: string
}

/**
 * A mutable fetch stub: every call is recorded and answers ok unless its
 * exact path is marked failing via `fail` (cleared again via `heal`, so one
 * stub can carry a pause that succeeds into a restore that fails).
 */
interface FetchStub {
  readonly calls: () => RecordedCall[]
  readonly fail: (path: string) => void
  readonly heal: (path: string) => void
}

/** Install the global fetch stub over the stub origin. */
function stubNocoBaseFetch(): FetchStub {
  const calls: RecordedCall[] = []
  const failing = new Set<string>()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const path = (typeof input === 'string' ? input : input.href).slice(ORIGIN.length)
    calls.push({ method: (init?.method ?? 'GET').toUpperCase(), path })
    return new Response(null, { status: failing.has(path) ? 500 : 200 })
  }))
  return {
    calls: () => calls,
    fail: (path) => { failing.add(path) },
    heal: (path) => { failing.delete(path) },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WorkflowLease restore() paths', () => {
  it('clears clone id and paused flag when every restore action succeeds', async () => {
    const stub = stubNocoBaseFetch()
    const lease = new WorkflowLease({ baseUrl: ORIGIN, apiKey: 'k' }, 7)
    await lease.pause()
    lease.setClone(42)
    await lease.restore()
    expect(stub.calls().map(call => call.path)).toEqual([
      '/api/workflows:toggle?filterByTk=7',
      '/api/workflows:destroy?filterByTk=42',
      '/api/workflows:toggle?filterByTk=7',
    ])
    await lease.restore()
    expect(stub.calls()).toHaveLength(3)
  })

  it('retains only the clone id when destroy fails; the retry skips the succeeded toggle', async () => {
    const stub = stubNocoBaseFetch()
    const lease = new WorkflowLease({ baseUrl: ORIGIN, apiKey: 'k' }, 7)
    await lease.pause()
    lease.setClone(42)
    stub.fail('/api/workflows:destroy?filterByTk=42')
    await expect(lease.restore()).rejects.toThrow('destroying clone workflow 42 failed')
    stub.heal('/api/workflows:destroy?filterByTk=42')
    await lease.restore()
    expect(stub.calls().slice(3).map(call => call.path)).toEqual(['/api/workflows:destroy?filterByTk=42'])
  })

  it('retains only the paused flag when the re-enable toggle fails; the retry skips the succeeded destroy', async () => {
    const stub = stubNocoBaseFetch()
    const lease = new WorkflowLease({ baseUrl: ORIGIN, apiKey: 'k' }, 7)
    await lease.pause()
    lease.setClone(42)
    stub.fail('/api/workflows:toggle?filterByTk=7')
    await expect(lease.restore()).rejects.toThrow('re-enabling production workflow 7 failed')
    stub.heal('/api/workflows:toggle?filterByTk=7')
    await lease.restore()
    expect(stub.calls().slice(3).map(call => call.path)).toEqual(['/api/workflows:toggle?filterByTk=7'])
  })
})

describe('WorkflowLease pause() idempotence', () => {
  it('issues no second toggle for a repeated pause, and restore still re-enables once', async () => {
    const stub = stubNocoBaseFetch()
    const lease = new WorkflowLease({ baseUrl: ORIGIN, apiKey: 'k' }, 7)
    await lease.pause()
    await lease.pause()
    expect(stub.calls().map(call => call.path)).toEqual(['/api/workflows:toggle?filterByTk=7'])
    await lease.restore()
    expect(stub.calls().map(call => call.path)).toEqual([
      '/api/workflows:toggle?filterByTk=7',
      '/api/workflows:toggle?filterByTk=7',
    ])
  })
})
