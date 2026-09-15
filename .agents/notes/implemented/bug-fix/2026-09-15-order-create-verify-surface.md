# Agent Note: order-create verification surface — poll sort key, lease coverage, derived budget guard

Status: implemented

English | [中文](2026-09-15-order-create-verify-surface.zh.md)

## Problem

Three verification-surface defects sat around the I0 order_create fixes (production code was already sound on the live stack and stayed untouched):

1. **Starved segment timeline.** The verify script's status poll passed `sort: '-id'` — a bare string — to `NocoBaseClient.list`, whose `sort` option is `readonly string[]` (joined on the wire). A string has no `join`, so every poll round threw inside its own swallowed catch and the timeline stayed empty; the transcript read all three segments unobserved. The initial diagnosis ("hardcoded status keys drifted from the polled values") was wrong: the production keys are exactly `pending`/`generating`/`delivered`.
2. **Lease leak on the assertion path.** The `check(timeoutMs === 180000)` and the baseline orders query ran outside the `try/finally { lease.restore() }`, so an assertion failure or a network blip there left the production workflow #386331759214592 paused.
3. **Untuned budget margin.** `order-budget.spec.ts` guarded `orderCreateTimeoutMs >= draftTimeoutMs + 30000` with a bare constant that carried no derivation.

## Decision

- The poll rides `sort: ['-id']` (the client's array form) at a 60ms cadence, which usually lands a response inside the ~30-50ms pending window. Narrow windows get fallback anchors so every segment still lands a millisecond figure: the read-back moment anchors `delivered`, the order's first sighting of any status anchors `pending`, and anchored segment differences print with a `≤` prefix. A 120ms wait before building the timeline lets the next poll round sight the terminal `delivered` instead of the fallback.
- The `try` block now opens before the baseline query (everything after `lease.pause()` is covered); a `stopPoll` closure lets the teardown stop the loop on every path, `lease.restore()` failures surface as transcript warnings without blocking disposal, and a null-guarded workflow terminal-state read lands in the transcript (`enabled=true` on success).
- The budget guard derives its margin from the pipeline's fixed retry math: one full `draftTimeoutMs` attempt plus `REPAIR_RETRY_FLOOR_MS` (38900 — the measured full-length MiniMax-M3 draft from `demos/order-create-verify-*.md`; the JSON-repair retry re-emits the same JSON) plus `NON_DRAFT_FLOOR_MS` (1000 — seven NocoBase REST round trips at 12-21ms each plus kb retrieval, PDF render, and upload, with two orders of magnitude of slack). The pinned 180000 clears the 159900 floor with 20100 to spare; a `draftTimeoutMs` above 139100 or a budget below 159900 now fails the guard.
- The orders.spec mock's `orders:update` answer mirrors the live wire's NULL optional columns (verified against the real resourcer: `error`/`note`/`deliverablePath`/`deliverableUrl`/`generatedAt` come back null), so the model-drafting case's `note` assertion exercises the real NULL collapse on the fulfill return path instead of a field that is merely absent.

## Alternatives considered

**Derive the margin from worst-case timeouts** (seven REST calls × the 15s per-request timeout, or a second full `draftTimeoutMs` attempt). Rejected: both exceed the live-verified 180000/120000 pins (225000+ and 240000+), contradicting the composition's documented stance that the repair attempt runs inside the remaining budget.

**Anchor the pending segment from the row's `createdAt`.** Rejected: the orders collection carries no `createdAt` column (verified on the live row), so there is nothing to read.

## Consequences

The segment timeline is polled evidence again (153101 run: pending +185ms, generating +476ms, delivered +13004ms, total 12985ms inside the 180000ms budget). One live run hit a genuine 180000ms TOOL_TIMEOUT on a slow MiniMax draft and proved the lease coverage in anger: the assertion failed, and the teardown still restored workflow #386331759214592 to `enabled=true` with the terminal state recorded in the transcript.

Observed production edge (outside this fix's scope, production code untouched): the TOOL_TIMEOUT abort signal also aborts the `failed` status write-back inside `fulfill`'s catch, so the order stays `generating` (that run's order #48 was marked `failed` manually with the cause). A follow-up could write the failure status through a fresh signal in the catch.

## Testing

`order-budget.spec.ts` 3/3 and `orders.spec.ts` 18/18 (the model-drafting case now asserts `'note' in delivered === false` over a NULL-serving mock); typecheck and lint clean. Live runs: `demos/order-create-verify-20260915-153101.md` (all three segments polled, no fallback anchor) and `demos/order-create-verify-20260915-152548.md` (delivered on the fallback anchor), both ending `enabled=true` with no workflow residue.
