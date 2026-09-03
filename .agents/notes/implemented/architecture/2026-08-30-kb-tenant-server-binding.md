# Agent Note: Server-side tenant binding for the kb tools

Status: implemented

English | [中文](2026-08-30-kb-tenant-server-binding.zh.md)

## Problem

P0 shipped `tenantId` as the SQL-level hard isolation key, but the model-facing tools (`kb_search`/`kb_ingest`/`kb_stats`) still accepted a `tenant` argument with a composition-level `defaultTenant`. A model could therefore name any tenant mid-conversation; the seam's SQL isolation was real, but the door to request another tenant stood open. The P1 plan ([`plans/food-kb-agent-plan.md`](../../../../plans/food-kb-agent-plan.md), P1-1) requires the tenant to come from the deployment side, never the model.

## Decision

Bind the tenant in `tool-kb` configuration and remove it from the model-visible surface:

- `Config.tenant` is **required** (`z.string().required()`); a composition without a binding fails schemastery validation at plugin load — the misconfiguration-is-self-contained case of the fail-loud rule. The former optional `defaultTenant` is gone.
- All three tools drop the `tenant` parameter from their schemas, descriptions, and system-prompt guidance. Because `defineTool` compiles parameters into an **implicitly open object root** (undeclared keys pass schema validation), each tool's parse function additionally rejects `args.tenant !== undefined` with a fail-loud error — a residual or forged tenant argument cannot silently fall back to the binding.
- `kb_stats` counts only the bound tenant. Cross-tenant counting was a management-plane capability the model never needed; exposing library size of other tenants is itself information disclosure.
- Chosen binding mechanism: **cordis.yml configuration (single-tenant deployment)**, not a session→tenant map.

Rationale for the configuration binding over a session/workspace→tenant mapping: the P1 deployment shape is one deployment per enterprise (each with its own tenant slug and data directory, per the plan's P1-1 entry), so a deployment-level constant covers every real composition today, including `examples/kb-agent`. The tenant is a deployment fact, not a per-session fact, and cordis.yml is the repository's existing explicit declaration point for deployment facts ("explicit > implicit at package boundaries"). A shared multi-tenant deployment would need a session-context plugin plus a `SessionEventMap` member (model-visible ⟺ logged); that machinery is unjustified with no shared deployment on the roadmap and can later slot behind the same "server resolves the tenant" point inside the tools.

## Alternatives considered

- **Keep the `tenant` argument, fail loud only on mismatch with the binding** — rejected: keeping the parameter advertises the tenant concept to the model and the "match passes" branch trusts model honesty; removing the parameter plus parse-time rejection is strictly stronger.
- **Session/workspace→tenant mapping (multi-tenant shared deployment)** — deferred: no shared-deployment requirement exists in P1/P2 planning; the mapping needs session-event machinery the single-tenant shape does not.
- **Optional tenant with execution-time fail-loud** — rejected: a missing binding is a self-contained configuration error, and the load-time failure named by schemastery is earlier and clearer.

## Consequences

- Every kb composition must set `tenant:` in `tool-kb` config; `examples/kb-agent` and its test fixture set `tenant: demo-food-co`.
- The seam (`ctx.kb`) still takes explicit `tenantId` parameters — server-side callers (scripts, future admin surfaces) keep full control; only the model-visible face is bound.
- `KbSearchInput` no longer carries a tenant; the tools pass the binding into `ctx.kb.search({ tenantId })`.

## Verification

- `packages/kb/tool-kb/tests/tenant-binding.spec.ts` — model-supplied `tenant` rejected on all three tools (even when it matches the binding), other tenants invisible to search and stats, ingest lands in the bound tenant without any tenant argument, `Config({})` fails validation, and no tool schema declares a `tenant` parameter.
- Existing tenant-isolation SQL tests in `kb-sqlite` remain green unchanged; the keyless closed-loop snapshot passes with the bound tenant.
