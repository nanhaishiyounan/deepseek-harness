# Agent Note: W6-B2: the platform rule engine + alert center (four first rules)

Status: implemented

English | [中文](2026-10-02-w6-b2-alert-rule-engine.zh.md)

The W6 plan (plans/plan-w6.zh.md §B2) demanded one engine for "rule → task → notification" that B5/B9 reuse. Before this batch there was no alert surface at all: expiry/certificate/AR/quality facts lived in four business tables with nothing scanning them. The W6-R2 repair round (after the 16-dimension verification FAIL 70/100) closed the three-end claim loop, the gateway write channel, and the observability gaps; this note describes the corrected end state.

## Problem

Four domains each needed threshold alerts (lot expiry, supplier certificates, AR aging, quality abnormal) with no shared engine, no unified console, and notifications going nowhere.

## Decision

- **`examples/kb-agent/scripts/w6b2-rules.mts`** — the whole engine as one module with three entry points that share it verbatim: the engine's hourly serve loop + nightly `scan-alerts` leg + `POST /scan-alerts` (approval-engine.mts imports `scanAlerts`), and the CLI (`--seed/--scan/--act/--seed-ar/--assert`). A rule that throws fails alone: one `wfl_alert_scan_failures` audit row, the remaining rules still scan — one bad threshold no longer blinds all four domains.
- **Two collections + one intent table**: `alert_rules` (the configuration center — rule_type/params/route_to/enabled per row; every threshold is a row, never a code constant), `wfl_alerts` (the alert ledger), and `wfl_alert_acts` (the PC claim intent rows — the alert list's Add-new form writes them, a collection workflow forwards each to `POST /alerts/act`, and the engine consumes the row on success; the W1 intent-row pattern). The `wfl_` prefix rides the gateway's shared workflow surface, split by verb since R2: **reads** (list/get) stay shared, **writes** (update) refuse 403 by default with only explicit `nocobaseWflWriteScopes` entries admitted — the alert state machine has exactly one entrance, `/alerts/act`.
- **Four first rules** (hitsSelect per rule_type): expiry (wms_lots four dates × the dual-track threshold — configured warn_days vs the regulatory shelf-life tiers 45/20/15/10/3 days, whichever is earlier, plus the Odoo-style alert_date leg), cert_due (srm_certificates.expires_at), ar_overdue (approved so_orders balance = amount − received crm_payments, warning before need_date, critical after — B9's collection reminder reuses this), quality_abnormal (qm_nc_dispositions open rows, critical when the linked inspection has defect_critical > 0).
- **Idempotency**: `dedup_key` UNIQUE + one INSERT…SELECT…ON CONFLICT per rule — the same object stays one row, severity upgrades rewrite it, an object leaving scope auto-resolves (`resolved_by='system'`), a resolved row that re-hits reopens and re-notifies. R2 fix: the INSERT column list carries `reopen_count` (seeded 0) and the reopen leg uses `COALESCE(reopen_count, 0) + 1` — the column used to stay NULL forever, so a reopen flipped status without counting.
- **Notification**: notificationInAppMessages rows through the seeded `alert-center` channel (unread counts filter on channelName ∈ notificationChannels — an unseeded channel silently zeroes the badge, the trap this seeds away). One notification per severity level per row; routing expands `route_to.users` + departments through departmentsUsers (expiry→仓储部 incl. keeper, cert→采购部 incl. buyer, AR→finance/sales_rep, quality→质检部 incl. qc_inspector). R2 fix: a routed username with no users row never silently stamps — an audit row + warn log records the miss, `notified_severity` stays off, the next pass retries.
- **Handling actions**: `actOnAlert` (claim/ack/resolve) asserts the explicit `(from_state, action, actor_role)` transition table first (claim: routed user or admin; resolve: owner or admin; illegal triples move zero rows), then the conditional UPDATE re-pins status + whitelist under concurrency. Three entrances share it: the mobile row action over the gateway's `nocobase.alertAct` (identity from the B0 session token, never client-narrated), the PC intent form through its workflow callback, and the CLI.
- **Alert-center pages** (zero plugin-source changes): menu group 预警中心 + 预警列表 (four open-count stat cards + the tier-colored wfl_alerts table + rule_type/severity/status filter form + the claim-intent form) + 预警规则 (the live alert_rules config table; every change lands a `wfl_alert_config_audit` row through a PG trigger). member/admin/root granted view; member additionally gets view/create on wfl_alert_acts.
- **Mobile**: `listMyAlerts` + `AlertsView` (`#/alerts`) + the home quick chip 我的预警 (with its count badge). Since R2 the routed-user cut is the gateway's row scope (anonymous wfl_alerts reads refuse; a signed-in reader sees only rows whose notify_users carries them or owner matches; admin reads all) — the client no longer filters, and the in-row 认领/关闭 buttons ride `nocobase.alertAct`, surfacing the engine's 403 fact on refusal.

## Verification

`w6b2-rules.mts --assert` — ten legs all green: schema columns vs information_schema (the date-only discipline), four rules enabled, both tiers live per rule, the idempotency contract, the expiry reconciliation (engine rows == the hand-written four-date × dual-track SQL), threshold configurability (widening/restore with byte-exact config), notification landing + routing coverage, the transition-table refusals (unrouted claim, unclaimed resolve, non-owner resolve, claim on resolved — plus the reopen round with reopen_count=1), both pages + the claim-intent form + the callback workflow present, and the per-rule failure isolation (one bad parameter isolates its rule, audit row present, restore zeroes it). Evidence: demos/acceptance-w6/w6-b2-01…07 and w6-r2-01…07 (every named file verified on disk); recon SQL frozen at research/2026-10-01-w6-rework/b2/recon.sql. Gates: typecheck 0 errors, the relevant vitest suites green, oxlint staged over this batch's files 0 errors / 2 unused-disable warnings (the directives remain required under the full `.oxlintrc.json`; the staged config reports them unused — counted as-is, no "0 warnings" claim).

## Pitfalls pinned

- `notify_users` is a `json` column (collections:create type json), not jsonb — the `?` membership operator needs an explicit `::jsonb` cast; `round(x, 2)` needs `x::numeric` on double precision columns.
- The grid seats v2 blocks by insertion order: psql-rewriting `sortIndex` (1-4, 15-18, NULL — all three tried) never moved the stat cards above the table; the cards work (canvas 884×224 verified in the interactive browser) but render below the table. Left for the B10 heal pass — the 比价表 page seats its cards in a separate leading grid.
- Headless chrome (`--headless=new --disable-gpu`) never mounts the ECharts canvases on this page (0 canvases while the interactive DOM shows 4) — the stat-card evidence pair is the DOM probe (w6-b2-cards-dom.json) plus the flowModels block assertion, not a headless screenshot.
- The mobile bundle staleness had two layers: `build:lib:client` + `build:web` (vite) + :3080 restart — a restart without the vite rebuild serves the same hashed asset from the old build.
- `page_size` ceiling on the gateway's nocobase.list is 100 (zod) — a 200 page reads back as a bad-request, not a truncated page.
- The oxlint staged config and the full config rule sets differ: a disable directive kept for the full config reports "unused directive" under the staged gate — report each gate's count separately and honestly; never summarize with the staged run's zero.
- NocoBase json columns expose no array-membership operator in the gateway's filter vocabulary — the row-level scope lives in the gateway (post-read cut + restated count), with the psql twin (`notify_users ? username`) as the reconciliation.

## Reuse interfaces for B5/B9

`scanAlerts()` (with its isolated-failure list) / `actOnAlert()` (the transition table) / `scanState` (the healthz last_scan_at/last_scan_failures pointers) (w6b2-rules.mts exports), the `alert_rules` row shape (params/route_to/actions per rule_type; a new rule_type extends `hitsSelect` + a seed row), the notify leg's channel + severity-level dedup, and the `nocobase.alertAct` gateway method (B9's collection flow can reuse the same "token identity → single engine entrance" pattern).

## Alternatives considered

- **Per-domain alert scripts vs one rule table + one scan scheduler (ADR #3)** — the unified engine won: four domains configured from rows, thresholds/routing editable without code.

## Consequences

Cost: one more engine loop to operate. Bought: eight rule routes configured from rows, an idempotent alert ledger with audit, and hourly/nightly/on-demand scan parity.
