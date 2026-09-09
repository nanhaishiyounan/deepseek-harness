# Agent Note: NocoBase demo-grade modules and portals — programmatic page blocks, portal field alignment

Status: implemented

English | [中文](2026-09-09-nocobase-demo-grade-modules-and-portals.zh.md)

## Problem

The NocoBase snapshot served the five expert-dataset collections with a single hand-built page. The official demo carries eight business modules, four task views, AI employees, and standalone portal front ends. The gap was crossed with three decisions worth recording because the tempting alternatives fail on this 2.2.6 snapshot.

## Decision

### Page blocks are inserted by REST, not configured in the browser

The plan's dual-track strategy expected browser-side block configuration with programmatic groundwork. In practice the v2 client under `yarn dev-server` renders a fresh page only after a long plugin-chunk warm-up, and DOM queries racing the re-render made browser automation unreliable (pages flapped between rendered and empty while screenshots showed content). Everything ended up programmatic:

- Table/kanban/calendar/gantt block trees reuse the wire shapes already proven inside the snapshot (the hand-built experts table, the official plugin e2e templates) and go in through `uiSchemas:insertAdjacent` on each page's Grid child.
- Idempotency is per block kind: a page keeps its blocks when the Grid already carries the configured block count/component; seeds upsert by business unique key; menus match by title.
- Two wire traps are now encoded in the scripts rather than folklore: single-select fields are `type: string` + `interface: select` (the DB layer has no select type), and a column node named `type` collides with the JSON-Schema keyword and silently renders an empty table.

### Portal front ends are kept stock and the backend grows alias fields

The X-Portal/portal-sdk-2.1.0-on-2.2.6 risk from the plan never fired: login rides the same-origin basic authenticator cookie and REST flows straight through. The real gap was field naming — the portals aggregate `crm_leads.status`, `crm_customers.company_name`, `crm_deals.stage/expected_close_date/closed_date`, `hub_pj_tasks.due_date`, `hub_kb_articles.createdAt`, and friends, while the admin-facing models use different names. Rather than forking the portals (unmaintained drift) or renaming the admin fields (breaks the admin pages and the seeded fixtures), each module script gained `ensurePortalFields`: add the portal-named columns and idempotently backfill them from the admin-named values. Both vocabularies coexist; `crm_deals` deliberately carries both a fulfillment `status` (admin semantics) and a pipeline `stage` (portal semantics) because they answer different questions.

### The setup chain replays modeling, not portal builds

`setup-nocobase.mts all` now runs the two module scripts as child processes after `plugins`/`ai`, so a wiped database restores the full feature surface from REST alone. Portal artifacts are **not** rebuilt in the chain: they are static build products of vendored checkouts (`platform/nocobase-portals/`, upstream commits recorded in the batch log), deployed by `nocobase-portal-deploy.mts` and only probed (`/dist/crm|hub/` HTML reachability) by `stepVerify`. Rebuilding vite bundles on every `all` run would couple the database bring-up to network-dependent installs for no replay value.

## Alternatives considered

**dump/restore of demo data.** The version downgrade path is forbidden and no official dump exists; the plan already ruled this out.

**Forcing the official four-tab Tasks page.** Tab wiring is interactive-only; four sibling pages deliver the same view set through the stable programmatic path (recorded as a batch deviation).

**Forking the portals or renaming admin fields.** A fork drifts from upstream unmaintained; renaming breaks the admin pages and the seeded fixtures. Alias columns plus backfill keep both vocabularies alive at lower cost.

**AI employee custom prompts / workflow LLM nodes.** Optional enhancements outside the acceptance anchors; not taken.

## Consequences

The full feature surface (menus, pages, blocks, seeds, portals) restores from REST-only replays, and browser flakiness never gates the bring-up. What it cost: browser-configured chart dashboards (echarts config is interactive-only) — the two CRM dashboards ship with table bases instead, recorded as a deviation in the batch log. Batch evidence and per-page screenshots: [01-batches.md](../../../../plans/nocobase-full-features/01-batches.md) · plan [PLAN.md](../../../../plans/nocobase-full-features/PLAN.md).
