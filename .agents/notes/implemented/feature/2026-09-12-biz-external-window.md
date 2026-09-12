# Agent Note: Business backend opens in a new window — the embed iframe becomes an external link card

Status: implemented

English | [中文](2026-09-12-biz-external-window.zh.md)

## Problem

The business tab embedded the NocoBase admin UI in an on-demand iframe at the page bottom ("advanced configuration" zone). The user rejected the embed outright: "业务管理nocobase业务平台打开的话，新窗口打开，不要嵌入到dsh里了" — open the business backend in a new window, do not embed it into DSH. The iframe was also the weaker surface in practice: a framed SPA with its own scroll, login wall, and a `ws` reconnect stream that surfaced as console noise inside the conversation page.

## Decision

### The embed zone becomes a semantic external link card; nothing else on the page moves

`BizView.tsx` drops the `embedOpen` state and the conditional `<iframe src="/nocobase/">`; the zone renders one `<a href="/nocobase/" target="_blank" rel="noopener noreferrer">` card — title, one-line hint (copy now states the new-window behavior), a `/nocobase/` URL readout, and a pill-shaped open affordance. A real anchor keeps middle-click, Cmd+click, and copy-link-address working, and `rel="noopener noreferrer"` is mandatory. The conversation-first management body (collection switcher, entity cards, table view, ask bar) is untouched — the scope confirmation was explicit: only the embed goes.

### The reverse proxy stays; its purpose changes from same-origin framing to same-origin entry

The webserver `/nocobase` proxy, the `nocobaseProxyOrigin` config, the `/nocobase/ws` upgrade route, and the apiproxy `nocobase.listMeta/list` data plane are all kept. The new window still resolves `/nocobase/` through the gateway, so the admin UI rides the gateway's domain: the login cookie set inside DSH keeps working, no CORS surface appears, and remote deployments keep one origin to expose. Removing the proxy would buy nothing and cost the HTML/plugin-manifest rewrites plus login-state continuity. JSDoc and READMEs restate the proxy's purpose as the new-window same-origin entry; the framing-guard stripping behavior is unchanged (harmless without a frame, and removing it would churn the proxy spec for no user-visible gain).

### The link contract is pinned in the client spec

`bizview.client.spec.tsx` asserts the page renders no iframe and the link carries `href="/nocobase/"`, `target="_blank"`, and both `noopener` and `noreferrer` in `rel`. The locale key `embed.frameTitle` (an iframe-only attribute) is deleted; `embed.open`/`embed.openHint` copy now names the new-window behavior in zh and en.

## Alternatives considered

**Keep the iframe behind a collapsed toggle.** Rejected: the user's phrasing rejects embedding as a shape, not its default visibility.

**Direct link to `NOCOBASE_BASE_URL` with config hand-down.** Rejected as out of scope (PLAN §5): it needs a new config surface, breaks login-state continuity with the DSH domain, and buys nothing over the same-origin entry for the local deployment this product ships.

**Drop the reverse proxy entirely.** Rejected: the new-window entry depends on it for same-origin serving; the data plane (`nocobase.listMeta`) shares the route.

## Consequences

The business tab contains no iframe, so the framed-SPA scroll jank, double login prompts inside a conversation page, and iframe-origin 404s disappear; the admin UI becomes a full-window experience. The `/nocobase` proxy and its tests are untouched — behavior identical, docs reworded — so the web-server surface carries zero regression risk. `docs/subsystems/web-server.md`, its zh pair, `docs/config-catalog.md`, both ui-business READMEs, and QUICKSTART.zh.md now describe the external entry; the archived 2026-09-08 proxy note stays frozen and this note records the purpose change in the timeline. The `ws` reconnect noise the iframe produced leaves the conversation page with it (the new window owns its own socket lifecycle).
