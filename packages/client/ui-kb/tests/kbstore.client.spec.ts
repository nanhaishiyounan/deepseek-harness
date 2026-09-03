// The shared client-session store and the view bridge: stats cache states,
// session-local document records (ingest receipts and search sightings), and
// the provide/revoke/request lifecycle of the cross-entry navigation bridge.

import { describe, expect, it, vi } from 'vitest'
import { createKbClientStore, createKbViewBridge } from '../src/client/kbStore.ts'

const USAGE = { documents: 12, searches: 35, ingestedDocuments: 9 }

describe('KbClientStore', () => {
  it('walks the stats cache through loading, ready, and error', () => {
    const store = createKbClientStore()
    expect(store.store.getSnapshot().stats).toBeUndefined()

    store.beginStats()
    expect(store.store.getSnapshot().stats).toEqual({ status: 'loading' })

    store.setStats(USAGE)
    expect(store.store.getSnapshot().stats).toEqual({ status: 'ready', usage: USAGE })

    store.failStats('gateway down')
    expect(store.store.getSnapshot().stats).toEqual({ status: 'error', error: 'gateway down' })
  })

  it('records an ingest receipt at the head and refreshes recency on re-ingest', () => {
    const store = createKbClientStore()
    store.noteIngested({ name: '宏发走访纪要', path: 'workspace/suppliers/hongfa.md', chunks: 6 })
    store.noteIngested({ name: 'gb2760 excerpt', path: 'workspace/data/gb2760-excerpt.md', chunks: 4 })
    expect(store.store.getSnapshot().records.map(record => record.path)).toEqual([
      'workspace/data/gb2760-excerpt.md',
      'workspace/suppliers/hongfa.md',
    ])

    // Re-ingesting the same path replaces the record (chunks update) instead
    // of duplicating the row.
    store.noteIngested({ name: '宏发走访纪要', path: 'workspace/suppliers/hongfa.md', chunks: 8 })
    const records = store.store.getSnapshot().records
    expect(records.map(record => record.path)).toEqual([
      'workspace/suppliers/hongfa.md',
      'workspace/data/gb2760-excerpt.md',
    ])
    expect(records[0]?.chunks).toBe(8)
  })

  it('folds search sightings without duplicating recorded paths', () => {
    const store = createKbClientStore()
    store.noteIngested({ name: 'gb2760 excerpt', path: 'workspace/data/gb2760-excerpt.md', chunks: 4 })
    store.noteSearched(
      ['workspace/data/gb2760-excerpt.md', 'workspace/other.md', 'workspace/other.md'],
      path => path.split('/').at(-1) ?? path,
    )
    // The ingested record stays (no duplicate); the newer sighting lands first.
    expect(store.store.getSnapshot().records.map(record => record.path)).toEqual([
      'workspace/other.md',
      'workspace/data/gb2760-excerpt.md',
    ])
    // A later ingest of a sighted path replaces the sighting row.
    store.noteIngested({ name: 'other', path: 'workspace/other.md', chunks: 2 })
    expect(store.store.getSnapshot().records.map(record => record.chunks)).toEqual([2, 4])
  })

  it('keeps the records untouched when a search sights only known paths', () => {
    const store = createKbClientStore()
    store.noteIngested({ name: 'gb2760 excerpt', path: 'workspace/data/gb2760-excerpt.md', chunks: 4 })
    const before = store.store.getSnapshot().records
    store.noteSearched(['workspace/data/gb2760-excerpt.md'], path => path.split('/').at(-1) ?? path)
    expect(store.store.getSnapshot().records).toBe(before)
  })
})

describe('KbViewBridge', () => {
  it('routes requests to the live publisher and no-ops after revoke', () => {
    const bridge = createKbViewBridge()
    const setView = vi.fn()
    bridge.request('kb')
    expect(setView).not.toHaveBeenCalled()

    const revoke = bridge.provide(setView)
    bridge.request('kb')
    expect(setView).toHaveBeenCalledWith('kb')

    revoke()
    bridge.request('kb')
    expect(setView).toHaveBeenCalledTimes(1)
  })

  it('a newer publisher wins and revoking it does not resurrect a stale one', () => {
    const bridge = createKbViewBridge()
    const first = vi.fn()
    const second = vi.fn()
    const revokeFirst = bridge.provide(first)
    bridge.provide(second)
    revokeFirst()
    bridge.request('chat')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('chat')
  })
})
