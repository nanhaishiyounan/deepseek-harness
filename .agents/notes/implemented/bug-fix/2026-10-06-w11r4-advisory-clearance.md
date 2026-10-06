# Agent Note: W11-R4 advisory clearance — ledger attribution, three-family disclosure, sweep-trace spec, a tightened aggregation probe, the send-failure toast anchor, the landscape anchor

Status: implemented

English | [中文](2026-10-06-w11r4-advisory-clearance.zh.md)

## Problem

W11-R3 re-verification closed PASS_WITH_DEBT 87.3 (go-live released); its report registered four advisory items plus two incidental observations. All six ride R3's own surfaces:

- **The R3 ledger attributed a test count that never happened**: INDEX R3 and the R3 note (en + zh) claimed 754/754 with「new: views logout-disclosure 1, composer maskClassName 1」— the R3 commit's it/test delta is 0 (the assertions folded into existing cases); the static count runs 673 (R1) → 684 (R2, +11) → 684 (R3, +0), so the 9-case gap from R2's 745 ledger to the 754 reality is R2-era additions the R2 ledger undercounted. R2's「745/745 (new …11)」carries the same self-contradiction (743 + 11 = 754).
- **The logout disclosure named two of the three swept families**: the dialog said「本地草稿与待发消息将被清除」while the sweep also clears attachment strips; the same page's data row said「本机仅保留主题与输入中的草稿」— one page, two statements.
- **`session-keys.swept` had no jsdom spec**: the trace was asserted only by the live probe.
- **R3-1a's one-of-two OR let the aggregation go unproven**: the live probe picked twice on the single-file doc input — two picks are two batches by construction, and the wire-level stub answers each response as its own network event, so the second toast replaced the first; the OR read the survivor as the batch.
- **The transient send-failure toast rode no lift** (observation): `ErrorToast` showed at the bare bottom anchor while the batch-failure toast lifted.
- **The 150px portrait anchor fails in landscape** (observation): measured +11/−10px on 844×390.

## Decision

- **The ledger reads the static count**: INDEX R2/R3 and both notes' ledger lines now say 754/754 with the R2-era attribution (R2's own line notes its 745 undercounted by 9, corrected here); the R3 line states the assertions folded into existing cases; `verify-translation-pairing --write` re-recorded both note pairs.
- **The disclosure names all three families** —「本地草稿、待发消息与附件将被清除」— and the data row reads a new `DATA_NOTE` constant (one source for the row and its dialog):「本机仅保留主题等偏好，草稿、待发消息与附件为登出即清的暂存」; the views spec pins both.
- **The sweep trace has a jsdom assertion**: the logout case in local-keys spec spies `console.info`, finds exactly one `session-keys.swept` line, and pins type/count/keys (count === keys.length, both seeded keys present).
- **R3-1a tightened to && and the probe now proves aggregation**: one multiple-image pick (the album input carries `multiple`; the doc input is single-file) fires both picks in one change event, and the probe answers `data.describeImage` inside the page — both failures settle in one render pass, which the wire-level stub cannot schedule (each response is its own network event). The /api wire is the deployment's stubbed face either way; no product seam is stubbed. The re-run R3 script reads 6/6 under the tightened assertion and the three-family dialog copy.
- **`ErrorToast` rides the same `toastLift` mask** as the batch toast (anchor parity, composer spec asserts maskClassName).
- **The landscape anchor is an orientation media query at 175px**: a landscape viewport squeezes the strip's top rail further from the floor, so the bottom edge rides 25px higher; measured clearance 36px on 844×390.

## Consequences

ui-mobile 755/755 (new: composer send-failure anchor 1; views disclosure/data-row and local-keys sweep-trace assertions folded into existing cases), `tsc -b tsconfig.client.json` green, oxlint 0 errors on changed files. Live verification `w11-r4-live-verify.log` 8/8 on the rebuilt :3080 dist (identity seeded, nocobase bounce isolated as before): landscape aggregation toast names both failed picks with clearance 36.0px and computed bottom=175px; the refused-send toast rides the lift class with computed bottom=150px (rect 150.0px off the floor — the send's terminal `finalizeSend`/`lane.clear` empties the strip before the toast shows, so the anchor, not a strip clearance, is the shared face); the data row and the dialog agree on the three families verbatim. The tightened `.verify-w11r3.mjs` re-runs 6/6 (log rewritten). Screenshots `w11-r4-{01-landscape-toast-clearance-844, 02-sendfail-toast-anchored-375, 03-logout-disclosure-three-families-375}.png`.

## Alternatives considered

- **A calc()-scaled anchor (viewport-height ratio)** — the rail band's geometry differs by orientation (the landscape composer band is taller), so a ratio does not guarantee the clearance; the orientation query pins a measured value per face.
- **Leaving aggregation to the jsdom spec (it already feeds a true batch)** — the live probe then never proves the aggregation path; the tightened and-assertion plus the same-tick probe is what makes「点名全部失败附件」meaningful.
- **Keeping `ErrorToast` at the bare bottom anchor** — the send clears the strip before the toast shows, but the two failure toasts sharing one anchor is the convention; parity costs one spread of the existing maskClassName.
