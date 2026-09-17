# @deepseek-ai/dsh-client-ui-assets

English | [中文](README.zh.md)

The data-asset market surface plugin: the sidebar's first-class entry (market icon + product-count badge), the `market` conversation view tab (the section portal — hero copy, product/provider/deal counters, the featured rail from the deployment's market seed file; the searchable catalog with kind chips; the asset detail panel with source/pricing/deliverable/expert pairs and the ask/cite conversation handoff), the order journey — the confirm card (read-only key/value pairs plus the single editable need-brief slot) → `orders.create` → the receipt with the order number, the status badge, and a view-order entry that scrolls to the orders section — and the 「我的订单」 section: every order over the open `orders.list` read, a 5-second poll while any row is `pending`/`generating` that stops once every row is terminal, and for delivered rows the in-page PDF preview (same-origin iframe over the inline download route) plus the attachment download. Ordering reuses the orders domain end to end; this plugin adds no write path of its own. All data rides the connection's `api.assets` face (plus `api.orders` for placement and listing); a deployment that has not opted into `assetsEnabled` shows the structured refusal inline.

## Model Experience

None, as a browser-side UI plugin layer the surfaces render gateway data and register nothing model-facing.

#### KV Cache effect

None: the surfaces render in the browser and never contribute to a model request; the ask/cite actions prefill the conversation draft through the composer.

## Known Limitations and Deferred Work

- The detail panel renders the discovery projection (identity, pricing, deliverable, expert affiliation, update date). Tabular sample rows and lineage would need a fetch with a tenant binding; they stay conversation-scoped until a detail-read API exists.
- The featured rail and hero copy come from the gateway's `assets.stats` seed file; without `assetsSeedPath` the rail renders empty and the portal keeps its locale copy.
- The receipt badge shows the creation-time snapshot; the orders section polls `orders.list` every 5 seconds while any order is `pending`/`generating` and stops once every row is terminal (or the tab unmounts), so asynchronous progression (approval → generating → delivered) is visible on the page itself; the conversation's order toolviews remain a second view. The poll has no retry ceiling: a long-pending order keeps polling every 5 seconds while the market tab stays visible.
- The catalog filter is client-side over the full `assets.list` result; server-side paging arrives with the first catalog too large to ship whole.
