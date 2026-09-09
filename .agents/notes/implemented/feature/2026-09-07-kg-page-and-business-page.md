# Agent Note: The kg page and the business page — the V6 second page wave

Status: implemented

English | [中文](2026-09-07-kg-page-and-business-page.zh.md)

## Problem

The user's closing requirement — "built-in is built-in, the page UI must not be missing" — left exactly two pages: the knowledge-graph visualization (sigma.js subgraph browsing) and business management (conversation-first management of NocoBase collections), plus the embed low-frequency admin aid. The spec authority is [plans/nocobase-native-integration/02-design.md](../../../../plans/nocobase-native-integration/02-design.md) §3.3/§3.4; the decision inputs are PLAN blind spots B and C.

## Decision

- The kg read surface is a new apiproxy domain (`kg.schema/search/subgraph/expand/stats`), full six touchpoints in the V5 assets/connectors convention (contract + zod + ApiProxy field + rpc-map rows + fetch pair + api-proxy implementation) with both fake faces and the connection fixture wired; `kgEnabled`/`kgTenant` are explicit opt-ins with an independent `kg-tenant-unbound` refusal. searchNodes/subgraph take no cancellation signal (an FTS probe and a bounded CTE walk); `relation_types` filters at the projection layer, matching the kg_subgraph tool.
- The sigma stack drops @react-sigma/core (design said "three pieces"; the wrapper surface is under fifty lines and the V-R12 fallback stays trivial); FA2 runs one synchronous 60-iteration pass inside the ≤500-node window with no continuous simulation. The three packages load in one dynamic round-trip; hosts without WebGL degrade to a same-semantics relation list (jsdom tests exercise the degraded path for real).
- Node colors ride a ten-slot `--dsw-graph-node-*` theme ladder (light and dark blocks) with a stable per-type-id hash — no page-private colors.
- The business page is zero-form: the card stream and hasNext table ride V2's `nocobase.listMeta/list` domain (no new BFF domain); every write hands off to the conversation's nb_* confirmation flow.
- The embed aid is a same-origin iframe over a new opt-in webserver `/nocobase` prefix proxy (streaming forward, framing guards stripped, Host re-minted, 502 on unreachable). Live probing shows NocoBase 2.2.6 ships no framing headers — the B-report leftover #12 correction — so the strip is defense in depth; the plugin-embed token signing stays deferred (its server half is an empty plugin and no published embed pages exist to point at).

## Consequences

- The graph page renders real walks on every host (WebGL or list) and stays out of the main bundle; the theme ladder becomes the shared home for any future graph coloring.
- The business page's write path never grows UI state — record changes remain auditable conversations, and the embed entry degrades to a guidance link when the proxy origin is unset.
- kg-domain deployments must set both `kgEnabled` and `kgTenant`; a missing binding fails every kg method loudly instead of defaulting.

## Alternatives considered

- @react-sigma/core as the canvas wrapper: rejected for its low-frequency maintenance (risk V-R12) against a sub-fifty-line self-held wrapper.
- Continuous FA2 simulation with drag pinning: deferred until walks regularly exceed the ~500-node window (layout is not the bottleneck there).
- `nocobase.embedToken` signing into `/embed/<pageId>`: deferred until a deployment publishes plugin-embed pages; the proxy renders the admin root today.

## Evidence

- `pnpm vitest run packages/client/ui-kg packages/client/ui-business packages/host/webserver`: 59+3 tests green (jsdom degradation path, real-loopback proxy, the route-registration switch).
- `pnpm run typecheck` fully green; the kg domain's six touchpoints wired under the fetch pair's compiler lock.
