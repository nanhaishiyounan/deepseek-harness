# @deepseek-ai/dsh-kb-embed-shared

English | [中文](README.zh.md)

Shared transport core for the knowledge-base seam's embed provider packages (`@deepseek-ai/dsh-kb-embed-minimax`, `@deepseek-ai/dsh-kb-embed-dashscope`): transient-failure classification, the jittered exponential backoff with its fail-loud inverted-range guard, and the retry loop that orchestrates them. This package registers no plugin and owns no wire format; the vendor packages keep their request bodies, response decoding, and cordis configuration.

## Exports

- `HttpEmbedError` — a transport failure carrying the HTTP status of the provider response.
- `isRetryable(error, status?)` — HTTP 429/5xx and network-level `TypeError` rejections are transient; everything else surfaces immediately.
- `backoffDelay(attempt, baseMs, maxMs)` — one jittered delay: a uniform 50–100% fraction of `min(baseMs × 2^attempt, maxMs)`.
- `backoff(attempt, signal, baseMs, maxMs)` — wait one delay slot, cut short when the signal aborts.
- `withEmbedRetries(request, options, signal, label)` — run one embeddable request under the shared retry policy with per-attempt debug diagnostics.
- `assertBackoffOrdered(baseMs, maxMs)` — the fail-loud guard below.
- `EmbedRetryOptions`, `DEFAULT_BACKOFF_BASE_MS` (100), `DEFAULT_BACKOFF_MAX_MS` (2,147,483,647 — Node's `setTimeout` ceiling, effectively unbounded).

## Fail-loud backoff guard

`backoffBaseMs > backoffMaxMs` is a configuration error, not a schedule: providers call `assertBackoffOrdered` at construction, so an inverted window throws `[kb-embed] backoffBaseMs (…) must be less than or equal to backoffMaxMs (…)` at plugin load. This mirrors the resolve-time validation of `resolveBackoff` in `@deepseek-ai/dsh-llm` rather than letting the first retry compute a nonsensical capped delay.

## Model Experience

Indirectly, through the vendor embed providers: this package registers no plugin, prompt, schema, or tool of its own; it only shapes retry timing inside tool execution.

#### KV Cache effect

Independent of the model request stream: embedding retries happen inside tool execution, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- **Embed-seam vocabulary only** — the retry loop speaks the embed providers' uniform policy (429/5xx/network, uniform 50–100% jitter). `@deepseek-ai/dsh-llm`'s richer `RetryPolicySchema` (modes, `retryableCodes`, `jitterRatio`) stays out: the embed seam has no use for that vocabulary, and importing it would couple a util package to the LLM capability.
- **No plugin surface** — this is a library consumed by the two vendor packages; composition, credentials, and configuration live there.
