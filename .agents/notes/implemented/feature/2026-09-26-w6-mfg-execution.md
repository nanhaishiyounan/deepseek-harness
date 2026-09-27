# Agent Note: W6/B6 manufacturing execution — the three-quantity model, the quarantine-before-OQC completion leg, and the dual cost columns

Status: implemented

English | [中文](2026-09-26-w6-mfg-execution.zh.md)

## Problem

B5 left the manufacturing domain at the planning boundary: MOs approve and release, the FCS engine freezes day buckets, but nothing executes. The batch (plans/2026-09-25-mfg-closure/07-b6-mfg-execution.md) had to land the execution loop — kit check (齐套), material issue/return, operation reporting, completion, OQC release — over the B4 reservation engine as the single ATP fact source, plus the cost dual columns, without breaking the `stock == Σmovements` ledger gate or the B5 approval axis.

## Decision

**The three-quantity model rides output equivalents, not material sums.** `mfg_orders` grows `qty_transferred` and `qty_consumed` next to the existing `qty`: transferred is the output equivalent the net issued materials cover (`min` over BOM components of `Σ(issued − returned) / (qty_per × (1 + scrap%))`), consumed is the **last** operation's cumulative reported quantity (the output; intermediate operations report their own throughput). Material sums across mixed units (kg + 个) would be ledger noise, and a first-operation report is not output — the last-operation reading is what completion gates against.

**Kit = ATP per component + hard reservation in the same action** (PLAN D6/D7). `availabilityCheck` recomputes every component's `qty_available` sum against `qty_per × (1 + scrap%) × mo.qty`, reserves covered components through the B4 `reserve()` (FEFO pick, `RSV-MO-{code}-{nn}` codes, `ref_type=MO`), and writes the verdict plus the shortfall ladder onto `mfg_orders.reservation_state` / `kit_data` — the mobile kit card reads that JSON instead of re-deriving. Partial kits reserve what fits (Odoo partial reservation); a re-run after a top-up releases the MO's earlier picks first so the FEFO re-pick sees the grown pool.

**The WIP leg is a real stock location, and issues/returns post ± pairs.** A third virtual zone `SH-WIP` (车间线边) joins `SH-ADJ`/`SH-TR` with one bin. `postIssue` gates on `released/in_progress` + `reservation_state=assigned` + per-component cumulative-≤-reserved (超领被拒), consumes the reservation (allocation returns; the on-hand write belongs to the posting leg — B4's two-phase contract), then moves stock reserved-bin → WIP with an `ISSUE_WIP` ± pair. `postReturn` mirrors with `RETURN_WIP` back onto a qualified bin; the reservation stays consumed (a return corrects, it does not un-reserve). The first issue advances `released → in_progress`.

**Reporting gates on in_progress and per-operation cumulative ≤ MO qty.** `postJobReport` refuses a not-yet-executing MO (未 released 不能领料/报工 — the stricter in_progress form, since reporting implies materials moved), advances the operation planned → started → done (done at MO quantity), and lands the IPQC anchor `qc_status` (`not_required` default; B8 deepens). Completion refuses any unfinished operation (末工序报齐) and any quantity above the last operation's cumulative good quantity.

**Completion quarantines before OQC; the release reuses the B3 pattern.** `postCompletion` creates the finished lot (four dates off `shelf_life_days`, the postReceipt food model), lands it **hold on the 待检区** with a single `RECEIPT_MFG` movement, sets `oqc_status=pending`, advances the MO to `completed`, and settles costs in the same posting. `releaseCompletion` is the `--release-receipt` isomorph: hold → good across bins with a ±`MOVE` pair, lot → qualified, `oqc_status=passed`; failed/concession refuse (B8 owns disposition). The finished-goods reservation against a sales order stays a B7 hook — recorded, not implemented.

**Cost dual columns settle at completion, never into accounting vouchers** (PLAN D11). `std_cost` is rewritten as the BOM 标准卷算 total (`Σ demand × hub_inv_products.unit_price + Σ operation planned_min × rate`) — the B5 unit-cost reading of the same column was a planning-time estimate whose approval routing already consumed `estimated_cost`, so the completion-time overwrite loses nothing; `actual_cost` = `Σ(issued − returned) × VWAP + Σ reported duration × rate`, `cost_variance = actual − std`. The VWAP weighs every positive movement by its resolvable inbound price (the PO line's `unit_price` when the movement's doc traces to a receipt with a PO, else the product master price) — `wms_movements` carries no amount column by design, so the valuation reads the ledger's counterpart documents instead of adding one.

## Consequences

The execution columns (`qty_transferred`/`qty_consumed`/`actual_cost`/`cost_variance`/`kit_data`) and the `in_progress`/`completed` terminals are now part of the mfg_orders contract every later batch reads; ISSUE_WIP/RETURN_WIP/RECEIPT_MFG legs ride the shared ledger; finished goods quarantine before OQC is the default landing for every completion.

## Alternatives considered

- **`qty_transferred`/`qty_consumed` as material sums** — mixed units make the number meaningless and unmintainable by hand; the output-equivalent min is checkable against the psql ledger.
- **A `kit_status` column + client-side derivation** — the mobile LLM cannot recompute the BOM walk; persisting `kit_data` keeps the read side a single `nb_list`.
- **OQC as a boolean on the completion** — the five-value vocabulary (`not_required/pending/passed/failed/concession`) matches the B3 IQC anchor, so B8 reuses the shape instead of migrating it.
- **Cost per finished unit** — the batch checkbox asks for the three columns on the MO row; unit costs derive by division where a report needs them.

## Verification

`nocobase-w6-mfg-exec.mts --demo-chain` walks the full loop with four gate negatives (draft kit refusal, partial-MO issue refusal, over-issue refusal, over-completion refusal) and asserts the terminal state; `setup-nocobase.mts verify` owns the cross-batch floors (collections, five pages, columns, enum terminals, WIP zone, movement legs, seed floors, MO-2026-0003 staying draft); the ledger gate runs after every posting verb. Evidence: research/2026-09-25-w-round/b6-psql.txt + b6-*.png.
