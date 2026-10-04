# Agent Note: W6-R3: the food-compliance delivery-surface fixes (label SVG, escaping, identity, recall console, mobile notices)

Status: implemented

English | [中文](2026-10-02-w6-r3-food-compliance-delivery-fixes.zh.md)

The W6-B3 four-piece set passed its data foundation (trace CTE, recall state machine, server numbering, frozen scope — untouched this round) but failed the 16-dimension verification at 70/100 with one Critical and fifteen Important findings. This round fixes the delivery surfaces only; every fix carries its own negative assertion or browser-live proof.

## Problem

The B3 verification round flagged the compliance surfaces: barcodes drew blank, an XSS payload survived rendering, broken trace chains were invisible, and the recall console leaked identity errors.

## Decision

- **Barcode SVG draws** (lesson 19): the bar runs are real `<path d="…"/>` elements inside the `<g>` (a bare run-length string renders zero pixels in every consumer). The labels assertion grows a browser-render leg — a headless-Chrome CDP session loads the SVG and proves `querySelectorAll('path') > 0` plus non-zero `getBBox()` width (124 paths, 248px drawn) — and the round-trip leg re-reads the widths and decodes them back to the four AIs.
- **Real XML escaping** (lesson 20): the old `esc()` was an identity replace; both JSBlocks and `labelSvg()` now escape the five predefined entities, and `escapeXml` additionally strips XML-1.0-illegal control characters — the GS1 GS separator (U+001D) riding the human text made image-mode SVG decoding fail fatally while document mode tolerated it (the img-tag diagnosis: HTTP 200 + onError). Negative legs: a markup-carrying batch number comes back fully escaped in the label SVG and the expiry board with zero script nodes; a >20-char payload is refused fail-loud by the batch-length gate (the JSON error body is application/json, never markup).
- **No NaN swimlanes** (lesson 22a): the shipment lane's half-column 5.5 indexed `colCount[5.5]` (undefined → NaN y). Lane columns are plain integers now; the browser verdicts assert SVG-no-NaN and node-element == footer-count in both directions.
- **Credential-derived recall identity** (lesson 21): `/recall/create`, `/recall/act`, and the new `/recall/scope` resolve the actor from the request's platform session (Bearer → `/api/auth:check` → username, with a narrow transport retry for the post-schema-write socket-reset window). No credential is a 401; a body actor disagreeing with the session is a 403 (the forged qc_inspector probe); the self-reported admin default is gone. The whitelist gains the platform root's real username `nocobase` (its credential-derived actor), and actRecall's root bypass accepts the same pair. OPTIONS preflights answer 204 + CORS and error responses carry the CORS headers too — a cross-origin page must see the 401/403 fact, not a masked fetch failure.
- **due_date three-layer gate**: createRecall refuses a past deadline up front; the minting INSERT carries `WHERE dd IS NULL OR dd >= CURRENT_DATE` (a bypassing SQL write lands zero rows and fails loud); the CLI funnels through the same function. The negative leg (yesterday's date refused) is an assertion.
- **Supplier placeholder**: a lot without a supplier prints 「供应商未维护（法定四要素缺失）」 instead of silently dropping the line (the legal four stay visible); `--migrate` reports FG lots missing supplier_id as an explicit data-quality line.
- **The recall console** (召回管理 page JSBlock, additive on the laid table): the initiate form (problem-lot picker with a scope preview through GET /recall/scope, reason, due date) and the transition row (notify / execute / close, close note mandatory) — both against the engine with the signed-in session's bearer. The trace side panel's CLI guidance is replaced by an in-page 发起召回 button (the same credential-derived POST).
- **Mobile recall notices**: AlertsView grows a recall segment reading `notificationInAppMessages` on the alert-center channel. The gateway row-scopes it like wfl_alerts: anonymous reads refuse, the signed-in user's NocoBase id is pushed down as the `userId` filter (a username→id memo backs it), collection-scope rows are bypassed for the read face only — writes stay engine-side. The read degrades independently (a notices failure never blanks the alerts list).
- **LABEL_ENGINE_BASE configurable**: the mobile barcode card reads `window.__LABEL_ENGINE_BASE__` per render (a module-load constant missed late injections); unset keeps the demo engine origin. The production posture is the gateway `/label/*` proxy.
- **GS1 conformance** (lesson 24): AI(10) is delimited by a mid-FNC1 (GS U+001D in the element string; the encoder maps it to FNC1 in either code set, the decoder re-emits it); the STOP pattern is the standard 13-module termination (no extra `11` padding). The assertion adds an external-standard vector leg — STOP width sequence 2-3-3-1-1-1-2, check character = weighted sum mod 103, mid-FNC1 exactly after the variable-length AI(10), quiet zone ≥10X — facts stated by ISO/IEC 15417 and the GS1 General Specifications, independent of this repo's tables.
- **Direction-scoped broken-chain notice** (lesson 22b): the backward view audits upstream lanes only, the forward view downstream ones — a one-directional view no longer reports the other side's absence. The browser verdicts check both cuts on the broken-chain lot.
- **Audit four-piece** (lesson 23): recall_orders gains `created_at` (NOT NULL default now, idempotent); a `recall_audit` ledger (event_id/order_id/code/actor/action/payload/ts) receives initiate/notify/execute/close rows inside the same data-modifying CTE as each transition — the trail cannot disagree with the state, and the order's deletion cascades its audit. The engine logs route + stack on every failed route. Assertions hard-gate: created_at non-null and the audit trail equal to the transition sequence.
- **Drill hygiene** (lesson 25 minimal): acceptance drills write reason-prefixed 「验收演练」 orders; `--clean-drill` (and the assertion's closing step) sweeps the orders, the cascaded audit rows, and the alert-center notices — the terminal ledger holds real work only.
- **Red-line single source**: the expiry board reads the regulatory ceiling from alert_rules.warn_days (B2's configuration center) instead of a hardcoded 30; the legend states the provenance.

## Key trade-offs

- **The identity gate rides the platform session, not a second token scheme**: the JSBlocks already sit inside NocoBase pages holding NOCOBASE_TOKEN; exchanging it via auth:check keeps one credential universe (the W3_TERMINAL_TOKEN posture stays for terminals only). The check endpoint, not users:me — this NocoBase snapshot does not serve the latter.
- **The notification row scope lives in the gateway**, not a scope-table row: a scope-table grant would expose every user's notices; the userId pushdown (with a memo) keeps the wire answer per-user without a NocoBase-side filter tree change.
- **The recall console is additive** (a JSBlock attached to the existing grid by the `recall-console` marker): relaying the table would churn uids for no gain — the same posture as the JSBlock code-upgrade relaid of the two B3 pages.
- **Drill cleanup deletes rather than filters**: the ledger is compliance evidence; a drill row with no evidential value is pollution. The prefix is the contract; --clean-drill is idempotent.

## Verification evidence

demos/acceptance-w6/w6-r3-01..07b (12 PNGs) + w6-r3-shot-meta.json (verdicts 21/21), w6-r3-04-identity-gate.log (HTTP + page legs), gates-r3.log (typecheck ×2 exit 0; vitest 65+8 passed; oxlint staged 0/0 on the round's files). Regressions green: w6b3-trace/recall/labels --assert and w6b2-rules --assert all PASS.

## Alternatives considered

- **Swap the barcode library vs fix the bwip-js usage** — the usage fix won; the round-trip assertion now locks the behavior.

## Consequences

Cost: broken chains still display (visibility, not hiding). Bought: broken chains diagnosable, the XSS negative on record, barcode round-trip green.
