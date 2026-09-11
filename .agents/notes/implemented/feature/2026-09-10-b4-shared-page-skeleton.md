# Agent Note: B4 shared page skeleton — six-tab visual consolidation over the ui-primitives atoms

Status: implemented

English | [中文](2026-09-10-b4-shared-page-skeleton.zh.md)

> Batch B4 of [plans/acceptance-fixes-2026-09-10/04-pages-visual.md](../../../../plans/acceptance-fixes-2026-09-10/04-pages-visual.md). The design skills the plan mandates (high-end-visual-design, redesign-existing-projects, ui-ux-pro-max) were loaded before work and drove the audit below.

## Problem

The six view tabs each carried a private copy of the page skeleton (`hero/heroTitle/heroTagline`, `errorStrip`/`failure`, `emptyState/emptyTitle/emptyHint`, `*Skeleton`) and the copies had drifted: hero titles used `--dsw-font-xl-24` in market/workbench but `--dsw-font-l-20` in kg/business; the error strip used `label-primary` text in four domains but a separate `failure` recipe (error-secondary fill) in the kb workbench; empty states had three padding/alignment variants. Beyond the drift, the audit confirmed the generic-AI-look fingerprints the user rejected: empty states were two text lines in a dashed box with no icon or action slot, skeletons were single flat rectangles, every badge was a 999px pill, cards were uniform flat tiles with no hover elevation, and layout was one 860px column everywhere but kg's split. The plan's "tokens under-consumed" premise no longer held — B2/B3 had already tokenized the domain CSS.

## Decision

### Four shared atoms in ui-primitives, domains delete their copies

`PageHero` (eyebrow → `h2` title → tagline → tabular-nums meta row → trailing slot, owning the unified `--dsw-font-l-20` title scale), `EmptyState` (line icon in a business-tertiary squircle, title, hint, action slot), `ErrorStrip` (`role="alert"`, warning glyph, message, retry slot), and `PageSkeleton` (content-shape previews — list rows with a narrower first row, a card grid, one block — riding the ui-theme phase-opposed pulse/shimmer keyframes, `aria-hidden` with `aria-busy` kept on caller wrappers). All values are existing `--dsw-*` tokens in both theme segments; grep over the five domain modules now counts zero hero/errorStrip/emptyState/skeleton class definitions, down from four to six per domain.

### No new theme alias

The plan suggested `--dsw-alias-surface-raised`, but both candidate values duplicate `bg-layer-1/2` in both theme segments — the alias would grow the token list without a new semantic. Domains consume the existing elevated-surface tokens (`bg-layer-1/2` + `border-l1` + `--dsw-shadow-lv1-blur` hover lift) directly, which is the raised-surface look the design direction wanted.

### Per-tab polish rides the shared language

Market: featured rail and asset cards on raised surfaces with a hover lift, square-radius (5px) badges instead of pills, tinted active kind chip. Connectors: provider rows raised with hover, the connect wizard on the accent-tinted frame. KG: details panel card, structured unbuilt/empty canvas states with a graph glyph. Business: entity cards in a multi-column grid, sticky table header on the layer-2 fill. KB workbench: hit cards raised, usage metrics separated by hairlines, iconified empty-documents state. `PageHero.eyebrow` reuses each domain's existing `view.*` locale key, so no new copy keys were added. The tab ring (ui-conversation assembly, ConversationSession rendering) stays untouched per the plan's boundary ruling.

### B3 leftover token fix

`hero.module.css` referenced undefined `--dsw-font-xxxs-12` (the scale has xxxs-11/xxs-12); corrected to `xxs-12`, after which the css-tokens gate passes.

## Alternatives considered

- **Extract only the CSS into a shared module instead of components** — rejected: the drift was in markup and type scale as much as CSS, and a CSS-only extract keeps six JSX copies free to diverge again; the atoms pin the DOM contract too.
- **A `tone` prop on EmptyState for per-domain tinting** — rejected: all six consumers wanted neutral guidance; the axis would be speculative until a consumer needs it.
- **Per-page rewrites (asymmetric grids, entry animations)** — deliberately out of scope for a data workbench: the skills' marketing-page moves (bento breaks, scroll reveals) fight dense enterprise data; the direction chose structural hierarchy and state quality instead.

## Consequences

- Domain CSS nets down (market −70, connectors −42, kg −27, business −40, workbench −45 lines) while the four atoms add ~120 focused lines in ui-primitives; the six tabs can no longer drift in hero/error/empty/loading presentation.
- `verify-client-domain-graph` stays green: sharing flows through ui-primitives only, no domain-to-domain import.
- Real-server evidence: `examples/kb-agent/demos/acceptance-b4/b4-capture.mjs` → 13 PNGs (six tabs × light/dark plus the ingest dialog), console and page errors empty, the dark pass flipped through the real settings appearance cube; the upload lane against the real composed server renders its done row (`done rows = 1`).
- Known pre-existing failure, not this batch: `kb-workbench.e2e.ts`'s three "uploads…" cases fail identically with this batch's frontend changes stashed and the web bundle rebuilt from source (3 failed / 11 skipped with and without B4), so the failure predates B4 in the working tree (B1–B3 or environment) and is left to the closeout batch.
- `docs/web-styling.md` gains the rule that view-tab pages compose these atoms instead of re-declaring per-domain skeleton classes.
