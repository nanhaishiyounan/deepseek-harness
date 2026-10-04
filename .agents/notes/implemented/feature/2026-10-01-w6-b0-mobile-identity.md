# Agent Note: W6-B0 mobile real identity and register-submits-approval base (G4+G1)

Status: implemented

English | [中文](2026-10-01-w6-b0-mobile-identity.zh.md)

User feedback ranked "mobile ↔ NocoBase data sync" as the top cannot-go-live gap; the W6 research brief pinned two of the eight breakpoints as production-blocking: **G4** (any six-digit code logs in as a fixed 业务员; every audit record lands `approver=admin`) and **G1** (a confirmed registration stays `doc_status=draft` unless the user says "submit it").

## Problem

The mobile app authenticated through a fake any-code channel and the write path defaulted every approver to admin — approvals were not attributable to a person, and G1 (register-then-submit) did not exist.

## Decision

- **Acting-user registry** (`dsh-connector-nocobase/acting-user.ts`): a process-global sessionId→identity map. The gateway writes it on every carrying prompt; the nb_* tools read it. Chosen over a Cordis service because preset subtrees may not publish root-realm services and both packages already share this module instance (workspace symlinks + tsdown-externalized peers).
- **Real login**: new `nocobase.signIn` wire method proxies NocoBase's basic authenticator (`/api/auth:signIn`, username-or-email + password) and answers the profile only — no NocoBase token crosses the wire. `MobileIdentity` becomes `{username, nickname, loggedAt}`; the retired phone+code shape reads as logged out.
- **Identity binding** (`session.prompt` gains optional `loginUser`): the host binds the session's acting user server-side and stamps one durable 【登录身份】 line onto the session's opening message — the model narrates the same identity the tools enforce (model-visible ⟺ logged holds; the line replays with the history).
- **Tool-side enforcement** (`tool-nocobase/write.ts`): with a bound identity, `nb_approve` ignores any model-supplied approver (audit actor = the login), and approve/reject first require an open todo held by that login (`assertActingUserHoldsTodo` — the 越权 gate); `nb_create` stamps the submitter columns (`ACTING_USER_COLUMNS`: pur_requests.requester, qm_inspections.inspector, mfg_job_reports.operator). Anonymous surfaces (PC, CLI) keep the previous behavior.
- **Register-submits-approval** (preset contract): pur_orders/pur_requests/so_orders/mfg_orders/srm_suppliers nb_create success chains nb_approve(submit) in the same turn; receipts carry a 审批状态 row; repeat submits are refused by the state machine (submit only leaves draft — engine CAS refuses double-writes).
- **Supervisor-chain routing** (`w6b0-identity.mts`): the four mobile doc types' `manager` tier switched from hardcoded usernames to the engine's `{type:'supervisorChain', levels:1, emptyPolicy:'transferAdmin'}` marker — the first-level todo routes to the submitter's own department owner.

## Verification

Live buyer run: sign-in + wrong-password refusal, PO-2026-1052 registered → auto-submitted, psql shows `submit|buyer`, todo `chenliqun` (采购部 owner), `submit` count=1 after a forced re-submit refusal, keeper's approval attempt blocked by the todo gate, then chenliqun approves → `approved/chenliqun`. Evidence: `demos/acceptance-w6/w6-b0-01..09-*`. Unit: approval.spec's acting-user describe (4 tests) over the mock engine world.

## Truth-debt incident (recorded, not fixed here)

A pathological confirm+reject double-action turn made the model fabricate a `submit_receipt` (reasoning literally said 行 id 假设 105; no nb_create existed, no row landed). The client renders fence payloads without cross-checking tool results. B1+ hardening direction: gate receipt cards on a matching tool/result rowId in the session log.

## What we did not do

- No per-user NocoBase tokens (writes keep the deployment service account; identity rides audit columns + wfl records). Token-forwarding is the B10+ decision if row-level ACL matters.
- No client-side submit outbox (G6) — the state machine's refusal is the idempotency backstop this batch relies on.
- The engine's own OR-sign-off path stays permissive (page/CLI heritage); the identity gate is tool-path-only by design.

## Alternatives considered

- **Keep the demo auth channel vs real NocoBase users sign-in** — real chosen; the demo channel survives only as a rollback feature flag.
- **Full JWT plumbing in one shot vs the minimal identity-passthrough + honest-audit loop** — the minimal B0 loop shipped; full JWT splits into later steps.

## Consequences

Cost: the login chain now depends on NocoBase users being alive. Bought: per-document approver attribution (73 non-admin approves measured) and provable overreach refusals.
