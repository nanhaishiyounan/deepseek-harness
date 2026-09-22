# @deepseek-ai/dsh-kg-build

English | [中文](README.zh.md)

The knowledge-graph build pipeline (`ctx.kgBuild`): a Service plugin that turns the three structured sources — NocoBase business collections (deterministic R01–R13 mapping), the lakehouse catalog, and connector discovery — into the kbGraph property graph, then runs closed-set LLM extraction over corpus documents with entity alignment onto the canonical NocoBase rows. Every run is idempotent: per-scope snapshot fingerprints skip unchanged sources, merges converge on the natural-key and seven-column anchors, and disappeared rows tombstone. Every run starts with an ontology-revision audit (registry drift vs. the built-in seed journals a revision row before any source leg runs), and the FoodOn import materializes the curated subtree snapshot into the registry idempotently. Extraction rides the Instruct-KGC JSON protocol (schema dict + split batches; `legacy` keeps the A/B baseline prompt), gates through the SHACL validation loop with explanatory repair feedback (≤3 rounds, survivors quarantine — never partial writes), and unknown entity types degrade into the `Concept` bucket while unknown or direction-violating predicates drop with counted reasons. The cross-source pass bridges corpus entities to business rows: deterministic name-normalized edges stay the recall floor, the v2 gray zone (containment pairs) goes to a pairwise LLM judge, verdicts layer by confidence — at or over the auto floor the edge lands, a same-verdict in the 0.5–0.9 band queues for human review, negatives write reject tombstones — and every pass lands as an ingest episode carrying its verdicts.

## Composition

`ctx.plugin(KgBuildRuntime, config)` — the seam services resolve optionally at run time: the kbGraph seam and a v2 store are required; the lakehouse and connector legs stay off when their seam is absent; the corpus leg requires the llm seam. NocoBase credentials resolve through the same chain as tool-nocobase (`baseUrl` config → launch environment → `NOCOBASE_BASE_URL`; token through the credentials seam or the configured env var); the mapping file is the collection whitelist's only home (`nocobase.mappingsFile`; an inline `collections` key rejects at load). Scheduling is manual by default (`intervalMs: 0`; a positive value repeats `run()` on a timer).

## Config

- `tenant` (required): the deployment-side tenant binding for every graph write.
- `nocobase.mappingsFile`: the kg-mappings.yml whitelist — collections with `anchor` (builtin node-type id the derived type extends), `titleField`, and `fkLinks` (`plain-id` or `collection-address` reference styles).
- `lakehouse` / `connector` (default true): the data-asset legs; each registers one `Dataset` node per table/dataset with fingerprint-based skip.
- `corpus`: `root` (recursive md/txt), `extensions`, `maxDocuments`, `maxChunksPerDocument` — closed-set extraction with content-hash skip and delete-then-re-extract semantics.
- `extract` (default minimax / MiniMax-M3): `provider`, `model`, `maxChunkChars`, `protocol` (`instruct-kgc` | `legacy`), and `shaclGate` (default true — the SHACL repair loop; off skips straight to quarantine-free writes).
- `align`: Jaro-Winkler auto threshold (default 0.9) and gray floor (default 0.8, LLM-adjudicated).
- `crossSourceAlign`: `enabled` (default true), `exactOnly` (default false — containment pairs enter the gray zone), `v2` (default true — the pairwise LLM judge; off keeps the deterministic containment edges).
- `foodon` (default true): import the curated FoodOn subtree snapshot into the registry (idempotent; anchors and synonyms land with the classes, the import journals an ontology revision).
- `pageSize` (default 100), `intervalMs` (default 0).

## Model Experience

Indirectly, through the kg tool suite (`kg_schema` per-call listing; `kg_subgraph` aggregated YAML answers, typically 3-6k tokens capped by `max_nodes`).

#### KV Cache effect

None for the conversation stream: corpus extraction rides its own pipeline-side requests outside the agent loop, and the kg tools outputs join the conversation as ordinary tool results.

## Known Limitations and Deferred Work

- Change detection is snapshot-fingerprint based (the seeded NocoBase track exposes no usable `updatedAt` — probed live; see the Agent Note); the event-callback low-latency channel stays deferred.
- Reconcile bookkeeping (`run_config.knownIds`) grows linearly with row count; past ~10k rows per collection it needs chunked reconciliation.
- Connector discover's merged output carries no providerId, so `connector:<id>` nodes risk cross-provider id collisions; the sourced_via edge waits for seam-side per-provider attribution.
- The gray-zone review queue drains through the workbench's human verdicts; a bulk adjudication API is future work.
- Instruct-KGC vs. legacy stays a config-level A/B (the report lives in research/); promoting the winner to the only protocol waits for the next corpus refresh.
