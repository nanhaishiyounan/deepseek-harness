# Agent Note: W3-B6 operator terminals — iframe touch pages over serve business verbs (report / inspect / receive), the three-number equation clamp, and the department-fenced endpoint surface

Status: implemented

English | [中文](2026-09-28-w3b6-operator-terminals.zh.md)

## Problem

The three highest-frequency shop-floor motions (报工 / 检验打分 / 按单收货) lived only in table+form pages — the exact shape the user rejected as「不是人能用的」. The industry reference (Odoo Shop Floor, ERPNext QI readings, Odoo Barcode) splits these motions into dedicated terminal forms: card queues with big buttons, per-item scoring sheets with auto-judged readings, and scan-driven per-document receiving. Every write had to keep riding the existing engine functions (D9: no second implementation, no NocoBase-form writes into engine-governed state).

## Decision

- **Carrier = one iframe block (mode:url) per flowPage pointing at approval-engine `--serve` :13110's static pages** (`/terminals/{report,inspect,receive}.html` + shared `terminal.css`), uid prefix `w3b6`, one page per business menu group (生产制造/质量管理/仓储管理). The URL 直开 fallback is inherent — the pages are plain HTTP. Touch form: card queues, ≥44px targets, high contrast, no framework.
- **Three narrow verbs inside `serve()`, each calling the existing engine function**: `POST /report-job` (creates the mfg_job_reports row after full validation, then `postJobReport`), `POST /inspect-submit` (writes qm_inspection_readings rows then `inspectInspection`; a failed verdict removes the rows it just wrote — 库内无残留), `POST /receive-goods` (`enforceGates` PO-effectiveness + line clamps, creates wms_receipts rows, then `postReceipt`). The card queues ride `GET /terminal/{report,inspect,receive}`.
- **The report equation is the ERPNext complete_job_card clamp mapped onto our per-operation cumulative ceiling**: 完成 + 待求 + 损失 = 本循环计划数, where 本循环计划数 = MO qty − Σ posted (qty_good + qty_scrap). qty_pending stays out of the engine's cumulative columns (it is the not-yet-finished remainder the next cycle reports; it lands in the report's remark) — the equation therefore proves qty_good + qty_scrap fits the engine ceiling while forcing every unit to be accounted for. Pure `validateReportEquation` is selftested (positive, non-closing, negative, exhausted).
- **Reading judgement splits by row kind**: numeric rows (any finite spec bound) auto-judge actual against [spec_min, spec_max] and refuse a missing actual; non-numeric rows take the inspector's pass/fail big button and refuse silence. A failed row flagged 严重 counts critical (0 收 1 拒), otherwise major — defects fold through `defectsFromReadings` into `inspectInspection`, whose AQL verdict stays the single judgment authority.
- **The over-receipt guard is endpoint-owned**: postReceipt/updatePoReceiving have no over-receipt check, so `validateReceiveLines` refuses wrong-product lines, blank lots, non-positive quantities, and any line pushing past 订购 − 已收 before a single row is created.
- **Auth is token + department fence**: `W3_TERMINAL_TOKEN` (header `x-terminal-token` or query `token`; unset = lenient-demo, the `x-terminal-auth: strict|lenient-demo` response marker says which — production must set it) and the B5 plugin-departments tables gate each surface's operator (report→生产车间, inspect→质检部, receive→仓储部; wrong department = 403, admin bypasses). `W3_TERMINAL_ENABLED=false` removes the routes with zero engine change (缺省零漂移: no endpoint call, no write).

## Consequences

- The three operator roles get touch-first terminals for their daily lines; every state advance still rides exactly one engine function, so wfl anchors, FCS ownership, single-shot inspection, and the Σmovements==stock gate keep holding with the terminals live.
- The serve process becomes a required deployment artifact for terminal usage (:13110) alongside NocoBase and the gateway; its env switches (`W3_TERMINAL_TOKEN`, `W3_TERMINAL_ENABLED`) are the production knobs.
- setup-nocobase verify permanently probes the endpoint family (one 400 negative, one 403 fence) whenever serve answers healthz.

## Alternatives considered

- **NocoBase form blocks writing engine collections directly** — rejected: forms cannot express the equation clamp, the per-item judging, or the fail-loud re-entry semantics without a workflow engine doing read-modify-write arithmetic (W-round pitfall ⑪); it would also bypass the single-implementation rule.
- **Workflow-plugin state machine around the terminals** — rejected as a second engine: the terminals exist to *feed* the existing verbs, not to own state.
- **Separate SPA per terminal** — rejected: three plain HTML pages over the same serve process keep the deployment surface at one extra port and the pages printable on a kiosk.

## Notes

- **`gridUidOfExistingPage` returns the tabs schemaUid, not the block-mount grid uid** (it is the grid's *parent*). B3 never hit the divergent path because its idempotence check skips on the kanban's existence; B6's assert initially read `IframeBlockModel.parentId === tabsUid` and failed. `terminalGridUid` resolves tabs → `flowModels:findOne?parentId=<tabs>&subKey=grid` → the real grid uid; `dataOf` unwraps the response while raw `call` needs `.data.uid` (the setup-verify twin initially read `grid?.uid` off an unwrapped null).
- **`resolveOrderByCode` must tolerate an absent code** — the report page posts `mo_id` only; a bare `code.trim()` on undefined surfaced as a 500-ish「Cannot read properties of undefined」banner. Fixed with a `typeof code === 'string'` guard before any write (the failed request left no rows behind because every creation happens after validation).
- Engine write legs (postJobReport / inspectInspection / postReceipt pull several full collections per call) can outrun a 20–60 s UI wait; the page keeps its submitting lock and the serve log is the authoritative completion signal (JR-2026-0005 / QI-2026-0011 / RCV-TERM-2026-0001 all landed after the wait_for timed out).
- The scoring sheet's reading input needs `step="any"` — Chrome rounds decimal readings (6.2 → 6) under the default integer step, which silently changed the judged actual.
- Two pre-existing data faults were repaired en route (both in the evidence file): B5's journey row `QM-W3B5-JOURNEY-2026-09-28` carried `status='open'` (outside the collection enum, breaking B3's kanban distribution assert) → `pending`; MO-2026-0002's stale reservation `RSV-MO-MO-2026-0002-04` pointed at a deleted stock row (bin 89) and blocked availability-check → released, then the missing components were topped up through the engine front door (`--post-adjust`) and re-kit to assigned before 领料 opened the MO.
- setup-nocobase verify probes the endpoints only when :13110 is live (healthz → one 400 negative on /report-job + one 403 cross-department fence); otherwise it prints a hint instead of failing — the pages need the serve running anyway.

## Evidence

- `research/2026-09-27-w3-usability/w3-b6-curl.txt` — static pages 200 (`x-terminal-auth: lenient-demo`), the three queues for the right operators, three cross-department 403s, the MO-state 400 negative, plus the verdict trio: re-judge single-shot 400 / over-receipt 400 / wrong-product 400.
- `w3-b6-psql.txt` — the ten-section row-level proof: JR-2026-0005 (9000 + 6000-in-remark + 1000 = 16000), operation 1 planned→started, the three readings (水分 6 fail / 外观 pass / 中心温度 18 pass), the verdict row (critical 1 → failed, n=200 Ac=10 Re=11), the qc_status write-back + CAPA draft, RCV-TERM-2026-0001 posted pending, PO 300/300 received, the PUTAWAY movement + hold stock on SH-Q-02-01 + quarantined lot, the QI-2026-0012 IQC anchor, and the two data-repair footprints.
- `w3-b6-report-01-queue.png … w3-b6-report-05-390px-touch.png` — the shop-floor journey: card queue (unscheduled MOs carry the disabled 先排产 button), the equation's red ≠ state with submit disabled, the green = state with 送检 checked, the posted queue (工序1 已开工 · 已报 10000/16000), and the 390px single-column touch form.
- `w3-b6-inspect-01-queue.png … 03-verdict.png` — the QC journey: the pending queue (QI-2026-0011 from the report's 送检), the scoring sheet with row-level red/green verdicts and the critical toggle, the engine verdict banner (AQL 2.5 normal, n=200, 严重 1 → 拒收 Rejected, CAPA initiated).
- `w3-b6-receive-01-queue.png … 03-posted.png` — the warehouse journey: PO cards with `# 行数` badges, the scan panel (lot focus + ±1/±10 steppers + preset remainder 120), the posted banner with the 待检区 quarantine note.
- `w3-b6-iframe-nocobase.png` — the 车间终端 flowPage inside NocoBase (:3080/nocobase) rendering the :13110 terminal through the iframe block.
- Gates: `approval-engine --selftest` (terminal validation cases included), `nocobase-w3-views --assert` (terminal iframes + url pins), `setup-nocobase.mts verify` (three pages + endpoint smoke), `--assert-ledger` (33 groups, 145 movements balanced), 9-step chain s4/s5/s6 green.
