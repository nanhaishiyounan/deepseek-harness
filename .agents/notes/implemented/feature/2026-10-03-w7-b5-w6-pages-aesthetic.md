# Agent Note: W7-B5 — the 21 W6 pages on the forge token system

Status: implemented

English | [中文](2026-10-03-w7-b5-w6-pages-aesthetic.zh.md)

User feedback: the W6-generated pages are ugly. The 2026-10-03 audit graded all 21 W6 pages A: the JSBlock surfaces ran a second visual system (antd-vintage purple #722ed1 / default blue #1677ff inline hexes, a fake-zero bar chart, a four-radius mix, a rainbow-bordered trace DAG, inverted alert colors), and the iframe pages carried their own palettes.

## Problem

The 21 W6-built pages inherited the v2 shell defects at their worst — dual palettes with the retired purple, fake zero bars, broken legends, rainbow DAG borders, and iframe shells the audit could not sign in to.

## Decision

Layer 3b/3c of plan-w7 (the design language lives in `research/2026-10-03-w7-rework/b0/design-language.md`; its tokens ship through the B0 globalStyle `--w7-*` set):

- JSBlock sources rewritten to token references. All inline hexes in `w6b9-blocks.mts` (cockpit / finance workbench / three-way match), `w6b7-blocks.mts` (bid matrix / PO swimlane), `w6b3-trace.mts` (expiry board / trace DAG), `w6b8-aps.mts` (bottleneck heat / what-if), `w6b8-eam.mts` (maintenance calendar), `w6b3-recall.mts`, and `w6b4-bomver.mts` now cite `var(--w7-*)` — verified reachable in the JSBlock render face by an inline-`var()` probe (the blocks are not shadow DOM, so `:root` tokens inherit). SVG presentation attributes cannot parse `var()`, so the DAG's fill/stroke moved into `style=` attributes.
- Fake-zero bars: the cockpit trend and both aging bucket rows render a 3px baseline dot for zero values instead of a 2% bar; positive bars clamp at a 4% minimum.
- Semantic inversions fixed per the STATUS_PALETTE mapping: dunning/quote/match status lamps went soft (fg + 8-10% bg pairs, no solid fills), 维保 KPI cards layer risk by Negative/Critical, the bid-matrix purple system (awarded banner, award modal, level badge) is primary now, `alert_rules.rule_type` enums map CCP 越限→red and 质量预警→orange, and EAM device/maintenance enums dropped purple/magenta.
- Radius system: card 8 / control 6 / badge 4 / tag 999 via tokens across all JSBlock pages (the touch-iframe pages keep their 8–14px touch radii).
- The trace DAG node borders use the same-hue blue ramp (chart-1..4 + primary + informational + neutral; anchor = primary 2.5px, recall highlight = negative); the arrow/edge colors follow border-strong/negative.
- The APS heat ramp composes `color-mix(in srgb, var(--w7-{positive,critical,negative}-fg) N%, transparent)` with a steeper overload curve (55% at 100% → 90% near 190%+), replacing the antd rgba literals.
- The maintenance calendar caps at 2 event chips per day with a `+N more` fold (state keyed by ISO date).
- iframe/engine-side pages embed a constant `--w7-*` table (documents there do not inherit NocoBase's globalStyle): `insp/index.html`, `crm/index.html` (both served straight from disk by the engine), the insp print server CSS, `labels/index.html`, and the dark touch-terminal palette (`terminal.css` `--primary/--ok/--bad/--warn` become same-hue bright variants of the W7 trio; cards.html rides them). The engine process must restart to pick up dynamic-imported server modules.

## Repairs that surfaced during replay

- `w6b3-recall` had no code-drift upgrade: its console block was attached once and kept, so source edits never reached the page. The ensure step destroys and re-weights nothing: it re-adds the block whole when the seated code differs from the export (the w6b3-trace posture; `flowModels:destroy` takes `filterByTk`).
- `w6b4-assert` broke on an operation-level exhaustion edge: the rehearsal MO's first open op sat at remaining=1 while the MO-level sum cleared 50, so `good = max(1, floor(1/3))` forced `qty_pending = -1` and the engine's three-number equation rejected the report. The deep-reset trigger now also fires when any open op has remaining < 3.
- `w6b6-crm --assert` needs the cleanup→seed→assert chain (a converted rehearsal quote refuses re-conversion by design); the partial unique index `ux_crm_quotes_converted` can be dropped by schema syncs and is re-created by `--seed`.
- Code-drift relays rotate page uids: 效期看板 → `w6b3v1vsyqj5u9a`, 批次追溯 → `w6b3tctwuy6wn0d`, 配方版本与变更 → `w6b4b2jezsof7xz` (the audit's inventory lists the old uids).

## Evidence

- `demos/acceptance-w7/w7-b5-01..26-*.png` — after shots of the 21 pages plus the two B5-touched mount pages (比价表 / 采购订单) and the three engine-side pages signed in (insp qc_inspector, crm sales_rep, cards shop_lead — clearing the 02-audit limitation).
- `demos/acceptance-w7/w7-b5-dom-probe.json/.log` — per-page probes, all green: banned inline hexes (#1677ff/#722ed1/#7C3AED/#ff4d4f/#faad14/#c41d7f/#13c2c2) at zero, no fake-zero bars with baseline dots present, DAG strokes inside the whitelist with the anchor at primary, APS cells on color-mix with no legacy rgba, soft antd tags at 999px on the table pages.
- `research/2026-10-03-w7-rework/b5/w7-b5-source-grep.log` — the source-level zeroing assertion across all w6b* sources and the iframe/SPA faces.
- `demos/acceptance-w7/w7-b5-gates.log` — the full W6 assert matrix re-run: w6b2 / w6b3-labels / w6b3-trace / w6b3-recall / w6b4 / w6b5 / w6b6 / w6b7 / w6b8 / w6b9 all PASS after the restyle (functional zero-regression). oxlint clean on the touched scripts.

## Known residue

- The dark touch-terminal palette uses undocumented bright variants (#5783BC/#6EB871/#C93A3A/#F09A4B) anchored to the W7 hues; if B6 wants them tokenized, add a dark-track `--w7-*` set to the terminal stylesheet.
- Engine-side SPA changes need the engine restarted to take effect for dynamic-imported modules (`insp/src/server.ts`); disk-served index.html files apply immediately.
- The 卡片流 terminal (cards.html) dark visual is the W2 posture and stays dark; only its four-state accents moved to W7 hues.

## Alternatives considered

Rewrite the eight JSBlock pages as v2-native blocks vs token-referencing `<style>` inside the page — the style block keeps W6's verified logic untouched and repaints through the shared tokens, which is what the B6 bin-map fix reused.

## Consequences

The token-referencing `<style>` template and the engine-side token twin became the pattern the B6 bin-map fix later reused.
