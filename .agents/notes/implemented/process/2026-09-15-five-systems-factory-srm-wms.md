# Agent Note: Five-systems factory pattern — SRM + WMS closed loops

Status: implemented

English | [中文](2026-09-15-five-systems-factory-srm-wms.zh.md)

## Problem

The five enterprise systems (CRM ERP / MES / WMS / PLM / SRM) existed as a roadmap ask: "不是有个菜单就可以了" — each domain needs a real closed loop on the NocoBase admin (v2 flowPage shape, UI-configurable), not menu shells. The H round delivered the foundation plus the first two loops with the fewest upstream dependencies: SRM (no custom blocks) and WMS (one custom block, the bin map).

## Decision

One factory script per domain on the proven E1/F1/F4 channels, uid prefixes `h4srm*`/`h5wms*`, everything idempotent by business key:

- **Foundation** — `hub_inv_products` gains five nullable food columns (shelf-life, temp zone, storage conditions, GB2760 category, allergens) with a null-guarded backfill; the legacy rows key their real `SKU-FZ-0001`-style codes, not display guesses.
- **SRM (6 collections, 8 pages)** — suppliers carry the three-tier grading split (regulatory risk / audit grade / IQC strictness) as independent fields; the admission workflow is a two-manual chain (资质审核 → branch → 现场审核评级 → branch → update 合格/已拒绝) and the `<60` score card triggers an auto-CAPA `create` node. Seeds run before workflow creation so first-run rows never queue approval tasks; the script self-heals past double-created workflows and charts.
- **WMS (9 collections, 9 pages)** — lots carry the four-date food model (production/expiry/removal/alert) with the supplier trace anchor; stock is the UNIQUE SKU×bin×lot×status balance with a `version` column; movements is append-only. Document posting is a script-side engine (not a workflow) because the workflow update node cannot do read-modify-write arithmetic on the four quantities: `--post-shipment/--post-receipt` apply the delta through a version-checked filtered update (a stale version answers zero rows and fails loud — live-probed), append the ledger row, and flip the document single-shot. `--fefo` allocates by 应下架日 ASC. An opening-balance alignment emits one ADJUST movement per (product, lot) so stock == Σ movements from seed birth and stays there.
- **Bin map (the A-route block)** — probe verdict: full GO. The runjs allowlist rejects `ctx.api.resource(...).list` inside a JSBlock with a precise repair hint; the accepted vocabulary is `ctx.makeResource('MultiRecordResource')` + `setResourceName/setFilter/setPageSize/refresh/getData`, with `ctx.render` top-level. The 72-bin four-status grid with hover summaries renders from live data.

Verify gates grew with each batch: missingV2H4/H5 title lists, the 供应链/仓储管理 group probes, srm_/wms_ row floors, the food-column probe, JSBlockModel presence, and the n18ai- floor 25→33→42; the all chain replays both scripts before n18.

## Consequences

Two of the five systems now have real closed loops on the admin (SRM admission→audit→CAPA, WMS receive→putaway→FEFO→post→count) with verify-enforced floors, and the JSBlock probe verdict unblocks the I/J-round custom blocks on the A route. Posting correctness lives in one engine with a live-probed optimistic lock, and the stock==Σmovements invariant is asserted rather than assumed. The remaining systems stay off the menu until their rounds land.
## Alternatives considered

**Workflow-driven posting.** The two-node "update stock + write movement" workflow cannot compute `on_hand + delta` (no read-modify-write in the update node); the calculation-node chain needed for it would put the ledger's integrity in variable templates. The script engine keeps the arithmetic in one testable place; the count workflow (差异 → manual → done) covers the approval surface workflows are good at.

**GridCard fallback for the bin map.** Reserved as plan B; the probe found the A route fully viable, so the fallback stays unused. For I/J-round blocks (PLM BOM tree), the TreeBlockModel route remains the recorded candidate.

**Sub-table documents for receipts/shipments.** Head-line sub-collections would add two tables beyond the nine-table budget for no demo value; flat line-level rows with repeated header fields carry the same semantics.

**The user-named 对账/寻源比价 tables.** The R9 report's MVP cut explicitly defers reconciliation matching and multi-round sourcing; the H4 six tables follow that cut (certificates, checklists, and audit records instead), which is what the warn-band, radar, and CAPA acceptance actually exercises.
