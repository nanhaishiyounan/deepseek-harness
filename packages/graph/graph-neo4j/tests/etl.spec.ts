import { describe, expect, it } from 'vitest'
import { BUSINESS_MANIFEST, countIslands, edgeUpsertCypher, nodeUpsertCypher, planGraph, projectScalar, reconcileGraph } from '../src/etl.ts'

describe('projectScalar', () => {
  it('keeps scalars and drops the rest', () => {
    expect(projectScalar('x')).toBe('x')
    expect(projectScalar(3)).toBe(3)
    expect(projectScalar(true)).toBe(true)
    expect(projectScalar(null)).toBeUndefined()
    expect(projectScalar({ micros: '1' })).toBeUndefined()
    expect(projectScalar(10n)).toBeUndefined()
  })
})

describe('planGraph over the business manifest', () => {
  const rows = new Map([
    ['item', [
      { id: 'i1', name: '酱油', readableId: 'IT-1', active: true, embedding: null },
      { id: 'i2', name: '白糖', readableId: 'IT-2', active: true },
    ]],
    ['customer', [{ id: 'c1', name: '宏发食品', readableId: 'C-1' }]],
    ['supplier', [{ id: 's1', name: 'CelestialElex', readableId: 'SUP-1', tags: { items: [] } }]],
    ['salesOrder', [
      { id: 'so1', salesOrderId: 'SO000001', status: 'In Progress', customerId: 'c1' },
      { id: 'so2', salesOrderId: 'SO000002', status: 'Closed', customerId: 'c1' },
      { id: 'so3', salesOrderId: 'SO000003', status: 'Closed', customerId: null },
    ]],
    ['purchaseOrder', [
      { id: 'po1', purchaseOrderId: 'PO000001', status: 'To Receive', supplierId: 's1' },
    ]],
    ['salesOrderLines', [
      { id: 'l1', salesOrderId: 'so1', itemId: 'i1' },
      { id: 'l2', salesOrderId: 'so1', itemId: 'i2' },
      { id: 'l3', salesOrderId: 'so2', itemId: 'i1' },
      { id: 'l4', salesOrderId: 'so2', itemId: 'iMissing' },
    ]],
    ['purchaseOrderLines', [
      { id: 'pl1', purchaseOrderId: 'po1', itemId: 'i1' },
    ]],
  ])

  it('plans nodes with gid anchors and scalar props only', () => {
    const planned = planGraph(rows, BUSINESS_MANIFEST)
    expect(planned.nodes.map(node => node.gid).sort()).toEqual([
      'lake.carbon:customer:c1',
      'lake.carbon:item:i1',
      'lake.carbon:item:i2',
      'lake.carbon:purchaseOrder:po1',
      'lake.carbon:salesOrder:so1',
      'lake.carbon:salesOrder:so2',
      'lake.carbon:salesOrder:so3',
      'lake.carbon:supplier:s1',
    ].sort())
    const item = planned.nodes.find(node => node.gid === 'lake.carbon:item:i1')
    expect(item?.name).toBe('酱油')
    expect(item?.props).toEqual({ readableId: 'IT-1', active: true })
  })

  it('plans document edges from reference columns and line tables', () => {
    const planned = planGraph(rows, BUSINESS_MANIFEST)
    const relations = new Map(planned.edges.map(edge => [`${edge.relation}:${edge.source}->${edge.target}`, edge]))
    expect(relations.has('orderedBy:lake.carbon:salesOrder:so1->lake.carbon:customer:c1')).toBe(true)
    expect(relations.has('orderedFrom:lake.carbon:purchaseOrder:po1->lake.carbon:supplier:s1')).toBe(true)
    expect(relations.has('orderedItem:lake.carbon:salesOrder:so1->lake.carbon:item:i1')).toBe(true)
    // The dangling itemId line (iMissing) produces no edge (emptyFkNoEdge).
    expect([...relations.keys()].filter(key => key.includes('iMissing'))).toEqual([])
  })

  it('reconciles planned counts against source row counts', () => {
    const planned = planGraph(rows, BUSINESS_MANIFEST)
    const report = reconcileGraph(rows, BUSINESS_MANIFEST, planned)
    expect(report.ok).toBe(true)
    const nodesRow = report.rows.find(row => row.kind === 'nodes' && row.key === 'salesOrder')
    expect(nodesRow).toEqual({ kind: 'nodes', key: 'salesOrder', source: 3, planned: 3, ok: true })
    // orderedBy expects the non-null customerId count: 2 of 3.
    const orderedBy = report.rows.find(row => row.kind === 'edges' && row.key === 'salesOrder.orderedBy')
    expect(orderedBy?.source).toBe(2)
    expect(orderedBy?.planned).toBe(2)
    // orderedItem expects only the resolvable line rows: 3 of 4.
    const orderedItem = report.rows.find(row => row.kind === 'edges' && row.key === 'salesOrderLines.orderedItem')
    expect(orderedItem?.source).toBe(4)
    expect(orderedItem?.planned).toBe(3)
  })

  it('flags a reconciliation break when rows appear without planned nodes', () => {
    const planned = planGraph(new Map(), BUSINESS_MANIFEST)
    const report = reconcileGraph(rows, BUSINESS_MANIFEST, planned)
    expect(report.ok).toBe(false)
    expect(report.rows.some(row => !row.ok)).toBe(true)
  })
})

describe('countIslands', () => {
  it('counts connected components deterministically', () => {
    expect(countIslands([], [])).toEqual({ nodes: 0, edges: 0, islands: 0, largestComponent: 0 })
    expect(countIslands(['a'], [])).toEqual({ nodes: 1, edges: 0, islands: 1, largestComponent: 1 })
    expect(countIslands(['a', 'b', 'c'], [{ source: 'a', target: 'b' }]))
      .toEqual({ nodes: 3, edges: 1, islands: 2, largestComponent: 2 })
    expect(countIslands(['a', 'b', 'c', 'd'], [
      { source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'a' },
    ])).toEqual({ nodes: 4, edges: 3, islands: 2, largestComponent: 3 })
  })
})

describe('upsert cypher builders', () => {
  it('emits MERGE-on-gid statements with plain-Cypher labels', () => {
    expect(nodeUpsertCypher('Item')).toContain('MERGE (n:__Entity {gid: row.gid})')
    expect(nodeUpsertCypher('Item')).toContain('SET n:`Item`, n.nodeType = row.nodeType')
    expect(edgeUpsertCypher('orderedItem')).toContain('MERGE (a)-[r:`orderedItem` {gid: row.gid}]->(b)')
  })
})
