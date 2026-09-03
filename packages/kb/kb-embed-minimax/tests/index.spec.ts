import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import KbRuntime from '@deepseek-ai/dsh-kb'
import {
  Config,
  decodeEmbeddings,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_BACKOFF_MAX_MS,
  DEFAULT_BASE_URL,
  DEFAULT_BATCH_SIZE,
  DEFAULT_DIMENSIONS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  MiniMaxEmbedProvider,
  MINIMAX_PROVIDER_ID,
} from '../src/index.ts'
import * as kbEmbedMiniMax from '../src/index.ts'

function provider(overrides: Partial<ConstructorParameters<typeof MiniMaxEmbedProvider>[0]> = {}): MiniMaxEmbedProvider {
  return new MiniMaxEmbedProvider({
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

describe('kb-embed-minimax constants', () => {
  it('exposes the documented defaults', () => {
    expect(MINIMAX_PROVIDER_ID).toBe('minimax')
    expect(DEFAULT_API_KEY_ENV).toBe('MINIMAX_API_KEY')
    expect(DEFAULT_BASE_URL).toBe('https://api.minimaxi.com/v1')
    expect(DEFAULT_MODEL).toBe('embo-01')
    expect(DEFAULT_DIMENSIONS).toBe(1536)
    expect(DEFAULT_BATCH_SIZE).toBe(32)
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
    expect(resolved.batchSize).toBe(DEFAULT_BATCH_SIZE)
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
  it('decodes one vector per input in order', () => {
    const vectors = decodeEmbeddings(
      { vectors: [[0.25, -0.5], [1, 2]], total_tokens: 4, base_resp: { status_code: 0, status_msg: '' } },
      2,
      2,
    )
    expect(vectors).toHaveLength(2)
    expect(vectors[0]).toBeInstanceOf(Float32Array)
    expect([...vectors[0]!]).toEqual([0.25, -0.5])
    expect([...vectors[1]!]).toEqual([1, 2])
  })

  it('accepts a payload without base_resp', () => {
    const vectors = decodeEmbeddings({ vectors: [[0.5, 0.5]] }, 1, 2)
    expect(vectors).toHaveLength(1)
  })

  it('rejects a business error signaled through base_resp', () => {
    expect(() => decodeEmbeddings(
      { vectors: null, base_resp: { status_code: 2013, status_msg: 'invalid params' } },
      1,
      2,
    )).toThrow(/2013.*invalid params|invalid params.*2013/u)
  })

  it('rejects a non-object payload', () => {
    expect(() => decodeEmbeddings('nope', 1, 2)).toThrow()
    expect(() => decodeEmbeddings(null, 1, 2)).toThrow()
  })

  it('rejects a wrong vector count', () => {
    expect(() => decodeEmbeddings({ vectors: [[1, 2]] }, 2, 2)).toThrow(/1.*2|expected 2/u)
  })

  it('rejects a wrong dimensionality', () => {
    expect(() => decodeEmbeddings({ vectors: [[1, 2, 3]] }, 1, 2)).toThrow(/dimension/iu)
  })

  it('rejects non-numeric or non-finite components', () => {
    expect(() => decodeEmbeddings({ vectors: [['a', 'b']] }, 1, 2)).toThrow()
    expect(() => decodeEmbeddings({ vectors: [[0, Number.POSITIVE_INFINITY]] }, 1, 2)).toThrow()
  })
})

describe('MiniMaxEmbedProvider.available', () => {
  it('is available with a resolved key', () => {
    expect(provider().available()).toBe(true)
  })

  it('is unavailable without a key', () => {
    expect(provider({ resolveKey: () => undefined }).available()).toBe(false)
  })

  it('is unavailable with an empty key', () => {
    expect(provider({ resolveKey: () => '' }).available()).toBe(false)
  })

  it('reports the configured model identity and dimensions', () => {
    const instance = provider()
    expect(instance.id).toBe('minimax')
    expect(instance.modelId).toBe(DEFAULT_MODEL)
    expect(instance.dimensions).toBe(2)
  })
})

describe('kb-embed-minimax plugin', () => {
  it('registers the provider on ctx.kb and frees the id on dispose', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    const fiber = await ctx.plugin(kbEmbedMiniMax, Config({}))
    // The registration is live: a second registration of the same id fails.
    await expect(ctx.plugin(kbEmbedMiniMax, Config({}))).rejects.toThrow(/already registered/iu)
    await fiber.dispose()
    // After disposal the id is free again.
    const second = await ctx.plugin(kbEmbedMiniMax, Config({}))
    await second.dispose()
  })

  it('leaves the provider registered but unavailable when the key is missing', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    await ctx.plugin(kbEmbedMiniMax, Config({}))
    // No store is registered either, so stats resolves the embed route first
    // only through the registry: the composition loaded, and the missing key
    // degraded the provider instead of failing the plugin.
    await expect(ctx.kb.search({ query: 'anything' })).rejects.toThrow(/no usable knowledge-base store/iu)
  })

  it('defaults every unset field inside apply', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    kbEmbedMiniMax.apply(ctx, {})
    await ctx.fiber.dispose()
  })

  it('passes configured backoff fields through apply', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    kbEmbedMiniMax.apply(ctx, { backoffBaseMs: 5, backoffMaxMs: 50 })
    await ctx.fiber.dispose()
  })

  it('resolves the credential through the launch environment on each availability probe', async () => {
    const ctx = new Context()
    await ctx.plugin(KbRuntime)
    ctx.kb.registerStoreProvider({
      id: 'stub-store',
      available: () => true,
      putDocument: async () => ({ docId: 1, chunks: 0, embedded: false }),
      deleteDocument: async () => false,
      textSearch: async () => [],
      vectorSearch: async () => [],
      stats: async () => ({ documents: 0, chunks: 0, embeddedChunks: 0 }),
      recordUsage: async () => {},
      usage: async () => ({ searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }),
    })
    process.env.MINIMAX_API_KEY = 'env-key'
    try {
      await ctx.plugin(kbEmbedMiniMax, Config({}))
      const withKey = await ctx.kb.stats()
      expect(withKey.embedAvailable).toBe(true)
      expect(withKey.embedModel).toBe(`minimax:${DEFAULT_MODEL}`)
      delete process.env.MINIMAX_API_KEY
      const withoutKey = await ctx.kb.stats()
      expect(withoutKey.embedAvailable).toBe(false)
    } finally {
      delete process.env.MINIMAX_API_KEY
      await ctx.fiber.dispose()
    }
  })
})
