# Agent Note: Data-space provenance and the knowledge-graph seam

Status: implemented

English | [中文](2026-08-30-kb-dataspace-provenance-graph.zh.md)

## Problem

P2-1 lands the trusted-data-space narrative in the repository: per-document provenance with an authorization scope enforced on retrieval (plans P2 §1, research report §8.7's attribution triple), and a knowledge graph over the food-industry ontology with a model-visible query tool (plans P2 §3).

## Decision

- **The attribution triple is a seam-owned integrity fact**: every `ingest` computes a SHA-256 content hash and character length itself (a caller-supplied value is overwritten), stored beside the caller-declared provenance (provider, scope, collected source). Attribution that a caller could forge is not attribution.
- **The scope is a closed union enforced in SQL, not a filter layer**: `search | derive | share`. Both retrieval paths (FTS and vector candidates) append `OR d.scope = 'share'` to the tenant predicate — `share` documents surface in other tenants' searches; `search`/`derive` and every legacy document (no provenance) stay tenant-private. One predicate in three resource files beats a post-fetch filter that the vector path would bypass.
- **kb-sqlite `SCHEMA_VERSION` 2→3** (pre-release: old databases rejected), five new columns on `documents`, provenance returned on every hit so a citation can name its provider.
- **The graph is a sibling seam, not a store inside `ctx.kb`**: triples and retrieval hits have different contracts (neighbors/two-hop/entity-search vs text/vector search), so one `KbStore` interface would grow destructive extensions. `dsh-kb-graph` (Service Definition, `ctx.kbGraph`) + `dsh-kb-graph-sqlite` (provider, own "DSHG" database, tenant-isolated, idempotent writes) + `kb_graph_query`/`kb_graph_add` (consumers in tool-kb) complete the three roles.
- **The ontology is closed on both ends**: entity types (company/product/ingredient/additive/standard/process/risk) and predicates (produces/uses/contains/complies_with/follows/flags/supplies) are closed unions validated at the tool boundary; extraction is never a built-in LLM call — a scenario SKILL drives `kb_graph_add` with `source_path` citation, keeping the model-visible ⟺ logged rule intact through the tool result.

## Alternatives considered

- **A post-fetch scope filter in the seam** — rejected: the vector path ranks candidates before the cap; filtering after fusion would silently shrink recall and double the query surface.
- **Provenance as a separate metadata table keyed by document** — rejected: the triple travels with the document row it attests; a join for every hit buys nothing.
- **Graph triples inside the documents store** — rejected: the graph's query algebra (path joins) has no expression in `KbStore`; a second seam keeps both contracts honest.

## Consequences

- `dataspace.spec.ts` pins the five authorization behaviors (provenance round-trip, share cross-tenant, derive/legacy privacy, vector-path parity); the graph packages carry 13 tests plus the tool-level spec.
- The real-key smoke (`examples/kb-agent/scripts/graph-smoke.mts`) demonstrates the intended extraction flow: MiniMax-M3 extracts 24 triples from three corpus documents with source citations, stored and queried through the seam.
- docs/subsystems/kb.{md,zh.md} carry the policy-chain narrative (数据二十条 → 数据要素× → 可信数据空间) with the mechanism it maps to.
- Known gap: `derive` currently behaves as tenant-private retrieval; derived-work-product tracking (which answers cite a derive-scope document) is a future consumer-side projection.
