# Agent Note: W1 approval engine — data-layer state machine as the single transition truth, dual entry points, and the gate quartet

Status: implemented

English | [中文](2026-09-25-w1-approval-engine-single-source.zh.md)

## Problem

The product had three approval patterns that never met: NocoBase collection workflows (three domain-local chains), a code-level state machine in expert-orders, and the mobile v3 human-review card that wrote via `nb_create` without producing any platform approval task. There was no shared engine, no audit trail, and no "not-yet-effective cannot drive downstream" gate — while the user's core ask was 审核怎么审、审批流呢. The NocoBase PRO Workflow Approval plugin is out of reach (and its update node cannot do read-modify-write arithmetic anyway, a conclusion the 2026-09-15 workflow note already owns).

## Decision

**The data layer owns the state machine; one script engine is the only write path.** Six `wfl_*` collections (ERPNext Workflow's paradigm, NocoBase-ized): `flow_configs` / `flow_states` / `flow_transitions` (configuration), `approval_records` (append-only audit, the five elements who/when/action/comment/attempt), `approval_todos` (both ends' work queue), plus `gate_configs` (the downstream gate). `examples/kb-agent/scripts/approval-engine.mts` is the only module that moves a document's `doc_status`; everything else goes through it.

**Doc_status is the string state; the anchor is a mapping, not a column.** The pilot column on `hub_po_purchase_orders` stores the six-state string (`draft/pending/pending_level2/approved/rejected/void`); the ERPNext 0/1/2 anchor rides `DOC_STATUS_ANCHORS` and is recorded per transition on every audit row (`from_anchor`/`to_anchor`). The legacy business `status` column stays untouched — the D2 dual-axis separation.

**Rules live in one code file both engines import.** `packages/connector/tool-nocobase/src/approval-rules.ts` holds the state vocabulary, the anchors, the transition table with the amount-threshold route (`total <= 100000` → one approval lands; above → `pending_level2`, Odoo `po_double_validation` semantics), the condition DSL evaluator (only `field <= n` / `field > n` — anything else fails loud), and the Chinese refusal texts. The script engine (`approval-engine.mts`, which the NocoBase workflow's request node calls over HTTP on :13110) and the `nb_approve` tool (`write.ts`'s `nbApproveEngine` over the REST client) each run structurally parallel orchestrations over this one rules module; drift on rules is impossible, drift on orchestration is bounded by the parallel-structure contract documented in both module headers and covered by mirrored tests.

**The gate quartet rides the write tools, config-driven.** `nb_create` runs `enforceCreateGates` before landing: every `wfl_gate_configs` row binding the target collection resolves the values' upstream reference (`upstream_field`, matched via `upstream_ref_field` — the pilot binds `wms_receipts.source_no` → `hub_po_purchase_orders.po_number`) and requires the upstream row to be `approved`, refusing with the 未生效 message. `nb_update` runs the edit lock (`pending`, `pending_level2`, `approved`, `void` refuse; `draft`/`rejected` stay editable for revise-and-resubmit). Deployments whose NocoBase predates the engine keep their old behavior: both probes read a 404 on the `wfl_*` collections as "no engine", answer empty, and pass through — every other failure surfaces.

**Concurrency idempotence is an optimistic conditional write-back.** The engine's act/submit first updates the document with `filter: {id, [state_field]: current}`; zero rows moved means a racing act already won, and the loser refuses before any record/todo write. This closed a real double-fire: the NocoBase collection workflow retried its request callback once, and the pre-gate engine wrote two audit rows for one approval. The tool side keeps the plain write (single-user conversation path); its sequence-level idempotence (a repeated act meets 非法审批转移) is unit-tested.

**The page entry is an intent row the engine consumes.** The 审批中心 page's Add-new writes a `wfl_approval_records` row with `source=page`; the workflow's condition (`source == 'page'`) forwards it to the engine's `/act`, and the engine deletes the intent row on success — so the records table shows only engine-written audit rows. The `source` discriminator is also the loop breaker: the engine's own `source=engine` rows never re-trigger the callback.

## Alternatives considered

- NocoBase PRO Workflow Approval — unavailable; and the OSS workflow's update node cannot do read-modify-write, so approval-level cascades must be script-side anyway.
- A single shared orchestration package imported by both entry points — rejected: the script engine runs under tsx with its own REST face (`update?filter=` optimistic writes, which `NocoBaseClient.update` does not expose), and the tool package must stay deployable without the example scripts. The shared rules file keeps the drift surface at zero for rules and at one mirrored pair for orchestration.
- Storing the anchor (0/1/2) as the document column — rejected: the psql-assertable lifecycle (`draft → pending → approved`) and the intermediate states (`pending_level2`) both need the string; the anchor is a per-state property that belongs on `flow_states` and each audit row.
- Workflow-trigger filters (`config.filter`) instead of the source condition — unverified wire; the condition node is the pattern already proven at h4:707.

## Consequences

- All later batches (B2–B8) mount their document flows by seeding `wfl_*` rows from the same `PILOT_TRANSITIONS` shape — no new engine code per domain.
- The `approval_pending` / `approval_confirm` / `approval_result` protocol fences (v3) extend the mobile wire: the pending card is actionable (同意/驳回 + remark sends the fenced user message the assistant answers with `nb_approve`), the result card is read-only. The parser normalizes the model's Chinese state spellings onto the closed English enum — the enum stays closed; bilingual spelling is one state vocabulary.
- `setup-nocobase.mts` all-chain replays `nocobase-w1-approval.mts` between h5 and n18, and verify asserts the six collections, the 审批中心 page, the activated pilot flow config, the gate row, and the pilot column (n18 floor 43→44).
- Known gap: the 审批中心 todo block's pinned `status=open` default filter did not take effect (the v2 TableBlockModel filter wire has no verified shape yet); the block title states the filter and the status column renders colored tags. Wiring the verified block filter is left to a later batch.
- The engine's `--serve` (:13110) must run for the page entry; the mobile and CLI entries do not depend on it.
