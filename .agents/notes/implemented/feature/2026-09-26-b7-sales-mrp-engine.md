# Agent Note: B7 sales→MRP linkage — the nightly net-requirement basis, one reservation source, dual-entry plan-order conversion

Status: implemented

English | [中文](2026-09-26-b7-sales-mrp-engine.zh.md)

(W-round batch B7, plans/2026-09-25-mfg-closure/08-b7-sales-mrp.md; see also [the approval engine as single source of truth](../architecture/2026-09-25-w1-approval-engine-single-source.md). Reformatted to the current note format by the B9 closing batch; the substance is unchanged.)

## Problem

How an approved SO drives replenishment, where reservations are written, and how a plan order gets human confirmation on both surfaces and converts into a formal document — B7 lands the sales-to-planning linkage as an auditable engine.

## Decision

### Decision 1: the MRP net-requirement and snapshot basis (D6 as built)

Net requirement per material per level: `net = gross + safety_stock − on_hand − inbound − wip + reserved`.

- `on_hand` reads the good stock's **qty_on_hand** (the total, not qty_available) — the reservation draw is already expressed by the `+reserved` term: reserved stock still sits in inventory but is spoken for. `qty_available` already nets the allocation out; adding both would double-count.
- `inbound` = approved PO lines `Σ max(0, qty − qty_received)`; `wip` = `Σ qty` of `released|in_progress` MOs (approved-but-not-released does not count as WIP — capacity is not yet committed).
- `safety_stock` is added once at the material level (`hub_inv_products.safety_stock`), independent vs. dependent demand undistinguished — ERPNext's merged demand-side term.
- The BOM explodes level by level: child gross = parent **net** × `qty_per_unit × (1+scrap%)`, same-level multi-parent aggregation deduplicates, depth cap 4 guards cycles. Net first, then explode (a covered parent does not drag its children).
- **JIT window** = `[today, today + 60d]` (`PLAN_HORIZON_DAYS`): only the material-aggregated **earliest need date** inside the window places an order; `suggest_date = max(today, need_date − lead_time_days)`. Far-future demand lines place nothing (acceptance negative: the +90d line yields zero suggestions).
- The close is idempotent: an open suggestion with the same key (product × plan_type × driver_so) refreshes in place; this round's demand-less open suggestions close themselves (dismissed with the reason); converted/dismissed are never touched. The snapshot table is append-only, one row per product per level per run, for psql hand-recompute (`b7-mrp-snapshot.txt` all-rows diff=0).

### Decision 2: one reservation source — MRP and 齐套 share wms_reservations

`mrp-run.reserveForSo` reuses h5's `reserve()` (FEFO lot pick + ATP over-draw refusal + allocation optimistic lock); there is no second reservation write path. B6 齐套 (`ref_type=MO`) and B7 sales reservations (`ref_type=SO`) share one table, so the `+reserved` term and 齐套's ATP deduction agree by construction (PLAN risk 6's consistency constraint).

Two implementation details:

- **The RSV code suffix parses the historical max** (`RSV-SO-{code}-{NN}` from all reservations), not the row count — `reserve()` silently returns for a known code, so reusing an old code would misread "nothing reserved" as "reserved".
- **alreadyReserved counts status=reserved only**: consumed reservations correspond to shipped quantity that `owed = qty − qty_shipped` already excludes; counting both would double-count.

The SO-approval-effective moment fires the reservation: approval-engine's `/act` and the CLI `--act` call `reserveForSo` when `doc_type=so_orders` and effective (dynamic import keeps the module graph acyclic). **No** `wms_reservations→so_orders` table gate is built: `ref_id` is polymorphic (SO|MO|SHIPMENT), a table gate would block MO reservations too; the engine-side assertion (reserveForSo demands approved) is that gate's only correct shape.

### Decision 3: plan-order confirmation — the engine strong entry + the nb composition weak entry

ERPNext's "human plan-order confirmation" on both surfaces:

- **Engine strong entry** (the only transactional semantics): `mrp-run --confirm <id>` — asserts the suggestion `status=open`, creates a draft `mfg_orders` (on the active default BOM) or a draft `pur_requests` + line, and backfills the converted_* audit chain. The NocoBase plan workbench's intent table (`mrp_confirm_intents`) rides a collection workflow → the `:13110/confirm-suggestion` callback, and the engine consumes the intent row on success — a copy of the w1 page-approval pattern.
- **Mobile weak entry**: the PlanCard confirm button sends a `plan_confirm` fence; the assistant composes three steps per the preset contract (nb_get checks open → nb_create draft carrying `driver_suggestion_id` → nb_update converted). Duplicate prevention is two-layered: the wfl gate `mfg_orders/pur_requests.driver_suggestion_id → mrp_suggestions(status=open)` blocks the nb_create bypass (creating again after conversion is refused), and the persona contract requires a pre-check.
- The converted document starts **draft** and then rides its B5/B3 approval flow — "conversion carries approval" does not mean effective-on-convert.

### Decision 4: the SO shipment leg and the movement sign convention

`shipSo` consumes the SO's reserved rows (`consumeReservation` returns the allocation), the stock draw rides h5's `applyStockDelta` (the engine's only stock writer), and the movement records `SHIPMENT_SO`. **Outbound legs must carry negative qty** — `assert-ledger` reconciles signed `Σmovements == stock per (product, lot)` and every existing PICK/SHIP leg is negative; the first version wrote positives and pierced three groups (fixed in code, and the 4 mis-signed historical movements were corrected through the API front door — lesson: a new movement type checks `--assert-ledger`'s sign convention first).

Delivery progress: line-level `qty_shipped` accumulates, the header's `shipping_status` recomputes three-state (none→partial→shipped). The demo walks "customer defers one line → release the reservation → first shipment covers one line (partial) → restock + reservation top-up → ship again (shipped)".

## Alternatives considered

(原「放弃的方案」)

- **Filtering the JIT window per demand line (not per material aggregate)**: the aggregate basis lets far-future demand hitch a ride on near-term demand (the conservative direction); the line basis would split suggestion rows by need_date and fragment the confirmation cards — B7 takes the aggregate, line splitting waits for a real need.
- **Direct suggestion→PO** (skipping the PR): the batch doc names the PR draft as the B3 entry, keeping one purchase-request entry.
- **A table gate for reservations**: see Decision 2 — the polymorphic ref_id would mis-hit the MO leg.

## Consequences

(原「影响面」)

- `examples/kb-agent/scripts/mrp-run.mts` (engine + selftest), `nocobase-w7-mrp.mts` (5 collections + 3 gates + workflow + 3 pages + demo chain)
- `approval-engine.mts` (/run-mrp, /confirm-suggestion routes + the SO-effective reservation hook)
- `nocobase-crm-modules.mts` (--revise-quote versions), `nocobase-n17-alignment.mts` (quote version column)
- mobile: `protocol.ts` (plan_suggest/plan_result/plan_confirm), `PlanCard.tsx`, `fold.ts`, `ChatView.tsx`, `projection.ts`, `formRegistry.ts` (form 16 so_orders), preset persona + .dsh mirror
- `nocobase-h5-wms.mts`: three exports added only (reserve / consumeReservation / applyStockDelta), implementation untouched

## Verification

`nocobase-w7-mrp.mts --demo-chain` (SO two-round approval → effective reservation → nightly close six-term recompute → JIT-out-of-window negative → confirm-and-convert → duplicate-conversion refusal → B5 regression → partial→full delivery) plus `setup-nocobase.mts verify`'s B7 floors; evidence in `research/2026-09-25-w-round/b7-*`.
