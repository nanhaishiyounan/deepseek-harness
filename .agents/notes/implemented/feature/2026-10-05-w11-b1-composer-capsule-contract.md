# Agent Note: W11-B1 — the composer capsule's 46px contract moved to the wrapper box

Status: implemented

English | [中文](2026-10-05-w11-b1-composer-capsule-contract.zh.md)

## Problem

The chat composer's textarea rendered with zero padding, a 24px engine-default line box, and its single-line text parked 1px under the top rim (bottom gap 25px) — the user-visible "padding is wrong" report. The slot also had no focus face at all: mobile taps carry `:focus`, never `:focus-visible`, so the global `.dshm-root :focus-visible` ring never fired and focusing the slot gave zero feedback.

Live measurement over the `:3080` gateway traced the padding defect away from the suspected values: `chat.module.css`'s `.input` did declare `--padding: 10px 18px`, `--adm-text-area-min-height`, `--adm-text-area-max-height`, `--line-height`, `--background`, `--box-sizing` — but antd-mobile 5.43's `.adm-text-area` consumes only `--font-size`, `--color`, `--placeholder-color`, `--text-align`. Every other dial was a dead declaration: the element keeps its own `padding: 0; line-height: 1.5; min-height: 1.5em; background: transparent`. Two more compounding facts: the antd default `rows: 2` floors the autoSize sizer's `hidden.scrollHeight` at two rows (single-line height 48px, capsule 50px — off the 46px contract), and the sizer clamps height to `[minRows, maxRows] × computed line-height` with the padding outside the clamp, so padding on the element itself would clip the fourth row.

## Decision

The capsule's box arithmetic lives on the wrapper, the line metrics on the element:

- `.input` (the `.adm-text-area` wrapper) owns `padding: 10.5px 18px`, `background: var(--dshm-card)`, the 1.5px roast rim, and the seal radius. Single line = 1.5 + 10.5 + 22 + 10.5 + 1.5 = 46px; every added row is one 22px step (68 / 90 / 112px), then it scrolls.
- `.input :global(.adm-text-area-element)` owns only `line-height: 22px; min-height: 22px` — exactly the inputs the autoSize sizer reads, so its clamp lands on whole rows and `rows={1}` (new on the TextArea) removes the two-row floor.
- Focus is `.input:focus-within` wearing the fill-flash 0% pair (`border-color: var(--dshm-brand)` + `0 0 0 3px var(--dshm-brand-soft)`) — the same design language, held for as long as the slot keeps focus; both tracks follow the tokens automatically.
- The `input-fill` keyframes now pin only a 0% frame (adding the `brand-soft` wash). Every property interpolates back to its cascade value, so a flash while focused fades the wash out over the steady brand rim instead of fighting it, and the reduced-motion block (which already kills the animation) needs no change.

Two audit-driven siblings landed with it: the chats `filterTabs` idle capsules gained a 1px roast rim (on the dark track the idle face sat ~6 RGB off the canvas — the VLM audit read the row as a dead zone), and `PageNav`'s `.pageTitle` gained the one-line ellipsis trio (work-detail's supplier + batch + ISO string clipped raw with no ellipsis).

## Consequences

- A capsule-padding or line-metric regression now fails `composer-skin.client.spec.ts`, which pins the cascade source (wrapper arithmetic, element metrics, focus pair, 0%-only keyframes, reduced-motion block) and rejects any re-introduction of the dead dials; `views.client.spec.tsx` pins `rows=1`.
- Any future antd-mobile upgrade must re-check which dials the text-area consumes — the dead set is documented in the `.input` comment block, and the probe (`demos/acceptance-w11/.probe-w11b1.mjs`) reads the live geometry in one run.
- The 46px / 999px / 1.5px values stay untouched: the W10 ledger ruled them the spec itself.
- DOM-order gotcha for probes: `document.querySelector('h1')` on any secondary page returns home's ever-present (display:none) heroTitle — reachability anchors must target the page's own headline class.

## Alternatives considered

- Padding on the element instead of the wrapper — the autoSize sizer clamps height to whole rows with padding outside the clamp, so the fourth row would clip (live-measured, not assumed).
- Keeping `rows: 2` and compensating the min-height — the sizer floors `hidden.scrollHeight` at two rows, pinning the capsule at 50px against the 46px contract; `rows={1}` removes the floor outright.
- Riding the global `:focus-visible` ring — mobile taps deliver `:focus` only, so the ring never fires on the touch surface; `:focus-within` on the wrapper is the face that actually lights.
- `padding-right` to pull the chats work-tab's last capsule out of the edge fade — the row genuinely overflows 16.3px (a scrollable scene), so the pad does nothing and the fade is the W10 discoverability spec; rolled back with the F2 reshoot as the record.
