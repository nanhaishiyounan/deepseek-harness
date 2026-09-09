/**
 * Deterministic mapping tests (R01–R13) over fixed collection metadata and
 * rows: type derivation, prop projection, edge derivation from declared
 * belongsTo and configured fk links, and the lakehouse/connector node
 * mappings.
 */

import { describe, expect, it } from 'vitest'
import type { NocoBaseCollectionMeta } from '@deepseek-ai/dsh-connector-nocobase'
import type { LakehouseTable } from '@deepseek-ai/dsh-lakehouse'
import type { ConnectorDatasetSummary } from '@deepseek-ai/dsh-connector'
import {
  connectorDatasetToNode, isMappableCollection, lakehouseTableToNode, mapNocoBaseCollection,
  nocoBaseRowToEdges, nocoBaseRowToNode, nocoBaseNodeId, scalarText,
} from '../src/mappers.ts'


const NOW = '2026-09-06T12:00:00.000Z'

const EXPERTS: NocoBaseCollectionMeta = {
  name: 'experts',
  title: '专家',
  filterTargetKey: 'id',
  fields: [
    { name: 'name', type: 'string', title: '姓名' },
    { name: 'org', type: 'string' },
    { name: 'password', type: 'password' },
    { name: 'sort', type: 'sort' },
  ],
}

const SERVICES: NocoBaseCollectionMeta = {
  name: 'expert_services',
  title: '专家服务',
  filterTargetKey: 'id',
  fields: [
    { name: 'expertId', type: 'integer' },
    { name: 'name', type: 'string' },
    { name: 'price', type: 'string' },
    { name: 'deliverableList', type: 'hasMany', target: 'deliverables' },
    { name: 'attachments', type: 'belongsToMany', target: 'attachments' },
  ],
}

const ORDERS: NocoBaseCollectionMeta = {
  name: 'orders',
  title: '专家服务订单',
  filterTargetKey: 'id',
  fields: [
    { name: 'orderNo', type: 'string' },
    { name: 'serviceId', type: 'string' },
    { name: 'clientName', type: 'string' },
    { name: 'custom', type: 'belongsTo', target: 'experts', foreignKey: 'customId', title: '定制专家' },
  ],
}

const MAPPED = ['experts', 'expert_services', 'orders']

describe('scalarText wire shapes', () => {
  it('renders every scalar wire shape and refuses structs', () => {
    expect(scalarText('x')).toBe('x')
    expect(scalarText(7)).toBe('7')
    expect(scalarText(5n)).toBe('5')
    expect(scalarText(false)).toBe('false')
    expect(scalarText(undefined)).toBeUndefined()
    expect(scalarText(null)).toBeUndefined()
    expect(() => scalarText({})).toThrow(/scalar/u)
  })
})

describe('R12 collection filtering', () => {
  it('keeps business collections and drops hidden or inheriting system tables', () => {
    expect(isMappableCollection({ name: 'orders' })).toBe(true)
    expect(isMappableCollection({ name: 'roles', hidden: true })).toBe(false)
    expect(isMappableCollection({ name: 'users', inherits: 'acls' })).toBe(false)
  })
})

describe('R01/R02/R05/R10 type derivation', () => {
  it('derives a draft node type with anchor, natural key, and scalar props', () => {
    const mapping = mapNocoBaseCollection(EXPERTS, { name: 'experts', anchor: 'Expert' }, MAPPED)
    expect(mapping.nodeType.id).toBe('experts' as never)
    expect(String(mapping.nodeType.extends)).toBe('Expert')
    expect(mapping.nodeType.naturalKey).toBe('id')
    expect(mapping.nodeType.status).toBe('draft')
    expect(mapping.nodeType.source).toBe('nocobase-derived')
    expect(mapping.nodeType.props.map(prop => prop.key)).toEqual(['name', 'org'])
  })

  it('registers declared belongsTo relations to mapped targets and records skipped fields (R06/R07)', () => {
    const services = mapNocoBaseCollection(SERVICES, { name: 'expert_services', anchor: 'ExpertService' }, MAPPED)
    expect(services.declaredRelations).toHaveLength(0)
    expect(services.skippedRelationFields).toEqual(['deliverableList', 'attachments'])
    const orders = mapNocoBaseCollection(ORDERS, { name: 'orders', anchor: 'Order' }, MAPPED)
    expect(orders.declaredRelations.map(relation => String(relation.id))).toEqual(['orders.custom'])
    expect(String(orders.declaredRelations[0]?.constraints[0]?.range)).toBe('experts')
  })
})

describe('row mapping', () => {
  it('mints ids, picks display names, and projects scalars only', () => {
    const node = nocoBaseRowToNode(EXPERTS, { name: 'experts' }, { id: 1, name: '张红喜', org: '协会', password: 'x' }, NOW)
    expect(node.id).toBe('nocobase:experts:1')
    expect(node.naturalKey).toBe('1')
    expect(node.name).toBe('张红喜')
    expect(node.props).toEqual({ name: '张红喜', org: '协会' })
  })

  it('derives declared belongsTo edges from appended rows and fk columns (R06/R11/R13)', () => {
    const edges = nocoBaseRowToEdges(ORDERS, { name: 'orders' }, {
      id: 9, orderNo: 'ORD-9', serviceId: 'expert_services/2',
      custom: { id: 3, name: '张红喜' },
    }, NOW)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.srcId).toBe('nocobase:orders:9')
    expect(edges[0]?.dstId).toBe('nocobase:experts:3')
    expect(String(edges[0]?.relation)).toBe('orders.custom')
    expect(edges[0]?.provenance.sourceId).toBe('orders/9')
    // The fk column still resolves when the append is absent (R11 nullable case
    // below emits no edge at all).
    const viaColumn = nocoBaseRowToEdges(ORDERS, { name: 'orders' }, { id: 10, customId: 3 }, NOW)
    expect(viaColumn[0]?.dstId).toBe('nocobase:experts:3')
    const empty = nocoBaseRowToEdges(ORDERS, { name: 'orders' }, { id: 11 }, NOW)
    expect(empty).toHaveLength(0)
  })

  it('resolves configured fk links for plain ids and collection addresses', () => {
    const edges = nocoBaseRowToEdges(SERVICES, {
      name: 'expert_services',
      fkLinks: [{ field: 'expertId', target: 'experts', relation: 'expert_services.expert', style: 'plain-id' }],
    }, { id: 2, expertId: 1, name: '海外仓风险应对咨询' }, NOW)
    expect(edges).toHaveLength(1)
    expect(String(edges[0]?.relation)).toBe('expert_services.expert')
    expect(edges[0]?.dstId).toBe('nocobase:experts:1')

    const orderEdges = nocoBaseRowToEdges(ORDERS, {
      name: 'orders',
      fkLinks: [{ field: 'serviceId', target: 'expert_services', relation: 'ordered_service', style: 'collection-address' }],
    }, { id: 9, serviceId: 'expert_services/2' }, NOW)
    expect(orderEdges[0]?.dstId).toBe('nocobase:expert_services:2')
    // An address naming a different collection never links.
    const crossTarget = nocoBaseRowToEdges(ORDERS, {
      name: 'orders',
      fkLinks: [{ field: 'serviceId', target: 'expert_services', relation: 'ordered_service', style: 'collection-address' }],
    }, { id: 10, serviceId: 'experts/1' }, NOW)
    expect(crossTarget).toHaveLength(0)
  })
})

describe('data-asset sources', () => {
  it('maps a lakehouse table and a connector dataset onto Dataset nodes', () => {
    const table: LakehouseTable = {
      tenantId: 't', tableName: 'customs_export',
      columns: [{ name: 'region', sqlType: 'TEXT' }, { name: 'amount_t', sqlType: 'DOUBLE' }],
      format: 'parquet', location: 't/customs_export.parquet', rowCount: 3,
      createdAt: NOW, updatedAt: NOW,
    }
    const node = lakehouseTableToNode(table, NOW)
    expect(node.id).toBe('lakehouse:customs_export')
    expect(String(node.type)).toBe('Dataset')
    expect((node.props as { columns: unknown[] }).columns).toHaveLength(2)

    const summary: ConnectorDatasetSummary = {
      id: 'experts/1', title: '张红喜专家档案', kind: 'expert-profile',
      manifest: { provider: 'connector-nocobase' } as never,
    }
    const datasetNode = connectorDatasetToNode(summary, NOW)
    expect(datasetNode.id).toBe('connector:experts/1')
    expect(datasetNode.name).toBe('张红喜专家档案')
    expect(nocoBaseNodeId('experts', '1')).toBe('nocobase:experts:1')
  })
})
