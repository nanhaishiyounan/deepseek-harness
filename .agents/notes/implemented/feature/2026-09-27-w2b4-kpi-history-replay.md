# Agent Note: W2-B4 inventory KPI history — the three stock codes replay from biz_date, and the turnover pair lands monthly

Status: implemented

English | [中文](2026-09-27-w2b4-kpi-history-replay.zh.md)

## Problem

The B9 KPI engine locked six codes behind `PRESENT_ONLY` — every historical day materialized value=null because "the stock tables carry no history" — and the inventory board had no turnover rate / turnover days at all (99-legacy #10, second half). W2-B3 removed the root cause (`wms_movements.biz_date` + the `wms_monthly_balances` snapshot), so batch 04-b4 requires: the three stock codes (on_hand_qty / wip_qty / capital_occupied) move out of PRESENT_ONLY and replay as-of values from the ledger, two new monthly-grain codes (inv_turnover_rate / inv_turnover_days) read the B3 snapshot, the self-calibration assertion `replay(today) == live aggregate` holds for all three, and the other 19 codes stay byte-identical to the W-round baseline.

## Decision

- **on_hand_qty replays the whole-ledger net** — `Σ movements.qty WHERE biz_date ≤ :d`, every zone included. This is the only replay that closes: today's value equals `SELECT sum(qty) FROM wms_movements`, which the `Σmovements == Σstock` ledger gate (per product×lot, every status) proves equals the full stock sum. The old present-day口径 (Σ `wms_stock` WHERE status='good') reads 121,684.95 against the replay's 181,384; the difference decomposes exactly into 待检 24,486 + 线边 14,413.05 + 20,800 sitting on the four B6-seed bins that carry no zone row (dangling `to_bin` 90/91 and their empty-code stock bins 88/89) — declared in the snapshot note, not silently absorbed.
- **Zone-classified replay was measured and refused.** Filtering legs by the resolved from/to bin zone (good-zone in, quarantine/WIP/loss out) drifts on 28 (product, lot, zone) groups: the W-round seed left single-sided legs (TRANSFER out-legs with a null to-side), B6 seed legs pointing at bins whose ids no longer exist, and RCV-B6 double-writes — all invisible to the per-product ledger gate but fatal to any per-zone replay. The whole-ledger net is the zone-honest aggregate the gate already certifies.
- **wip_qty switches口径 from MO quantity to line-side dwell.** The W-round value (`Σ mfg_orders.qty WHERE released/in_progress`) has no per-day reconstruction — MO status transitions are not historized. The replay sums legs touching the SH-WIP zone bins (ISSUE_WIP 入线边正腿 − RETURN_WIP 出线边负腿); today it equals Σ `wms_stock` over the WIP zone's bins (14,413.05, measured exact). The KPI name changed to 线边在制数量 to say what it now measures.
- **capital_occupied = Σ per-product replayed net × the current moving-average cost.** The VWAP comes from the h5 engine's own `movingAverageCost` — imported, not re-implemented, so a price-rule change cannot fork between the ledger and the KPI (the per-product REST loop in `fetchFacts` costs ~19 calls once per run). 成本=现值口径: historical cost re-derivation is out of scope and every snapshot note says so. Today's value moves from Σ good stock × master price to the VWAP basis (5,579,495.3889 at acceptance).
- **PRESENT_ONLY keeps exactly the three process-count codes** (pending_approvals / shortage_alerts / inbound_lines): "what was open on day D" is not reconstructible from durable rows and a day-by-day replay of open-state counters would be fiction. The row-stays-null semantics and the 90-day continuity count are unchanged for them.
- **The turnover pair is monthly grain anchored on month-end dates.** `turnoverInputsOf` yields inputs only when the calc date is a month end AND the month carries `wms_monthly_balances` rows; otherwise `compute` returns null, and `calcDayWith` treats a null head as "no row, no destroy" (the new skip semantics — the destroy-then-create idempotence per date+code+dim is unchanged for every row that does land). Rate = 当月 out_val ÷ ((Σopening_val+Σbal_val)/2); days = 当月天数 ÷ rate. The分子 is 运营口径 (moving-weighted outbound cost), **not financial COGS** — the open-question-4 declaration rides every snapshot note. avg ≤ 0 → rate materializes null (never Inf); rate ≤ 0 → days null (2026-08 is the live zero case: out=0, avg=16,810.98 → rate 0.0, days null).
- **fetchFacts fails loud on a half-dated ledger**: any `wms_movements` row without `biz_date` (B3 backfill never ran) or a missing SH-WIP zone aborts the run before a single snapshot is written — undated legs would silently leak into every historical day's net.

## Notes

- The first backfill left 3 residual null rows: the pre-change 2026-06-29 pass predates the new window (6/30..9/27), so its three stock rows were never overwritten. Cleaned by delete; the 19-code baseline diff is unaffected (those rows are outside the compared code set).
- 2026-09 has a snapshot but no turnover row: 9/30 is in the future, so the month never hit its anchor inside the window. The hand-check rate for it (897,715.01 ÷ 2,806,558.68 = 0.3199) is recorded in the evidence as the formula witness, not as a row.
- `capitalOccupiedOf` (the old good×master-price pure function) is deleted with its caller; `dead_stock_ratio`'s JSDoc no longer claims "the movements table carries no date column" (receipts remain its aging anchor by design, not by absence).

## Evidence

- `research/2026-09-27-w2-evolution/w2-b4-kpi-history.txt` — the three stock codes non-null on three sampled days (8/28=800 / 9/10=3,663 / 9/20=57,575), zero null rows after the 6/29 sweep; the self-calibration trio (replay today 181,384 / 14,413.05 / 5,579,495.3889 == three independent live aggregates); the 9/10 hand-sum Σ movements(biz_date ≤ 9/10) == on_hand_qty(9/10); the turnover hand-math over `wms_monthly_balances` (2026-08 rate 0 / days null; 2026-09 0.3199 witness); the PRESENT_ONLY trio still null on all 89 historical days; zero turnover rows outside 2026-08-31; 24-code coverage; the 19-code diff against the pre-change baseline (1,734 rows each side, empty).
- `w2-b4-baseline-snapshots.txt` — the pre-change 2,007-row export the diff ran against.
- `w2-b4-gates.log` — `--selftest` (replay trio / month-end anchor / turnover zero-guards), `--reconcile`, setup verify (24-code + 9-chart floors), b9 s9, `--assert-ledger`, `--assert-monthly`.
- `w2-b4-inventory-dashboard.png` / `w2-b4-inventory-table.png` — the inventory board with the replayed history visible in the table spine (today 5,579,495 / 14,413 / 181,384 over earlier days' values).
- `w2-b4-inventory-charts.png` — the chart deck after the backfill: the capital-occupied line now carries the full 90-day replayed curve (0 before the ledger's 2026-08-28 start, spikes to ~5.5M later), and the turnover block renders with both codes as categories — the only landed month (2026-08) has rate 0.0 / days null, so no visible bar; the block tells the truth of a month with zero outbound value.

## Alternatives considered

- **Zone-classified good-leg replay** — refused after measurement: 28 (product, lot, zone) drift groups from single-sided transfer legs, dangling B6 bin references, and zone-less seed rows; the whole-ledger net is the only aggregate the existing ledger gate certifies.
- **Interpolating history from the monthly ledger instead of replaying the daily ledger** — refused: month grain blurs intra-month events the 90-day chart needs, and the snapshot is a cache — the ledger stays the single truth a replay reads.
- **Keeping wip_qty on the MO-quantity口径** — refused: MO status transitions leave no dated trace, so the code could never leave PRESENT_ONLY; line-side dwell replays exactly and matches the WIP-zone stock to the cent.
- **Historical cost re-derivation for capital_occupied** — refused (PLAN D6): out of scope for this batch; the current moving-average cost applied to replayed quantities, with the口径 declared on every row, is the honest bound.
- **Daily turnover rows (or month-end rows for months without a snapshot)** — refused: a monthly indicator on daily dates double-tells one month's story 30 times, and a month the snapshot does not cover has no truth to publish — no row beats a fabricated one.
- **A dedicated `grain` field on KpiDef for the skip semantics** — refused: `compute → KpiValue | null` already expresses "this date gets no row" at the seam every def implements; a parallel grain flag would restate what null says.

## Consequences

本 Note 记录的决策自此成为对应面的现行契约（详见 Decision 与 Evidence）。
