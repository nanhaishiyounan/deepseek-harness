/**
 * DashScope embed provider for the knowledge-base seam: `text-embedding-v4`
 * through the OpenAI-compatible `/embeddings` endpoint, batched, retried with
 * exponential backoff, and credential-gated — a missing credential makes the
 * provider unavailable, which is the seam's documented text-only degradation.
 * @module @deepseek-ai/dsh-kb-embed-dashscope
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type { EmbedProvider } from '@deepseek-ai/dsh-kb'
import {
  assertBackoffOrdered,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_BACKOFF_MAX_MS,
  type EmbedRetryOptions,
  HttpEmbedError,
  withEmbedRetries,
} from '@deepseek-ai/dsh-kb-embed-shared'

export { DEFAULT_BACKOFF_BASE_MS, DEFAULT_BACKOFF_MAX_MS }

/** Cordis plugin name used by loader diagnostics. */
export const name = 'kb-embed-dashscope'
/** Services required by the embed provider. */
export const inject = ['kb']

/** Registry id of this provider. */
export const DASHSCOPE_PROVIDER_ID = 'dashscope'
/** Default credential reference resolved through the launch environment. */
export const DEFAULT_API_KEY_ENV = 'DASHSCOPE_API_KEY'
/** Default OpenAI-compatible DashScope endpoint. */
export const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
/** Default embedding model. */
export const DEFAULT_MODEL = 'text-embedding-v4'
/** Default and only supported vector dimensionality. */
export const DEFAULT_DIMENSIONS = 1024
/** DashScope accepts at most ten input texts per embeddings request. */
export const MAX_BATCH_SIZE = 10
/* jscpd:ignore-start */
// jscpd: intentional symmetry — the per-vendor embed provider template;
// the extracted transport core lives in dsh-kb-embed-shared
// (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
/** Default per-request timeout. */
export const DEFAULT_TIMEOUT_MS = 30_000
/** Default retry budget for transient failures. */
export const DEFAULT_MAX_RETRIES = 3

/** Plugin configuration. */
export interface Config {
  /** Credential reference resolved per request from the launch environment. */
  apiKeyEnv?: string
  /** OpenAI-compatible DashScope base URL. */
  baseURL?: string
  /** Embedding model id. */
  model?: string
  /** Vector dimensionality every result must match. */
  dimensions?: number
  /** Input texts per embeddings request (DashScope caps at 10). */
  batchSize?: number
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number
  /** Retries for transient failures (HTTP 429/5xx and network errors). */
  maxRetries?: number
  /** Base delay of the exponential retry backoff in milliseconds; doubles per attempt. */
  backoffBaseMs?: number
  /** Cap on one backoff delay in milliseconds. */
  backoffMaxMs?: number
}

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(DEFAULT_BASE_URL),
  model: z.string().default(DEFAULT_MODEL),
  dimensions: z.number().step(1).min(1).default(DEFAULT_DIMENSIONS),
  batchSize: z.number().step(1).min(1).max(MAX_BATCH_SIZE).default(MAX_BATCH_SIZE),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
  maxRetries: z.number().step(1).min(0).default(DEFAULT_MAX_RETRIES),
  backoffBaseMs: z.number().step(1).min(1).default(DEFAULT_BACKOFF_BASE_MS),
  backoffMaxMs: z.number().step(1).min(1).max(DEFAULT_BACKOFF_MAX_MS).default(DEFAULT_BACKOFF_MAX_MS),
})

/** Resolved provider options after schemastery applies every field default. */
export interface DashScopeEmbedOptions extends EmbedRetryOptions {
/* jscpd:ignore-end */
  readonly baseURL: string
  readonly model: string
  readonly dimensions: number
  readonly batchSize: number
  readonly timeoutMs: number
  /** Synchronous credential lookup; `undefined` means the provider is unavailable. */
  readonly resolveKey: () => string | undefined
  /** Fetch implementation, overridable in tests. */
  readonly fetch: typeof globalThis.fetch
}

/**
 * The DashScope `EmbedProvider`. `available()` is the cheap synchronous
 * credential check that drives the seam's degraded mode; the network is only
 * touched inside `embed()`.
 */
export class DashScopeEmbedProvider implements EmbedProvider {
  readonly id = DASHSCOPE_PROVIDER_ID
  readonly modelId: string
  readonly dimensions: number
  private readonly options: DashScopeEmbedOptions

  /* jscpd:ignore-start */
  // jscpd: intentional symmetry — the per-vendor embed provider template;
  // the extracted transport core lives in dsh-kb-embed-shared
  // (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
  constructor(options: DashScopeEmbedOptions) {
    assertBackoffOrdered(options.backoffBaseMs, options.backoffMaxMs)
    this.modelId = options.model
    this.dimensions = options.dimensions
    this.options = options
  }

  available(): boolean {
    const key = this.options.resolveKey()
    return key !== undefined && key.length > 0
  }

  async embed(texts: readonly string[], signal?: AbortSignal): Promise<Float32Array[]> {
    if (texts.length === 0) throw new Error('kb-embed-dashscope: embed requires a non-empty batch of texts')
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('the operation was aborted', { cause: signal.reason })
    const key = this.options.resolveKey()
    if (key === undefined || key.length === 0) {
      throw new Error(`kb-embed-dashscope: no credential resolved for ${this.id}; set the configured apiKeyEnv in the launch environment`)
    }
    const vectors: Float32Array[] = []
    for (let start = 0; start < texts.length; start += this.options.batchSize) {
      const batch = texts.slice(start, start + this.options.batchSize)
      vectors.push(...await withEmbedRetries(
        () => this.requestOnce(batch, signal),
        this.options,
        signal,
        'kb-embed-dashscope',
      ))
    }
    return vectors
  }

  /** Perform exactly one embeddings request and decode its response. */
  private async requestOnce(texts: readonly string[], signal: AbortSignal | undefined): Promise<Float32Array[]> {
    const perRequest = AbortSignal.timeout(this.options.timeoutMs)
    const combined = signal === undefined ? perRequest : AbortSignal.any([signal, perRequest])
    let response: Response
    try {
      response = await this.options.fetch(`${this.options.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${this.options.resolveKey()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model,
          /* jscpd:ignore-end */
          input: [...texts],
          dimensions: this.options.dimensions,
        }),
        signal: combined,
      })
    } catch (error: unknown) {
      if (signal?.aborted) throw signal.reason
      if (perRequest.aborted) {
        throw new Error(`kb-embed-dashscope: embeddings request timed out after ${this.options.timeoutMs}ms`, { cause: error })
      }
      throw error
    }
    const raw = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      throw new HttpEmbedError(`kb-embed-dashscope: embeddings response was not JSON (HTTP ${response.status})`, response.status)
    }
    /* jscpd:ignore-start */
    // jscpd: intentional symmetry — the per-vendor embed provider template;
    // the extracted transport core lives in dsh-kb-embed-shared
    // (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
    if (!response.ok) {
      const message = errorMessage(payload) ?? `HTTP ${response.status}`
      throw new HttpEmbedError(`kb-embed-dashscope: embeddings request failed: ${message}`, response.status)
    }
    return decodeEmbeddings(payload, texts.length, this.options.dimensions)
  }
}

/** Extract the human-readable message from an OpenAI-style error body. */
function errorMessage(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const record = payload as Record<string, unknown>
  const error = record.error
  /* jscpd:ignore-end */
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message
    if (typeof message === 'string' && message.length > 0) return message
  }
  // DashScope's native envelope spells the message at the top level.
  if (typeof record.message === 'string' && record.message.length > 0) return record.message
  return undefined
}

/**
 * Validate and decode one OpenAI-compatible embeddings response at the wire
 * boundary.
 * @param payload - the parsed JSON response body.
 * @param expectedCount - the batch size the request sent.
 * @param dimensions - the configured dimensionality.
 * @returns one vector per input, in input order.
 */
export function decodeEmbeddings(payload: unknown, expectedCount: number, dimensions: number): Float32Array[] {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('kb-embed-dashscope: embeddings response is not an object')
  }
  const { data } = payload as { data: unknown }
  if (!Array.isArray(data)) {
    throw new Error('kb-embed-dashscope: embeddings response has no data array')
  }
  if (data.length !== expectedCount) {
    throw new Error(`kb-embed-dashscope: embeddings response returned ${data.length} vectors for ${expectedCount} texts`)
  }
  const byIndex = new Map<number, Float32Array>()
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('kb-embed-dashscope: embeddings entry is not an object')
    }
    const { index, embedding } = entry as { index: unknown; embedding: unknown }
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= expectedCount) {
      throw new Error(`kb-embed-dashscope: embeddings entry has an out-of-range index ${String(index)}`)
    }
    if (byIndex.has(index)) {
      throw new Error(`kb-embed-dashscope: embeddings entry repeats index ${index}`)
    }
    if (!Array.isArray(embedding)) {
      throw new Error(`kb-embed-dashscope: embeddings entry ${index} has no embedding array`)
    }
    if (embedding.length !== dimensions) {
      throw new Error(`kb-embed-dashscope: embeddings vector ${index} has dimension ${embedding.length}, expected ${dimensions}`)
    }
    for (const component of embedding) {
      if (typeof component !== 'number' || !Number.isFinite(component)) {
        throw new Error(`kb-embed-dashscope: embeddings vector ${index} has a non-finite component`)
      }
    }
    byIndex.set(index, Float32Array.from(embedding as number[]))
  }
  const ordered: Float32Array[] = []
  for (let index = 0; index < expectedCount; index += 1) {
    const vector = byIndex.get(index)
    /* v8 ignore next 3 -- unreachable by the checks above: data.length ===
       expectedCount with unique integer indices in [0, expectedCount) is a
       bijection, so every index is present; kept as a hard guard. */
    if (vector === undefined) {
      throw new Error(`kb-embed-dashscope: embeddings response is missing index ${index}`)
    }
    ordered.push(vector)
  }
  return ordered
}

/**
 * Register the DashScope embed provider on `ctx.kb`. Credential resolution is
 * the synchronous launch-environment lookup over `apiKeyEnv`; a missing key
 * leaves the provider registered but unavailable, which the seam reports as
 * text-only degraded retrieval.
 * @param ctx - context whose `kb` service receives the registration.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const ref = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
  const provider = new DashScopeEmbedProvider({
    baseURL: config.baseURL ?? DEFAULT_BASE_URL,
    /* jscpd:ignore-start */
    // jscpd: intentional symmetry — the per-vendor embed provider template;
    // the extracted transport core lives in dsh-kb-embed-shared
    // (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
    model: config.model ?? DEFAULT_MODEL,
    dimensions: config.dimensions ?? DEFAULT_DIMENSIONS,
    batchSize: config.batchSize ?? MAX_BATCH_SIZE,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    backoffBaseMs: config.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS,
    backoffMaxMs: config.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS,
    resolveKey: () => launchEnvironmentOf(ctx).get(ref)?.value,
    fetch: globalThis.fetch,
    debug: ctx.logger.debug.bind(ctx.logger),
  })
  ctx.kb.registerEmbedProvider(provider)
}
/* jscpd:ignore-end */
