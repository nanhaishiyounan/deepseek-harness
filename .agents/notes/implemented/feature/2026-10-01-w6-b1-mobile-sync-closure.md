# Agent Note: W6-B1: mobile sync closure — todos page, doc browsing, server-side numbering, outbox, effect backlog, scheduled lakehouse transfer

Status: implemented

English | [中文](2026-10-01-w6-b1-mobile-sync-closure.zh.md)

- Date: 2026-10-01
- Status: implemented
- Area: feature
- Scope: `packages/client/ui-mobile` (todos/docs routes, outbox, ledger projection, receipt verification), `packages/connector/tool-nocobase` (server-side numbering, effect backlog enqueue), `examples/kb-agent` (engine backlog drain + nightly transfer leg, preset contracts)
- Plan: [`plans/plan-w6.zh.md`](../../../../plans/plan-w6.zh.md) §B1; gap evidence [`resear../../../../research/2026-10-01-w6-research/mobile-nocobase-sync-gaps.md`](../../../../research/2026-10-01-w6-research/mobile-nocobase-sync-gaps.md) (G2/G3/G5/G6/G7/G8)
- Evidence: `demos/acceptance-w6/w6-b1-01…09` (live run: engine+gateway+NocoBase, psql reconciled)

## Problem

Six sync gaps (G2~G8) kept mobile out of production: approval status never flowed back, the ledger lived in localStorage, the lakehouse snapshot went stale, offline sends were unprotected, there was no document browsing, and the engine was a single point of failure.

## Decision

1. **G2 (approval state never flowed back)** — three legs:
   - `#/todos` (new route + `TodosView`): the signed-in user's open `wfl_approval_todos` rows over the gateway's realtime `nocobase.list` forward, 5s poll + pull-to-refresh, segmented counts, per-row 同意/驳回 opening a fill-assistant session that carries the B0 acting-user gate (`actOnTodo` in `ledgerService.ts`).
   - Chat approval cards re-read the live `doc_status` (4s poll while idle): a state that left the review words settles the frozen pending snapshot as 他端已处理 (`ApprovalCard` `externalState`, `ChatView` `approvalStates`).
   - The read reconciles with the engine's own `GET /todos?user=` and psql (assertion leg in `w6b1-sync.mts`).
2. **G3 (ledger was pure localStorage)** — 「本月登记」 now projects from `wfl_approval_records` submit rows by the acting user (`myMonthlyRegistrations`); the recent-receipt strip keeps folding the durable session log. Cross-device true, survives local clears.
3. **G5 part A (weak network)** — the outbox (`outboxStore.ts`): a transport-level send failure (fetch `TypeError`) parks the message durably; exponential backoff (immediate → 2^n s, capped 60s), `online`-event flush, bounded queue (50), per-entry retry. The chat surfaces the queued count as the degradation strip; recovery clears it automatically.
4. **G5 part B (client preview collision)** — `nb_create` draws the number server-side when the guarded column arrives empty (`allocateEmptyCode`/`nextNumberFor`: descending read-back, same-year max+1, year rollover restarts at 0001). The mobile preview stays display-only (`systemFields.ts` reads back number-descending); the preset now instructs the model to pass `""` for number fields and echo the landing row's real code in the receipt. Concurrent drafts can no longer collide; retries re-draw.
5. **G6 (no doc browsing)** — `#/docs` (role-whitelisted catalog in `docsCatalog.ts`), `#/docs/:collection` (live list), `#/docs/:collection/:id` (full field read + the approval trail from `wfl_approval_records`). Zero conversation rounds for look-ups.
6. **G7 (lakehouse snapshot staleness)** — the nightly timer gained a `lakehouse-transfer` leg (`w6b1-lakehouse-transfer.mts`): 13 NocoBase business tables land as full-replace `nb_*` Parquet snapshots through the same `lakehouse.load` seam; the business-advisor preset now mandates the data-cutoff annotation on lakehouse answers and routes real-time questions to `nb_list`.
7. **G8 (engine single point)** — a failed `/effective-effects` call lands the document on the durable `wfl_effect_backlog` queue (NocoBase — survives engine restarts); the engine's serve loop drains it every 30s (idempotent hooks, 10-attempt give-up), `/healthz` reports `backlog_pending`, and the nightly pass carries a `drain-backlog` leg for observability.
8. **B0 leftovers** — ① the fold now renders a `submit_receipt` fence only when a successful `nb_create` result with the same collection:id landed in the window; a fabricated receipt degrades to a collapsed notice (the model narrative is no longer a receipt source). ② the logout dialog copy matches the real-account flow. ③ posting collections (wms/mfg) translate their draft/pending words with posting semantics (待过账) everywhere the todos/docs surfaces render state — never approval words.

## Why these seams

- The todos/docs reads ride the existing `nocobase.list/get` wire (no new gateway methods): the domain is already the realtime, gated forward — B1's gap was consumption, not transport.
- The approval action deliberately opens an agent session rather than a direct engine call: the B0 acting-user gate stamps and checks identity inside `nb_approve`, so a mobile approval cannot bypass the gate; the anonymous `#/docs` browse surface stays open — writes and approvals always need a signed-in session.
- The effect backlog lives in NocoBase (not engine memory) precisely because the failure mode it covers is the engine being down.

## Invariants worth keeping

- A receipt card requires a matching successful `nb_create` landing (`fold.ts` `ReceiptVerification`); the session-list projection window widened to 16 events so the call/result pair is always in view.
- `allocateEmptyCode` runs before `enforceCodeUniqueness`; the partial unique index remains the authoritative backstop behind both caller-supplied and drawn numbers.
- `drainEffectBacklog` replays only through `effectiveEffects()` (the single effect exit); a row that fails ten times lands `failed` for humans, never loops forever.

## Verification

- `pnpm run typecheck` (0 errors); vitest: ui-mobile 644/644 (incl. new outbox/docs-catalog/fold-degrade cases + the receipt-verification rewrites), tool-nocobase 48/48 (incl. the server-numbering pair; see gates-b1.log §A), apiproxy green; oxlint staged config 0 errors on changed files.
- `w6b1-sync.mts --assert` 14/14 (backlog schema+healthz, todo reconciliation, submit→route→approve→closed closure, lakehouse row-count parity, backlog replay done, zero duplicate guarded numbers; the count matches the ✓ lines in w6-b1-09-assert.log).
- Live evidence: `w6-b1-01…05` (todos page, approve modal→session→closed with audit `approve|qc_inspector`, docs catalog/list/detail/trail, buyer role filter, offline→queued→recovered), `w6-b1-06` (draft preview vs landing code), `w6-b1-09` assertion log.

## Follow-ups

- The `#/docs` catalog is a fixed role table; B10's role rehearsal may extend it per-site (config surface, not code).
- Push notifications would replace the 5s poll at scale; the poll is the right cost at single-site sizes.

## Alternatives considered

- **NocoBase mobile layouts vs apiproxy read methods + ui-mobile routes** — the apiproxy/domain-forwarding shape (ADR #2 family) won: verified capability, zero platform-subtree edits.

## Consequences

Cost: reads detour through the engine proxy. Bought: all six gaps closed (todos/docs/ledger projection/outbox retry/lakehouse timer/compensation queue).
