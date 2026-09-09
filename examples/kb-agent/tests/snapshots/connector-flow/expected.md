# kb-agent connector flow (keyless)

## connector_discover("中亚")
## Experts
### 张红喜 — 漯河市电子商务协会（会长）
- dataset id `experts/1` (expert-profile) — provider `connector-nocobase`
- 领域：食品出海 · 中亚五国 · 俄罗斯 · 跨境电商 · 海外仓
- 可服务项（可下单）:
  - 中亚货运动线方案（PDF 方案，¥8,800/份） — dataset id `expert_services/1`
  - 食品出海合规咨询（PDF 方案，¥12,000/份） — dataset id `expert_services/3`
- 简介：漯河市电子商务协会（会长） · 食品出海 · 中亚五国 · 俄罗斯 · 跨境电商 · 海外仓

## Datasets
- **中亚市场准入指南** (document) — provider `connector-nocobase`, dataset id `datasets/2`
- **俄罗斯·中亚海外仓风险应对手册（专家知识资产）** (document) — provider `connector-nocobase`, dataset id `datasets/3`
- **海关出口台账（中亚）** (tabular) — provider `connector-nocobase`, dataset id `datasets/1`

Providers answering: connector-nocobase. Preview a dataset with connector_fetch (dataset_id, provider id if several match); land one with connector_transfer (dataset_id).

## connector_fetch(datasets/1)
| region | month | amount_t |
| --- | --- | --- |
| 中亚 | 2026-07 | 120.5 |
| 中亚 | 2026-08 | 98.25 |
| 欧盟 | 2026-07 | 402 |

(preview: 3 of 3 rows)

Dataset `datasets/1` from provider `connector-nocobase` — land it with connector_transfer to query it in the lakehouse.

## connector_transfer(datasets/1)
Transferred dataset `datasets/1` (tabular) from provider `connector-nocobase` into the lakehouse.
- table `customs_export` — 3 rows
- transfer record 1 (catalog audit trail)
Query it with lakehouse_query (see lakehouse_tables for columns); name the table in your answer.

## lakehouse_query
| region | total_amount |
| --- | --- |
| 中亚 | 218.75 |
| 欧盟 | 402 |

Data source: lakehouse table customs_export

Answer from the rows above; name the source table(s) in your answer.

## connector_transfer(experts/1)
Transferred dataset `experts/1` (expert-profile) from provider `connector-nocobase` into the knowledge base.
- document 1 — 2 chunks (text-only, no embeddings); re-ingest replaces the same source document
- transfer record 2 (catalog audit trail)
Retrieve it with kb_search and cite it with [n] references.

## kb_search("漯河 电商协会 会长")
(text-only mode: no embed provider is available; results come from full-text search alone)

No results found. Try different terms, or ingest more documents with kb_ingest first.

Cite the sources above as [n] — document name and heading path — in your answer.

## connector_transfer(visit-note.md)
Transferred dataset `visit-note.md` (file) from provider `connector-file` into the knowledge base.
- document 2 — 1 chunks (text-only, no embeddings); re-ingest replaces the same source document
- transfer record 3 (catalog audit trail)
Retrieve it with kb_search and cite it with [n] references.

## kb_search("东南亚 物流延迟")
(text-only mode: no embed provider is available; results come from full-text search alone)

[1] workspace/data/connectors/connector_file/visit-note.md — 东南亚走访纪要 — other — chunk 0
  东南亚订单因雨季物流延迟，交付周期拉长约两周。

Cite the sources above as [n] — document name and heading path — in your answer.
