# Agent Note: W2 final-verification named-debt clearance micro-batch (W2-R1)

Status: implemented

English | [中文](2026-09-27-w2r1-verify-debt-clearance.zh.md)

## Problem

The W2 final verification (92, PASS_WITH_DEBT) left four debt classes plus two drive-by items: the W2-B7 Note's Evidence cites a nonexistent `w2-b7-setup-verify.txt`; the `setup-nocobase.mts verify` OK banner lacks its w2-b7 assertion-list entry (the assertions themselves have been in place since W2-B7); `kpi-run.mts` has no `ar_balance` mirror assertions (the `ap_balance` side has them) and `approval-engine.mts`'s `parseNightlyEnv` negatives live only in the deployment doc; three "quarter-start" wordings contradict the implementation (every day of a quarter-start month fires, with `calcScorecard` recomputing idempotently — not only the quarter's first day). Plus evidence hygiene (`w2-b7-arap-page.png` ≡ `details.png` by sha256; the negatives log's first exit annotation contradicts its own recheck section), the KPI card's 375px money clipping (¥280,820 → ¥280,82), the business-advisor lookup table missing its `ap_balance` row, `projection.ts` reading every non-terminal approval state as 已驳回, and an `ApprovalCard.tsx` double JSDoc.

## Decision

- **Archive a fresh verify run rather than collapse the Note's citation**: the banner gains its w2-b7 entry first (`kpi_snapshots` 25-code floor with ap_balance / the 应收应付对账 page's four ledger blocks + ar/ap trend charts / persona sources + `.dsh` mirrors), then one real verify run archives as `w2-b7-setup-verify.txt` — the archived text and the assertion list stay in sync, and the run doubles as this batch's verify-all-green evidence; the Note's Evidence line rests on the two archived files.
- **Symmetric selftest mirrors**: `ar_balance` gains three assertions (mirror footing 1500 / unapproved orders never count 1200 / an empty month reads 0, not null), with a fixture isomorphic to the `ap_balance` side (an unapproved so_orders row never counts; a future `paid_at` never nets). `parseNightlyEnv`'s three negatives (`25:99` / `abc` / `Mars/Olympus`) plus the all-absent defaults (enabled=false, 02:30, Asia/Shanghai) enter `--selftest`.
- **One quarter-start wording — "recomputed idempotently on every day of a quarter-start month"**: `runNightlySteps`'s `quarterStart = month % 3 === 1` holds every day of the month and `calcScorecard` recomputes the running quarter idempotently; the JSDoc, QUICKSTART.zh, DEPLOY.md, and DEPLOY.zh all state that behavior.
- **Minimal narrow-viewport KPI-card fix**: `.reportMetrics` takes `repeat(auto-fit, minmax(min(112px, 100%), 1fr))` (112px is the smallest cell that fits an 8-character money value at the 16px floor; `min()` keeps one column from overflowing) and `.metricMiniValue` takes `clamp(16px, 4.8vw, 20px)` — below the three-column width the grid drops to two columns, and the six-metric card lays out 2×3 with every figure whole.
- **Persona sources in lockstep**: the business-advisor lookup table gains 应付余额 ap_balance after 应收余额 ar_balance, with `agent.cordis.yml` and its `.dsh` mirror edited together (the verify mirror-diff gate holds the two byte-identical).
- **Three-state approval projection**: states other than approved/rejected (pending, pending_level2, reviewing, …) project as 审批中 instead of the binary fallthrough into 已驳回.

## Alternatives considered

- **Collapsing the Note's citation onto the existing `w2-b7-final-verify.txt`** — refused: after the banner entry lands, a fresh archived run also produces this batch's verify-all-green evidence; two archives each proving one run beats one archive asked to prove two.
- **A smaller grid floor (minmax(96px)) to keep three columns** — refused: ¥280,820 needs roughly 112px of cell width, and 96px would lean on the clamp to squeeze the font; the two-column drop is the design, not a concession.
- **Leaving the `parseNightlyEnv` negatives to the deployment doc** — refused: the negatives live next to the implementation, the selftest already has the try/catch assertion vocabulary, each case costs one line, and the doc wording cannot drift from the code again.

## Consequences

Every Important and Minor item from the W2 final-verification Findings list is cleared. The shooter scripts ship next to their evidence (`w2-r1-shoot-details.mts` / `w2-r1-shoot-mobile.mts`, playwright resolved through the apps/web dependency). Evidence hygiene: `w2-b7-arap-details.png` is re-shot from the page's lower-middle detail region (the payments + purchase-invoice blocks; sha256 now differs from the page-top shot), and the negatives log's first exit annotation defers to its real-process recheck section.

## Verification

`setup-nocobase.mts verify` all green (banner carries the w2-b7 entry; archived as `w2-b7-setup-verify.txt`); `kpi-run.mts --selftest` and `approval-engine.mts --selftest` green (new assertions in, success messages synced); `pnpm vitest run packages/client/ui-mobile packages/connector/tool-nocobase` — 39 files, 677 tests, all green; the fix reached the :3080 gateway's built assets through `build:lib:client` + the apps/web rebuild (mobile CSS hash changed and carries the minmax/clamp), and the 375×667 five-shot (`w2-r1-mobile-375-1..5.png`) shows every money figure whole with the six-metric card at 2×3; typecheck, oxlint staged, and the note gates (format + rewritten pairing hashes) green.
