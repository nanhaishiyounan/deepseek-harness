# Agent Note: W8-B3 — mobile experience depth (cursor polling, roaming work data, session-expiry grace)

Status: implemented

English | [中文](2026-10-04-w8-b3-mobile-experience-depth.zh.md)

The W8 audit's B3 batch (blueprint §4-B3): the chat's freshness model moves from full-window polling to an `afterSeq` cursor (SSE stays out per the blueprint ruling), the work store gains a per-account server projection over NocoBase (the P0 "data roams with the account, not the device" debt), and a dead sign-in session now degrades gracefully instead of failing silently. The fold/protocol/cardState replay semantics are untouched — the poll window narrowed, nothing about how events replay changed.

## Problem

Three P0 gaps carried into B3: every chat poll re-fetched the whole 200-message window and re-folded it (the running window polled every 1.2s, so one turn cost dozens of full-window transfers); work items lived only in `dsh-mobile-work` localStorage — a device switch or a browser-data wipe lost them, and the audit's hard acceptance ("items survive a cleared localStorage") had no server to survive on; and a gateway session that expired server-side surfaced as per-call error strings, never as a path back to the login gate that kept the local data.

## Decision

- **afterSeq cursor (B3-1)**: `session.history` gains `afterSeq` (exclusive with `beforeSeq`, schema-enforced) — the forward read returns the events strictly newer than the cursor, unpaginated, `hasMore: false`, no projections block (a cursor reader holds a baseline). Presenter views still resolve against the full cut, so a fresh tool-result referencing a pre-cursor call presents identically to the tail page. The client (`messages/chat/historyFeed.ts`) keeps the accumulated window in a ref: first read full, later reads append the cursor page (seq-deduped), and the fold still runs over the whole accumulated array — replay semantics are the polling model's own. Two re-base guards need no gateway knowledge of compaction: a cursor page over 40 events, or 30 polls elapsed, force the next full read; becoming visible again re-bases too (`usePageVisible`). The running window tightens 1.2s → 800ms. `usePoll`'s `active` gate takes the visibility value in ChatView and in the shell's kept-alive tabs (`tabAwake`; `hidden` stays layout-only so restore never flashes).
- **Work projection (B3-2)**: `wfl_mobile_work` (one row per account per client-minted `client_id`, unique `(user, client_id)`). The read rides the generic `nocobase.list` — the gateway pushes the acting username into the row filter (anonymous refuses), mirroring the wfl_alerts row-scope precedent, so a client-narrated foreign filter cannot widen it; `nocobase.get` checks the row owner after the fetch. Writes ride two dedicated entrances — `nocobase.mobileWorkSave` (upsert keyed by clientId; the acting account derives from the token and is forced onto the row) and `nocobase.mobileWorkDelete` (user-scoped lookup; a foreign row is invisible so the delete stays idempotent success) — the wfl_ "state machine owns its single entrance" posture (alertAct) applied a second time; `nocobaseWflWriteScopes` gains no row. `workSync.ts` owns the WorkItem↔row mapping: the store's writes notify a registered sink (one-way dependency — workStore never imports the sync layer), ops coalesce per id and drain serially, failures park in a durable `dsh-mobile-work-outbox` with backoff, and `syncWorkFromServer()` (shell mount / re-login) merges server rows (updatedAt wins) and uploads the local-only ones. Signed-out or offline the store stays the pure-local demo it was.
- **Expiry grace (B3-3)**: the wire error keeps its `code` (`RpcFailure`), and `rpc()` routes `nocobase-unauthorized` through `handleSessionExpired()` — clear the token, toast once, notify subscribers (the App root lands on the login gate); work items, drafts, and both outboxes survive, and re-login re-backfills plus `kickOutboxFlush()`. Logout clears both outboxes (a departed account's ops never land under the next login); expiry deliberately does not.
- **B2 hand-over cleared**: `wfl_alerts.created_at` never existed on the live table (the opportunistic read always answered undefined). `w8b3-mobile-work.mts` lands it as `timestamptz NOT NULL DEFAULT now()` (scanner INSERTs start stamping untouched; existing rows backfill) plus the field registration, so the alerts timestamp now renders from real data.

## Evidence

- New specs: `session-history-after-seq.spec.ts` (cursor semantics + schema exclusivity) and `nocobase-mobile-work.spec.ts` (row-scoped reads, forced-owner save, idempotent delete) — 6/6; `work-sync.client.spec.ts` (feed accumulator, mapping, backfill, expiry narrowing, afterSeq payload) — 6/6.
- Live acceptance `demos/acceptance-w8/w8-b3-probe.log` — **11/11** on a fresh-code gateway instance (:13800, copied DSH_HOME): first poll full / later polls cursor-carried; incremental answer ≈12% of the full baseline (267KB → 31KB); the login seed's real writes landed server-side; a wiped localStorage rehydrated after re-login; keeper saw none of buyer's rows (leak=0); a poisoned token returned the login gate with the work data intact, and re-login restored the items. Shots `w8-b3-01..04-*.png` (375px).
- `w8b3-mobile-work.mts --assert`: schema/index/backfill + a create→list→destroy round-trip, all green against the live :13000.
- typecheck clean; `build:lib:client` + `apps/web` vite build green; the w7-b6 dark matrix and the w8-b1 light probe re-passed.

## Repairs that surfaced during replay

- The first live probe looked for a chats-list row to click into, but a copied DSH_HOME has no history rows — the probe now creates its session over `session.create` directly.
- The mobile-work spec's stub table leaked across tests (module-level array); the mock now re-seeds per test, and the list stub executes the `client_id` condition it previously ignored — three owner-scope assertions only became meaningful then.
- `type: 'bool'` is not a NocoBase field type; the table script declares `boolean`.

## Known residue / hand-overs

- Conflict resolution on `wfl_mobile_work` is last-write-wins on the client's `updated_at` (per-account UI state, not an audited document); a two-device concurrent edit converges to whichever write lands later.
- The projection read is one page of 100 rows; an account past ~100 items silently truncates on backfill (the store keeps its local rows regardless).
- The demo seed re-mints fresh ids per wiped first-run, so repeated probe rounds accumulate `demo: true` rows server-side; the acceptance cleanup deletes them (real-use logins start clean).
- #⑪ (wire-level unread counts, Tab badges) stays deferred as the blueprint ruled — the cursor work changed nothing about it.
- Blueprint §8's conditional promise (add `AbortSignal.timeout` when rpc.ts is touched) went unmet: B3 edited rpc.ts for the expiry routing without adding it — unimplemented; the rpc surface currently relies on the gateway's own timeout.
- The fixture's `session.history` ignores `afterSeq` (it reads `beforeSeq` only), so the fixture/offline degraded mode re-reads the full window every poll; the client's seq dedup keeps the accumulated window correct — wasted transfer, not wrong replay.

## Alternatives considered

- **SSE/mux streaming instead of cursor polling** — ruled out by the blueprint (gateway events channel cost vs. incremental polling benefit); the cursor gets the payload reduction without the channel.
- **Incremental fold (fold only new events)** — rejected: folding the accumulated window is microseconds at this scale, and keeping fold input whole preserves the replay contract verbatim (the red line).
- **Generic `nocobase.create/update` for the write path** — the wire has no create, and a scoped `nocobase.update` cannot express row ownership; the dedicated entrances keep the single-entrance posture and carry the ownership check server-side.
- **`nocobaseCollectionScopes` row for the new table** — wfl_ tables ride the engine-table read face with the gateway's own row scope (the wfl_alerts precedent); the scope table governs business collections only, and `wfl_mobile_work` is not a docs deep-link target (no docsCatalog mirror needed).

## Consequences

- `session.history` now has two reading modes; new wire consumers must keep `beforeSeq` and `afterSeq` exclusive (the schema enforces it).
- Mobile work items are now multi-device state under the signed-in account; features that assumed device-local work data (e.g. per-device demo cleanup) still work locally but propagate through the projection.
- Every future wfl_-family table lands with the same triad decision made here: collection-gate read face + gateway row scope, or a dedicated write entrance — never a raw-column whitelist row.
