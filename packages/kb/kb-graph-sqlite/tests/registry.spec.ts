/**
 * Two-layer registry persistence tests: derived node types and relations
 * upsert into the registry tables, read back losslessly (durable-boundary
 * parse, corruption refuses loud), and re-register into a fresh runtime on
 * plugin load.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'
import type { KgNodeType, KgRelation } from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '../src/index.ts'
import { SqliteGraphStore } from '../src/store.ts'

const directories: string[] = []

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

function freshStore(): SqliteGraphStore {
  return new SqliteGraphStore({ path: ':memory:', busyTimeoutMs: 5_000 }, DatabaseSync)
}

const NOW2 = '2026-09-06T12:00:00.000Z'

const DERIVED_TYPE: KgNodeType = {
  id: kgNodeTypeId('experts'),
  label: '专家',
  description: 'nocobase experts collection rows',
  layer: 'domain',
  extends: kgNodeTypeId('Expert'),
  props: [{ key: 'org', datatype: 'string' }, { key: 'bio', datatype: 'string' }],
  naturalKey: 'id',
  source: 'nocobase-derived',
  status: 'draft',
}

const DERIVED_RELATION: KgRelation = {
  id: kgRelationId('expert_services.expert'),
  label: '所属专家',
  constraints: [{ domain: kgNodeTypeId('expert_services'), range: kgNodeTypeId('experts') }],
  kind: 'object',
  source: 'nocobase-derived',
}

describe('registry persistence', () => {
  it('upserts and reads back derived types and relations losslessly', async () => {
    const store = freshStore()
    // The built-in seed is materialized at database creation.
    const seeded = await store.listStoredNodeTypes()
    expect(seeded.map(type => String(type.id))).toContain('Object')
    expect(seeded.map(type => String(type.id))).toContain('Expert')
    expect((await store.listStoredRelations()).map(relation => String(relation.id))).toContain('offers')

    await store.upsertNodeType({
      id: kgNodeTypeId('expert_services'), label: '专家服务', layer: 'domain',
      extends: kgNodeTypeId('ExpertService'), props: [], naturalKey: 'id',
      source: 'nocobase-derived', status: 'draft',
    })
    await store.upsertNodeType(DERIVED_TYPE)
    await store.upsertRelation(DERIVED_RELATION)

    const types = await store.listStoredNodeTypes()
    const experts = types.find(type => String(type.id) === 'experts')
    expect(experts).toEqual(DERIVED_TYPE)
    const relations = await store.listStoredRelations()
    expect(relations.find(relation => String(relation.id) === 'expert_services.expert')).toEqual(DERIVED_RELATION)

    // Re-upsert refreshes mutable fields and keeps one row.
    await store.upsertNodeType({ ...DERIVED_TYPE, label: '专家（登记）', status: 'active' })
    const refreshed = (await store.listStoredNodeTypes()).filter(type => String(type.id) === 'experts')
    expect(refreshed).toHaveLength(1)
    expect(refreshed[0]?.label).toBe('专家（登记）')
    expect(refreshed[0]?.status).toBe('active')
    store.close()
  })

  it('persists a constraint-free hierarchical relation and reads it back', async () => {
    const store = freshStore()
    await store.upsertRelation({
      id: kgRelationId('friend_of'),
      label: '伙伴',
      constraints: [],
      kind: 'hierarchical',
      source: 'agent-defined',
    })
    const relations = await store.listStoredRelations()
    expect(relations.find(relation => String(relation.id) === 'friend_of')).toMatchObject({ constraints: [], kind: 'hierarchical' })
    // Searching nodes without a natural key and with a closed store covers
    // the remaining branches.
    await store.upsertNode({
      id: 'kb:x#匿名', tenantId: 't', type: kgNodeTypeId('company'), name: '匿名实体',
      createdAt: NOW2, updatedAt: NOW2,
    })
    const hit = await store.searchNodes('t', '匿名', undefined, 5)
    expect(hit[0]?.id).toBe('kb:x#匿名')
    store.close()
    await expect(store.searchNodes('t', 'x', undefined, 5)).rejects.toMatchObject({ code: 'KB_GRAPH_SQLITE_CLOSED' })
  })

  it('registers a self-inverse relation through the fixpoint', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kg-registry-selfinv-'))
    directories.push(directory)
    const path = join(directory, 'graph.sqlite')
    const seedCtx = new Context()
    await seedCtx.plugin(KbGraphRuntime)
    await seedCtx.plugin(KbGraphSqlite, { path })
    await seedCtx.kbGraph.persistRelation({
      id: kgRelationId('related'),
      label: '相关',
      constraints: [],
      kind: 'hierarchical',
      inverseOf: kgRelationId('related'),
      source: 'builtin-ontology',
    })
    await seedCtx.fiber.dispose()
    const ctx = new Context()
    await ctx.plugin(KbGraphRuntime)
    await ctx.plugin(KbGraphSqlite, { path })
    expect(ctx.kbGraph.relation(kgRelationId('related'))).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('refuses unreadable props and constraints payloads at the durable boundary', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kg-registry-payload-'))
    directories.push(directory)
    const path = join(directory, 'graph.sqlite')
    const store = new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    const raw = new DatabaseSync(path, { enableForeignKeyConstraints: false, timeout: 5_000 })
    raw.prepare(
      "INSERT INTO kg_node_types (type_id, label, layer, props_schema, source, status, created_at, updated_at) VALUES ('badprops', 'x', 'domain', 'not json', 'agent-defined', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).run()
    await expect(store.listStoredNodeTypes()).rejects.toMatchObject({ code: 'KB_GRAPH_SQLITE_REGISTRY_CORRUPT' })
    raw.prepare(
      "INSERT INTO kg_node_types (type_id, label, layer, props_schema, source, status, created_at, updated_at) VALUES ('arrayprops', 'x', 'domain', '{\"a\":1}', 'agent-defined', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).run()
    await expect(store.listStoredNodeTypes()).rejects.toMatchObject({ code: 'KB_GRAPH_SQLITE_REGISTRY_CORRUPT' })
    raw.prepare(
      "INSERT INTO kg_relations (relation_id, label, kind, constraints_json, source, created_at, updated_at) VALUES ('badcons', 'x', 'object', '[not json]', 'agent-defined', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).run()
    await expect(store.listStoredRelations()).rejects.toMatchObject({ code: 'KB_GRAPH_SQLITE_REGISTRY_CORRUPT' })
    raw.prepare(
      "INSERT INTO kg_relations (relation_id, label, kind, constraints_json, source, created_at, updated_at) VALUES ('arraycons', 'x', 'object', '{\"domain\":\"a\"}', 'agent-defined', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).run()
    await expect(store.listStoredRelations()).rejects.toMatchObject({ code: 'KB_GRAPH_SQLITE_REGISTRY_CORRUPT' })
    raw.close()
    store.close()
  })

  it('refuses stored relations whose endpoints never land', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kg-registry-rel-orphan-'))
    directories.push(directory)
    const path = join(directory, 'graph.sqlite')

    const seedCtx = new Context()
    await seedCtx.plugin(KbGraphRuntime)
    await seedCtx.plugin(KbGraphSqlite, { path })
    await seedCtx.fiber.dispose()

    const ctx = new Context()
    await ctx.plugin(KbGraphRuntime)
    const db = new DatabaseSync(path, { enableForeignKeyConstraints: false, timeout: 5_000 })
    db.prepare(
      "INSERT INTO kg_relations (relation_id, label, kind, domain_type, range_type, constraints_json, source, created_at, updated_at) VALUES ('ghostrel', '幽灵关系', 'object', 'ghostA', 'ghostB', '[{\"domain\":\"ghostA\",\"range\":\"ghostB\"}]', 'agent-defined', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).run()
    db.close()
    await expect(ctx.plugin(KbGraphSqlite, { path })).rejects.toMatchObject({ code: 'KB_GRAPH_SQLITE_REGISTRY_CORRUPT' })
    await ctx.fiber.dispose()
  })

  it('registers cross-referencing inverse relations through the fixpoint', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kg-registry-cross-'))
    directories.push(directory)
    const path = join(directory, 'graph.sqlite')

    const seedCtx = new Context()
    await seedCtx.plugin(KbGraphRuntime)
    await seedCtx.plugin(KbGraphSqlite, { path })
    const seedGraph = seedCtx.kbGraph
    const domainType: KgNodeType = {
      id: kgNodeTypeId('Customer'), label: '客户', layer: 'domain', extends: kgNodeTypeId('Object'),
      props: [], naturalKey: 'id', source: 'builtin-ontology', status: 'active',
    }
    const orderType: KgNodeType = {
      id: kgNodeTypeId('Order'), label: '订单', layer: 'domain', extends: kgNodeTypeId('Process'),
      props: [], naturalKey: 'id', source: 'builtin-ontology', status: 'active',
    }
    await seedGraph.persistNodeType(domainType)
    await seedGraph.persistNodeType(orderType)
    // Builtins already carry places/placed_by with the inverse pair; wipe and
    // re-persist a cross-referencing pair to force the fixpoint ordering.
    await seedGraph.persistRelation({
      id: kgRelationId('places'), label: '下单', kind: 'object',
      constraints: [{ domain: domainType.id, range: orderType.id }],
      inverseOf: kgRelationId('placed_by'), source: 'builtin-ontology',
    })
    await seedCtx.fiber.dispose()

    const ctx = new Context()
    await ctx.plugin(KbGraphRuntime)
    await ctx.plugin(KbGraphSqlite, { path })
    expect(ctx.kbGraph.relation(kgRelationId('placed_by'))).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('refuses corrupted registry rows loud at the durable boundary', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kg-registry-corrupt-'))
    directories.push(directory)
    const path = join(directory, 'graph.sqlite')
    const store = new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    const raw = new DatabaseSync(path, { enableForeignKeyConstraints: false, timeout: 5_000 })
    raw.prepare(
      "INSERT INTO kg_node_types (type_id, label, layer, props_schema, source, status, created_at, updated_at) VALUES ('bad', 'x', 'sideways', '[]', 'agent-defined', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).run()
    raw.close()
    await expect(store.listStoredNodeTypes()).rejects.toMatchObject({ code: 'KB_GRAPH_SQLITE_REGISTRY_CORRUPT' })
    store.close()
  })

  it('re-registers persisted derived rows into a fresh runtime at plugin load', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kg-registry-'))
    directories.push(directory)
    const path = join(directory, 'graph.sqlite')

    const seedCtx = new Context()
    await seedCtx.plugin(KbGraphRuntime)
    await seedCtx.plugin(KbGraphSqlite, { path })
    const seedGraph = seedCtx.kbGraph
    await seedGraph.persistNodeType({
      id: kgNodeTypeId('expert_services'), label: '专家服务', layer: 'domain',
      extends: kgNodeTypeId('ExpertService'), props: [], naturalKey: 'id',
      source: 'nocobase-derived', status: 'draft',
    })
    await seedGraph.persistNodeType(DERIVED_TYPE)
    await seedGraph.persistRelation(DERIVED_RELATION)
    await seedCtx.fiber.dispose()

    const ctx = new Context()
    await ctx.plugin(KbGraphRuntime)
    await ctx.plugin(KbGraphSqlite, { path })
    const reloaded = ctx.kbGraph.nodeType(kgNodeTypeId('experts'))
    expect(reloaded).toEqual(DERIVED_TYPE)
    expect(ctx.kbGraph.relation(kgRelationId('expert_services.expert'))).toEqual(DERIVED_RELATION)
    // Built-ins stay registered exactly once (the boot pass skips them).
    expect(ctx.kbGraph.listNodeTypes().filter(type => String(type.id) === 'Expert')).toHaveLength(1)
    // The reloaded runtime writes through the v2 face end to end.
    await ctx.kbGraph.upsertNode({
      id: 'nocobase:experts:1', tenantId: 't', type: kgNodeTypeId('experts'),
      name: '张红喜', naturalKey: '1', createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z',
    })
    const subgraph = await ctx.kbGraph.subgraph('t', ['nocobase:experts:1'], 1)
    expect(subgraph.nodes.map(node => node.name)).toContain('张红喜')
    await ctx.fiber.dispose()
  })

  it('refuses a stored node type whose parent row is missing', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kg-registry-orphan-'))
    directories.push(directory)
    const path = join(directory, 'graph.sqlite')

    const seedCtx = new Context()
    await seedCtx.plugin(KbGraphRuntime)
    await seedCtx.plugin(KbGraphSqlite, { path })
    await seedCtx.fiber.dispose()

    const ctx = new Context()
    await ctx.plugin(KbGraphRuntime)
    // An orphan extends_type row (no parent) fails the boot pass loud.
    const db = new DatabaseSync(path, { enableForeignKeyConstraints: false, timeout: 5_000 })
    db.prepare(
      "INSERT INTO kg_node_types (type_id, label, layer, extends_type, props_schema, source, status, created_at, updated_at) VALUES ('orphan', '孤儿', 'domain', 'ghost', '[]', 'agent-defined', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).run()
    db.close()
    await expect(ctx.plugin(KbGraphSqlite, { path })).rejects.toMatchObject({ code: 'KB_GRAPH_SQLITE_REGISTRY_CORRUPT' })
    await ctx.fiber.dispose()
  })
})
