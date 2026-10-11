import { describe, expect, it, vi } from 'vitest'
import { KbError } from '@deepseek-ai/dsh-kb'
import type { KbChunkInput, KbDocumentInput, KbSearchHit, KbStore } from '@deepseek-ai/dsh-kb'
import { WeknoraClient } from '../src/client.ts'
import { FALLBACK_NOTICE, WeknoraKbStore } from '../src/store.ts'

/** Transport-failing client stand-in: every call rejects without a status. */
class DeadClient extends WeknoraClient {
  constructor() {
    super({ baseUrl: 'http://dead', apiKey: 'k', fetch: (async () => { throw new TypeError('down') }) as unknown as typeof fetch })
  }
}

/** Fake fallback store recording calls; returns canned shapes. */
class FakeFallback implements KbStore {
  readonly id = 'fallback'
  readonly calls: string[] = []
  private closed = false

  available(): boolean {
    return true
  }

  async putDocument(): Promise<{ docId: number; chunks: number; embedded: boolean }> {
    this.calls.push('put')
    return { docId: 1, chunks: 1, embedded: false }
  }

  async deleteDocument(): Promise<boolean> {
    this.calls.push('delete')
    return true
  }

  async textSearch(_query: string, _tenantId: string | undefined, k: number): Promise<KbSearchHit[]> {
    this.calls.push('text')
    const hits: KbSearchHit[] = [{ chunkId: 7, docId: 1, tenantId: 't', sourcePath: 's.md', docKind: 'other', chunkIdx: 0, content: 'c' }]
    return hits.slice(0, k)
  }

  async vectorSearch(): Promise<KbSearchHit[]> {
    this.calls.push('vector')
    return [{ chunkId: 7, docId: 1, tenantId: 't', sourcePath: 's.md', docKind: 'other', chunkIdx: 0, content: 'c' }]
  }

  async stats(): Promise<{ documents: number; chunks: number; embeddedChunks: number }> {
    this.calls.push('stats')
    return { documents: 3, chunks: 3, embeddedChunks: 3 }
  }

  async recordUsage(): Promise<void> {
    this.calls.push('usage')
  }

  async usage(): Promise<{ searches: number; ingestedDocuments: number; ingestedChunks: number; embedTexts: number; embedTokens: number }> {
    return { searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }
  }

  close(): void {
    this.closed = true
  }

  wasClosed(): boolean {
    return this.closed
  }
}

function documentInput(overrides: Partial<KbDocumentInput> = {}): KbDocumentInput {
  return { tenantId: 'demo', sourcePath: 'food-safety/gb7718.md', docKind: 'regulation', ...overrides }
}

function chunks(...contents: string[]): KbChunkInput[] {
  return contents.map((content, index) => ({ chunkIdx: index, content, embedding: null }))
}

/** Patch the store's private client with a stub. */
function withClient(store: WeknoraKbStore, client: WeknoraClient): WeknoraKbStore {
  ;(store as unknown as { client: WeknoraClient }).client = client
  return store
}

describe('WeknoraKbStore', () => {
  it('reports availability from the configured API key alone', () => {
    expect(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }).available()).toBe(true)
    expect(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: '  ' }).available()).toBe(false)
    expect(new WeknoraKbStore({ baseUrl: 'http://h' }).available()).toBe(false)
  })

  it('stores a document into the tenant/category KB, deleting the prior entry', async () => {
    const deleted: string[] = []
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-1', name: 'demo/food-safety' }]),
      createKnowledgeBase: vi.fn(),
      listDocuments: vi.fn(async () => [{ id: 'old', title: '[regulation] food-safety/gb7718.md' }, { id: 'other', title: '[report] quality/x.md' }]),
      deleteKnowledge: vi.fn(async (id: string) => { deleted.push(id) }),
      createManualKnowledge: vi.fn(async () => 'new'),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    const result = await store.putDocument(documentInput(), chunks('a', 'b'))
    expect(deleted).toEqual(['old'])
    expect(result).toEqual({ docId: expect.any(Number), chunks: 2, embedded: true })
    expect(client.createManualKnowledge).toHaveBeenCalledWith('kb-1', '[regulation] food-safety/gb7718.md', 'a\n\nb', undefined)
  })

  it('creates the category knowledge base when missing', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => []),
      createKnowledgeBase: vi.fn(async () => ({ id: 'kb-2', name: 'demo/food-safety' })),
      listDocuments: vi.fn(async () => []),
      deleteKnowledge: vi.fn(),
      createManualKnowledge: vi.fn(async () => 'n1'),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    await store.putDocument(documentInput(), chunks('x'))
    expect(client.createKnowledgeBase).toHaveBeenCalledWith('demo/food-safety', undefined)
  })

  it('routes a pathless source into the general category', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-g', name: 'demo/general' }]),
      createKnowledgeBase: vi.fn(),
      listDocuments: vi.fn(async () => []),
      deleteKnowledge: vi.fn(),
      createManualKnowledge: vi.fn(async () => 'n2'),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    await store.putDocument(documentInput({ sourcePath: 'readme.md', docKind: 'other' }), chunks('x'))
    expect(client.createManualKnowledge).toHaveBeenCalledWith('kb-g', '[other] readme.md', 'x', undefined)
  })

  it('deletes by decoded source path and reports misses as false', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-1', name: 'demo/food-safety' }]),
      listDocuments: vi.fn(async () => [{ id: 'old', title: '[regulation] food-safety/gb7718.md' }]),
      deleteKnowledge: vi.fn(),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    await expect(store.deleteDocument('demo', 'food-safety/gb7718.md')).resolves.toBe(true)
    await expect(store.deleteDocument('demo', 'food-safety/other.md')).resolves.toBe(false)
    const noKb = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'x', name: 'other/cat' }]),
    } as unknown as WeknoraClient
    await expect(withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), noKb).deleteDocument('demo', 'a/b.md')).resolves.toBe(false)
  })

  it('projects retrieval hits with decoded identity and stable numeric ids', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [
        { id: 'kb-1', name: 'demo/food-safety' },
        { id: 'kb-2', name: 'demo/quality' },
        { id: 'kb-3', name: 'other-tenant/x' },
      ]),
      knowledgeSearch: vi.fn(async () => [{
        id: 'chunk-a',
        knowledge_id: 'kn-1',
        knowledge_title: '[regulation] food-safety/gb7718.md',
        chunk_index: 3,
        score: 0.42,
        content: '正文',
        breadcrumb: '三、标签>生产日期',
      }, {
        knowledge_id: 'kn-2',
        knowledge_filename: 'foreign.pdf',
        content: 'f',
      }]),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    const hits = await store.textSearch('保质期', 'demo', 8, undefined)
    expect(client.knowledgeSearch).toHaveBeenCalledWith('保质期', ['kb-1', 'kb-2'], 32, undefined)
    expect(hits[0]).toMatchObject({
      sourcePath: 'food-safety/gb7718.md',
      title: 'gb7718.md',
      docKind: 'regulation',
      chunkIdx: 3,
      content: '正文',
      headingPath: '三、标签>生产日期',
      score: 0.42,
    })
    expect(hits[1]).toMatchObject({ sourcePath: 'foreign.pdf', docKind: 'other', chunkIdx: 0 })
  })

  it('applies the doc-kind filter after retrieval', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-1', name: 'demo/food-safety' }]),
      knowledgeSearch: vi.fn(async () => [
        { knowledge_title: '[regulation] a.md', content: 'r' },
        { knowledge_title: '[report] b.md', content: 'p' },
      ]),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    const hits = await store.textSearch('q', 'demo', 8, { docKind: 'report' })
    expect(hits.map(hit => hit.sourcePath)).toEqual(['b.md'])
  })

  it('returns no hits when the tenant owns no knowledge bases', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-9', name: 'elsewhere/x' }]),
      knowledgeSearch: vi.fn(),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    await expect(store.textSearch('q', 'demo', 8, undefined)).resolves.toEqual([])
    expect(client.knowledgeSearch).not.toHaveBeenCalled()
  })

  it('rejects untenanted searches and stats with a loud error', async () => {
    const store = new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' })
    await expect(store.textSearch('q', undefined, 5, undefined)).rejects.toMatchObject({ code: 'KB_WEKNORA_TENANT_REQUIRED' })
    await expect(store.vectorSearch(new Float32Array(2), undefined, 5, undefined)).rejects.toBeInstanceOf(KbError)
    await expect(store.stats(undefined)).rejects.toBeInstanceOf(KbError)
  })

  it('fans hybrid vector search across every tenant KB and dedupes by chunk id', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [
        { id: 'kb-1', name: 'demo/a' },
        { id: 'kb-2', name: 'demo/b' },
      ]),
      hybridSearch: vi.fn(async (kbId: string) => [
        { id: 'shared-chunk', knowledge_id: 'kn-1', knowledge_title: '[report] shared.md', content: 'x' },
        ...(kbId === 'kb-2' ? [{ id: 'b-only', knowledge_id: 'kn-2', knowledge_title: '[report] b.md', content: 'y' }] : []),
      ]),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    const hits = await store.vectorSearch(new Float32Array([1, 2]), 'demo', 8, undefined)
    expect(hits.map(hit => hit.sourcePath)).toEqual(['shared.md', 'b.md'])
  })

  it('counts documents across the tenant KBs and reports zero chunks', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [
        { id: 'kb-1', name: 'demo/a', knowledge_count: 4 },
        { id: 'kb-2', name: 'demo/b', knowledge_count: 6 },
        { id: 'kb-3', name: 'other/c', knowledge_count: 99 },
      ]),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    await expect(store.stats('demo')).resolves.toEqual({ documents: 10, chunks: 0, embeddedChunks: 0 })
  })

  it('usage is a no-op returning zeros', async () => {
    const store = new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' })
    await expect(store.recordUsage('t', { searches: 1 })).resolves.toBeUndefined()
    await expect(store.usage('t')).resolves.toEqual({ searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 })
  })

  it('fails loud on outage when no fallback is configured', async () => {
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), new DeadClient())
    const error = await store.textSearch('q', 'demo', 5, undefined).then(() => undefined, (cause: unknown) => cause)
    expect(error).toBeInstanceOf(KbError)
    expect((error as KbError).code).toBe('KB_WEKNORA_UNAVAILABLE')
  })

  it('degrades to the fallback store with a notice on every hit, logging the transition once', async () => {
    const fallback = new FakeFallback()
    const warnings: string[] = []
    const store = withClient(new WeknoraKbStore({
      baseUrl: 'http://h',
      apiKey: 'k',
      allowFallback: true,
      fallbackStore: fallback,
      logger: { warn: m => warnings.push(m), info: () => {} },
    }), new DeadClient())
    const hits = await store.textSearch('q', 'demo', 5, undefined)
    expect(hits[0]?.notice).toBe(FALLBACK_NOTICE)
    await store.vectorSearch(new Float32Array(1), 'demo', 5, undefined)
    await store.putDocument(documentInput(), chunks('a'))
    await store.deleteDocument('demo', 'x.md')
    await store.stats('demo')
    expect(fallback.calls).toEqual(['text', 'vector', 'put', 'delete', 'stats'])
    expect(warnings).toHaveLength(1)
  })

  it('does not degrade a rejected (4xx) request even with allowFallback', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-1', name: 'demo/a' }]),
      knowledgeSearch: vi.fn(async () => {
        const { WeknoraApiError } = await import('../src/client.ts')
        throw new WeknoraApiError('HTTP 401', 401)
      }),
    } as unknown as WeknoraClient
    const fallback = new FakeFallback()
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k', allowFallback: true, fallbackStore: fallback }), client)
    await expect(store.textSearch('q', 'demo', 5, undefined)).rejects.toMatchObject({ code: 'KB_WEKNORA_UNAVAILABLE' })
    expect(fallback.calls).toEqual([])
  })

  it('rethrows non-WeKnora errors from the primary path untouched', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => { throw new Error('boom') }),
    } as unknown as WeknoraClient
    const fallback = new FakeFallback()
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k', allowFallback: true, fallbackStore: fallback }), client)
    await expect(store.textSearch('q', 'demo', 5, undefined)).rejects.toThrow('boom')
    expect(fallback.calls).toEqual([])
  })

  it('degrades on a 5xx outage exactly like a transport failure', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-1', name: 'demo/a' }]),
      knowledgeSearch: vi.fn(async () => {
        const { WeknoraApiError } = await import('../src/client.ts')
        throw new WeknoraApiError('HTTP 503', 503)
      }),
    } as unknown as WeknoraClient
    const fallback = new FakeFallback()
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k', allowFallback: true, fallbackStore: fallback }), client)
    const hits = await store.textSearch('q', 'demo', 5, undefined)
    expect(hits[0]?.notice).toBe(FALLBACK_NOTICE)
    expect(fallback.calls).toEqual(['text'])
  })

  it('projects hostile retrieval payloads onto the safe defaults', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-1', name: 'demo/a' }]),
      knowledgeSearch: vi.fn(async () => [{
        knowledge_title: '',
        knowledge_filename: 42,
        chunk_index: 'nonsense',
        content: null,
        breadcrumb: '',
        score: Number.NaN,
      }]),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    const hits = await store.textSearch('q', 'demo', 8, undefined)
    expect(hits[0]).toMatchObject({ sourcePath: '', docKind: 'other', chunkIdx: 0, content: '' })
    expect(hits[0]?.headingPath).toBeUndefined()
    expect(hits[0]?.score).toBeUndefined()
  })

  it('routes a leading-slash source into the general category and drops empty basenames', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-g', name: 'demo/general' }]),
      createKnowledgeBase: vi.fn(),
      listDocuments: vi.fn(async () => []),
      deleteKnowledge: vi.fn(),
      createManualKnowledge: vi.fn(async () => 'n3'),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    await store.putDocument(documentInput({ sourcePath: '/edge.md' }), chunks('x'))
    expect(client.createManualKnowledge).toHaveBeenCalledWith('kb-g', '[regulation] /edge.md', 'x', undefined)
    const search = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-1', name: 'demo/a' }]),
      knowledgeSearch: vi.fn(async () => [{ id: 'c', knowledge_id: 'k', knowledge_title: '[report] trailing/', content: 'x' }]),
    } as unknown as WeknoraClient
    const hits = await withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), search).textSearch('q', 'demo', 5, undefined)
    expect(hits[0]?.title).toBeUndefined()
  })

  it('returns no vector hits when the tenant owns no knowledge bases', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-9', name: 'elsewhere/x' }]),
      hybridSearch: vi.fn(),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    await expect(store.vectorSearch(new Float32Array(1), 'demo', 8, undefined)).resolves.toEqual([])
    expect(client.hybridSearch).not.toHaveBeenCalled()
  })

  it('applies the doc-kind filter on the vector path too', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-1', name: 'demo/a' }]),
      hybridSearch: vi.fn(async () => [
        { id: 'r', knowledge_id: 'k1', knowledge_title: '[regulation] a.md', content: 'r' },
        { id: 'p', knowledge_id: 'k2', knowledge_title: '[report] b.md', content: 'p' },
      ]),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    const hits = await store.vectorSearch(new Float32Array([1]), 'demo', 8, { docKind: 'report' })
    expect(hits.map(hit => hit.sourcePath)).toEqual(['b.md'])
  })

  it('keeps fallback hits that already carry their own notice', async () => {
    const noticed: KbSearchHit = { chunkId: 9, docId: 1, tenantId: 'demo', sourcePath: 's.md', docKind: 'other', chunkIdx: 0, content: 'c', notice: 'prior notice' }
    const fallback: KbStore = {
      id: 'noticed',
      available: () => true,
      putDocument: async () => ({ docId: 1, chunks: 1, embedded: false }),
      deleteDocument: async () => false,
      textSearch: async () => [noticed],
      vectorSearch: async () => [noticed],
      stats: async () => ({ documents: 1, chunks: 0, embeddedChunks: 0 }),
      recordUsage: async () => {},
      usage: async () => ({ searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }),
    }
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k', allowFallback: true, fallbackStore: fallback }), new DeadClient())
    await expect(store.textSearch('q', 'demo', 5, undefined)).resolves.toMatchObject([{ notice: 'prior notice' }])
    await expect(store.vectorSearch(new Float32Array(1), 'demo', 5, undefined)).resolves.toMatchObject([{ notice: 'prior notice' }])
  })

  it('counts a knowledge base without a document count as zero', async () => {
    const client = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-1', name: 'demo/a' }]),
    } as unknown as WeknoraClient
    const store = withClient(new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k' }), client)
    await expect(store.stats('demo')).resolves.toEqual({ documents: 0, chunks: 0, embeddedChunks: 0 })
  })

  it('logs the recovery transition after a degraded operation succeeds again', async () => {
    const infos: string[] = []
    const store = withClient(new WeknoraKbStore({
      baseUrl: 'http://h',
      apiKey: 'k',
      allowFallback: true,
      fallbackStore: new FakeFallback(),
      logger: { warn: () => {}, info: message => infos.push(message) },
    }), new DeadClient())
    await store.textSearch('q', 'demo', 5, undefined)
    const healthy = {
      listKnowledgeBases: vi.fn(async () => [{ id: 'kb-1', name: 'demo/a' }]),
      knowledgeSearch: vi.fn(async () => [{ id: 'c1', knowledge_id: 'kn-1', knowledge_title: '[report] a.md', content: 'x' }]),
    } as unknown as WeknoraClient
    withClient(store, healthy)
    const hits = await store.textSearch('q', 'demo', 5, undefined)
    expect(hits[0]?.notice).toBeUndefined()
    expect(infos).toEqual(['kb-weknora: WeKnora is reachable again; primary retrieval resumed'])
  })

  it('closes the embedded fallback store on close', () => {
    const fallback = new FakeFallback()
    const store = new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k', fallbackStore: fallback })
    store.close()
    expect(fallback.wasClosed()).toBe(true)
  })

  it('tolerates a fallback store with no close method', () => {
    const bare: KbStore = {
      id: 'bare',
      available: () => true,
      putDocument: async () => ({ docId: 1, chunks: 1, embedded: false }),
      deleteDocument: async () => false,
      textSearch: async () => [],
      vectorSearch: async () => [],
      stats: async () => ({ documents: 0, chunks: 0, embeddedChunks: 0 }),
      recordUsage: async () => {},
      usage: async () => ({ searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }),
    }
    const store = new WeknoraKbStore({ baseUrl: 'http://h', apiKey: 'k', fallbackStore: bare })
    expect(() => store.close()).not.toThrow()
  })
})
