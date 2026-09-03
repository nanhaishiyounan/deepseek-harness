# @deepseek-ai/dsh-kb-embed-dashscope

English | [中文](README.zh.md)

DashScope embed provider for the knowledge-base seam: `text-embedding-v4` (1024 dimensions) through the OpenAI-compatible `/embeddings` endpoint, batched at the provider's cap of ten texts, retried with exponential backoff, and credential-gated — a missing credential leaves the provider registered but unavailable, which the seam reports as text-only degraded retrieval.

## Wire format

Requests carry `{model, input, dimensions}`; responses return `data[]` entries with `index` and `embedding`, which the provider reorders by index and validates for count and dimensionality at the wire boundary. HTTP 401/400 failures fail loud without retry; 429/5xx and network errors retry.

## Configuration (schemastery)

```ts
interface Config {
  apiKeyEnv?: string    // credential reference; default DASHSCOPE_API_KEY
  baseURL?: string      // endpoint base; default https://dashscope.aliyuncs.com/compatible-mode/v1
  model?: string        // embedding model; default text-embedding-v4
  dimensions?: number   // vector dimensionality; default 1024
  batchSize?: number    // texts per request; default 10 (provider cap)
  timeoutMs?: number    // per-request timeout; default 30,000 ms
  maxRetries?: number   // retries for HTTP 429/5xx and network errors; default 3
  backoffBaseMs?: number // base delay of the exponential retry backoff; default 100 ms
  backoffMaxMs?: number  // cap on one backoff delay; default 2,147,483,647 ms (Node's setTimeout ceiling, effectively unbounded)
}
```

Credential resolution is the synchronous launch-environment lookup over `apiKeyEnv`.

## Model Experience

Indirectly, through the kb tool suite: this provider registers no prompt, schema, or tool of its own; embeddings only change the retrieval quality and the `mode`/`embed_model` fields the tools surface.

#### KV Cache effect

Independent of the model request stream: embedding calls happen inside tool execution, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- **Batch cap of ten** — the provider rejects larger batches, so ingest throughput scales with request count.
- **Single model and dimension** — the catalog entry covers `text-embedding-v4` at 1024 dimensions only; other DashScope models need configuration overrides validated against their own limits.
- **No request-level rate limiting** — retries with exponential backoff only; sustained 429s surface as failures for the seam to wrap as `KB_EMBED_FAILED`.
- **Launch-environment credentials only** — `apiKeyEnv` resolves through the launch environment (process environment and `.env` layers), not the managed credential store, because `EmbedProvider.available()` is a synchronous probe. A key stored only through the web Models page therefore leaves this provider unavailable (text-only retrieval) while chat adapters that resolve through the credentials service keep answering. Export the variable or put it in a `.env` file to serve both; unifying needs an async availability probe on the seam, which the per-operation re-resolution contract of the credentials service currently forbids.
