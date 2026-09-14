# Agent Note: CRM Portal absorbs the Hub domain modules

Status: implemented

English | [中文](2026-09-14-crm-portal-hub-domain-absorption.zh.md)

## Problem

The deployment ran two same-origin portal forks of one NocoBase demo template: the CRM Portal carried the sales pipeline, the Hub Portal carried nine operating domains (helpdesk, projects, hr, assets, inventory, finance, procurement, knowledge, home). Users had to keep two bookmarks, remembered which domain lived on which side, and the sales numbers on the Hub landing page read a different `hub_sales_*` dataset than the CRM pages. The acceptance ask was one main entry: the CRM Portal shape, with every Hub capability real (pages, forms, detail surfaces, dashboards), not just menu links.

## Decision

Each Hub domain lands in the CRM Portal as a byte-identical `pages/<domain>/` copy registered at three aggregation points — the `defineAppRoutes` module list in `src/routes.tsx`, the sidebar-group map plus priority overrides in `src/app/extensions.tsx`, and the starter-namespace locale merge in `src/locales/index.ts`. Batch order (G2 helpdesk pilot → G3 projects+hr → G4 assets+inventory → G5 finance+procurement+knowledge → G6 home) keeps every batch independently revertable; the Hub source tree stays frozen read-only as the diff oracle.

Deviations are recorded forks, each with a one-line reason in the file:

- `pages/inventory/routes.ts` — the inventory catalog nests under `/inventory/products` because the CRM-native price book owns `/products`.
- `pages/home/data.ts` + `quick-search.tsx` — the overview and global-search sales queries rebind to `crm_deals`/`crm_activities`/`crm_customers`/`crm_contacts`/`crm_leads` with field adapters (title→name, account→customer, subject→title), so the landing-page sales KPI equals the `/pipeline` numbers. The step-0 audit confirmed `amount` and the `stage` enum are name- and value-identical across the two deal tables, so no fallback branch was needed.
- `pages/home/module.tsx` — the overview resource takes priority -1 so it precedes every `crm_nav_*` group; the root `NavigateToAccessibleResource` lands on `/overview`, and the legacy sales dashboard stays at `/dashboard` relabeled 销售工作台 as a secondary entry.
- Six create forms (helpdesk ticket, asset, kb article, hr employee, inventory product, purchase order) mount the vendored `useAiEmployeeFill` panel, bringing the Portal roster to eleven formIds alongside the G3/G5 riders and the CRM-native pair.

Seed-side schema drift the copies exposed is healed idempotently in the seed scripts, never by editing the copied pages: `hub_as_assets` gains the portal sort column `tag` and ledger column `value`; `hub_as_maintenance.vendor` flips belongsTo→input because the template form posts free text; `crm_products` gains `active`/`unit_price`/`sku` and `crm_quotes` gains `quote_number`/`revision_note`/`createdAt` with backfills mirroring the seeded values; `crm/global-search.tsx` drops filter fields the seeded tables never had (customers `phone`, leads `email`, deals `title`→`name`).

The Hub Portal is retained but narratively downgraded: the n17 app hub rebuilds with the CRM card first (主要入口) and the Hub card as 模板参考, and QUICKSTART's portal sections now describe the CRM single entry. Physical retirement (deploy table, verify probes, gateway favicons, `hub_*` probe semantics, the n17 card, directory removal) is deferred to the next round with a six-item dependency list.

## The e2e locale seam

The vendored Playwright suites assert English UI, but this deployment pins `systemSettings.enabledLanguages` to `["zh-CN"]` on both layers (the verify gate locks it), and `app:getLang` echoes the signed-in user's zh-CN profile. Rather than rewriting 74 assertions or touching the pinned backend setting, the e2e dev server (`vite --mode e2e` only) pins the browser to en-US: the index document seeds `NOCBASE_LOCALE=en-US` before boot, and the two locale-deciding endpoints are patched in flight to report en-US. Production builds are untouched. `auth.setup.ts` follows the G6 landing change and asserts `/overview`.

## Alternatives considered

**One-shot full-tree copy.** Copying all nine domains in a single batch maximized merge speed but made the regression surface unreviewable; the per-batch revertability that later rounds relied on (each acceptance round found drift in its own domains) would not exist.

**Menu links into the live Hub routes.** Mounting the Hub pages behind CRM menu entries satisfies "one bookmark" but keeps the Hub build alive as a runtime dependency and never merges the data story; it is also exactly what the acceptance ask rejected ("not just menu level").

**Rewriting the migrated pages against CRM conventions.** Normalizing field names and shared components during the copy would have made every file a three-way merge against a moving Hub; byte-identical copies with named forks keep the Hub tree usable as the diff oracle and localize every deviation to a comment.

**Keeping the Hub sales domain as the overview data source.** The Hub landing aggregates `hub_sales_*`; leaving that wired would show "another sales team's numbers" beside the CRM pipeline. Decision A (rebind to `crm_*`) won because the field audit found identical names and enums; the fallback (demo-data tooltip or hidden card) stayed unused.

**Retiring the Hub Portal physically this round.** The deploy chain, verify probes, and gateway favicon rules still reference it; ripping them out while the migration was under acceptance would have invalidated the frozen-source oracle and broken user bookmarks mid-round. Narrative downgrade now, physical removal next round with the recorded six-item list.

## Consequences

The CRM Portal is the single main entry with ten domains, eight sidebar groups, a dashboard-style overview whose sales KPIs read the live `crm_*` tables, and eleven AI form-fill mount points; the Hub Portal remains reachable as a frozen template reference. The cost: two recorded route/source forks to keep in mind when diffing against Hub, a handful of seed columns that exist only because the template expects them, and a deferred Hub-retirement list. The e2e baseline returns to 59/22 — the schema-drift family is gone (no `column … does not exist` in the PG tail); the remaining 22 are pre-existing data-semantics/UI-shape assertions recorded in the acceptance logs, out of scope for column backfills.
