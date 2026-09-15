# Agent Note: order_create synchronous pipeline budget and contract fixes

Status: implemented

English | [中文](2026-09-15-order-create-budget-and-contract.zh.md)

## Problem

An AI-conversation order on `expert_services/2` failed with `tool call timed out after 60000ms`. Two defects hid behind that symptom:

1. **Budget mismatch.** `order_create` runs the whole deliverable pipeline in one tool call (NocoBase writes, kb retrieval, MiniMax-M3 streaming draft, PDF rendering, attachment upload). The kb-agent composition pins expert-orders at `draftMaxTokens: 16384` / `draftTimeoutMs: 120000` — but left tool-connector's `orderCreateTimeoutMs` at the 60000 seam default. The inner draft deadline exceeded the outer tool budget, so any draft slower than ~52s surfaced as `TOOL_TIMEOUT` and stranded the order in `generating`. Measured on the live stack: NocoBase REST reads/writes 12-21ms, the real MiniMax-M3 draft prompt streams 38.9s (TTFB 0.9s) — not an error, purely insufficient time. The e2e/demo compositions pin the same 120s draft budget without the tool-budget override; only the gateway conversation path (timeout-policy from bundle/base wraps `tools/execute`) ever hit the ceiling, which is why demos never reproduced it.
2. **Un-normalized fulfill return.** `OrdersRuntime.fulfill` returned the raw wire row from the delivered-status `update`. The resourcer serves SQL NULL for unset columns (`note` when the model drafted), so the tool output schema rejected the result with `"value.note" must be a string` the moment execution survived past 60s. Every other read path (`create`/`get`/`list`) already passes through `normalizeOrderRow`.

## Decision

- `cordis.patch.yml`, `demo-full-journey.cordis.yml`, and `expert-order-e2e.cordis.yml` pin `tool-connector.orderCreateTimeoutMs: 180000` — the draft deadline (120000) plus the non-draft steps and one JSON-repair retry window. The nocobase-track fixture is untouched: it drives `orders.fulfill` directly and never mounts the order tools.
- tool-connector's `Config.orderCreateTimeoutMs` JSDoc states the constraint: the budget must clear the composed `draftTimeoutMs` plus the pipeline's non-draft steps.
- `fulfill` returns `normalizeOrderRow(settled)`, so callers and the tool output schema see the same contract-shaped record every other path serves; the `deliverable` appends field is wire-only and stays off the returned record (the update-wire payload asserts the attachment linkage instead).
- `examples/kb-agent/tests/order-budget.spec.ts` (keyless) guards the relation on all three compositions: `orderCreateTimeoutMs >= draftTimeoutMs + 30000`.
- `examples/kb-agent/scripts/order-create-verify.mts` reproduces the conversation tool path (timeout-policy wrapper included) against the live stack and lands evidence in `demos/order-create-verify-*.md`.

## Alternatives considered

**Raise the seam default `DEFAULT_ORDER_CREATE_TIMEOUT_MS`.** Rejected: 60s is a sound budget for compositions that draft through the template fallback; the relation to expert-orders' `draftTimeoutMs` is a composition-level fact the package default cannot know.

**Make order_create asynchronous (return the order number, draft later).** Rejected: the tool description, system-prompt guidance, and the demo-full-journey precedent all promise one-call delivery; the approval-track workflow already covers the async shape. A product redesign exceeds a defect fix.

**Cross-plugin startup validation (tool-connector reads expert-orders' config).** Rejected: the plugins are mutually unaware by design; a keyless spec asserting the yml relation gives the same regression guard without runtime coupling.

## Consequences

Cost: an in-conversation order_create call can now legitimately hold the tool surface for up to three minutes while drafting completes. Benefit: the synchronous delivery contract survives slow drafts and one JSON-repair retry without stranding `generating` orders; the budget relation is a tested composition invariant instead of tribal knowledge; the fulfill return honors the same record contract as every other orders read, and the note-null output rejection is gone.

## Testing

Segment timing on the live stack (evidence: `examples/kb-agent/demos/order-create-verify-*.md`): tool total 29162ms then 25723ms across two runs — well inside the 180000ms budget where 60000ms previously failed; both orders landed `delivered` with a real PDF on disk and the attachment served from NocoBase (`/files/main/main/attachments/…`). Independent probes: MiniMax-M3 draft prompt 38.9s end-to-end, NocoBase REST 12-21ms per call. Unit: `order-budget.spec.ts` 3/3; tool-connector + expert-orders suites 69/69 after the fulfill-contract assertion update.
