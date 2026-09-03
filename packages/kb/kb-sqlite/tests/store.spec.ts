import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { KbChunkInput, KbDocumentInput } from '@deepseek-ai/dsh-kb'
import { ftsMatchExpression, likePattern, SqliteKbStore } from '../src/store.ts'
import { testSql } from './test-sql.ts'

function freshStore(): SqliteKbStore {
  return new SqliteKbStore({ path: ':memory:', busyTimeoutMs: 5_000 }, DatabaseSync)
}

function doc(overrides: Partial<KbDocumentInput> = {}): KbDocumentInput {
  return {
    tenantId: 'hongfa-food',
    sourcePath: 'notes/visit.md',
    docKind: 'meeting',
    ...overrides,
  }
}

function chunk(chunkIdx: number, content: string, embedding: Float32Array | null = null): KbChunkInput {
  return { chunkIdx, content, embedding, ...(embedding === null ? {} : { embedModel: 'fake:model-a' }) }
}

describe('ftsMatchExpression', () => {
  it('wraps one short segment as a quoted string literal', () => {
    expect(ftsMatchExpression('白糖价格')).toBe('"白糖价格"')
  })

  it('treats quotes as segment separators, so query syntax cannot inject', () => {
    expect(ftsMatchExpression('a"b')).toBe('')
    expect(ftsMatchExpression('abc"OR"dEf')).toBe('"abc" OR "dEf"')
  })

  it('splits a long natural-language query into overlapping OR phrases', () => {
    const expression = ftsMatchExpression('调味品企业的食品添加剂合规要点是什么')
    expect(expression).toContain(' OR ')
    for (const phrase of expression.split(' OR ')) {
      expect(phrase.startsWith('"')).toBe(true)
      expect(phrase.endsWith('"')).toBe(true)
      // oxlint-disable-next-line typescript/no-misused-spread -- counting Unicode code points is the point.
      expect([...phrase].length).toBeLessThanOrEqual(6) // 4 chars + 2 quotes
    }
  })

  it('drops segments shorter than one trigram', () => {
    expect(ftsMatchExpression('ab cd')).toBe('')
  })

  it('caps the phrase count for very long queries', () => {
    const expression = ftsMatchExpression('一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九')
    expect(expression.split(' OR ').length).toBeLessThanOrEqual(12)
  })
})

describe('likePattern', () => {
  it('wraps the query in unanchored percent wildcards', () => {
    expect(likePattern('白糖')).toBe('%白糖%')
  })

  it('escapes percent, underscore, and backslash', () => {
    expect(likePattern('a%b_c\\d')).toBe('%a\\%b\\_c\\\\d%')
  })
})

describe('SqliteKbStore', () => {
  it('matches a natural-language question against prose content', async () => {
    const store = freshStore()
    await store.putDocument(doc({ docKind: 'regulation' }), [
      chunk(0, '食品添加剂的使用应符合国家标准，复配添加剂按带入原则核算。', null),
    ])
    const hits = await store.textSearch('调味品企业的食品添加剂合规要点是什么', 'hongfa-food', 8, undefined)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.content).toContain('食品添加剂')
  })
  it('round-trips an ingest through full-text search with citation metadata', async () => {
    const store = freshStore()
    const result = await store.putDocument(doc({ title: '走访纪要', collectedAt: '2026-08-27' }), [
      chunk(0, '# 走访纪要\n\n白糖采购价格上行，供应商建议锁价。', null),
      chunk(1, '面粉成本保持平稳。', null),
    ])
    expect(result.chunks).toBe(2)
    expect(result.embedded).toBe(false)
    const hits = await store.textSearch('白糖采购', 'hongfa-food', 8, undefined)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      docId: result.docId,
      tenantId: 'hongfa-food',
      sourcePath: 'notes/visit.md',
      docKind: 'meeting',
      chunkIdx: 0,
    })
    expect(hits[0]?.content).toContain('白糖采购价格上行')
    store.close()
  })

  it('falls back to LIKE matching for queries shorter than one trigram', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [chunk(0, '糖价上行。', null)])
    const hits = await store.textSearch('糖', 'hongfa-food', 8, undefined)
    expect(hits).toHaveLength(1)
    store.close()
  })

  it('replaces a prior document with the same tenant and source identity', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [chunk(0, '旧内容一。', null), chunk(1, '旧内容二。', null)])
    const second = await store.putDocument(doc(), [chunk(0, '新内容。', null)])
    const stats = await store.stats('hongfa-food')
    expect(stats.documents).toBe(1)
    expect(stats.chunks).toBe(1)
    const hits = await store.textSearch('旧内容', undefined, 8, undefined)
    expect(hits).toHaveLength(0)
    expect((await store.textSearch('新内容', undefined, 8, undefined)).map(h => h.docId)).toEqual([second.docId])
    store.close()
  })

  it('keeps tenants isolated in both retrieval paths and stats', async () => {
    const store = freshStore()
    await store.putDocument(doc({ tenantId: 'a' }), [chunk(0, '甲方的糖价记录。', null)])
    await store.putDocument(doc({ tenantId: 'b', sourcePath: 'other.md' }), [chunk(0, '乙方的糖价记录。', null)])
    expect((await store.textSearch('糖价', 'a', 8, undefined)).map(h => h.tenantId)).toEqual(['a'])
    expect((await store.stats('a')).documents).toBe(1)
    expect((await store.stats(undefined)).documents).toBe(2)
    store.close()
  })

  it('applies the document-kind filter', async () => {
    const store = freshStore()
    await store.putDocument(doc({ sourcePath: 'm.md', docKind: 'meeting' }), [chunk(0, '糖价讨论。', null)])
    await store.putDocument(doc({ sourcePath: 'r.md', docKind: 'regulation' }), [chunk(0, '糖价法规。', null)])
    expect((await store.textSearch('糖价', undefined, 8, { docKind: 'regulation' })).map(h => h.sourcePath))
      .toEqual(['r.md'])
    store.close()
  })

  it('ranks vector candidates by cosine similarity', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [
      chunk(0, '正交向量。', new Float32Array([1, 0, 0])),
      chunk(1, '同向向量。', new Float32Array([0, 1, 0])),
      chunk(2, '反向向量。', new Float32Array([0, 0, 1])),
    ])
    const hits = await store.vectorSearch(new Float32Array([0.9, 0.1, 0]), undefined, 2, undefined)
    expect(hits.map(h => h.chunkIdx)).toEqual([0, 1])
    store.close()
  })

  it('skips vector candidates whose stored dimensionality differs', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [
      chunk(0, '二维向量。', new Float32Array([1, 0])),
      chunk(1, '三维向量。', new Float32Array([1, 0, 0])),
    ])
    const hits = await store.vectorSearch(new Float32Array([1, 0, 0]), undefined, 8, undefined)
    expect(hits.map(h => h.chunkIdx)).toEqual([1])
    store.close()
  })

  it('returns no vector hits when nothing was embedded', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [chunk(0, '纯文本。', null)])
    expect(await store.vectorSearch(new Float32Array([1, 0, 0]), undefined, 8, undefined)).toEqual([])
    store.close()
  })

  it('counts embedded chunks in stats', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [
      chunk(0, '带向量。', new Float32Array([1])),
      chunk(1, '无向量。', null),
    ])
    const stats = await store.stats(undefined)
    expect(stats).toMatchObject({ documents: 1, chunks: 2, embeddedChunks: 1 })
    store.close()
  })

  it('deletes a document with its chunks and full-text rows', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [chunk(0, '待删除的糖价内容。', null)])
    expect(await store.deleteDocument('hongfa-food', 'notes/visit.md')).toBe(true)
    expect(await store.textSearch('糖价', undefined, 8, undefined)).toEqual([])
    expect((await store.stats(undefined)).documents).toBe(0)
    expect(await store.deleteDocument('hongfa-food', 'notes/visit.md')).toBe(false)
    store.close()
  })

  it('rolls back an overwrite whose deletion fails mid-transaction', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [chunk(0, '原始内容。', null)])
    const internals = store as unknown as { db: DatabaseSync }
    internals.db.exec(testSql('create-failing-delete-trigger'))
    await expect(store.putDocument(doc(), [chunk(0, '新内容。', null)])).rejects.toThrow(/delete refused/u)
    const hits = await store.textSearch('原始内容', undefined, 8, undefined)
    expect(hits).toHaveLength(1)
    expect((await store.stats(undefined)).documents).toBe(1)
    store.close()
  })

  it('rejects use after close and reports availability', async () => {
    const store = freshStore()
    expect(store.available()).toBe(true)
    store.close()
    store.close()
    expect(store.available()).toBe(false)
    await expect(store.putDocument(doc(), [chunk(0, 'x', null)])).rejects.toThrow(/closed/u)
    await expect(store.textSearch('x', undefined, 1, undefined)).rejects.toThrow(/closed/u)
    await expect(store.vectorSearch(new Float32Array([1]), undefined, 1, undefined)).rejects.toThrow(/closed/u)
    await expect(store.stats(undefined)).rejects.toThrow(/closed/u)
    await expect(store.deleteDocument('t', 'p')).rejects.toThrow(/closed/u)
  })

  it('skips zero-vector candidates with no finite direction', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [
      chunk(0, '零向量。', new Float32Array([0, 0, 0])),
      chunk(1, '正常向量。', new Float32Array([1, 0, 0])),
    ])
    const hits = await store.vectorSearch(new Float32Array([1, 0, 0]), undefined, 8, undefined)
    expect(hits.map(h => h.chunkIdx)).toEqual([1])
    store.close()
  })

  it('breaks cosine ties by ascending chunk id', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [
      chunk(0, '同向甲。', new Float32Array([1, 0, 0])),
      chunk(1, '同向乙。', new Float32Array([1, 0, 0])),
    ])
    const hits = await store.vectorSearch(new Float32Array([1, 0, 0]), undefined, 8, undefined)
    expect(hits.map(h => h.chunkIdx)).toEqual([0, 1])
    store.close()
  })

  it('returns no hits for a blank query', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [chunk(0, '糖价上行。', null)])
    expect(await store.textSearch('   ', undefined, 8, undefined)).toEqual([])
    store.close()
  })

  it('rolls back a deletion whose statement fails mid-transaction', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [chunk(0, '待删内容。', null)])
    const internals = store as unknown as { db: DatabaseSync }
    internals.db.exec(testSql('create-failing-delete-trigger'))
    await expect(store.deleteDocument('hongfa-food', 'notes/visit.md')).rejects.toThrow(/delete refused/u)
    expect((await store.stats(undefined)).documents).toBe(1)
    store.close()
  })

  it('closes the connection and rethrows when schema validation fails at open', () => {
    const opened: DatabaseSync[] = []
    const FailingDatabase = class extends DatabaseSync {
      constructor(...args: ConstructorParameters<typeof DatabaseSync>) {
        super(...args)
        opened.push(this)
      }
      override exec(): void {
        throw new Error('connection setup refused')
      }
    }
    expect(() => new SqliteKbStore({ path: ':memory:', busyTimeoutMs: 5 }, FailingDatabase))
      .toThrow(/connection setup refused/u)
    expect(opened).toHaveLength(1)
  })

  it('honors an already-aborted signal between statements', async () => {
    const store = freshStore()
    const controller = new AbortController()
    controller.abort()
    await expect(store.putDocument(doc(), [chunk(0, 'x', null)], controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
    await expect(store.vectorSearch(new Float32Array([1]), undefined, 1, undefined, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
    store.close()
  })
})
