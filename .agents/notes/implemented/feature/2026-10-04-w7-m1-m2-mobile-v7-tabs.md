# Agent Note: W7-M1+M2 — mobile v7 tab redesign and the unified empty/skeleton system

Status: implemented

English | [中文](2026-10-04-w7-m1-m2-mobile-v7-tabs.zh.md)

User feedback: mobile is ugly. The 2026-10-03 audit (04-mobile-aesthetic-findings) pinned the four tab surfaces on a blue monoculture (21 brand-color literal uses on home, every quick chip a primary-soft fill), a 2:1 number/label cliff, a candy-color avatar set with no palette logic, and the full-screen layers riding a one-line「会话加载中」over 750px of blank plus bare one-line gray empty states across todos/docs/tasks/files.

## Problem

The four Tab surfaces and nine full-screen layers still rode the v6 layout grammar — blue monochrome, twelve scattered font sizes, zero-elevation cards, bare empty/loading states — after the M0 token base landed.

## Decision

M1 — the four tab surfaces (`packages/client/ui-mobile/src/client/`):

- Home de-blue: the gradient hero retired for a white card whose one brand accent is the `heroDate` primary-soft capsule; the quick chips keep exactly one solid primary CTA (登记一条单据) with the other six on the neutral card face; both 查看全部 section links dropped to the muted tone; the today-ledger numbers moved to the 26px `--dshm-fs-num` KPI grade with the zero narrative (a zero renders muted, a live count keeps its `--dshm-work-*` hue). Home's brand-color literal count went 21 → 1 (`rg 'dshm-primary|dshm-user-grad|dshm-brand' home/`), under the ≤6 budget.
- The colleague avatar palette became four equidistant deep hues (blue 212° / teal 177° / green 122° / ochre 28°) at one shared lightness band anchored on the brand blue — replacing #2e7cf6/#4f6076/#3d5a80/#7a5c3e/#1c2b29 mix (`colleagues.ts`).
- Agents: the band titles carry the ink grade plus a trailing hairline rule, the skill pills went neutral, and each roster row ends in a status chip + disclosure chevron (the 60-80px dead right edge).
- Work: the empty-state CTA solidified (去找 AI 同事 was an outline button as the page's primary action), the CapsuleTabs active tab rides the primary-soft fill instead of the solid-vs-outline extreme, the tool-grid icon blocks went monochrome (the per-colleague candy blocks retired), and every work card carries a 3px status spine on `--dshm-work-*` (the STATUS_PALETTE mobile face).
- Me: the identity avatar is the flat primary (gradient retired), the quick-start capsules went neutral, and the monthly placeholder unified to「…」/「读取失败」/「N 条」.

M2 — the full-screen layers plus the one-time empty/skeleton components (`ui.tsx` + `ui.module.css`):

- `EmptyState`: icon tile (muted block + brand line glyph) + title + description + one solid CTA, with a `section` variant for in-card strips. Replaced nine ad-hoc empty faces: todos (CTA→docs), docs (CTA→agents), alerts, tasks (CTA→chats), work (CTA→agents), files ×3 sections, home recent, chats (dual copy: 还没有会话 vs 没有匹配的会话 by filter+keyword, the Fiori rule).
- Skeletons now mirror the real rows: `SkelRow` gained the trailing timestamp slot; `SkelCard` re-formed as the stamp-head card silhouette (todos/docs/alerts loading states); `SkelThread` renders the chat first-paint bubble blocks, retiring the「会话加载中…」single line over blank flow.
- chat geometry unified on one「新增」shape: the composer + entry and the header + are circles now, and the header + dropped the solid brand for the brand-soft face (the 44px solid dot jumped off the white header).
- Login inputs draw their own boundary: the muted fill against the white card (the v6 card-on-card fill was invisible).
- Alerts severity separation is material, not just hue: critical keeps the solid red seal, warning drops to the soft amber chip with the amber rim.
- M0 residue cleared: all 30 bare `999px` in module CSS now cite `--dshm-radius-pill` (the token was added with the radius ladder); every `var(--dshm-*, fallback)` dropped its radix-era fallback; the nine residual old-blue `rgba(46,124,246,…)` literals (chat send shadow, ask/starter rims, welcome/chip rims) moved onto new dual-track tokens `--dshm-primary-rim` and `--dshm-send-shadow`.

## Evidence

- `demos/acceptance-w7/w7-m1-01..05-*.png` — the four tabs after (375×667, qc_inspector real login) plus the home dark-track spot check; `w7-m2-06..16-*.png` — the eleven full-screen layer faces plus login and the chats dark shot.
- `demos/acceptance-w7/w7-m2-20..23-empty-*.png` — four unified-empty faces (chats filter miss via a no-match keyword, tasks, files, todos). `w7-m2-30..32-skel-*.png` — three loading faces captured under Playwright route-delay stubs (chats rows, chat thread bubbles, todos cards).
- The `.shoot-w7m.mjs` probe log (hard numbers, all green): Tab label 12px/600; heroCard white `rgb(255,255,255)` on the diffuse shadow; statValue 26px SF Mono/600; card radius 16px + the elevation shadow; card-vs-canvas RGB gap 21.3% (≥8% budget); `xOverflow: 0`; home DOM brand-instance count 12 (the rg literal count is 1 — see Residue).
- `pnpm vitest run ui-mobile` 668/668 after the swaps; `tsc --noEmit` clean; `build:lib:client` + `apps/web` vite build green with the 3080 server restarted (the module-graph freeze contract).

## Repairs that surfaced during replay

- Two lucide names do not exist in the vendored version (`FolderStar`, `ChatCircle`) and rendered as undefined element types — replaced with `Star` and `MessageCircle`; the check is `grep "declare const <Name>" node_modules/lucide-react/dist/lucide-react.d.ts`.
- The unread dot's first fix (a 2px card-colored border) is invisible on the white card; the landing fix is the double ring — 2px card rim + 3.5px destructive-10 halo.
- The chats empty copy needed the keyword arm too: filter=all with a no-match search showed「还没有会话」; the condition is now `filter === 'all' && keyword.trim() === ''`.

## Known residue

- The home DOM-level brand-instance count (12) exceeds the ≤6 budget at first read, but its decomposition is heroDate 1 + one doing-stat semantic number 1 + the register CTA 1 + three brand-blue colleague avatars (the palette anchor) + the active tab bar's four-element DOM expansion (one visual face); the rg literal count the plan's assertion names is 1. M3 may lift the doing stat to the foreground ink if the reviewer wants the DOM count under 6.
- Alert rows still carry no timestamp: `AlertRow` has no server time field, and the visual layer will not fabricate one (daysLeft carries the timeliness); adding `raised_at` to the wfl_alerts projection is a W8 candidate. Alert body value highlighting and same-CCP aggregation are likewise data-layer work, out of the M2 visual scope.
- The work-detail after shot fell on the empty tab (qc_inspector owns no work items); the detail face itself is covered by w6 gates and re-shoots in M3 with a work-owning account.
- The v6 welcome/ask ghost-chip faces (primary-rim on card) and the dark chats empty state were not re-shot this batch; M3's dark-track pass owns them.

## Alternatives considered

- Per-surface one-off CSS vs the token ramp — the ramp keeps every later surface on the same five grades, which is what let M3 add a tab-active token without touching module files.

## Consequences

- The five-grade ramp and the elevation/border token set are the base the M3 dark-track sweep asserted against; surfaces added later should read the ramp, not hard-code px.
