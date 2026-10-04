# Agent Note: W6-R1: mobile sync fixes — acted_at projection, docs deep-link guard, outbox idempotency, unified sign-in sessions

Status: implemented

English | [中文](2026-10-01-w6-r1-mobile-sync-fixes.zh.md)

- Date: 2026-10-01
- Status: implemented
- Area: feature
- Scope: `packages/client/ui-mobile` (ledger/docs/todos/outbox/chat/profile/app), `packages/host/apiproxy` (sign-in sessions, scope table, prompt idempotency), `packages/connector/tool-nocobase` (anonymous-approval gate), `examples/kb-agent` (column-guard assert leg, QUICKSTART nightly ops)
- Evidence: `demos/acceptance-w6/w6-r1-01…` (live: engine+gateway+NocoBase, psql reconciled), `demos/acceptance-w6/gates-r1.log`

## Problem

The B0/B1 verification round flagged mobile debts: the deep-link guard let foreign routes in, and a re-submitted draft could double-fire.

## Decision

1. **P0-1 (G3 live-failed column)** — the month projection and the docs approval trail filtered on `created_at`, a column `wfl_approval_records` does not carry (it is `acted_at`): every read silently matched nothing. `myMonthlyRegistrations` now filters `acted_at` with the client calendar's local month start as a full ISO instant (the UTC date slice shifted the local month's first hours into the previous month), and the trail reads `acted_at`. The me-tab's two ledger legs settle independently (`Promise.allSettled`): a failed server projection renders 读取失败 and leaves a `client_error` trace without taking the local receipts strip down. The `w6b1-sync.mts --assert` gained a column-guard leg: the live schema must contain `acted_at` (and not `created_at`), every filter/trail column the two sources name must exist in the schema, `acted_at` carries no NULLs, and the G3 month projection reconciles between the NocoBase API and psql.
2. **P0-2 (docs deep-link IDOR)** — two layers: the `#/docs/*` route re-checks the role whitelist (`collectionAllowedFor`; a configured role bounces back to the directory with a toast, unconfigured accounts stay fail-open for supervisors like chenliqun), and the gateway enforces the same table server-side — `nocobaseCollectionScopes` in the api-gateway config maps usernames to collections; a signed-in caller outside their scope fails with `nocobase-collection-forbidden` (buyer deep-linking `qm_inspections` reads zero rows at the wire level). The client catalog is UX; the config table is the boundary.
3. **P0-3 (outbox double-send window)** — every outbound message carries a `clientMsgId`; `session.prompt` remembers accepted ids per session (a 128-entry ring) and answers `accepted` to a repeat without dispatching, so the offline retry and the response-lost double-send both collapse server-side. The outbox itself went to shape v2: entries carry the id, tabs stay coherent through a `BroadcastChannel` sync plus the `storage` event, the flush pass skips ids this tab already sent (`outbox.dedup_hit`), and only transport `TypeError`s re-queue — a server refusal surfaces and never re-sends.
4. **P0-4 (logout identity drift)** — logout clears the outbox (`clearOutbox`: rows plus the armed retry timer, one `outbox.dropped` trace); a departed account's parked messages can no longer send under the next login. `nb_approve` refuses anonymous sessions outright — the audit trail requires a signed-in actor (the previous anonymous pass-through fell back to admin).
5. **P1-1 (unified PC/mobile user system)** — `nocobase.signIn` issues a gateway session token (12h, process-local registry): prompts derive the acting user from the token (`authToken`) and never from a client-narrated `loginUser`; `nocobase.list/get/update` carry the token (reads enforce the scope table, `nocobase.update` refuses without a live token — the PC inline write path). A forged `loginUser` binds nothing and the anonymous session's `nb_approve` refuses; anonymous browsing stays open (PC read surface).
6. **P1-3/P1-6 (copy + observability)** — the docs list says when it caps at fifty rows; transport failures render 网络连接失败 (never raw "Failed to fetch"); the chat approval flip reads the state column by the collection's own vocabulary (`doc_status`/`status`/`lifecycle_status`) so posting collections settle as 他端已处理 too; ledger/docs/todos read failures leave structured `client_error` traces and render error cards, never silent dashes; the detail page renders schema zh titles over snake_case field names.
7. **P1-5 (truth-debt)** — the B1 gates log's 16/16 → 14/14 and 389 → 388 rows now match the assert log; the B1 note's tool-nocobase count matches the recorded run (48/48); the "mobile actions cannot bypass the audit chain" claim now states the real shape (approvals ride the acting-user gate; anonymous doc browsing exists).

## Why these seams

- The sign-in token lives in the gateway (not NocoBase): the gateway is the policy point that owns the acting-user registry the nb_* tools gate on, and a gateway restart retiring every session is the same stance as that registry.
- The scope table is deployment config (`nocobaseCollectionScopes`), not code: the role table is per-site business data, and the mobile catalog mirrors it rather than both being code.
- The prompt idempotency ring is process memory: the outbox retry window is seconds-to-minutes, far under any restart; a restart clears the outbox's double-send risk with it.

## Invariants worth keeping

- Identity is derived server-side: a prompt or nocobase call binds only what a gateway-issued token resolves to; `loginUser` alone binds nothing.
- The outbox retries a message only while it is transport-failed; a server-refused message never re-queues (a duplicate could double-execute).
- The column-guard assert leg reads the live schema, not a fixture: a renamed engine column fails the leg before the mobile surfaces silently empty again.

## Verification

- `pnpm run typecheck` (0 errors); vitest: ui-mobile 663/663 (new ledger-service/docs-view/todos-view suites + outbox v2 cases + views todos/docs route references), tool-nocobase 49/49 (new anonymous-refusal case; mock-world suites bind their acting users), apiproxy 467/467 (new sign-in-session suite: token issuance, scope refusal, update gate, prompt token-stamp, clientMsgId dedup); oxlint staged 0 errors on changed files.
- `w6b1-sync.mts --assert` 21/21 including the new column-guard leg.
- Live evidence `w6-r1-01…08`: buyer monthly count vs psql, deep-link bounce + zero-row wire refusal, double-tab + response-lost psql count=1, logout clears the outbox, forged loginUser refused, truncation/copy/error-state screenshots.

## Follow-ups

- The sign-in session registry is process-local; a multi-process gateway deployment needs a shared store before horizontal scaling (single-site today).
- Push notifications remain the eventual replacement for the todos/docs polls (unchanged stance from B1).

## Alternatives considered

- **Per-screen guards in the mobile app vs gateway/engine-level guards** — the unified gateway guard won: one enforcement point, replayable negatives.

## Consequences

Cost: guard logic lives in the gateway. Bought: deep-link/idempotency/overreach negatives replayable from the assert legs.
