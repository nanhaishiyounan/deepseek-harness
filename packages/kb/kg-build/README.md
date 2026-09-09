# @deepseek-ai/dsh-kg-build

English | [中文](README.zh.md)

The knowledge-graph build pipeline (`ctx.kgBuild`): a Service plugin that turns the three structured sources — NocoBase business collections (deterministic R01–R13 mapping), the lakehouse catalog, and connector discovery — into the kbGraph property graph, then runs closed-set LLM extraction over corpus documents with entity alignment onto the canonical NocoBase rows. Every run is idempotent: per-scope snapshot fingerprints skip unchanged sources, merges converge on the natural-key and seven-column anchors, and disappeared rows tombstone. Nothing outside the registry is ever written — unknown entity types degrade into the `Concept` bucket, unknown or direction-violating predicates drop with counted reasons.

## Composition

`ctx.plugin(KgBuildRuntime, config)` — the seam services resolve optionally at run time: the kbGraph seam and a v2 store are required; the lakehouse and connector legs stay off when their seam is absent; the corpus leg requires the llm seam. NocoBase credentials resolve through the same chain as tool-nocobase (`baseUrl` config → launch environment → `NOCOBASE_BASE_URL`; token through the credentials seam or the configured env var). Scheduling is manual by default (`intervalMs: 0`; a positive value repeats `run()` on a timer).

## Config

- `tenant` (required): the deployment-side tenant binding for every graph write.
- `nocobase.collections`: the explicit collection whitelist — `anchor` (builtin node-type id the derived type extends), `titleField`, and `fkLinks` (`plain-id` or `collection-address` reference styles; the explicit extension of R06 for schemas that store references as scalar columns).
- `lakehouse` / `connector` (default true): the data-asset legs; each registers one `Dataset` node per table/dataset with fingerprint-based skip.
- `corpus`: `root` (recursive md/txt), `extensions`, `maxDocuments`, `maxChunksPerDocument` — closed-set extraction with content-hash skip and delete-then-re-extract semantics.
- `extract` (default minimax / MiniMax-M3): provider, model, chunk budget. `align`: Jaro-Winkler auto threshold (0.9) and gray floor (0.8, LLM-adjudicated). `pageSize` (default 100), `intervalMs` (default 0).

## Model Experience

Indirectly, through the kg tool suite (`kg_schema` per-call listing; `kg_subgraph` aggregated YAML answers, typically 3-6k tokens capped by `max_nodes`).

#### KV Cache effect

None for the conversation stream: corpus extraction rides its own pipeline-side requests outside the agent loop, and the kg tools outputs join the conversation as ordinary tool results.

## Known Limitations and Deferred Work

- Change detection is snapshot-fingerprint based (the seeded NocoBase track exposes no usable `updatedAt` — probed live; see the Agent Note). The event-callback low-latency channel and the apiproxy `kg` domain are deferred by batch scope.
- Reconcile bookkeeping (`run_config.knownIds`) grows linearly with row count; past ~10k rows per collection it needs chunked reconciliation.
- Connector discover's merged output carries no providerId, so `connector:<id>` nodes risk cross-provider id collisions; the sourced_via edge waits for seam-side per-provider attribution.
- Entity alignment stays within one node type and uses Jaro-Winkler alone (the embedding-cosine conjunction and cross-type hierarchy merging are future work); corpus extraction reads files rather than the kb seam's chunk store.
