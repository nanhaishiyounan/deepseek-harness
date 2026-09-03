/**
 * Per-tenant usage counters in the SQLite store: atomic upsert increments,
 * zero-valued reads for unrecorded tenants, tenant isolation, and the schema
 * version gate that rejects databases this build does not own.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { KbUsageDelta } from '@deepseek-ai/dsh-kb'
import { SqliteKbStore } from '../src/store.ts'
import { SCHEMA_VERSION, validateSchema } from '../src/schema.ts'
import { testSql } from './test-sql.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function freshStore(): Promise<SqliteKbStore> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-kb-usage-'))
  directories.push(directory)
  return new SqliteKbStore({ path: join(directory, 'kb.sqlite'), busyTimeoutMs: 5_000 }, DatabaseSync)
}

const emptyUsage = { searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }

describe('SqliteKbStore usage counters', () => {
  it('accumulates repeated increments atomically', async () => {
    const store = await freshStore()
    try {
      const delta: KbUsageDelta = { searches: 1, embedTexts: 1 }
      await store.recordUsage('hongfa-food', delta)
      await store.recordUsage('hongfa-food', delta)
      await store.recordUsage('hongfa-food', { ingestedDocuments: 1, ingestedChunks: 7 })
      expect(await store.usage('hongfa-food')).toEqual({
        searches: 2, ingestedDocuments: 1, ingestedChunks: 7, embedTexts: 2, embedTokens: 0,
      })
    } finally {
      store.close()
    }
  })

  it('returns zeroed counters for a tenant with no recorded usage', async () => {
    const store = await freshStore()
    try {
      expect(await store.usage('unknown-co')).toEqual(emptyUsage)
    } finally {
      store.close()
    }
  })

  it('keeps tenants on independent counter rows', async () => {
    const store = await freshStore()
    try {
      await store.recordUsage('tenant-a', { searches: 3 })
      await store.recordUsage('tenant-b', { ingestedDocuments: 5 })
      expect(await store.usage('tenant-a')).toEqual({ ...emptyUsage, searches: 3 })
      expect(await store.usage('tenant-b')).toEqual({ ...emptyUsage, ingestedDocuments: 5 })
    } finally {
      store.close()
    }
  })

  it('loses no increments when two connections record concurrently', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-kb-usage-concurrency-'))
    directories.push(directory)
    const path = join(directory, 'kb.sqlite')
    const a = new SqliteKbStore({ path, busyTimeoutMs: 10_000 }, DatabaseSync)
    const b = new SqliteKbStore({ path, busyTimeoutMs: 10_000 }, DatabaseSync)
    try {
      const rounds = 25
      await Promise.all([
        ...Array.from({ length: rounds }, () => a.recordUsage('shared-co', { searches: 1 })),
        ...Array.from({ length: rounds }, () => b.recordUsage('shared-co', { searches: 1 })),
      ])
      expect((await a.usage('shared-co')).searches).toBe(rounds * 2)
    } finally {
      a.close()
      b.close()
    }
  })

  it('rejects a database left at an older schema version', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-kb-usage-v1-'))
    directories.push(directory)
    const path = join(directory, 'kb.sqlite')
    const seed = new SqliteKbStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    seed.close()
    // Downgrade the on-disk version to the previous schema generation.
    const db = new DatabaseSync(path)
    db.exec(testSql('set-user-version-2'))
    db.close()
    expect(() => new SqliteKbStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync))
      .toThrow(new RegExp(`schema version ${SCHEMA_VERSION - 1}.*incompatible`, 'u'))
  })

  it('rolls back and fails loud when the counter write itself fails', async () => {
    const store = await freshStore()
    store.close()
    // Re-open the same file with the counters table dropped; the upsert then
    // fails inside the transaction and must roll back without corrupting.
    const directory = directories[directories.length - 1]!
    const path = join(directory, 'kb.sqlite')
    const sabotage = new DatabaseSync(path)
    sabotage.exec(testSql('drop-usage-table'))
    sabotage.close()
    const reopened = new SqliteKbStore({ path, busyTimeoutMs: 5_000 }, DatabaseSync)
    try {
      await expect(reopened.recordUsage('t', { searches: 1 })).rejects.toThrow(/usage_counters/u)
      // The failed write rolled back; the store stays usable for data writes.
      await reopened.putDocument({ tenantId: 't', sourcePath: 'a.md', docKind: 'other' }, [{ chunkIdx: 0, content: '正文。', embedding: null }])
      expect((await reopened.stats('t')).documents).toBe(1)
    } finally {
      reopened.close()
    }
  })

  it('initializes the usage counters table with the schema', () => {
    const db = new DatabaseSync(':memory:')
    validateSchema(db, ':memory:')
    const rows = db.prepare(testSql('count-usage-table')).get() as { n: number }
    expect(rows.n).toBe(1)
    db.close()
  })
})
