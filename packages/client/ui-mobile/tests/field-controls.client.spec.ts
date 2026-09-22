// @vitest-environment jsdom
/** fieldControls: the NocoBase field-type → widget mapping. */

import { describe, expect, it } from 'vitest'
import { fieldControlOf, fieldLabelOf, relationLabelColumn } from '../src/client/fieldControls.ts'

describe('fieldControlOf', () => {
  it('maps the five typed widgets from the schema field', () => {
    expect(fieldControlOf('c', 'amount', { name: 'amount', type: 'float', title: '金额' })).toEqual({
      kind: 'number', name: 'amount', label: '金额', options: [], target: undefined,
    })
    expect(fieldControlOf('c', 'done', { name: 'done', type: 'boolean' }).kind).toBe('bool')
    expect(fieldControlOf('c', 'order_date', { name: 'order_date', type: 'dateOnly' }).kind).toBe('date')
    expect(fieldControlOf('c', 'note', { name: 'note', type: 'text' }).kind).toBe('textarea')
    expect(fieldControlOf('c', 'supplier', { name: 'supplier', type: 'belongsTo', target: 'hub_po_suppliers' }))
      .toEqual({ kind: 'relation', name: 'supplier', label: 'supplier', options: [], target: 'hub_po_suppliers' })
  })

  it('reads the enum vocabulary the wire does not project', () => {
    expect(fieldControlOf('hub_po_purchase_orders', 'status', { name: 'status', type: 'string' }).options)
      .toEqual(['draft', 'sent', 'received', 'cancelled'])
    expect(fieldControlOf('srm_capas', 'status', { name: 'status', type: 'string' }).options)
      .toEqual(['initiated', 'verifying', 'replied', 'closed'])
  })

  it('falls back to text without meta, for owners, and for unknown enums', () => {
    expect(fieldControlOf('c', 'anything', undefined).kind).toBe('text')
    expect(fieldControlOf('c', 'owner', { name: 'owner', type: 'belongsTo', target: 'users' }).kind).toBe('text')
    expect(fieldControlOf('not_a_table', 'status', undefined).kind).toBe('text')
  })

  it('labels from the meta title and the relation label column', () => {
    expect(fieldLabelOf({ name: 'a', type: 'string', title: '单号' }, 'a')).toBe('单号')
    expect(fieldLabelOf({ name: 'a', type: 'string', title: '' }, 'a')).toBe('a')
    expect(fieldLabelOf(undefined, 'a')).toBe('a')
    expect(relationLabelColumn('hub_po_suppliers')).toBe('name')
    expect(relationLabelColumn('users')).toBe('nickname')
  })
})
