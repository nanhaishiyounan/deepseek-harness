# Agent Note: W5-B8 closure — P2 residue cleared, eight real-account role walkthrough, handoff

Status: implemented

English | [中文](2026-09-30-w5-b8-closure-p2-roles.zh.md)

## Problem

W5's seven implementation batches left three classes of closing debt: (1) P2 residue — qty=0 hold stock rows (applyStockDelta zeroed quantities but kept the rows; 13 lingered), the capacity-utilization denominator disagreeing with the FCS scheduling capacity (BP-18), no deployment documentation for the terminal strict regime (BP-21), and the doc-number TOCTOU (BP-19); (2) 6/8 roles in the role map were evidenced as admin — real accounts never walked their journeys (BP-22); (3) QUICKSTART had no designer manual and the cross-round truth debt (claims not re-verified since R1) had no reconciliation pass.

## Decision

- **The stock register keeps no zero rows.** After the version-checked update lands, [`applyStockDelta`](../../../../examples/kb-agent/scripts/nocobase-h5-wms.mts) destroys a row its delta brings to qty_on_hand=0 with no allocation and no lock — bins/lots/movements keep the full history while the register sheds zero-value residue; later receipts re-create the row through the existing missing-row path (version restarts at 1). The 13 pre-existing rows are swept idempotently by `--sweep-zero-stock` (which runs the ledger assertion right after).
- **BP-18's denominator now rides the FCS capacity.** [`mfg-schedule.mts`](../../../../examples/kb-agent/scripts/mfg-schedule.mts) gains a main guard (the h5 entry-check idiom) so `dailyCapacityMinutes` becomes importable; capacity_util in [`kpi-run.mts`](../../../../examples/kb-agent/scripts/kpi-run.mts) now divides by Σ(work-center span × parallel) × working days elapsed in the month (Sundays plus calendar holidays rest; the '' calendar is shared), KpiFacts carries workCenters+holidays instead of workCenterCount, and a malformed shift fails loud through dailyCapacityMinutes. The snapshot note updates with it; history converges through the --backfill replay.
- **The walkthrough is real accounts × journey assertions × an isolation contrast.** Six accounts (buyer/planner/shop_lead/keeper/sales_rep/finance) are seeded on the qc_inspector pattern (default member role + department attach); a CDP driver signs in per role and walks its 3~5 core steps (no 403, not blank, rows render, the three-tab drawer) live on :13000. The isolation assertion contrasts a direct URL to the admin-only 权限矩阵 page — members never render the matrix, admin does — replacing the unreliable collapsed-sidebar text probe. Results land in `demos/acceptance-w5/b8-walkthrough.json` and gate through `w5b8-closure.mts --assert`.
- **BP-19 goes to the next round's backlog.** The prefix-scan max+1 pattern spans 10+ write points; a single-writer demo environment has no concurrency window to exploit. A sequence table (UPDATE…RETURNING) or unique-index-plus-retry is a systematic retrofit, scheduled by value.
- **The final matrix surfaced two pieces of standing debt, cleared with it.** (1) w5b6-heal gains an enumSwap action: a select field still rendered by DisplayTextFieldModel swaps to DisplayEnumFieldModel with v2 options (the journal records beforeUse for rollback; field options read `uiSchema.enum`) — the W3-B2 subtable columns B7's drawer rebuild carried verbatim reintroduced 19 unaligned columns plus the bare pur_quotes.status after the B6 heal, whose assert claim had gone stale; `--all` converges idempotently over two passes to 133 enum columns with zero drift. (2) Lint baseline correction: the full oxlint run was at 27 errors (26 was last measured at B2; no full re-run since), fixed the double diagnostic in approval-rules.ts `flowStateLabel` and the needless assertion in write.ts (zero behavior change; tool-nocobase 42/42 green), back to 24 ≤ 26.
- **Docs close out.** QUICKSTART gains the designer operations chapter (drag/property panel/publish gates/countersign plus the new auto-advance semantics) and `--sweep-zero-stock`; DEPLOY's security section documents the W3_TERMINAL_TOKEN strict/lenient-demo regimes and the designer auth channel. The handoff `plans/handoff-2026-09-30-w5.zh.md` carries the 22-breakpoint terminal-state table and the truth-debt reconciliation.

## Alternatives considered

- **Keep zero rows and filter in views** — rejected: the register is the ledger truth source; "clean only after filtering" hands the residue to every reader. The B3~B5 note had already flagged it for B8.
- **Copy the span parse into kpi-run** — rejected: mfg-schedule already owns the fail-loud parse; the main guard makes importing it free and keeps one home for the rule. A copy is two places to drift.
- **Build one ACL role tree per domain role** — rejected: the platform's isolation granularity is role(member) × collection actions × page bindings. With no domain-role matrices in existence, the member tier + department attach + page/collection-level isolation assertions is the honestly verifiable shape; six role trees is a W6-scale project.
- **Fix BP-19 this round** — rejected per the decision; the remediation sketch is recorded in the backlog.

## Consequences

- Eight roles, 8/8 PASS (115 step assertions: buyer 15, planner 14, shop_lead 15, qc_inspector 14, keeper 17, sales_rep 15, finance 12, admin 13), screenshots `demos/acceptance-w5/b8-r1..r8-walkthrough.png`; every member direct-navigation to the matrix page is denied while admin renders it (the data-isolation contrast).
- `w5b8-closure.mts --assert` fully green: seven member account bindings, zero qty=0 wms_stock rows plus a balanced ledger, the kpi selftest including the capacity-denominator cases, the FCS-aligned snapshot note, no duplicate open reorder suggestions per product, the DEPLOY/QUICKSTART documentation assertions, and the nine walkthrough-evidence checks.
- The full final-gate matrix (16 legs, all PASS: lint 24 ≤ 26 baseline / typecheck / designer tsc / selftest / w5b2 --migrate / w5b3/4/5 --assert / w5b6-theme+heal / w5b7 / w4-heal-b1 / w3-approval-visual textarea retirement / w5r1 concurrent CAS / w5b8 / the nine-step chain s1..s9 / assert-ledger / kpi+mfg selftests / setup verify full chain) is recorded in `research/2026-09-29-w5-rework/w5-final-gates.txt` (matrix done: 16 PASS / 0 FAIL).
- capacity_util's day value moved from 0.0534 (nameplate denominator) to 0.055 (FCS denominator) — the expected effect of the reconciliation, not a regression.

## Pitfalls (will bite again)

- **The rolesUsers join key is camelCase "roleName"** (the roles table has no id PK column); join by roleName when auditing role bindings in psql — the rolesResources/rolesResourcesActions family shares the naming.
- **Collapsed-sidebar menu text is not a permissions probe** — page titles are absent from the DOM until a group expands. Isolation assertions must contrast direct-URL navigation against rendered content, never aside text.
- **A CDP wait string must be a literal the page really renders** — "SKU" never appears in the stock page DOM (the column header is 库位); calibrate wait probes against one real render. After a localStorage clear the SPA may still render its shell on the in-memory token — the sign-in probe needs a reload-retry loop (three rounds).
- **W5 evidence has two homes**: B0~B5 under `examples/kb-agent/demos/acceptance-w5/`, B6~B8 under the repo-root `demos/acceptance-w5/` — aim assertion scripts at the right path before checking.
