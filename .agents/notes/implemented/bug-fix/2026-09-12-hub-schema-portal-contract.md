# Agent Note: hub schema alignment — text-to-association migration and the portal's derived foreign-key contract

Status: implemented

English | [中文](2026-09-12-hub-schema-portal-contract.zh.md)

## Problem

The rebuilt demo-portal-hub pages failed with PostgreSQL `column ... does not exist` across 17 collections. Root cause: the portal treats NocoBase's **default derived belongsTo foreign-key names** as a hard contract — `singular(collectionName) + '_' + associationName + '_id'` (e.g. `hub_pj_tasks`→`hub_pj_task_assignee_id`, milestone's historical `hub_pj_ms_project_id`) — while the seed side had created every belongsTo with explicit short FKs (`project_id`) and had created `assignee`/`owner`/`category` as plain text input fields. Six whole tables the portal reads (`hub_pj_checklist`, `hub_kb_categories`, `hub_kb_article_feedback`, `hub_po_purchase_orders`, `hub_po_items`, `hub_po_suppliers`) had never been created. The CRM portal carried three siblings: two `dealId` filters on the deals drawer and the missing `crm_targets` table.

## Decision

### Three-state field migration, never destructive

`migrateTextFieldToAssociation` in `examples/kb-agent/scripts/nocobase-hub-modules.mts` converts a legacy same-name text field to a belongsTo under the portal's FK contract. Same-name fields cannot coexist in NocoBase, so the text column must be destroyed before the association is created; a `*_text` backup column (`assignee_text`/`owner_text`/`category_text`) preserves the original values first and stays as the rollback channel. The three observable states make every interruption point safe to re-run: `string` → backup + copy + destroy + create (the copy replays unconditionally — re-entry re-copies every row as an idempotent overwrite, so a run that died between the backup-column create and the end of the copy loses no un-copied row); field missing (a previous run died between destroy and create) → create only; `belongsTo` → kept. Foreign keys always take the portal's derived contract name, so no install ever re-derives a different one.

### One seed, two paths to the same end state

Fresh installs declare the associations directly (`HUB_CORE_COLLECTIONS`/`D1_PORTAL_COLLECTIONS` carry `belongsToUser('assignee', …, 'hub_pj_task_assignee_id')` and the six new tables), so `collections:create` builds the end state. Existing installs skip collection creation and reach the same shape through the migration step plus `ensurePortalFields` (plain `fields:create` = ALTER ADD COLUMN, plus backfills that read the `*_text` columns). Both paths share the terminal assertion: field type `belongsTo` and the FK name match the portal contract (probed by the `portalListProbe` wire replays in `setup-nocobase.mts`, where a missing column fails 400).

### Four legacy person names become password-less users rows

The migrated FKs need rows to point at. `ensureLegacyUsers` upserts the four names the text columns carried (陈立群/王一帆/林静怡/赵晓芳, usernames `chenliqun` & co.) with no password — they render through the `nickname` fieldNames everywhere the portal appends the association, and cannot sign in.

### CamelCase filter columns that cannot be associations

The CRM deals drawer filters `crm_follow_ups`/`crm_activities` by a camelCase `dealId`. A same-name belongsTo (`as === foreignKey === 'dealId'`) hits a Sequelize naming collision (`Naming collision between attribute 'dealId' and association 'dealId'`), and the `deal` association name is already taken by the seeded `deal_id` FK on activities. Bare integer columns satisfy the filter — the drawer never appends the association — and are backfilled from `deal_id` (activities) or the customer's first deal (follow-ups).

### Enum alignment appends, never rewrites

Six select fields carry a different vocabulary than the portal's filter dropdowns (maintenance `Preventive/Corrective/Inspection` vs `repair/inspection/calibration`, and five more). `alignPortalEnums` appends the portal's values to each `uiSchema.enum` without touching existing options or seeded row values; seeded rows keep their original vocabulary and the filters at least list every value the portal offers.

## Alternatives considered

**Re-seed with corrected values instead of migrating.** Rejected: the user's live database holds demo-period data the acceptance promised to preserve; `fields:create` + row backfill is lossless by construction, and the `*_text` columns keep a manual rollback path.

**Rename the existing `deal` association's foreignKey to `dealId` via `fields:update`.** Rejected: NocoBase would not rename the PostgreSQL column, leaving field metadata and storage divergent; a new bare column plus backfill is explicit and reversible.

**Full enum rewrite to the portal vocabulary.** Rejected: it would strand every seeded row's current value out of its own option list (labels vanish); appending keeps both vocabularies legible.

## Consequences

- The 17 misaligned hub collections and 3 CRM residuals align on the live database without reset: PG asserts `hub_pj_task_assignee_id`/`hub_pj_task_project_id`/`assignee_text` coexist, row counts unchanged (19 tasks), `assignee_text` retains all 48 original names, and the migrated FKs are fully backfilled.
- `setup-nocobase.mts` verify grows a D1 probe group replaying the exact portal wire requests (`?sort=-updatedAt`, `?sort=-views`, `?sort=-assigned_date`, `?filter={"hub_pj_task_assignee_id":1}`, the `dealId` filters, `crm_targets` period sort) plus row floors for the seven new tables — a missing column fails there, not in the user's browser.
- Portal screenshots (`examples/kb-agent/demos/acceptance-d1/`) show my-tasks rendering its empty state for Super Admin (the page used to 500), the procurement dashboard aggregating the new `hub_po_*` tables, and knowledge/assignments pages sorting.
- The four person rows and (from D2) nine AI employees appear in the users table without passwords — demo semantics, noted in QUICKSTART.
- Fresh-database installs (D6 reset) skip the migration step's conversions entirely (fields are declared as `belongsTo` from the start); the step logs `kept` on both paths.
