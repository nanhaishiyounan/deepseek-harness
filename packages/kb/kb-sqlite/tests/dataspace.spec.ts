/**
 * Data-space authorization over the SQLite store: the provenance triple
 * (provider/scope/collected-source plus the seam-computed hash and character
 * length) persists with each document, and retrieval honors the scope —
 * `share` documents stay retrievable from OTHER tenants, everything else
 * stays tenant-private.
 */

import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { KbChunkInput, KbDocumentInput } from '@deepseek-ai/dsh-kb'
import { SqliteKbStore } from '../src/store.ts'

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

function chunk(content: string): KbChunkInput {
  return { chunkIdx: 0, content, embedding: null }
}

describe('SqliteKbStore data-space authorization', () => {
  it('persists the provenance triple and returns it on hits', async () => {
    const store = freshStore()
    await store.putDocument(doc({
      provenance: { provider: 'lvyuan-ingredients', scope: 'share', collectedSource: 'visit' },
      contentHash: 'a'.repeat(64),
      contentLength: 42,
    }), [chunk('共享行业白皮书关于调味品出口的段落')])
    const hits = await store.textSearch('调味品出口', 'other-co', 5, undefined)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.provenance).toEqual({
      provider: 'lvyuan-ingredients',
      scope: 'share',
      collectedSource: 'visit',
    })
    store.close()
  })

  it('lets a share-scope document surface in another tenant\'s search', async () => {
    const store = freshStore()
    await store.putDocument(doc({
      sourcePath: 'shared/industry-report.md',
      provenance: { provider: 'platform', scope: 'share' },
    }), [chunk('跨租户共享的行业风险提示语料')])
    await store.putDocument(doc({ sourcePath: 'private/visit.md' }), [chunk('本租户私有的走访纪要')])
    const foreign = await store.textSearch('行业风险提示', 'other-co', 5, undefined)
    expect(foreign.map(hit => hit.sourcePath)).toEqual(['shared/industry-report.md'])
    const own = await store.textSearch('走访纪要', 'hongfa-food', 5, undefined)
    expect(own.map(hit => hit.sourcePath)).toEqual(['private/visit.md'])
    store.close()
  })

  it('keeps search- and derive-scope documents invisible to other tenants', async () => {
    const store = freshStore()
    await store.putDocument(doc({
      sourcePath: 'shared/derive-only.md',
      provenance: { provider: 'platform', scope: 'derive' },
    }), [chunk('仅限本租户派生的成本测算底稿')])
    const foreign = await store.textSearch('成本测算底稿', 'other-co', 5, undefined)
    expect(foreign).toHaveLength(0)
    const own = await store.textSearch('成本测算底稿', 'hongfa-food', 5, undefined)
    expect(own).toHaveLength(1)
    store.close()
  })

  it('keeps legacy documents (no provenance) tenant-private', async () => {
    const store = freshStore()
    await store.putDocument(doc(), [chunk('无确权元数据的历史文档')])
    const foreign = await store.textSearch('历史文档', 'other-co', 5, undefined)
    expect(foreign).toHaveLength(0)
    store.close()
  })

  it('applies the same scope filter to the vector path', async () => {
    const store = freshStore()
    await store.putDocument(doc({
      sourcePath: 'shared/vector.md',
      provenance: { provider: 'platform', scope: 'share' },
    }), [{ chunkIdx: 0, content: '共享向量语料', embedding: new Float32Array([1, 0]), embedModel: 'fake:model-a' }])
    await store.putDocument(doc({ sourcePath: 'private/vector.md' }), [{ chunkIdx: 0, content: '私有向量语料', embedding: new Float32Array([0, 1]), embedModel: 'fake:model-a' }])
    const foreign = await store.vectorSearch(new Float32Array([1, 0]), 'other-co', 5, undefined)
    expect(foreign.map(hit => hit.sourcePath)).toEqual(['shared/vector.md'])
    store.close()
  })
})
