# Agent Note: Mobile v6 B1 — the "AI colleague" token-track swap, the 430px phone shell, and the four-tab reorder

Status: implemented

English | [中文](2026-09-23-mobile-v6-b1-tokens-shell.zh.md)

## Problem

The v5 ink-teal cold-chain palette (`--dshm-primary:#0b5d56` and family) clashes wholesale with the new "AI colleague · your work buddy" design mock (/Users/mac/Downloads/index (5).html, plans/2026-09-23-mobile-v6-uidesign), a blue system. The mock also brings four shell-level changes: the tab bar becomes 消息/同事/工作台/我的 (chats yields its tab seat), a 430px phone shell (centered + rounded + outer shadow + desk color on desktop), one pageIn transition of `.22s ease` (14px push), and the PC preview bezel widening 390→430. B1 owns tokens and shell only — view layouts stay v5 until B2/B3, so pages wear the new colors over the old layout as the expected intermediate state.

## Decision

**Whole-track token swap: names stay, values change.** [tokens.css](../../../../packages/client/ui-mobile/src/client/tokens.css) takes the mock's `:root` verbatim on the light track (bg `#F2F5F9`, card `#FFFFFF`, card2 `#F7F9FD`, line `#E8EDF4`, text `#18202F`, sub `#758199`, brand `#2E7CF6`, brand-soft `#EAF2FF`, ok `#18A058`, warn `#F59E0B`, danger `#E5484D`, radius 16, shadow `0 6px 24px rgba(23,43,77,.07)`) and `[data-theme=dark]` on the dark track (bg `#0E131B`, card `#1A212D`, card2 `#151B26`, line `#252E3E`, soft `#1B2C4A`, tabbar/header `#131924`). Six tokens are new: `--dshm-brand2` (#22B8E8), `--dshm-user-grad` (the 135° brand gradient for bubbles/send/hero, consumed in B3), `--dshm-header-bg`/`--dshm-tabbar-bg`/`--dshm-input-bg` (the mock's three surfaces; the shell consumes tabbar immediately, B2/B3 take the rest), and `--dshm-shell-shadow` (the desktop halo, one value per track). Dark semantic colors are measured calls: danger lifts to `#ef5f64` (the raw value reads 4.1:1 on card) while success `#18A058` and warn `#F59E0B` already sit at 4.8:1/7.5:1 and stay at mock values (recorded in comments). `--dshm-on-soft` takes `#1d5fd6` on light (brand on soft measures 3.5:1 — not enough for text). The 14 module.css files follow through their var references untouched; the `--adm-*` var-mapping block stays as-is.

**The 430px phone shell lives in tokens.css, covering the login gate and the shell.** The plan offered App.tsx or shell.module.css, but each covers only one side of the login gate; tokens.css already owns the `.dshm-root` base properties and is the single point covering both. The root gains `max-width:430px; margin:0 auto; height:100%` (App.tsx's inline height retires), `@media ≥720px` adds `margin:14px auto; height:calc(100% - 28px); border-radius:24px; overflow:hidden`; the body desk is `#E9EDF4` light / `#0A0E15` dark, mirrored by an App.tsx effect onto `document.body.dataset.theme` (the mobile document is standalone — the PC page never shares this body). Narrow viewports (the e2e's 390×844) never engage max-width, so the fluid full-width form holds.

**Transitions align to pageIn.** [transitions.css](../../../../packages/client/ui-mobile/src/client/shell/transitions.css) collapses fade (between tabs, opacity only) and slide (the layer push, `translateX(24px)`→`14px`) onto the mock's pageIn `.22s ease`; `--dshm-motion-fast`/`--dshm-motion-page` both read 220ms, `prefers-reduced-motion` keeps its collapse. `--dshm-ease-slide`/`--dshm-ease-stamp` stay as the motion vocabulary per the plan (B3's progress bar uses the mock's own cubic-bezier(.22,.9,.35,1)).

**Tab reorder and the chats demotion.** [MobileShell.tsx](../../../../packages/client/ui-mobile/src/client/shell/MobileShell.tsx) switches `TAB_ROUTES` to `['home','agents','work','me']` with 消息(MessageSquare)/同事(Users)/工作台(LayoutGrid)/我的(User), lucide `size={20} strokeWidth={1.8}` (icons ride the 22px CSS visual grade per the plan: `.adm-tab-bar-item-icon svg { width/height:22px }`); labels 10.5px/600, active via `--adm-color-primary`. Leaving the whitelist turns `chats` into a full-screen layer: [MessagesView.tsx](../../../../packages/client/ui-mobile/src/client/messages/MessagesView.tsx) swaps its hand-drawn header for PageNav (an h1 title node keeps the heading semantics, the plus button moves to the right slot) with `goBackOr('#/')`; `LEGACY_HEADS` (messages→chats) and the `#/chats` deep link still land on a live page.

**antd-mobile's real TabBar class is `.adm-tab-bar-wrap`.** The v5-era `.tabbar :global(.adm-tab-bar) { --height: ... }` never matched anything — 5.43 renders `.adm-tab-bar-wrap` (`min-height:48px`); no `.adm-tab-bar` class or `--height` variable exists, so the bar silently ran at 48px. B1 corrects the wrap's `min-height: var(--dshm-tabbar-height)` (58px, verified by the CDP probe on both tracks) and deletes the dead variable block. Colors already ride the container-level `--adm-*` mapping and are unaffected.

**The preview bezel follows at 430.** [MobilePreviewView.tsx](../../../../packages/client/ui-mobile-preview/src/client/MobilePreviewView.tsx) moves `DEVICE_WIDTH` 390→430 (height stays 844, the ResizeObserver fit is unchanged) and the bezel radius 36→24 to echo the mock's desktop form; the iframe's `/mobile` gains the 430 shell automatically with zero logic changes.

## Alternatives considered

- **Shell in App.tsx or shell.module.css (the plan's either/or) vs tokens.css**: each misses one side of the login gate; the `.dshm-root` base in tokens.css is the only single point, and reverting one file rolls the whole form back.
- **No theme mirror on body vs mirror**: without it the dark desktop shell sits on a white desk; the mock defines both desk colors (#E9EDF4/#0A0E15), and the mirror costs one App.tsx effect plus two tokens.css rules.
- **Lifting every dark semantic color vs measuring**: the plan allows "moderate lifts"; success and warn already pass 4.5:1, so lifting them would drift from the mock for nothing — only danger lifts.
- **Keeping the chats header vs PageNav**: the plan's route notes name PageNav for reuse; the h1 title node preserves the e2e heading assertion and the plus button loses nothing in the right slot.
- **Re-recording the e2e goldens vs leaving them**: all three mobile goldens are aria snapshots blind to style and size; they stayed green, so the "affected set" for refresh turned out empty.

## Consequences

- `pnpm vitest run packages/client/ui-mobile` 568/568 green; typecheck/oxlint/build green; mobile-shell/mobile-assistant/mobile-preview-iframe e2e 6+5+2 green with zero golden refreshes.
- Screenshot and probe evidence in research/2026-09-23-mobile-v6-uidesign/: b1-01..08 (four tabs, both tracks), b1-09 (the chats layer: back header present, tab bar absent), b1-10 (the desktop shell); the CDP computed-style probe records labels/58px/active `rgb(46,124,246)`/10.5px w600/22px stroke1.8/navBg `#fff`|`#131924` on both tracks, and the desktop shell at 430px/24px radius/centered.
- `grep -rn "0b5d56\|e3eeec" packages/client/ui-mobile/{src,lib}` returns zero hits (two old teal values in the colleagues visual table re-hued — the form assistant to brand blue, the advisor to blue-slate #4f6076 — with three test literals following).
- Known intermediate state: agents as a tab still carries its PageNav back header, and every view keeps the v5 layout (B2/B3); MessagesView's row visuals (unread dots, time edges) wait for B2 the same way.
- The dev server (`dsh web`) serves `dist/` statically: a CSS module edit needs `pnpm run build` before it shows on :3080 — the probe once read the stale 48px because of exactly this.
- v5 leftovers fixed in passing: the dead `.adm-tab-bar` selector is gone, and the tab bar background moved from `--dshm-background` to the dedicated `--dshm-tabbar-bg` (the mock's tabbar and page background were never the same value).
