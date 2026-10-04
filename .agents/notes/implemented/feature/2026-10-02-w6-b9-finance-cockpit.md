# Agent Note: W6-B9 Finance Cockpit + Finance P1 — five-card dashboard / AR aging / four-segment statements / graded dunning / three-way-match pay gate

Status: implemented

English | [中文](2026-10-02-w6-b9-finance-cockpit.zh.md)

- **Date**: 2026-10-02
- **Scope**: `w6b9-cockpit.mts` + `w6b9-blocks.mts` (new), `/fin/*` routes on `approval-engine.mts`, three pages (经营总览 first-nav / 财务工作台 / 发票匹配 JSBlock), fin_config + fin_statements + fin_dunning_tasks + fin_dunning_records(append-only trigger) + fin_dunning_audit + fin_match_issues (psql DDL, idempotent).

## Problem

There was no management cockpit page at all, and finance P1 (AR aging, customer statements, graded dunning, three-way-match pay gate) was missing.

## Decision

### 1. The cockpit (first nav slot, sort=-1)
- The Odoo three-layer posture: five KPI cards (period revenue [shipped-caliber] / shipped orders / average order value / overdue AR / due AP) + six secondary chips (received / inventory qty / production hit / supplier OTD / lot pass rate / open alerts) + the monthly revenue trend (reusing kpi_snapshots.revenue_monthly) + top customers & products + AR aging buckets + the open-alert digest (severity-ordered top 8) + the nine-step chain counters (leads / deals / quotes / orders-in-approval / WIP / pending inspections / inbound IQC / in-transit shipments / open receivables — the cash step carries the red rail).
- The period filter (30/90/180/365) re-fetches from the engine and the cards and charts follow (browser-verified 90→30 with the header and values moving). **No gross margin anywhere** (the ADR: cost data is not governed — a fake number would be worse than none; the gross_margin KPI exists but never renders).
- One caliber source: every metric is one SQL inside `computeCockpit`; the psql recon legs recompute each (03 log). The AR caliber is the B2 `ar_overdue` rule verbatim (approved SO amount − received payments, shared `AR_BALANCE_SQL`).
- Role visibility: the aggregates read for any platform session; the customer-dimension detail (top-customer board / aging drill rows) masks server-side (`masked: true`, keeper-verified), full for finance/admin.

### 2. Aging analysis (AR five buckets + AP mirror + customer drill)
- Buckets: overdue 0-30 / 31-60 / 61-90 / 91-120 / 120+ (not-due counted separately); amount + order count + per-customer rows per bucket (bucket click-through, in-page drill).
- The recon loop closes: bucket sum = the overdue-AR card = the psql twin (18800 = 18800 = 18800, three-way). The AP due caliber = invoice billed_at + fin_config.pay_term_days(30) past today with an unpaid balance.

### 3. Customer statements (four segments + print + idempotency)
- Opening (pre-period approved shipments − received payments) + period shipments − period receipts = closing; the line rows (shipments and payments) snapshot into `fin_statements.lines` JSONB.
- Idempotency: `UNIQUE(customer_id, period_start, period_end)` — regenerating the same customer+period returns the same row with `duplicate: true` (verified: two consecutive calls, same number, no new row).
- The print face (the /insp/report posture): `GET /fin/statement/print` standalone HTML + `@media print` + window.print (elements: number / customer / period / four-segment balance / lines / preparer / customer-confirm stamp / print date). A new tab carries no Bearer header — the query-token fallback channel (same-browser session use; the Authorization header stays the first choice).

### 4. Graded dunning (alert → task → append-only follow-ups → close)
- Tasks mint from the open B2 `ar_overdue` alerts in one click (idempotent per alert_id); the level rides the `fin_config.dunning_levels` day ladder (1/15/60 days → L1 reminder / L2 formal / L3 strong) — a negative-days alert (pre-due reminder) mints an L1 task (the -3-day rows are live).
- Follow-up records land in `fin_dunning_records`: phone/visit/email/note × result (reached / no-answer / promised / partial / refused); a promised result requires a promise date. **Append-only is a database trigger** (UPDATE/DELETE raise — the psql recon proves the refusal). The task state machine runs open→contacted→promised→closed|bad_debt (close requires ≥1 follow-up record), with `fin_dunning_audit` row-level audit.
- Notifications ride the B2 alert-center channel (one in-app row per routed user, finance+sales_rep); mobile visibility: finance's #/alerts carries the three 账期 rows (SO-W6B2-SEED, 31 days overdue, ¥18,800, red rail) plus the dunning-task notices — the W6-R5 mobile retake pins them by position (`w6-r5-shot-mobile-meta.json` mobileBadge.firstDunningHead =「催收任务 DUN-2026-0003 已建立」, `w6-r5-08-mobile-dunning-badge.png`).
- The workbench is a card face, never a table: candidates → task cards (status light / level badge / balance / overdue days / promise date / owner) → the selected card opens the follow-up form + timeline (07 screenshot).

### 5. The three-way-match issue workbench + the pay gate
- The rescan reconciles (PO ordered/received qty × invoice billed qty/amount × receipt existence) into `fin_match_issues`: qty_short (billed > received) / price_diff (beyond fin_config.price_tol=0.05) / no_receipt (billed with no receipt and zero received); healed diffs auto-resolve as system; UNIQUE(invoice_id, diff_type) keeps it idempotent.
- The disposition state machine open→resolved|waived (terminal; disposer + note recorded); the workbench rides the 发票匹配 page (the B7 match_result bar stays as the aggregate face; 09 screenshot: 6 diff rows, class chips, disposition buttons).
- The pay gate `POST /fin/pay/apply`: a payment request (pur_payments draft → the wfl payment approval) only mints when received ≥ billed and no open qty/no-receipt issue rides the invoice; otherwise a 403 with the fact (INV-B9F-0001 verified: received 0 < billed 1000 → 付款拦截).

### 6. Fences (the role matrix)
- Money-detail reads and every write: finance/admin/nocobase (username-direct — finance has no department row); keeper verified 403×3 (aging read / follow-up write / print page).
- The cockpit aggregates: any platform session (the no-session 401 negative is on record).
- The sales exception: a statement reads only when the customer belongs to the acting sales user (the crm_deals.owner channel) — otherwise 403.
- A self-reported actor that differs from the session: 403 at the engine (the R3 posture).

## W6-R5 follow-up (the repair round, same feature)

- **B1** — the acceptance gate's `expect` ran inside `expect ... | tee` pipelines: every FAILS increment landed in a pipeline subshell, so the summary always printed PASS while legs actually missed; comparisons were string-exact (80920 vs 80920.0 false-negatives). The gate now runs expect in the main shell, compares numerically (numeq), and exits with the real FAILS count. Two stale in-gate assumptions surfaced with the fix and were repaired with it: the statement idempotency leg hardcoded the table at 1 row (now before/after compare) and the pay-block probe pinned to a no_receipt row a later disposition had spent (now the b9-assert qty_short|no_receipt caliber).
- **B3** — both print entries ride one `printUrl()` helper (encodeURIComponent on statement_no and token); the list `<a>` carries the token, fetches 200, and the opened page renders the four segments (w6-r5-03a/03b).
- **KPI×100** — a KPI_FORMAT contract table (scale/suffix) drives one formatKpi renderer: schedule_hit=1 renders 100%, never 1% (w6-r5-04).
- **Card drill + claim** — the ar_overdue/ap_due cards jump to the aging panel (the bucket drill is reused), an AR/AP side switch mounts the AP mirror (computeCockpit carries aging.ap now), and each digest row claims through POST /alerts/act (the CCP whitelist rows belong to planner; the session identity rides the new GET /fin/whoami because the RunJS sandbox cannot fetch a relative platform URL).
- **Followup dedup** — an inFlight lock front-side plus a client_msg_id partial-unique index back-side: a concurrent same-id double POST lands exactly one row (w6-r5-04-dedup.log — both responses name the same record_id, one duplicate=false one duplicate=true, row count +1).
- **Small items** — the match disposition note is an editable textarea that lands on the row (w6-r5-07); route-failure logs strip token=/bearer= query values through redactUrl (w6-r5-05c — the boot log shows `token=<redacted>` and zero literal hits); `--clean` truncates the five rehearsal tables (TRUNCATE bypasses the row-level append-only trigger by design — it guards UPDATE/DELETE, and only a statement-level TRUNCATE trigger, never installed, could see it); the mobile alert-center notices badge by category — a dunning notice wears 催收, never 召回 (w6-r5-08 + w6-r5-shot-mobile-meta.json).

## Pitfalls (hit and fixed this batch)
- **The RunJS authoring gate, twice**: ① a multi-line HTML continuation opened with a comma is illegal (`const x = (c) => 'a', 'b'` — the second segment is not a declarator; `return 'a', 'b'` is a comma expression returning only the last segment) — everything moved to `[...].join('')` arrays; ② a forward reference to a `render` declared later reads as an unknown global (the B8 note already carries this) — FIN_WB/MATCH_WB switched to a hoisted `function render() {}`; COCKPIT slipped through on a structural accident but took the same fix.
- **fullPage captures collapse on the NocoBase SPA**: `captureBeyondViewport: true` folds the layout back to viewport height (813px) and triggers the skeleton — the DOM assertions passed while the screenshots showed a lone spinner; the viewport capture (1440×900) is complete (the 04/01 pair is the proof). All B9 evidence rides viewport captures; a block below the fold gets scrollIntoView first (09).
- **The print page's new tab carries no Bearer**: window.open cannot take localStorage — the query-token fallback (Authorization header preferred engine-side).
- **Three column traps**: wms_stock is `qty_on_hand` (not qty); flowModels hides stepParams inside the `options` JSONB; notificationInAppMessages spells it `"channelName"` quoted-camel.
- **NULL concatenation drops rows**: `'#' || b.customer_id` with a NULL customer_id makes the whole row NULL — psql prints an empty line the parser filters; the aging was all zeros until `COALESCE(b.customer_id::text, '?')`.
- **GROUP BY swallowing an aggregate**: `to_char(...) || round(max(value)...) GROUP BY 1` is illegal — aggregate in a subquery, format outside.
- **A bash variable name glued to a multibyte character**: `$PAY）` parses as `PAY\xef...` → unbound — `${PAY}` braces it off.
- **A relative-path fetch inside the RunJS sandbox fails as "Failed to fetch"** (W6-R5): block fetches must target absolute ENGINE URLs — the platform identity read therefore rides the engine (GET /fin/whoami), never `/api/...` on the page origin.
- **`/alerts/act` answered no OPTIONS preflight** (W6-R5): every other cross-origin JSBlock channel answers 204 on preflight (the R4 lesson's other half); the browser-direct claim surfaced the gap as a bare fetch failure until the preflight branch landed.
- **The NocoBase SPA cold-boots ~30s under a fresh headless profile** (W6-R5): the sign-in probe must hold one navigation and poll long — re-navigating per attempt resets the wait and the form never appears (the mobile probe likewise must key on data rows, never the page title, which matches a bare skeleton).

## Evidence (demos/acceptance-w6/, measured)
- `w6-r5-01-assert-rerun.log` (the W6-R5 rerun of the repaired gate): 23 ✓ / 0 ✗, `GATES ALL PASS`, exit 0 — expect-matrix PASS (0 fails), dunning-flow/match-recon/negatives checks green, b9-assert all asserts green (27 checks incl. the six W6-R5 legs), b2-regression all pass. The gate now exits with the real FAILS count; the injected-wrong-value counter-proof (`w6-r5-01c-inject-e2e.log`: want 99999999 got 80920.0 → FAIL(1) → GATES FAILED → exit 1) proves a miss can no longer print PASS.
- Screenshots 01-11: the cockpit panorama (5 cards + 6 chips + trend + tops + aging + digest + the 9-step chain), the 30-day period switch, the aging bucket customer drill, the statement print page (four-segment balance + the print button), the finance workbench (3 task cards + DUN-0001 open with the 2-record timeline + promise 2026-10-10 + the statement generator), the match workbench (6 rows, three classes, disposition buttons), mobile finance alerts (1 critical + 3 账期 chips, the ¥18,800 red row).
- Logs: 03 the per-card psql recon, 05b the four-segment equation + idempotency (two calls, one number), 08 the dunning flow, 09b the three-way recon + pay block, 10 six negatives, 12 the assert matrix, 13 the b2 regression.

## Residue (new)
- The sales statement fence matches `crm_deals.owner` against the acting username character-for-character; a Chinese-display-name owner field would need normalization first (deferred to B10 with the owner-field spec).
- The additive JSBlock on 发票匹配 still sits below the B7 aggregate (seatBlockRowTop never lands there — a platform grid-renderer limitation, deferred to B10).
- The top-salesrep board is absent (crm_deals.owner data is thin; the customer/product boards already cover the planned caliber).
- Bank reconciliation (P2, the explicit not-doing list) — the receipt↔receivable matching stays deferred.
- The dunning external channels (WeCom/email) are unwired (B2 notifications are in-app too — external delivery is a platform capability awaiting the channel foundation).
- Batch statement export (the ERPNext Process Statement of Accounts posture) is absent — the single customer+period loop is closed, batch is a wrapper.

## Alternatives considered

- **Gross margin on the cockpit vs revenue/receivables only (ADR #7)** — cost data is ungoverned; a fake margin card would be worse than none.

## Consequences

Cost: no margin card until cost data is governed. Bought: every card reconciles to one SQL, the pay gate and dunning ledger are append-only audited.
