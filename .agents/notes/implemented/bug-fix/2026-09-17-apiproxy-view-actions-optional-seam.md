# Agent Note: apiproxy view-actions as an optional seam — no provider without a browser face

Status: implemented

English | [中文](2026-09-17-apiproxy-view-actions-optional-seam.zh.md)

## Problem

`createApiProxy` registered a view-actions provider unconditionally, and `ApiProxyService` declared `'viewActions'` in its static `inject`. Vendored Cordis inject entries are all required ("it only loads while all are available", [vendor/cordis/src/registry.ts](../../../../vendor/cordis/src/registry.ts)) — there is no optional syntax. Two consequences:

1. Keyless harnesses that compose the proxy directly without a browser face (`examples/kb-agent/tests/market-pages.spec.ts`, `examples/kb-agent/tests/data-routing.spec.ts`) crashed at construction: `ctx.viewActions` is `undefined` and `.registerProvider` throws.
2. Any composition mounting the gateway without the view-actions service would leave `ApiProxyService` waiting forever, silently without an HTTP surface.

## Decision

Treat the seam as optional, mirroring the in-file `ctx.get('approval')` precedent ([api-proxy.ts](../../../../packages/host/apiproxy/src/api-proxy.ts)): the provider registration moved into a `ctx.inject(['viewActions'], …)` sub-fiber inside `createApiProxy`, and `'viewActions'` left `static inject`. The sub-fiber registers the provider whenever the service is available — assembly row order carries no load semantics, so a service mounted after the gateway still activates the fiber — returns a disposer that unregisters the provider and settles pending applies as `APPLY_ABORTED`, and stays pending forever in a browser-less host, where `view_apply` reports `NO_PROVIDER` from the service itself: the honest answer for a session with no browser.

## Alternatives considered

**Mount ViewActionService in the two harnesses.** Rejected: it papers over the real boundary — a pure API session has no view surface, and the harness composition is legitimate as written.

**A synchronous `ctx.get('viewActions')` null-check at construction.** Rejected: activation is service-availability driven with no row-order guarantee, so the gateway could activate before the service mounts and never register.

## Consequences

Fiber `_reload` runs its callback one microtask after `ctx.inject` when the service is already present, so every harness that awaits `ctx.plugin(ViewActionService)` before `createApiProxy` still observes the provider registered before first use. A service restart unloads the sub-fiber and re-registers the provider with no `DUPLICATE_PROVIDER` window: the fiber disposer unregisters first.

## Testing

apiproxy package 445 tests / 27 files green; both kb-agent harnesses green; full `pnpm run test` green.
