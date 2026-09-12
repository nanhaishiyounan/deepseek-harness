# Agent Note: Portal 400s — seeded schema must satisfy the portal front end's pinned sorters, and the four missing domains get tables

Status: implemented

English | [中文](2026-09-12-portal-schema-alignment.zh.md)

## Problem

Three failure classes hit the NocoBase portals at once (2026-09-11 live diagnosis). (A) The CRM portal's four list pages returned 400 — `crm_contacts:list?sort=name`, `crm_activities:list?sort=-date&appends=customer,contact`, `crm_leads:list?sort=-score&fields=score,source`, and `crm_quotes:list?sort=-issue_date&filter=is_current` all compiled `ORDER BY` over columns the seeded collections never had (`full_name`/`due_at` are the real names; `score`, `source`, `issue_date`, `root_quote_id`, `version`, `is_current`, `total` did not exist at all). The regression entered with c8eaf64e76 (N24 portal rebuild): the official portal front end hard-codes default sorters, column sets, and appended associations, and the seed schema was never widened to match. (B) The hub portal's inventory/sales/helpdesk/finance menus were dataless: the seeds never created those domain tables (16 including the association closure — `hub_inv_stock_moves` appends `product,warehouse`, so warehouses must exist too). (C) `crm_activities:query` 403 in the 09-11 capture.

## Decision

### Repair on the seed side; never edit the vendored portal source

The portal front end is an upstream fork pinned by the deploy script; the collections are ours. [`nocobase-crm-modules.mts`](../../../../../examples/kb-agent/scripts/nocobase-crm-modules.mts)'s `ensurePortalFields` (the N16-era same-shape precedent) gains the ten missing fields plus the `crm_activities.contact` belongsTo, and backfills them from semantic twins (`name` ← `full_name`, `date` ← `due_at`, `total` ← `total_amount`, `issue_date` ← `valid_until`) or deterministic distributions (lead scores 40–95 cycled, sources rotated over the portal's five-value enum, `is_current` true, `version` 1, `root_quote_id` self). The contact backfill writes the bare `contact_id` — comparing an appended association object would re-update every row every run and break the chain's idempotence contract.

### Field feasibility was verified against the live server before scripting

Plain columns plus `fields:create` were validated by hand first (`crm_contacts` → sort request 200), per the plan's first-step gate — no formula/virtual-field gamble, no portal fork edits, and the fallback path stayed unused.

### The hub domains get real tables with the pages' exact wire contract

[`nocobase-hub-modules.mts`](../../../../../examples/kb-agent/scripts/nocobase-hub-modules.mts) declares the four domains' 16 collections with enums mirrored from the portal's constants (`TICKET_STATUSES`, `DEAL_STAGES`, `INVOICE_STATUSES`, …), `belongsToUser` associations rendering `nickname`, a `hasMany` replies pair on `hub_hd_tickets`, and a declared `createdAt` column on every portal-sorted table — `collections:create` tables in this snapshot gain only `id` plus declared fields (the `hub_kb_articles.createdAt` precedent). Seeds live in the hub fixture; user-facing refs resolve against `users.nickname` through the existing refKey map. The m2o fieldNames backfill now labels users associations `nickname` (users has no `name` column).

### verify replays the exact wire requests

[`setup-nocobase.mts`](../../../../../examples/kb-agent/scripts/setup-nocobase.mts) verify replays the four pinned list requests (sort, fields, filter, appends), `crm_activities:query` with a legal measures/dimensions body, row floors for the eight primary domain tables, and one append representative per domain — a future schema drift fails the 400 here, not in the user's browser.

## Alternatives considered

**Formula/virtual read-only aliases.** Rejected after the hand check made plain columns provably sufficient; formulas add ORDER BY compilation risk for zero benefit.

**Editing the portal's default sorters.** Rejected: upstream fork churn, deploy-script coupling, and the seeded schema is the side we own.

**Degradation (known-boundary declaration) for the hub tables.** Rejected: the schema evidence was fully recoverable from the portal's TypeScript types and constants files, so the plan's escape hatch was unnecessary.

## Consequences

All four CRM list pages render with data and working default sorts (contacts 10 rows name-asc, leads 20 score-desc, quotes 12 filtered is_current, activities 10 date-desc); the hub domains show real rows (stock-by-warehouse 7, invoices 5 sorted by issue_date, deals/tickets boards carry the seeded cards). The 403 could not be reproduced post-rebuild — query returns 200 under the root token with a legal body — so no authorization step was added; the verify probe now guards the class instead. The `crm_quotes` portal columns are seed-owned display mirrors (`total` tracks `total_amount`), so future writes through the admin UI should set both; the conversation-first flow (`nb_*`) already writes the canonical columns. Gateway inode drift (class D) was cleared by restarting `:3080` (entities 1094 == disk) — `:3084` had already exited.
