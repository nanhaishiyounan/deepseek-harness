# Agent Note: The NocoBase reverse proxy lives in the host webserver, with a WebSocket upgrade route

Status: implemented

English | [中文](2026-09-08-webserver-nocobase-proxy.zh.md)

## Problem

The kb-agent business page embeds the NocoBase admin UI in a same-origin iframe through a reverse proxy. Batches up to five put that proxy in `packages/host/webserver` (`nocobase-proxy.ts`), which the final unified verification flagged as a layering deviation: the webserver package declared itself as knowing no harness concepts and serving no files, yet it now proxies a business backend. Separately, the proxy rewrote the entry HTML's `__nocobase_ws_path__` to `/nocobase/ws` but only registered the HTTP prefix route — no upgrade route — so the iframe's NocoBase WebSocket handshake hit the HTTP handler, failed, and produced an endless reconnect loop in the browser console (HTTP polling masked it functionally, but the console-red-line dimension failed).

## Decision

### Placement: keep the business reverse proxy inside the host webserver

The `/nocobase` proxy is a route on the browser-facing HTTP server, not a harness concept: it forwards bytes and rewrites framing guards, and nothing it does reaches a model request or a session. The webserver already owns the exact machinery the proxy needs — named prefix routes, the upgrade registry with tracked upgraded-socket teardown, and longest-prefix matching — so a second server (or a separate proxy plugin owning its own port) would duplicate the carrier and force the iframe through a second origin. The ownership statement in the READMEs changes from "knows no harness concepts and serves no files" to "serves no files" plus an explicit enumeration of the one business route owned here. The proxy stays default-off: `nocobaseProxyOrigin` absent means no route is registered, because an unauthenticated gateway must not proxy a business backend unless a deployment opts in.

### WebSocket upgrade forwarding (`createNocobaseWsUpgradeHandler`)

Setting `nocobaseProxyOrigin` now registers both the `/nocobase` HTTP prefix route and the `/nocobase/ws` upgrade route in one effect (one disposer removes both). The upgrade handler replays the handshake headers (everything but `host`, plus `x-forwarded-host`/`x-forwarded-proto`), relays the upstream 101 status line and headers verbatim, writes any early frames from either side, then pipes the socket pair both ways. Either socket closing destroys its peer — without that linkage a half-open pipe leaves the peer waiting on a socket that never closes, which the integration test caught as a teardown hang. An upstream that answers the upgrade with a normal response (auth failure) gets its status line and headers relayed before the body streams through, so the iframe sees the real refusal instead of a dropped connection.

### Verification

`nocobase-proxy.spec.ts` boots a real `WebServer` (cordis composition, OS-assigned port) against a hand-rolled RFC6455 echo upstream — no new dependency — and asserts through a raw client socket: the 101 status line with `upgrade`/`connection`/`sec-websocket-accept` headers, the `sec-websocket-key` reaching the upstream intact, one masked frame echoing back through the proxy, and clean teardown of both servers.

## Alternatives considered

**Disable the NocoBase ws client in the iframe (rewrite `__nocobase_ws_path__` to a disabled value).** Rejected: it would silence the console errors by removing functionality, keep the polling fallback as the only channel, and bake a client-behavior assumption (that the disabled value is honored) into a server-side rewrite. The upgrade forwarding is ~50 lines on infrastructure the package already owns.

**A dedicated reverse-proxy plugin owning its own port.** Rejected: a second listen port for one route, a second origin for the iframe, and a second upgrade registry — all to preserve a README sentence that was easier to amend honestly.

**Fronting with a real reverse proxy (nginx/caddy).** Rejected for the dev-facing v1 posture the webserver already documents: the composition stays a single `node:http` process with zero external dependencies; deployment hardening remains deliberately out of scope.

## Consequences

- The webserver package owns one business route family, documented in its READMEs and config schema; anything further that smells like a business backend in this package should re-open this decision rather than accrete.
- The iframe's NocoBase WebSocket traffic rides the same origin and port as the app, closing the console reconnect loop; the polling fallback remains as a natural degradation if the upgrade path breaks.
- README ownership language had to change in both languages plus the package description; the "knows no harness concepts" claim is retired rather than worked around.
