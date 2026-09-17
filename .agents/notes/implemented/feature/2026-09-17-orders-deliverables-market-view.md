# Agent Note: Orders deliverables on the market page — polling orders section, inline PDF preview, receipt entry

Status: implemented

English | [中文](2026-09-17-orders-deliverables-market-view.zh.md)

## Problem

The in-session agent can place expert-service orders（`order_create`）and the market page can place them through the confirm card, but the PDF deliverable only landed under `workspace/deliverables/` on the host: the browser had no order list, no status progression, and no preview or download entry. The receipt badge showed the creation-time status, and a delivered PDF was reachable only through the host filesystem — no browser surface observed `pending → generating → delivered` or served the document.

## Decision

- The market tab renders a「我的订单」section over the open `orders.list` read（reads carry no `ordersEnabled` gate; writes keep theirs）. It polls every 5 seconds while any row is `pending`/`generating`, stops once every row is terminal（`delivered`/`failed`）, and stops on unmount: the interval lives only while the market tab is mounted, so a long-pending order costs one list read per 5 seconds only while the user is looking at the tab. The rows reference in the polling effect's dependency array restarts the cadence after every landed snapshot.
- PDF preview runs through the existing `/api/orders.download` route with an `inline=1` query parameter: same file, same filename, `Content-Disposition` switches `attachment` → `inline` so a same-origin in-page `<iframe>` renders the PDF inside the existing ui-primitives Modal. Both dispositions carry `x-content-type-options: nosniff` and `cache-control: private, no-store` — the transaction document never crosses a shared cache — and the route adds no `X-Frame-Options`/`frame-ancestors` restriction, which the same-origin preview depends on. The modal footer keeps the attachment direct link（`download`）and the inline URL opened in a new window（the degradation for platforms whose iframes cannot host a PDF viewer）.
- The receipt card carries a「查看订单」entry that scroll-into-views the section anchor（`#market-orders`）; a successful placement refreshes the orders cache beside the stats and catalog caches.
- The session's `order_create` toolview row carries the same jump: `order_create`'s presentation meta now projects `order_id` (always) plus `deliverable_path`/`deliverable_url` when present, and the row renders a「查看订单」entry — but only when the replayed meta carries a positive-integer `order_id` and the row settled `ok`. The entry rides the keyed toolview hole's registrant inject face (`requestView` over ui-kb's own `createKbViewBridge` instance) to switch the conversation view ring to `market`, landing on the section anchor; no publisher mounted (header actions absent) degrades to the bridge's documented no-op. The three identity fields of the meta stay strictly validated; the late `order_id`/deliverable fields are replay-tolerant — an older log without them keeps the receipt row and simply omits the entry, on both the tool-connector narrow and the ui-kb model narrow (the two narrows stay field-for-field in sync).

## Alternatives considered

- **Server push for order transitions.** The orders seam has no change feed; inventing one for a single-user local surface would add a broadcast contract to the seam for one list. Polling with a terminal-state stop bounds cost without touching the seam.
- **A separate preview route or a blob-URL preview.** The download route already streams the exact bytes and filename; disposition is the only difference, so one query flag keeps one route and one set of hardening headers.
- **Embedding NocoBase's storage url directly.** `deliverable_url` is storage-relative on the NocoBase deployment and unreachable from the browser origin; the gateway's route is the same-origin path that exists in every composition（including the fixture deployments）.

## Consequences

- A deployment without the orders seam degrades to the section's `ErrorStrip`（`orders-not-composed`）, consistent with the market's existing degradation; `ordersEnabled: false` keeps list/download working and refuses only placement.
- A long-pending order keeps the 5-second poll alive for as long as the market tab stays visible（no retry ceiling was set）; a terminal row set stops it, and the manual refresh stays available in every state.
- The section's polling is the browser-side progression view; the conversation's order toolviews remain an additional view, not the only one.

## Verification

- `packages/host/apiproxy/tests/orders-domain.spec.ts`: inline/attachment dispositions, the shared `nosniff`/`no-store` headers, and the GET/HEAD carrier route through `toFetchHandler`.
- `packages/client/ui-assets/tests/orderssection.client.spec.tsx`: state matrix, per-status row actions, the fake-timer poll cadence（5s tick, terminal stop, unmount stop）, and the modal iframe plus footer links; `marketview.client.spec.tsx`: the receipt→section scroll entry; `apply.client.spec.tsx`: `refreshOrders` on the view face and the post-placement refresh.
- `apps/web/tests/market-pages.e2e.ts`（keyless Chromium over the real composition）: `MemoryOrdersService` advances `pending → generating → delivered` on real timers and serves minimal PDF bytes; the journey asserts the section listing, the poll reaching 已交付, the inline response headers, the modal, the attachment download's `%PDF` bytes, and the manual refresh.
- `packages/connector/tool-connector/tests/tool-connector.spec.ts`: the executed `order_create` meta carries `order_id`/`deliverable_path`, and `orderCreateMetaFromResult` replays the pre-projection three-field meta. `packages/client/ui-kb/tests/ordertoolrow.client.spec.tsx`: the entry renders and calls `requestView('market')` on the current meta, and is absent on older replays and error rows. `apps/web/tests/order-tool-row.snapshot.ts` (keyless, built bundles): the fixture history session's two `order_create` turns pin both replay shapes, and clicking the entry mounts the market view with the `#market-orders` anchor.
