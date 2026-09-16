# Agent Note: Five-domain tool surface — shared kg-nl, kg_query, assets_browse, full scenario mounting

Status: implemented

English | [中文](2026-09-16-j2-five-domain-tool-surface.zh.md)

## Problem

The thirty scenario presets mounted only the six tool-kb tools; the kg phrase compiler served only the graph page's search box (an apiproxy RPC, invisible to the model); the asset-market catalog had no model-facing tool at all; and the default persona's routing never mentioned the kg surface. Users asked for "knowledge base, lakehouse, data assets, connectors, business systems — ALL the data" and the conversation could not reach four of the five domains from a scenario session.

## Decision

**One compiler, two faces.** The kg-nl template compiler moved verbatim from apiproxy to `@deepseek-ai/dsh-kb-graph/kg-nl` (re-exported at the package root, which apiproxy now imports). The new `kg_query` tool in tool-kb and the `kg.query` RPC compile through the same function, so the RPC's behavior cannot drift from the tool's — the migrated kg-nl spec (assertions unchanged) locks both, plus a root-export assertion guards the re-export path the RPC resolves.

**`kg_query`** takes exactly `{ phrase }`. The plan's optional `hops` override was dropped: every template's plan defines its own hops, and an override would let a mismatched phrase silently change walk depth; the unsupported-phrase error names the shapes and points at the kg_schema + kg_subgraph fallback. Registration rides the tool-kb config (`kgQuery`, default true), so every composition that already mounts tool-kb — all thirty scenarios, both role presets, the host row — gains the tool with zero yml churn.

**`assets_browse`** lives in tool-connector as the market catalog's read-only face (`list`/`detail`/`stats`, one tool + action enum, the merge-direction the industry survey recommends). The data plane is the same `ctx.connector.discover` the gateway's assets domain rides — the plan's "extract a shared service from apiproxy" reduced to importing the seam both faces already share, because apiproxy's assets projections (asset views, featured rail, monthly orders) are UI-currency, not catalog data. `stats` counts per kind and provider; the featured rail and orders counters stay UI-only.

**Scenario mounting.** All thirty `agent.cordis.yml` files gained the tool-lakehouse, tool-connector, and tool-nocobase rows beside tool-kb (kg_query and assets_browse arrive via those rows), plus a persona boundary paragraph: scenario corpus first, cross-domain tools on demand, answers name the source domain. The scenarios snapshot moved from "6 kb tools" to "20 tools (five-domain)"; the kb-presets snapshot lists the default session's twenty. A static yml assertion in scenarios.spec.ts fails when a scenario loses any of the four plugin rows.

**Persona routing.** The default persona's dispatch line now routes entity-relation questions to `kg_query` (with the kg_schema + kg_subgraph fallback) and catalog overviews to `assets_browse`.

## Consequences

The system prompt of every scenario session grew by the mounted tools' schemas and `tool:*` sections — the persona boundary paragraph is the counterweight; J4 observes real-call quality and K can add grouped-tool prompting if the model scatters. The output schema DSL rejects map-shaped `additionalProperties: { … }`, so `stats` carries `kinds: [{kind, count}]` rather than an object map. Connector management and NocoBase workflow tools stay out by design (credential surface; confirmation-contract philosophy).

## Alternatives considered

**A `packages/assets/tool-assets` package** — rejected. One read-only tool over a seam another package already owns is not a capability seam; tool-connector is where the order tools already live for the same seam.

**Hosting assets_browse in apiproxy or the examples deployment layer** — rejected. apiproxy is the UI→BFF face (an AI tool there breaks the layering); the example has no TypeScript plane.

**Per-scenario tool subsets curated by persona** — rejected. Scenario isolation was already enforced through the focused persona and per-scenario corpora; tool curation doubles the matrix and re-opens the "cannot reach domain X" gap the round exists to close.
