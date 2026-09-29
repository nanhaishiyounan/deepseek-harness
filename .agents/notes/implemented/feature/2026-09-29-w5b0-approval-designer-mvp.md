# Agent Note: W5-B0 approval-flow visual designer MVP — @xyflow/react canvas + graph json editing state

Status: implemented

English | [中文](2026-09-29-w5b0-approval-designer-mvp.zh.md)

- Date: 2026-09-29
- Status: implemented
- Scope: `examples/kb-agent/designer/` (new SPA), `examples/kb-agent/scripts/approval-engine.mts` (designer surface), `examples/kb-agent/scripts/nocobase-w3-approval-visual.mts` (config-center embed), `examples/kb-agent/scripts/nocobase-f3-hub-v2.mts` (BP-20)

## Problem

The approval-flow config center configured approver maps and extras as hand-written JSON in textareas, and the W3-B4 SVG state map is read-only. The selection research (research/2026-09-29-approval-flow-visual-designer-selection.md) recommends a drag-and-drop canvas. Separately, verify's full chain has been short-circuited since W4-R3 by nocobase-f3-hub-v2.mts:461 failing on the W4 end-state (BP-20).

## Decision

**@xyflow/react 12 as an independent SPA whose only persistence is `wfl_flow_configs.graph` (JSON) + `graph_version`; the engine is untouched in this batch.** graph is the editing truth; states/transitions stay the runtime truth the engine reads. Publish-time compilation/derivation and its fail-loud gates are B1.

- The SPA lives in `examples/kb-agent/designer/` (React18 + antd5 + @xyflow/react 12, esbuild single bundle committed under `dist/` — a fresh checkout serves `/designer` without a build step). It is NOT part of the pnpm workspace (the workspace globs stop at `examples/package.json`), so the platform/nocobase yarn1 subtree and the repo build are untouched (`git status platform/` stays clean).
- Five node kinds ship (start/approval/cc/condition/end; parallel/handler are B2). The property panel is a pure antd5 form — assignee type radio + member/role/department multi-select (options from `GET /designer/meta`), multi-person mode radio (sequential/countersign/or), empty-policy radio, and condition rows as field/operator/value triplets. The designer's DOM contains no textarea; the config center's legacy textarea editing channel stays live until B1's publish chain retires it.
- approval-engine `--serve` owns the surface: `GET /designer` + `/designer/designer.js|css` (whitelisted statics from `../designer/dist/`), `GET /designer/meta` (flow configs + users/roles/departments option lists), `GET /flow-graph?doc_type=` and `POST /flow-graph` (structural validation + graph_version increment + config_note audit line). Token auth rides the W3_TERMINAL_TOKEN regime; `W5_DESIGNER_ENABLED=false` removes the routes.
- `wfl_flow_configs` gains `graph` (json interface) + `graph_version` (integer) idempotently at serve start (`ensureGraphColumns` via `/api/fields:create`); old rows keep graph NULL and the engine never reads these columns.
- The config-center page mounts the designer through a platform **IframeBlockModel** (`flowSurfaces:addBlock` type iframe, mode url, W3_TERMINAL_BASE-resolvable) — the w3b6 terminal-page precedent.

## Pitfalls (now encoded)

- **The runjs JSBlock channel strips `<iframe>` tags** from `ctx.render` HTML — the designer embed must ride IframeBlockModel; a JSBlock embed renders only the surrounding div.
- **`/designer` serves HTML without a trailing slash, so relative `./designer.js` in index.html resolves against `/`** and 404s with an empty #root. The bundle assets use absolute `/designer/...` paths.
- **Route order in the serve dispatcher**: `/designer/meta` must match before the `/designer/` static prefix branch swallows it as a file name.
- **BP-20 root cause**: W4-B5 renamed 供应商→维保服务商 (spec title now carries the new name; `legacyTitles` still resolves the v1/rollback era) and W4-B4 retired 工作台+采购供应商 (rows absent ⇒ skip, not throw; still fail-loud for anything else). A hub-modules replay recreating v1 rows legitimately upgrades them again — the w4-heal-b4 verdict re-converges the end-state.

## Consequences

`--selftest` and `--check-consistency` stay green (the engine's reads are unchanged); `setup-nocobase.mts verify` runs the full chain end-to-end for the first time since W4-R3 (f3 no longer short-circuits). Evidence: `examples/kb-agent/demos/acceptance-w5/b0-01..08` (empty canvas, drag-in, property form, real CDP-dragged edges, save toast, reload restore, condition rows, config-center iframe) plus psql round-trip (pur_requests v1 / pur_rfqs v2, nodes/edges counts re-readable through `CAST(graph AS jsonb)`).

## R0 erratum and repair (same day, 16-dimension verify FAIL 79/100)

Errata (truth-debt): the column is `json`, not JSONB — titles and serve-side comments corrected (the note's psql `CAST(graph AS jsonb)` is a real cast of the json column, not a type claim). "No textarea reaches the DOM" overstated replacement — the config-center textarea channel remains the live editing path until B1. No reference to a `.w5-b0-env-cleanup.mts` file exists in the notes (grep 0 hits; nothing to retract — serve reads the static files from disk per request, no cleanup mechanism involved).

Repairs shipped: designer/src adopted into the repo oxlint gate with zero baseline errors (109→26 total, the 26 being the pre-existing tool-nocobase baseline); the drop handler passes raw `clientX/clientY` to `screenToFlowPosition` (xyflow 12 already subtracts the pane bounds — the double subtraction had persisted negative coordinates into PG, now cleaned in place and gated on both sides: the SPA clamps negatives at save, the server rejects them); supervisorChain gained a single-select over `/designer/meta` roles and formField an AutoComplete over the new `meta.formFields` vocabulary (merged editable field names per doc-type collection, system columns excluded — free input stays allowed), with `validateFlowGraph` now also rejecting approval nodes whose assignees are empty or contain empty strings; every designer fetch injects `x-terminal-token` through `src/lib/auth.ts` (W3 bootstrap: URL ?token= → localStorage `w3-terminal-token`, stylesheet link rewritten too — designer/README.md documents the three channels); `POST /flow-graph` requires `base_version` and returns 409 on a stale base (one of two concurrent saves loses loudly; the save button carries an in-flight lock so a double-click sends one request); dirty doc-type switches confirm with three ways out (discard / save-then-switch / cancel); persisted graphs whose node kinds or payloads fail the structural check render as gray degraded cards (plus an app-level ErrorBoundary) instead of a white screen; node titles are capped at 64 chars and angle brackets rejected on both the input and the server.

R0 pitfall beyond the fix list: the strict-档 guard also covers `designer.js` itself, and a plain `<script src>` cannot bootstrap its own token — `dist/index.html` gained the W3-shaped inline loader that remembers the URL token and injects the bundle `src` with `?token=` (the W3 terminal pages inline all their JS, so this hole is designer-specific). Evidence: `examples/kb-agent/demos/acceptance-w5/r0-01..09` — drop-point/node-position parity at 0px (was −221/−49 pre-fix), supervisorChain role options, formField AutoComplete vocabulary, angle-bracket title rejection toast, save success v6, concurrent-save 409 loser toast, the three-way switch modal, the shape-illegal node's degraded card, and the strict-档 page fully loading through the URL token.

## R1 repair (same day, 16-dimension verify FAIL 70/100)

R0's optimistic lock was a read-compare-write: two same-instant POSTs both passed the version check and both answered 200, one side's write and audit line silently lost (live curl concurrency proof). R1 lands POST /flow-graph as a real atomic compare-and-swap: one psql UPDATE (w4-heal-b4's psqlRunner pattern over platform/nocobase/.env) — `WHERE id AND doc_type AND graph_version = base_version`, zero rows moved answers 409 — with structured serve logs on the success (v→v+1), conflict (both versions), and unexpected-failure (stack) paths.

The first R1 cut rode NocoBase's REST `:update?filter=` and the evidence run caught it double-writing: repository.update is a find→update-by-pk pair (packages/core/database/src/repository.ts update()), so two same-instant conditional updates can both find the base version and both answer 200 (evidence run 3: A=200 B=200, stored graph = later writer) — timing luck made runs 1–2 pass. The REST filter is not a CAS primitive; only a single SQL UPDATE is (the PG row lock serializes the racers and re-evaluates the WHERE for the second). Rows predating the graph column carry graph_version NULL (never equal to any baseline — both racers 409 against a fresh row); serve start backfills 0 once through the same psql channel (the transition tables are untouched).

Evidence run: `examples/kb-agent/scripts/w5r1-concurrent-cas.mts` (repeatable) fires two POSTs through Promise.all on one base_version and asserts one 200 + one 409, the stored graph carrying only the winner's timestamped title marker, graph_version = base+1, and the config_note audit diff exactly +1 — seven runs: 2 PASS on the REST cut (timing luck), 1 FAIL that exposed the find→update race, then 5 consecutive PASS after the psql CAS; screenshots under `demos/acceptance-w5/r1-*`.

The R0 verification debt cleared alongside: designer/README.md became an English/Chinese pair (README.zh.md + recorded sidecar — the pairing gate was failing on it and on this note's post-R0 append); `querySelectorAll<HTMLLinkElement>` fixes the 4×TS2339 in src/lib/auth.ts and package.json gains a `typecheck` script (tsc --noEmit, now 0 errors); /designer/meta resolves `{{t("...")}}` template titles through `resolveI18nTitle` so role dropdowns show Admin/Member/Root instead of raw templates (0 `{{t(` hits in the response; empty-title department rows drop out); node titles trim on both sides (SPA onChange writes the trimmed value back, `titleFault` rejects whitespace-only, the server 400s `data.title` that is blank after trimming and stores every title trimmed — full-width space/tab mix proven 400 live); non-finite coordinates (Infinity/NaN) join the negative-coordinate rejection (1e999 proven 400 live); loadFlow/switch aborts the in-flight save (AbortController + silent AbortError) and a save response returning after the canvas moved on never writes state back (docTypeRef mirror — B's version state can no longer be polluted by A's late save); the selector now syncs `?doc_type=` back to the URL; readBody's size-cap error and the 401 body carry Chinese/token guidance text.

## Alternatives considered

- NocoBase plugin-workflow canvas / commercial approval plugin — rejected: tree-shaped non-free canvas, countersign-or-sign locked behind closed-source Professional+ plugins, and a second engine beside wfl (selection report §3.2).
- LogicFlow / AntV X6 / bpmn.js — rejected in the selection matrix (intermittent maintenance / 22-month release gap / watermark + BPMN XML mismatch with the wfl row model).
- Persisting the canvas through a NocoBase page block instead of the engine's HTTP surface — rejected: the config center's runjs allowlist has no fetch; the iframe keeps page authoring static while the engine owns graph read/write.
