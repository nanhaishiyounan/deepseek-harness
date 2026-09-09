# kb-agent expert order (keyless template drafting)

## 需求：请安排张会长出一份中亚货运风险应对方案，重点是主运力受阻后的切换。

## kb_ingest（出海风险语料）
- 2026-08-backup-warehouse-network.md: Ingested workspace/data/export-risk/2026-08-backup-warehouse-network.md into tenant "demo-food-co": document 1, 5 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- 2026-08-cargo-insurance-claims.md: Ingested workspace/data/export-risk/2026-08-cargo-insurance-claims.md into tenant "demo-food-co": document 2, 5 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- 2026-08-central-asia-customs.md: Ingested workspace/data/export-risk/2026-08-central-asia-customs.md into tenant "demo-food-co": document 3, 5 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- 2026-08-central-asia-transit.md: Ingested workspace/data/export-risk/2026-08-central-asia-transit.md into tenant "demo-food-co": document 4, 5 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- 2026-08-china-russia-rail-corridor.md: Ingested workspace/data/export-risk/2026-08-china-russia-rail-corridor.md into tenant "demo-food-co": document 5, 5 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- 2026-08-export-risk-overview.md: Ingested workspace/data/export-risk/2026-08-export-risk-overview.md into tenant "demo-food-co": document 6, 4 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- 2026-08-ocean-rerouting.md: Ingested workspace/data/export-risk/2026-08-ocean-rerouting.md into tenant "demo-food-co": document 7, 5 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- 2026-08-russia-warehouse-emergency.md: Ingested workspace/data/export-risk/2026-08-russia-warehouse-emergency.md into tenant "demo-food-co": document 8, 5 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.
- 2026-08-tir-road-transport.md: Ingested workspace/data/export-risk/2026-08-tir-road-transport.md into tenant "demo-food-co": document 9, 5 chunks, stored text-only (no embed provider available). Re-ingesting the same path replaces the prior document.

## connector_discover("中亚")
## Experts
### 张红喜 — 漯河市电子商务协会（会长）
- dataset id `experts/1` (expert-profile) — provider `connector-nocobase`
- 领域：食品出海 · 中亚五国 · 俄罗斯 · 跨境电商 · 海外仓
- 可服务项（可下单）:
  - 中亚货运动线方案（PDF 方案，¥8,800/份） — dataset id `expert_services/1`
  - 食品出海合规咨询（PDF 方案，¥12,000/份） — dataset id `expert_services/3`
- 简介：漯河市电子商务协会（会长） · 食品出海 · 中亚五国 · 俄罗斯 · 跨境电商 · 海外仓

Providers answering: connector-nocobase. Preview a dataset with connector_fetch (dataset_id, provider id if several match); land one with connector_transfer (dataset_id).

## order_create（下单并生成方案 PDF）
订单已创建并完成生成：ORD-<date>-<no>
- 服务：中亚货运动线方案
- 状态：已交付
- 方案 PDF：<root>/deliverables/ORD-<date>-<no>.pdf
- 业务后台附件：/storage/uploads/ORD-<date>-<no>.pdf
- 备注：未配置模型服务，按模板生成（非模型起草）

## order_status()
- ORD-<date>-<no>（中亚货运动线方案）：已交付，方案 PDF：<root>/deliverables/ORD-<date>-<no>.pdf，业务后台附件：/storage/uploads/ORD-<date>-<no>.pdf
