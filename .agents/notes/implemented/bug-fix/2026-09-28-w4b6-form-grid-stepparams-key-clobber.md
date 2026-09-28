# Agent Note: W4-B6 regression drill exposed the FormGrid stepParams key-clobber and re-based the acceptance bar on quantified-zero + task-completion

Status: implemented

English | [中文](2026-09-28-w4b6-form-grid-stepparams-key-clobber.zh.md)

## Problem

The W4-B6 final-acceptance regression drill (sabotage one FilterForm block, expect the verify assertion to go red, heal it back green) kept the red leg green-proof but the recovery leg lost data: after `w4-heal-b2.mts --all` re-ran, `assignRuleGrids` dropped 61 → 60 without any assertion firing (the floor was exactly 60). Root cause: `/api/flowModels:save` replaces the `stepParams` object wholesale, and the two B2 write sites each carried only their own half — the layout rewrite posted `stepParams: { gridSettings }` while `assignFormDefaults` (which even reads `stepParamsBefore` to compute the pending rules) posted `stepParams: { formModelSettings }`. Whichever write landed last won: the first full heal run finished with assignRules (so the audit snapshot showed grids with `formModelSettings` but no `gridSettings`), and an idempotent re-run that only needed the layout skipped the assignRules write and clobbered it. A same-shape latent defect sat in `statCardRaw` usage: the B3-era `unitPrefix/unitSuffix/decimals` optional props violated `exactOptionalPropertyTypes` and only surfaced when the untracked W4 tree first met the full host typecheck.

## Decision

Treat `flowModels:save` stepParams as replace-semantics and write sibling-preserving spreads at both sites (`{ ...stepParamsBefore, formModelSettings }` in `assignFormDefaults`; `{ ...tree.stepParams, gridSettings }` in the B2 layout save), then re-run the heal so the one damaged grid self-heals (assignRules rewritten, both keys coexisting — verified live). Fix the statCard call with conditional spreads, matching the file's own `...(x === undefined ? {} : { x })` idiom. The B6 acceptance bar itself is now two-legged and evidence-pinned: (1) the audit probe's before/after reconciliation must show every defect counter zero or covered by a checked-in exemption ledger (L3 config / <4-field forms for single-column, page levels for stat cards, D5 engine-domain read-only for Edit); (2) each of the eight role journeys closes on task-completion evidence — stat-card numbers reconciled against SELECT sums (canvas rendering means innerText cannot read them; visual reads landed 7/7), created rows carrying assignRules defaults (draft + today), Edit round-trips byte-identical, negative legs leaving row counts unchanged — with member-side fences re-proven (qc routes 0 rows, terminal iframe honoring W3_TERMINAL_BASE).

## Consequences

The drill transcript now documents a real caught-and-fixed defect instead of a tautology: the sabotage→red→heal→green loop is the only cheap way to surface order-dependent clobbers that sit exactly on an assertion floor. `setup-nocobase.mts verify` keeps guarding all five W4 assertion families plus every historical W/W2/W3 check (all green this round); the before/after table (21/21 PASS), the journey transcript (55 screenshots, 20 SQL reconciliations), and the drill record are archived under `research/2026-09-28-w4-completeness/` with `99-w4-deliverables.md` as the rollup. Known residue is registered, not hidden: the condition-builder FilterForm on 6+-field pages has no stable automation anchor (B1 pilot screenshot + assertions + 13-step screenshots carry the evidence), n17 legacy 3-field create forms keep the small-form exemption, and journey-created draft rows stay in the demo DB (pre-read card baselines make them inert).

## Alternatives considered

- **Raising the assignRules floor to 61** — would have re-red the next legitimate collection change; the clobber, not the floor, was the defect.
- **Post-flight reconciliation instead of fixing the write sites** — a second healing pass would still race the same replace-semantics on its own layout writes.
- **Deep-merging inside `dataOf`** — `flowModels:save` is the platform's API; the merge belongs to callers that know which keys they own.
