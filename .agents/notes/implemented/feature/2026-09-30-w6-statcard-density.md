# Agent Note: W6 stat-card density fix (131 cards 420px → 146px)

Status: implemented

English | [中文](2026-09-30-w6-statcard-density.zh.md)

User feedback: "the stat cards on the pages are all way too big". Live measurement confirmed: each card ~420px tall (44% of the first screen), ~70% of it empty space, and the table pushed entirely below the fold.

## Problem

The W4 stat-card wall (131 cards) shipped too sparse: one metric per screenful of padding, and the W4 verification round flagged the density as the top usability complaint.

## Root cause (three layers)

1. The chart renderer (`plugin-data-visualization` ECharts.tsx) pins the canvas to `height: 400` when the block carries no `heightMode`; adding the card header yields ~420px.
2. The top-level `decoratorProps.heightMode` on a `flowModels` row (the platform block-height mechanism) has no consumer in the frontend assembly layer — the runtime chain reads the formily `x-decorator-props`, and a `flowModels:save`-written decoratorProps never maps into it (psql, `flowSurfaces:get`, and `flowModels:findOne` all return the new value while the browser still renders 400px).
3. The platform frontend artifacts are a Sep-8 baseline (`dist` is git-ignored), so editing `src` alone does nothing; it takes `yarn build:client-v2` plus a dev-server restart (the server holds the chunk-hash manifest in memory and keeps serving old files after a rebuild unless restarted).

## Decision

- **Data-owned channel**: the ECharts option returned by `statCardRaw` now carries `containerStyle: { height: 112 }`; platform `Chart.tsx` gained a single pass-through line `style={option?.containerStyle}` (ECharts.tsx already spreads `...style` after the 400px default, so the custom height wins). Charts without the key are unaffected. The in-canvas layout was compacted to match (title 13→12 @ top 8, number 34→24 @ top 26, footnote 11→10 @ bottom 4).
- **`metricChart` factory** (`nocobase-flow-page-lib.mts`): new cards default to compact (`STATCARD_CHART_HEIGHT = 112`).
- **131 existing cards**: `w6-statcard-density.mts` (--dry-run/--run/--assert/--rollback) rewrites the raw option and injects containerStyle per marker-matched card, idempotent, with the rollback snapshot at `research/2026-09-29-w5-rework/w6-statcard-density-rollback.json`.
- **Artifact rebuild**: `yarn build:client-v2` plus a `yarn dev-server` restart.

## Verification

`demos/acceptance-w5/w6-shot.mjs` (headless CDP + admin sign-in) — all four assertions green: card heights 146×3, canvas `112px`, table top 684→396 (inside the first screen), visible data rows 3→10; screenshot `w6-01-bijia-dense.png` plus `w6-shot-meta.json` (AI visual check: three-line hierarchy intact, overview and detail share the screen). `w4-heal-b3 --assert` (94+37 card floors) unaffected; targeted oxlint 0 errors.

## Pitfalls pinned

- The effective chain for a platform frontend change: edit `src` → `yarn build:client-v2` → restart the dev-server. Skipping the restart leaves pages loading old-hash chunks — it mimics BUG-4 module-graph freezing but the root cause is the in-memory artifact manifest.
- Block `decoratorProps` (heightMode/height) is a dead channel for script writes: readable on all three data faces, never consumed by the frontend; block-owned sizing goes through the option `containerStyle`.
- Headless screenshots on a cold server need the `b8-walkthrough.mjs` signInAs retry loop — a single wait is not enough for the sign-in form to render.

## Alternatives considered

- **Full information-architecture redesign vs minimal density tightening** — the IA was already settled in W4; only the density was the complaint, so the tightening shipped.

## Consequences

Cost: a few card captions now wrap at the tighter width. Bought: one readable screen; every W6 batch's stat cards reuse the same density.
