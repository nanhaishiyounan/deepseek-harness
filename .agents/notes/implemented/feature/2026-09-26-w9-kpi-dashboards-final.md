# Agent Note: W9/B9 real-data dashboards — T+1 KPI snapshots, the 90-day backfill, and the W-round 9-step acceptance

Status: implemented

English | [中文](2026-09-26-w9-kpi-dashboards-final.zh.md)

## Problem

Through B8 the platform had full document loops but no measurement layer: no materialized KPI store, no dashboard pages fed by real aggregates, no OTIF on-time anchor (the collections carry no `shipped_at`), and no single runnable trace that walks one PO and one MO up and down their whole chains. This batch (plans/2026-09-25-mfg-closure/10-b9-dashboards-final.md) delivers the KPI engine (`kpi-run.mts`), the `kpi_snapshots` collection plus four 经营分析 dashboard pages on the F4 chart channel, the mobile cockpit (persona skill + fold projection), and runs the W-round 9-step end-to-end acceptance with dual-surface screenshots and per-step psql assertions.

## Decision

**T+1 materialized snapshots, trends only — no red/green lights.** PLAN D9 verbatim: `kpi_snapshots` stores (board, kpi_code, dim, value, calc_date) with the reconciliation SQL riding the `note` column onto every row, so the dashboard shows the 口径 next to the number. 22 KPI codes across four boards (business 5 / supply 6 / production 5 / inventory 6) — every one a pure aggregation over live rows, psql-recomputable; `--selftest` pins the batch doc's worked examples (FPY=(90−5)/90, the OTIF numerator/denominator vocabulary, count accuracy, percentile_cont parity, dead-stock aging, the expiry window, the RTY product, the KPI table shape).

**The 90-day backfill materializes null, not fabrications.** `--backfill 90` writes one row per code per day (1981 rows over 90 days — the continuity floor). Dates whose truth source did not exist (the stock tables carry no history, and W-round collections carry no created-at columns) write `value=null`: the row keeps the continuity count honest while the chart simply has no point. Document-dated KPIs (approved_at / received_at / report_date / pay_date / count_no's CNT-YYYYMMDD key) re-derive truthfully per historical day; the three present-state KPIs (capital occupied, WIP, on-hand) are present-only by declared 口径.

**OTIF needed a real anchor, so `so_orders` grew `shipped_at`.** The ship engine stamps it on the fully-shipped transition; the W-round replay world's already-shipped order backfills `shipped_at = approved_at` (both landed the same run day — the backfill logs loudly). 毛利率/计划达成率 anchor completion time on the MO's latest `mfg_completions.completed_at` (mfg_orders has no such column) — the 口径 states the join.

**Charts read `kpi_snapshots` directly through the F4 authoring channel.** Nine blocks: line trend + bar comparison per board, the supplier five-dimension radar (the h4 `visual.mode='custom'` raw-ECharts wire) on the supply page, plus the wms_lots expiry ledger table on the inventory page (the T+1 scan cadence is stated in the page description — a sub-daily scan needs the nightly cron the open-source snapshot ships without; `/calc-kpi` on the approval-engine serve is the cron target). One pit worth recording: the chart query filter must arrive as `{kpi_code: {$eq: ...}}` (bare scalars are rejected), the server canonicalizes it into `{logic, items: [{path, operator, value}]}`, and persisted rows drop the `resource` key for `collectionPath` — the existence matchers parse both shapes, and `ensureCharts` self-heals past double-creations.

**The trace rides the ISSUE ledger, not the issue row.** `--trace po=<PO> mo=<MO>` asserts 19 links: PO up to RFQ→PR and the three quotes, down through receipts→IQC→lot four-dates→invoices→payments; MO up to BOM and driver_suggestion→SO, down through issues→job reports→completions→finished-goods lot. The batch-level three-tier lot trace (finished lot → component lots → suppliers) initially read `mfg_material_issues.lot_id` — that column stays empty by design (the engine picks the lot at posting); the ISSUE_WIP movements are the lot truth source, and the trace now walks them (finished MFG-20260926-04 → component RM-260920-M1 → supplier 山东鲁丰).

**A real B3-era seam surfaced: early-seeded flows carried un-rewritten amount conditions.** The mobile-registered PR (real `total_est`, no `total`) failed loudly at act() because the seeded `pur_requests` transitions still held the raw `total <= 100000` from before the amount-field substitution existed. `seedDocFlow`'s idempotent branch now repairs (not just keeps): every transition and the `extras.amount_field` converge onto the configured target — the w7 gate-repair pattern applied to the flow tables. First real PR approval in the whole round; every earlier PR was seeded pre-approved.

**The mobile cockpit is a read skill plus a tool-row projection — no new component.** The persona gains the 看板查询 skill (kpi_code ↔ name table, T+1 subtitle, `value=null` reported as 暂不可算, dimension rows into the table slot); `fold.ts` relabels an `nb_list` aimed at `kpi_snapshots` as 查询看板指标 (tested); the home 快捷入口 already routes to the form assistant. The acceptance query 「这周 OTIF 多少」 renders the real ReportCard (66.7% from the live snapshot).

## Consequences

`kpi_snapshots` is the single read source for both the admin dashboards and the mobile cockpit; the all chain re-runs the 90-day backfill every bring-up (a settled day upserts); `seedDocFlow` now repairs stale flow configs in place, and `so_orders.shipped_at` is a permanent column the ship engine stamps.

## Alternatives considered

- **OEE as a materialized KPI** — availability/performance need downtime and takt records the W-round data plane does not carry; a fabricated composite would violate the no-mock rule. Left as a documented gap.
- **Red/green industry benchmarks on the dashboards** — PLAN D9: trends and period-over-period first; benchmark coloring without sourced thresholds is decoration.
- **Sub-daily expiry scanning** — the page states the T+1 cadence; wiring an hourly job needs the schedule plugin the open-source snapshot lacks, and faking it would misstate the cadence.
- **Backfilling historical stock KPIs from present state** — every historical day would show today's inventory; null is the honest value.
- **Repairing the stale flow transitions by hand (psql)** — the same seam would bite the next reset; the repair belongs in `seedDocFlow`'s ensure path.

## Verification

`kpi-run.mts --selftest` (pure layer), `--calc-kpi`, `--backfill 90` (1981 rows / 90 days / 22 codes), and `--trace po=PO-B9F-0001 mo=MO-2026-0009` (PASS 19/19). The 9-step play ran live (real services, real LLM on the mobile legs): mobile registration → admission, PR → RFQ → 3 quotes → award → PO, receipt → AQL J/80 d=2≤Ac5 passed → release with four lot dates, SO → approval → hard reservation, MRP close → mobile plan card → converted MO → approve → release → schedule apply → full-kit → issues → 3+1 job reports → completion → OQC passed → release, shipment with `shipped_at` → three-way-matched invoice → approved payment. Reconciliations: OTIF 0.6667 = 2/3, FPY 0.9972 = 106818/107118, count accuracy 0.9825 = 1−26/1487 (psql hand-checks equal the snapshot row-for-row); MRP snapshot six-term recompute equal on all 6 rows of the closing run; `--assert-ledger` balanced (31 groups, 127 movements, five B9 event classes). Gates: `setup-nocobase.mts verify` green with the B9 floors (collection, shipped_at, four pages, ≥8 kpi charts + radar, ≥90 dates × 22 codes); `pnpm vitest run packages/client/ui-mobile packages/connector/tool-nocobase` 660/660; typecheck and oxlint clean on the touched surfaces. Evidence: research/2026-09-25-w-round/ — b9-final-01..07-*.png (dual-surface per step), b9-admin-dashboard-*.png ×4 (rendered ECharts canvases), b9-mobile-kpi.png, b9-psql.txt (per-step assertions + MRP recompute + ledger), b9-kpi-reconcile.txt (the three hand-checks), b9-trace.txt (19/19), b9-final-chain.mts (the re-runnable stage driver).
