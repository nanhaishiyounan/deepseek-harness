# Agent Note: W5-B6+B7 UIUX design system + document-detail pattern

Status: implemented

English | [中文](2026-09-30-w5-b6b7-uiux-design-system.zh.md)

- Date: 2026-09-30
- Status: implemented
- Scope: `examples/kb-agent/scripts/w5b6-theme.mts`, `examples/kb-agent/scripts/w5b6-heal.mts`, `examples/kb-agent/scripts/w5b7-detail.mts` (new), `examples/kb-agent/scripts/nocobase-flow-page-lib.mts` (W5-B7 factories), `examples/kb-agent/scripts/w5b4-autoflow.mts` (one-line assert repair)

## Problem

The user verdict "uiux太难看" diagnosed by the W5 research (research/2026-09-29-mfg-erp-mes-uiux/report.md) as a missing design system: no semantic status palette, no list-page floorplan discipline, no document-detail structure. NocoBase's theme editor holds the antd5 token surface, but nothing had been configured; W4-B1's palette predated the research (execution-completed shared the approval green); detail drawers were single-column field dumps with W3-B2 subtables.

## Decision

**The design system lives in data, applied by three idempotent heal scripts with journal rollback — no platform code changes.**

- **Theme (B6-1)**: one `themeConfig` row `mfg-standard` (default) carries the research §4.1 token map (brand `#1677FF`, radius 6, fontSize 14, deep-navy `colorBgSider`) plus `token.globalStyle` CSS (nine-state palette as `--w5-status-*` variables, `tabular-nums` on tables, drawer Tags one size up per the Fiori object-page rule). The four built-in themes stay user-optional; the previous default (Compact) is demoted by the same write. `InitializeTheme` applies `find(item => item.default)` to every user without a stored pick, so one row restyles the console.
- **Palette v2 (B6-2)**: `STATUS_PALETTE` in w5b6-heal.mts is the single definition. antd preset names render the research's exact fg/bg pairs (`green` → #389E0D on #F6FFED etc.), preserving WCAG AA and the text+color double encoding. v2 deltas vs W4-B1: `completed`/`done` green→**cyan** (execution ≠ approval), `in_progress` orange→**blue**, plus financial (`partial`/`paid`/`overdue`), transfer (`converted`/`dismissed`), and quality (`hold`) values. A recolor pass rewrites every `DisplayEnumFieldModel` options list to v2 (132 columns, mismatch 0).
- **List floorplan (B6-3)**: `TableColumnModel.props.align` passes straight through `getColumnProps()` into the antd column — money/number/date columns get `align: 'right'` (144 + 61), enum columns `align: 'left'`. Every FilterForm gets a `FilterFormCollapseActionModel` (`collapseSettings.defaultCollapsed: true` — 36/36), the platform-native collapsed filter bar.
- **Document detail (B7)**: `documentDetailPageTree` in the shared lib replaces the w3b1 row-detail drawers of seven core collections (11 drawers) with three ChildPage tabs — 单据明细 (two-column header facts re-sequenced by per-collection priority, drawer-opened fields filtered against the live field registry so stale W3-B1 placeholders drop), 审批记录 (timeline), 关联单据 (connections). The W3-B2 subtable drill-down blocks are extracted from the old drawer verbatim and re-seated (`childrenOfDrawerTree`) — setup-verify asserts their presence, and the first heal pass without them failed that leg.
- **Timeline data channel (B7-2)**: two platform paths were probed live and rejected — `resourceSettings.init.params.filter` never reaches the first `:list` request (the same gap W4 found for sort), and `stepParams.dataScope` persists but its handler does not replay on mount. The working channel is the one W3-B2 proved: a PG view per doc_type (`wfl_records_<docType> AS SELECT * FROM wfl_approval_records WHERE doc_type=…`, granted to the app DB user, registered as a NocoBase view collection with the 14 record fields) + parent `hasMany approvalRecords (foreignKey=doc_id)` + the block's `associationName`/`sourceId('{{ctx.view.inputArgs.filterByTk}}')`. The doc_type pin inside the view is what makes the bare doc_id foreign key unambiguous. Columns carry from_anchor/to_anchor (countersign fan-out, demote returns) and the action Tag options.
- **Connections (B7-3)**: per-collection downstream o2m business groups via `ensureParentHasMany` (pur_orders→receipts, pur_requests→rfqs, pur_rfqs→quotes+orders, so_orders→payments), each an association-bound table block with row drill-down. Upstream belongsTo stays in the 明细 fields (RFQ number, PR link) — ERPNext-style upstream lists would need a separate channel and are B8.

## Alternatives considered

- antd Tag custom hex colors — preset names already render the research's exact pairs with correct light backgrounds; hex mode flips Tag to solid-fill white text.
- Direct `hasMany` onto `wfl_approval_records` — doc_id is polymorphic across doc_types; ids collide between types sharing a number.
- dataScope step params — persisted but not replayed (live-probed; the settings dialog only runs the handler on save).
- A NocoBase view over the whole records table with a form filter — the timeline must be record-scoped inside a drawer without user interaction.

## Consequences

- `w5b6-theme --assert` (theme row + tokens + globalStyle), `w5b6-heal --assert` (palette/align/collapse counters), `w5b7-detail --assert` (three tabs + timeline association + connections per collection, psql sample cross-check), `w4-heal-b1 --assert` (five defect counters still zero), `approval-engine --selftest`, `w5b2 --migrate`, `w5b3/4/5 --assert`, and `setup-nocobase.mts verify` full chain all green after the heal.
- Rollback drills: w5b6-heal `--rollback --pilot` red→re-heal green; w5b7 `--rollback` snapshots (tree replays) exercised twice during the timeline channel iteration.
- Evidence: `demos/acceptance-w5/b6-01..06` (six domain list pages) and `b7-01..03` (PO drawer header/timeline/connections); PO-2026-0003 timeline rows match psql exactly (3 records incl. the over-threshold counter-sign); connections show the two chained receipts.
- w5b4-autoflow.mts carried a latent `prBefore is not defined` ReferenceError in its BP-07 assert message (introduced in 4b3d549838) — fixed to the PR id in this batch; the leg now runs to its 全部断言通过 verdict.
- The first B7 apply lost the W3-B2 subtables (verify failed five collections' subtable legs) — the children-carryover pass is part of `documentDetailPageTree` now; re-apply restored the blocks (subtables=1×5, 2×1).
- The long-lived dev-session browser showed 请配置图表 placeholders on stat cards; a fresh headless session renders them with real data — the known dev tree-cache state (handoff legacy #3 family), not a regression of this batch.
- `crm_payments` carries the timeline tab structurally but has no wfl doc_type; its timeline is an honest empty table until a payment flow exists (B8 candidate).
