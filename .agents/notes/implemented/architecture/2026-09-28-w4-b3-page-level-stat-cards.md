# Agent Note: W4-B3 page-level strengthening — direct-write stat cards, grid reordering, configurable iframe base

Status: implemented

English | [中文](2026-09-28-w4-b3-page-level-stat-cards.zh.md)
- Date: 2026-09-28 · Batch: W4-B3 (plans/2026-09-28-w4-completeness/03-b3-stats-pages.md)
- Code: `examples/kb-agent/scripts/w4-heal-b3.mts` (heal/assert/reconcile/rollback/levels); `examples/kb-agent/scripts/nocobase-flow-page-lib.mts` (`metricChart`/`ensureMarkdownHint`/`statCardRaw`/`seatGridTopBlocks`); `examples/kb-agent/scripts/setup-nocobase.mts` (verify gains the w4b3 assertions); `examples/kb-agent/scripts/nocobase-w3-views.mts` (terminal-source env unification); `examples/kb-agent/DEPLOY.md` + `DEPLOY.zh.md` (the W3_TERMINAL_BASE deployment item)
- Evidence: `research/2026-09-28-w4-completeness/w4-b3-*` (page-levels ledger / heal-run / probe-after / psql-reconcile / iframe-env / journey-*.png / statcard-*.png)

## Problem

The W3-era pages opened flat: no per-page KPI reading at the top, no orientation hint, and the three operator terminals hardcoded to one origin. W4's page-level plan (L1 document pages get 3–5 stat cards plus an explanation block, L2 master-data pages 1–2 counting cards, L3/L4 none) had to land on live pages whose authoring channel (`flowSurfaces:addBlock`) fails outright on kanban-bearing surfaces.

## Decision

1. **Stat cards = ChartBlockModel single-value aggregation + a `visual.mode:'custom'` raw big-number template, written directly through `flowModels:save`** (the D3 bypass channel). The raw first line carries the `/* w4b3 statcard */` marker; the markdown hint block carries an invisible `<!--w4b3-->` tail — addBlock mints random uids that no prefix rollback can target, so marker + `w4b3`-prefixed uid (direct-written blocks) identify the batch on both tracks.
2. **addBlock on kanban-bearing pages is rejected by authoring validation** (处置看板: `kanban cardViewAction popup invalid` — addBlock re-validates every inline popup on the surface, and a kanban card popup without collection fieldGroups fails the whole 400, independent of the new chart). Bypass: stat cards and hint blocks go through direct `flowModels:save`.
3. **A direct write must match the canonical form the renderer actually reads**: query uses `collectionPath: ['main', collection]` (a `resource` object is ignored by the query executor → the chart renders the "please configure" placeholder); filter uses the three-part `{logic:'$and', items:[{path,operator,value}]}`; markdown body lives in `stepParams.markdownBlockSettings.editMarkdown.content` (a bare `props.content` renders placeholder text); `name` mirrors the uid and `sortIndex` is mandatory.
4. **Grid block order comes from `stepParams.gridSettings.grid.rows/sizes/rowOrder`** (with the props double-write mirror) — sortIndex does not participate and addBlock always appendRow. `seatGridTopBlocks` reorders: one hint row (24) + one card row (n cards splitting the 24 columns), original rows preserved after; reruns converge (strip this batch's uids, drop empty rows, rebuild the two rows at the rowOrder head).
5. **"This month" cards materialize their window**: the query builder has no relative-date expression, so the heal computes `${YYYY-MM}-01` into the filter at run time, the card footnote states the anchor date and the counting verb (e.g. "by approval date, not creation date", against P-2' misreading); a cross-month rerun refreshes it.
6. **Configurable iframe base (D10)**: `W3_TERMINAL_BASE` (preferred) > legacy `W3_TERMINAL_ORIGIN` > default `http://127.0.0.1:13110`; the heal's `--iframe` leg only swaps the origin (path and operator params preserved), and a rerun without the env returns to the default with zero drift. The w3-views page-builder channel reads the same env.
7. **L1/L2 leveling ledger** (`w4-b3-page-levels.json`): L1 = 30 document pages (3–5 cards + hint each), L2 = 20 master-data pages (1–2 counting cards), L3/L4 zero additions (completeness ≠ filling everything); the assert judges level violations by marker blocks.

## Consequences

- **addBlock has page-level side effects**: it does not just create the new block — it re-validates and rebuilds every inline popup on the surface, so any pre-existing invalid block fails the whole call. Prefer direct writes when adding blocks programmatically to pages with legacy popups.
- Direct-written and addBlock-created blocks look nearly identical in flat rows (props/stepParams.configure both present); the only reliable discriminator is rendering: charts read `query.collectionPath`, markdown reads `editMarkdown.content`. A probe reading the row ≠ the frontend rendering it.
- Negative or large sortIndex cannot move grid blocks — do not spend time on ordering; edit rows directly.
- ECharts canvas text never enters `innerText`: DOM audits cannot judge card content; use pixel reading (screenshots) or `toLocaleString` expectation comparison.
- The "all/any" dropdown is a null-semantics filter, not a status filter; to force an empty list pick an enum with no rows (e.g. 已驳回) and confirm the FilterForm actually submits (请假审批's submit button reads 筛 选).
- **member-role stat cards render the placeholder (upstream ACL interaction)**: `POST /api/charts:queryData` is 403'd for non-root roles by plugin-data-visualization's `checkPermission → applyQueryPermission` (plugin-acl) — even with member holding view/list on the target collection (full field lists plus id/`*` experiments all fail). admin/root render fine (desktop + 390px both verified). The member `charts:queryData` grant row is in place (necessary, not sufficient; the assert only claims the row exists); the qc_inspector 390px forensics (w4-b3-member-390-qm.png) record: layout/hint/table data normal, cards placeholder. Close after upstream clarifies applyQueryPermission's semantics for aggregate queries.
- The "this month" card window is materialized at heal time (`${YYYY-MM}-01` hardcoded); a cross-month rerun of `--all` refreshes it — noted in the deployment checklist.
- Acceptance: `w4-heal-b3.mts --assert` (mounted in setup verify) checks L1 30 pages ≥3 marker cards, L2 20 pages ≥1, full hint coverage on L1, every ChartBlockModel's props.title non-empty (18 legacy + new cards), terminal iframe urls prefixed by W3_TERMINAL_BASE, zero L3/L4 marker leakage. `--reconcile` generates psql expectations per card for six pages (`w4-b3-psql-reconcile.txt`); journey screenshots read back matching (采购订单 3/10/¥1,474,740/22, 请假审批 3/20天/5, 处置看板 7/1/¥9,781.15). The iframe negative leg (`W3_TERMINAL_BASE=http://127.0.0.1:9999 --iframe` flips three urls; rerun without env returns to 13110) and the rollback drill (`--rollback --page 比价表` destroys 4 marker blocks → `--all` rebuilds → assert green) both pass; zero regression across setup verify (w4b1/w4b2/w4b3), ledger balance, tree anomalies=0, audit comparison pagesChart 8→58 (58 of 92 pages carry a chart block).

## Alternatives considered

- Riding `flowSurfaces:addBlock` for every new block — rejected: kanban-bearing surfaces fail authoring validation wholesale, and random minted uids defeat prefix rollback; the direct-write channel with marker comments is the track that satisfies both.
- Keeping per-terminal origins hardcoded in the page trees — rejected: deployments move the terminal service; one env knob (W3_TERMINAL_BASE) with a legacy fallback keeps the pages environment-portable without a rewrite per move.
