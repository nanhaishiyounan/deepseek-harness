/**
 * KbGraphRuntime registry and orchestration tests over a scripted store.
 */

import { describe, expect, it, vi, type Mock } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import KbGraphRuntime from '../src/index.ts'
import type { GraphStore, KbGraphEntity, KbGraphStoredTriple } from '../src/index.ts'

function scriptedStore(id: string, usable = true): GraphStore & {
  putTriples: Mock
  neighbors: Mock
  searchEntities: Mock
} {
  return {
    id,
    available: () => usable,
    putTriples: vi.fn(async () => 0),
    neighbors: vi.fn(async (): Promise<KbGraphStoredTriple[]> => []),
    twoHopPaths: vi.fn(async (): Promise<KbGraphStoredTriple[]> => []),
    searchEntities: vi.fn(async (): Promise<KbGraphEntity[]> => []),
    stats: vi.fn(async () => ({ triples: 0, entities: 0 })),
    close: vi.fn(),
  }
}

async function boot(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(KbGraphRuntime)
  return ctx
}

const entity: KbGraphEntity = { type: 'company', id: 'hongfa-food' }

/** Assert an async refusal's error code. */
async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await promise.then(() => { throw new Error('expected a rejection') }, (error: unknown) => {
    expect((error as { code?: string }).code).toBe(code)
  })
}

describe('KbGraphRuntime', () => {
  it('rejects a duplicate store provider id', async () => {
    const ctx = await boot()
    ctx.kbGraph.registerStoreProvider(scriptedStore('a'))
    expect(() => ctx.kbGraph.registerStoreProvider(scriptedStore('a')))
      .toThrow(/already registered/u)
  })

  it('auto-selects the single usable store and forwards queries', async () => {
    const ctx = await boot()
    const store = scriptedStore('a')
    ctx.kbGraph.registerStoreProvider(store)
    await ctx.kbGraph.neighbors('t', entity)
    expect(store.neighbors.mock.calls[0]).toEqual(['t', entity, undefined])
    await ctx.kbGraph.searchEntities('t', 'hong', 'company')
    expect(store.searchEntities.mock.calls[0]).toEqual(['t', 'hong', 'company', 10, undefined])
  })

  it('throws KB_GRAPH_STORE_AMBIGUOUS with two usable stores', async () => {
    const ctx = await boot()
    ctx.kbGraph.registerStoreProvider(scriptedStore('a'))
    ctx.kbGraph.registerStoreProvider(scriptedStore('b'))
    await expectCode(ctx.kbGraph.stats('t'), 'KB_GRAPH_STORE_AMBIGUOUS')
  })

  it('throws KB_GRAPH_STORE_UNAVAILABLE with no usable store', async () => {
    const ctx = await boot()
    await expectCode(ctx.kbGraph.stats('t'), 'KB_GRAPH_STORE_UNAVAILABLE')
  })

  it('unregisters on disposer disposal', async () => {
    const ctx = await boot()
    const dispose = ctx.kbGraph.registerStoreProvider(scriptedStore('a'))
    dispose()
    await expectCode(ctx.kbGraph.stats('t'), 'KB_GRAPH_STORE_UNAVAILABLE')
  })

  it('honors an aborted signal before any provider work', async () => {
    const ctx = await boot()
    const store = scriptedStore('a')
    ctx.kbGraph.registerStoreProvider(store)
    const controller = new AbortController()
    controller.abort()
    await expect(ctx.kbGraph.putTriples('t', [], controller.signal)).rejects.toThrow()
    expect(store.putTriples.mock.calls.length).toBe(0)
  })
})
