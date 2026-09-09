# Agent Note: Data-asset market page + connector page (V5): BFF domains, order confirm card, delivery timeline

Status: implemented

English | [中文](2026-09-07-market-and-connector-pages.zh.md)

Date: 2026-09-07 · Scope: packages/host/apiproxy, packages/client/ui-assets, packages/client/ui-connectors, examples/kb-agent

## Problem

The V5 page wave (plans/nocobase-native-integration/02-design.md §3.1/§3.2 and 03-batches.md's V5 section) asked for the two conversation-view tabs and their gateway domains, with zero parallel write paths: the market page (portal, catalog, detail, ordering through a confirm card) and the connector page (provider catalog, delivery tracking, connect guidance), all data through BFF read surfaces with writes reusing the orders domain.

## What landed

- **`assets.*` gateway domain** (`assets.list/detail/stats`): read-only projections of the connector seam's discovery (dataset + expert-service cards with pricing/deliverable/service ids), counters over discovery + the optional orders seam (this-month deals), and the featured rail from the deployment's market seed file (`assetsSeedPath`; absent = no rail, broken file fails loud with `assets-rejected`). Ordering itself stays on `orders.create` — the confirm card hands over the `service_id`; no market write surface exists.
- **`connectors.*` gateway domain** (`connectors.list/connections/transfers`): the seam's provider registry with live availability (`describeProviders()`, new on the connector seam) and the delivery trail from the lakehouse catalog (`listTransfers(limit)`, new on the lakehouse seam + SQLite store + memory fake). No lakehouse seam reads as empty — the catalog-only degradation from the design's state matrix, not an error.
- **`ui-assets`**: sidebar entry + `market` tab (order 11) + session-header bridge. Three layers per the design — portal (hero copy, counters, featured rail, tag cloud), catalog (search + kind chips, client-side filter over the full list), detail (source/pricing/deliverable/expert pairs). The order journey is the AI-interaction contract: confirm card = read-only key/value pairs + the single editable need-brief slot + confirm/cancel; receipt shows order number + status badge and survives the post-order refresh (see the fix below). Ask/cite prefills the composer and switches to the chat tab.
- **`ui-connectors`**: sidebar entry + `connectors` tab (order 12). Provider catalog with healthy/credentials-missing copy, per-provider delivery aggregates, run timeline with destination labels, and the connect guidance as a pure conversation handoff (draft prefill + chat switch — no form anywhere on the page).
- **Composition**: web-app bundle roster carries both packages (browser rows + dependencies); `examples/kb-agent` opts the gateway in (`assetsEnabled`/`connectorsEnabled`/`assetsSeedPath` → `workspace/data/market/seed.json`, committed corpus). Seed copy lives in data, not code.

## Decision

- **Ordering reuses the orders domain, period.** The confirm card is presentation (args-pure over the asset row); placement is `orders.create`, receipt state is the creation snapshot. No order polling client-side: progression stays visible through the conversation's order toolviews — the design's asynchronous state card lives in the session, not in the tab.
- **The receipt must survive the refresh.** Placing an order refreshes both caches; the catalog reload clears the selected asset, and the receipt originally rendered inside the detail branch — the placed order's outcome vanished even though `stats` counted it (caught live in the browser e2e). The receipt now renders at the tab's top level: the journey's outcome is not the detail panel's child.
- **Delivery reads degrade, catalog reads fail loud.** `connectors.list` without the connector seam is the structured `connectors-not-composed` refusal; `connections`/`transfers` without the lakehouse seam answer empty. This matches the design matrix's "transfer records missing = catalog-only" row and keeps a seam-optional deployment browsable.
- **Provider observability needed a seam read.** `providerIds()` existed but hid availability; `describeProviders()` projects id + `available()` + capabilities for the catalog. An unavailable provider renders with the credentials-missing explanation instead of disappearing (the design's degraded-discovery stance applied to the catalog).
- **Transfer reads needed the catalog read API.** The SQLite store's README held "no transfer-record reads — a listing API waits for the consumer that needs it"; the connector page is that consumer. `listTransfers(limit)` (newest first) landed across the interface, the SQLite store (`select-transfers.sql`), and the memory fakes.
- **`assets-not-composed` vs `assets-connector-missing`.** The opt-in gate (like `ordersEnabled`/`nocobaseEnabled`) is separate from the seam-presence refusal; deployments see which knob to turn. Seven new wire error codes, discriminated-union entries in `rpc.schema.ts`.

## Build-plane fix that the batch forced

A clean `build:lib:host` never emitted `dsh-lakehouse`'s subpath bundles (`lib/data-router.js`, `lib/tabular.js`) — the root tsdown entry glob covers only `{index,invariant,startup}`, so any built consumer importing the published subpaths (apiproxy's lib always did) only worked while stale artifacts sat on disk. Removing `packages/lakehouse/lakehouse/lib` made it permanent. Fix: a package-local `tsdown.config.ts` declaring all four runtime entries (the `core/scope` pattern). This is repo build hygiene, not a V5 feature — flagging it here because the web e2e lane is what surfaces it.

## Alternatives considered

- **A parallel market write surface** (`assets.order`): rejected — the orders domain already owns placement, approval, and the deliverable pipeline; duplicating any slice would fork the state machine the workbench toolviews render. The confirm card hands `orders.create` the service id instead.
- **Registering the market/connector cards under `tool.call.toolview`** (the design doc's "market card and tool row dual presentation"): deferred — the `connector_discover` key already renders ui-kb's ConnectorToolRow; a second registrant on the same key is a conflict the slots list does not resolve, so the market consumes discovery through `assets.list` and the tool row keeps its own presenter.
- **Polling the order status inside the receipt card**: rejected — progression (pending → delivered) is already visible through the conversation's order toolviews; a tab-local poll adds a second liveness channel for one consumer. The receipt pins the creation-time snapshot.
- **A dedicated transfer-events domain** instead of reading the lakehouse catalog: rejected — the catalog's append-only trail is the confirm step's own receipt; a parallel events table would need its own write hook in every transfer path. `listTransfers` projects what the seam already records.

## Consequences

The market and connector tabs now ship in the default web bundle: every dsh web deployment renders them (empty-state guidance until the gateway domains are opted in), and the `market`/`connectors` view ids plus sidebar orders 6/7 are load-bearing composition facts later pages (kg order 13, business order 14) will slot after. The lakehouse seam now carries a read API the catalog README had explicitly deferred to "the consumer that needs it" — the connector page is that consumer, and the SQLite store grew `select-transfers.sql` accordingly.

## Verification map

- Unit: `assets-connectors-domain.spec.ts` (8 cases: projections, detail/missing, stats + seed, opt-in/seam refusals, degradation); lakehouse `listTransfers` (runtime + SQLite store); connector `describeProviders`; ui-assets/ui-connectors client specs (21 cases: four-state matrices, filtering, confirm-card walk, receipt, conversation handoffs).
- Keyless snapshot: `examples/kb-agent/tests/market-pages.spec.ts` renders both wire faces as markdown goldens over the real seams (connector-file + memory lakehouse + the example's own seed), plus the not-composed refusals.
- Browser e2e (built lane): `apps/web/tests/market-pages.e2e.ts` — real Chromium over the shipped composition + in-process seams walks market browse → detail → confirm card → receipt → counter refresh, and the connectors catalog/aggregate/timeline/wizard handoff (3/3 green locally).
- Real-track e2e: `examples/kb-agent/tests/market-track.e2e.ts` — live NocoBase: seeded catalog projects with pricing, `orders.create` lands a pending row, a real tabular transfer lands in the lakehouse and the trail reads back (3/3 green; self-skips without the backend).

## Known gaps (deliberate)

- Detail samples/lineage stay conversation-scoped (needs a tenant-bound fetch API); catalog paging is client-side; receipt status is the creation snapshot; the connect wizard is the conversation handoff only. Each is recorded in the package READMEs' deferred-work sections.
- The three kb-workbench upload cases fail on this machine's browser lane regardless of this batch (verified by re-running them with the two new roster rows removed — still red); CI's Linux lane owns that signal.
