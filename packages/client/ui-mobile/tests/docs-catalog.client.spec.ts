/** The W6-B1 docs catalog: role whitelists, labels, and posting-semantics state words (leftover ③). */

import { describe, expect, it } from 'vitest'
import { docLabelOf, docTitleFieldOf, stateWordOf, visibleCollectionsOf } from '../src/client/docsCatalog.ts'

describe('docsCatalog', () => {
  it('filters the visible collections by the signed-in role (G6)', () => {
    const buyer = visibleCollectionsOf('buyer').map(entry => entry.collection)
    expect(buyer).toEqual(['pur_orders', 'pur_requests', 'srm_suppliers'])
    const keeper = visibleCollectionsOf('keeper').map(entry => entry.collection)
    expect(keeper).toContain('wms_receipts')
    expect(keeper).not.toContain('pur_orders')
    // W6-B3: the batch archive (the barcode card's host collection) rides
    // the keeper and quality faces.
    expect(keeper).toContain('wms_lots')
    expect(visibleCollectionsOf('qc_inspector').map(entry => entry.collection)).toContain('wms_lots')
    expect(docLabelOf('wms_lots')).toBe('批次档案')
    expect(docTitleFieldOf('wms_lots')).toBe('lot_no')
    // An unknown account reads the full base catalog under the generic group.
    const guest = visibleCollectionsOf('someone-else')
    expect(guest.length).toBeGreaterThan(buyer.length)
    // admin sees everything the catalog holds.
    expect(visibleCollectionsOf('admin').length).toBe(guest.length)
  })

  it('labels doc types and names their title columns', () => {
    expect(docLabelOf('pur_orders')).toBe('采购订单')
    expect(docLabelOf('wms_receipts')).toBe('收货单')
    expect(docLabelOf('unknown_collection')).toBe('unknown_collection')
    expect(docTitleFieldOf('wms_receipts')).toBe('receipt_no')
    expect(docTitleFieldOf('unknown_collection')).toBe('id')
  })

  it('translates posting collections with posting semantics, never approval words (leftover ③)', () => {
    // A wms_receipts draft awaits the warehouse posting engine — not approval.
    expect(stateWordOf('wms_receipts', 'draft')).toBe('待过账')
    expect(stateWordOf('wms_receipts', 'pending')).toBe('过账处理中')
    expect(stateWordOf('mfg_job_reports', 'draft')).toBe('待过账')
    expect(stateWordOf('wms_transfers', 'posted')).toBe('已过账')
    // Approval collections keep the six-state vocabulary.
    expect(stateWordOf('pur_orders', 'draft')).toBe('草稿')
    expect(stateWordOf('pur_orders', 'pending')).toBe('待审批')
    expect(stateWordOf('pur_orders', 'approved')).toBe('已生效')
    expect(stateWordOf('so_orders', 'rejected')).toBe('已驳回')
    // Unmapped words pass through untouched.
    expect(stateWordOf('pur_orders', 'exotic')).toBe('exotic')
  })
})
