# @deepseek-ai/dsh-kb-weknora

English | [中文](README.zh.md)

WeKnora store provider for the knowledge-base seam: one WeKnora v0.8.2 sidecar behind a scoped API key, registered on `ctx.kb` at load. The seam's `storeProvider: 'weknora'` routes `kb_search` / `kb_ingest` through WeKnora's hybrid retrieval (recall fused with RRF, rerank when the tenant configures one); `kb-sqlite` stays usable as the fallback store.

## Mapping model

One WeKnora knowledge base per `(tenant, category)`: the category is the first `/`-segment of the document's source path (`food-safety/gb7718.md` → knowledge base `demo-food-co/food-safety`), created on first ingest. Search resolves every `tenant/…` knowledge base and fans retrieval across them, which keeps the seam's tenant isolation and makes the corpus categories visible as WeKnora knowledge bases. Document identity round-trips through the WeKnora manual-entry title as `[docKind] sourcePath` (over-cap documents append `#N` segment suffixes the decoder strips); retrieved titles decode back into citation metadata, and WeKnora's string ids hash into the seam's numeric chunk and document ids (FNV-1a).

`putDocument` reassembles the seam's chunks into one text and creates a `status: "publish"` manual entry — WeKnora owns chunking and embedding from there, asynchronously (the draft default never enters the pipeline). The reported chunk count is the submitted count; the stored count converges after WeKnora's pipeline finishes. On the vector path, the store hands the text path's query to the hybrid-search call (v0.8.2 requires `query_text`; the seam only passes a vector there), so both paths of one `kb.search` share one query.

## Degradation contract

A transport failure or HTTP 5xx with no `allowFallback` fails loud (`KB_WEKNORA_UNAVAILABLE`). With `allowFallback: true` and a `fallbackPath`, an embedded SQLite store serves ingest, delete, search, and stats, every fallback-served hit carries a `notice` the seam hoists onto the search result (rendered by `kb_search` as a degraded-retrieval line), and one warn/info pair logs each degradation and recovery transition. Rejected requests (HTTP 4xx — bad credential, out-of-scope knowledge base) never degrade: they are configuration errors a fallback would hide.

## Configuration (schemastery)

```ts
interface Config {
  baseUrl: string          // WeKnora app origin (no /api/v1); default http://localhost:18081
  apiKey?: string          // scoped X-API-Key; blank marks the store unavailable
  allowFallback?: boolean  // serve from the fallback store on outages; default false
  fallbackPath?: string    // SQLite db for the fallback store; required with allowFallback
  requestTimeoutMs?: number// per-request timeout; default 15,000 ms
  topK?: number            // retrieval depth per knowledge base per path; default 32
}
```

`allowFallback` without `fallbackPath` fails composition load. `stats` counts documents across the tenant's knowledge bases; chunk counts read zero (WeKnora chunks asynchronously and exposes no per-tenant chunk total). Usage metering is a no-op: WeKnora meters on its own audit surface.

## Model Experience

Indirectly, through the kb tool suite registrations: retrieval quality and citation surfaces are the only visible delta; this package owns no prompt, schema, or tool of its own.

#### KV Cache effect

Independent of the model request stream: results reach a later request as tool results, so this package neither appends to nor invalidates any reusable request prefix.


## Known Limitations and Deferred Work

- **Tenant-bound retrieval** — the scoped API key pins one WeKnora tenant, so untenanted seam searches and stats fail with `KB_WEKNORA_TENANT_REQUIRED` instead of spanning spaces.
- **Lossy citation metadata** — `collectedAt` and provenance do not survive the title encoding; hits return without them.
- **Idempotent replace is delete-then-create** — the prior entry deletes synchronously, but WeKnora's re-chunking converges asynchronously, so a same-title re-ingest briefly serves the new entry with stale chunk counts.
- **Post-retrieval doc-kind filter** — `docKind` restrictions filter mapped hits after retrieval rather than inside WeKnora, so filtered searches can return fewer than the requested cap.
