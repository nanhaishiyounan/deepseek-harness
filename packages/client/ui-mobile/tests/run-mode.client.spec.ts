// @vitest-environment jsdom
/**
 * Run mode: the explicit switch's priority, the llm.models probe's live/demo
 * branches, the fail-safe on probe failures, the module-level probe cache,
 * and the subscription broadcasts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The freshly imported module (probe cache and listeners reset per test). */
let runMode: typeof import('../src/client/runMode.ts')

/** The llm.models fetch calls this test observed. */
let probes: number

/** Stub the gateway's llm.models answer, echoing each request's rpcId. */
function stubModels(produce: () => Promise<unknown>): void {
  probes = 0
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    probes += 1
    const value = await produce()
    const rpcId = (JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string }).rpcId ?? ''
    return new Response(JSON.stringify({ rpcId, result: { ok: true, value } }), { status: 200 })
  }))
}

beforeEach(async () => {
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.resetModules()
  runMode = await import('../src/client/runMode.ts')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('explicit run-mode switch', () => {
  it('returns the pinned value without probing', async () => {
    stubModels(() => Promise.reject(new Error('不该探测')))
    localStorage.setItem('dsh-mobile-runmode', 'live')
    await expect(runMode.currentRunMode()).resolves.toBe('live')
    expect(probes).toBe(0)
    localStorage.setItem('dsh-mobile-runmode', 'demo')
    await expect(runMode.currentRunMode()).resolves.toBe('demo')
    expect(probes).toBe(0)
  })

  it('treats an unrecognized stored value as unset', async () => {
    stubModels(() => Promise.resolve({ groups: [{ id: 'p', name: 'p', models: [] }], failures: [] }))
    localStorage.setItem('dsh-mobile-runmode', 'bogus')
    await expect(runMode.currentRunMode()).resolves.toBe('demo')
    expect(probes).toBe(1)
  })

  it('setRunMode pins the switch and broadcasts', async () => {
    const seen: string[] = []
    runMode.subscribeRunMode(() => { seen.push(localStorage.getItem('dsh-mobile-runmode') ?? '') })
    runMode.setRunMode('live')
    expect(localStorage.getItem('dsh-mobile-runmode')).toBe('live')
    expect(seen).toEqual(['live'])
  })
})

describe('llm.models probe', () => {
  it('resolves live when the catalog holds a servable model', async () => {
    stubModels(() => Promise.resolve({
      groups: [{ id: 'p1', name: 'P1', models: [] }, { id: 'p2', name: 'P2', models: [{ id: 'm' }] }],
      failures: [],
    }))
    await expect(runMode.currentRunMode()).resolves.toBe('live')
  })

  it('resolves demo when the catalog is empty', async () => {
    stubModels(() => Promise.resolve({ groups: [], failures: [] }))
    await expect(runMode.currentRunMode()).resolves.toBe('demo')
  })

  it('falls safe to demo when the gateway errors on the HTTP transport', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })))
    await expect(runMode.currentRunMode()).resolves.toBe('demo')
  })

  it('falls safe to demo when the transport throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('网络断了') }))
    await expect(runMode.currentRunMode()).resolves.toBe('demo')
  })

  it('probes once and caches the outcome at module level', async () => {
    stubModels(() => Promise.resolve({ groups: [], failures: [] }))
    await expect(runMode.currentRunMode()).resolves.toBe('demo')
    await expect(runMode.currentRunMode()).resolves.toBe('demo')
    expect(probes).toBe(1)
  })
})

describe('run-mode subscription', () => {
  it('broadcasts the probe outcome once and stops after unsubscribe', async () => {
    stubModels(() => Promise.resolve({ groups: [{ id: 'p', name: 'p', models: [{ id: 'm' }] }], failures: [] }))
    const seen: string[] = []
    const unsubscribe = runMode.subscribeRunMode(() => { seen.push('probe') })
    await runMode.currentRunMode()
    unsubscribe()
    runMode.setRunMode('demo')
    expect(seen).toEqual(['probe'])
  })
})
