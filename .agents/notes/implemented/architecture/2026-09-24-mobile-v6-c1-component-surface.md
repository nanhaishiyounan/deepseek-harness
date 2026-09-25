# Agent Note: Mobile v6 C1 — the element-level component surface (antd-mobile upgrade)

Status: implemented

English | [中文](2026-09-24-mobile-v6-c1-component-surface.zh.md)

## Problem

User feedback on the v6 surface: 元素的样式有些还是原生的，为什么不使用组件库，样式很难看 — a large share of element-level controls were still CSS-Modules hand-drawings (buttons, chips, badges, dots, avatars, empty states, progress bars, inputs), so the app read as two different products: the antd-mobile faces (Switch/Picker/Dialog/CapsuleTabs/SearchBar/Toast) next to hand-rolled lookalikes. The v6 visual truth (index (5).html) stays the source for color/radius/spacing values; this batch changes the implementation vehicle to antd-mobile components reaching the same visuals through the `--adm-*` pipeline.

## Decision

**The dial convention.** antd-mobile components own their faces through CSS variables read at render time, and several (Tag, Badge) set those variables through *inline* styles — a class-level variable declaration loses to the component's own inline defaults, and Button's `fill=outline/none` color rules ride (0,3,0) specificity that plain module classes cannot beat. So the batch lands one convention: **color faces ride inline CSS-variable dials on the JSX (the component's own official NativeProps path — zero specificity fights, jsdom-stable), while sizing/typography (height, padding, font-size, weight, border-radius) ride `.xxx:global(.adm-button)`-style module classes.** Every replaced hand-drawn class was deleted with its custom background/text/press styles; the kept classes carry only layout sizing.

**Button family.** Report-card primary/secondary (solid vs. the brand-soft ghost via inline dials), the work card's 开始执行/打回/确认完成/查看进度/查看结果 (solid / outline with the hairline rim / none-fill brand word), home's quick chips and section links, TaskForm's cancel/submit (submit gains the component's loading face), NewChat roster chips, login's 获取 code arm, profile's shortcuts and logout, agents/work empty-state CTAs, work header entries, the composer's candidate chips, welcome starter chips, the code plate's copy entry, and the `来自对话` source badge — all antd-mobile `Button` (`color` × `fill` × `size` reaching the three states). The sheetCancel/actionSecondary/entryLink outline arms carry the hairline rim through an inline `--border-color` dial (antd's default outline rims with the text color, not the border token).

**Tags, badges, avatars.** The shared `Badge` atom (ui.tsx) now renders antd-mobile `Tag` with a tone→inline-dial face map; skill pills, presence chips, demo tags, the files type/origin badges, the action receipt capsule, and the NewChat form chips all ride `Tag` with token dials. Presence dots and the unread dot ride antd `Badge` with `content={Badge.dot}` wrapped around the stamp avatar, parked on its lower right through the `--top/--right` dials with the card rim. The stamp avatar itself stays a custom span: antd-mobile's Avatar is img-only (`src: string` is required) and the identity-stamp acronym block has no image source — the fallback the task brief itself allows.

**Empty/error/progress/skeleton/inputs.** Work/tasks empty states already rode ErrorBlock; their CTAs and the home retry links became none-fill Buttons. The work detail's done/total bar became antd `ProgressBar` (`--fill-color` dialing the user gradient). The shared `SkelRow`/`SkelCard` and home's roster skeletons became antd `Skeleton` blocks (animated; the reduced-motion override freezes the shimmer), retiring the global `dshm-skel-pulse` keyframe. TaskForm's title and the v3 draft's field inputs became antd `Input` (`clearable`, the onChange(val) signature, the boxed face on the wrapper class); agents' local search box became the antd `SearchBar` (the same dial set the chats layer rides).

**What stays custom, by classification.** Behavior rows/cards (session rows, roster rows, tool cards, stats cards, search entries, task rows, receipt rows — layout containers per the brief); `role="radio"` ask options (antd Button does not carry role/aria-checked through); glyph touch targets (X close, back, plus, send — the gradient send button is one of the four sanctioned gradient surfaces); and the ask option chips with two-line hints. Native `<input>`/`<textarea>` are now zero across the app; the remaining 33 `<button>` sites all fall into the classified keep-list.

## Alternatives considered

- Covering Tag/Badge colors with module-class variable declarations was tried and dropped: the components inline their defaults at render, so the class variables never win — hence the inline-dial convention.
- Fighting Button's (0,3,0) outline rules with stacked module selectors was rejected as load-order-fragile; the inline dial is the component's own supported path.
- antd-mobile `Avatar` for the colleague stamps was rejected on its API: `src` is a required string and the stamps are acronym blocks with a token background; fabricating image URLs to please the component would lie.

## Consequences

- Every interaction contract kept: disabled/loading gates, the double-click locks (startingRef guards), row anchoring, aria labels (through enclosing labels where the antd prop face does not carry aria-label), and the tests' role/text assertions — 613/613 ui-mobile tests green with three selector updates (the agents search placeholder, the v3 bare-input query, the e2e `getByLabel('数量')`), per-file coverage still 100%.
- The mobile golden trio (mobile-assistant/mobile-shell/mobile-preview-iframe) passes without re-recording: the aria snapshot is role/name-level, which the component swap preserves; the protocol-invisibility negative assertions stay green.
- CSS Modules shrank by every replaced hand-drawn rule (report/starter/chip/action/sheet/sourceBadge/skillPill/statusChip/demoTag/skel classes and the global keyframe); the `--adm-*`/`--dshm-*` twin tracks drive every new face, so light/dark, the 430px shell, and portal containment hold (verified across the 21 c1-* screenshots on both tracks).
