// The business client-session store: the roster cache lifecycle, selection
// clearing the row cache, and the row-page cache lifecycle.

import { describe, expect, it } from 'vitest'
import { createBizClientStore } from '../src/client/bizStore.ts'

describe('biz client store', () => {
  it('tracks the roster load lifecycle', () => {
    const store = createBizClientStore()
    expect(store.store.getSnapshot().collections).toBeUndefined()
    store.beginCollections()
    expect(store.store.getSnapshot().collections).toEqual({ status: 'loading' })
    store.setCollections([{ name: 'orders', title: '订单', fields: [] }])
    expect(store.store.getSnapshot().collections).toMatchObject({ status: 'ready' })
    store.failCollections('boom')
    expect(store.store.getSnapshot().collections).toEqual({ status: 'error', error: 'boom' })
  })

  it('selecting a collection clears the row cache; deselecting too', () => {
    const store = createBizClientStore()
    store.select('orders')
    store.beginRows()
    store.setRows({ count: 1, page: 1, page_size: 20, rows: [{ id: 1 }] })
    expect(store.store.getSnapshot().rows?.status).toBe('ready')
    store.select('customers')
    expect(store.store.getSnapshot().selected).toBe('customers')
    expect(store.store.getSnapshot().rows).toBeUndefined()
    store.select(undefined)
    expect(store.store.getSnapshot().selected).toBeUndefined()
  })

  it('tracks the row-page lifecycle independently of the roster', () => {
    const store = createBizClientStore()
    store.select('orders')
    store.beginRows()
    expect(store.store.getSnapshot().rows).toEqual({ status: 'loading' })
    store.failRows('timeout')
    expect(store.store.getSnapshot().rows).toEqual({ status: 'error', error: 'timeout' })
    store.beginRows()
    store.setRows({ count: 0, page: 1, page_size: 20, rows: [] })
    expect(store.store.getSnapshot().rows).toMatchObject({ status: 'ready', value: { count: 0 } })
  })
})
