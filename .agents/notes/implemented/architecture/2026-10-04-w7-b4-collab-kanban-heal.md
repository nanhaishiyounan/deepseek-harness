# Agent Note: W7-B4 经营/协同/看板日历 heal + v1 overlay + the B1 field-enum debt (27 pages)

Status: implemented

English | [中文](2026-10-04-w7-b4-collab-kanban-heal.zh.md)

B4 is the fourth stock-page batch: 24 flowModel pages (经营 5 w9kpi boards + 应收应付对账, 项目协同 9, kanban 7, calendar 3, 经营总览 JSBlock shell, AI 工作台) plus 3 v1 pages that carry no flowModels — and the B1 render-plane debt named by the B23 note as this batch's prerequisite.

## Problem

The 27 operation/collaboration/kanban/calendar/v1 pages — four pure kanbans, three calendars, the two v1 gantts (CSS-overlay only, the W2/W4 ruling) and the AI workbench — all predate Forge.

## Decision

- **The B1 debt is a `--b1-debt` mode, not a separate script** (`examples/kb-agent/scripts/w7b4-heal.mts`): the same page-scoped `fieldEnum` channel B23 introduced, scoped to B1's 22 schemaUids, rewriting 23 (collection, field) `uiSchema.enum` lists through `fields:update` to STATUS_PALETTE v3 (English lead stages, purple `pending_level2`, payment-method rainbow colors all replaced). One palette + one journal serve both scopes; the assert keeps `b1FieldEnumMismatch=0/23` as a standing line so the debt cannot silently regress.
- **Kanban lanes recolor at the block level, and the field enum outranks them.** `KanbanBlockModel.props.groupOptions` colors are rewritten, but `getConfiguredGroupOptions` (plugin-kanban) lets the group field's `uiSchema.enum` inline options override the saved list — so the fieldEnum walk includes every kanban group field (`so_orders.doc_status`, `hub_pj_tasks.status`, `qm_nc_dispositions.action`, `srm_capas.status`, `qm_inspections.status`, `mfg_orders.doc_status`) and the lane recolor is belt-and-suspenders. `LABEL_OVERRIDES` keep domain vocabulary where one palette value means different words (`blocked`=受阻 on tasks/projects vs 冻结 on wms; `pending`=待检 on inspections; `open`=待办 on wfl todos).
- **Calendar event colors are a config wire, not a CSS patch**: `CalendarBlockModel.props.fieldNames.colorFieldName` set to each collection's status field (5 blocks: 交期日历 pur/so `doc_status`, 计划日历 mps `doc_status` + mrp `status`, 任务日历 `status`). The select interface's `useGetColor` then paints `.rbc-event` strips from the same v3 enum the fieldEnum channel maintains — one source of truth, verified live (4/3/3 distinct event colors on the three pages).
- **The w9kpi boards reorganize through the grid maps** (leg17#1「名为看板实为明细表」): one `metricChart` stat-card row per page (3-4 cards) seated at the grid head, chart rows hoisted after it, detail tables last — a rows/sizes/rowOrder rewrite through `flowModels:save`, because sortIndex never moves blocks (w6b10 lesson). **Cards read the LATEST snapshot day** (`calc_date` filter resolved at apply time); the first apply averaged whole history and showed 资金占用 ¥875K vs the day's ¥11.07M — snapshot metrics must be day-pinned, and existing cards get a `statcardQuery` filter refresh so re-apply converges. `statCardRaw` gained `alertWhen`/`alertColor` (figure turns Negative red / Critical orange when `n>0` or `n<0`): 临期预警 2 renders red against 呆滞 0% neutral — leg17#2's「好 0 与坏 2 等价」resolved in the card plane.
- **v1 pages take a globalStyle overlay, not a heal** (plan B4 ruling: 不重写组件). The gantt is a custom SVG renderer (`.gridTick`/`.gridRowLine`/`.today rect`/`.bar`/`.barLabelOutside`); CSS rules override SVG presentation attributes, so a 5-rule section appended to `w7b0-theme.mts` GLOBAL_STYLE does: tick+row grid anchoring (leg18#1/#5), today column orange stroke (leg18#6), label `dominant-baseline: middle` (leg18#3), selected-bar brand stroke (leg18#7). Bars already ride the theme primary (#1e4e8c, B0's token switch reached them). Re-applying `w7b0-theme` is idempotent; the B4 assert greps the theme row for the overlay markers.
- **`statCardRaw`'s alert extension is backward-compatible** (optional params, default figure fill unchanged), and `metricChart` passes them through; B23's `statcardLegacy` marker checks still pass on regenerated raws.

## Verification

- `w7b4-heal --assert` OK: 32 enum columns colorMismatch=0 enumNoLeft=0, 12 numeric right+separated, 21 date-formatted, 0 bare money text (one false positive fixed: `wfl_flow_states.update_value` is a text-config column, interface-gated in the assert like the heal), 35/35 statcards forge-marked, 20 column-header lists at v3, **fieldEnumMismatch=0/32, kanbanLaneMismatch=0/40 lanes, calendarNoColor=0/5, kpiGridBad=0/5 (cards row first), b1FieldEnumMismatch=0/23, v1Overlay=ok**; all 24 flowModel pages present in the ownership graph.
- Live DOM probes (`.w7b4-shot.mjs`, 32 pages incl. 5 B1 retakes): table 7/7 six-checkpoint, kpi 11/11 (cards-first + form set), kanban 7/7 form-face, calendar 3/3 multi-color `.rbc-event` (7/17/9 pills), v1gantt 2/2 (tick stroke + today stroke + baseline computed). 经营总览/应用中心 shot-only (B5 owns JSBlock interiors).
- W6 regression: `w6b2-rules` assert 全过; `w6b9-cockpit` requires `--demo` first (对账单/催收 rows are demo data) then assert all green — the three first-run misses were the missing seed, not the heal. `w7b0-theme --assert` OK after the overlay re-apply; `pnpm run typecheck` exit 0; oxlint on the touched scripts 0/0.

## Pitfalls pinned

- **Importing a sibling batch script executes its CLI main** (`w7b23-heal.mts` runs `main()` at import, printing usage and setting exitCode 2): cross-batch reuse copies the palette block instead of importing — the established per-batch self-contained pattern (w7b1 → w7b23 → w7b4) is load-bearing, not stylistic.
- **Aggregate stat cards need an explicit caliber** (`value:avg` over kpi_snapshots averages every historical day): snapshot metrics must pin `calc_date` to the latest day at apply time, and the card-refresh path must update the filter when the day moves — otherwise the cards show plausible but wrong numbers (875K vs 11M) that pass every structural assert.
- **`percent`-unit snapshot values store two calibers** (毛利率 −2.18 is a percent number, 账实相符率 0.9825 is a ratio): a blind ×100 in the card plane would corrupt one or the other. Left as a data-side caliber debt on kpi_snapshots, not papered over.
- **A DOM assertion for a face must target the face's real selectors**: calendar events are react-big-calendar `.rbc-event` (class-stable), while kanban lanes and grids are CSS-in-JS (class-unstable) — their assertions ride `.ant-tag` soft checks plus the schema-plane heal assert, and the vision review confirmed the strip colors the probe counted.
- **Vision review of a screenshot can misread a corrected card** (reported the pre-caliber numbers' colors); re-review after the fix confirmed 临期 2 red / 呆滞 0% neutral. Screenshot evidence pairs with computed values, never replaces them.

## Alternatives considered

Rebuild the four kanbans and three calendars as v2-native forms vs a skin-level refresh — W6 shape was verified and W7 is a visual-only round, so the forms stayed.

## Consequences

- B6 final verification reruns `w7b4-heal --assert` + the shot rig; the kpi cards' `calc_date` pin means a new snapshot day requires one re-apply (idempotent, `statcardQuery` refresh included) to move the cards forward.
- Batch rollback is one journal (`b4/w7-b4-heal-rollback.json`, 138 entries: 41 fieldEnum + 17 fieldOptions + 16 statcardAdd + 16 statcardRegen + 16 statcardQuery + 10 columnOptions + 10 gridLayout + 7 kanbanOptions + 5 calendarColor) reverse-replayed; statcardAdd destroys the created block, gridLayout restores the maps.
- Residue carried forward: kpi_snapshots percent-value caliber split (data side); 经营总览/效期看板/维保日历 JSBlock interiors (B5 layer 3b); kanban card interiors stay platform-rendered (lane colors + card tags are the block-level surface this batch owns); v1 gantt progress-fill/milestone markers remain unbuildable without a component rewrite (W2/W4 ruling stands).
