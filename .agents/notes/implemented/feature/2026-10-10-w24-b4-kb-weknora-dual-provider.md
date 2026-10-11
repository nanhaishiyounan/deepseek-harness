# Agent Note: W24-B4 WeKnora dual-provider knowledge base — self-built seam adapter over an audited official plugin

Status: implemented

English | [中文](2026-10-10-w24-b4-kb-weknora-dual-provider.zh.md)

## Problem

W24's five-source rebuild makes WeKnora (Tencent, MIT, v0.8.2 docker sidecar) the primary retrieval engine for the knowledge-base seam, with the existing `kb-sqlite` store kept as the fallback. Two integration paths existed: the official npm plugin `@wxg-prc-cpg/dsh-weknora` v0.1.0 (verified on npm, MIT, zero runtime deps) and a self-built adapter. The decision had to be made against the repository's plugin rules, not convenience: `ctx.effect()` registrations, Config fields over env-only wiring, and the kb seam's provider registry are hard requirements the tool surface depends on — `kb_search` routing, tenant isolation, the `[n]` citation protocol, and the degradation chain all ride `ctx.kb`, not a parallel tool row.

## Decision

### The official plugin failed the seam audit; the adapter is self-built

The tarball audit (`npm pack`, dist review) found `apply()` registers four tools (`weknora_list_knowledge_bases` / `weknora_search` / `weknora_read_document` / `weknora_ask`) through bare `ctx.tools.register()` calls — no `ctx.effect()` disposal, no `ctx.kb` store registration, configuration only through `WEKNORA_*` env interpolation. That is a usable standalone tool row but cannot power `storeProvider: 'weknora'`, the fallback contract, or the seam's selection semantics. Per the B4 decision tree the integration landed as `packages/kb/kb-weknora` (three-file seam adapter: REST client + `WeknoraKbStore` + plugin apply), MIT-compatible behavior copied from the audited wire contract, not from the plugin's code.

### Mapping model: category knowledge bases, title-encoded identity

One WeKnora knowledge base per `(tenant, category)` — the category is the source path's first `/` segment — created idempotently on first ingest, so the corpus organization surfaces as WeKnora knowledge bases while `tenantId` filtering maps to a `tenant/…` name prefix scan. Document identity round-trips through the manual-entry title as `[docKind] sourcePath`; WeKnora's string ids hash (FNV-1a) into the seam's numeric chunk/doc ids, so both retrieval paths (knowledge-search for the text path, per-KB hybrid-search with `query_embedding` for the vector path — the same MiniMax embo-01 vectors the seam's embed provider computes and WeKnora's builtin model stores) fuse through the seam's RRF unchanged.

### Degradation contract: transport vs rejection, notice all the way up

An outage (transport failure or HTTP 5xx) fails loud with `KB_WEKNORA_UNAVAILABLE` unless `allowFallback: true` AND `fallbackPath` are configured — `allowFallback` without a path fails composition load, the exact silent-degradation misconfiguration the seam refuses. Rejected requests (4xx — bad credential, out-of-scope knowledge base) never degrade: a fallback would hide a configuration error. When the embedded sqlite fallback serves, every hit carries a `notice`, the seam hoists it onto `KbSearchResult.notice`, `kb_search` renders a degraded-retrieval line, and the workbench shows a notice strip — the observability chain is one optional field threaded through four packages rather than a new event or mode.

### Corpus and benchmark

The 46 legacy corpus documents were rebuilt from `kb.sqlite` chunks (the `workspace/data/` sources had been deleted; the store retained full chunk text) into three categories — business-ops (29), food-compliance (15), system-guide (13, padded with real `docs/*.zh.md` system documents) — 57 documents against the ≥30/three-category bar. The self-built benchmark is 20 QA pairs (8 business, 8 compliance, 4 system) scored by exact source-path match at hit@1/hit@3 through the same knowledge-search endpoint the store rides. Measured: hit@1 = 80% (16/20), hit@3 = 90% (18/20) — above the 80% bar; a match_count=10 rerun reproduced both numbers, so the two misses are gold-content semantics (a generated catalog document, a near-neighbor visit log), not retrieval depth.

## Alternatives considered

- **Install the official plugin alongside the seam**: rejected — two retrieval tool rows (kb_search + weknora_search) with no shared provider selection, no fallback contract, and registrations that leak on unload.
- **Keep kb-sqlite primary and use WeKnora only through its MCP server**: rejected for B4 — the seam's citation protocol and tenant binding would not survive the MCP hop, and the fallback story inverts (WeKnora deserves primary given rerank + ParadeDB hybrid recall).
- **Embed directly against MiniMax in WeKnora via its native provider registry**: blocked — WeKnora's minimax provider covers KnowledgeQA/ASR only, so the embedding side needs the OpenAI-wire proxy regardless.

## Consequences

- `KbSearchHit.notice` / `KbSearchResult.notice` are optional seam fields; stores may annotate hits and the seam hoists the first one. Tool and workbench renderers treat it as informational, not an error.
- `kb-sqlite` exports `openSqliteKbStore` (the warning-filtered node:sqlite loader now lives once in `open.ts`); the weknora fallback and any future embedded-store consumer reuse it instead of duplicating the loader symmetry.
- The weknora store is tenant-bound: untenanted seam searches and stats fail with `KB_WEKNORA_TENANT_REQUIRED` because the scoped API key cannot span spaces. `stats` reports document counts only (WeKnora chunks asynchronously and exposes no per-tenant chunk total); usage metering is a no-op — WeKnora meters on its own audit surface.
- `collectedAt` and provenance do not survive the title encoding; hits return without them (documented limitation).
- Deployment lives in `workspace/weknora/` (gitignored): v0.8.2 compose with `builtin_models.yaml` (MiniMax-M3 chat + embo-01 embedding), images pulled through CN registry mirrors (daocloud/1ms) and re-tagged, ports 18080 (UI) / 18081 (API), `JWT_SECRET`/`SYSTEM_AES_KEY` generated per install, and the whole colima VM home moved to /Volumes/ssd with a symlink back (the host-disk constraint). MiniMax's `/embeddings` speaks only its native `{model, texts, type}` shape while WeKnora speaks the OpenAI wire, so `embed-proxy.mjs` on the host (:18082, allow-listed in `SSRF_WHITELIST_EXTRA` alongside `host.docker.internal`) adapts the two; documents over WeKnora's 200k-character manual cap land as `path#N` segments (decodeTitle strips the suffix); manual entries are created with `status: "publish"` — the draft default never enters the async chunk/embed pipeline.
- Live degradation proved both ways: with the sidecar stopped, `kb.search` through the web composition answered from the sqlite fallback carrying the notice ("WeKnora is unreachable; results come from the local fallback store", 8 hybrid hits), while the fallback-less direct client failed loud with the transport `WeknoraApiError`.
- Pre-existing kb-agent example failures (connector-flow/data-routing snapshots referencing retired `lakehouse_query`/`lakehouse_tables` tool names, kb-presets row activation) predate B4 — verified by stashing the patch change and re-running; they are B2/B3 debt outside this batch's scope.
