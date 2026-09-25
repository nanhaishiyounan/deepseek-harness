# Agent Note: Mobile v6 audit fix — portal token twin, button reset scope, shell-contained portals

Status: implemented

English | [中文](2026-09-24-mobile-v6-audit-portal-tokens.zh.md)

## Problem

The v6 exhaustive UI audit ([findings](../../../../research/2026-09-24-mobile-v6-audit/FINDINGS.md)) traced most visual defects to two systemic causes:

1. **antd-mobile portals escape the `.dshm-root` token scope.** Popup/Picker/DatePicker/Dialog/Modal/Toast render into `document.body`, outside `.dshm-root` where every `--dshm-*` and the `--adm-*` mapping lived. Body-level portals kept antd-mobile's `:root` defaults (`#1677ff` primary, white panels), so sheets rendered with invalid-var transparent backgrounds, dark-track portals stayed fully light, Picker/Dialog accents leaked antd blue, and on ≥720px desktop the fixed sheets spanned the whole 1280px viewport around the 430px phone shell.
2. **The `.dshm-root button` reset out-cascades every button class.** At (0,1,1) it beat every CSS-module and `.adm-button` class at (0,1,0), flattening the login CTA, home quick actions, work/report card actions, and sheet buttons to borderless transparent text.

The audit also recorded P2 polish: Toast skin divergence from the mock, picker panel radius (the mapped `--adm-border-radius-*` names do not exist in antd-mobile 5 — its dials are `--adm-radius-s/m/l`), mask opacity 0.55 vs the design's 0.5, the work tab opening on an empty 待处理 tab below the fold of an 8-card tool grid, and the quick panel covering the last chat line.

## Decision

**Tokens are declared on two mount points: `.dshm-root` and an `html[data-theme]` twin** ([tokens.css](../../../../packages/client/ui-mobile/src/client/tokens.css)). `App` mirrors the theme onto `document.documentElement` beside the existing body mirror. The twin selector `html[data-theme='light'|'dark']` carries specificity (0,1,1), so it beats antd-mobile's `:root` defaults (0,1,0) regardless of stylesheet order, and any portal — mounted at body or inside the shell — inherits the same track. One declaration block serves both selectors, so the token list stays single-sourced.

**Portals mount inside the shell through a portal host** ([portal.ts](../../../../packages/client/ui-mobile/src/client/portal.ts)). `MobileShell` renders one `display: contents` div inside `.dshm-root`; every antd-mobile layer call site (TaskFormModal Popup/Picker/DatePicker, NewChatSheet, KgEvidence, work-detail Modal, task-cards Dialog, Profile's static Dialog.confirm/alert, FieldWidget, RelationSelect) passes `portalContainer` as `getContainer`, falling back to `document.body` before the shell mounts. On desktop the shell's ≥720px media query adds `transform: translateZ(0)`, making the root the containing block for the fixed layers, so sheets and masks stay within the 430px bezel; under 720px nothing changes (no transform, full-width shell). `display: contents` gives the host no box and no pointer events; it must not carry `aria-hidden` — that hid dialog buttons from the accessibility tree and broke `getByRole` queries.

**The button reset only matches class-less buttons** (`button:not([class])`). Every styled button — CSS module classes and antd's `.adm-button` — owns its background, padding, and border again. This is also the enabling half of the portal move: portal buttons now live inside `.dshm-root`, where the old (0,1,1) reset would have flattened them.

**P2 polish landed with the same sweep:** the `--adm-*` mapping now uses the real `--adm-radius-s/m/l` dials plus `--adm-center-popup-border-radius` (16px panels), Toast takes the mock's capsule skin (bottom:110px, 999px radius, `rgba(24,32,47,.92)` with the dark-track porcelain inversion; the inline `top` from antd's position prop is overridden with `!important`), the mask background is forced to `rgba(0,0,0,0.5)` (antd's 0.55 rides an inline `background`, while its fade animates a separate inline `opacity` — overriding only the color keeps the animation), the work tab's ledger (status tabs + list) moved above the tool grid with the page scrolling as a whole (the home tab's existing pattern), and the chat flow gains 216px bottom padding while the quick panel is open.

Toast keeps its default body mount: with tokens on the html twin it reads correct colors, its capsule skin is CSS-global, and at 20+ call sites the per-call `getContainer` churn buys no visible gain (the centered capsule already sits inside the centered desktop shell).

## Consequences

Every antd-mobile layer call site now carries `getContainer={portalContainer}` — a new portal component added later without it falls back to `document.body`, which the html token twin still themes (colors and radii) but desktop containment no longer covers; the shell's portal host is the one mount point to wire. The html element now carries `data-theme` beside the body mirror, so host-document styling that keyed on `body[data-theme]` alone keeps working while portal theming keys on the html twin. CSS-module buttons render their own faces everywhere; only genuinely class-less `<button>` elements get the native reset, so a future unstyled button must either take a class or restate its own background/padding.

## Alternatives considered

**Pure CSS desktop containment (constrain body-level `.adm-popup`/`.adm-mask` with `left/right/margin/max-width`).** Rejected: antd's bottom sheets are `left:0; width:100%` fixed layers animated with `transform: translateY(100%)` — centering needs either a transform (fights the entrance animation) or over-constrained left/right tricks that collapse for `inset:0` masks. The host approach contains every layer class, present and future, with no geometry overrides.

**Moving the whole token block to `:root` only.** Rejected: same specificity as antd-mobile's defaults, so the winner would depend on bundle CSS order — a fragile invariant. The `html[data-theme]` twin wins on specificity alone.

**Keeping the reset and raising every module button's specificity.** Rejected: N-file whack-a-mole that the next button reintroduces; `:not([class])` states the real contract (native reset only for unstyled buttons) in one place.

**Defaulting the work tab to a non-empty status.** Rejected: it encodes demo-data assumptions into state; reordering keeps 待处理 semantics and makes every status list reachable on the first screen.

## Evidence

Re-shot against the live server (PID 51859, `dsh web` @ :3080): `research/2026-09-24-mobile-v6-audit/fix-*.png` — TaskForm/Picker/DatePicker/Dialog/Toast/NewChat in both tracks, desktop shell containment, login CTA solid, report/work action split. CDP re-measures: sheet backgrounds `#ffffff`/`#1a212d`, 16px sheet radius, button solid fills, zero `#1677ff` in portal computed styles.

## R2 follow-up (same day): per-class button faces, picker radius, askChip picked form, image-viewer portal

The A2 acceptance re-run (FAIL 79) traced one regression and one miss to the class-scoped reset: styled module buttons that never declared their own `color`/`background` fell back to the UA faces (black text, `rgb(239,239,239)` fill). The class-less reset stays; the module faces were completed instead — every button class now states its face (about twenty declarations across the eleven module stylesheets: session/roster/ledger/tool/workspace cards, work card heads, recent and task rows, section and retry links, back hit, + entry, qp tools, sheet close, picker rows, copy button, ask cards/chips, agents roster, files rows, new-chat rows, derived rows). The askChip face takes `--dshm-on-soft` (brand on the dark card track reads 4.1:1; the ghost-button precedent in v3.module.css) and its picked form rides the design's chip:active material — brand-soft fill under the solid brand rim, hint kept on-soft — as a chip-scale shade change, while the picked askCard keeps the ink face.

The Picker/DatePicker panel corners get an explicit same-specificity override in tokens.css (antd-mobile hard-codes 8px on `.adm-picker-popup .adm-popup-body`; no `--adm-*` dial reaches it), measured 16px on both tracks. `ImageViewer.Multi` mounts through `getContainer={portalContainer}` — the viewer props natively carry `getContainer`, so no fallback scheme was needed; its mount contract is asserted in `tests/rich-content.client.spec.tsx` (the demo replay data carries no markdown images, so the desktop geometry stand-in is the same portal host's TaskForm containment, mask ⊆ 430px shell). Evidence: `research/2026-09-24-mobile-v6-audit/r2-*.png` + `.r2-*.json` — zero UA-black/UA-gray computed faces across classed buttons on both tracks, zero `#1677ff`, TaskForm/Toast/sheet radii re-checked on the same PID 51859 server.
