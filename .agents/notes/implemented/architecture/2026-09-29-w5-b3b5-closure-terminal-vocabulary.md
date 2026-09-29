# Agent Note: W5-B3/B4/B5 business-loop breakpoint clearance — the terminal-vocabulary mechanism and effective-side auto-advance

Status: implemented

English | [中文](2026-09-29-w5-b3b5-closure-terminal-vocabulary.zh.md)

## Problem

The W5 closure inventory lists 22 cross-segment breakpoints; B3/B4/B5 carry 16 of them. The structural diagnosis is threefold: (1) vocabulary-external terminals (pur_payments' paid, MO's completed, the supplier grade states) bypass the state-machine source of truth — a direct write sticks and a mispayment cannot be voided; (2) the cross-segment "half-step stall" is a pattern, not incidents — a passed IQC still needed a manual release CLI, an OQC release did not top up SO reservations, a confirmed ROP suggestion never minted its PR, and SO shipping left no outbound-ledger rows; (3) caliber splits (ap_balance counted only approved so paying a bill bounced AP back up, the delivery axis read two different dates, AR netted globally with no per-order tie).

## Decision

- **One terminal-vocabulary mechanism, four domains reuse it.** A flow's `graph.extras.terminals` (states + transitions) compiles into the derived wfl rows and lands as `extras.terminal_states`; `readState` extends the base vocabulary's `isState` with it, so business-terminal documents keep acting through the engine; `ApprovalAction` grows the seven business actions settle/promote/demote/restrict/freeze/eliminate/restore (the act whitelist admits them; no todos open; the move is a plain CAS). rowsToGraph reverses out-of-vocabulary rows back into the terminals block, so the round-trip equivalence holds (w5b2 --migrate: 70 ✓ including pur_payments at 7 states / 10 transitions). The admission vocabulary folds its four grade states in the same move — every grade change rides the engine, the gate set semantics untouched.
- **State columns move only through the engine (the nb_update guard).** `assertRowEditable` refuses an update whose values carry the flow column (doc_status / lifecycle_status) — closing the draft-state direct-write bypass; paid's settle and the mispayment void (paid×void→void) both live in the engine audit (the PAY-W5B5-MIS rehearsal leaves both hops recorded).
- **hub_po retires onto a dedicated self-test carrier, not a business collection.** wfl_selftest_docs (non-business) carries seedFlow / the selftest / w5b2 --features; the hub_po flow deactivates, its two gates drop, a config_note audits; pur_orders' flow and gate stay (setup verify asserts the new semantics).
- **Auto-advance hangs on the verdict/release effective point; humans handle exceptions.** A passed IQC auto-releases the receipt (RCV-W5B4-I02 closed in one step); a passed OQC auto-releases the completion whose tail tops up owing SO reservations idempotently (RSV 0→3 proven; the call runs as a child CLI — a dynamic import back into mrp-run would deadlock the module graph under top-level await because mrp-run statically imports this module's writers); ROP confirm mints the draft PR with the back-reference (PR-2026-0010/11/12), and scanReorder's tail auto-closes open/confirmed rows whose ATP recovered; shipSo lands one wms_shipments row (sales type) per reservation consumed.
- **Caliber unification picks the well-covered direction.** ap_balance's deduction widens to doc_status∈{approved,paid} (the KPI mirror gains a paid-row assertion); the delivery axis unifies on need_date (23/26 coverage vs expected_date's 2/26 — the scorecard moves to need_date with empty dates leaving the denominator, matching otdSupplierOf); MO's completion terminal unifies on closed (the write point, three KPI filters, and a 3-row backfill); crm_payments grows so_order_id for per-order netting (the SO-level balance = Σapproved − Σnetted, asserted).
- **The member chart 403 was a collection-view gap, not a charts permission.** The upstream `applyQueryPermission` reads `acl.can({resource: <collection>, action: 'view'})`; granting member view over the 22 manufacturing tables (read-only, no write actions) turned b4guard's live charts:queryData to 200 — W4 leftover #2 closes here.

## Alternatives considered

- **Growing ApprovalAction into an engine-core enum per terminal** — rejected: terminals are doc_type business properties, not global approval semantics; the declaration lives in the graph (the editing-truth iron law holds), the compile product carries it, and the next domain needs zero engine changes.
- **psql-inserting terminal rows around the publish chain** — rejected (one exception): publish's delete-all-insert-all would wipe orphan rows; the sole exception is the admission template upgrade (live 4/4 vs template 8/13 is drift by design — the round-trip gate refuses it correctly), which rides idempotent INSERTs per the seedDocFlow repair precedent, after which every publish is byte-equivalent.
- **BP-06 top-up via dynamic import** — disproved live: mrp-run statically imports this module, so the dynamic back-import deadlocks under top-level await (the process hangs silently with an unsettled-top-level-await warning); the child CLI is the nine-step chain's own runScript precedent.
- **Unifying on expected_date** — the data refused: 2/26 coverage would collapse otd_supplier's denominator; need_date is the demand-side axis the KPI already reads, and a one-sided scorecard migration reaches the same number.

## Consequences

- All 16 BPs pass item by item: w5b3-closure / w5b4-autoflow / w5b5-terminals green in both --run and --assert (repeatable); the nine-step chain s1..s9 replays green idempotently; --assert-ledger balances 51 groups; w5b2 --migrate covers nine types with 70 ✓ (terminals round-trip included); approval-engine --selftest (settle / promote / extendVocabulary / the mispayment matrix) and the kpi/mrp selftests pass; tool-nocobase vitest 42/42; four browser captures under research/2026-09-29-w5-rework/.
- Incidental truth-debt repairs: the B2-era `total >= 1` condition-DSL test assertion (>= had long been legal); the MRP snapshot writing '' into a date column for an empty need (exposed by the BP-15 rehearsal; now null).
- Newly found, deferred to B8: the qty=0 hold stock row residue after a completion release (applyStockDelta zeroes the quantity but not the row); each full w5b4 pass mints a fresh open suggestion for product9 (normal scan behavior; convergence guard added).

## Traps (will bite again)

- **console.warn rides stderr** — a spawnSync that captures only stdout loses loud-warning assertions; runCli must merge both streams.
- **NocoBase's dev server ECONNRESETs after API-heavy passes** (known since w4-r2) — one 1.5s retry on idempotent reads stabilizes it.
- **psql folds unquoted CamelCase identifiers to lowercase** — rolesResourcesActions must stay `"rolesResourcesActions"` throughout.
- **The engine --serve exits silently after long runs** — on ECONNREFUSED mid-regression, check the process before diagnosing; nohup with a /tmp log restarts it.
