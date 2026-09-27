# Agent Note: B4 inventory practice — ± movement pairs, two-phase reservation, ROP, count-approval write-back, and the single-entry guard

Status: implemented

English | [中文](2026-09-26-b4-inventory-single-entry.zh.md)

## Problem

After B3 the WMS engine still had three gaps: ① no REST bypass interception (the admin role's strategy-wide authorization PATCHed `wms_stock` with HTTP 200); ② `--post-transfer` missing (transfer documents never posted, and `releaseReceipt`'s single positive MOVE row double-counted the per-(product, lot) ledger sum); ③ count differences approved but never written back to stock. Reservations were a bare `qty_allocated` column with no document, and safety stock / reorder points had neither columns nor alerts. Batch 05-b4 requires the engine to become the single inventory entry and to add these four practice capabilities.

## Decision

- **Single-entry guard (two layers)**. Structurally, `ensureBypassGuard` plants explicit `rolesResources` rows for the admin role (`usingActionsConfig=true`, actions=view/list/get/export) that override the strategy's create/update/destroy on both `wms_stock` and `wms_movements`. At runtime, `assertLedgerBalanced` (per (product, lot): Σ stock.qty_on_hand == Σ movements.qty, tolerance 0.01) gates both `--demo-chain` and setup verify. The root API token the engine uses bypasses ACL by design. Measured: PATCH 200 before narrowing, 403 No permissions after.
- **Transfer ± movement pairs.** `postTransfer` writes two MOVE rows per leg (source −qty without to_bin / target +qty without from_bin) so the per-(product, lot) net stays zero — a transfer never drifts the lot-total identity. Guards: source status hold (待检禁移 until IQC release) or blocked refuses; neither endpoint may sit on a virtual zone (SH-ADJ/SH-TR); the target may not be the quarantine SH-Q (that zone is only entered through IQC routing); available qty short of the ask refuses. Two-step mode (transfer_mode column): `--post-transfer <no> out` parks the mid-leg on SH-TR-01-01 with status in_transit; `--post-transfer <no> in` completes.
- **Two-phase reservation (the D7 light form).** `wms_reservations` (code/ref_type SO|MO|SHIPMENT/ref_id/product/bin/lot/qty/status reserved|consumed|released/released_at) is ATP's single fact source (B6 kit-check and B7 shipping consume it). At creation the engine fills lot/bin by the FEFO pick — of the create→pick→consume phases, the pick moves up to creation; split reservations over multiple lots stay for B6. ATP = Σ good rows' `qty_available` (the row-level on_hand − allocated − locked, the same number FEFO picks by); the reservation lands on the stock row's `qty_allocated` (a materialized projection under the same optimistic-lock version gate); consume returns the projection and the issue leg (postShipment) alone moves on_hand; release restores ATP and records released_at. Over-reservation refusals quote the current ATP.
- **`rebalanceLedger`.** The seed-time opening-balance alignment generalizes into an anytime full compensation: a group with stock rows emits one ADJUST row of `stock Σ − movements Σ` (on the group's bin); an orphan ledger group with no stock row emits a cancel row against the loss bin. History is never edited (D8) and a balanced world emits nothing. The main flow calls it at the end and `--rebalance` exposes it standalone. `releaseReceipt` now writes the ±MOVE pair, closing the fresh-drift source.
- **Count-approval write-back.** The count workflow rebuilds as manual → condition → (TRUE) request `POST :13110/post-count-adjust {count_no}` → update done / (FALSE) update difference. The engine's `postCountAdjust` validates status ∈ {difference, adjusting}, writes one COUNT_ADJUST row (qty=difference, opponent SH-ADJ — the Odoo Inventory Loss pattern), corrects stock through `applyStockDelta`, and lands status=done (the follow-up update node is idempotent). The manual submit wire: `workflowManualTasks:submit?filterByTk=<id>` with the body carrying `{result: {_:'resolve', f1:{}}}` at the top level (wrapping it in `values` returns 400).
- **ROP suggestions.** hub_inv_products gains abc_class/reorder_point/safety_stock/lot_size/lead_time_days/avg_daily_use (the seed writes only blank columns so hand-tuned values win). `--scan-reorder` upserts an open `wms_reorder_suggestions` row (idempotent) whenever ATP ≤ reorder_point; suggest_qty tops the pool up to reorder_point + lot_size, rounded to whole lot_size multiples (Odoo min/max semantics). Scheduling: the open-source snapshot ships no workflow-schedule plugin, so the trigger is the `POST /scan-reorder` HTTP route on `approval-engine --serve` (an external cron curls it); the count workflow's request node reuses the same serve.
- **Count plan page.** The v2 table page over hub_inv_products carries the ABC/ROP parameters. Count generation does not ride a page button (the JSBlock allowlist cannot run the snapshot-freeze arithmetic); `--gen-count <bin>` creates one counting row per good stock row on the bin (snapshot_qty frozen at the current book, abc_class copied from the product).

## Notes

- Explicit `rolesResources` rows with `usingActionsConfig=true` plus the action whitelist override the role's strategy grant; the root role bypasses ACL — the guard's acceptance must therefore be measured with a non-root user token (b4guard, admin role) expecting 403, never with the API key.
- A NocoBase password update revokes the user's sessions: the demo chain no longer rewrites b4guard's password on replay (the first version signed in right after the update and got 401 instead of 403).
- The historical drift sources — seed movements double-writing RECEIPT+PUTAWAY (+qty each), single positive MOVE rows, B3's single positive release row — are absorbed by rebalance compensation rows; from here the engine only emits balanced writes (±MOVE pairs, single signed ±delta rows).
- Demo-chain replay idempotence: before the ROP dip the chain checks for an existing open suggestion and skips post-adjust (a repeated dip once drove stock negative — postAdjust now also guards against negative results); the count step falls back to today's not-done count for the bin and skips with an explicit first-run note when all are done.
- The mobile transfer/reservation forms land draft/reserved rows that the warehouse posts through the engine CLI — the conversation creates documents and never moves stock (the bypass-guard principle on the conversation side).

## Evidence

- Engine [`nocobase-h5-wms.mts`](../../../../examples/kb-agent/scripts/nocobase-h5-wms.mts): two collections / six columns / two virtual-zone seeds, postTransfer, reserve, releaseReservation, consumeReservation, printAtp, postAdjust, scanReorder, postCountAdjust, genCount, assertLedgerBalanced, rebalanceLedger, the workflow request-leg rebuild, `ensureBypassGuard`, `--demo-chain`.
- Demo chain green (± pair / hold-refusal negative / two-phase reservation / over-reserve refusal / ROP suggestion / count write-back / balanced ledger / 403 guard): `research/2026-09-25-w-round/b4-psql.txt` (seven read-only sections, zero ledger drift) + `b4-psql.sh`.
- The real approval chain end-to-end (manual submit 202 → request callback on :13110 → engine write-back +3 → done): the serve log carries「CNT-B4-WF-908301 adjusted」.
- Dual-end screenshots: `b4-admin-{reservations,reorder,countplan,counts-done}.png` + `b4-mobile-{inventory,reorder,transfer,transfer-receipt}.png` (mobile real-LLM scenes: inventory card 1,915/60/1,815, reorder card suggesting 480, transfer draft → confirm → TRF-20260926-001 receipt → engine ±MOVE posting).
- [`approval-engine.mts`](../../../../examples/kb-agent/scripts/approval-engine.mts) `--serve` adds `/post-count-adjust` and `/scan-reorder`; [`setup-nocobase.mts`](../../../../examples/kb-agent/scripts/setup-nocobase.mts) verify grows the B4 block (collections / 3 pages / columns / virtual zones / request node / guard rows / ledger gate).

## Alternatives considered

- **Soft reservations (availability-only display)** — D7 fixes hard row reservation with a two-stage lot backfill; a soft mode forks one fact into two homes.
- **Freeze-count as the default** — D8 keeps cycle counting the default (peak-season operability); the freeze path stays optional.

## Consequences

本 Note 记录的决策自此成为对应面的现行契约（详见 Decision 与 Verification）。
