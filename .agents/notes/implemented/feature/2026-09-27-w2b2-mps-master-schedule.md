# Agent Note: W2-B2 the MPS master production schedule — max(SO open, forecast) merge, covered exclusivity, and the MRP demand-source switch

Status: implemented

English | [中文](2026-09-27-w2b2-mps-master-schedule.zh.md)

## Problem

The W-round MRP close ([mrp-run.mts](../../../../examples/kb-agent/scripts/mrp-run.mts)) fed only approved-not-shipped SO lines into `gross0` — no forecast layer, no planning buckets, and a hard-wired 60-day JIT window (99 leftover #7). W2-B2 ([02-b2-mps.md](../../../../plans/2026-09-27-w2-evolution/02-b2-mps.md)) adds the MPS layer: `mps_plans` (a 3–6 monthly-period container) + `mps_plan_items` (item × period rows), merges demand as max(SO open, forecast) (ERPNext v16), switches the close's demand source for covered items from the SO direct feed to the merged plan rows, and makes the window overridable — with the hard constraint that a close with no approved plan rows stays byte-identical to the W-round output.

## Decision

**planned_qty is pinned as the item-period total independent demand.** `mergeDemand(soOpen, forecast)` = max with a tie riding `so`; the winning side lands in `driver` (`so`/`forecast`). The max merge needs no forecast-consumption window and no time fences: ERPNext and Odoo ship none, and the 建议→人工确认→下发 flow already provides the soft fence (PLAN D3). Fences stay out until an auto-release feature demands a PTF.

**Covered exclusivity is enforced in the close, not by convention.** `runMrp` reads the latest approved plan (by `period_from`), collects its items' product ids as `covered`, skips every covered item's SO lines, and appends the plan rows as demand with `need_date = <period>-15` (月中锚点) and `driver = mps:<plan.code>` — the same Odoo warning MPS × direct replenishment double-counts. `mrp_snapshots.driver_so` was already an opaque nullable string, so the `mps:` prefix rides it without a schema change; `mrp_suggestions` gains the additive `mps_plan` back-link (written only on MPS-driven rows so the W-round write set never names the column). `confirmSuggestion` routes an `mps:` driver through `assertSourceEffective('mps_plans')` — a voided plan's open suggestions refuse conversion.

**The approval transition is the snapshot lock-in.** `seedMpsFlow` registers `mps_plans` on the shared six-state vocabulary (no amount column, one round). The engine's effective hook (serve `/act` and the CLI) re-runs the merge once; later SO shifts never touch an approved plan — `--refresh-mps <planId>` is the explicit re-baseline. `recalcPlan` re-aggregates per (product, period) from approved-not-shipped SO lines whose *header* `need_date` falls in the period month (`so_order_lines` carries no row-level need date — the header is the W-round demand-date authority too).

**`MRP_HORIZON_DAYS` overrides the JIT window, fail-loud.** Positive integer or a refusal naming the raw value; unset keeps `PLAN_HORIZON_DAYS = 60`. One caveat inherited from the SO aggregation: `gross0` keys by product and keeps the earliest need, so a far period is only observable on an item whose rows are all far — the seed's window case is the uncovered SOY SO (need p3-05), not a multi-period SNA row.

**The seed owns its lifecycle.** The demo plan (SNA × 3 periods, BEV/FRZ × hand-check periods) and three draft SOs (SO-2026-0091/0092/0093) seed idempotently; `--demo-mps` self-heals void/approved rows back to draft (the SEED_SOS direct-write precedent), runs M1–M9, and voids everything back out through the engine so the resting demand set keeps the W-round shape — the chain's last step diffs the void close against the pre-batch baseline export row by row.

**Known hazard: the CLI `--act` post-effective hook parks an unsettled top-level await.** After `act()` succeeds, the dynamically imported mrp-run hook leaves `await main()` unsettled once the event loop drains — Node exits 13 with "unsettled top-level await" (tsx/esm + top-level-await module; reproduced deterministically). The serve path keeps the loop alive and works (proven via `/act` returning the recalc array); `--demo-mps` therefore rides the library `act()` + an explicit `recalcPlan`. The so_orders reserveForSo hook on the same CLI branch is equally dead path — it was never exercised in W-round acceptance (b9 used library calls).

## Alternatives considered

- **Forecast consumption (netting SO against the forecast) and time fences** — refused: the max(SO open, forecast) merge needs no consumption window by construction (the larger side wins; nothing double-counts), and ERPNext v16 / Odoo ship no fences; the 建议→人工确认→下发 flow is the soft fence a real deployment needs.
- **Feeding covered items through both the plan rows and the SO direct line** — refused: that is exactly the Odoo-documented MPS × reordering double count; `runMrp` skips covered items' SO lines in code, and setup verify owns the historical invariant (an `mps:` level-0 row excludes SO rows for that item in the same run).
- **Row-level need dates on so_order_lines for the period aggregation** — impossible as-built: the collection carries no row-level date and the header need_date is the W-round demand-date authority; `recalcPlan` aggregates by header month instead of inventing a new column.
- **cordis.yml Config for `MRP_HORIZON_DAYS`** — refused (PLAN D7): the engine scripts are standalone processes, not plugins; the flow-config data row and env are this deployment's established configuration seats.
- **A dedicated `mps_driver` column on mrp_snapshots** — refused: `driver_so` is already an opaque nullable string; the `mps:` prefix rides it without a schema change and keeps the demand-source story single-column.

## Consequences

`mps_plans`/`mps_plan_items` collections, the 主生产计划 page (forecast editable, planned/so_open/driver engine-written), and the mps flow land in the w7 script; setup verify gains the collection/page/flow/back-link/seed assertions plus a historical covered-exclusivity invariant (any run carrying an `mps:` level-0 row must carry `mps:` exclusively for that item — a mixed run means SO+MPS double-counted) and the n18ai- floor moves 78→80. The mobile registry grows to seventeen forms (预测登记; preset.yml capabilities + description + both `.dsh` mirrors updated in lockstep) and the plan skill answers MPS queries with a report card. One boundary recorded: an approved plan covers its items at the product level, so a covered item's SO demand in a month the plan's outlook does not span drops out of the close — the seed spans three periods (90+ days) so the 60-day window never sees it, and wider outlooks ride `MRP_HORIZON_DAYS`.

## Acceptance evidence

`research/2026-09-27-w2-evolution/`: `w2-b2-baseline-snapshots.txt` (the pre-batch W-round close export; three post-change closes diffed row-identical against it), `w2-b2-mps-mrp.txt` (five psql sections: the two max-merge hand-checks, the covered-exclusivity run with the gross identity and the uncovered SOY counterexample, the confirm back-links, the zero-drift diff, the 120-day window run), and two PNGs (the admin 主生产计划 page with both tables, the mobile MPS query conversation with the report card over live data).
