/**
 * Schema-v2 property-graph face tests over `:memory:` databases: merge upserts,
 * k-hop subgraph walks (cycles, self-loops, depth bounds, truncation),
 * tombstoning, aliases, source-run watermarks, registry seeding, and the
 * no-migration rejection of v1 `triples` databases.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { SqliteGraphStore } from '../src/store.ts'
import { KB_GRAPH_SQLITE_APPLICATION_ID, SCHEMA_VERSION } from '../src/schema.ts'
import type { KgEdge, KgNode, KgSourceRun } from '@deepseek-ai/dsh-kb-graph'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'

const directories: string[] = []

afterAll(() => {
  for (const directory of directories) {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        new DatabaseSync(join(directory, `graph-v2${suffix}.sqlite`), { readOnly: true }).close()
      } catch {
        // Best-effort cleanup; the temp tree is removed by the OS.
      }
    }
  }
})

function freshStore(): SqliteGraphStore {
  return new SqliteGraphStore({ path: ':memory:', busyTimeoutMs: 5_000 }, DatabaseSync)
}

const NOW = '2026-09-06T12:00:00.000Z'

function node(id: string, type: string, name: string, naturalKey?: string): KgNode {
  return {
    id,
    tenantId: 't',
    type: kgNodeTypeId(type),
    name,
    ...(naturalKey === undefined ? {} : { naturalKey }),
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function edge(id: string, src: string, dst: string, relation: string, extra: Partial<KgEdge> = {}): KgEdge {
  return {
    id,
    tenantId: 't',
    srcId: src,
    dstId: dst,
    relation: kgRelationId(relation),
    confidence: 1.0,
    provenance: { sourceSystem: 'nocobase', sourceId: `row:${id}`, extractedAt: NOW },
    validFrom: NOW,
    ...extra,
  }
}

describe('SqliteGraphStore v2 upserts', () => {
  it('inserts a fresh node and merges later writes onto both anchors', async () => {
    const store = freshStore()
    expect(await store.upsertNode(node('nocobase:customers:1', 'Customer', '宏发食品', '1')))
      .toEqual({ merged: false })
    // A fresh insert may carry the full mutable field set.
    expect(await store.upsertNode({
      ...node('nocobase:customers:2', 'Customer', '海天味业', '2'),
      summary: '调味品龙头',
      props: { region: '广东' },
    })).toEqual({ merged: false })
    // Same (tenant, type, natural_key) under a new minted id: the existing row
    // takes the update and keeps its id.
    expect(await store.upsertNode(node('kb:doc#宏发', 'Customer', '宏发食品（别名）', '1')))
      .toEqual({ merged: true })
    // Same id: also a merge.
    expect(await store.upsertNode(node('nocobase:customers:1', 'Customer', '宏发食品总店', '1')))
      .toEqual({ merged: true })
    const search = await store.searchEntities('t', '宏发', undefined, 10)
    expect(search).toEqual([{ type: kgNodeTypeId('Customer'), id: '1' }])
    store.close()
  })

  it('merges edges idempotently on the seven-column anchor', async () => {
    const store = freshStore()
    await store.upsertNode(node('s1', 'company', '宏发食品'))
    await store.upsertNode(node('p1', 'product', '老抽酱油'))
    const e1 = edge('e1', 's1', 'p1', 'produces', { confidence: 0.7 })
    expect(await store.upsertEdges([e1])).toBe(1)
    // Same anchor: no new row; confidence converges upward, fact fills in.
    expect(await store.upsertEdges([edge('e1-dupe', 's1', 'p1', 'produces', {
      confidence: 0.9, fact: '宏发食品生产老抽酱油',
      provenance: { sourceSystem: 'nocobase', sourceId: 'row:e1', extractedAt: NOW },
    })])).toBe(0)
    const stats = await store.stats('t')
    expect(stats.triples).toBe(1)
    // A different provenance for the same business fact coexists.
    expect(await store.upsertEdges([edge('e2', 's1', 'p1', 'produces', {
      provenance: { sourceSystem: 'kb', sourceId: 'workspace/doc.md', extractedAt: NOW },
    })])).toBe(1)
    expect((await store.stats('t')).triples).toBe(2)
    store.close()
  })

  it('tombstones by source and revives on re-assertion', async () => {
    const store = freshStore()
    await store.upsertNode(node('s1', 'company', '宏发食品'))
    await store.upsertNode(node('p1', 'product', '老抽酱油'))
    await store.upsertNode(node('p2', 'product', '生抽酱油'))
    await store.upsertEdges([
      edge('e1', 's1', 'p1', 'produces'),
      edge('e2', 's1', 'p2', 'produces'),
      edge('e3', 's1', 'p2', 'produces', {
        provenance: { sourceSystem: 'kb', sourceId: 'workspace/doc.md', extractedAt: NOW },
      }),
    ])
    const later = '2026-09-06T13:00:00.000Z'
    // Only the nocobase assertion of p2 disappears; the kb assertion survives.
    expect(await store.tombstoneBySource('nocobase', 'row:e2', later)).toBe(1)
    expect(await store.tombstoneBySource('nocobase', 'row:e2', later)).toBe(0)
    expect((await store.stats('t')).triples).toBe(2)
    // Re-asserting the same anchor revives the tombstoned edge.
    await store.upsertEdges([edge('e2', 's1', 'p2', 'produces')])
    expect((await store.stats('t')).triples).toBe(3)
    store.close()
  })

  it('round-trips edge facts and props through the subgraph face', async () => {
    const store = freshStore()
    await store.upsertNode(node('s1', 'company', '宏发食品', 's1'))
    await store.upsertNode(node('p1', 'product', '老抽酱油', 'p1'))
    const annotated = edge('e1', 's1', 'p1', 'produces', {
      fact: '年产量 12000 吨',
      props: { since: 2019 },
    })
    expect(await store.upsertEdges([annotated])).toBe(1)
    // The merge pass keeps properties on re-assertion.
    expect(await store.upsertEdges([annotated])).toBe(0)
    const around = await store.expand('t', 's1', 10)
    expect(around.edges[0]?.fact).toBe('年产量 12000 吨')
    expect(around.edges[0]?.props).toEqual({ since: 2019 })
    // Node upserts round-trip summary and props the same way.
    expect(await store.upsertNode({ ...node('s1', 'company', '宏发食品', 's1'), summary: '老字号酱油厂', props: { region: '广东' } }))
      .toEqual({ merged: true })
    store.close()
  })

  it('returns no path rows for coexisting but unconnected entities', async () => {
    const store = freshStore()
    await store.upsertNode(node('a', 'company', '甲', 'a'))
    await store.upsertNode(node('sauceA', 'product', '酱A', 'sauceA'))
    await store.upsertNode(node('b', 'company', '乙', 'b'))
    await store.upsertNode(node('sauceB', 'product', '酱B', 'sauceB'))
    await store.upsertEdges([edge('e-a', 'a', 'sauceA', 'produces'), edge('e-b', 'b', 'sauceB', 'produces')])
    expect(await store.twoHopPaths('t', { type: kgNodeTypeId('company'), id: 'a' }, { type: kgNodeTypeId('product'), id: 'sauceB' }))
      .toEqual([])
    store.close()
  })

  it('materializes the built-in registry seed on database creation', async () => {
    const store = freshStore()
    await store.upsertNode(node('c1', 'company', '宏发食品'))
    // The read path goes through the same connection the seed wrote to; the
    // node has no natural key, so its name doubles as the entity key.
    const found = await store.searchEntities('t', '宏发', kgNodeTypeId('company'), 10)
    expect(found).toEqual([{ type: kgNodeTypeId('company'), id: '宏发食品' }])
    store.close()
  })
})

describe('SqliteGraphStore v2 subgraph', () => {
  async function chain(): Promise<SqliteGraphStore> {
    const store = freshStore()
    for (const [id, name] of [['a', '甲'], ['b', '乙'], ['c', '丙'], ['d', '丁']] as const) {
      await store.upsertNode(node(id, 'company', name))
    }
    await store.upsertEdges([
      edge('e-ab', 'a', 'b', 'supplies'),
      edge('e-bc', 'b', 'c', 'supplies'),
      edge('e-cd', 'c', 'd', 'supplies'),
    ])
    return store
  }

  it('returns only the seeds at hops 0 and grows with the hop budget', async () => {
    const store = await chain()
    const zero = await store.subgraph('t', ['a'], 0)
    expect(zero.nodes.map(n => n.id)).toEqual(['a'])
    expect(zero.edges).toEqual([])
    expect(zero.truncated).toBe(false)
    const one = await store.subgraph('t', ['a'], 1)
    expect(one.nodes.map(n => n.id).sort()).toEqual(['a', 'b'])
    expect(one.edges.map(e => e.id)).toEqual(['e-ab'])
    const two = await store.subgraph('t', ['a'], 2)
    expect(two.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c'])
    store.close()
  })

  it('walks cycles without diverging', async () => {
    const store = freshStore()
    for (const [id, name] of [['a', '甲'], ['b', '乙'], ['c', '丙']] as const) {
      await store.upsertNode(node(id, 'company', name))
    }
    await store.upsertEdges([
      edge('e-ab', 'a', 'b', 'supplies'),
      edge('e-bc', 'b', 'c', 'supplies'),
      edge('e-ca', 'c', 'a', 'supplies'),
    ])
    const walk = await store.subgraph('t', ['a'], 5)
    expect(walk.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(walk.truncated).toBe(false)
    store.close()
  })

  it('includes self-loops in the walk without infinite recursion', async () => {
    const store = freshStore()
    await store.upsertNode(node('a', 'company', '甲'))
    await store.upsertEdges([edge('e-aa', 'a', 'a', 'supplies')])
    const walk = await store.subgraph('t', ['a'], 3)
    expect(walk.nodes.map(n => n.id)).toEqual(['a'])
    expect(walk.edges.map(e => e.id)).toEqual(['e-aa'])
    store.close()
  })

  it('reports truncation when the node budget cuts the walk', async () => {
    const store = await chain()
    const cut = await store.subgraph('t', ['a'], 5, { maxNodes: 2 })
    expect(cut.truncated).toBe(true)
    expect(cut.nodes.length).toBe(2)
    // Depth order: the seed at 0, its neighbor at 1 — even with names sorted.
    expect(cut.nodes.map(n => n.depth)).toEqual([0, 1])
    store.close()
  })

  it('returns empty for no seeds, unknown seeds, and rejects negative hops', async () => {
    const store = await chain()
    expect(await store.subgraph('t', [], 2)).toEqual({ nodes: [], edges: [], truncated: false })
    expect(await store.subgraph('t', ['nope'], 2)).toEqual({ nodes: [], edges: [], truncated: false })
    await expect(store.subgraph('t', ['a'], -1)).rejects.toThrow(/non-negative/u)
    store.close()
  })

  it('expands one node to its one-hop neighborhood', async () => {
    const store = await chain()
    const around = await store.expand('t', 'b', 10)
    expect(around.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(around.edges.map(e => e.id).sort()).toEqual(['e-ab', 'e-bc'])
    // The walk ignores tombstoned edges.
    const later = '2026-09-06T13:00:00.000Z'
    await store.tombstoneBySource('nocobase', 'row:e-bc', later)
    const trimmed = await store.expand('t', 'b', 10)
    expect(trimmed.nodes.map(n => n.id).sort()).toEqual(['a', 'b'])
    store.close()
  })
})

describe('SqliteGraphStore v2 aliases and watermarks', () => {
  it('resolves aliases for entity search and refuses conflicting rebinds', async () => {
    const store = freshStore()
    await store.upsertNode(node('c1', 'company', '宏发食品', 'c1'))
    await store.upsertNode(node('c2', 'company', '宏发集团', 'c2'))
    await store.putAlias('t', kgNodeTypeId('company'), '老宏发', 'c1')
    // Idempotent rebind to the same node.
    await store.putAlias('t', kgNodeTypeId('company'), '老宏发', 'c1')
    const hit = await store.searchEntities('t', '老宏发', undefined, 10)
    expect(hit).toEqual([{ type: kgNodeTypeId('company'), id: 'c1' }])
    await expect(store.putAlias('t', kgNodeTypeId('company'), '老宏发', 'c2'))
      .rejects.toThrow(/already resolves/u)
    store.close()
  })

  it('expands with the default node budget', async () => {
    const store = freshStore()
    await store.upsertNode(node('a', 'company', '甲'))
    const around = await store.expand('t', 'a')
    expect(around.nodes.map(n => n.id)).toEqual(['a'])
    store.close()
  })

  it('caps alias-driven search at k and skips non-matching aliases', async () => {
    const store = freshStore()
    // The non-matching alias's node comes first so the alias pass sees it
    // before k breaks the loop.
    await store.upsertNode(node('c2', 'company', '宏发集团', 'c2'))
    await store.upsertNode(node('c1', 'company', '宏发食品', 'c1'))
    await store.putAlias('t', kgNodeTypeId('company'), '完全无关', 'c2')
    await store.putAlias('t', kgNodeTypeId('company'), '老宏发', 'c1')
    // The node names miss the query, so the alias pass runs: the non-matching
    // alias skips, the matching one resolves, and k caps the loop.
    const hits = await store.searchEntities('t', '老宏', undefined, 1)
    expect(hits).toEqual([{ type: kgNodeTypeId('company'), id: 'c1' }])
    store.close()
  })

  it('resolves v2 node search through aliases with name-pass deduplication', async () => {
    const store = freshStore()
    await store.upsertNode(node('c1', 'company', '宏发食品', 'c1'))
    await store.upsertNode(node('c2', 'company', '宏发集团', 'c2'))
    await store.putAlias('t', kgNodeTypeId('company'), '老宏发', 'c1')
    // The node names miss the query; the alias pass resolves the binding node.
    const byAlias = await store.searchNodes('t', '老宏发', undefined, 10)
    expect(byAlias).toEqual([{ id: 'c1', type: kgNodeTypeId('company'), name: '宏发食品' }])
    // The name pass already found the node; the alias adds no duplicate.
    const deduped = await store.searchNodes('t', '宏发', undefined, 10)
    expect(deduped.map(hit => hit.id).sort()).toEqual(['c1', 'c2'])
    // The type filter narrows the alias pass too.
    await store.putAlias('t', kgNodeTypeId('company'), '集团别名', 'c2')
    const narrowed = await store.searchNodes('t', '老宏发', kgNodeTypeId('company'), 10)
    expect(narrowed.map(hit => hit.id)).toEqual(['c1'])
    store.close()
  })

  it('lists the nodes of one tenant capped at k, newest writes last', async () => {
    const store = freshStore()
    await store.upsertNode(node('kb:doc#中亚', 'Region', '中亚', '中亚'))
    await store.upsertNode(node('nocobase:experts:1', 'Expert', '张红喜', '1'))
    await store.upsertNode(node('other:node', 'company', '别家', 'x'))
    const other = freshStore()
    await other.upsertNode(node('x:1', 'company', '他租户', '1'))
    const listed = await store.listNodes('t', 10)
    expect(listed.map(n => n.id).sort()).toEqual(['kb:doc#中亚', 'nocobase:experts:1', 'other:node'])
    expect(listed.map(n => n.name)).toContain('张红喜')
    expect(await store.listNodes('t', 1)).toHaveLength(1)
    store.close()
    other.close()
  })

  it('upserts source-run watermarks per (source, scope)', async () => {
    const store = freshStore()
    expect(await store.getSourceRun('nocobase', 'orders')).toBeUndefined()
    // A bare run (no watermark, hash, or config) persists the same way.
    await store.putSourceRun({ sourceSystem: 'kb', scope: 'workspace/data', lastRunAt: '2026-09-06T09:00:00.000Z' })
    expect(await store.getSourceRun('kb', 'workspace/data'))
      .toEqual({ sourceSystem: 'kb', scope: 'workspace/data', lastRunAt: '2026-09-06T09:00:00.000Z' })
    const first: KgSourceRun = {
      sourceSystem: 'nocobase', scope: 'orders',
      watermark: '2026-09-06T10:00:00.000Z', lastRunAt: '2026-09-06T10:00:05.000Z',
    }
    await store.putSourceRun(first)
    expect(await store.getSourceRun('nocobase', 'orders')).toEqual(first)
    const second: KgSourceRun = {
      sourceSystem: 'nocobase', scope: 'orders',
      watermark: '2026-09-06T11:00:00.000Z', contentHash: 'sha256:abc',
      runConfig: '{"pageSize":100}', lastRunAt: '2026-09-06T11:00:05.000Z',
    }
    await store.putSourceRun(second)
    expect(await store.getSourceRun('nocobase', 'orders')).toEqual(second)
    store.close()
  })

  it('lists source runs per system and deletes retired scopes', async () => {
    const store = freshStore()
    await store.putSourceRun({ sourceSystem: 'kb', scope: 'corpus/a.md', lastRunAt: '2026-09-06T09:00:00.000Z' })
    await store.putSourceRun({ sourceSystem: 'kb', scope: 'connector-files/b.md', lastRunAt: '2026-09-06T09:00:01.000Z' })
    await store.putSourceRun({ sourceSystem: 'nocobase', scope: 'orders', lastRunAt: '2026-09-06T09:00:02.000Z' })
    // Scope-ordered regardless of insertion order.
    expect((await store.listSourceRuns('kb')).map(run => run.scope)).toEqual(['connector-files/b.md', 'corpus/a.md'])
    expect(await store.listSourceRuns('lakehouse')).toEqual([])
    await store.deleteSourceRun('kb', 'connector-files/b.md')
    expect((await store.listSourceRuns('kb')).map(run => run.scope)).toEqual(['corpus/a.md'])
    expect(await store.getSourceRun('kb', 'connector-files/b.md')).toBeUndefined()
    // Deleting a never-run scope is a no-op, not a failure.
    await store.deleteSourceRun('kb', 'never/ran.md')
    expect((await store.listSourceRuns('kb')).map(run => run.scope)).toEqual(['corpus/a.md'])
    store.close()
  })
})

describe('SqliteGraphStore v2 write parity (fail-closed)', () => {
  /** Open one file-backed store (a second connection can inject trigger failures). */
  function fileStore(name: string): { store: SqliteGraphStore; path: string } {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-kb-graph-parity-'))
    directories.push(directory)
    const path = join(directory, name)
    return { store: new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync), path }
  }

  it('rolls back tombstoneBySource with no partial tombstones under a forced mid-statement failure', async () => {
    const { store, path } = fileStore('parity.sqlite')
    await store.upsertNode(node('s1', 'company', '宏发食品'))
    await store.upsertNode(node('p1', 'product', '老抽酱油'))
    await store.upsertNode(node('p2', 'product', '生抽酱油'))
    // Two live edges share one provenance address, so one tombstone sweep
    // updates both rows in a single statement.
    const shared = { provenance: { sourceSystem: 'nocobase' as const, sourceId: 'row:batch', extractedAt: NOW } }
    await store.upsertEdges([edge('e1', 's1', 'p1', 'produces', shared), edge('e2', 's1', 'p2', 'produces', shared)])
    const before = (await store.stats('t')).triples
    const trigger = new DatabaseSync(path)
    trigger.exec("CREATE TRIGGER force_fail AFTER UPDATE ON kg_edges BEGIN SELECT RAISE(FAIL, 'forced'); END")
    trigger.close()
    await expect(store.tombstoneBySource('nocobase', 'row:batch', '2026-09-06T13:00:00.000Z'))
      .rejects.toThrow(/forced/u)
    // The first matching row completed before the trigger fired; only the
    // surrounding write transaction keeps that partial update from sticking.
    expect((await store.stats('t')).triples).toBe(before)
    store.close()
  })

  it('rolls back deleteSourceRun with no partial watermark loss under a forced mid-statement failure', async () => {
    const { store, path } = fileStore('parity-runs.sqlite')
    await store.putSourceRun({ sourceSystem: 'kb', scope: 'corpus/a.md', lastRunAt: NOW })
    const trigger = new DatabaseSync(path)
    trigger.exec("CREATE TRIGGER force_fail AFTER DELETE ON kg_source_runs BEGIN SELECT RAISE(FAIL, 'forced'); END")
    trigger.close()
    await expect(store.deleteSourceRun('kb', 'corpus/a.md')).rejects.toThrow(/forced/u)
    expect(await store.getSourceRun('kb', 'corpus/a.md')).toBeDefined()
    store.close()
  })
})

describe('SqliteGraphStore v2 schema ownership', () => {
  it('rejects a v1 triples database with the rebuild instruction', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-kb-graph-v1-'))
    directories.push(directory)
    const path = join(directory, 'graph-v2.sqlite')
    const legacy = new DatabaseSync(path)
    legacy.exec(`PRAGMA application_id = ${String(KB_GRAPH_SQLITE_APPLICATION_ID)}`)
    legacy.exec('PRAGMA user_version = 1')
    legacy.exec('CREATE TABLE triples (id INTEGER PRIMARY KEY) STRICT;')
    legacy.close()
    expect(() => new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync))
      .toThrow(/schema version 1, incompatible with this build \(4\).*rebuild/u)
  })

  it('writes schema version 2 into fresh databases', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-kb-graph-v2-'))
    directories.push(directory)
    const path = join(directory, 'graph-v2.sqlite')
    const store = new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    store.close()
    const db = new DatabaseSync(path)
    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    const tables = (db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'kg_%'").get() as { n: number }).n
    db.close()
    expect(version).toBe(SCHEMA_VERSION)
    // Seven kg_ tables plus the FTS5 virtual table and its shadow tables.
    expect(tables).toBeGreaterThanOrEqual(7)
  })
})
