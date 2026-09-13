# Agent Note: NocoBase v2 view-block upgrade mechanics (kanban/calendar factory, multi-block pages, the authoring-channel divide)

Status: implemented

English | [中文](2026-09-13-nocobase-v2-view-block-upgrade.zh.md)

## Problem

15 of the admin backend's 26 business pages were still v1, none with the AI floating ball or the form fill buttons; 任务看板/任务日历/任务甘特 had been kept v1 in the E round on the claim that 2.2.6 ships "no view block model". F round had to verdict that claim, upgrade everything upgradable, and make the two misnamed 仪表盘 pages earn their name — without touching the vendored snapshot or the 269 live business rows.

## Decision

Four seed scripts (`examples/kb-agent/scripts/nocobase-f1-view-v2.mts` / `nocobase-f2-crm-v2.mts` / `nocobase-f3-hub-v2.mts` / `nocobase-f4-charts.mts`) extend the E1 factory contract; no vendored plugin changes.

- **Four-evidence-layer upgradeability test**: plugin client-v2 `registerModelLoaders` → flow-engine `node-use-sets.ts` whitelist → `support-matrix.ts` → official fixtures/contract tests. Kanban and calendar clear all four (the E-round misjudgment stopped at the core model catalog); gantt has client registration only and zero support in the other three, so it stays v1.
- **Two iron rules for the fixture→direct-save mapping** (F1 findings): direct `flowModels:save` uses the `*.raw-persisted.json` shape — ① DetailsItemModel.field must be a single object (the canonical array is the addBlock input; saved directly, `renderItem` throws `createFork is not a function` and every card renders as the error form); ② GridModel-family blocks must carry their own `props.layout.rows` referencing the item uids (the skeleton fixture ships none; without it the cards render blank). Kanban card chain: KanbanBlockModel(props incl. groupField/groupOptions/dragEnabled/sortField) → KanbanCardItemModel → DetailsGridModel(+layout) → DetailsItemModel(fieldPath) → Display*FieldModel.
- **Charts take the authoring channel, never a direct save**: a directly-saved raw-shape block never enters the DOM (the client reads only the server-canonicalized collectionPath/field-array form). Use `flowSurfaces:addBlock + settings{query,visual}` (the wire shape reuses the upstream NocoBase 2.2.6 native contract tests' flow-surfaces fixtures — this repo adds no test for it); mapping keys are per type (bar/line={x,y}, pie/doughnut/funnel={category,value}); idempotence keys on the block's query target (collection+dimension) under the grid because addBlock mints fresh uids. The divide in one line: direct-save what fixtures persist verbatim; authoring-channel what the server must canonicalize.
- **Multi-block pages**: one flowPage whose BlockGrid items carry N TableBlockModels (工作台 = tasks + tickets, 分类维护 = four category tables), each with its own AddNew→CreateFormModel popup (n18 mounts per form). The v1 "分类维护 four tabs" was actually one page with four stacked blocks (a single tabs route row); the v2 same-shape rebuild is equivalent. Composite kept-spines match by uid prefix + collection (a bare collection match passes a truncated composite page because E1/F1 own blocks on the same collections).
- **Generalized truncation guard**: the flowModels catalog crossing 1000 rows exposed that n18's orphan sweep never failed closed — a truncated list misjudged five live forms as orphans and deleted their buttons. Uniform repo-wide: pageSize 2000 plus compare `meta.total` when present, full-page-when-absent means truncation.
- **Rollback/idempotence inherit E1 verbatim**: read-modify-write rollback records keyed by title (including the v1 rows' tabs children), flushed before every destroy, orphan sweep against the post-destroy list, full-batch heal; the titleField fix extends to six more crm/hub collections (the m2o-column rendering prerequisite).

## Alternatives considered

**Kanban Add new via the quickCreate channel.** Rejected: n18 mounts only on top-level CreateFormModels; quickCreate forms are outside its scan. **分类维护 as page-level RootPageModel tabs.** Dropped: the v1 page was already stacked blocks; same-shape is equivalent and skips probing a new form. **Charts via the updateSettings channel.** Workable but two steps (addBlock skeleton + updateSettings payload); addBlock+settings does it in one.

## Consequences

End state: 26 flowPages (25 business + the AI workbench), v1 down to gantt and the app hub; n18ai-=29 (exactly one button per top-level CreateFormModel); 269 business rows untouched; kanban renders 7 grouped columns + six-field cards + sortField drag, calendar the month view, four charts with real aggregations, and the AI chat generated a live pie (银行转账 5/信用证 3/承兑汇票 2 matching the real rows). The stale E-round boundary claims were revised everywhere they lived (E1 note boundary section, e1 header comment, probe-notes, QUICKSTART). Evidence in `demos/acceptance-f{,1..5}/`; probe findings in `demos/acceptance-f5/probe-notes-f.md`.
