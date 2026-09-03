# @deepseek-ai/dsh-llm-minimax

English | [中文](README.zh.md)

MiniMax chat-completions adapter for the DeepSeek Harness LLM seam: registers the `minimax` provider route (default model `MiniMax-M3`) on `ctx.llm`, with connection facts resolved per request through the settings/credentials layering.

## Wire format

The endpoint is OpenAI-compatible with MiniMax deviations, all verified against the live API: thinking arrives INLINE in `delta.content` as `<think>…</think>` (no `reasoning_content` field, and `enable_thinking: false` is not honored), so translation runs a streaming splitter that separates the two channels even across chunk-boundary tag fragments; intermediate chunks carry `finish_reason: ""` (not a finish); the stream ends with a usage-only chunk (`choices: []`) and connection close — no `[DONE]` sentinel (one is accepted if a gateway sends it). `prompt_tokens` includes cache hits, which `mapUsage` subtracts for the harness's disjoint counts. Assistant reasoning replays in history as the same inline `<think>` prefix the model emits.

## Configuration (schemastery)

```ts ignore-check
interface Config {
  apiKeyEnv?: string           // credential reference; default MINIMAX_API_KEY
  baseURL?: string             // falls back to $MINIMAX_BASE_URL, then https://api.minimaxi.com/v1
  maxTokens?: number           // default per-request output cap; default 32,768
  defaultContextWindow?: number // advisory capacity when a model entry omits one; default 200,000
  models?: CatalogModel[]      // advisory catalog; default [{ id: 'MiniMax-M3' }]
  streamIdleTimeoutMs?: number // per-read idle watchdog; default 300,000 ms
  retryPolicy?: RetryPolicyConfig
}
```

The adapter rejects image content and reasoning-effort requests with `UNSUPPORTED` codes rather than silently dropping them, honors `signal`, and maps HTTP 401/403→`AUTH`, 429→`RATE_LIMIT`, 5xx→`SERVER`, 400→`INVALID_REQUEST`.

## Model Experience

### MiniMax request

#### What the model sees

The selected MiniMax model receives the harness system prompt, message history, tool schemas, stop sequences, and call config. Assistant reasoning from a prior turn replays as the inline `<think>…</think>` prefix the model itself emits; image content is rejected with `UNSUPPORTED_CONTENT` before any request.

#### Token effect

Provider tokenization governs exact input; the `<think>` passback carries every reasoned turn's chain of thought into later requests. `max_tokens` caps output per request.

#### KV Cache effect

Cache statistics flow through from the provider's `prompt_tokens_details.cached_tokens` into `cacheReadTokens`; this adapter performs no request-prefix caching of its own. A model-route change or any upstream prompt, schema, prefix, or history change may prevent reuse from the first changed token.

### MiniMax response

#### What the model sees

Inline `<think>` content is separated into a distinct `reasoning` block, visible text into a `text` block, and raw-string tool arguments into `tool-call` blocks, for the loop to log and assemble.

#### Token effect

Generated tokens include the always-on inline thinking, reported separately as `reasoningTokens` when the endpoint discloses them; only loop-retained blocks affect later input.

#### KV Cache effect

Loop-retained response blocks append to the next request and preserve its earlier reusable prefix; dropped blocks have no later cache effect. Changing the provider or model selects a different cache domain.

## Known Limitations and Deferred Work

- **Thinking cannot be disabled** — the model always thinks inline; `resolveModel` declares no reasoning efforts, and an explicit effort request fails with `UNSUPPORTED_REASONING_EFFORT`.
- **Conservative default context window** — the endpoint does not disclose the exact window; the 200,000 default is advisory and overridable per catalog entry.
- **No image input** — the adapter rejects image content; a vision-capable MiniMax model would need its own catalog entry and serialization path.
