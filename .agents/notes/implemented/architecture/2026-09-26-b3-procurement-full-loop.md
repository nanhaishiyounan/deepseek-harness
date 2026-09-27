# Agent Note: B3 procurement full chain — pur_orders replaces hub_po, the three-axis status, IQC quarantine, and the three-way match

Status: implemented

English | [中文](2026-09-26-b3-procurement-full-loop.zh.md)

## Problem

The procurement domain was an island: `hub_po_purchase_orders` carried only four business status values with no transitions, no PR/RFQ/quote/comparison/invoice/payment collections existed, and the WMS posting engine had no link to purchase orders. PLAN §4 B3 required the full P2P chain (PR→RFQ→quotes→PO approval→receipt→IQC anchor→putaway→invoice→three-way match→settlement) with both invariants — "not-effective documents drive nothing downstream" and "one stock posting entry" — holding throughout.

## Decision

- **pur_orders replaces hub_po_purchase_orders as the canonical PO table.** The legacy table freezes as history (mirroring B2's hub_po_suppliers→采购联系人 pattern), the mobile purchase form migrated to pur_orders, and `hub_po_*` names carry the 历史 marker in BIZ_TERMS. Migrate rather than rework: the legacy column names (po_number/total/order_date) are incompatible with the engine contract (doc_status dual axis + amount-threshold routing on `amount`), and keeping the old table preserves the B1-era audit trail.
- **Three orthogonal axes (D2 / Odoo dual axis)**: `doc_status` (the six-state approval axis, engine-owned) × `receiving_status` (none/partial/received, advanced only by postReceipt) × `invoice_status` (no_invoice/to_invoice/invoiced, advanced by invoice registration/confirmation). PR's converted and RFQ's sent/closed are post-approval business terminals written by chain verbs (sendRfq/awardRfq) through conditional `updateWhere` — they never enter the wfl state machine, keeping approval actions and business-advance actions separate while both stay on the script-side engine.
- **amount_field configurability for the threshold route**: B1 hardcoded the amount column as `total` (approval-rules' AMOUNT_FIELD). The chain's amount column is `amount` and PR/RFQ carry none. Resolution: wfl_flow_configs.extras gains `amount_field` (default total) read by both the engine's `act()` and the tool-side `nbApproveEngine`; `nextStateOf`'s approve branch now lands one-round approvals when the amount is absent (undefined) and routes to level 2 only on an explicit over-threshold amount — document types without an amount column (PR/RFQ) must not be forced into a second sign-off. Both sides changed together; the selftest gained the no-amount assertion as a regression guard.
- **The wms_receipts columns (po_id/iqc_status) land in w3, not h5**: the batch plan put them in h5, but the all chain runs h5 before w3 and an m2o targeting a nonexistent pur_orders makes h5's fields:create 400. The single execution point moved to w3 (after pur_orders exists); h5 only changed engine behavior (the PO quarantine split and releaseReceipt) and stays compatible with worlds where po_id is absent (free receipts take the original path).
- **The IQC anchor stays two-level until B8**: PO-sourced receipts always put away into the quarantine zone (wms_zones seed SH-Q, lot=quarantined, stock=hold); `--release-receipt` requires iqc_status ∈ {passed, not_required, concession} before moving the stock into a qualified bin (TRANSFER movement + lot qualified + receipt closed). "No IQC release, no putaway" is enforced by releaseReceipt's refusal (the error text carries IQC 未放行).
- **The three-way-match tolerance**: `qty_billed ≤ Σlines.qty` and `|invoice_amount − Σlines(qty×unit_price)| ≤ 0.05` (absolute, the 04-b3 spec verbatim); both ok → matched, else exception (non-blocking; human confirmation → confirmed, the Odoo stance). The invoice's verification axis rides the single `match_result` column (draft→matched/exception→confirmed); the pur_payments→pur_invoices gate reads `upstream_state_field='match_result', required='confirmed'` — the B2 set-gate mechanism's first use outside the supplier domain.
- **A generic set-gate message**: the invoice gate's refusal cannot reuse the supplier-admission wording (gateNotAdmittedMessage's 未准入/不合格供方不能下采购单). approval-rules gained `gateNotInSetMessage` (generic: `{label}'s {stateField} is X, outside the required set {set}`); the engine and nb_create route to the supplier-specific or generic text by whether stateField is lifecycle_status.

## Notes

- A gate's `upstream_ref_field` must stay null (the id path): the first seed configured pur_rfqs→pur_requests with ref_field='code', and enforceGates filtering the string code column by a numeric id returned HTTP 500 instead of a refusal. w3's ensureGates now repairs drifted rows to id references.
- postReceipt must not overwrite an explicit not_required (免检 declared at registration); setIqc and release likewise stay idempotent on closed receipts (replay kept).
- demo-chain replay semantics: passed steps skip (award/approvals/postings/matches each keep a kept branch), and when a negative-control fixture was consumed by an earlier run the chain switches to the backup quarantined receipt or skips with an explicit "verified on first run" note.
- The mobile procurement query skill (PO three-axis card / comparison table) is a persona read path, mutually exclusive with registration; existing sessions do not inherit the new persona — verification needs a fresh session.
- Until `pnpm run build` (the client lib) reruns, the :3080 welcome screen's capabilities line still shows the old six-form copy; conversation behavior and draft cards are unaffected (server persona + runtime registry updated).

## Evidence

- Engine scripts [`nocobase-w3-procurement.mts`](../../../../examples/kb-agent/scripts/nocobase-w3-procurement.mts) (9 collections + flow×4 + gate×6 + seeds + the seven 采购管理 pages + `--demo-chain`) and [`nocobase-h5-wms.mts`](../../../../examples/kb-agent/scripts/nocobase-h5-wms.mts) (quarantine-zone seed / postReceipt split / releaseReceipt / `--iqc`).
- demo-chain green with gate negatives ×3 and both tolerance cases: `research/2026-09-25-w-round/b3-chain-log.txt`; nine psql read-only sections: `b3-psql.txt`; dual-end screenshots: `b3-admin-{compare,po-triaxis,invoice-match,pr-converted}.png` + `b3-mobile-{po-status,receipt-draft,receipt-done}.png`.
- Rules-source changes: [`approval-rules.ts`](../../../../packages/connector/tool-nocobase/src/approval-rules.ts) (nextStateOf semantics + gateNotInSetMessage), [`write.ts`](../../../../packages/connector/tool-nocobase/src/write.ts) and [`approval-engine.mts`](../../../../examples/kb-agent/scripts/approval-engine.mts) (amount_field synced on both sides).

## Alternatives considered

- **Matching/tolerance arithmetic in a workflow node** — the ⑪ constraint again; the engine's `--match-invoice` owns the three-way check and writes the recomputable match_note.
- **Paying on exception invoices without human release** — the gate refuses `match_result != confirmed`; a human `--confirm-invoice` is the release valve.
- **A separate quarantine-receipt collection** — the WMS zone + `iqc_status` on `wms_receipts` carries the state; a second collection would fork the receipt truth.

## Consequences

本 Note 记录的决策自此成为对应面的现行契约（详见 Decision 与 Verification）。
