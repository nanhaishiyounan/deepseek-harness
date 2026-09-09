# Agent Note: 张红喜 expert dataset — three-in-one modeling, the discovery line, and enabling the relevance threshold

Status: implemented

English | [中文](2026-09-05-expert-dataset-discovery.zh.md)

## Problem

The connector lane (N3) shipped the seam, the NocoBase provider, and the tool rows, but its fixtures were a skeleton: one expert row, one service, two datasets, and a discovery listing that rendered every entry as the same one-line bullet. Batch N4 had to turn the 张红喜 expert (漯河市电子商务协会会长, food go-abroad / Central Asia direction) into a real high-quality dataset the agent can discover and recommend — the acceptance scenario being「俄罗斯的仓库被乌克兰炸了怎么办」: the answer must carry the risk playbook (with [n] citations) and 张会长's expert card. Debt #7 (no retrieval relevance threshold configured on the example composition) was due for its opportunistic enablement in the same batch.

## Decision

### One authoritative JSON, three consumers

`examples/kb-agent/workspace/data/experts/dataset.json` is the single source for the expert dataset: the connector-nocobase test mock loads it at module scope, the two example snapshots (connector-flow, expert-discovery) serve it over their in-spec mock servers, and `scripts/seed-experts.mts` pushes it row by row into a real NocoBase (`NOCOBASE_BASE_URL`/`NOCOBASE_API_KEY`) through the client's new `create` action (`POST /api/<collection>:create` with a `{values}` body). Seeding captures server-assigned expert ids so `expert_services.expertId` remaps onto the created expert; the mock enforces the same wire contract and a `$eq`/`$includes` filter vocabulary, so the mock path and the seeded backend cannot drift.

### Three-in-one modeling on the seam vocabulary

The expert dataset is three collections mapped onto connector vocabulary: the profile (an `expert-profile` dataset whose kb-landing document now embeds the expert's orderable service catalog with deliverable + pricing per offering), the services (`service` datasets; `ExpertServiceRef` gained `price`), and the knowledge assets (`datasets` rows, including the expert's own《俄罗斯·中亚海外仓风险应对手册》). Discovery summaries gained structured card fields — `ConnectorDatasetSummary.expert` (org + split domain tags) and `.service` (the full `ExpertServiceRef`) — projected by the NocoBase provider at the JSON boundary and consumed by `connector_discover`, whose listing now renders expert cards (affiliation, domain tags, the folded-in orderable service list) with the follow-up dataset ids; `presentationMeta` carries the expert names so the UI card and replays show them. The graph ontology stays untouched (decision D5): expert discovery rides the connector seam, not kb-graph.

### The scenario corpus and its eval line

Eleven corpus documents landed: nine `report` documents under `workspace/data/export-risk/` (warehouse-strike emergency playbook, China–Russia rail corridors and rerouting, road TIR, one-primary-two-backup warehouses, cargo insurance and claims, Central-Asian customs, transit corridors, ocean rerouting, the overview) and two `regulation` excerpts (CIM/CMR force majeure, ICC 2020 contract clause). The eval set grew to 120 questions (twenty go-abroad risk questions whose gold points at the new corpus); two corpus phrasings were tuned for FTS trigram compatibility (「常见的拒赔原因」「增值税税率」) after the text-mode run showed three misses.

## Alternatives considered

- **Separate fixture constants per test surface** — rejected: three hand-maintained copies of the 张红喜 rows would drift the first time a service's pricing changed; one JSON with mock + snapshot + seed consumers is the same pattern the scenario corpora already use.
- **Card fields by parsing the listing text** — rejected: the discovery listing is prose for the model; parsing it back for the UI would couple presentation wording to data extraction. Structured `summary.expert`/`summary.service` fields carry the card data with the listing derived from them.
- **Extending kb-graph with a person entity (decision D5)** — out of scope by plan: a coordinated ontology change's blast radius exceeds the discovery line's needs; `connector_discover`'s expert card closes the loop alone.
- **The dual-path-confirmation threshold (0.017)** — rejected for this composition: it clears all garbage probes but cuts the 28% single-path gold recall, taking hybrid Top5 far below the eval line.

### minRelevanceScore enabled at 0.015 (deep-rank pruning)

The 2026-09-02 calibration showed no threshold both clears garbage probes and keeps the single-path recall; the example composition now sets `minRelevanceScore: 0.015` explicitly — the deep-rank-pruning arm that keeps every top-5 single-path gold hit (their fused scores stay ≥ 1/66) while trimming fused ranks past ~60. The dual-path-confirmation alternative (0.017) would cut the 28% single-path recall and stays untaken. Supporting the operator-facing half of the debt, the fused RRF score now travels with each hit: `KbSearchHit.score` (attached by `search()` in both modes — stores rank, they do not score) through the tool value and the gateway wire into the workbench's hit card, which renders it as a quiet tabular-nums readout.

## Consequences

- The keyless snapshot `examples/kb-agent/tests/expert-discovery.spec.ts` locks the scenario transcript (ingest → cited kb_search hit on the emergency playbook → connector_discover returning 张会长's card with the ¥6,800 risk-consulting offering); `expert-discovery.e2e.ts` runs the same scenario against real embo-01 embeddings and one real MiniMax-M3 answer asserted to carry [n] citations, playbook points (转移/备份仓, 保险/报案/理赔), and the expert recommendation by card fields (张红喜, 漯河, 海外仓风险应对咨询).
- Eval re-run at 120 questions: hybrid Top5 98.3% (出海风险 100%), citation validity 96.7% — above the ≥80%/≥90% line; the two misses are documented (one long-standing cost question; one supply question whose gold the new ocean-rerouting corpus legitimately outranks).
- ui-kb registers a `connector_discover` toolview row (query summary, counts + discovered experts, the raw expert-card listing expanded).
- Ordering and PDF delivery stay out of scope (N5); the「可下单」hint on the card is presentation of the service's deliverable/pricing fields, not an order channel.
