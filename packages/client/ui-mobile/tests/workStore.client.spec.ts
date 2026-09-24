// @vitest-environment jsdom
/**
 * The work store: CRUD, the four-status state-machine guard, localStorage
 * persistence round-trips, the corrupt-reset path, exec-session registration
 * and filtering, subscription broadcasts, and the derived selectors.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkItem, WorkStoreShape } from '../src/client/workStore.ts'

/** The freshly imported store module (module state resets per test). */
let store: typeof import('../src/client/workStore.ts')

beforeEach(async () => {
  localStorage.clear()
  vi.useRealTimers()
  vi.resetModules()
  store = await import('../src/client/workStore.ts')
})

/** One created item helper with the defaults frozen in. */
function makeItem(title: string, overrides: Partial<Parameters<typeof store.createWorkItem>[0]> = {}): WorkItem {
  return store.createWorkItem({ title, owner: '业务员', ...overrides })
}

describe('workStore CRUD', () => {
  it('creates with the documented defaults and persists the whole store', () => {
    const item = store.createWorkItem({ title: '跟进供应商', owner: '陈晨' })
    expect(item.id).toMatch(/^w_/)
    expect(item.status).toBe('todo')
    expect(item.demo).toBe(false)
    expect(item.pinned).toBe(false)
    expect(item.due).toBeUndefined()
    expect(item.sourceSessionId).toBeUndefined()
    expect(item.createdAt).toBe(item.updatedAt)
    const persisted = JSON.parse(localStorage.getItem('dsh-mobile-work') ?? '{}') as WorkStoreShape
    expect(persisted.version).toBe(1)
    expect(persisted.items).toHaveLength(1)
    expect(persisted.items[0]?.id).toBe(item.id)
    expect(persisted.seeded).toBe(false)
  })

  it('keeps the given fields (source anchors, due, suggestion, immediate doing, demo)', () => {
    const item = store.createWorkItem({
      title: '资质换发', owner: '高翔', due: '2026-09-30', suggestion: '联系供应商',
      sourceSessionId: 's_1', sourceAnchor: '42', status: 'doing', demo: true,
    })
    expect(item.due).toBe('2026-09-30')
    expect(item.suggestion).toBe('联系供应商')
    expect(item.sourceSessionId).toBe('s_1')
    expect(item.sourceAnchor).toBe('42')
    expect(item.status).toBe('doing')
    expect(item.demo).toBe(true)
  })

  it('patches fields and refreshes updatedAt while id and createdAt stay fixed', () => {
    vi.useFakeTimers({ now: 1_000 })
    const item = makeItem('任务A')
    vi.setSystemTime(2_000)
    const updated = store.updateWorkItem(item.id, { title: '任务A改', pinned: true })
    expect(updated.title).toBe('任务A改')
    expect(updated.pinned).toBe(true)
    expect(updated.id).toBe(item.id)
    expect(updated.createdAt).toBe(1_000)
    expect(updated.updatedAt).toBe(2_000)
  })

  it('throws on updating, transitioning, or deleting an unknown id', () => {
    expect(() => store.updateWorkItem('w_missing', { title: 'x' })).toThrow('工作项不存在：w_missing')
    expect(() => store.transitionWorkItem('w_missing', 'doing')).toThrow('工作项不存在')
    expect(() => { store.deleteWorkItem('w_missing') }).toThrow('工作项不存在')
  })

  it('deletes one item and leaves the rest', () => {
    const a = makeItem('A')
    const b = makeItem('B')
    store.deleteWorkItem(a.id)
    expect(store.workSnapshot().items.map(entry => entry.id)).toEqual([b.id])
  })

  it('keeps the in-memory state and broadcasting when persistence fails', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
    })
    try {
      let broadcasts = 0
      store.subscribeWork(() => { broadcasts += 1 })
      const item = makeItem('满盘任务')
      // The write degraded: memory holds the item, listeners heard the commit.
      expect(store.workSnapshot().items.map(entry => entry.id)).toEqual([item.id])
      expect(broadcasts).toBeGreaterThan(0)
      await vi.waitFor(() => {
        expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('本地存储写入失败')
      })
    } finally {
      setItem.mockRestore()
    }
  })
})

describe('workStore cross-tab merge', () => {
  it('merges a remote storage write: new items join, older rows keep local, exec ids union', async () => {
    const localOld = makeItem('本地旧')
    const localShared = makeItem('共享项')
    const localNewest = makeItem('本地最新')
    const stale = store.workSnapshot().items.find(entry => entry.id === localNewest.id)!
    const remoteStale = { ...stale, updatedAt: stale.updatedAt - 5000, title: '远端旧' }
    const remoteSharedUpdated = { ...store.workSnapshot().items.find(entry => entry.id === localShared.id)!, updatedAt: Date.now() + 5000, title: '远端改' }
    const remoteOnly = makeItemForRemote()
    const remote = {
      version: 1,
      items: [remoteOnly, remoteSharedUpdated, remoteStale],
      execSessionIds: ['exec_remote'],
      seeded: true,
    }
    localStorage.setItem('dsh-mobile-work', JSON.stringify(remote))
    let notified = false
    store.subscribeWork(() => { notified = true })
    window.dispatchEvent(new StorageEvent('storage', { key: 'dsh-mobile-work', newValue: JSON.stringify(remote) }))
    const merged = store.workSnapshot()
    expect(notified).toBe(true)
    expect(merged.items.map(entry => entry.id)).toEqual([localOld.id, localShared.id, localNewest.id, remoteOnly.id])
    expect(merged.items.find(entry => entry.id === localShared.id)?.title).toBe('远端改')
    // The remote stale row never clobbers the local newer one.
    expect(merged.items.find(entry => entry.id === localNewest.id)?.title).toBe('本地最新')
    expect(merged.execSessionIds).toContain('exec_remote')
    expect(merged.seeded).toBe(true)
  })

  it('skips the merge broadcast when the remote write equals the local store', () => {
    makeItem('已同步')
    const snapshot = store.workSnapshot()
    let notified = false
    store.subscribeWork(() => { notified = true })
    window.dispatchEvent(new StorageEvent('storage', { key: 'dsh-mobile-work', newValue: JSON.stringify(snapshot) }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'dsh-mobile-work' }))
    expect(notified).toBe(false)
    expect(store.workSnapshot()).toEqual(snapshot)
  })

  it('ignores storage writes for other keys and corrupt remote payloads', () => {
    makeItem('基准')
    window.dispatchEvent(new StorageEvent('storage', { key: 'dsh-mobile-theme' }))
    expect(store.workSnapshot().items).toHaveLength(1)
    window.dispatchEvent(new StorageEvent('storage', { key: 'dsh-mobile-work', newValue: '{broken' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'dsh-mobile-work', newValue: '{"version":2,"items":[],"execSessionIds":[],"seeded":false}' }))
    expect(store.workSnapshot().items).toHaveLength(1)
  })
})

describe('workStore seed latch', () => {
  it('unlatches the seeded flag for a re-seed', () => {
    store.markWorkSeeded()
    expect(store.workSnapshot().seeded).toBe(true)
    store.resetWorkSeeded()
    expect(store.workSnapshot().seeded).toBe(false)
    // The unlatch commit is a no-op on an already-unseeded store.
    const before = JSON.stringify(store.workSnapshot())
    store.resetWorkSeeded()
    expect(JSON.stringify(store.workSnapshot())).toBe(before)
  })
})

/** One remote-shaped item without touching the local singleton store. */
function makeItemForRemote(): WorkItem {
  const now = Date.now()
  return {
    id: `w_remote${Math.random().toString(36).slice(2, 6)}`, title: '远端项', owner: '业务员', status: 'todo',
    due: undefined, suggestion: undefined, sourceSessionId: undefined, sourceAnchor: undefined,
    execSessionId: undefined, result: undefined, artifact: undefined, pinned: false, demo: false,
    createdAt: now, updatedAt: now,
  }
}

describe('workStore state machine', () => {
  it('walks the legal path todo → doing → review → done', () => {
    const item = makeItem('任务')
    expect(store.transitionWorkItem(item.id, 'doing').status).toBe('doing')
    expect(store.transitionWorkItem(item.id, 'review').status).toBe('review')
    expect(store.transitionWorkItem(item.id, 'done').status).toBe('done')
  })

  it('walks the review loop back to doing', () => {
    const item = makeItem('任务')
    store.transitionWorkItem(item.id, 'doing')
    store.transitionWorkItem(item.id, 'review')
    expect(store.transitionWorkItem(item.id, 'doing').status).toBe('doing')
  })

  it.each([
    ['todo → review', 'todo', 'review'],
    ['todo → done', 'todo', 'done'],
    ['doing → done', 'doing', 'done'],
    ['doing → todo', 'doing', 'todo'],
    ['done → doing (terminal)', 'done', 'doing'],
    ['done → review (terminal)', 'done', 'review'],
  ])('rejects the illegal transition %s', (_label, from, to) => {
    const item = makeItem('任务', { status: from as WorkItem['status'] })
    expect(() => store.transitionWorkItem(item.id, to as WorkItem['status'])).toThrow('非法工作状态转移')
  })
})

describe('workStore persistence', () => {
  it('restores the whole store on a fresh module load', async () => {
    const item = makeItem('跨模块', { status: 'doing' })
    store.registerExecSession(item.id, 'exec_1')
    store.markWorkSeeded()
    const before = store.workSnapshot()
    vi.resetModules()
    const reloaded = await import('../src/client/workStore.ts')
    expect(reloaded.workSnapshot()).toEqual(before)
    expect(reloaded.workSnapshot().seeded).toBe(true)
    expect(reloaded.isWorkSession('exec_1')).toBe(true)
  })

  it('resets a corrupt store to empty and seeded, warning on console', async () => {
    localStorage.setItem('dsh-mobile-work', '{not json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.resetModules()
    const fresh = await import('../src/client/workStore.ts')
    expect(fresh.workSnapshot()).toEqual({ version: 1, items: [], execSessionIds: [], seeded: true })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dsh-mobile-work'))
  })

  it('resets an unrecognized version the same way', async () => {
    localStorage.setItem('dsh-mobile-work', '{"version":2,"items":[],"execSessionIds":[],"seeded":false}')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.resetModules()
    const fresh = await import('../src/client/workStore.ts')
    expect(fresh.workSnapshot().seeded).toBe(true)
    expect(fresh.workSnapshot().items).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dsh-mobile-work'))
  })

  it('resets a non-object store payload (a bare number) the same way', async () => {
    localStorage.setItem('dsh-mobile-work', '42')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.resetModules()
    const fresh = await import('../src/client/workStore.ts')
    expect(fresh.workSnapshot()).toEqual({ version: 1, items: [], execSessionIds: [], seeded: true })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dsh-mobile-work'))
  })
})

describe('workStore seed latch', () => {
  it('marks once and skips the commit when already seeded', () => {
    let broadcasts = 0
    store.subscribeWork(() => { broadcasts += 1 })
    makeItem('A')
    store.markWorkSeeded()
    store.markWorkSeeded()
    expect(store.workSnapshot().seeded).toBe(true)
    expect(broadcasts).toBe(2)
  })
})

describe('workStore exec sessions', () => {
  it('registers the isolation set and the item field together, idempotently', () => {
    const item = makeItem('执行')
    store.registerExecSession(item.id, 'exec_9')
    expect(store.workOf(store.workSnapshot().items, item.id)?.execSessionId).toBe('exec_9')
    expect(store.isWorkSession('exec_9')).toBe(true)
    expect(store.isWorkSession('other')).toBe(false)
    store.registerExecSession(item.id, 'exec_9')
    expect(store.workSnapshot().execSessionIds).toEqual(['exec_9'])
  })

  it('keeps the isolation entry after the item is deleted', () => {
    const item = makeItem('执行')
    store.registerExecSession(item.id, 'exec_gone')
    store.deleteWorkItem(item.id)
    expect(store.workSnapshot().items).toHaveLength(0)
    expect(store.isWorkSession('exec_gone')).toBe(true)
  })
})

describe('workStore subscription', () => {
  it('broadcasts every write and stops after unsubscribe', () => {
    const seen: number[] = []
    const unsubscribe = store.subscribeWork(() => { seen.push(store.workSnapshot().items.length) })
    makeItem('A')
    makeItem('B')
    unsubscribe()
    makeItem('C')
    expect(seen).toEqual([1, 2])
  })
})

describe('workStore derived selectors', () => {
  /** A fixed reference clock (2026-09-22 12:00 local). */
  const now = new Date(2026, 8, 22, 12, 0, 0).getTime()

  it('counts the stats with done only when its result landed today', () => {
    vi.useFakeTimers({ now })
    makeItem('t1')
    makeItem('t2')
    makeItem('d1', { status: 'doing' })
    makeItem('r1', { status: 'review' })
    const doneToday = makeItem('done-new', { status: 'done' })
    store.updateWorkItem(doneToday.id, { result: { summary: '今日完成', finishedAt: now - 1_000 } })
    const doneYesterday = makeItem('done-old', { status: 'done' })
    store.updateWorkItem(doneYesterday.id, { result: { summary: '昨日完成', finishedAt: now - 86_400_000 } })
    makeItem('done-bare', { status: 'done' })
    expect(store.todayStats(store.workSnapshot().items, now)).toEqual({ todo: 2, doing: 1, review: 1, doneToday: 1 })
  })

  it('orders one status newest-update-first and finds by id', () => {
    vi.useFakeTimers({ now })
    const first = makeItem('first')
    vi.setSystemTime(now + 5_000)
    const second = makeItem('second')
    store.updateWorkItem(first.id, { title: 'first touched later' })
    expect(store.byStatus(store.workSnapshot().items, 'todo').map(entry => entry.id)).toEqual([first.id, second.id])
    expect(store.workOf(store.workSnapshot().items, second.id)?.title).toBe('second')
    expect(store.workOf(store.workSnapshot().items, 'w_none')).toBeUndefined()
  })

  it('splits my tasks from the team by owner, each side newest-update-first', () => {
    vi.useFakeTimers({ now })
    const mineOld = makeItem('我的旧', { owner: '业务员' })
    vi.setSystemTime(now + 5_000)
    const mineNew = makeItem('我的新', { owner: '业务员' })
    const theirsOld = makeItem('团队旧', { owner: '陈晨' })
    vi.setSystemTime(now + 10_000)
    const theirsNew = makeItem('团队新', { owner: '高翔' })
    const items = store.workSnapshot().items
    expect(store.myTasks(items, '业务员').map(entry => entry.id)).toEqual([mineNew.id, mineOld.id])
    expect(store.teamTasks(items, '业务员').map(entry => entry.id)).toEqual([theirsNew.id, theirsOld.id])
  })

  it('projects artifact-bearing items onto file rows, newest first', () => {
    vi.useFakeTimers({ now })
    const plain = makeItem('无产物')
    const older = makeItem('早产物')
    store.updateWorkItem(older.id, {
      artifact: {
        v: 3, type: 'report', id: 'r_1', title: '旧报告',
        metrics: [{ label: '采购额', value: '1', kind: 'count' }],
      },
    })
    vi.setSystemTime(now + 5_000)
    const bearing = makeItem('晚产物')
    store.updateWorkItem(bearing.id, {
      artifact: {
        v: 3, type: 'report', id: 'r_2', title: '概览', subtitle: '湖仓口径',
        metrics: [{ label: '采购额', value: '1', kind: 'count' }],
      },
      pinned: true,
      sourceSessionId: 's_1',
    })
    const rows = store.fileProjections(store.workSnapshot().items)
    expect(rows).toEqual([{
      id: bearing.id, title: '概览', subtitle: '湖仓口径', createdAt: bearing.createdAt,
      pinned: true, demo: false, sourceSessionId: 's_1', origin: 'ai',
    }, {
      id: older.id, title: '旧报告', subtitle: undefined, createdAt: older.createdAt,
      pinned: false, demo: false, sourceSessionId: undefined, origin: 'ai',
    }])
    expect(rows.some(row => row.id === plain.id)).toBe(false)
  })
})
