/**
 * Shared external-call resilience for the kb-agent scripts and the demo
 * runner: one bounded retry loop with a per-attempt timeout budget and
 * jittered exponential backoff around every LLM / NocoBase / upload call.
 * Exhaustion throws a readable error naming the call site, the attempt
 * count, and the last failure, so a FAIL row in the demo transcript points
 * at the actual outage instead of a bare transport error.
 *
 * This is the journey-level outer seat. NocoBaseClient already retries one
 * transport failure per request and the kb-embed providers retry transient
 * embedding failures internally; those inner budgets stay in charge, so
 * demo call sites pick timeoutMs values that cover a full inner attempt
 * window instead of racing it. Non-idempotent call sites (a create whose
 * retry would double-write, a workflow toggle whose retry would flip back)
 * pass attempts: 1 — the timeout budget still applies, the retry does not.
 * @module resilience
 */

/** Tunables for {@link withResilience}; every field optional. */
export interface ResilienceOptions {
  /** Total attempts including the first (default 3 = one try plus two retries). */
  attempts?: number
  /**
   * Per-attempt budget in ms; the attempt's abort signal fires on expiry.
   * Must be positive and finite when supplied — anything else throws.
   */
  timeoutMs?: number
  /** Backoff base in ms; the wait before retry n is base × 2^(n−1) plus up to one base of jitter. */
  baseDelayMs?: number
}

/** Default total attempts: one try plus two retries. */
const DEFAULT_ATTEMPTS = 3
/** Default per-attempt budget: generous enough for one MiniMax chat answer. */
const DEFAULT_TIMEOUT_MS = 120_000
/** Default backoff base in ms. */
const DEFAULT_BASE_DELAY_MS = 500

/**
 * Run one external call under the shared retry policy.
 * @param tool - call-site label surfaced in the exhaustion error.
 * @param run - performs exactly one attempt; it must respect the abort signal
 * (fetch, `ctx.llm.stream`, and `ctx.tools.execute` all do) or the timeout
 * budget cannot cut a hung attempt short.
 * @param options - retry budget, per-attempt timeout, and backoff base.
 * @returns the first successful attempt's value.
 * @throws a readable error naming the call site, the attempt count, and the
 * last failure once every attempt failed.
 */
export async function withResilience<T>(
  tool: string,
  run: (signal: AbortSignal) => Promise<T>,
  options: ResilienceOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  // Fail loud on an unusable budget (same gate as dsh-timeout's clampTimeout):
  // a NaN/zero/negative timeout would fire instantly or never, silently
  // turning the policy off instead of protecting the call.
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`timeoutMs must be a positive finite number (got ${String(options.timeoutMs)})`)
  }
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort(new Error(`attempt timed out after ${String(timeoutMs)}ms`)) }, timeoutMs)
    try {
      return await run(controller.signal)
    } catch (error) {
      // A timed-out attempt reports its own reason, not fetch's generic abort message.
      lastError = controller.signal.aborted && controller.signal.reason instanceof Error ? controller.signal.reason : error
    } finally {
      clearTimeout(timer)
    }
    if (attempt < attempts) {
      const backoff = baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs
      await new Promise(resolve => setTimeout(resolve, backoff))
    }
  }
  const last = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`外部调用重试耗尽: ${tool}（attempts=${String(attempts)}）最后错误: ${last}`)
}
