/**
 * Shared transport core for the kb embed provider packages: the HTTP-status
 * error type, transient-failure classification, the jittered exponential
 * backoff with its fail-loud inverted-range guard, and the retry loop that
 * orchestrates them. Vendor packages own the wire format, response decoding,
 * and plugin configuration; everything here is provider-independent.
 * @module @deepseek-ai/dsh-kb-embed-shared
 */

/** Default base delay of the exponential backoff between retries; doubles per attempt. */
export const DEFAULT_BACKOFF_BASE_MS = 100
/**
 * Default cap on one backoff delay: Node's largest schedulable `setTimeout`
 * delay (2^31 − 1 ms), so the default configuration leaves the exponential
 * growth unbounded.
 */
export const DEFAULT_BACKOFF_MAX_MS = 2_147_483_647

/** A transport failure carrying the HTTP status of the provider response. */
export class HttpEmbedError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'HttpEmbedError'
  }
}

/**
 * Whether one failed attempt is transient and worth another.
 * @param error - the thrown failure of one attempt.
 * @param status - the HTTP status when the failure carries one.
 * @returns true for HTTP 429/5xx and network-level rejections.
 */
export function isRetryable(error: unknown, status?: number): boolean {
  if (status !== undefined) return status === 429 || status >= 500
  // fetch() rejects with TypeError on network-level failures; everything else
  // (decode/validation/abort) is deterministic per input.
  return error instanceof TypeError
}

/**
 * Fail loud when the backoff window is inverted, mirroring the resolve-time
 * validation of `resolveBackoff` in `dsh-llm`: providers call this at
 * construction, so a misconfigured cordis.yml fails at plugin load instead of
 * producing a nonsensical delay schedule on the first retry.
 * @param baseMs - configured `backoffBaseMs`.
 * @param maxMs - configured `backoffMaxMs`.
 */
export function assertBackoffOrdered(baseMs: number, maxMs: number): void {
  if (baseMs > maxMs) {
    throw new Error(`[kb-embed] backoffBaseMs (${baseMs}) must be less than or equal to backoffMaxMs (${maxMs})`)
  }
}

/**
 * One jittered backoff delay: a uniform 50–100% fraction of the exponential
 * delay `min(baseMs × 2^attempt, maxMs)`, so concurrent retry storms
 * desynchronize.
 * @param attempt - zero-based retry ordinal.
 * @param baseMs - base delay in milliseconds.
 * @param maxMs - cap on the exponential delay in milliseconds.
 * @returns the delay to wait before the next attempt, in milliseconds.
 */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(baseMs * 2 ** attempt, maxMs) * (0.5 + Math.random() / 2)
}

/**
 * Wait one backoff slot ({@link backoffDelay}), cut short when the signal
 * aborts.
 * @param attempt - zero-based retry ordinal.
 * @param signal - caller abort signal.
 * @param baseMs - base delay in milliseconds.
 * @param maxMs - cap on the exponential delay in milliseconds.
 */
export function backoff(attempt: number, signal: AbortSignal, baseMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, backoffDelay(attempt, baseMs, maxMs))
    function onAbort(): void {
      clearTimeout(timer)
      reject(signal.reason instanceof Error ? signal.reason : new Error('the operation was aborted', { cause: signal.reason }))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** The retry slice of every embed provider's resolved options. */
export interface EmbedRetryOptions {
  /** Retries for transient failures (HTTP 429/5xx and network errors). */
  readonly maxRetries: number
  /** Base delay of the exponential retry backoff in milliseconds; doubles per attempt. */
  readonly backoffBaseMs: number
  /** Cap on one backoff delay in milliseconds. */
  readonly backoffMaxMs: number
  /** Optional debug sink for retry diagnostics, wired to the plugin logger. */
  readonly debug?: (message: string) => void
}

/**
 * Run one embeddable request under the shared transient-failure retry policy:
 * HTTP 429/5xx and network failures wait one jittered exponential backoff slot
 * and retry until `maxRetries` is exhausted; everything else surfaces
 * immediately.
 * @param request - performs exactly one attempt.
 * @param options - retry budget, backoff window, and debug sink.
 * @param signal - caller abort signal; an aborted signal stops retrying.
 * @param label - diagnostic prefix, the consuming package's name.
 * @returns the first successful attempt's result.
 */
export async function withEmbedRetries<T>(
  request: () => Promise<T>,
  options: EmbedRetryOptions,
  signal: AbortSignal | undefined,
  label: string,
): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await request()
    } catch (error: unknown) {
      const status = error instanceof HttpEmbedError ? error.status : undefined
      if (attempt >= options.maxRetries || !isRetryable(error, status) || signal?.aborted) throw error
      options.debug?.(`${label}: embeddings attempt ${attempt + 1} failed (${status !== undefined ? `HTTP ${status}` : String(error)}); retrying after backoff`)
      await backoff(attempt, signal ?? new AbortController().signal, options.backoffBaseMs, options.backoffMaxMs)
      attempt += 1
    }
  }
}
