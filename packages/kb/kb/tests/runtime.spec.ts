import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import KbRuntime, {
  KbError,
  type EmbedProvider,
  type KbRuntimeConfig,
  type KbChunkInput,
  type KbDocumentInput,
  type KbIngestResult,
  type KbSearchFilter,
  type KbSearchHit,
  type KbStore,
  type KbStoreStats,
  type KbUsage,
  type KbUsageDelta,
} from '@deepseek-ai/dsh-kb'

function hit(chunkId: number, tenantId = 'tenant-a', docKind: KbSearchHit['docKind'] = 'report'): KbSearchHit {
  return {
    chunkId,
    docId: Math.floor(chunkId / 10),
    tenantId,
    sourcePath: `doc-${Math.floor(chunkId / 10)}.md`,
    docKind,
    chunkIdx: chunkId % 10,
    content: `content-${chunkId}`,
  }
}

class RecordingStore implements KbStore {
  readonly id: string
  private readonly usable: boolean
  readonly putCalls: Array<{ doc: KbDocumentInput; chunks: readonly KbChunkInput[] }> = []
  readonly deleteCalls: Array<{ tenantId: string; sourcePath: string }> = []
  readonly usageCalls: Array<{ tenantId: string; delta: KbUsageDelta }> = []
  usageResult: KbUsage = { searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }
  recordUsageFailure: Error | undefined
  private readonly documents = new Map<string, { docId: number; chunks: readonly KbChunkInput[] }>()
  private nextDocId = 1
  textHits: KbSearchHit[] = []
  vectorHits: KbSearchHit[] = []

  constructor(options: { id?: string; usable?: boolean } = {}) {
    this.id = options.id ?? 'memory'
    this.usable = options.usable ?? true
  }

  available(): boolean {
    return this.usable
  }

  async putDocument(doc: KbDocumentInput, chunks: readonly KbChunkInput[]): Promise<KbIngestResult> {
    this.putCalls.push({ doc, chunks: [...chunks] })
    const key = `${doc.tenantId}\0${doc.sourcePath}`
    const existing = this.documents.get(key)
    const docId = existing?.docId ?? this.nextDocId++
    this.documents.set(key, { docId, chunks })
    const embedModel = chunks.find(c => c.embedModel !== undefined)?.embedModel
    return {
      docId,
      chunks: chunks.length,
      embedded: chunks.some(c => c.embedding !== null),
      ...(embedModel !== undefined ? { embedModel } : {}),
    }
  }

  async deleteDocument(tenantId: string, sourcePath: string): Promise<boolean> {
    this.deleteCalls.push({ tenantId, sourcePath })
    return this.documents.delete(`${tenantId}\0${sourcePath}`)
  }

  async textSearch(
    _query: string,
    tenantId: string | undefined,
    k: number,
    filter: KbSearchFilter | undefined,
  ): Promise<KbSearchHit[]> {
    return this.textHits
      .filter(h => tenantId === undefined || h.tenantId === tenantId)
      .filter(h => filter?.docKind === undefined || h.docKind === filter.docKind)
      .slice(0, k)
  }

  async vectorSearch(
    _vector: Float32Array,
    tenantId: string | undefined,
    k: number,
    filter: KbSearchFilter | undefined,
  ): Promise<KbSearchHit[]> {
    return this.vectorHits
      .filter(h => tenantId === undefined || h.tenantId === tenantId)
      .filter(h => filter?.docKind === undefined || h.docKind === filter.docKind)
      .slice(0, k)
  }

  async recordUsage(tenantId: string, delta: KbUsageDelta): Promise<void> {
    if (this.recordUsageFailure !== undefined) throw this.recordUsageFailure
    this.usageCalls.push({ tenantId, delta })
  }

  async usage(_tenantId: string): Promise<KbUsage> {
    return this.usageResult
  }

  async stats(tenantId: string | undefined): Promise<KbStoreStats> {
    const entries = [...this.documents.values()].filter(({ chunks }) => {
      if (tenantId === undefined) return true
      return chunks.length > 0
    })
    const chunks = entries.flatMap(e => [...e.chunks])
    return {
      documents: entries.length,
      chunks: chunks.length,
      embeddedChunks: chunks.filter(c => c.embedding !== null).length,
    }
  }
}

class FakeEmbed implements EmbedProvider {
  readonly id = 'fake'
  readonly modelId = 'model-a'
  readonly dimensions = 3
  private readonly ok: boolean
  failure: unknown
  shortOutput = false
  readonly calls: readonly string[][] = []
  private readonly seen: string[][] = []

  constructor(options: { usable?: boolean } = {}) {
    this.ok = options.usable ?? true
  }

  available(): boolean {
    return this.ok
  }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    if (this.failure !== undefined) throw this.failure
    this.seen.push([...texts])
    if (this.shortOutput) return []
    return texts.map((_, i) => new Float32Array([i % 3, 1, 0]))
  }

  batches(): readonly string[][] {
    return this.seen
  }
}

async function runtime(options: { config?: KbRuntimeConfig } = {}): Promise<{ ctx: Context; kb: KbRuntime }> {
  const ctx = new Context()
  await ctx.plugin(KbRuntime, options.config)
  return { ctx, kb: ctx.kb }
}

describe('provider registration', () => {
  it('registers and unregisters a store provider', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    const dispose = kb.registerStoreProvider(store)
    await kb.stats()
    dispose()
    await expect(kb.stats()).rejects.toThrow(/no usable knowledge-base store/i)
  })

  it('registers and unregisters an embed provider', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    const dispose = kb.registerEmbedProvider(embed)
    const result = await kb.search({ query: 'q' })
    expect(result.mode).toBe('hybrid')
    dispose()
    const degraded = await kb.search({ query: 'q' })
    expect(degraded.mode).toBe('text')
  })

  it('rejects a duplicate store provider id', async () => {
    const { kb } = await runtime()
    kb.registerStoreProvider(new RecordingStore())
    expect(() => kb.registerStoreProvider(new RecordingStore())).toThrow(KbError)
    expect(() => kb.registerStoreProvider(new RecordingStore())).toThrow(/already registered/)
  })

  it('rejects a duplicate embed provider id', async () => {
    const { kb } = await runtime()
    kb.registerEmbedProvider(new FakeEmbed())
    expect(() => kb.registerEmbedProvider(new FakeEmbed())).toThrow(/already registered/)
  })
})

describe('store selection', () => {
  it('uses the configured registered store', async () => {
    const { kb } = await runtime({ config: { storeProvider: 'memory' } })
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    await kb.stats()
    expect(store.putCalls).toHaveLength(0)
  })

  it('rejects a configured store id that is not registered', async () => {
    const { kb } = await runtime({ config: { storeProvider: 'ghost' } })
    await expect(kb.stats()).rejects.toThrow(/"ghost".*not registered/i)
  })

  it('rejects a configured store id that is registered but unavailable', async () => {
    const { kb } = await runtime({ config: { storeProvider: 'broken' } })
    kb.registerStoreProvider(new RecordingStore({ id: 'broken', usable: false }))
    await expect(kb.stats()).rejects.toThrow(/"broken".*unavailable/i)
  })

  it('auto-selects the single usable store when nothing is configured', async () => {
    const { kb } = await runtime()
    kb.registerStoreProvider(new RecordingStore({ usable: false }))
    const usable = new RecordingStore({ id: 'usable' })
    kb.registerStoreProvider(usable)
    await kb.stats()
    expect(usable.putCalls).toHaveLength(0)
  })

  it('rejects an ambiguous unconfigured store set', async () => {
    const { kb } = await runtime()
    kb.registerStoreProvider(new RecordingStore({ id: 'a' }))
    kb.registerStoreProvider(new RecordingStore({ id: 'b' }))
    await expect(kb.stats()).rejects.toThrow(/multiple usable knowledge-base stores/i)
  })

  it('rejects when no usable store exists', async () => {
    const { kb } = await runtime()
    kb.registerStoreProvider(new RecordingStore({ usable: false }))
    await expect(kb.stats()).rejects.toThrow(/no usable knowledge-base store/i)
  })
})

describe('embed selection', () => {
  it('rejects a configured embed id that is not registered', async () => {
    const { kb } = await runtime({ config: { embedProvider: 'ghost' } })
    kb.registerStoreProvider(new RecordingStore())
    await expect(kb.search({ query: 'q' })).rejects.toThrow(/"ghost".*not registered/i)
  })

  it('degrades to text mode when the configured embed provider is unavailable', async () => {
    const { kb } = await runtime({ config: { embedProvider: 'fake' } })
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    kb.registerEmbedProvider(new FakeEmbed({ usable: false }))
    const result = await kb.search({ query: 'q' })
    expect(result.mode).toBe('text')
    expect(result.embedModel).toBeUndefined()
  })

  it('degrades to text mode when no embed provider is registered', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const result = await kb.search({ query: 'q' })
    expect(result.mode).toBe('text')
  })
})

describe('ingest', () => {
  it('chunks, embeds, and stores a document in hybrid mode', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    kb.registerEmbedProvider(embed)
    const result = await kb.ingest({
      tenantId: 'hongfa-food',
      sourcePath: 'notes/a.md',
      docKind: 'meeting',
      content: '# 标题\n\n第一段内容。\n\n第二段内容。',
    })
    expect(result.embedded).toBe(true)
    expect(result.embedModel).toBe('fake:model-a')
    expect(result.chunks).toBeGreaterThan(0)
    const call = store.putCalls[0]!
    expect(call.doc.tenantId).toBe('hongfa-food')
    expect(call.doc.sourcePath).toBe('notes/a.md')
    expect(call.chunks[0]?.embedding).toBeInstanceOf(Float32Array)
    expect(call.chunks[0]?.embedModel).toBe('fake:model-a')
    expect(call.chunks.every(c => c.content.length > 0)).toBe(true)
    expect(embed.batches()[0]?.[0]).toContain('第一段内容')
  })

  it('stores null embeddings in degraded mode', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const result = await kb.ingest({
      tenantId: 't',
      sourcePath: 'a.md',
      docKind: 'other',
      content: '正文。',
    })
    expect(result.embedded).toBe(false)
    expect(result.embedModel).toBeUndefined()
    const call = store.putCalls[0]!
    expect(call.chunks[0]?.embedding).toBeNull()
    expect(call.chunks[0]?.embedModel).toBeUndefined()
  })

  it('re-ingesting the same identity replaces through the store', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const first = await kb.ingest({ tenantId: 't', sourcePath: 'a.md', docKind: 'other', content: '一次。' })
    const second = await kb.ingest({ tenantId: 't', sourcePath: 'a.md', docKind: 'other', content: '二次。' })
    expect(store.putCalls).toHaveLength(2)
    expect(second.docId).toBe(first.docId)
  })

  it('wraps an embed-provider failure as a KbError', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    embed.failure = new Error('network down')
    kb.registerEmbedProvider(embed)
    await expect(kb.ingest({ tenantId: 't', sourcePath: 'a.md', docKind: 'other', content: '正文。' }))
      .rejects.toMatchObject({ code: 'KB_EMBED_FAILED' })
    expect(store.putCalls).toHaveLength(0)
  })

  it('leaves the store and the counters untouched when the embed provider returns short output', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    embed.shortOutput = true
    kb.registerEmbedProvider(embed)
    await expect(kb.ingest({ tenantId: 't', sourcePath: 'a.md', docKind: 'other', content: '正文。' }))
      .rejects.toMatchObject({ code: 'KB_EMBED_FAILED' })
    expect(store.putCalls).toHaveLength(0)
    expect(store.usageCalls).toHaveLength(0)
  })

  it('rejects an already-aborted signal before any provider work', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const controller = new AbortController()
    controller.abort()
    await expect(kb.ingest({ tenantId: 't', sourcePath: 'a.md', docKind: 'other', content: 'x' }, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(store.putCalls).toHaveLength(0)
  })
})

describe('search', () => {
  it('returns the text ranking alone in degraded mode', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.textHits = [hit(1), hit(2), hit(3)]
    kb.registerStoreProvider(store)
    const result = await kb.search({ query: '白糖' })
    expect(result.mode).toBe('text')
    expect(result.results.map(h => h.chunkId)).toEqual([1, 2, 3])
  })

  it('degrades to the text ranking when the embed provider fails at runtime', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.textHits = [hit(1), hit(2)]
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    embed.failure = new Error('provider outage')
    kb.registerEmbedProvider(embed)
    const result = await kb.search({ query: '白糖' })
    expect(result.mode).toBe('text')
    expect(result.results.map(h => h.chunkId)).toEqual([1, 2])
    // Ingest keeps failing loud on the same provider fault.
    await expect(kb.ingest({ tenantId: 'tenant-a', sourcePath: 'a.md', docKind: 'report', content: '# x' }))
      .rejects.toMatchObject({ code: 'KB_EMBED_FAILED' })
  })

  it('degrades a search whose embed provider rejects with a non-Error value', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.textHits = [hit(1), hit(2)]
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    embed.failure = 'plain outage'
    kb.registerEmbedProvider(embed)
    const result = await kb.search({ query: 'q' })
    expect(result.mode).toBe('text')
    expect(result.results.map(h => h.chunkId)).toEqual([1, 2])
  })

  it('fuses text and vector rankings through RRF in hybrid mode', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.textHits = [hit(1), hit(2), hit(3)]
    store.vectorHits = [hit(3), hit(4)]
    kb.registerStoreProvider(store)
    kb.registerEmbedProvider(new FakeEmbed())
    const result = await kb.search({ query: '白糖' })
    expect(result.mode).toBe('hybrid')
    expect(result.embedModel).toBe('fake:model-a')
    expect(result.results.map(h => h.chunkId)).toEqual([3, 1, 2, 4])
  })

  it('applies the request result cap over the configured default', async () => {
    const { kb } = await runtime({ config: { maxResults: 2 } })
    const store = new RecordingStore()
    store.textHits = [hit(1), hit(2), hit(3)]
    kb.registerStoreProvider(store)
    const capped = await kb.search({ query: 'q' })
    expect(capped.results).toHaveLength(2)
    const widened = await kb.search({ query: 'q', maxResults: 3 })
    expect(widened.results).toHaveLength(3)
  })

  it('forwards tenant and doc-kind filters to both paths', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.textHits = [hit(1, 'tenant-a', 'report'), hit(2, 'tenant-b', 'regulation')]
    store.vectorHits = [hit(3, 'tenant-a', 'regulation')]
    kb.registerStoreProvider(store)
    kb.registerEmbedProvider(new FakeEmbed())
    const result = await kb.search({ query: 'q', tenantId: 'tenant-a', docKind: 'regulation' })
    expect(result.results.map(h => h.chunkId)).toEqual([3])
  })

  it('rejects an already-aborted signal before any provider work', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const controller = new AbortController()
    controller.abort()
    await expect(kb.search({ query: 'q' }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('keeps every hit when no threshold is configured', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.textHits = [hit(1), hit(2)]
    store.vectorHits = [hit(2)]
    kb.registerStoreProvider(store)
    kb.registerEmbedProvider(new FakeEmbed())
    const result = await kb.search({ query: 'q' })
    expect(result.results.map(h => h.chunkId)).toEqual([2, 1])
  })

  it('drops hybrid hits below the threshold while keeping dual-path hits above the single-path maximum', async () => {
    // With rrfK 60: chunk 3 scores 2/61 (both paths), chunks 1 and 4 score
    // 1/62 (one path at rank 1), chunk 2 scores 1/63.
    const { kb } = await runtime({ config: { minRelevanceScore: 0.02 } })
    const store = new RecordingStore()
    store.textHits = [hit(1), hit(2), hit(3)]
    store.vectorHits = [hit(3), hit(4)]
    kb.registerStoreProvider(store)
    kb.registerEmbedProvider(new FakeEmbed())
    const result = await kb.search({ query: 'q' })
    expect(result.mode).toBe('hybrid')
    expect(result.results.map(h => h.chunkId)).toEqual([3])
  })

  it('keeps a hit whose fused score exactly equals the threshold and drops strictly lower scores', async () => {
    // With rrfK 60: chunk 3 scores 2/61, chunk 1 scores 1/61, chunk 2 scores
    // 1/62 — exactly the threshold, so it stays — and chunk 4 scores 1/64,
    // strictly below, so it drops.
    const { kb } = await runtime({ config: { minRelevanceScore: 1 / 62 } })
    const store = new RecordingStore()
    store.textHits = [hit(1), hit(2), hit(3), hit(4)]
    store.vectorHits = [hit(3)]
    kb.registerStoreProvider(store)
    kb.registerEmbedProvider(new FakeEmbed())
    const result = await kb.search({ query: 'q' })
    expect(result.results.map(h => h.chunkId)).toEqual([3, 1, 2])
  })

  it('applies the same threshold to the text-only ranking through single-path RRF scores', async () => {
    const { kb } = await runtime({ config: { minRelevanceScore: 1 / 62 } })
    const store = new RecordingStore()
    store.textHits = [hit(1), hit(2), hit(3)]
    kb.registerStoreProvider(store)
    const result = await kb.search({ query: 'q' })
    expect(result.mode).toBe('text')
    expect(result.results.map(h => h.chunkId)).toEqual([1, 2])
  })

  it('resolves to zero results without changing mode when the threshold filters everything', async () => {
    const hybridRuntime = await runtime({ config: { minRelevanceScore: 1 } })
    const hybridStore = new RecordingStore()
    hybridStore.textHits = [hit(1), hit(2)]
    hybridStore.vectorHits = [hit(2)]
    hybridRuntime.kb.registerStoreProvider(hybridStore)
    hybridRuntime.kb.registerEmbedProvider(new FakeEmbed())
    const hybrid = await hybridRuntime.kb.search({ query: 'q' })
    expect(hybrid.mode).toBe('hybrid')
    expect(hybrid.results).toEqual([])
    const textRuntime = await runtime({ config: { minRelevanceScore: 1 } })
    const textStore = new RecordingStore()
    textStore.textHits = [hit(1), hit(2)]
    textRuntime.kb.registerStoreProvider(textStore)
    const textOnly = await textRuntime.kb.search({ query: 'q' })
    expect(textOnly.mode).toBe('text')
    expect(textOnly.results).toEqual([])
  })

  it('rejects a negative minRelevanceScore at config load', async () => {
    const ctx = new Context()
    await expect(ctx.plugin(KbRuntime, { minRelevanceScore: -0.01 })).rejects.toThrow()
    await ctx.fiber.dispose()
  })
})

describe('stats and deleteDocument', () => {
  it('reports store counts plus embed-route observability', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const degraded = await kb.stats()
    expect(degraded.embedAvailable).toBe(false)
    kb.registerEmbedProvider(new FakeEmbed())
    const hybrid = await kb.stats()
    expect(hybrid.embedAvailable).toBe(true)
    expect(hybrid.embedModel).toBe('fake:model-a')
  })

  it('deletes a document through the resolved store', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    await kb.deleteDocument('t', 'a.md')
    expect(store.deleteCalls).toEqual([{ tenantId: 't', sourcePath: 'a.md' }])
  })

  it('rejects an already-aborted signal before deletion', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const controller = new AbortController()
    controller.abort()
    await expect(kb.deleteDocument('t', 'a.md', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(store.deleteCalls).toHaveLength(0)
  })
})

describe('resolved configuration', () => {
  it('applies every explicitly configured tunable over its default', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime, {
      storeProvider: 'memory',
      embedProvider: 'fake',
      chunkMaxTokens: 4,
      chunkOverlapTokens: 0,
      rrfK: 1,
      vectorTopK: 5,
      textTopK: 5,
      maxResults: 1,
    })
    const store = new RecordingStore()
    store.textHits = [hit(1), hit(2)]
    store.vectorHits = [hit(1)]
    ctx.kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    ctx.kb.registerEmbedProvider(embed)
    const result = await ctx.kb.ingest({
      tenantId: 't',
      sourcePath: 'a.md',
      docKind: 'other',
      content: '第一段内容。第二段内容。第三段内容。',
    })
    // chunkMaxTokens 4 splits the three sentences into separate chunks.
    expect(result.chunks).toBe(3)
    const search = await ctx.kb.search({ query: '内容', maxResults: 3 })
    // The configured maxResults 1 caps the un-capped request path's default.
    expect(search.mode).toBe('hybrid')
    const capped = await ctx.kb.search({ query: '内容' })
    expect(capped.results).toHaveLength(1)
  })
})

describe('configured embed provider', () => {
  it('participates in hybrid retrieval when configured and available', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime, { embedProvider: 'fake' })
    const store = new RecordingStore()
    store.textHits = [hit(1)]
    store.vectorHits = [hit(1)]
    ctx.kb.registerStoreProvider(store)
    ctx.kb.registerEmbedProvider(new FakeEmbed())
    const result = await ctx.kb.search({ query: 'q' })
    expect(result.mode).toBe('hybrid')
    expect(result.embedModel).toBe('fake:model-a')
  })

  it('degrades a search whose embed provider fails to the text ranking', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.textHits = [hit(1)]
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    embed.failure = new Error('embedding unavailable')
    kb.registerEmbedProvider(embed)
    const result = await kb.search({ query: 'q' })
    expect(result.mode).toBe('text')
    expect(result.results.map(h => h.chunkId)).toEqual([1])
  })

  it('rejects an already-aborted signal before stats', async () => {
    const { kb } = await runtime()
    kb.registerStoreProvider(new RecordingStore())
    const controller = new AbortController()
    controller.abort()
    await expect(kb.stats(undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('degraded traversal', () => {
  it('skips a registered but unavailable embed provider during auto-selection', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.textHits = [hit(1)]
    kb.registerStoreProvider(store)
    kb.registerEmbedProvider(new FakeEmbed({ usable: false }))
    const result = await kb.search({ query: 'q' })
    expect(result.mode).toBe('text')
  })

  it('falls back to every default when constructed without config', async () => {
    const ctx = new Context()
    const kb = new KbRuntime(ctx)
    const store = new RecordingStore()
    store.textHits = [hit(1), hit(2), hit(3), hit(4), hit(5), hit(6), hit(7), hit(8), hit(9)]
    kb.registerStoreProvider(store)
    const result = await kb.search({ query: 'q' })
    expect(result.results).toHaveLength(8)
  })
})

describe('embed output-count validation', () => {
  it('rejects an ingest whose embed provider returns too few vectors', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    embed.shortOutput = true
    kb.registerEmbedProvider(embed)
    await expect(kb.ingest({ tenantId: 't', sourcePath: 'a.md', docKind: 'other', content: '正文。' }))
      .rejects.toMatchObject({ code: 'KB_EMBED_FAILED' })
    expect(store.putCalls).toHaveLength(0)
  })

  it('degrades a search whose embed provider returns no vector', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.textHits = [hit(1)]
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    embed.shortOutput = true
    kb.registerEmbedProvider(embed)
    const result = await kb.search({ query: 'q' })
    expect(result.mode).toBe('text')
  })
})

describe('usage metering', () => {
  it('counts one ingest with its chunk and embed-text totals', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    kb.registerEmbedProvider(embed)
    const result = await kb.ingest({ tenantId: 'hongfa-food', sourcePath: 'a.md', docKind: 'other', content: '# 标题\n\n第一段正文。' })
    expect(store.usageCalls).toEqual([{
      tenantId: 'hongfa-food',
      delta: { searches: 0, ingestedDocuments: 1, ingestedChunks: result.chunks, embedTexts: result.chunks, embedTokens: 0 },
    }])
  })

  it('counts an ingest without embed texts in the degraded mode', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const result = await kb.ingest({ tenantId: 't', sourcePath: 'a.md', docKind: 'other', content: '正文内容。' })
    expect(store.usageCalls).toEqual([{
      tenantId: 't',
      delta: { searches: 0, ingestedDocuments: 1, ingestedChunks: result.chunks, embedTexts: 0, embedTokens: 0 },
    }])
  })

  it('counts one search per call, with the query embed text in hybrid mode', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.textHits = [hit(1)]
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    kb.registerEmbedProvider(embed)
    await kb.search({ query: 'q', tenantId: 't' })
    await kb.search({ query: 'q', tenantId: 't' })
    expect(store.usageCalls).toEqual([
      { tenantId: 't', delta: { searches: 1, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 1, embedTokens: 0 } },
      { tenantId: 't', delta: { searches: 1, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 1, embedTokens: 0 } },
    ])
  })

  it('counts a text-mode search without embed texts', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.textHits = [hit(1)]
    kb.registerStoreProvider(store)
    await kb.search({ query: 'q', tenantId: 't' })
    expect(store.usageCalls).toEqual([
      { tenantId: 't', delta: { searches: 1, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 } },
    ])
  })

  it('counts a degraded search without embed texts', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    kb.registerStoreProvider(store)
    const embed = new FakeEmbed()
    embed.failure = new Error('embed down')
    kb.registerEmbedProvider(embed)
    const result = await kb.search({ query: 'q', tenantId: 't' })
    expect(result.mode).toBe('text')
    expect(store.usageCalls.at(-1)?.delta).toMatchObject({ searches: 1, embedTexts: 0 })
  })

  it('keeps an ingest successful when the usage write fails', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.recordUsageFailure = new Error('metering write lost')
    kb.registerStoreProvider(store)
    const result = await kb.ingest({ tenantId: 't', sourcePath: 'a.md', docKind: 'other', content: '正文。' })
    expect(result.chunks).toBeGreaterThan(0)
    expect(store.putCalls).toHaveLength(1)
  })

  it('reads a tenant usage through the seam', async () => {
    const { kb } = await runtime()
    const store = new RecordingStore()
    store.usageResult = { searches: 4, ingestedDocuments: 2, ingestedChunks: 9, embedTexts: 11, embedTokens: 0 }
    kb.registerStoreProvider(store)
    expect(await kb.usage('hongfa-food')).toEqual(store.usageResult)
  })
})
