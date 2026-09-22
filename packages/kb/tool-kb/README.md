# @deepseek-ai/dsh-tool-kb

English | [中文](README.zh.md)

Model-facing `kb_search`, `kb_ingest`, `kb_ingest_url`, and `kb_stats` tools over the knowledge-base seam (`ctx.kb`). This package owns schemas, validation, prompt guidance, limits, and presentation, never concrete store or embed providers. The tenant is a deployment-side binding (`Config.tenant`, required): the model never supplies one, and a `tenant` argument on any call is rejected. Enablement controls tool registration; an enabled tool remains visible when its store is unavailable and fails with a structured error at execution time.

## Tools

- **`kb_search`** — hybrid retrieval with numbered citations, scoped to the bound tenant. Each result line carries `[n] source_path — heading_path — doc_kind — chunk idx` plus the passage text; the degraded mode adds a standing note and the canonical value reports `mode: 'text' | 'hybrid'` with the embed identity. Hits whose fused RRF score falls below the seam's `minRelevanceScore` (dsh-kb config; default 0 keeps every hit) are dropped, so an unrelated query can return zero results. A standing instruction tells the model to cite `[n]` with the document name.
- **`kb_ingest`** — reads one workspace `.md`/`.txt` file as UTF-8 text or one `.pdf`/`.docx` file through the matching parser (unpdf, mammoth), chunks and stores it through `ctx.kb.ingest` under the bound tenant; re-ingesting the same path replaces the prior document. The 300 s default budget covers parsing and embedding batches.
- **`kb_ingest_url`** — fetches one http(s) page through the optional `ctx.web` service, converts the body to structured text, and stores it with the URL as the citation identity; re-ingesting the same URL replaces the prior document. Refuses non-2xx responses, provider-truncated bodies, and (unless `allowPrivateNetworks` is set) any URL whose host resolves into private or internal address space.
- **`kb_stats`** — document/chunk/embedded-chunk counts, embed-route availability, and the bound tenant's cumulative usage counters for the tenant.

## Configuration (schemastery)

```ts
interface Config {
  search?: boolean           // register kb_search; default true
  ingest?: boolean           // register kb_ingest; default true
  urlIngest?: boolean        // register kb_ingest_url; default true
  stats?: boolean            // register kb_stats; default true
  allowPrivateNetworks?: boolean  // let kb_ingest_url fetch intranet hosts; default false
  maxResults?: number        // citation cap per search; default 8
  tenant: string             // required deployment-side tenant binding
  searchTimeoutMs?: number   // default 30,000 ms
  ingestTimeoutMs?: number   // default 300,000 ms
  statsTimeoutMs?: number    // default 10,000 ms
  urlIngestTimeoutMs?: number // default 300,000 ms
  kgQuery?: boolean          // register kg_query (needs the llm seam for L1 fills); default true
  kgEdit?: boolean           // register kg_edit; default false
  kgQueryTimeoutMs?: number  // default 60,000 ms
  kgEditTimeoutMs?: number   // default 60,000 ms (includes one planning stream)
  kgLlmProvider?: string     // kg_edit planning + kg_query L1 fill provider; default 'minimax'
  kgLlmModel?: string        // kg_edit planning + kg_query L1 fill model; default 'MiniMax-M3'
}
```

Each budget attaches to the tool as `ToolDefinition.timeoutMs` for `@deepseek-ai/dsh-tool-call-timeout-policy` to enforce. `kb_search` and `kb_stats` are concurrency-safe reads; `kb_ingest` and `kb_ingest_url` are not.

The kg face adds `kg_schema` (ontology browsing — FoodOn anchors, synonyms, cardinality included), `kg_subgraph` (k-hop subgraph reads serialized as entity-aggregated YAML — no free-form graph-query generation), and `kg_query` (one templated Chinese phrase — 「X的供货链」「含Y的产品」「X和Y的关系」 — compiled through the shared kg-nl module in `dsh-kb-graph`, the same compiler apiproxy's `kg.query` RPC serves, then walked as a kg_subgraph-shaped read; a miss names the supported shapes and points at the kg_schema + kg_subgraph fallback). `kg_edit` (opt-in via `kgEdit`) edits the graph from one natural-language instruction through the four-step contract: `propose` plans a validated KGCL op set against the registry's closed sets and renders the diff (nothing lands), `apply` executes one confirmed proposal as an episode (`source: 'ai-edit'`, instruction verbatim, diff in metadata) with edge-record retirement instead of deletes and contradiction resolution, `rollback` reverses one episode as a rollback episode, and `episodes` lists the change ledger. Every write is an episode — 「这条边来自哪次修改」 is answerable from the mention table alone.

## Model Experience

### System prompt

#### What the model sees

`kb_search` contributes the kb-search guidance below. Config disablement removes the section together with the tool.

##### kb-search guidance

```markdown
Use the kb_search tool to retrieve knowledge-base passages relevant to a question before answering it. Pass a natural-language query; optionally narrow with doc_kind (meeting, interview, report, regulation, profile, table, other) and cap results with max_results (1–8). Results are numbered citations [n] carrying the source document, heading path, and passage text. Answer from these passages and cite them as [n] with the document name; say when the knowledge base has nothing relevant instead of guessing.
```

#### Token effect

One fixed-cost guidance section per request while `kb_search` is enabled.

#### KV Cache effect

Prefix-stable while the guidance text and visibility are unchanged; config disablement removes the section and may invalidate reuse from the first changed token.

### Tool schemas

#### What the model sees

The model sees the generated [`kb_search`, `kb_ingest`, `kb_ingest_url`, and `kb_stats` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-kb). The citation cap, tenant binding, private-network stance, and timeout budgets are deployment settings, not model arguments.

#### Token effect

Fixed schema cost per request for the enabled tool set; config disablement removes schema and guidance together.

#### KV Cache effect

Prefix-stable while definitions and visibility are unchanged; config or lifecycle changes may invalidate reuse from the first changed schema token.

### Search result

#### What the model sees

A degraded-mode search opens with `(text-only mode: no embed provider is available; results come from full-text search alone)`; a hybrid search opens with `(hybrid mode via <embed_model>)`. Each hit is `[n] <source_path> — <heading_path> — <doc_kind> — chunk <idx>` followed by the indented passage text. An empty result says `No results found. Try different terms, or ingest more documents with kb_ingest first.` A capped list adds `(Showing the first <count> results. Refine the query for fewer or more precise hits.)`; every result ends `Cite the sources above as [n] — document name and heading path — in your answer.`

#### Token effect

Data-dependent passages are resent until compaction; hits are capped by the deployment's `maxResults`.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Ingest result

#### What the model sees

A successful file ingest is exactly `Ingested <path> into tenant "<tenant>": document <doc_id>, <chunks> chunks, embedded via <embed_model>` or `stored text-only (no embed provider available)`, followed by `Re-ingesting the same path replaces the prior document.` A URL ingest mirrors the same shape with the URL in place of the path and `Re-ingesting the same URL replaces the prior document.`

#### Token effect

One short fixed-cost line per call; the ingested content itself never re-enters model history.

#### KV Cache effect

Append-only; the line follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Stats result

#### What the model sees

Exactly `Knowledge base for tenant "<tenant>": <documents> documents, <chunks> chunks (<embedded> embedded), <hybrid retrieval via <embed_model> | text-only retrieval (no embed provider available)>. Cumulative usage: <searches> searches, <documents> documents ingested (<chunks> chunks), <embed_texts> embed texts.`

#### Token effect

One short fixed-cost line per call.

#### KV Cache effect

Append-only; the line follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Argument and execution errors

#### What the model sees

Schema validation rejects wrong-typed fields before execution. Value errors become `Error: <message>` — a blank query, an unknown `doc_kind`, a disallowed path extension, a `tenant` argument (the tenant is deployment-bound), a malformed `collected_at`, a private or internal URL, a non-2xx or truncated page, or the seam's structured store/embed failures.

#### Token effect

Only the failing call adds these retained tokens.

#### KV Cache effect

Append-only; the error follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **PDF extraction is text-layer only** — unpdf reads the text layer; scanned image PDFs (no OCR) ingest as empty and fail the no-extractable-text check.
- **Truncation is cap-reached, not total-aware** — the seam reports no total hit count, so `truncated` means the result reached its cap.
- **`embed_tokens` counts zero** — the MiniMax native wire returns vectors only; counters meter embed texts until a provider reports token usage.
