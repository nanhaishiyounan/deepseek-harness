// @vitest-environment jsdom
/**
 * The demo seed: the first-run write (two team tasks, one pinned report
 * artifact, all demo-marked, seeded latching), its idempotence, and the
 * cleanup that removes exactly the demo items while real ones survive.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The freshly imported modules (module state resets per test). */
let demo: typeof import('../src/client/demoSeed.ts')
let store: typeof import('../src/client/workStore.ts')

beforeEach(async () => {
  localStorage.clear()
  vi.useRealTimers()
  vi.resetModules()
  demo = await import('../src/client/demoSeed.ts')
  store = await import('../src/client/workStore.ts')
})

describe('demo team constant', () => {
  it('names the three demo members with their duty lines', () => {
    expect(demo.TEAM_MEMBERS).toEqual([
      { name: '陈晨', duty: '采购' },
      { name: '高翔', duty: '品控' },
      { name: '林小满', duty: '仓储' },
    ])
  })
})

describe('seedDemoData', () => {
  it('writes two team tasks and one pinned artifact, all demo-marked and seeded', () => {
    demo.seedDemoData()
    const { items, seeded } = store.workSnapshot()
    expect(seeded).toBe(true)
    expect(items).toHaveLength(3)
    expect(items.every(item => item.demo)).toBe(true)
    const statuses = items.map(item => item.status).sort()
    expect(statuses).toEqual(['doing', 'done', 'review'])
    const owners = items.map(item => item.owner).sort()
    expect(owners).toEqual(['林小满', '陈晨', '高翔'])
    const bearing = items.find(item => item.artifact !== undefined)
    expect(bearing?.pinned).toBe(true)
    expect(bearing?.artifact?.type).toBe('report')
    // W23-B1: the demo report title stays concrete (month + carried fact)
    // so the demo corpus never re-teaches the「本月经营概览」template.
    expect(bearing?.artifact?.title).toMatch(/^\d{1,2}月经营概览：按期交付 96%$/)
    expect(bearing?.result?.summary).not.toBeUndefined()
    const review = items.find(item => item.status === 'review')
    expect(review?.result?.summary).not.toBeUndefined()
    const doing = items.find(item => item.status === 'doing')
    expect(doing?.suggestion).not.toBeUndefined()
  })

  it('replays nothing once seeded', () => {
    demo.seedDemoData()
    demo.seedDemoData()
    expect(store.workSnapshot().items).toHaveLength(3)
  })

  it('never seeds a store a corrupt reset already marked seeded', async () => {
    localStorage.setItem('dsh-mobile-work', '{broken')
    vi.resetModules()
    demo = await import('../src/client/demoSeed.ts')
    store = await import('../src/client/workStore.ts')
    demo.seedDemoData()
    expect(store.workSnapshot().items).toHaveLength(0)
    expect(store.workSnapshot().seeded).toBe(true)
  })
})

describe('clearDemoData', () => {
  it('removes exactly the demo items and unlatches the seed for a re-seed', () => {
    demo.seedDemoData()
    const real = store.createWorkItem({ title: '真实任务', owner: '业务员' })
    demo.clearDemoData()
    const { items, seeded } = store.workSnapshot()
    expect(items.map(item => item.id)).toEqual([real.id])
    expect(items[0]?.demo).toBe(false)
    expect(seeded).toBe(false)
    // The unlatched seed replays the demo workspace on the next mount.
    demo.seedDemoData()
    expect(store.workSnapshot().items).toHaveLength(4)
  })
})
