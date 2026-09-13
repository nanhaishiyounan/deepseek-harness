# CRM Portal absorbs the Hub domain modules (G-round mechanism)

- **Date**: 2026-09-14
- **Kind**: architecture
- **Scope**: `platform/nocobase-portals/demo-portal-crm` (Hub source stays frozen read-only)

## Context

The G acceptance round migrates the nine non-sales Hub domains (helpdesk,
projects, hr, assets, inventory, finance, procurement, knowledge, home) into
the CRM Portal so the CRM Portal becomes the single main entry. The two
portals are same-origin forks: 403 of 444 shared `src/` files are
byte-identical, both speak `@nocobase/portal-sdk/data` to the same NocoBase
REST backend, and the `@/*` tsconfig alias is symmetric — so a Hub domain
copies over unmodified and only needs registration at three aggregation
points (`src/routes.tsx` module list, `src/app/extensions.tsx` menu groups,
`src/locales/index.ts` translation merge).

## Decisions

1. **Copy-per-domain, register per batch.** Each `pages/<domain>/` directory
   is copied byte-for-byte; `defineAppRoutes` gains one spread entry, the
   sidebar group map gains the domain's resources, and the starter namespace
   gains the domain's `locale.ts` en-US/zh-CN pair. No internal rewrites;
   forked shared files (data-table, route-surfaces, header) are only merged
   when a migrated page actually needs the Hub-only capability, with the CRM
   version as the baseline.
2. **Brand fix was structural, not asset-level.** The D-round brand chain
   already made the five brand assets byte-identical; the visible divergence
   lived only in `Brand()` — CRM rendered wordmark XOR logo, Hub renders
   logo + divider + wordmark. Aligning the one function body fixed all three
   mount points (expanded sidebar, header, auth layout) with zero consumer
   changes.
3. **The vendored Playwright suites assert English UI, but this deployment
   pins `systemSettings.enabledLanguages` to `["zh-CN"]` on both layers (the
   verify gate locks it), and `app:getLang` echoes the signed-in user's
   zh-CN profile.** Rather than rewriting 74 assertions or touching the
   pinned backend setting, the e2e dev server (`vite --mode e2e` only) pins
   the browser to en-US: the index document seeds `NOCBASE_LOCALE=en-US`
   before boot, and the two locale-deciding endpoints are patched in flight
   (`systemSettings:get` gains en-US in its enabled lists, `app:getLang`
   reports `lang: "en-US"`). Production and the verify gate are untouched.
4. **First e2e run on this host exposed pre-existing schema drift, not
   regressions.** The user database's `crm_products` lacks the `active` and
   `unit_price` columns and `crm_quotes` lacks `quote_number` that the
   vendored portal code selects. Realigning those collections through the
   NocoBase fields API is a separate data-plane batch; the failing specs'
   data flow is untouched by the G1 change surface (visual brand, unreferenced
   new files, test-only config).

## Consequences

- Later G batches reuse the G1 table-kit copy verbatim (`@/lib/table-kit`);
  CRM's own `pages/crm/list-toolkit.tsx` stays until the H round unifies them.
- Every subsequent batch re-runs `portal tsc --noEmit`, the deploy double-run
  tree-hash check, `setup-nocobase.mts verify`, and the e2e suites with the
  known-drift failure list as the comparison baseline.
