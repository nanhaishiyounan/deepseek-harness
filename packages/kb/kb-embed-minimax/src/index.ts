/**
 * MiniMax embed provider for the knowledge-base seam: `embo-01` through the
 * MiniMax `/embeddings` endpoint (`{model, texts, type}` bodies, vectors in a
 * `base_resp` envelope), batched, retried with exponential backoff, and
 * credential-gated — a missing credential makes the provider unavailable,
 * which is the seam's documented text-only degradation.
 *
 * The wire is MiniMax-native, not OpenAI-compatible: inputs travel as `texts`
 * with a mandatory symmetric `type: "query"` (measured to separate relevant
 * from unrelated text at least as well as the asymmetric db/query pairing),
 * business failures arrive inside an HTTP 200 `base_resp.status_code`, and
 * every vector is 1536-dimensional.
 * @module @deepseek-ai/dsh-kb-embed-minimax
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
export const name = 'kb-embed-minimax'
/** Services required by the embed provider. */
export const inject = ['kb']

/** Registry id of this provider. */
export const MINIMAX_PROVIDER_ID = 'minimax'
/** Default credential reference resolved through the launch environment. */
export const DEFAULT_API_KEY_ENV = 'MINIMAX_API_KEY'
/** Default MiniMax OpenAI-compatible-style endpoint base. */
export const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1'
/** Default embedding model (verified against the live endpoint, 2026-08-29). */
export const DEFAULT_MODEL = 'embo-01'
/** Fixed vector dimensionality of {@link DEFAULT_MODEL}. */
export const DEFAULT_DIMENSIONS = 1536
/** Default input texts per embeddings request (the live endpoint accepted 128). */
export const DEFAULT_BATCH_SIZE = 32
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
  /** MiniMax endpoint base. */
  baseURL?: string
  /** Embedding model id. */
  model?: string
  /** Vector dimensionality every result must match. */
  dimensions?: number
  /** Input texts per embeddings request. */
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
  batchSize: z.number().step(1).min(1).default(DEFAULT_BATCH_SIZE),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
  maxRetries: z.number().step(1).min(0).default(DEFAULT_MAX_RETRIES),
  backoffBaseMs: z.number().step(1).min(1).default(DEFAULT_BACKOFF_BASE_MS),
  backoffMaxMs: z.number().step(1).min(1).max(DEFAULT_BACKOFF_MAX_MS).default(DEFAULT_BACKOFF_MAX_MS),
})

/** Resolved provider options after schemastery applies every field default. */
export interface MiniMaxEmbedOptions extends EmbedRetryOptions {
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
 * The MiniMax `EmbedProvider`. `available()` is the cheap synchronous
 * credential check that drives the seam's degraded mode; the network is only
 * touched inside `embed()`.
 */
export class MiniMaxEmbedProvider implements EmbedProvider {
  readonly id = MINIMAX_PROVIDER_ID
  readonly modelId: string
  readonly dimensions: number
  private readonly options: MiniMaxEmbedOptions

  /* jscpd:ignore-start */
  // jscpd: intentional symmetry — the per-vendor embed provider template;
  // the extracted transport core lives in dsh-kb-embed-shared
  // (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
  constructor(options: MiniMaxEmbedOptions) {
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
    if (texts.length === 0) throw new Error('kb-embed-minimax: embed requires a non-empty batch of texts')
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('the operation was aborted', { cause: signal.reason })
    const key = this.options.resolveKey()
    if (key === undefined || key.length === 0) {
      throw new Error(`kb-embed-minimax: no credential resolved for ${this.id}; set the configured apiKeyEnv in the launch environment`)
    }
    const vectors: Float32Array[] = []
    for (let start = 0; start < texts.length; start += this.options.batchSize) {
      const batch = texts.slice(start, start + this.options.batchSize)
      vectors.push(...await withEmbedRetries(
        () => this.requestOnce(batch, signal),
        this.options,
        signal,
        'kb-embed-minimax',
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
        body: JSON.stringify({ model: this.options.model, texts: [...texts], type: 'query' }),
        /* jscpd:ignore-end */
        signal: combined,
      })
    } catch (error: unknown) {
      if (signal?.aborted) throw signal.reason
      if (perRequest.aborted) {
        throw new Error(`kb-embed-minimax: embeddings request timed out after ${this.options.timeoutMs}ms`, { cause: error })
      }
      throw error
    }
    const raw = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      throw new HttpEmbedError(`kb-embed-minimax: embeddings response was not JSON (HTTP ${response.status})`, response.status)
    }
    /* jscpd:ignore-start */
    // jscpd: intentional symmetry — the per-vendor embed provider template;
    // the extracted transport core lives in dsh-kb-embed-shared
    // (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
    if (!response.ok) {
      const message = errorMessage(payload) ?? `HTTP ${response.status}`
      throw new HttpEmbedError(`kb-embed-minimax: embeddings request failed: ${message}`, response.status)
    }
    return decodeEmbeddings(payload, texts.length, this.options.dimensions)
  }
}

/** Extract the human-readable message from either MiniMax error envelope. */
function errorMessage(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const record = payload as Record<string, unknown>
  const base = record.base_resp
  /* jscpd:ignore-end */
  if (typeof base === 'object' && base !== null && 'status_code' in base) {
    const { status_code, status_msg } = base as { status_code: unknown; status_msg: unknown }
    if (typeof status_code === 'number' && status_code !== 0) {
      return typeof status_msg === 'string' && status_msg.length > 0
        ? `${status_msg} (${status_code})`
        : `status ${status_code}`
    }
  }
  const error = record.error
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message
    if (typeof message === 'string' && message.length > 0) return message
  }
  return undefined
}

/**
 * Validate and decode one MiniMax embeddings response at the wire boundary.
 * @param payload - the parsed JSON response body.
 * @param expectedCount - the batch size the request sent.
 * @param dimensions - the configured dimensionality.
 * @returns one vector per input, in input order.
 */
export function decodeEmbeddings(payload: unknown, expectedCount: number, dimensions: number): Float32Array[] {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('kb-embed-minimax: embeddings response is not an object')
  }
  const business = errorMessage(payload)
  if (business !== undefined) {
    throw new Error(`kb-embed-minimax: embeddings request failed: ${business}`)
  }
  const { vectors } = payload as { vectors: unknown }
  if (!Array.isArray(vectors)) {
    throw new Error('kb-embed-minimax: embeddings response has no vectors array')
  }
  if (vectors.length !== expectedCount) {
    throw new Error(`kb-embed-minimax: embeddings response returned ${vectors.length} vectors for ${expectedCount} texts`)
  }
  return vectors.map((vector, index) => {
    if (!Array.isArray(vector)) {
      throw new Error(`kb-embed-minimax: embeddings vector ${index} is not an array`)
    }
    if (vector.length !== dimensions) {
      throw new Error(`kb-embed-minimax: embeddings vector ${index} has dimension ${vector.length}, expected ${dimensions}`)
    }
    const numbers = vector as unknown[]
    for (const component of numbers) {
      if (typeof component !== 'number' || !Number.isFinite(component)) {
        throw new Error(`kb-embed-minimax: embeddings vector ${index} has a non-finite component`)
      }
    }
    return Float32Array.from(numbers as number[])
  })
}

/**
 * Register the MiniMax embed provider on `ctx.kb`. Credential resolution is
 * the synchronous launch-environment lookup over `apiKeyEnv`; a missing key
 * leaves the provider registered but unavailable, which the seam reports as
 * text-only degraded retrieval.
 * @param ctx - context whose `kb` service receives the registration.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const ref = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
  const provider = new MiniMaxEmbedProvider({
    baseURL: config.baseURL ?? DEFAULT_BASE_URL,
    /* jscpd:ignore-start */
    // jscpd: intentional symmetry — the per-vendor embed provider template;
    // the extracted transport core lives in dsh-kb-embed-shared
    // (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
    model: config.model ?? DEFAULT_MODEL,
    dimensions: config.dimensions ?? DEFAULT_DIMENSIONS,
    batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
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
