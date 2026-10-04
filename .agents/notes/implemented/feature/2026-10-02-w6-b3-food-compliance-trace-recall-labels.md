# Agent Note: W6-B3: the food-compliance core (expiry board + trace DAG + recall + label printing)

Status: implemented

English | [中文](2026-10-02-w6-b3-food-compliance-trace-recall-labels.zh.md)

The W6 plan (plans/plan-w6.zh.md §B3) turns the food-industry research (research/2026-10-01-w6-research/pt2-food-industry.md) into four deliverables. Before this batch the traceability chain existed only as a CLI assertion (kpi-run --trace); every delivery surface was missing: no batch genealogy view, no recall workflow, no barcode label. This batch ships the four-piece set on top of the B2 rule engine and the existing eight-domain data base — nothing parallel was built.

## Problem

The food-compliance delivery set did not exist: no expiry board, no batch traceability view, no recall workflow, no barcode printing.

## Decision

- **Expiry board** (NocoBase v2 page 效期看板, group 食品合规) — a JSBlock: KPI band (near+expired / expired / ≤7d / ≤30d / open B2 expiry alerts) + a category × days-left five-bucket heat matrix (expired / regulatory line / 30-90 / >90 / no dates) + click-through lot detail (lot / product / dates / on-hand = Σwms_movements / alert state). The red band shares the B2 scanner's CASE verbatim (LEAST(30, regulatory 45/20/15/10/3)); B2's wfl_alerts expiry rows are a first-class input (inline 🔴 open / 🟠 acknowledged).
- **Batch trace DAG** (v2 page 批次追溯) — layered swimlanes, never a tree (the research verdict: blends and splits make a tree duplicate nodes; the DAG is the accurate model). Lanes = supplier / receipt / raw+stock lot / MO / FG lot / SO / shipment / customer; pick an anchor lot and a direction (both / forward / backward); the recall-scope switch highlights the forward closure, dims the rest, and lists the affected triples (FG lots / SOs / customers) in the side panel; broken chains surface an explicit notice («链路不完整：缺 XX 环节» — a data-quality signal). The substrate: two PG views `v_trace_nodes` / `v_trace_edges` (append-only — views never write); closures are recursive CTEs shared verbatim by the CLI assertions and the recall scoping; the JSBlock rebuilds the same graph client-side (same wiring columns; --assert proves the counts agree).
- **Trace-base completion** (w6b3-trace --migrate): wms_receipts gains a backfilled `lot_id` FK (orphan receipts mint their lot first — four dates from shelf_life_days, status quarantined; any leftover orphan fails loud); lot-less completions inherit a fresh lot (four-date expiry inheritance; a NULL completed_at falls back to the MO's released_at).
- **Recall management** (recall_orders collection + v2 page 召回管理) — the Food-Safety-Law article-63 four-action state machine: initiated (stop-sale) → notify → notified → execute → executing → close (record note mandatory) → closed. The scope is the forward recursive closure frozen into a snapshot at creation (affected FG lots / SOs / customers — later wiring edits never rewrite a live recall); the RC-YYYYMMDD-NNN number is minted server-side in one atomic INSERT..SELECT max (the B1 server-numbering stance); the owner is notified through the B2 alert-center in-app channel; initiation is whitelisted to admin/quality_lead/qc_inspector server-side (outsiders fail loud). The transition table is the explicit (action, from_state) pairs — the actOnAlert pattern; owner/admin only; skips, outsiders, and a missing record note all move zero rows.
- **Label printing** (`examples/kb-agent/labels/` light SPA + engine routes) — a **zero-dependency hand-written Code128/GS1-128 encoder-decoder** (labels/src/code128.ts: the 107-pattern table taken from JsBarcode's authoritative table [MIT], B/C code-set adaptive switching; the decoder reads bar widths → 11-module patterns → code-set state machine, so generate-then-decode is the scanner's view). GS1-128 carries the legal minimum four AIs (01 GTIN-14 + 10 batch + 11 production + 17 expiry; fixed-length AIs need no GS separator); the label text lines = batch / product / production-expiry / supplier (Food-Safety-Law articles 50/51 record elements); the GTIN is product-level: a digits-only sku serves verbatim, else prefix 9 + product id as a deterministic internal GTIN-14. Three engine routes: GET /labels (the SPA, the designer committed-bundle posture), GET /label/lots.json (the picker data), GET /label/lot.svg (server-side SVG shared by mobile and the print page); POST /recall/create and /recall/act ride the engine (the CLI is the same functions' third entry). Printing is browser window.print + @media print; PDFs come from CDP page.pdf for evidence.
- **Mobile batch barcode**: the batch archive (wms_lots) joins the keeper/qc_inspector document catalog and the gateway scope table; any detail row carrying lot_no renders the barcode card (an engine-SVG img another device can scan; engine-offline degrades to a notice).

## Key trade-offs

- **A hand-written barcode core instead of bwip-js**: the dependency tree has no bwip-js and the plan allows the SVG route. The encoder is ~230 lines, zero dependencies, shared by the SPA, the engine, and the assertions (one file, examples/labels/src/code128.ts); the decoder doubles as the acceptance assertion (SVG bars → decode → four AIs reconciled against the DB) — more verifiable than a runtime dependency.
- **NocoBase collections cannot ride a raw SQL view** (no view-collection precedent): the DAG page reads the ten source collections and builds the graph client-side; the views serve the CLI reconciliation and the recall scoping. The two graph builds share wiring columns; --assert proves them equal.
- **The recall scope is frozen, not live**: a recall order is compliance evidence — the blast radius at creation is immutable; live tracing stays on the DAG page.
- **Menu visible to all, initiation gated server-side**: roles only come in admin/member granularity, so menu binding cannot express the quality restriction; the recall initiation refusal is asserted explicitly at the engine layer.

## Lessons

- The PG regex double-escape trap: `\\d` in a ts template string reaches PG (standard_conforming_strings=on) as a literal backslash-d, `regexp_match` misses, max() is NULL, and the number mint falls back to 001 — colliding with the unique index. Digit regexes use the `[0-9]` class.
- Inside an embedded JSBlock the browser-dispatched checkbox change never reaches the listener (a select's manual Event('change') does) — the recall switch rides a select; separately `dim(null)` threw null.key in recall mode and aborted the render (the select toggles kept working, masking it) — exercise every branch of embedded JS before shipping.
- apps/web is its own vite package: after a packages/client/ui-mobile change, build:lib:client alone is not enough — `pnpm --filter @deepseek-ai/dsh-web-frontend build` plus a 3080 restart, else /mobile serves the stale bundle (the BUG-4 family).
- The headless CDP shot driver (demos/acceptance-w6/w6-b3-shoot.mjs): screenshots land through the repo channel (the MCP tool is workspace-root-bound); the mobile login probe reads the `dsh-mobile-auth` localStorage key.

## Evidence

- demos/acceptance-w6/: w6-b3-01 (live triple), 02/02b (expiry board + drill), 03 (backward DAG), 04 (forward recall scope), 05/05b (blend both-ways + broken-chain notice), 06 (recall list), 07 (psql reconciliation), 08 (print SPA), 09a/09b (mobile batch barcode), 10 (combined assertions ALL PASS), gates-b3.log (typecheck / vitest 11 green / oxlint 0 errors).
- The reconciliation SQL is frozen at research/2026-10-01-w6-rework/b3/recon.sql.txt (same 口径 as w6-b3-10-assert.log).

## Alternatives considered

- **Graph database vs recursive CTE + PG views (C2 open question #6)** — the CTE won: enough at small-factory scale, append-only lineage edges preserved.
- **Server-side rendering service vs HTML templates + CDP PDF (ADR #5)** — CDP won: no new always-on service.

## Consequences

Cost: the CTE view scales linearly with lineage size. Bought: forward/backward trace with recall frozen snapshots and a barcode round-trip assertion chain.
