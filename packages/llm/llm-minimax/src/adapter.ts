/**
 * `MiniMaxAdapter`: fetch + SSE against a MiniMax (OpenAI-compatible with
 * inline-`<think>` deviations) chat-completions endpoint, emitting harness
 * StreamChunks. The adapter is transport-only: connection facts arrive
 * through a thunk resolved once per operation and the bearer token through a
 * per-request resolver, so the registering plugin owns validation, layering,
 * and credential policy.
 *
 * @module dsh-llm-minimax/adapter
 */

import {
  attributionHeaders,
  contentHasImage,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmAdapter,
  LlmError,
  QUOTA_EXCEEDED_CODE,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  PreparedAdapterCall,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { serializeRequest } from './serialize.ts'
import { parseSse } from './sse.ts'
import { translate } from './translate.ts'
import type { WireError, WireRequest } from './types.ts'

/** One optional model entry advertised by the direct-fetch adapter. */
export interface MiniMaxCatalogModel {
  /** Wire model id accepted by the configured endpoint. */
  id: string
  /** Selector label; defaults to {@link id}. */
  name?: string
  /** Optional selector detail for deployments with similar model variants. */
  description?: string
  /** Known combined request/response context capacity; omitted when deployment metadata is unavailable. */
  contextWindow?: number
  /** Per-request output cap for this model; omission falls back to the profile's {@link MiniMaxConnectionOptions.maxTokens}. */
  maxTokens?: number
}

/**
 * Validated connection facts for one operation. The plugin's
 * `resolveAdapterOptions` is the one explicit resolve step producing this
 * shape; the adapter trusts it and re-reads it per operation, which is what
 * makes a configuration change reach the next request without re-registration.
 */
export interface MiniMaxConnectionOptions {
  /** Endpoint base; `/chat/completions` is appended. */
  baseURL: string
  /**
   * Credential reference of this same resolution, resolved per request.
   * Travelling with the endpoint is the point: a request can never pair one
   * generation's URL with another generation's secret. Configuration carries
   * only this name — a literal key is not a configuration value.
   */
  apiKeyEnv: CredentialRef
  /** Default per-request output cap; explicit request values win. */
  maxTokens: number
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow: number
  /** Advisory models exposed to discovery consumers; requests remain unrestricted. */
  models: readonly MiniMaxCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number
  /** Provider-owned model-request retry policy, already resolved. */
  retryPolicy: ResolvedRetryPolicy
}

/** Constructor options for {@link MiniMaxAdapter}: the operation-local resolution hooks the plugin owns. */
export interface MiniMaxAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => MiniMaxConnectionOptions
  /**
   * Resolve the bearer token for the connection facts of one request. The
   * snapshot is passed in — never re-read — so the key can only ever come
   * from the same resolution as the endpoint it is sent to. Throws `LlmError`
   * `MISSING_CREDENTIAL` when no key is available anywhere.
   */
  resolveApiKey: (connection: MiniMaxConnectionOptions) => Promise<string>
}

/** Default maximum idle interval while an adapter stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/**
 * Conservative combined request/response context capacity. The endpoint does
 * not disclose the exact window; override `defaultContextWindow` (or a
 * catalog entry's `contextWindow`) when it is known.
 */
export const DEFAULT_CONTEXT_WINDOW = 200_000
/** Default per-request output-token cap. */
export const DEFAULT_MAX_TOKENS = 32_768
const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'

function modelInfo(provider: string, model: MiniMaxCatalogModel): LlmModelInfo {
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    ...model.description === undefined ? {} : { description: model.description },
    inputModalities: ['text'],
  }
/* jscpd:ignore-start */
// jscpd: intentional template symmetry — the vendor-adapter skeleton every
// LLM adapter reproduces while evolving independently; extraction would
// couple vendor timelines (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
}

/**
 * Map an HTTP status to a stable LlmError code.
 * @param status - status of a non-2xx provider response.
 * @param error - parsed provider error body, when available.
 * @returns the normalized harness error code.
 */
export function httpErrorCode(status: number, error?: WireError['error']): string {
  if (status === 401 || status === 403) return 'AUTH'
  if (status === 413) return 'INVALID_REQUEST'
  const detail = [error?.code, error?.type, error?.message].filter(Boolean).join(' ')
  if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE
  if (status === 429) return 'RATE_LIMIT'
  if (status === 400) {
    if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE
    return 'INVALID_REQUEST'
  }
  if (status >= 500) return 'SERVER'
  return `HTTP_${status}`
}
/* jscpd:ignore-end */

/** Extract the human-readable message from the MiniMax error envelope. */
function providerMessage(error: WireError['error']): string | undefined {
  return error?.message !== undefined && error.message.length > 0 ? error.message : undefined
}

/**
 * The MiniMax `LlmAdapter`. One instance serves every model name it was
 * registered under (the harness model name IS the wire model name).
 *
 * One stable signal reaches both initial fetch and body reads. Caller aborts
 * map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
 */
export class MiniMaxAdapter extends LlmAdapter {
  constructor(private readonly config: MiniMaxAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    /* jscpd:ignore-start */
    // jscpd: intentional template symmetry — the vendor-adapter skeleton every
    // LLM adapter reproduces while evolving independently; extraction would
    // couple vendor timelines (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
    return { id: provider, name: 'MiniMax' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return this.config.options().retryPolicy
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.config.options().models.map(model => modelInfo(provider, model)))
  }

  override resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    return Promise.resolve(this.modelInfoFor(this.config.options(), provider, model))
  }

  private modelInfoFor(
    connection: MiniMaxConnectionOptions,
    provider: string,
    model: string,
  ): LlmResolvedModelInfo {
    const configured = connection.models.find(entry => entry.id === model)
    const contextWindow = configured?.contextWindow
      ?? connection.defaultContextWindow
    return {
      // An uncatalogued endpoint is safely treated as text-only. Declaring an
      // unverified capability would let the host persist input that the
      // endpoint may reject on every later turn.
      ...configured === undefined
        ? { provider, id: model, name: model, inputModalities: ['text' as const] }
        : modelInfo(provider, configured),
      context: { contextWindow },
      defaultMaxTokens: configured?.maxTokens ?? connection.maxTokens,
      // No reasoning efforts: MiniMax exposes no thinking toggle — the model
      // always thinks inline, so there is nothing selectable to declare.
    }
  }

  override prepareCall(provider: string, model: string, _signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const connection = this.config.options()
    return Promise.resolve({
      model: this.modelInfoFor(connection, provider, model),
      stream: options => this.streamWithConnection(options, connection),
    })
  }

  stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.streamWithConnection(options, this.config.options())
  }

  private async * streamWithConnection(
    options: GenerateOptions,
    connection: MiniMaxConnectionOptions,
    /* jscpd:ignore-end */
  ): AsyncIterable<StreamChunk> {
    // One resolution per stream call: connection facts and the credential
    // freeze here and hold for this whole request, so an in-flight stream
    // never observes a configuration change and the next call re-resolves.
    // The key resolves *from this snapshot*, so an endpoint and the secret
    // sent to it can never come from different configuration generations.
    if (options.messages.some(message => contentHasImage(message.content))) {
      throw new LlmError('The MiniMax chat-completions adapter does not support image content.', 'UNSUPPORTED_CONTENT')
    }
    /* jscpd:ignore-start */
    // jscpd: intentional template symmetry — the vendor-adapter skeleton every
    // LLM adapter reproduces while evolving independently; extraction would
    // couple vendor timelines (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
    const apiKey = await this.config.resolveApiKey(connection)
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    using watchdog = idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
    const iterator = this.request(options, watchdog.signal, connection, apiKey)[Symbol.asyncIterator]()
    /* jscpd:ignore-end */
    try {
      while (true) {
        const result = await watchdog.next(iterator)
        if (result.done) return
        yield result.value
      }
    } catch (error: unknown) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(
          `MiniMax stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          'TIMEOUT',
          { cause: error },
        )
      }
      if (options.signal?.aborted) {
        throw new LlmError('MiniMax request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`MiniMax API stream from ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    } finally {
      consumer.abort('MiniMax stream consumer stopped')
      // Harmless on an exhausted iterator; on a half-consumed one it lets the
      // transport unwind. The consumer controller already owns termination,
      // and an async generator's return() settles rather than rejects once
      // its body has ended, so no second outcome can escape here.
      // oxlint-disable-next-line typescript/no-non-null-assertion -- every async generator from [Symbol.asyncIterator]() carries return().
      await iterator.return!()
    }
  }

  private async * request(
    options: GenerateOptions,
    signal: AbortSignal,
    connection: MiniMaxConnectionOptions,
    apiKey: string,
  ): AsyncIterable<StreamChunk> {
    const headers = {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'accept': 'text/event-stream',
      ...attributionHeaders(),
    }
    const body: WireRequest = serializeRequest(options)
    /* jscpd:ignore-start */
    // jscpd: intentional template symmetry — the vendor-adapter skeleton every
    // LLM adapter reproduces while evolving independently; extraction would
    // couple vendor timelines (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
    const payload = JSON.stringify(body)

    let response: Response
    try {
      response = await fetch(`${connection.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: payload,
        signal,
      })
    } catch (error: unknown) {
      if (signal.aborted) throw error
      throw new LlmError(
      /* jscpd:ignore-end */
        `MiniMax API request to ${connection.baseURL} failed`,
        'TRANSPORT',
        { cause: error },
      )
    }

    if (!response.ok) {
      let message = `MiniMax API error (HTTP ${response.status})`
      let providerError: WireError['error']
      const rawResponse = await response.text()
      try {
        const parsed = JSON.parse(rawResponse) as WireError
        providerError = parsed.error
        if (providerMessage(providerError)) message = providerMessage(providerError) as string
      } catch {
        // The HTTP status remains authoritative when a gateway returns malformed JSON.
      }
      throw new LlmError(message, httpErrorCode(response.status, providerError), {
        cause: new Error(rawResponse.length > 0 ? rawResponse : `MiniMax HTTP ${response.status}`),
        status: response.status,
      })
    }
    /* v8 ignore next 3 -- undici always attaches a body to a 2xx response; kept as a hard guard. */
    if (!response.body) {
      throw new LlmError('MiniMax API returned no response body', 'EMPTY_RESPONSE')
    }

    yield* translate(parseSse(response.body))
  }
}
