/**
 * The close-out batch: registry read arms (the synonyms parse-and-validate
 * chain and inverse relations), the revision ledger's row mapping,
 * alias-filtered node search, subgraph natural-key nulls, the xref
 * justification channel, and metadata-less episode rows.
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteGraphStore } from '../src/store.ts'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'

const TENANT = 'demo-food-co'
const NOW = '2026-09-17T00:00:00.000Z'

function memoryStore(): SqliteGraphStore {
  return new SqliteGraphStore({ path: ':memory:', busyTimeoutMs: 5_000 }, DatabaseSync)
}

async function seedNode(store: SqliteGraphStore, id: string, name: string, naturalKey?: string): Promise<void> {
  await store.upsertNode({
    id, tenantId: TENANT, type: kgNodeTypeId('product'),
    ...(naturalKey === undefined ? {} : { naturalKey }), name, createdAt: NOW, updatedAt: NOW,
  })
}

describe('registry close-out arms', () => {
  it('round-trips synonyms and inverse relations through the registry tables', async () => {
    const store = memoryStore()
    await store.upsertNodeType({
      id: kgNodeTypeId('dish-a'), label: '菜品甲', layer: 'domain', props: [],
      source: 'builtin-ontology', status: 'active', synonyms: ['豆腐菜'],
    })
    await store.upsertNodeType({
      id: kgNodeTypeId('dish-b'), label: '菜品乙', layer: 'domain', props: [],
      source: 'builtin-ontology', status: 'active',
    })
    // The registry tables foreign-key the declared inverse, so it persists
    // first (mirroring the service-level ordering).
    await store.upsertRelation({
      id: kgRelationId('r-adjacent-of'), label: '相邻于',
      constraints: [{ domain: kgNodeTypeId('dish-b'), range: kgNodeTypeId('dish-a') }],
      kind: 'object', source: 'builtin-ontology',
    })
    await store.upsertRelation({
      id: kgRelationId('r-adjacent'), label: '相邻',
      constraints: [{ domain: kgNodeTypeId('dish-a'), range: kgNodeTypeId('dish-b') }],
      kind: 'object', inverseOf: kgRelationId('r-adjacent-of'), foodonPropUri: 'http://purl.obolibrary.org/obo/RO_0002331', source: 'builtin-ontology',
    })
    const types = await store.listStoredNodeTypes()
    expect(types.find(type => String(type.id) === 'dish-a')?.synonyms).toEqual(['豆腐菜'])
    const relations = await store.listStoredRelations()
    const adjacent = relations.find(relation => String(relation.id) === 'r-adjacent')
    expect(adjacent?.inverseOf).toBe(kgRelationId('r-adjacent-of'))
    expect(adjacent?.foodonPropUri).toBe('http://purl.obolibrary.org/obo/RO_0002331')
    store.close()
  })

  it('rejects unreadable and mistyped synonyms rows as registry corruption', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kg-graph-sqlite-close-'))
    try {
      const path = join(dir, 'kg.sqlite')
      const store = new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
      await store.upsertNodeType({
        id: kgNodeTypeId('dish-c'), label: '菜品丙', layer: 'domain', props: [],
        source: 'builtin-ontology', status: 'active', synonyms: ['腐乳'],
      })
      const raw = new DatabaseSync(path, { timeout: 5_000 })
      raw.exec("UPDATE kg_node_types SET synonyms_json = 'oops' WHERE type_id = 'dish-c'")
      await expect(store.listStoredNodeTypes()).rejects.toThrow('unreadable synonyms')
      raw.exec("UPDATE kg_node_types SET synonyms_json = '[1]' WHERE type_id = 'dish-c'")
      await expect(store.listStoredNodeTypes()).rejects.toThrow('not a string array')
      raw.close()
      store.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('maps revision rows through the ontology revision ledger', async () => {
    const store = memoryStore()
    const revisionId = await store.recordOntologyRevision({
      ontologyVersion: '1',
      summary: 'foodon import persisted 2 new class(es)',
      changes: { added: { types: ['a', 'b'], relations: [] }, removed: { types: [], relations: [] }, changed: { types: [], relations: [] } },
      createdAt: NOW,
    })
    const rows = await store.ontologyRevisions(5)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(revisionId)
    expect(rows[0]?.summary).toBe('foodon import persisted 2 new class(es)')
    store.close()
  })

  it('skips non-matching alias rows and dedupes aliases onto one node', async () => {
    const store = memoryStore()
    await seedNode(store, 'n:tofu', '豆腐')
    await seedNode(store, 'n:nori', '紫菜')
    await store.putAlias(TENANT, kgNodeTypeId('product'), '豆干', 'n:tofu')
    await store.putAlias(TENANT, kgNodeTypeId('product'), '海苔', 'n:nori')
    await store.putAlias(TENANT, kgNodeTypeId('product'), '海苔丝', 'n:nori')
    const hits = await store.searchNodes(TENANT, '海苔', undefined, 5)
    expect(hits.map(hit => hit.name)).toEqual(['紫菜'])
    const byFirstAlias = await store.searchNodes(TENANT, '豆干', undefined, 5)
    expect(byFirstAlias.map(hit => hit.name)).toEqual(['豆腐'])
    const capped = await store.searchNodes(TENANT, '海苔', undefined, 1)
    expect(capped.map(hit => hit.name)).toEqual(['紫菜'])
    store.close()
  })

  it('maps subgraph and snapshot nodes with and without natural keys', async () => {
    const store = memoryStore()
    await seedNode(store, 'n:keyed', '有键节点', '有键节点')
    await seedNode(store, 'n:bare', '裸名节点')
    await store.upsertEdges([
      { id: 'e:keyed-bare', tenantId: TENANT, srcId: 'n:keyed', dstId: 'n:bare', relation: kgRelationId('related'), confidence: 1, provenance: { sourceSystem: 'kb', sourceId: 's', extractedAt: NOW }, validFrom: NOW },
    ])
    const walk = await store.subgraph(TENANT, ['n:keyed'], 1)
    const keyed = walk.nodes.find(node => node.id === 'n:keyed')
    const bare = walk.nodes.find(node => node.id === 'n:bare')
    expect(keyed?.naturalKey).toBe('有键节点')
    expect(bare?.naturalKey).toBeUndefined()
    const snapshot = await store.snapshotAt(TENANT, NOW)
    expect(snapshot.nodes.find(node => node.id === 'n:keyed')?.naturalKey).toBe('有键节点')
    expect(snapshot.nodes.find(node => node.id === 'n:bare')?.naturalKey).toBeUndefined()
    store.close()
  })

  it('round-trips xref justification and metadata-less episodes', async () => {
    const store = memoryStore()
    await store.upsertNodeType({
      id: kgNodeTypeId('dish-d'), label: '菜品丁', layer: 'domain', props: [],
      source: 'builtin-ontology', status: 'active',
    })
    const inserted = await store.putOntologyXrefs([
      { subjectId: 'FOODON:1', predicateId: 'skos:exactMatch', objectId: 'dish-d', mappingJustification: 'manual curation' },
      { subjectId: 'FOODON:2', predicateId: 'skos:closeMatch', objectId: 'dish-d' },
    ])
    expect(inserted).toBe(2)
    const xrefs = await store.listOntologyXrefs(10)
    expect(xrefs.find(xref => xref.objectId === 'dish-d' && xref.subjectId === 'FOODON:1')?.mappingJustification).toBe('manual curation')
    expect(xrefs.find(xref => xref.subjectId === 'FOODON:2')?.mappingJustification).toBeUndefined()
    await seedNode(store, 'n:dish-d', '菜品丁')
    await seedNode(store, 'n:dish-e', '菜品戊')
    await store.upsertEdges([
      { id: 'e:bare', tenantId: TENANT, srcId: 'n:dish-d', dstId: 'n:dish-e', relation: kgRelationId('related'), confidence: 1, provenance: { sourceSystem: 'kb', sourceId: 's', extractedAt: NOW }, validFrom: NOW },
    ])
    await store.putEpisode({
      uuid: 'ingest:bare', tenantId: TENANT, source: 'ingest',
      name: '无元数据片段', content: '一次没有任何 metadata 的写入', validAt: NOW, createdAt: NOW,
    })
    await store.linkMentions('ingest:bare', ['e:bare'])
    const episodes = await store.listEpisodes(TENANT, 10)
    expect(episodes[0]?.name).toBe('无元数据片段')
    const bareMentions = await store.edgeMentions('e:bare')
    const bare = bareMentions[0]
    expect(bare?.episode?.metadata).toBeUndefined()
    store.close()
  })
})
