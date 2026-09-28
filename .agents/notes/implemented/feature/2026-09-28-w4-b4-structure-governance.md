# W4-B4 structure governance — the retire protocol executed, dual-channel renames, duplicate-group dissipation

English | [中文](2026-09-28-w4-b4-structure-governance.zh.md)

- Date: 2026-09-28
- Status: implemented
- Scope: `examples/kb-agent/scripts/w4-heal-b4.mts`, `examples/kb-agent/scripts/setup-nocobase.mts` verify (missingV2Hub / n18ai count / w4b4 assert block), `examples/kb-agent/scripts/w4-heal-b1.mts` (FilterForm floor), `examples/kb-agent/QUICKSTART.zh.md` (menu tour)

## Decision

Every keep/retire/rename verdict lives in the verdict-台账 constants at the top of `w4-heal-b4.mts` (`V1_VERDICTS` / `RETIRE_SPECS` / `RENAMES` / `MOVE_SPEC` / `DUPLICATE_GROUPS`); each `--all` run projects them wholesale to `research/2026-09-28-w4-completeness/w4-b4-verdicts.json` — the ledger and the executor cannot fork.

- **Retire protocol (the N14 lesson made executable)**: ① psql `COPY ... TO STDOUT WITH (FORMAT csv, HEADER true)` full archive (row count reconciled against `COUNT(*)`; a mismatch refuses the delete) ② flowModels inbound-reference audit (any other page's row mentioning the schemaUid fails loud — no retiring a page whose entry points are not cleaned) ③ DELETE the tabs child rows first, then the flowPage row (`desktopRoutes:destroy` cascades the flowModels tree) ④ collections and rows stay read-only (invariant 3). Two pages retired: 采购联系人（历史） (hub_po_suppliers, the dead page) and 工作台 (hub_pj_tasks + hub_tk_tickets aggregate, triple-overlapping AI 工作台 / 工单).
- **v1 verdicts**: 任务甘特 kept (no v2 gantt-block equivalent), 排产甘特 kept (timeline vs table complement), 应用中心 moved into 基础数据 (`desktopRoutes:update parentId`; a v1 page row's menu title rides the route row alone — no second channel).
- **13 duplicate groups**: 11 kept (multi-view / multi-role division of labor); retiring 工作台 dissipates both hub_tk_tickets×3 and hub_pj_tasks×2 (the inventory口径 = TableBlockModel collection binding; assert locks hub_tk=2 / hub_pj=1 / hub_po_suppliers=0).
- **Rollback channel**: no hand-rebuilding flowModels trees (a half-baked tree is worse than a missing page); `--rollback` guides replaying `nocobase-f3-hub-v2.mts` (rebuilds pages and block trees under the old titles) → `nocobase-w2-supplier.mts` (retitle), with the destroy ledger and subtree JSON fully on disk.

## Pitfalls

- **The sidebar renders the RootPageModel title, not desktopRoutes.title.** Renaming 排产看板→排程明细 touched the route row first: API asserts green, route snapshot correct — sidebar and breadcrumb still old. The second channel is the RootPageModel directly under the flowPage schemaUid, with the title redundantly stored in `props.title` AND `stepParams.pageSettings.general.title`; both must be written via `flowModels:save`. Every later rename (the B5 list) must reconcile both channels.
- **Hardcoded titles/counts in existing asserts move with the behavior** — four cases here: setup missingV2Hub list (drop the two retired pages), missingB5 排产看板→排程明细, missingB8 AQL抽样方案→AQL 抽样方案, n18ai- button floor ≥82 → ≥79 (the cascade destroyed 工作台's two + 采购联系人's one popup AI buttons); w4b1 FilterForm floor 37→36 (the retired page took one block).
- **psql counts need `-t -A`**: the default output carries the header and `(1 row)` footer, `Number()` parses NaN, and the reconciliation error misleads (csv=11 psql=NaN).
- **v1 `page` rows carry tabs children too**: the orphan assert's legitimate tabs parent set is flowPage ∪ page; recognizing only flowPage falsely orphans the three v1 pages.
- **`nocobase-f3-hub-v2.mts` is the retired pages' resurrection source**: re-running it rebuilds both pages under old titles (w2's retitle then revives 采购联系人（历史）). Do not re-run f3's hub leg after B4; setup verify's missingV2Hub assert now demands they stay gone.
- Playwright sidebar-text probes must run **inside the target page's own context**: the `/admin` landing folds unopened groups, and body.innerText misses folded group text — a false "menu not renamed" report.

## Acceptance

- `w4-heal-b4.mts --assert` (in setup verify): retired schemaUids absent, route totals 206→202 (16g/90f/93t/3p), 「采购」group kept as an empty shell (B5 owns the merge), four renames reconciled on both channels, 应用中心 under 基础数据 (children=2), three CSVs == psql counts (11/20/40), v1 pages getProperties 200, retired surfaces 404, orphan tabs/flowPage=0, duplicate-group counts met.
- Journey forensics (`w4-b4-journey.txt` + screenshots): admin opens 排程明细 fully functional (table 16×9 + ViewActionModel×1 + FilterFormBlockModel×1 — B1/W3 gains intact); both retired URLs render the frontend 404 (text + no table).
- Idempotence: a second `--all` skips everything (removed/added/retitled/moved all empty), archived as `w4-b4-idempotent.txt`.
- Zero regression: setup verify green across w4b1–b4; `--assert-ledger` balanced; `.trees.mjs` anomalies=0; b9 chain s9 (wfl trail + movements reconciliation) passes — hub_pj_tasks/hub_tk_tickets rows untouched, the engine never depended on the retired pages' UI.

## Leftovers

- 「采购」group is now empty (children=0): kept on purpose; the empty-group merge/delete belongs to B5's menu IA (D8 migrate-before-destroy).
- The RootPageModel dual-channel rename constraint binds B5's full rename list: B5 must reuse this batch's dual-channel logic (or lift it into flow-page-lib), or repeat the stale-sidebar failure.
- member 390px dual-end sampling not exercised here (B4 changes are menu-layer only; the member view is covered by B6's eight-role journeys).
