/**
 * SqliteGraphStore tests over `:memory:` databases: idempotent writes,
 * neighbor expansion, two-hop paths, entity search, tenant isolation, and
 * schema ownership.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import { afterAll, describe, expect, it } from 'vitest'
import { SqliteGraphStore } from '../src/store.ts'
import * as Plugin from '../src/index.ts'
import { KB_GRAPH_SQLITE_APPLICATION_ID, SCHEMA_VERSION } from '../src/schema.ts'
import type { KbGraphTriple } from '@deepseek-ai/dsh-kb-graph'
import { kgNodeTypeId, kgRelationId } from '@deepseek-ai/dsh-kb-graph'

const directories: string[] = []

afterAll(() => {
  for (const directory of directories) {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        new DatabaseSync(join(directory, `graph${suffix}.sqlite`), { readOnly: true }).close()
      } catch {
        // Best-effort cleanup; the temp tree is removed by the OS.
      }
    }
  }
})

function freshStore(): SqliteGraphStore {
  return new SqliteGraphStore({ path: ':memory:', busyTimeoutMs: 5_000 }, DatabaseSync)
}

const hongfa: KbGraphTriple = {
  subject: { type: kgNodeTypeId('company'), id: '宏发食品' },
  predicate: kgRelationId('produces'),
  object: { type: kgNodeTypeId('product'), id: '老抽酱油' },
  sourcePath: 'workspace/data/profiles/hongfa-food.md',
}
const hongfaComplies: KbGraphTriple = {
  subject: { type: kgNodeTypeId('company'), id: '宏发食品' },
  predicate: kgRelationId('complies_with'),
  object: { type: kgNodeTypeId('standard'), id: 'GB 2760' },
}
const rivalComplies: KbGraphTriple = {
  subject: { type: kgNodeTypeId('company'), id: '竞争对手' },
  predicate: kgRelationId('complies_with'),
  object: { type: kgNodeTypeId('standard'), id: 'GB 2760' },
}
const soyUsesAdditive: KbGraphTriple = {
  subject: { type: kgNodeTypeId('product'), id: '老抽酱油' },
  predicate: kgRelationId('contains'),
  object: { type: kgNodeTypeId('additive'), id: '苯甲酸钠' },
}
const soyComplies: KbGraphTriple = {
  subject: { type: kgNodeTypeId('product'), id: '老抽酱油' },
  predicate: kgRelationId('complies_with'),
  object: { type: kgNodeTypeId('standard'), id: 'GB 2760' },
}

describe('SqliteGraphStore', () => {
  it('puts triples idempotently and reports only new inserts', async () => {
    const store = freshStore()
    expect(await store.putTriples('t', [hongfa, soyUsesAdditive])).toBe(2)
    expect(await store.putTriples('t', [hongfa])).toBe(0)
    store.close()
  })

  it('expands one-hop neighbors in both directions', async () => {
    const store = freshStore()
    await store.putTriples('t', [hongfa, soyUsesAdditive, soyComplies])
    const fromCompany = await store.neighbors('t', { type: kgNodeTypeId('company'), id: '宏发食品' })
    expect(fromCompany.map(triple => triple.predicate)).toEqual(['produces'])
    const fromSoy = await store.neighbors('t', { type: kgNodeTypeId('product'), id: '老抽酱油' })
    expect(fromSoy.map(triple => triple.predicate).sort()).toEqual(['complies_with', 'contains', 'produces'])
    store.close()
  })

  it('finds two-hop paths through a shared bridge entity', async () => {
    const store = freshStore()
    await store.putTriples('t', [hongfa, soyUsesAdditive, soyComplies])
    const paths = await store.twoHopPaths('t', { type: kgNodeTypeId('company'), id: '宏发食品' }, { type: kgNodeTypeId('additive'), id: '苯甲酸钠' })
    const predicates = paths.map(triple => triple.predicate).sort()
    expect(predicates).toEqual(['contains', 'produces'])
    store.close()
  })

  it('returns no path rows for unrelated entities', async () => {
    const store = freshStore()
    await store.putTriples('t', [hongfa])
    const paths = await store.twoHopPaths('t', { type: kgNodeTypeId('company'), id: '宏发食品' }, { type: kgNodeTypeId('standard'), id: 'GB 14881' })
    expect(paths).toEqual([])
    store.close()
  })

  it('finds a clean bridge regardless of each edge direction', async () => {
    // Forward bridge: 宏发食品 —produces→ 老抽酱油 —contains→ 苯甲酸钠.
    const forward = freshStore()
    await forward.putTriples('t', [hongfa, soyUsesAdditive])
    const forwardPaths = await forward.twoHopPaths('t', { type: kgNodeTypeId('company'), id: '宏发食品' }, { type: kgNodeTypeId('additive'), id: '苯甲酸钠' })
    expect(forwardPaths.map(triple => triple.predicate).sort()).toEqual(['contains', 'produces'])
    forward.close()
    // Reversed edges: 传统工艺 —follows→ 老抽酱油 and 苯甲酸钠 —flags→ 传统工艺.
    const processFollowsSoy: KbGraphTriple = {
      subject: { type: kgNodeTypeId('process'), id: '传统工艺' },
      predicate: kgRelationId('follows'),
      object: { type: kgNodeTypeId('product'), id: '老抽酱油' },
    }
    const additiveFlagsProcess: KbGraphTriple = {
      subject: { type: kgNodeTypeId('additive'), id: '苯甲酸钠' },
      predicate: kgRelationId('flags'),
      object: { type: kgNodeTypeId('process'), id: '传统工艺' },
    }
    const reversed = freshStore()
    await reversed.putTriples('t', [processFollowsSoy, additiveFlagsProcess])
    const reversedPaths = await reversed.twoHopPaths('t', { type: kgNodeTypeId('product'), id: '老抽酱油' }, { type: kgNodeTypeId('additive'), id: '苯甲酸钠' })
    expect(reversedPaths.map(triple => triple.predicate).sort()).toEqual(['flags', 'follows'])
    reversed.close()
  })

  it('keeps spur edges off the path and still returns the direct edge', async () => {
    const store = freshStore()
    const spur: KbGraphTriple = {
      subject: { type: kgNodeTypeId('company'), id: '宏发食品' },
      predicate: kgRelationId('uses'),
      object: { type: kgNodeTypeId('process'), id: '传统工艺' },
    }
    await store.putTriples('t', [hongfaComplies, spur])
    const paths = await store.twoHopPaths('t', { type: kgNodeTypeId('company'), id: '宏发食品' }, { type: kgNodeTypeId('standard'), id: 'GB 2760' })
    expect(paths.map(triple => triple.predicate)).toEqual(['complies_with'])
    store.close()
  })

  it('keeps fan-in edges without a shared bridge off the path', async () => {
    const store = freshStore()
    await store.putTriples('t', [hongfa, soyComplies, hongfaComplies, rivalComplies])
    const paths = await store.twoHopPaths('t', { type: kgNodeTypeId('company'), id: '宏发食品' }, { type: kgNodeTypeId('standard'), id: 'GB 2760' })
    expect(paths.map(triple => `${triple.subject.id}—${triple.predicate}→${triple.object.id}`).sort()).toEqual([
      '宏发食品—complies_with→GB 2760',
      '宏发食品—produces→老抽酱油',
      '老抽酱油—complies_with→GB 2760',
    ])
    store.close()
  })

  it('does not count a target self-loop as the second hop', async () => {
    const store = freshStore()
    const direct: KbGraphTriple = {
      subject: { type: kgNodeTypeId('company'), id: '宏发食品' },
      predicate: kgRelationId('supplies'),
      object: { type: kgNodeTypeId('company'), id: '竞争对手' },
    }
    const selfLoop: KbGraphTriple = {
      subject: { type: kgNodeTypeId('company'), id: '竞争对手' },
      predicate: kgRelationId('supplies'),
      object: { type: kgNodeTypeId('company'), id: '竞争对手' },
    }
    await store.putTriples('t', [direct, selfLoop])
    const paths = await store.twoHopPaths('t', { type: kgNodeTypeId('company'), id: '宏发食品' }, { type: kgNodeTypeId('company'), id: '竞争对手' })
    expect(paths.map(triple => triple.predicate)).toEqual(['supplies'])
    store.close()
  })

  it('returns the direct edge in either direction when no bridge exists', async () => {
    const store = freshStore()
    await store.putTriples('t', [hongfaComplies])
    const forward = await store.twoHopPaths('t', { type: kgNodeTypeId('company'), id: '宏发食品' }, { type: kgNodeTypeId('standard'), id: 'GB 2760' })
    expect(forward.map(triple => triple.predicate)).toEqual(['complies_with'])
    const backward = await store.twoHopPaths('t', { type: kgNodeTypeId('standard'), id: 'GB 2760' }, { type: kgNodeTypeId('company'), id: '宏发食品' })
    expect(backward.map(triple => triple.predicate)).toEqual(['complies_with'])
    store.close()
  })

  it('searches entities by substring with an optional type filter', async () => {
    const store = freshStore()
    await store.putTriples('t', [hongfa, soyUsesAdditive])
    const companies = await store.searchEntities('t', '宏发', kgNodeTypeId('company'), 10)
    expect(companies).toEqual([{ type: kgNodeTypeId('company'), id: '宏发食品' }])
    const wrongType = await store.searchEntities('t', '宏发', kgNodeTypeId('product'), 10)
    expect(wrongType).toEqual([])
    store.close()
  })

  it('isolates tenants on every query path', async () => {
    const store = freshStore()
    await store.putTriples('tenant-a', [hongfa])
    const foreign = await store.neighbors('tenant-b', { type: kgNodeTypeId('company'), id: '宏发食品' })
    expect(foreign).toEqual([])
    const search = await store.searchEntities('tenant-b', '宏发', undefined, 10)
    expect(search).toEqual([])
    const statsA = await store.stats('tenant-a')
    const statsB = await store.stats('tenant-b')
    expect(statsA.triples).toBe(1)
    expect(statsB.triples).toBe(0)
    store.close()
  })

  it('closes idempotently and refuses use after close', async () => {
    const store = freshStore()
    await store.putTriples('t', [hongfa])
    store.close()
    store.close()
    await expect(store.neighbors('t', { type: kgNodeTypeId('company'), id: '宏发食品' })).rejects.toThrow(/connection is closed/u)
    await expect(store.stats('t')).rejects.toThrow(/connection is closed/u)
  })

  it('rolls back the write transaction when one triple fails mid-batch', async () => {
    const store = freshStore()
    // The first triple inserts; the second violates TEXT NOT NULL inside the
    // open transaction, so the batch rolls back and the failure propagates.
    const broken = { ...hongfa, subject: { ...hongfa.subject, id: null } } as unknown as KbGraphTriple
    await expect(store.putTriples('t', [hongfa, broken])).rejects.toBeTruthy()
    const afterFailure = await store.stats('t')
    expect(afterFailure.triples).toBe(0)
    // The store stays usable after the rollback.
    expect(await store.putTriples('t', [hongfa])).toBe(1)
    store.close()
  })

  it('deduplicates repeated entities, caps at k, and searches without a type filter', async () => {
    const store = freshStore()
    await store.putTriples('t', [hongfa, soyUsesAdditive, soyComplies])
    // '老抽酱油' appears as object of produces and subject of contains/complies_with — one entity.
    const soy = await store.searchEntities('t', '酱油', undefined, 10)
    expect(soy).toEqual([{ type: kgNodeTypeId('product'), id: '老抽酱油' }])
    // k caps the result mid-scan.
    const capped = await store.searchEntities('t', '', undefined, 1)
    expect(capped.length).toBe(1)
    store.close()
  })

  it('counts across all tenants when stats gets no tenant', async () => {
    const store = freshStore()
    await store.putTriples('tenant-a', [hongfa])
    await store.putTriples('tenant-b', [soyUsesAdditive])
    const global = await store.stats(undefined)
    expect(global.triples).toBe(2)
    expect(global.entities).toBe(3)
    store.close()
  })

  it('rejects a foreign on-disk schema version', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-kb-graph-'))
    directories.push(directory)
    const path = join(directory, 'graph.sqlite')
    const seed = new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    seed.close()
    const db = new DatabaseSync(path)
    db.exec('PRAGMA user_version = 99')
    db.close()
    expect(() => new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync))
      .toThrow(/schema version 99.*incompatible/u)
  })

  it('rejects an unversioned database that carries an application identity', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-kb-graph-'))
    directories.push(directory)
    const path = join(directory, 'graph.sqlite')
    const seed = new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    seed.close()
    const db = new DatabaseSync(path)
    db.exec('PRAGMA user_version = 0')
    db.close()
    expect(() => new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync))
      .toThrow(/unversioned schema or application identity/u)
  })

  it('rejects a matching schema version under a foreign application id', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-kb-graph-'))
    directories.push(directory)
    const path = join(directory, 'graph.sqlite')
    const seed = new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    seed.close()
    const db = new DatabaseSync(path)
    db.exec(`PRAGMA application_id = ${String(KB_GRAPH_SQLITE_APPLICATION_ID + 1)}`)
    db.close()
    expect(() => new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync))
      .toThrow(new RegExp(`application id ${String(KB_GRAPH_SQLITE_APPLICATION_ID + 1)}, expected`, 'u'))
  })

  it('reopens an already-initialized database without recreating the schema', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-kb-graph-'))
    directories.push(directory)
    const path = join(directory, 'graph.sqlite')
    const seed = new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    seed.close()
    const db = new DatabaseSync(path)
    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    db.close()
    expect(version).toBe(SCHEMA_VERSION)
    // The second open takes the onDisk !== 0 path: no CREATE, straight to use.
    const reopened = new SqliteGraphStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    expect(reopened.available()).toBe(true)
    reopened.close()
  })
})

describe('kb-graph-sqlite plugin apply', () => {
  it('registers the store with the configured and the default busy timeout', async () => {
    // Through the loader schema (the default fills in) ...
    const viaLoader = new Context()
    await viaLoader.plugin(KbGraphRuntime)
    await viaLoader.plugin(Plugin, { path: ':memory:', busyTimeoutMs: 250 })
    expect(await viaLoader.kbGraph.stats('t')).toEqual({ triples: 0, entities: 0 })
    await viaLoader.fiber.dispose()
    // ... and by direct apply with the fallback branch.
    const direct = new Context()
    await direct.plugin(KbGraphRuntime)
    await Plugin.apply(direct, { path: ':memory:' })
    expect(await direct.kbGraph.stats('t')).toEqual({ triples: 0, entities: 0 })
    await direct.fiber.dispose()
  })
})
