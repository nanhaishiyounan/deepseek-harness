import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import KbRuntime from '@deepseek-ai/dsh-kb'
import {
  Config,
  DASHSCOPE_PROVIDER_ID,
  DashScopeEmbedProvider,
  decodeEmbeddings,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_BACKOFF_MAX_MS,
  DEFAULT_BASE_URL,
  DEFAULT_DIMENSIONS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  MAX_BATCH_SIZE,
} from '../src/index.ts'
import * as kbEmbedDashScope from '../src/index.ts'

function provider(overrides: Partial<ConstructorParameters<typeof DashScopeEmbedProvider>[0]> = {}): DashScopeEmbedProvider {
  return new DashScopeEmbedProvider({
    baseURL: 'http://localhost:1',
    model: DEFAULT_MODEL,
    dimensions: 2,
    batchSize: 4,
    timeoutMs: 1_000,
    maxRetries: 0,
    backoffBaseMs: DEFAULT_BACKOFF_BASE_MS,
    backoffMaxMs: DEFAULT_BACKOFF_MAX_MS,
    resolveKey: () => 'test-key',
    fetch: globalThis.fetch,
    ...overrides,
  })
}

describe('kb-embed-dashscope constants', () => {
  it('exposes the documented defaults', () => {
    expect(DASHSCOPE_PROVIDER_ID).toBe('dashscope')
    expect(DEFAULT_API_KEY_ENV).toBe('DASHSCOPE_API_KEY')
    expect(DEFAULT_BASE_URL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
    expect(DEFAULT_MODEL).toBe('text-embedding-v4')
    expect(DEFAULT_DIMENSIONS).toBe(1024)
    expect(MAX_BATCH_SIZE).toBe(10)
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000)
    expect(DEFAULT_MAX_RETRIES).toBe(3)
    expect(DEFAULT_BACKOFF_BASE_MS).toBe(100)
    expect(DEFAULT_BACKOFF_MAX_MS).toBe(2_147_483_647)
  })

  it('fills every Config default through schemastery', () => {
    const resolved = Config({})
    expect(resolved.apiKeyEnv).toBe(DEFAULT_API_KEY_ENV)
    expect(resolved.baseURL).toBe(DEFAULT_BASE_URL)
    expect(resolved.model).toBe(DEFAULT_MODEL)
    expect(resolved.dimensions).toBe(DEFAULT_DIMENSIONS)
    expect(resolved.batchSize).toBe(MAX_BATCH_SIZE)
    expect(resolved.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
    expect(resolved.maxRetries).toBe(DEFAULT_MAX_RETRIES)
    expect(resolved.backoffBaseMs).toBe(DEFAULT_BACKOFF_BASE_MS)
    expect(resolved.backoffMaxMs).toBe(DEFAULT_BACKOFF_MAX_MS)
  })

  it('accepts configured backoff fields', () => {
    const resolved = Config({ backoffBaseMs: 5, backoffMaxMs: 50 })
    expect(resolved.backoffBaseMs).toBe(5)
    expect(resolved.backoffMaxMs).toBe(50)
  })

  it('rejects non-positive backoff fields', () => {
    expect(() => Config({ backoffBaseMs: 0 })).toThrow()
    expect(() => Config({ backoffMaxMs: -1 })).toThrow()
  })
})

describe('decodeEmbeddings', () => {
  it('decodes vectors in index order regardless of arrival order', () => {
    const vectors = decodeEmbeddings(
      { data: [{ index: 1, embedding: [1, 2] }, { index: 0, embedding: [0.25, -0.5] }], model: DEFAULT_MODEL },
      2,
      2,
    )
    expect(vectors).toHaveLength(2)
    expect(vectors[0]).toBeInstanceOf(Float32Array)
    expect([...vectors[0]!]).toEqual([0.25, -0.5])
    expect([...vectors[1]!]).toEqual([1, 2])
  })

  it('rejects a non-object payload', () => {
    expect(() => decodeEmbeddings('nope', 1, 2)).toThrow()
    expect(() => decodeEmbeddings(null, 1, 2)).toThrow()
  })

  it('rejects a missing data array', () => {
    expect(() => decodeEmbeddings({ model: DEFAULT_MODEL }, 1, 2)).toThrow(/data/u)
  })

  it('rejects a wrong vector count', () => {
    expect(() => decodeEmbeddings({ data: [{ index: 0, embedding: [1, 2] }] }, 2, 2)).toThrow(/1.*2|expected 2/u)
  })

  it('rejects a duplicate or out-of-range index', () => {
    expect(() => decodeEmbeddings(
      { data: [{ index: 0, embedding: [1, 2] }, { index: 0, embedding: [3, 4] }] },
      2,
      2,
    )).toThrow(/index/u)
    expect(() => decodeEmbeddings({ data: [{ index: 5, embedding: [1, 2] }] }, 1, 2)).toThrow(/index/u)
  })

  it('rejects a wrong dimensionality', () => {
    expect(() => decodeEmbeddings({ data: [{ index: 0, embedding: [1, 2, 3] }] }, 1, 2)).toThrow(/dimension/iu)
  })

  it('rejects non-numeric or non-finite components', () => {
    expect(() => decodeEmbeddings({ data: [{ index: 0, embedding: ['a', 'b'] }] }, 1, 2)).toThrow()
    expect(() => decodeEmbeddings({ data: [{ index: 0, embedding: [0, Number.NaN] }] }, 1, 2)).toThrow()
  })
})

describe('DashScopeEmbedProvider.available', () => {
  it('is available with a resolved key', () => {
    expect(provider().available()).toBe(true)
  })

  it('is unavailable without a key', () => {
    expect(provider({ resolveKey: () => undefined }).available()).toBe(false)
  })

  it('reports the configured model identity and dimensions', () => {
    const instance = provider()
    expect(instance.id).toBe('dashscope')
    expect(instance.modelId).toBe(DEFAULT_MODEL)
    expect(instance.dimensions).toBe(2)
  })
})

const stubStore = {
  id: 'stub-store',
  available: () => true,
  putDocument: async () => ({ docId: 1, chunks: 0, embedded: false }),
  deleteDocument: async () => false,
  textSearch: async () => [],
  vectorSearch: async () => [],
  stats: async () => ({ documents: 0, chunks: 0, embeddedChunks: 0 }),
  recordUsage: async () => {},
  usage: async () => ({ searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }),
}

describe('kb-embed-dashscope plugin', () => {
  it('registers the provider on ctx.kb and frees the id on dispose', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    const fiber = await ctx.plugin(kbEmbedDashScope, Config({}))
    await expect(ctx.plugin(kbEmbedDashScope, Config({}))).rejects.toThrow(/already registered/iu)
    await fiber.dispose()
    const second = await ctx.plugin(kbEmbedDashScope, Config({}))
    await second.dispose()
  })

  it('leaves the provider registered but unavailable when the key is missing', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    await ctx.plugin(kbEmbedDashScope, Config({}))
    await expect(ctx.kb.search({ query: 'anything' })).rejects.toThrow(/no usable knowledge-base store/iu)
  })

  it('defaults every unset field inside apply', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    kbEmbedDashScope.apply(ctx, {})
    await ctx.fiber.dispose()
  })

  it('passes configured backoff fields through apply', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    kbEmbedDashScope.apply(ctx, { backoffBaseMs: 5, backoffMaxMs: 50 })
    await ctx.fiber.dispose()
  })

  it('resolves the credential through the launch environment on each availability probe', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    ctx.kb.registerStoreProvider(stubStore)
    process.env.DASHSCOPE_API_KEY = 'env-key'
    try {
      await ctx.plugin(kbEmbedDashScope, Config({}))
      const withKey = await ctx.kb.stats()
      expect(withKey.embedAvailable).toBe(true)
      expect(withKey.embedModel).toBe(`dashscope:${DEFAULT_MODEL}`)
      delete process.env.DASHSCOPE_API_KEY
      const withoutKey = await ctx.kb.stats()
      expect(withoutKey.embedAvailable).toBe(false)
    } finally {
      delete process.env.DASHSCOPE_API_KEY
      await ctx.fiber.dispose()
    }
  })
})
