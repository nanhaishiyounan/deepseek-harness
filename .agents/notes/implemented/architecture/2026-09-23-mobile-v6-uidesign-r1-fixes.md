# Agent Note: Mobile v6 R1 — the unified-verification fix iteration

Status: implemented

English | [中文](2026-09-23-mobile-v6-uidesign-r1-fixes.zh.md)

## Problem

The unified verification over the landed B1–B3 batches reported 69/100: a stale packed-session-fixture layout red on the snapshot lane, a 163-site per-file coverage gap across 18 ui-mobile files (the per-file 100% gate had never run over the batch), and five behavior findings — the me-tab receipt strip led with the oldest receipts, two same-frame double taps could open a session twice (the state guard read the pre-batch closure under React batching), the agents busy flag disabled every roster row, and the demo typing indicator never retired after a turn because its baseline counted raw events while the clearing check compared folded items.

## Decision

- **Fixture migration (C2).** The edited `apps/web/tests/snapshots/mobile-assistant/seed.jsonl` (plus the three sibling seeds) were rewritten through `pnpm run migrate:packed-session-fixtures`; the `session-fixture-layout` snapshot went green with no other snapshot touched.
- **Coverage (C1).** The 163-site gap closed with behavior tests (33 new cases across 11 spec files — pin/unpin swipe rows, infinite-scroll paging with an offsetParent stub, the same-frame double-tap locks, keyboard picker entry, relation pickers on the v3 card, error strips with retry, the typing fold regression, live failed tool steps, keyboard dialog arms), plus a `ColleagueVisual` type tightening: every table entry and the fallback carry `skills`/`status`, so the two fields became required and four dead `?? []`/`?? 'online'` arms were deleted instead of exempted. Ten v8 ignore markers cover the arms jsdom cannot drive (wheel re-selection, the pull-to-refresh gesture, the image-viewer slide engine, type-only `??` fallbacks); the inventory relocked at 905 (net-new 19 = 9 left un-relocked by B1–B3 + 10 here).
- **Behavior fixes.** The receipt strip takes the head of the newest-first collection (`slice(0, 3)`, no reverse). WorkView/AgentsView carry a synchronous `useRef` starting lock beside the render state, so two clicks dispatched inside one frame cannot both pass the guard; the agents busy mark anchors to the tapped row (`startingId`) and the rest of the roster stays enabled. The typing baseline and the clearing check both count raw events (the fold merges tool call/result pairs into single rows, so an item-count comparison almost never clears); a fold<raw regression test drives raw 5→10 with items 2→4 against a baseline of 5.
- **Concurrent cleanups.** The v3 ghost button takes `--dshm-on-soft` as its face color (the dark soft track lifted brand text past the 4.5:1 floor; the token already existed for the light track). HomeView separates the roster and session-list failure states from the empty states with an alert strip plus a retry link. The `usePoll` state entries now reference one shared refresh closure (the switch re-binds it anyway), and WorkDetailView's action closures moved under the resolved-item arm so the `?? ''` route ids narrow without fallbacks.

## Alternatives considered

- Exempting the remaining 18-file coverage gap under the client GUI-debt pattern was rejected: the ui-mobile lane had been gated per-file at 100% since B1, so the debt exemption would hide a regression of the batch's own bar.
- Keeping the `ColleagueVisual.skills`/`status` optionality with four v8 ignores was rejected in favor of the type tightening — the table and the fallback both fill the fields, so the optional arms were dead code, and the ignore budget (10 per batch) could not absorb them alongside the genuinely untestable arms.
- A `Math.max` replaced the `at < 0 ? 0 : at` viewer index fallback: same semantics, no branch to cover.

## Consequences

- `pnpm vitest run packages/client/ui-mobile` runs 610 tests green (was 577); the package's coverage output carries no uncovered-location records (163 → 0). Repo typecheck, lint (0 warnings 0 errors), build (220 client artifacts), and the web e2e trio (mobile-shell / mobile-assistant / mobile-preview-iframe, 13 tests, protocol-invisibility negatives included) stay green.
- The real-link path (fold/围栏 v:3/nine-member roster/four-status/runMode/nb_create/RPC) is untouched; grep over the diff confirms no protocol-side edits.
- Deferred (unchanged, restating the verification report's debt list): the token family completion (`--dshm-primary-20/35`, shadow/radius tokens), the `<think>` filter, stale CSS artifacts in lib/, the MessagesView search's stale-window/PullToRefresh await, and the ProfileView quick-entry toast. New deferred item: the same-frame double-tap locks hold per view, not per row — a cross-row concurrent create is prevented by the single starting slot, which matches the product's one-conversation-at-a-time flow.
- Screenshot evidence: `research/2026-09-23-mobile-v6-uidesign/r1-01-chat-receipt-light.png` (the b3-04 light re-shot) and `r1-02-typing-cleared.png` (the settled turn with the breathing indicator retired), driven by `.shoot-r1.mjs` against `:3080`.
