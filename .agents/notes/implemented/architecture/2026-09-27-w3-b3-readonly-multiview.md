# Agent Note: W3-B3 read-only multi-view — status kanbans, the v1 scheduling gantt, and dual-block calendars

Status: implemented

English | [中文](2026-09-27-w3-b3-readonly-multiview.zh.md)

## Problem

User feedback #1 ("everything is tables + forms, not usable by humans") called for the industry-proven view forms on the core objects: a status board per engine-governed document (PO/MO/SO/质检单), a scheduling gantt for MO operations, and planning/delivery calendars. The batch's core risk (PLAN §6 D4/D5): NocoBase kanban drag persists through `collection:move` — a direct write of the group field that bypasses the wfl approval anchors, FCS schedule ownership, and the quality single-shot gates; and the gantt's only programmatic channel is the v1 uiSchemas path (plugin-gantt is absent from flow-engine's v2 authoring surface).

## Decision

- **Engine-governed boards are read-only by construction (D4).** The four boards (`nocobase-w3-views.mts`, w3b3 uids) ship `dragEnabled:false`, no `sort` field, no Add-new, no quick-create — a board is a status overview plus a B1-form drawer; state transitions keep riding the engine verbs (approval center / operator terminals / chain scripts) exclusively. The verify gate asserts dragEnabled false for every kanban on the four collections (any uid prefix), refuses create-path actions under w3b3 boards, and probes that `:move` refuses on each collection (no sort column ⇒ no server action). Free-state boards (srm_capas / qm_nc_dispositions) keep `dragEnabled:true` — asserted as a regression guard.
- **The scheduling gantt rides the official v1 channel, read-only (D5).** `ganttBlock` in `nocobase-hub-modules.mts` is exported with an opts parameter; the 排产甘特 v1 page (desktopRoutes `page` + uiSchemas Page→Grid, the hub ensureMenus shape with the tabs child) mounts `GanttBlockProvider` over `mfg_order_operations` with fieldNames `{start:'planned_date', end:'planned_date', title:'name', range:'day'}` (one-day bars; the collection has a single planned date, no end range) and `enableDragToReschedule:false` — FCS keeps sole reschedule ownership. No self-built SVG. The hub 任务甘特 page keeps its default (drag-enabled) behavior — the opts default changes nothing for existing callers.
- **Calendars are one CalendarBlockModel per source collection, stacked (fixed height 520).** `init.filter` is not a sanctioned resourceSettings key in the flow-engine catalog, so the 交期日历 shows every dated SO (need_date) and PO (need_date) order rather than only open ones; the open subsets are asserted in psql evidence (PO 8 open, SO 6 unshipped at evidence time) instead of a UI filter. The 计划日历 rides `mps_plans` (period_from→period_to — `mps_plan_items` carries no date column, only a 'YYYY-MM' period string) plus `mrp_suggestions` (suggest_date→need_date, title plan_type). Event click opens the B1 drawer (filterByTk in the event action's openView).
- **The MO board drawer embeds the operations subtable** (the planner journey's anchor): `mfg_orders.order_operations` hasMany registered via `ensureParentHasMany`, columns seq/name/workcenter/planned_date/planned_min/status.
- **Drawer record-scoping is a required wire key, discovered live (B1 defect this batch fixed).** Every persisted drawer built before W3-B3 rendered the collection's FIRST record: `DetailsBlockModel.createResource` builds a MultiRecordResource (pageSize 1, a 1/N pager on the drawer) whenever the block's `resourceSettings.init` lacks a `filterByTk` key — `drawerPageTreeFor` never carried it. The fix adds `filterByTk:'{{ctx.view.inputArgs.filterByTk}}'` to the DetailsBlock init in the shared lib (and f1's local copy), and `w3-heal-row-details.mts` grows a `rescopeDrawers` pass that rebuilds every unscoped drawer from its own field list (and its own subtable specs — extracted from the old tree, so B2 children survive) before the wire plan runs; the B2 subtable keep-check now also requires a scoped Details. 88 drawers were rebuilt; the pass is idempotent (`all 123 drawer(s) already scoped`). verify now fails on any drawer whose DetailsBlock init lacks the key.
- **Rollback destroys by ownership, not by title.** The first build titled the MO board 生产看板 — colliding with B9 经营分析's KPI dashboard of the same title; `--rollback` matched by title and cascade-deleted B9's page with its two charts (verify caught it: kpi chart count 9 < 11). The board is renamed 生产订单看板 and rollback now requires the route's schemaUid to carry the w3b3 prefix (v1 `page` rows excepted by type — the gantt page's schemaUid is server-generated).

## Evidence

- `research/2026-09-27-w3-usability/w3-b3-psql.txt` — the psql twin of every UI count: board column distributions, per-date gantt bars (26×3 / 28×4 / 29×1 / 30×2 = 10), the MO-2026-0002 FCS consistency rows, calendar event counts with open-order subsets.
- `w3-b3-assert.txt` — the script's own gate: column distributions via the list API, undeclared group values refused, `:move` refused on all four collections, gantt source rows (10), calendar event counts (SO 8 / PO 10 / MPS 1 / MRP 34).
- `w3-b3-kanban-{pur,mfg,so,qm}.png` — the four boards with column counts matching psql (采购 approved7/draft3/pending1; 生产订单 completed2/released4/draft4/approved7/in_progress3; 销售 approved6/draft2; 质检 pending8/closed49).
- `w3-b3-journey-2-mo-drawer.png` — planner journey: MO-2026-0002 card drawer scoped to the clicked record (速冻荠菜猪肉水饺) with the operations subtable (和馅/成型速冻/内包装, all 2026-09-28, WC-ASSY×2/WC-PACK).
- `w3-b3-gantt.png` — the gantt page rendering 10 one-day bars on the day scale (visually read: 26/28/29/30 distribution matches psql exactly).
- `w3-b3-journey-po-drawer.png`, `w3-b3-calendar-delivery*.png`, `w3-b3-calendar-plan.png` — the buyer journey (PO-W8-QC-01 card drawer), both calendars, and the event drawer (PO-W8-QC-01, filterbytk-scoped).
- `w3-b3-member-kanban-mfg.png` — member (陈立群) sees the board (admin-only chrome absent, 20 rows via the member token); member view grants on mfg_order_operations/mps_plans/mrp_suggestions asserted in verify.
- `w3-b3-verify.txt` / `w3-b3-regression.txt` — verify OK (with the W3-B3 assertion block) and the zero-regression replays: P0 wire probe (80 pages / 99 tables / 0 anomalies / AddNew 100%), `--assert-ledger` balanced (32 groups, 138 movements), b9 chain s1/s4/s5 PASS.

## Alternatives considered

- **Drag-enabled boards with a move guard** — refused (PLAN D4): the drag path writes the group field through `collection:move` before any engine hook runs; guarding after the fact means fighting the framework instead of not arming it.
- **Self-built SVG gantt in a JSBlock** — refused (PLAN D5, industry report): gantt-in-open-source scored zero hits across Odoo 18 / ERPNext docs; the official v1 channel exists and renders; the read-only combination (board + gantt + FCS split-suggestion card) covers the planner's line.
- **A UI filter for open orders on the delivery calendar** — refused: `init.filter` is outside the flow-engine catalog's sanctioned keys; inventing one risks silent drops. The calendar shows every dated order; open subsets live in the psql evidence.
- **MPS calendar over `mps_plan_items`** — refused by the data model: items carry a 'YYYY-MM' period string, not a date; `mps_plans.period_from/to` is the only calendar-shaped source.
- **Importing `ganttBlock` without guarding hub-modules' `await main()`** — fixed instead: hub-modules now runs its build only when invoked directly (the w8/f1 pattern), so the import is side-effect-free.

## Consequences

The decisions recorded here are the standing contract for the multi-view surfaces (see Decision and Evidence). The 交期日历 shows received/shipped orders alongside open ones until a sanctioned calendar filter channel exists; the hub 任务看板/任务日历 card drawers rebuild with record-scoping on their next f1 rewrite pass (source fixed; live trees predate it); executeB2 rewrites its subtable drawers on every heal run (a pre-existing convergence-safe wart — `findOne?subKey=page` deep-fetches truncate, so its association-presence check never passes; the rewrite is idempotent in output).
