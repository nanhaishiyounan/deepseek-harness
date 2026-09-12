# Agent Note: Portal AI icon repair — window.NOCOBASE_PORTAL_BASE is a runtime define, not just a build flag

Status: implemented

English | [中文](2026-09-12-portal-base-runtime.zh.md)

## Problem

The CRM/Hub portals' floating AI-employee ball rendered a blank icon: its `<img>` resolved to `http://<origin>/assets/nocobase-ai-chat-*.svg` — the origin root — which the NocoBase gateway answered with the SPA's HTML fallback (HTTP 200, `text/html`), so `naturalWidth` stayed 0. The plan pinned the cause on `nocobase-portal-deploy.mts` building without `NOCOBASE_PORTAL_BASE`, and that was half right: the missing env does break the build's static references, but injecting it and rebuilding did **not** fix the ball. The deployed bundle resolves the icon through vite's runtime asset mechanism, and the emitted code reads `new URL(path, new URL(window.NOCOBASE_PORTAL_BASE || "/", window.location.origin))` — a **window global at page load**, undefined in the entry HTML, so every dynamically-resolved asset fell back to `/` regardless of the build-time base. The same batch whitelabels the admin surface (logo, site title, favicon) within the OSS license boundary.

## Decision

### Deploy-time injection on both channels: build env and entry-HTML global

`nocobase-portal-deploy.mts` now passes `NOCOBASE_PORTAL_BASE=/dist/<portal>/` into `pnpm build` (vite rewrites the static references in HTML) and, after copying dist into the gateway's `dist-client`, injects `<script>window.NOCOBASE_PORTAL_BASE="/dist/<portal>/"</script>` at the top of `<head>` so the runtime `new URL` chain resolves under the prefix. The injection is a post-build artifact edit — the vendored portal source stays untouched (the snapshot's local-modifications table stays empty). Verified live: `window.NOCOBASE_PORTAL_BASE === '/dist/crm/'`, the ball's src becomes `/dist/crm/assets/nocobase-ai-chat-*.svg`, and the image loads (`naturalWidth` 878); both portals' icon URLs serve 200 + `image/svg+xml`.

### The whitelabel logo lives in public statics, not the attachment store

The first cut uploaded the SVG through `attachments:create` and pointed `systemSettings.logo` at the attachment row. That works for signed-in sessions but the store's ACL refuses anonymous reads — and the login page renders the logo before any session exists. The final shape reuses plugin-system-settings' own install fallback: `systemSettings.logo` carries a plain object (`{ title, filename, extname, mimetype, url }`) whose url is `/dsh-brand-logo.svg`, a file the brand script overlays into the built client's root after `yarn build`. Same overlay step replaces `favicon/favicon.ico` and the `nocobase.png` fallback, byte-compared so rebuilds (which restore the official assets) and reruns converge; the `all` chain replays the script, so reset restores the brand automatically.

### Brand assets and license boundary

The mark is an original SVG (rounded square in DSH brand blue `#4176E6`, a white leaf whose tip grows into a three-node knowledge cluster — the food-industry KB+agent promise), sourced in `examples/kb-agent/workspace/assets/brand/` with a compact favicon cut and derived `.ico`/`.png`. The site title is `DSH食品业务平台` per the repo's brand guidelines (the DSH short mark, never the full trademark). LICENSE §5.2 scopes OSS whitelabeling to the top-left main logo; the footer "Powered by NocoBase" and other brand marks stay, and the QUICKSTART whitelabel section carries the boundary statement.

## Alternatives considered

**Build-time base only.** Rejected by evidence: the ball's URL is computed at runtime against the window global; the build flag alone left it broken.

**Portal-source edit to hard-code the prefix.** Rejected: upstream fork churn for what a generated-artifact injection achieves without touching vendored code.

**Attachment-backed logo with an ACL rule change.** Rejected: the plain-object shape is the plugin's own no-file-manager precedent and needs zero permission surgery.

## Consequences

The floating AI ball renders on both portals (previously blank on every page that mounted it); the admin sidebar, login heading, document title, and favicon carry the DSH brand; a `yarn build` of the NocoBase client no longer erases the overlay silently — the `all` chain and verify re-assert it (favicon content-type, logo SVG fetch, systemSettings title/logo, per-portal icon URL + content-type are all pinned in the verify assertions, so drift fails the chain). The verify icon probe locates the hashed asset in the deployed directory rather than the entry HTML — the ball imports it at runtime, so HTML scraping produced false negatives. Portal deep links still 404 on direct navigation (known boundary, unchanged).
