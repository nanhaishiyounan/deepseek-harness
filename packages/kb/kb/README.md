# @deepseek-ai/dsh-kb

English | [中文](README.zh.md)

Service Definition for the knowledge-base capability seam (`ctx.kb`): store and embed provider registries plus the ingest/search orchestration (chunk → embed → store; text + vector retrieval fused with reciprocal-rank fusion). A missing embed provider is a documented degraded mode — search runs on the text path alone and says so through its result `mode` and `stats`.

## Service API

`KbRuntime` (default export) mounts as `ctx.kb`:

- `registerStoreProvider(store)` / `registerEmbedProvider(provider)` — registry inserts; duplicate ids throw `KbError` `KB_DUPLICATE_PROVIDER`; both return fiber-scoped disposers.
- `ingest(request, signal?)` — chunks `request.content` (structure-aware Markdown chunking), embeds the chunk texts when a usable embed provider exists, and stores the document. Re-ingesting the same `(tenantId, sourcePath)` replaces the prior document through the store.
- `search(request, signal?)` — the text path always runs; a usable embed provider adds a vector ranking; the two fuse through RRF. The result carries `mode: 'hybrid' | 'text'` and the embed identity in hybrid mode.
- `stats(tenantId?, signal?)` — store counts plus `embedAvailable` / `embedModel` route observability.
- `deleteDocument(tenantId, sourcePath, signal?)` — deletes one document by identity.

`(tenantId, sourcePath)` is the document identity; `tenantId` is the hard isolation key applied to both retrieval paths and counts.

## Provider selection

Store selection resolves at execution time, never by registration order:

| Condition | Outcome |
|---|---|
| Configured id registered and `available()` | that store |
| Configured id not registered | `KB_STORE_CONFIGURED_MISSING` |
| Configured id registered but unavailable | `KB_STORE_CONFIGURED_UNAVAILABLE` |
| No id configured, exactly one usable store | that store |
| No id configured, multiple usable stores | `KB_STORE_AMBIGUOUS` |
| No id configured, no usable store | `KB_STORE_UNAVAILABLE` |

Embed selection adds the degraded mode: no usable provider (never configured, configured-but-unavailable, or registered-but-unavailable) degrades search to text-only with `mode: 'text'`, logged once per degradation transition. Only a configured id that is not registered at all throws (`KB_EMBED_CONFIGURED_MISSING`) — a composition error, not a runtime condition. An embed call that fails during ingest or search throws `KbError` `KB_EMBED_FAILED` with the provider failure as `cause`; degradation covers configuration state, not runtime faults.

## Configuration (schemastery)

```ts
interface KbRuntimeConfig {
  storeProvider?: string   // explicit store id; omitted = auto-select
  embedProvider?: string   // explicit embed id; omitted = auto-select
  chunkMaxTokens?: number  // default 512
  chunkOverlapTokens?: number // default 50
  rrfK?: number            // RRF rank damping; default 60
  minRelevanceScore?: number // minimum fused RRF score to keep a hit; default 0 (keep every hit)
  vectorTopK?: number      // vector-path candidates per search; default 32
  textTopK?: number        // text-path candidates per search; default 32
  maxResults?: number      // default result cap; default 8
}
```

`minRelevanceScore` drops hits whose fused RRF score falls below it, in hybrid and text-only modes alike (the text-only ranking passes through the same single-path RRF scoring), so an unrelated query can resolve to zero results. RRF scores are rank-damped reciprocals: a hit one path alone ranks scores at most `1/(rrfK+1)`, a hit both paths rank scores at most `2/(rrfK+1)`. Measured calibration on the kb-agent corpus (embo-01, k=60, Agent Note 2026-09-02-kb-relevance-threshold): garbage queries top out at exactly `1/(rrfK+1)` — their full-text path matches nothing — while ~28% of eval gold documents ride a single path with the same top score, so no threshold both filters garbage queries and preserves those hits. Thresholds at or below `1/(rrfK+1)` prune only deep ranks; thresholds above it keep only dual-path hits.

## Extension points

- `KbStore` — storage backend contract (`putDocument`, `deleteDocument`, `textSearch`, `vectorSearch`, `stats`, `available`). `putDocument` is transactional and overwrite-shaped.
- `EmbedProvider` — embedding backend contract (`embed`, `available`, `modelId`, `dimensions`). Availability is a cheap local check (credential presence); the network is touched only inside `embed`.

The chunker (`chunkMarkdown`, `estimateTokens`) and RRF fusion (`fuseRrf`) are exported for provider-agnostic reuse and testing.

## Events

None. Retrieval results reach the model only through a tool consumer's tool result, which the session log already records; the seam adds no model-visible input, so no `SessionEventMap` member is required.

## Model Experience

Indirectly, through the kb tool suite: this seam registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of ingest and search outcomes.

#### KV Cache effect

Independent of the model request stream: ingest and search produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- **No rerank stage** — hybrid retrieval fuses two rankings only; a rerank provider seam is deferred until evaluation justifies it.
- **Markdown-first chunking** — the chunker is structure-aware for Markdown headings, tables, and CJK sentence separators; other formats need a parsing provider upstream.
- **Linear vector scan assumption** — the seam's `vectorTopK` contract assumes stores can scan candidates cheaply at MVP corpus sizes; a store that cannot meet that assumption owns its own indexing.
