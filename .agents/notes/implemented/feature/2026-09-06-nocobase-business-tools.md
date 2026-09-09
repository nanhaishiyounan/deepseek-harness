# Agent Note: NocoBase headless consumption surface — apiproxy nocobase domain and the nb_* business tools

Status: implemented

English | [中文](2026-09-06-nocobase-business-tools.zh.md)

## Problem

Batch V2 of plans/nocobase-native-integration (03-batches.md): the agent must read and write NocoBase business data in conversation — understand the business first (collections, rows), then change it through an in-conversation diff confirmation, with no forms and no silent writes. The plan's blind-spot B verdict (PLAN.md B-6) fixes the transport: self-built narrow REST tools reusing `NocoBaseClient` for V1–V4; the MCP channel is a V6 comparison evaluation, not this batch.

## Decision

### One client, three consumers — the shared surface grows in the client package

The restricted filter vocabulary (flat `{field, op: eq|in|gt|lt, value}` conditions joined by one and/or, compiled by `compileNbFilter`) and the schema-discovery call (`listMeta`) live in `dsh-connector-nocobase`, because both the agent tools and the apiproxy domain consume them. Arbitrary operator trees never cross any consumer boundary — the model names fields and operands, never raw `$operators` beyond the four. `NocoBaseClient.list` gained optional `sort`/`fields`/`appends` and `get` gained optional `appends` — additive wire parameters, no caller changed.

### The tool suite is a new package (`tool-nocobase`), not more rows in `tool-connector`

`tool-connector` owns the dataset surface (discover/fetch/transfer/order); business-record CRUD is a different concern with its own degraded mode (credentials resolve at load; missing ones keep the tools registered and fail each call with the structured no-credentials refusal). Five tools: `nb_collections` (schema discovery; hidden collections dropped), `nb_list` (restricted filters, sort, projection, bounded paging ≤100), `nb_get`, `nb_create` (landing receipt), `nb_update` (reads the row first, answers the field-by-field before→after diff plus the stored row). Every tool rejects a `tenant` argument — the service account is the deployment-side permission boundary (the tool-kb precedent).

### The in-conversation confirmation is prompt guidance plus receipts, not tool state

03-batches.md V2 fixes the confirmation semantics: SKILL/persona guidance drives the flow, the tools themselves carry no UI confirmation state. Each write tool's system-prompt section states the contract (present the full preview / the before→after diff, get the explicit go-ahead BEFORE calling; fill missing slots by asking, never invent values; change only the named fields), and the receipts (create's landing id, update's diff) let the conversation echo exactly what landed. `nb_update`'s get-then-write inside one call is the mechanical guarantee that the receipt's `before` reflects the row at call time. The keyless snapshot asserts the structural fact — only reads reach the backend before the confirmation step; the with-NC e2e asserts the landed merge and destroys the created row.

### The apiproxy domain is read-path-first

`nocobase.listMeta/list/get` behind `nocobaseEnabled` (absent = `nocobase-not-composed` on every method; enabled but no resolvable account = `nocobase-unavailable`; backend refusals fold to `nocobase-request-failed`; a null wire row = `nocobase-row-missing`). Writes never cross the wire surface — they stay on the agent tools with the confirmation contract, so the unauthenticated gateway never mutates business records. Credentials resolve lazily once per gateway (cached promise) through the credentials seam then the ambient environment; the connection fake client gained the `nocobase` section so the browser path stays typed for V6's ui-business page.

## Alternatives considered

- **Putting the tools in `tool-connector`** — rejected: that package owns the dataset surface (discover/fetch/transfer/order); business-record CRUD has its own degraded mode and confirmation contract, and the plan's file list already named a new package.
- **A tool-call-time approval gate instead of prompt-borne confirmation** — deferred: 03-batches.md V2 fixes the semantics as in-conversation flow with no tool UI state; a hard gate stays available as a future batch for deployments that want it.
- **Sharing the filter vocabulary from the tool package** — inverted: the vocabulary lives in `dsh-connector-nocobase` because the apiproxy domain consumes it too (one client, three consumers).
- **A write-through apiproxy surface** — rejected: the unauthenticated gateway never mutates business records; writes stay on the agent tools behind the confirmation contract.

## Consequences

- `examples/kb-agent` persona and the `enterprise-data-assistant` preset carry the business-routing line (business records → nb_*; documents → kb_search; statistics → lakehouse_query) and the confirmed-change paragraph; the preset description no longer claims "retrieval-only, no destructive operations".
- The keyless snapshot `nocobase-tools.spec.ts` locks the whole model-facing journey (schema → filtered reads → pre-change read → diff update → follow-up read → create receipt) against a mock resourcer; `DSH_SNAPSHOT=refresh` regenerates.
- The with-NC e2e `nocobase-business.e2e.ts` runs the same journey against the live seeded backend (张红喜 read, UUID-marked create, diff update, raw-client read-back, destroy cleanup) and self-skips without reachable credentials, mirroring `nocobase-track`.
- Deferred with the plan: kg_* tools (V4), the ui-business page consuming `nocobase.listMeta` (V6), the MCP-channel comparison (V6, decision batch), and the webserver `/nocobase` reverse-proxy debug switch (optional in the plan; nothing consumes it yet).
