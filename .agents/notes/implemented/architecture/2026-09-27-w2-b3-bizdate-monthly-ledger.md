# Agent Note: W2-B3 business-date column + monthly opening/receipts/issues/balances ledger

Status: implemented

English | [中文](2026-09-27-w2-b3-bizdate-monthly-ledger.zh.md)

## Problem

99-legacy #10 (half): the WMS business collections carry no business-date column and `wms_movements` replays only by id order — the monthly 收发存 ledger is uncomputable and KPI inventory history returns null (B4's direct prerequisite). `wms_counts` dates ride entirely on parsing the `CNT-YYYYMMDD` key segment. Batch 03-b3 requires: the `biz_date` column on both ledgers, every movement write converged on one helper, a one-shot backfill with a zero-NULL assertion, the `wms_monthly_balances` snapshot (量/值 dual track) with idempotent recalculation and differential reconciliation, and the NocoBase「月度收发存」page — all while `Σmovements == stock` stays green across the backfill.

## Decision

- **`appendMovement(token, fields, bizDate?)` is the only movement writer.** All 22 call sites inside `nocobase-h5-wms.mts` (seed, postShipment, postReceipt, releaseReceipt ±, postTransfer ±×2 legs, postAdjust, postCountAdjust, rebalanceLedger ×2, postIssue ±, postReturn ±, postCompletion, releaseCompletion ±, disposeNc return/scrap) plus the two cross-file sites ([`mrp-run.mts`](../../../../examples/kb-agent/scripts/mrp-run.mts) shipSo's SHIPMENT_SO and [`nocobase-w6-mfg-exec.mts`](../../../../examples/kb-agent/scripts/nocobase-w6-mfg-exec.mts)'s B6 RECEIPT seed, both importing the helper) route through it. Default = the Shanghai day (`shanghaiToday`, UTC+8 fixed offset — kpi-run's day-boundary twin); seed rows replay their doc_no-encoded history date (`docEncodedDate`, RCV-/SHP-/TRF-/CNT-/ADJ-YYYYMMDD-nnnn). The convergence proof is the verify coverage gate: a bypass create without biz_date turns it red (measured: BYPASS-B3-NEG-1 → "biz_date NULL on 1 row(s) … direct creates bypassing appendMovement are forbidden").
- **Backfill priority ladder, as-built.** The batch doc's rung 3 (system createdAt) does not exist here: these collections were created without timestamps, so the ladder lands as ① related-document business date (`wms_receipts.received_at`, `so_orders.shipped_at`) > ② doc_no-encoded date > ③ id-order linear interpolation between resolved anchors, the row's note tagged `biz_date estimated`. Interpolation is month-exact (anchors are dense — the demo chains cluster on a few days) and 50/127 rows took it (BAL-*/MI-/MC-/QM-NC-/RCV-B6-* carry no date segment); the batch's "single-digit residue" estimate presumed createdAt existed. Month-sharded updates, then the zero-NULL assertion on both collections, then the counts column-vs-code diff list (the column wins; measured 0 conflicts).
- **Counts switch to the column.** `wms_counts.biz_date` backfills from the CNT-encoded date (its own business key); kpi-run's consumer prefers the column (`countRowDateOf` = biz_date || key parse) with the parse demoted to a fallback — count_accuracy values unchanged (the backfill produced zero column/code conflicts, so both口径 coincide).
- **`wms_monthly_balances` is a replay cache, never a second ledger.** `monthlyBalancesOf` (pure) sorts by (biz_date, id), opening(t) = net flow before the month's first day (first month = the ledger's own net), in = Σ positive legs, out = Σ|negative legs| — so `opening + in − out ≡ opening + net` holds by construction and the six-class mapping (收 = PUTAWAY/RECEIPT/RECEIPT_MFG/RETURN_WIP-in/ADJUST+/COUNT_ADJUST+/transfer-in legs; 发 = PICK/SHIP/SHIPMENT_SO/ISSUE_WIP-out/RETURN_VENDOR/SCRAP/盘亏/transfer-out legs; paired MOVE/ISSUE_WIP/RETURN_WIP ± book equal both sides, net zero — the Odoo/ERPNext 调拨成对 convention) is a presentation layer that cannot break the identity. Values = qty × the current `movingAverageCost` (the row note declares「成本口径=现值移动加权，非期间加权」). `--snapshot-month <YYYY-MM|all>` destroy-then-creates per period (idempotent, history-correcting); `--recalc [month]` rebuilds from the ledger's own month list (never the possibly-poisoned snapshot table) and asserts once after all months.
- **Snapshot reconciliation** (`assertMonthlyBalances`, wired into snapshot/recalc/verify): stored rows equal a fresh replay per (product, period) on all four quantities, and consecutive periods chain (bal(t) == opening(t+1)). Measured: qty+val dual-track poisoning (in_qty/bal_qty +999, bal_val=888888, opening_qty=777) fully recovered by `--recalc`, and a clean re-run diffs empty.
- **Verify + all chain.** setup-nocobase verify grows the coverage gate (movements/counts biz_date 100%), the snapshot reconciliation (replay + continuity), and the `wms_monthly_balances` row floor; the all chain runs `--backfill-dates` + `--snapshot-month all` after every module script (so all writers have already gone through the helper) and before the KPI backfill.

## Notes

- **Recalc's mid-loop assert deadlock (found live).** The first `snapshotMonthlyBalances` asserted the whole table after every single-month rebuild: with one month rebuilt and another still poisoned, the assert crashed before the loop reached the poisoned month — which therefore never got rebuilt (self-locking). Generation functions must not whole-table assert inside a multi-unit loop; the CLI asserts once after the sweep. Symptom worth remembering: "recalc succeeded" logs plus unchanged poisoned values.
- The `id > 127` trap: NocoBase ids carry holes from historical destroys, so `WHERE id > <last-seen>` miscounts survivors as new rows — count rows, don't infer from id gaps.
- A stored `bal_qty <> opening+in−out` psql hit is a double-precision artifact (0.05/2258.05 sums); the numeric cast reconciles exactly and every engine gate rides the 0.01 tolerance.
- estimated rows are a one-shot migration artifact: new postings carry the helper's date, so the estimated share only shrinks. A fresh install backfills ~only its seed-encoded rows (near zero estimated).
- movs' seed double-write (RECEIPT+PUTAWAY both +qty) stays W-round history absorbed by BAL compensation rows; the monthly in-sums therefore include both legs — intentional (the ledger replays what exists, not what should have been).

## Evidence

- `research/2026-09-27-w2-evolution/w2-b3-backfill-assert.txt` — ledger gate before/after backfill (31→32 groups green), zero-NULL (127/127, counts 6/6), snapshot reconcile, poison-recovery + idempotent-recalc diffs, both fail-loud negatives (2099-13 → exit 1; bypass create → verify red → cleanup → green).
- `w2-b3-backfill-sample.txt` — 10-doc sample (biz_date == encoded/received_at/shipped_at), estimated rows' anchor-bracketed dates, month distribution, zero-NULL re-check, post-posting new rows (PUTAWAY/MOVE±/ADJUST± biz_date = today).
- `w2-b3-snapshot-cases.txt` — hand-computed psql reconciliation: product 8 × 2026-08 (first-month opening == full-replay net == 0, 520/0/0/520), × 2026-09 (520+5740−3325=2935 == snapshot), per-move_type class aggregation; the 19-row identity sweep.
- `w2-b3-ledger-page.png` (two-month table) + `w2-b3-mobile-ledger-query.png` (real conversation: direct `wms_monthly_balances` read 520/5,800/3,325/2,995 with the identity check and a口径-difference explanation).
- Engine surface: `--backfill-dates` / `--snapshot-month` / `--recalc` / `--assert-monthly` / `--selftest-b3` (pure-layer: encoded dates incl. illegal-date rejection, six-class mapping, first-month net, paired-transfer net-zero, continuity, replay idempotence).

## Alternatives considered

- **NOT NULL now (Contract phase)** — refused: the backfill's estimated rows are legal precisely because the column stays nullable; the zero-NULL assertion is the enforceable stand-in until the estimated tail is gone.
- **Pure replay per query (no snapshot)** — refused (research §3.6): KPI panels replaying the whole ledger per view is cost-unbounded; the snapshot is the ERPNext Stock Closing shape and reconciles against the ledger by construction.
- **createdAt as backfill ring 3** — impossible as-built (collections carry no timestamps); id-order interpolation with dense anchors is the honest fallback and is labeled per row.

## Consequences

本 Note 记录的决策自此成为对应面的现行契约（详见 Decision 与 Evidence）。
