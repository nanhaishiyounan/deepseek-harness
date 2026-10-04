# Agent Note: W6-B6 CRM activation — deal pipeline Kanban, customer 360, quote→SO conversion, and the B5 fix-debt clearance

Status: implemented

English | [中文](2026-10-02-w6-b6-crm-activation.zh.md)

- **Date**: 2026-10-02
- **Scope**: `examples/kb-agent/crm/` (new engine-embedded SPA), `/crm/*` routes on `approval-engine.mts`, `w6b6-crm.mts` seed/assert/cleanup, additive fields + `crm_stage_audit`, the v2 page 商机管道, plus six B5 fix debts in `insp/` and `w6b2-rules.mts`.

## Problem

The crm_* tables were dead n13 rows: no opportunity pipeline, no customer 360, quotes not document-like.

## Decision

### 1. Deal pipeline Kanban (the CRM domain's first non-table surface)
- Stage vocabulary = the on-disk `crm_deals.stage` enum verbatim (inquiry 10% → quote 40% → negotiation 70% → won 100% / lost 0%), defined once in `crm/src/server.ts` `PIPE_STAGES`.
- `/crm/pipe.json` returns cards + per-column `count`/`amount_sum`/`weighted` computed from the same rows the cards render; `weighted_total` sums only the three open stages (won/lost are history, not forecast).
- Drag write-back `POST /crm/move`: conditional UPDATE (`WHERE stage = from`) as the concurrency gate, probability + status (won→fulfilled+closed_date / lost→cancelled+closed_date / open→pending, closed_date cleared) ride along, and one `crm_stage_audit` row records actor/from/to/probability/amount/moved_at. The audit table is also the dwell-days anchor cards render (`滞留 N 天`, no anchor → omitted, never invented).
- New additive field `crm_deals.probability` (integer %, backfilled from the stage map once); index `ix_crm_stage_audit_deal`.

### 2. Customer 360 (aggregate, not a table dump)
- `/crm/customer.json?id=`: profile + counts + AR balance computed with the `ar_overdue` rule's balance subquery verbatim per customer (`approved so_orders.amount − Σ received crm_payments on that order`) + orders/quotes/deals lists + the four-node-kind timeline (报价 issue_date → 订单交期 need_date → 发货 shipped_at → 收款 paid_at), newest first. Timeline dates anchor on real columns only; undated rows stay out.

### 3. Quote → sales order (server-numbered, idempotent)
- `POST /crm/quote-to-so`: mints `SO-YYYY-NNNN` over the numeric tail, copies customer/deal, amount = Σ line qty×price when the optional line editor is used (else the quote total), inserts `so_orders` draft + `so_order_lines`, then CAS-claims the quote (`converted_so_code` empty ∧ status≠converted → `converted` + code write-back). A raced or replayed conversion is refused with the existing SO code and rolls the just-inserted order back; partial unique index `ux_crm_quotes_converted` is the DB backstop.
- The engine route then calls `submitForApproval(io, 'so_orders', …)` when the flow is configured (it is, config id 10); a submit failure keeps the draft and reports why. Rehearsal never approves, so no `reserveForSo` side effects.

### 4. Identity/fence + NocoBase embed
- Every `/crm` write is fenced to 销售部 + admin/nocobase (root); reads need any platform session; the actor is always session-derived (`recallActor`). The SPA rides `/terminal/session` like the insp workbench.
- One v2 page 商机管道 under 销售管理 (IframeBlockModel → engine `/crm`, the B5 embed posture), seeded idempotently by `w6b6-crm.mts`.

### 5. B5 fix debts cleared (all 1–3-line level, each with an assertion)
1. `inspReport` judged column: psql renders `boolean::text` as `true`/`false` — compare exactly those (was `'t'`/`'f'` → constant `—`). Smoke in `w6b5-insp --assert`: first reading judged matches pass.
2. Reviewer: render reads `reviewer` from the archived `qm_factory_reports` row keyed by `inspection_code` (signature line by label, not positional `elements[8]`), and issue adds the backfill UPDATE. Assert: issued report reviewer non-empty and render = archive.
3. `inspection_fail` hit widened to `result IN ('failed','concession')` — a 特采 re-label no longer vanish-resolves the critical alert with `resolved_by='system'` (which contradicted the rule's own comment); only a human close resolves. Assert in `w6b6-crm --assert` + `w6b2-rules --assert` regression.
4. Failed result page renders no report entry (button + hint both gated on verdict; server `report_hint` equally null on failed OQC). Browser-leg assert on a fresh failed verdict.
5. `openWizard` resets the four module-level disposal globals (reason/action/note/approver) so inspection B's wizard never inherits A's disposal state; re-open equally clean.
6. The queue gains a 已完成 tab (judged tail, newest 30, report_no chip) — history FQC's late sign-off entry for quality_lead (failed rows preview only; the server issue fence stays authoritative).
7. `w6b2-rules`: `RULE_TYPE_OPTIONS` + both `rule_type` field enums carry all six rules (ccp_deviation/inspection_fail added), and a new idempotent `patchRuleTypeSurface` upgrades an existing 预警列表 page in place (fields-table enum, the live column + chip options, and the two missing per-rule stat cards appended — visual ordering stays B2/B10's concern).

## Evidence (demos/acceptance-w6/)
`gates-b6.log` (typecheck/oxlint staged 0-0/assert legs 如实), `w6-b6-assert.log` (32/32), `w6-b6-shot-meta.json` (29/29 allGreen), `w6-b6-01..04*` PNG/psql logs (board render+XSS-inert, drag write-back, 360 timeline dom=psql=13, conversion SO-2026-0094 + replay refusal, no-token 401 / buyer 403), `w6-b6fix-01..06*` (judged column, reviewer log, concession alert log, failed-no-report, A/B wizard no-leak pair, 已完成 tab + late sign-off), `w6-b6fix-b5reassert.log` (16/16), `w6-b6fix-b2reassert.log`.

## Known boundaries / handoffs
- `crm_quotes` is header-only in the G-round schema (no quote-line table); conversion therefore maps customer/amount/dates on the header and takes product lines from the dialog (validated against `hub_inv_products`). Full quote 单据化 (line editing + PDF) stays the plan's B6⑤/n17-治理 scope, not this batch's.
- Rehearsal rows are W6B6-prefixed and cleanable: `w6b6-crm.mts --cleanup` removes the SO/lines/approval aftermath/audit/rows; `QI-W6B5-B6FIX` rides the existing `w6b5-insp --cleanup` (QI-W6B5-* prefix).
- The two new stat cards append after the original four (position/位序 deliberately left to B10 per the batch instruction).
- psql stdout for `INSERT … RETURNING` carries the id line plus the `INSERT 0 1` command tag — the id is the first line, never the whole buffer (bit us once; parser now takes line 0 and fails loud).

## Alternatives considered

- **Re-lay the dead n13 pages vs engine workbench + platform pages as two faces** — the two-face shape won: drag/weighted pipeline in the engine, retrieval in the platform.

## Consequences

Cost: CRM lives on two surfaces to learn. Bought: dead tables activated with a reconcilable weighted pipeline and quote→SO conversion.
