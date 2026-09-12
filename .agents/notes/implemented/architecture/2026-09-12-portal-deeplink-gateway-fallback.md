# Agent Note: portal deep-link SPA fallback lives in the DSH gateway layer

Status: implemented

English | [中文](2026-09-12-portal-deeplink-gateway-fallback.zh.md)

## Problem

Opening or refreshing a portal deep link (`http://…:3080/nocobase/dist/hub/projects`) returned the NocoBase gateway's 404 body. The gateway's `/dist/` branch serves files with no rewrites, so a history-mode SPA route — a path that exists only client-side — is a file miss. The admin SPA fallback sits behind an earlier branch and never runs for `/dist/*`. The NocoBase snapshot offers no rewrites configuration for that branch; changing it would be a vendored-core local-modification, which the vendoring policy forbids. The portal itself cannot help: an SPA needs a server-side fallback by construction.

## Decision

Fix it at the only layer we own: the DSH webserver proxy (`packages/host/webserver/src/nocobase-proxy.ts`).

- `NOCOBASE_PORTAL_PREFIXES` (`/nocobase/dist/crm`, `/nocobase/dist/hub`) is the single wiring point; the `WebServer` constructor registers each as a prefix route ahead of the plain `/nocobase` route (longest-prefix match wins), so adding a portal is one entry.
- `createNocobaseProxyHandler` grows an `spaFallbackIndex` option; `createNocobasePortalHandler(origin, portal)` sets it to `/dist/<portal>/`. When the upstream answers 404 to a navigation request — GET/HEAD whose `Accept` includes `text/html` — the proxy fetches the portal entry instead and serves it through the same `rewriteNocobaseHtml` pipeline (the `NOCOBASE_PORTAL_BASE` re-root gives the SPA router its correct basename). Asset and API requests keep their 404; non-GET keeps its 404.
- The fallback path is the directory form `/dist/<portal>/`, not `/dist/<portal>/index.html`: the gateway's static handler cleanUrls-redirects the latter to the former (301), so the explicit-file form fails its own fallback.
- `/dist/*` 3xx responses with a root-absolute `Location` gain the `/nocobase` prefix — the symmetric opposite of the prefix the proxy strips on the way out, keeping redirect-following inside the proxy.

## Alternatives considered

**Configure rewrites on the NocoBase gateway.** Rejected: the snapshot's `/dist/` branch has no rewrite hook; patching the snapshot is a vendored-core local-modification.

**Portal-side hash routing.** Rejected: changes every portal route and link, breaks shared history with the deployed entry, and the portal fork mirrors the upstream template.

**Fallback for every `/nocobase` 404 navigation.** Rejected: the plain proxy also fronts the admin UI, whose own fallback semantics belong to the upstream; scoping to the two registered portal prefixes keeps the guarantee local and explicit.

## Consequences

- Deep links and refreshes render (`demos/acceptance-d3/`: my-tasks, kb-search, purchase-orders, crm/deals as hard navigations, zero page errors); `/nocobase/api/not-exist` and missing assets still 404; the bare `/nocobase/dist/hub` keeps answering 200.
- 15 webserver proxy tests (7 new: navigation GET/HEAD fallback, asset and POST passthrough, redirect re-rooting, per-portal index selection, wiring of both prefixes).
- A resident `dsh web` gateway needs one restart to pick this up (source launch; no build step).
