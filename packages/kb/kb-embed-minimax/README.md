# @deepseek-ai/dsh-kb-embed-minimax

English | [中文](README.zh.md)

MiniMax embed provider for the knowledge-base seam: `embo-01` (1536 dimensions) through the MiniMax `/embeddings` endpoint, batched, retried with exponential backoff, and credential-gated — a missing credential leaves the provider registered but unavailable, which the seam reports as text-only degraded retrieval.

## Wire format

The endpoint is MiniMax-native, not OpenAI-compatible: inputs travel as `texts` with a mandatory `type` field, business failures arrive inside an HTTP 200 `base_resp.status_code`, and authentication failures use both the HTTP status and the error envelope. The provider sends `type: "query"` symmetrically for documents and queries: measured against the live endpoint, the symmetric query encoding separated relevant from unrelated text at least as well as the asymmetric db/query pairing, and the seam's single `embed()` call site cannot distinguish the two roles.

## Configuration (schemastery)

```ts
interface Config {
  apiKeyEnv?: string    // credential reference; default MINIMAX_API_KEY
  baseURL?: string      // endpoint base; default https://api.minimaxi.com/v1
  model?: string        // embedding model; default embo-01
  dimensions?: number   // vector dimensionality; default 1536
  batchSize?: number    // texts per request; default 32 (the live endpoint accepted 128)
  timeoutMs?: number    // per-request timeout; default 30,000 ms
  maxRetries?: number   // retries for HTTP 429/5xx and network errors; default 3
  backoffBaseMs?: number // base delay of the exponential retry backoff; default 100 ms
  backoffMaxMs?: number  // cap on one backoff delay; default 2,147,483,647 ms (Node's setTimeout ceiling, effectively unbounded)
}
```

Credential resolution is the synchronous launch-environment lookup over `apiKeyEnv`. HTTP 401/400 and `base_resp` business failures fail loud without retry; dimensionality and count mismatches reject at the wire boundary.

## Model Experience

Indirectly, through the kb tool suite: this provider registers no prompt, schema, or tool of its own; embeddings only change the retrieval quality and the `mode`/`embed_model` fields the tools surface.

#### KV Cache effect

Independent of the model request stream: embedding calls happen inside tool execution, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- **Symmetric `type: "query"` encoding** — the seam's `EmbedProvider.embed()` has no document/query role parameter, so both sides use the query encoding; a role-aware seam field is the escalation path if measured recall demands asymmetric encoding.
- **Fixed 1536-dimension model** — `embo-01` reports no configurable dimensionality; other models need their own catalog entry and dimension override.
- **No request-level rate limiting** — retries with exponential backoff only; sustained 429s surface as failures for the seam to wrap as `KB_EMBED_FAILED`.
- **Launch-environment credentials only** — `apiKeyEnv` resolves through the launch environment (process environment and `.env` layers), not the managed credential store, because `EmbedProvider.available()` is a synchronous probe. A key stored only through the web Models page therefore leaves this provider unavailable (text-only retrieval) while chat adapters that resolve through the credentials service keep answering. Export the variable or put it in a `.env` file to serve both; unifying needs an async availability probe on the seam, which the per-operation re-resolution contract of the credentials service currently forbids.
