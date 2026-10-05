# Agent Note: the vision-model review pipeline — VLM as the acceptance instrument, DOM as the referee

Status: implemented

English | [中文](2026-10-05-w10-vision-audit-pipeline.zh.md)

## Problem

The user had twice called the mobile UI ugly, and W9/W10 shipped on top of a purely manual visual pass. B1's answer was to stop making the user the first visual acceptor: run the assembled screenshots through a vision model with a fixed 8-lens prompt and let it enumerate defects with severity, category, and element-level descriptions. The problem then became methodological — a VLM is a noisy instrument: it misreads unscrolled lists as occlusion, calls a deliberate roast-line rim a native border, and its raw counts (156 issues: 11 P0 / 57 P1 / 88 P2) cannot be read as a worklist without a verification layer.

## Decision

- **The pipeline is shoot → VLM audit → DOM cross-verification → theme-batched fixes → reshoot the same matrix → re-audit, anchored on P0=0.** Every B1 finding got one of three tags (`confirmed-by-dom` / `visual-only` / `needs-triage`) from a computed-style probe run on the same live surface; only confirmed findings drove fix themes. The re-audit ran the byte-identical prompt on the byte-identical matrix (same routes, account, viewport) so counts are comparable.
- **Fix by cross-route theme, not per finding.** B1's own rollup already showed 8/11 P0 as "element not reset to the design language": the button UA reset in a low-priority cascade layer (`@layer dshm-button-reset`), the industrial-blue purge, and the dark-track `--adm-*` map closed 11 P0 plus dozens of P1/P2 in three edits. Themes are estimated from the rollup before touching code.
- **New P0s from the re-audit are adjudicated, not auto-obeyed.** B3's fresh 3 P0s were all refuted by DOM evidence (list.bottom == tabbar.top with overflow scroll = unscrolled-list misread; canvas #191310 is roasted warm black, not brand-less #000; the Switch already rides the roast-line/persimmon dials). Each refutation is recorded with its probe numbers in the re-audit report — the anchor "P0=0" means *adjudicated* P0, not *unreported* P0.
- **Residual P1s carry a ledger with reasons** (measured AA ratios, design-language-intentional rims, §3.2 semantic five-state hues, mobile single-line-ellipsis convention). The anchor "P1 ≤ 15" is evaluated by per-finding keyword recurrence against B1's 57, not by the VLM's raw per-round count, which floats with the "report liberally" prompt.

## Alternatives considered

- **Pixel-diff against a golden set** — rejected: the defects are semantic (UA residue, contrast, truncation policy), not displacement; pixel diffs drown in antd shimmer and polling states.
- **Human-only re-review** — rejected: it re-makes the user the first acceptor, exactly what the round exists to stop.
- **Obedient mode (treat every VLM P0 as a bug and fix blindly)** — rejected: two of three re-audit "P0s" were misreads of correct layouts; blind fixing would have redesigned a correct scroller and a compliant switch on a model's say-so.

## Consequences

- The B1→B3 arc: P0 11→0 (adjudicated), P1 57→7 recurrences of which 1 fixed in-round and 6 ledgered with reasons, needs-triage 27→4 (85% auto-resolved by the fix themes, beating the 60% estimate). DOM assertions (12/12) pin the fix set: outset borders 0 across sampled buttons, roster 12px→88px, industrial blue computed-hits 0, dark capsule on the dark dial, composer slot 999px.
- The instrument's known noise: severity drift across rounds (a B1 P1 restated as a B3 P0), occlusion misreads on scrollable lists, and aesthetic escalation on intentional rims. All three are handled by the DOM referee + ledger, which is why the pipeline keeps the VLM as *finder* and never as *judge*.
- Reusable scripts live in `demos/acceptance-w10/` (`.shoot-`, `.audit-`, `.dom-verify-`); a future round renames the prefix, reruns on the rebuilt gateway, and gets comparable counts by construction.

## Notes (pitfalls found live)

- The dark track had no `--adm-*` declarations at all — every antd-mobile portal on dark silently rode light values or antd defaults (#f5f5f5 capsule). When theming a library through CSS variables, both tracks must re-declare the map; a single-track map is a dark-mode hole, not a simplification.
- antd-mobile's TextArea consumes `--border-radius` not at all (that dial belongs to Button) — a capsule slot needs a plain `border-radius` on the wrapper. Component-family variable dials are per-component; verify consumption before trusting a dial name.
- A `:not([class])` button reset skips exactly the buttons you styled through CSS modules — the reset must cover *all* buttons from a cascade layer so unlayered faces always win on their own declarations.
