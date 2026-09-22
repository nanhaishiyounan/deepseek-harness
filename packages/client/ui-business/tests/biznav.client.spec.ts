// @vitest-environment jsdom
// The navigator's pure derivation layer: every domain matcher plus the
// 'other' fallthrough, the live search's titleless arm, the frecency log's
// persistence matrix (localStorage corrupt/absent), the inline-edit
// whitelist, and the supplier-360 / order-status cell extractors including
// their skip arms (id, non-matching names, non-scalar and blank values).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  collectionMatches, daysUntil, domainOf, frecentCollections, groupRoster,
  isInlineEditable, isOrderCollection, isSupplierCollection, noteCollectionUsed,
  orderStatusCell, supplierCertCells,
} from '../src/client/bizNav.ts'
import type { BizCollectionRow } from '../src/client/bizTypes.ts'

/** One roster row in one line. */
const row = (name: string, title?: string): BizCollectionRow =>
  title === undefined ? { name, fields: [] } : { name, title, fields: [] }

// The frecency log keeps a module-level in-memory fallback, so each test
// re-seeds storage with an empty array instead of clearing it: a cleared
// store would fall through to the previous test's memory residue.
beforeEach(() => { localStorage.setItem('dsh-biz-recent-collections', '[]') })
afterEach(() => { vi.unstubAllGlobals() })

describe('domain grouping', () => {
  it('maps every domain keyword to its bucket and falls through to other', () => {
    expect(domainOf(row('vendors', '供应商大表'))).toBe('srm')
    expect(domainOf(row('srmSuppliers'))).toBe('srm')
    expect(domainOf(row('customers', '客户'))).toBe('crm')
    expect(domainOf(row('experts', '专家库'))).toBe('crm')
    expect(domainOf(row('warehouseStock', '库存'))).toBe('wms')
    expect(domainOf(row('batches', '批次'))).toBe('wms')
    expect(domainOf(row('salesOrders', '订单'))).toBe('orders')
    expect(domainOf(row('ticketQueue', '工单'))).toBe('helpdesk')
    expect(domainOf(row('inspections', '巡检'))).toBe('helpdesk')
    expect(domainOf(row('expenseInvoices', '发票'))).toBe('finance')
    expect(domainOf(row('taxRefunds', '退税'))).toBe('finance')
    expect(domainOf(row('recipes', '配方'))).toBe('food')
    expect(domainOf(row('complianceDocs', '合规'))).toBe('food')
    // No matcher hits: the trailing 'other' bucket.
    expect(domainOf(row('internalNotes', '随手记'))).toBe('other')
  })

  it('matches the live search over name and title, titleless rows included', () => {
    expect(collectionMatches(row('orders'), 'ord')).toBe(true)
    expect(collectionMatches(row('misc', '订单归档'), '订单')).toBe(true)
    // A row without a title still matches on its name alone.
    expect(collectionMatches(row('rawData'), 'raw')).toBe(true)
    expect(collectionMatches(row('rawData'), '')).toBe(true)
    expect(collectionMatches(row('orders', '订单'), '客户')).toBe(false)
  })

  it('groups into ordered buckets with the frecency rail, and empties on a miss', () => {
    noteCollectionUsed('orders')
    const buckets = groupRoster([row('orders', '订单'), row('customers', '客户'), row('rawData')], '')
    expect(buckets.map(bucket => bucket.domain)).toEqual(['frequent', 'crm', 'orders', 'other'])
    // The frecency rail repeats the used entry on top of its own domain bucket.
    expect(buckets[0]?.entries).toEqual([row('orders', '订单')])
    expect(groupRoster([row('orders', '订单')], '没有任何命中')).toEqual([])
  })
})

describe('frecency persistence', () => {
  it('caps the log at six and moves a reused entry to the front', () => {
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) noteCollectionUsed(name)
    expect(frecentCollections()).toEqual(['g', 'f', 'e', 'd', 'c', 'b'])
    expect(noteCollectionUsed('c')).toEqual(['c', 'g', 'f', 'e', 'd', 'b'])
  })

  it('drops corrupted or mistyped storage to the in-memory copy', () => {
    noteCollectionUsed('orders')
    localStorage.setItem('dsh-biz-recent-collections', '{not json')
    expect(frecentCollections()).toEqual(['orders'])
    localStorage.setItem('dsh-biz-recent-collections', JSON.stringify([1, 'orders']))
    expect(frecentCollections()).toEqual(['orders'])
  })

  it('serves the session from memory when localStorage is unavailable', () => {
    noteCollectionUsed('orders')
    // Bindings gone (private mode / storage disabled): reads fall back to the
    // in-memory copy and writes skip persistence instead of throwing.
    vi.stubGlobal('localStorage', undefined)
    expect(frecentCollections()).toEqual(['orders'])
    expect(noteCollectionUsed('customers')).toEqual(['customers', 'orders'])
    expect(typeof localStorage === 'undefined').toBe(true)
  })
})

describe('collection hints and cell extractors', () => {
  it('whitelists exactly the low-risk inline-edit field semantics', () => {
    expect(isInlineEditable('remark')).toBe(true)
    expect(isInlineEditable('internalNote')).toBe(true)
    expect(isInlineEditable('备注')).toBe(true)
    expect(isInlineEditable('qty')).toBe(true)
    expect(isInlineEditable('数量')).toBe(true)
    expect(isInlineEditable('expiryDate')).toBe(true)
    expect(isInlineEditable('有效期至')).toBe(true)
    expect(isInlineEditable('amount')).toBe(false)
    expect(isInlineEditable('name')).toBe(false)
  })

  it('detects supplier-like and order-like collections from name and title', () => {
    expect(isSupplierCollection(row('vendors', '供应商'))).toBe(true)
    expect(isSupplierCollection(row('srmArchive'))).toBe(true)
    expect(isSupplierCollection(row('orders', '订单'))).toBe(false)
    expect(isOrderCollection(row('purchaseOrders'))).toBe(true)
    expect(isOrderCollection(row('orders', '订单'))).toBe(true)
    expect(isOrderCollection(row('customers', '客户'))).toBe(false)
  })

  it('extracts scalar cert cells and skips id, non-matching, and blank fields', () => {
    expect(supplierCertCells({
      id: 3,
      许可证: '2027-01-01',
      认证标志: true,
      licenseNo: 42,
      contact: '张红喜',
      审核意见: { rating: 'B' },
      备案证: '',
    })).toEqual([['许可证', '2027-01-01'], ['认证标志', 'true'], ['licenseNo', '42']])
    expect(supplierCertCells({ id: 1, name: '宏发' })).toEqual([])
  })

  it('counts whole days until a date text, negative past and NaN unparseable', () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString()
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString()
    expect(daysUntil(future)).toBeGreaterThanOrEqual(2)
    expect(daysUntil(past)).toBeLessThanOrEqual(-2)
    expect(Number.isNaN(daysUntil('长期有效'))).toBe(true)
  })

  it('picks the first non-empty scalar status cell, skipping mismatches', () => {
    expect(orderStatusCell({ id: 1, orderStatus: 'pending', note: 'x' })).toEqual(['orderStatus', 'pending'])
    // The first status-named field is scalar-blank, so the second wins.
    expect(orderStatusCell({ order_status: '', 状态: 'shipped' })).toEqual(['状态', 'shipped'])
    // Non-scalar status values and statusless rows resolve to undefined.
    expect(orderStatusCell({ status: { code: 2 } })).toBeUndefined()
    expect(orderStatusCell({ id: 9, name: 'n' })).toBeUndefined()
  })
})
