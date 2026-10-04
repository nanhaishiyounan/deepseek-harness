# Agent Note: W7-B0+M0「Forge」design-language base (PC theme row + globalStyle + mobile token dual track)

Status: implemented

English | [中文](2026-10-03-w7-b0-m0-forge-foundation.zh.md)

User feedback: "生成的页面难看！原来的也难看！mobile也难看！！" W7 re-skins the whole product; B0+M0 are the highest-leverage batch — one theme row and one token file restyle 114 PC page units and the mobile shell without touching page structure.

## Problem

All 242 routes rendered on the antd default blue `mfg-standard` baseline (zero brand language) and the mobile v6 audit logged ten defects — any page work needed one design language and both token foundations first.

## Decision

- **PC layer 1** (`examples/kb-agent/scripts/w7b0-theme.mts`, `--apply/--assert/--rollback` after the w5b6-theme pattern): new themeConfig row `w7-forge` (default) — Prussian blue `#1E4E8C` primary with hover/active steps, Fiori Morning Horizon semantic five states, warm-gray neutrals, `colorBgSider #16304F`, `colorBgLayout #F6F6F4`. `mfg-standard` is demoted to `default=false` but stays user-optional; built-ins untouched. Rollback snapshot: `research/2026-10-03-w7-rework/b0/w7-b0-theme-rollback.json`.
- **PC layer 2** (same row, `config.token.globalStyle`): the `--w7-*` token set (brand/semantic/neutral/chart ramp/geometry/elevation/type/motion — the anchor later JSBlock batches reference) plus whole-console component bases: table header 13/600 on `#FAFAF9`, zebra + hover tint, `tabular-nums`, pill tags with preset classes remapped to semantic soft pairs, card radius 8 + diffuse shadow, button press/focus ring, scrollbar.
- **User-theme pinning clear**: `systemSettings.themeId` beats the default row (InitializeTheme reads the user's setting first). `nocobase` and `qc_inspector` were pinned to themeId 3 (Compact) — the new default never reached them. Cleared via read-modify-write preserving all other keys; before-state in `w7-b0-user-themeid-rollback.json`.
- **Mobile M0** (`packages/client/ui-mobile/src/client/tokens.css` rewritten): same-source `#1E4E8C` brand (dark track `#2A5FA6`), brand2 switched to the same-hue ramp step `#3A69A4`, semantic five states aligned with PC (dark track desaturated lifts), three-tier elevation (canvas `#EAEBE8` / white card + diffuse shadow / raised shadow — measured 8.4% RGB step), five-step type ramp `--dshm-fs-*`, full `--adm-font-size-1..10` remap, radius ladder 8/12/16. TabBar label 10.5px → `var(--dshm-fs-xs)` (12px floor). 315 hard-coded font-size/radius values across 18 `*.module.css` files consolidated onto the tokens. Build chain rerun (`build:lib:client` + `build:web`) after each change set.

## Verification

- `w7b0-theme --assert` OK (uid/default/colorPrimary/globalStyle tokens, one default row, mfg-standard alive, 4 built-ins).
- PC DOM probe (5 representative pages): primary button `rgb(30,78,140)`, header weight 600, tag soft bg + `999px` pill, card radius 8 — all pass; JSBlock/v1 pages report `n/a` where the component is absent.
- Mobile DOM probe: Tab 12px/600, active tab `#1E4E8C`, elevation step 8.4%, statValue 24px, statLabel 12px, dark track repaint, 375×667 no horizontal overflow on all four tabs.
- `pnpm vitest run packages/client/ui-mobile`: 43 files / 668 tests pass. `tsc -b tsconfig.client.json` clean; targeted oxlint on the new script 0/0.
- Evidence: 114-page before baseline (`research/2026-10-03-w7-rework/b0/before/`, 111 flowPage + 3 v1), 19 after shots (`after/`), mobile 16-surface after (`../m0/after-mobile/`), side-by-side pairs `demos/acceptance-w7/w7-b0-01..11-*` and `w7-m0-01..08-*`.

## Pitfalls pinned

- **Default-row swap alone is not a whole-console reskin.** InitializeTheme (`plugin-theme-editor/src/client/components/InitializeTheme.tsx`) prefers `currentUser.systemSettings.themeId`; users who ever picked a theme keep it forever. Sweep `users:list` for `systemSettings.themeId` after any default switch.
- **globalStyle and seed tokens apply through independent paths.** With a pinned theme the page showed w7-forge's globalStyle overrides (card radius 8) while antd still rendered the pinned row's colors — a split-brain state that misleads visual checks.
- **The admin account was running Compact (themeId 3), not mfg-standard.** Both render antd blue `#1677FF`, so the W5 audit claim "running on mfg-standard" was unverifiable by color; treat same-color themes as indistinguishable in screenshots.
- The audit route flat list truncates uids to 10 chars; cross-check `api-desktopRoutes.json` (or the live API) for full uids. The page census covers flowPage only — v1 `page` routes need their own constants.
- Before-baseline purity protocol for pages missed pre-apply: `--rollback` → shoot → `--apply` → `--assert` (idempotent three-mode scripts make this safe).
- `#1677ff` residue after reskin: stylesheet-rule counts drop 13–15 → 9–12 but do not reach zero; sources are hard-coded values inside JSBlock pages (layer 3b, B5) and unrendered library rules. Assert on computed styles of visible faces, not on rule-text sweeps alone.
- Relative playwright imports in copied research scripts: audit-dir depth (`../../apps/...`) is one level short from `w7-rework/<batch>/` — use `../../../apps/...`.

## Alternatives considered

- **Update `mfg-standard` in place vs new `w7-forge` row** — the new row keeps the W5 row and its rollback face intact; the pinning clear (not the row choice) is what actually reaches pinned users.
- **Per-page CSS patches vs token base** — the plan's leverage argument holds: one row + one string restyled every probed face without touching 114 page schemas.

## Consequences

- Later batches read `--w7-*` (PC JSBlock/schema heal) and `--dshm-fs-*`/`--dshm-radius-*` (mobile M1/M2) instead of hard-coded values; the token files are the single color source for both ends.
- Mobile home still counts 21 brand-colored elements (8 quickChip primary buttons, double-counted button+span) — recorded as the M1 hero-de-blue baseline, not an M0 failure.
- Hero digits enlarged by the ramp consolidation (22→24px) and other 315 consolidated values need M1/M2 visual passes; vitest is style-blind here.
