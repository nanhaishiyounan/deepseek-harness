# Agent Note: W6-B7 SCM sourcing — the three-axis bid-comparison matrix, scorecard-linked admission, award CAS, and the procurement page re-shape

Status: implemented

English | [中文](2026-10-02-w6-b7-scm-bid-matrix.zh.md)

- **Date**: 2026-10-02
- **Scope**: `w6b7-sourcing.mts` + `w6b7-verify.mts` + `w6b7-blocks.mts` (new), `/sourcing/*` routes on `approval-engine.mts`, `pur_sourcing_config` collection, the 比价表/采购订单 JSBlocks, two real charts on 发票匹配/付款申请, and the `w6-b7-shoot.mjs` CDP evidence drive.

## Problem

The bid-comparison page was a near-dead table: no grouped matrix, no per-row awarding, no price/delivery/quality three-dimensional decision, no admission linkage.

## Decision

### 1. The three-axis scoring core (one computation source)
- `computeSourcingMatrix` (w6b7-sourcing.mts) scores submitted quotes per RFQ×product group: price score = min-price/price×100, lead score = min-lead/lead×100, quality = the supplier's latest `srm_score_cards.score_quality` (period desc, id desc — a period may carry more than one row; id 17 over id 8 picks the D rating). A missing scorecard drops the quality axis and renormalizes the remaining weights; every row carries its full formula string, so the UI, the engine, and the psql hand-calc in the demo leg print the same arithmetic.
- Admission fence: lifecycle frozen/eliminated/blacklisted or rating ∈ preventRatings ⇒ prevent (the Choose button renders disabled); restricted or rating ∈ warnRatings ⇒ warn (rank tie-break pushes warn below equal totals — the plan's warn-demote rule). Both sets are rows in `pur_sourcing_config`, not code constants.

### 2. Weights are a configuration row, not tunables
- `pur_sourcing_config` id=1 (price/lead/quality, each > 0, sum exactly 100, plus prevent/warn rating sets). The matrix block's weight panel POSTs `/sourcing/config` and every recompute reads the row; the flip scenario (味之源 ¥0.70 low-price vs 鲜丰 quality-A) turns #1 at 50/30/20 into 鲜丰#1 at 10/2/88 with the demo asserting both orders and restoring the default.

### 3. Award = one CAS with a receipt (POST /sourcing/award)
- Writes are fenced to 采购部 + admin (`assertSourcingActor`, the ecoActor pattern; `finance` and the self-claimed-actor mismatch both 403). The winner's own admission is re-checked server-side — 山东鲁丰's latest D rating refuses the award before any write.
- The state move is `UPDATE pur_rfqs SET doc_status='awarded' WHERE … AND doc_status = <read> RETURNING id` — a double click replays idempotently (same winner ⇒ 200 `idempotent:true`, no second PO), a different winner gets 409. Losers flip to `lost` (cancel) or `backup` (reserve); the minted PO (`PO-YYYY-NNNN`, numeric-tail slot) carries the scoring receipt in `compare_note`, the `rfq_id` back-link, and rides the existing pur_orders approval flow via `submitForApproval`.

### 4. The procurement pages (7/8 pure-table → 3/8)
- 比价表 gains the `w6b7-matrix` JSBlock (RFQ picker, weight panel, grouped heat matrix with rank bars and admission badges, per-row formula details, award modal, RFQ→PO ledger); the two quote tables stay as the retrieval auxiliary. 采购订单 gains the `w6b7-po-board` swimlane (doc_status lanes with count+amount, the receiving/invoice axis chips, and the 来自 RFQ back-link chip per card). 发票匹配 gains a match_result bar and 付款申请 a doc_status doughnut (the f4 authoring channel). The shape audit defines "table page" as no JSBlock/Kanban/data-chart (stat-card ChartBlocks with zero dimensions do not count) and asserts table=3/8.
- Grid seating: `seatBlockRowTop` moves the additive block's row first in rowOrder — a block left in an appendRow at the page bottom never mounts (the lazy renderer keeps it out of the viewport), and the check must run before the empty-cell filter or a row whose only cell is the moved block drops out silently.

### 5. Evidence
- `w6-b7-01-demo-actions.log`: 9 legs green (reset → matrix render → scorecard/pass-rate/hand-calc reconciliation → weight flip → prevent 403 → finance fence 403 → award full chain psql → idempotent replay + 409 re-award → XSS JSON-inert + cleanup).
- `w6-b7-assert.log`: 14/14 (3 structure checks, 4 block/chart checks, 1 shape check at table=3/8, 6 live/terminal-state checks). Corrected in W6-R4: the original 17/17 was a miscount — the log is authoritative; the R4 round widened the suite to 20/20 (see w6-r4-02-assert.log and the W6-R4 note).
- `w6-b7-00..09 PNG` + `w6-b7-shot-meta.json`: browser-rendered matrix with prevent disabled + XSS as text, weight panel, finance 403 surfaced in the UI note, the buyer-driven award modal → awarded banner, PO swimlane with back-link, both charts; psql recon confirms the awarded status and the PO receipt.

## Alternatives considered

- **v2 nested tables vs a JSBlock hand-drawn matrix** — the JSBlock won: grouped nesting plus per-row Choose exceeds v2 table capability.

## Consequences

Cost: the matrix block sits outside platform page governance. Bought: three-dimensional awarding with warn/prevent admission linkage and PO back-links.
