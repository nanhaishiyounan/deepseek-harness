# Agent Note: Three-journey end-to-end demo and real-track closeout — demo-full-journey design and orders wire-row normalization

Status: implemented

English | [中文](2026-09-05-full-journey-demo-and-wire-normalization.zh.md)

## Problem

The closeout batch of the work line (N7, plans/connector-lakehouse-nocobase/02-batches.md): each of the three customer journeys (upload auto-routing, expert discovery & consulting, in-session ordering with PDF delivery) needed one real end-to-end run with re-runnable evidence; the first `order_status` tool call on the live NocoBase track along the way exposed a wire-row projection defect in the seam.

## Decision

### The demo is one script chaining three scenarios, not three scripts or e2e reuse

`examples/kb-agent/scripts/demo-full-journey.mts` plus its sibling `cordis.yml` composition: one Loader composition (kb + lakehouse + connector + expert-orders + the agent/session rows — a full mirror of the cordis.patch.yml product surface) runs all three scenarios against one shared temp workspace (isolated kb/lakehouse/deliverables paths injected through `DEMO_*` env vars), with per-scenario precondition checks (`MINIMAX_API_KEY`, `NOCOBASE_BASE_URL/NOCOBASE_API_KEY` resolved from the environment or the root `.env`, plus a NocoBase liveness probe) — a missing precondition records SKIP with the reason, a failed assertion records FAIL and a non-zero exit, and all evidence (questions, tool sequences, assertions, key outputs) accumulates live into `demos/full-journey-<timestamp>.md`. Three reasons: the journeys share the composition and tenant state, so one boot saves two Loader startups; SKIP is not failure — the demo still completes coherently when a real track is unavailable; the transcript lands immediately, so a failing scenario still keeps its output evidence (assertion order is uniformly record-before-assert).

### Scenario 3 places the order through the seam, not the `order_create` tool

The `order_create` tool's execute is create + immediate fulfill (the N5 DSH-internal synchronous-closed-loop semantics); on the real approval track it would drive the order to delivered before the manual task resolves, colliding with the workflow's request-callback fulfill (the later callback fails on the illegal delivered→generating transition). The demo presents the real approval track as it is: `orders.create` (landing a pending row) → resolving the manual task through the workflow-tasks API as the approver → the workflow request node calling back the script's own fulfill server (the production gateway's client-request envelope) → delivery. The callback server prefers port 3080 (the production gateway port) and otherwise takes an ephemeral port plus a private workflow clone (executed workflow nodes are immutable), destroying the clone and re-enabling the production workflow afterwards — isomorphic to the nocobase-track e2e.

### orders wire rows normalize at the seam boundary (real-track defect fix)

The first real-track `order_status` call failed with `value is not lossless JSON`: the NocoBase resourcer answers unset optional columns with SQL NULL (`error` and `note` arrive as null rather than absent), and the orders table has no `createdAt` column (creation time rides the create payload only; the row gains `generatedAt` after delivery) — `client.get/list` casting wire rows straight to `OrderRecord` violated its own declared types, `created_at: undefined` reached the tool output explicitly and broke the lossless-JSON check, and `error: null` violated the output schema's string constraint. The fix lands at the seam's read boundary (wire-boundary normalization, honoring "trust same-process types, validate across boundaries"): `normalizeOrderRow` collapses null optional columns to absence, drops the wire-appended `deliverable` attachment row objects, and backfills `createdAt` through the chain `createdAt → generatedAt → ''`; readOrder/list/create all pass through it. The mock track's rows (orders.spec) are full-field JSON and are unaffected.

### A missing connector-files drop-in directory fails loud, not degrades

After a clean checkout the first `dsh web` (or headless patch) boot fails loudly because `workspace/data/connector-files` does not exist (the directory lives under `.gitignore`'s runtime exclusions). connector-file's semantics are a drop-in directory: an empty directory means an empty dataset list; a missing directory is a configuration error. The resolution is a documented setup step (QUICKSTART one-time preparation step 4 mkdir plus an FAQ entry), not a plugin downgrade.

## Consequences

The 2026-09-05 run (real MiniMax + real NocoBase): three scenarios PASS, transcript at `demos/full-journey-20260905-150321.md` (browser-layer verification included: after restarting `dsh web` per the BUG-4 contract onto the new composition, a web session hit 张红喜's expert card through connector-nocobase). orders.spec gained a wire-normalization describe (13/13 green). Field observation: in web sessions the agent's self-chosen long-tail keywords miss the connector's `$includes` substring filtering — e2e/demo queries hit with exact words that actually appear in the seeded fields (海外仓 / 中亚); prompt-level keyword guidance is logged as a follow-up optimization, not a defect.

## Alternatives considered

- **Three separate scripts** — three Loader startups, three composition files, three precondition blocks; the chained demo over a shared composition tracks the product narrative of "one deployment, one run, three journeys".
- **The demo leaning on the long-running `dsh web` to receive the fulfill callback** — more "production", but the demo's re-runnability would hinge on the web process's state and composition freshness; the self-contained callback plus workflow clone stays isomorphic to the e2e and depends on no long-running process.
- **Defensive projection on the tool side (order.ts) for null/undefined** — would freeze the seam's type violation into two contracts; the fault is the seam violating its own declared types at runtime, so the fix belongs at the wire read boundary.
