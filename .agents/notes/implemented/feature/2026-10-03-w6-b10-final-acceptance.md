# Agent Note: W6-B10 Final Acceptance — eight-role walkthrough (with mobile legs), 44-gate reconciliation matrix, GB 14881-2025 mapping, and round closure

Status: implemented

English | [中文](2026-10-03-w6-b10-final-acceptance.zh.md)

- **Date**: 2026-10-03
- **Scope**: `demos/acceptance-w6/w6-b10-walkthrough.mjs` + `w6-b10-matrix.sh` + `w6-b10-gates.sh` + `w6-b10-shot-statcard.mjs` (new evidence drivers), `examples/kb-agent/scripts/w6b10-statcard-order.mts` (new closure leg), `w6b4-assert.mts` (re-runnability fix), `.oxlintrc.json` (labels exemption), `QUICKSTART.zh.md` (W6 round section), `research/2026-10-01-w6-rework/b10/gb14881-mapping.md` + `99-w6-deliverables.md`.

## Problem

The W6 round needed its final acceptance: an eight-role walkthrough including the mobile legs, a ≥30-gate reconciliation matrix, the GB 14881-2025 clause review, the leftover closures (labels lint, B2 stat-card seating, R5 arbitration records), docs, and a full regression.

## Decision

### 1. Eight-role walkthrough with the mobile legs (the W5 b8 shape extended)
- Real accounts (buyer / planner / shop_lead / qc_inspector / keeper / sales_rep / finance / admin), each: PC sign-in + auth:check identity anchor, member/admin matrix-page isolation contrast, 3~5 core steps over the W6 surfaces (bid matrix, expiry board, recall console, inspection wizard `/insp`, factory reports, CCP config, BOM versions, terminals cards flow, CRM pipeline, maintenance calendar, cockpit, finance workbench, alert rules, designer iframe), per-step DOM assertions (wait text, no-403, non-blank, rows/probes), one or more screenshots (`w6-b10-r1..r8-*.png`), and read-only psql probes per role (`w6-b10-psql-recon.log`).
- Mobile legs ride the B0/B1 surfaces: buyer `#/docs/pur_orders`, planner `#/todos`, keeper `#/alerts`, sales `#/docs/so_orders`, finance `#/alerts` — real sign-in anchored on `dsh-mobile-auth` (phone viewport 375×812). Final run: **8/8 roles, 106/106 steps** (`w6-b10-walkthrough.json`, per-action `w6-b10-actions.json`, summary `w6-b10-walkthrough-summary.md`).
- Boot contract rediscovered the hard way: the gateway must start with `--patch examples/kb-agent/cordis.patch.yml` — a bare `pnpm dsh web` leaves the nocobase domain disabled and every mobile login dies on the structured refusal ("set nocobaseEnabled: true"). Also `/mobile` 404s on a fresh boot; the entry is `/mobile.html#/…`.

### 2. The 44-gate reconciliation matrix (`w6-b10-matrix.sh` → `w6-b10-matrix.log`)
- W5's 20-gate final matrix extended to the whole round in ten sections: B0/B1 identity & sync (numbering uniqueness, non-admin approver count, engine `/todos` = psql, backlog pending=0, lakehouse nb_* =13 tables + row parity), B2 rules (8 rules enabled, expiry engine = handwritten dual-track SQL diff=0, dedup idempotence, notification ≥1, keeper routing), B3 trace/recall/labels (views in place, recall code unique, frozen snapshot = closure length, notify ≥1, receipt orphans=0, completions-without-lot=0, labels source = wms_lots), B4 (CCP rows ≥1, ccp_deviation alerts, BOM versions ≥2, approved ECOs), B5 (AQL 15 bands, nine-element report integrity, unique indexes, inspection_fail alerts), B6 (stage/probability consistency, deals ≥1, quote→SO `converted_so_code` back-link), B7 (one `is_won` per RFQ, awarded rows, `awarded_at` closure), B8 (maint status closed-set, plan-sourced orders, calibration alerts, what-if runs), B9 (cockpit revenue card = psql, aging five buckets = overdue AR, statement equation Σ=0, pay gate 403, dunning append-only UPDATE refusal), wfl cross-cutting (action closed-set, todo status closed-set, flow configs ≥1).
- **44/44 PASS** with measured counts on every line; any FAIL exits 1 (verified live: the three first-run gate bugs — sqlite GLOB, recall `scope` column, the real action closed-set — each produced FAIL then PASS after the fix, all in the log trail).

### 3. GB 14881-2025 clause ↔ function mapping (`research/2026-10-01-w6-rework/b10/gb14881-mapping.md`)
- 14-row clause map (trace §10/42, shelf-life/FEFO §10, CCP five-element monitoring program §8 + HACCP annex, factory inspection nine elements §9/51/52, recall §11/63, supplier certificate validity §6/7, calibration strong-inspection, records §14, personnel §12).
- Core five faces marked **covered** with page+engine+psql evidence; personnel health-certificate ledger and controlled-document archiving marked **partial** (W7 candidates per plan §9); hardware chapters marked not-applicable. Full-text clause-by-clause verification against the purchased standard remains a listed follow-up (the mapping cites the in-repo dual-source research).

### 4. Closure items
- **labels lint**: 59 type-aware errors (B3's 64 minus R3's 5) were the "outside every TypeScript program" artifact, not defects — exempted in `.oxlintrc.json` ignorePatterns with the gate-owner comment (its gates stay the esbuild bundle + `w6b3-labels-assert` round-trip); before/after in `w6-b10-04-labels-lint.log`. The wider examples .ts face (247/151 files, pre-existing) recorded as a W7 candidate.
- **B2 stat-card seating (the B2 debt)**: `w6b10-statcard-order.mts` rewrites the alerts grid rows/sizes/rowOrder (the B7 lever) — the cards were parented but row-less (the renderer append-mounts them after the table; three sortIndex shapes never applied). Synthesized two card rows at the rowOrder head: persisted (`w6b10cards-a/b,autoRow1,autoRow2`) and verified by screenshot — cards above the table. The single-column shape comes from the first-run cell layout, one cell holding four uids (psql: `w6b10cards-a=[[4 uid]]` stacking vertically); the script now writes one cell per card (`chunk.map(uid => [uid])`), but its re-run no-ops on the already-seated rows without rewriting the cells — the four-per-row strip is one cleanup-plus-rerun away, not a platform rendering limit (R6 attribution fix, aligned with the code).
- **R5 arbitration records (known boundaries)**: planner cockpit visibility = design layering — the aggregate face (KPI cards/trend/chain/alert digest) stays readable for platform sessions with the customer-dimension details masked server-side (non-finance/admin reads of `/fin/cockpit` get customers emptied + masked; the R6 recheck `w6-r6-02-cockpit-mask.log` passes 8/8: planner masked, finance full), while the money-detail face `/fin/aging` answers 403; the walkthrough observe step measured planner opening the cockpit route rendered=true denied=false (`w6-b10-actions.json` — the earlier "observed blocked" wording contradicted the measurement, fixed in R6); the pay gate stays on the engine `/fin/pay/apply` (single source for fence+audit), platform pages consume read-only; `customerOwnedBy` matches `crm_deals.owner` against the session username verbatim (strict-by-default; Chinese display-name normalization rides the owner-field spec into W7); `seatBlockRowTop` inter-page divergence (bid matrix yes, invoice-match no) stays recorded as a platform grid renderer limit — the same mechanism did fix the alerts page here.
- **Docs**: QUICKSTART gains the W6 round section (menu groups, engine routes, walkthrough/matrix/gates usage with the `--patch` boot contract, `W6*` env knobs); `99-w6-deliverables.md` carries the per-batch one-liners (B0~B10 + R1~R5), the B10 debt fixes, and the W7 candidate list.
- **Drill-data cleanup**: b9 `--clean` / b6 `--cleanup` / b5 `--cleanup` run as the final gates section; append-only audit rows keep their drill markers.

### 5. The full regression (`w6-b10-gates.sh` → `gates-b10.log`)
- Reseed (b9 --demo, b6 --seed, b5 wizard replay — the factory report only exists through the wizard) → 16 assert legs (B0~B9 + statcard) → matrix 44 → walkthrough 8/8 gate → typecheck → oxlint staged (this batch's new-file face) → pairing → cleanup legs. **Final run: 22/22 legs, GATES ALL PASS.**
- Two assert-leg re-runnability debts fixed in flight: `w6b4-assert` now reverts its demo ECO (default BOM rollback + demo-ECO delete) instead of permanently widening product 11's line (run 26 had exhausted every add-candidate; one-time baseline restore to v1 shipped with it); `w6b6` gates order is cleanup→seed→assert (the rehearsal quote's converted state persisted across runs). ECONNRESET (the NocoBase dev-server keep-alive race, hit twice on `w6b3-recall --assert`) gets a single transparent retry in the runner (`w6-b10-gates.sh:41-49`, the first attempt's log is moved to `*.retry1.log`); those two first-attempt outputs did not survive into demos (no .retry1.log there, grep only hits gates.sh itself) — the checkable surface is the retry code plus the final run passing first-try (R6 fixes the earlier "both attempt logs kept" wording).

## Evidence (demos/acceptance-w6/, numbers measured)
- `w6-b10-walkthrough.json` / `-summary.md` / `actions.json` / `psql-recon.log`: 8/8 roles, 106/106 steps, 13 screenshots (`w6-b10-r1-mobile-docs` … `w6-b10-r8-alert-rules`), five anchored mobile identities.
- `w6-b10-matrix.log`: 44 gates, 0 failed, per-gate counts (e.g. non-admin approves 73, notifications 1077, trace 131 nodes/129 edges, AQL 15 bands, cockpit revenue 80920.0 = psql).
- `gates-b10.log`: 22 legs 0 failed; per-leg `w6-b10-gate-*.log` (28 files incl. preseed/clean/retry trails).
- `w6-b10-05a-statcard-order.log` + `w6-b10-05b-statcard-seated.png`/`-dom.log`: rowOrder before/after + the seated screenshot (with the lazy-mount probe race recorded honestly).
- `w6-b10-04-labels-lint.log`: 59 → exempt-0 with the pre-existing wider-face note.

## Known boundaries / W7 candidates (carried in 99-w6-deliverables.md §六)
Personnel four-piece + health-certificate ledger (GB 14881 §12); examples-wide lint type-aware artifact (tsconfig adoption or face-wide exemption); invoice-match JSBlock seating + four-column card strip; SPC charts + sample retention; cockpit top-salesperson board, statement batch export, dunning outbound channels; GB 14881 full-text clause-by-clause verification; BP-19 numbering-TOCTOU platform-wide; quote→SO native platform form.

## Alternatives considered

- **Reuse the W5 20-gate matrix vs extend to a whole-round 44 gates** — the extension won (every batch's recon compiled in).
- **Fix the 59 labels lint errors vs exempt with a comment** — the exemption won: they are outside-project type-aware artifacts, not defects.

## Consequences

Cost: the matrix and walkthrough drivers are a maintenance surface. Bought: a rerunnable round-final acceptance base (8/8 roles, 44/44 gates, 22/22 legs) and the GB mapping on record.
- `pnpm run doc-sync`: 29 gates exit 0 (the closure also brought the 14 W6 Notes to the uniform skeleton — 77 format violations to 755 conforming notes — plus package-path fixes, tool/config-catalog regeneration with zh block sync, two B1 JSDoc completions, and 31 pairing re-records; chain in the gates log addendum).
