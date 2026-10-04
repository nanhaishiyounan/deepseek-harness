# Agent Note: W6-B5 QMS inspection workbench + nine-element factory report

Status: implemented

English | [中文](2026-10-02-w6-b5-inspection-workbench.zh.md)

## Problem

The quality round's research verdict made the inspection workbench one of the five non-table surfaces a food plant actually lives in: an inspector on the floor opens a queue, gets steered to a sampling plan, records per-item results, and files a verdict — not a table page with a form. The spine existed (W2's AQL 15-band `qm_aql_plans` seed + the four-state `qm_inspections` ledger, W3's terminal inspect leg), but the plan lookup was CLI-only, the verdict submit had no idempotency, the four-way disposal was CLI-only (`--create-nc`/`--dispose`), the rejected verdict produced no alert, and the statutory 出厂检验报告 (沪市监食监〔2025〕195号 nine elements; report number = the 食安法 §51 检验合格证号) existed nowhere. The batch owed the workbench, the report, and the rejection→alert link over the existing spine without forking the W2 judgment engine.

## Decision

**Workbench = a wizard card over the shared engine, never a re-typed sampling table.** The SPA (`examples/kb-agent/insp/`, served by approval-engine at `/insp`, the labels committed-bundle posture) renders the queue grouped by source (IQC/IPQC/OQC with a 48h overdue highlight off `wms_receipts.received_at`). The wizard's plan step calls `GET /insp/plan.json`, whose `inspPlan` resolves the band through the shared `LOT_BANDS` and one `qm_aql_plans` row by (lot_band, aql, rigor) — IQC rigor rides the supplier's `iqc_level` exactly as `inspectInspection` computes it, so the badge and the persisted verdict cannot disagree (the assert reconciles four anchors against direct psql). Readings carry a defect class (critical/major/minor); an out-of-tolerance row records不合格 only after a double-tap「确认失败」confirm, and the server refuses the inverse (an out-of-tolerance row recorded合格) — both guards asserted.

**Idempotency = a submit_key CAS on the verdict row.** `qm_inspections.submit_key` (additive column) is claimed by `UPDATE … WHERE submit_key IS EMPTY RETURNING id`; a replay with the same key answers `duplicate: true` without rewriting, a different key after a claim is refused, and a failed judgment rolls back its readings and releases the claim. Readings persist first, then `inspectInspection` runs the AQL verdict (the same engine the CLI rides), so the four-state ledger and every anchor write-back stay single-channel.

**Disposal + alert ride existing verbs.** The rejection's disposal card wraps `createNc`/`disposeNc` (return/concession/rework/scrap with the W2 approval walk and stock consequences; concession refuses without approver + deviation note). The sixth alert rule `inspection_fail` (quality/critical, route 质检部+quality_lead+planner) lands through one `scanAlerts()` pass in the submit route — the same B2 channel `ccp_deviation` rides; no second insert path. This also repairs the B2 assert's rule-count drift (four → six; `ccp_deviation` had already made it stale).

**Report = assembled, honest about gaps, issued once.** `inspReport` folds inspection + readings + product + lot (+ the issued archive row) into the nine elements; a missing source column renders「未维护」with a `missing` style (the B3 supplier-placeholder posture — 规格 and 检验依据 are naturally unmaintained today, asserted ≥2 placeholders). `qm_factory_reports` archives one row per inspection (unique indexes on `report_no` and `inspection_code`); the report number `QR-YYYY-NNNN` is the 检验合格证号. Only a judged (passed/concession) inspection issues, only a 质检部 reviewer signs, and `/insp/report` renders the print page (window.print / CDP printToPDF) behind a session (Bearer or `?token=`).

**Access = the session-derived operator, fenced.** Every write route resolves the actor with `recallActor` (auth:check) and fences to 质检部+admin (`assertQualityActor`); reads need any platform session. The platform page「检验工作台」embeds the SPA through an `IframeBlockModel` (runjs strips iframes);「出厂检验报告」is the archive table page; `qm_factory_reports` carries a member view grant — other roles read.

## Alternatives considered

**A per-reading idempotency key (the B4 pattern).** `ux_mfg_ccp_records_submit (submit_key, point_id)` dedupes the CCP ledger's homogeneous rows. A verdict is one decision over N readings, so the claim belongs on the decision row: one CAS on `qm_inspections` makes the single-shot semantics explicit and needs no unique index to interpret.

**A dedicated workbench collection for wizard state.** The wizard is a view over the existing ledger; persisting intermediate steps would fork the truth. The submit lands readings + verdict + photo note in one route over the same tables the CLI writes.

**Concession as the rehearsal's disposal route.** The concession consequence re-exports stock through `releaseReceipt` and needs a full quarantine-bin receipt; the rework route carries the plan's own acceptance leg ④ (处置→RW 工单→复检) with no inventory rehearsal fixture. The rehearsal walks rework; concession stays covered by the server-side signature gate (missing approver/deviation note refused, asserted) and the W2 engine's own tests.

## Consequences

The inspector surface is now one of the five non-table forms with full evidence: queue → badge → readings → verdict → disposal → report all reproduce from `w6-b5-shoot.mjs` against the live services, 28/28 assertions green, with psql reconciliation on every leg (the reconciliation SQL is frozen in `research/2026-10-01-w6-rework/b5/recon.sql` for the final matrix). Rehearsal rows are `QI-W6B5-%`-prefixed across every table they touch and `--cleanup` removes them plus their alerts/CAPA/NC aftermath.

Deferred: the alert-list page's `rule_type` chip set still predates `inspection_fail` (rows render; the chip polish rides B10); SPC charts stay W7 (the readings base is now in place); the report's 规格/检验依据 stay placeholder until the product master carries those columns — the placeholder is the honest render, not a gap to paper over.

## Testing

`w6b5-insp.mts --assert` runs 14 gates: columns, both unique indexes, the rule row, the queue predicate, the four-anchor AQL reconciliation (psql direct × `inspPlan` × the W2 seed), both pages, the iframe URL, the view grant. `w6-b5-shoot.mjs` drives the live chain end-to-end: sign-in → grouped queue → badge (281-500/H n=50 Ac=3 Re=4) → readings with the double-tap confirm and the photo attachment → rejection badge (critical 0收1拒) → rework disposal (QM-NC closed/approved, RW MO draft, CAPA draft) → psql recon → idempotent replay (same key duplicate, other key refused) → OQC acceptance → nine-element preview (≥2 placeholders) → issue QR-2026-NNNN → print-to-PDF → negatives (no-token 401, buyer 403 fence, non-quality reviewer refused, concession missing-signature refused, XSS payload inert in SPA and escaped in report) → the platform embed. Evidence: `demos/acceptance-w6/w6-b5-01..07d-*`, `w6b5-assert.log`, `gates-b5.log` (typecheck, oxlint staged 0/0, both assert legs).
