# Agent Note: W8/B8 quality domain — the measured AQL array, the four-way disposition over the B1 callback, and the quarterly scorecard

Status: implemented

English | [中文](2026-09-26-w8-quality-aql-disposition.zh.md)

## Problem

B3 left IQC as a status column on `wms_receipts` (`pass/fail/concession`, manual `--iqc`), B6 left IPQC/OQC as status anchors on reports/completions, and nothing owned inspection documents, sampling arrays, dispositions, or supplier performance. The batch (plans/2026-09-25-mfg-closure/09-b8-quality.md) had to land the quality domain: one inspection spine anchored on receipts/job reports/completions, GB/T 2828.1 sampling with recomputable cached arrays, the four dispositive routes (return/concession/rework/scrap) with the concession route audited through B1, the 5-lot/2-reject switch onto the supplier, and the quarterly scorecard materialized from real documents — without bypassing the posting engine or breaking the ledger gate.

## Decision

**The AQL lookup is a seeded table, and only the measured three bands are seeded.** `qm_aql_plans` carries the SQC-Online-verified level-II single-normal arrays (G 151-280/32, H 281-500/50, J 501-1200/80 × AQL 1.0/2.5/4.0 — 9 rows). Verdicts (`--inspect`) resolve the band from the lot quantity, look the array up, and cache `n/Ac/Re` onto the inspection row so every judgment is recomputable from the psql row alone; `d = major + minor` judged `d ≤ Ac → passed / d ≥ Re → failed`, with any critical defect rejecting outright (严重 0 收 1 拒). Bands outside the seeded set fail loud — widening to all 15 bands means transcribing arrow-rule-resolved arrays first (enterprise scope, unprovenanced from memory alone).

**Tightened inspection is a one-rung ladder walk, not a second table.** The switch state rides the existing `srm_suppliers.iqc_level` (normal/tightened already lived there as the SRM manual assessment); B8 adds only `reject_streak`. On every judged IQC row the engine counts the supplier's last 5 closed verdicts: ≥2 rejects under normal → tightened, 5 straight passes under tightened → normal. A tightened verdict reads the next-stricter AQL rung's array (`AQL_LADDER = 4.0 → 2.5 → 1.0`), which reproduces the measured sentence exactly (G/2.5 tightened = G/1.0 = Ac1/Re2). Reduced and stop-inspection states stay unimplemented (enterprise scope).

**Anchored inspections are engine-created, business-key idempotent, and explained-skip before the collections exist.** `postReceipt` (PO-sourced), `postJobReport` (`qc_status=pending`), and `postCompletion` each call the anchor creator on `(insp_type, ref_no)`; before `nocobase-w8-quality.mts` has built `qm_*` the creator logs and skips — the all chain runs w3/w6 before w8, and the pre-B8 replays of those chains must stay green. `inspectInspection` writes the verdict back onto its anchor (`receipts.iqc_status` / `reports.qc_status` / `completions.oqc_status`), so the existing release gates keep reading their own columns unchanged.

**The concession route reaches B1 over HTTP, not a dynamic import.** `disposeNc` first tried `await import('./approval-engine.mts')` — approval-engine statically imports this module, and when h5 is the CLI entry its top-level `await main()` holds the module record in `evaluating`, so the import pair deadlocks and Node aborts on the unsettled await. The fix routes submit+approve through the engine's existing `:13110` serve — the same entry the page workflow request node uses — which keeps "one engine, two entrances" honest and fails loud when the serve is down. Concession refuses without `approver` + `deviation_note`; every route lands `wfl_approval_records` rows (submit 质量部 → approve).

**Dispositions post through the engine with two new movement types.** `RETURN_VENDOR` takes the rejected lot off the quarantine bin; `SCRAP` posts to the Inventory-Loss counterpart with `scrap_cost` settled at VWAP; concession releases through the existing `releaseReceipt` with the lot's `concession_flag` marked and the inspection result re-labeled; rework mints a `source=rework` MO draft. The three-way reconciliation rides the movement's `doc_no` carrying the disposition code — verify asserts the reverse direction (every RETURN_VENDOR/SCRAP leg must point at an approved+closed QM-NC row).

**`seedDocFlow` dropped its amount condition for amount-less document types.** B8 was the first `seedDocFlow` caller without an amount column; the old rewrite kept the unrewritten `total <= 100000`, which fails `act()` on an undefined field. The engine fix drops the condition when `amountField` is omitted, and the w8 main flow strips the residue from already-seeded transitions.

**`h5` owns the full `move_type` enum.** The B8 rewrite erased w7's additively-appended `SHIPMENT_SO` (the rewrite probe only checked the newest value); h5's list now carries every leg including w7's, and w7's append-only guard no longer fires. `n18-form-ai`'s flowModels page size rose 3000 → 6000 for the same growth reason (the B8 five pages pushed the model tree past the old ceiling).

**The scorecard is a quarterly materialization from real documents.** quality = window IQC pass rate, delivery = on-time receipts (`received_at` vs the PO's new `expected_date`, undated counts on-time with a neutral 60 fallback), price = cheapest supplier average ÷ own average, service = 100 − 10 × open CAPAs, compliance = latest audit grade mapped. Weights 40/30/20/10 are **industry convention, unproven** (the SAP MM default never sourced — recorded here as such); the service axis substitutes the CAPA count for the unsourced manual score. D-grade rows log the `restricted` lifecycle suggestion; the flip itself stays a human B1 action.

**CAPA drafts are engine-written, not workflow-created.** A collection workflow on `qm_inspections` update-mode cannot dedupe replays and would double-open CAPA rows against the engine's own idempotent creator; the engine creates them on failed verdicts keyed by title, tied back through the new `srm_capas.inspection_code`.

## Consequences

Every posting surface now anchors its own inspection row and the engine writes verdicts single-shot; the supplier switch state advances on every IQC judgement; the reverse reconciliation (disposal legs must point at approved+closed QM-NC rows) is a permanent verify floor.

## Alternatives considered

- **Seeding all 15 lot bands from recalled standard tables** — memory-recalled arrays are unprovenance; only the three measured bands carry evidence. Failing loud outside them is honest.
- **A separate `iqc_switch_state` column** — `iqc_level` already names exactly this state with the same vocabulary; a second column would fork one fact into two homes.
- **Letting the mobile conversation write the verdict** — the dialog reads the seeded table and renders a suggestion card, but the row lands `result=pending`; only the engine's `--inspect` writes verdicts (recomputable, single-shot).
- **Direct `approval-engine` import inside dispose** — deadlocks the h5 CLI entry; the serve callback is the same engine with no cycle.

## Verification

`nocobase-w8-quality.mts --demo-chain` walks the loop (PO → six anchored receipts → AQL verdicts with the release-gate negative → return + concession dispositions → the 5-lot/2-reject switch → the downgraded array on the next lot → the quarterly scorecard → the AVL gate negative) and re-verifies on replay; the rework and scrap routes ran against a seventh anchored lot. `setup-nocobase.mts verify` owns the structural floors (four collections, five pages, nine seed rows, six additive columns, both movement legs, the active flow config, the reverse reconciliation, n18ai- ≥ 78). Evidence: research/2026-09-25-w-round/ — b8-psql.txt (7 assertion groups, recomputed weighted total 68=C), b8-aql-cases.txt (the verdict ladder), b8-admin-*.png (disposition kanban / inspections / scorecard), b8-mobile-*.png (live-LLM AQL suggestion card + inspection query card).
