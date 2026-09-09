# Agent Note: NocoBase :13000 dual-entry shape — built artifacts serve the full UI, dev-server unchanged

Status: implemented

English | [中文](2026-09-08-nocobase-full-ui-dual-entry.zh.md)

## Problem

Opening http://127.0.0.1:13000 showed a 404 shell, and the business page's iframe was equally dead — "NocoBase itself must be usable, not just the dsh entry." Investigation: the dev-server's gateway (the `gateway/index.ts` requestHandler in the `platform/nocobase` snapshot's server source) already serves every non-`/api/*` request from the app package's `dist/client` build output (SPA rewrite to index.html); `:13000` was API-only because **that client output had never been built** (`no dist (never built)`). The iframe had three further independent breaks: the built index.html hardcodes every asset (`/assets/*`, `/global.css`) and runtime base (`__nocobase_public_path__='/'`, `__nocobase_api_base_url__='/api/'`) at the origin root, which 404s inside the iframe's origin (the DSH web port); requirejs loads plugins at the root-absolute `url`s of the `/api/pm:listEnabled` manifest (same 404, `Script error for "@nocobase/plugin-acl"`); and NocoBase's sign-in origin check (`isTrustedOrigin`, core/auth) compares the request Origin against the origin derived from `x-forwarded-host`/host — without the proxy declaring the forwarded source, signIn always fails 403 "Invalid sign-in origin".

## Decision

### Shape: `yarn build` artifacts + keep `yarn dev-server` as the launcher (no dev-all switch)

With the artifacts in place, :13000 serves the full UI and `/api/*` from one port: the REST track (connector-nocobase, expert-orders, the apiproxy nocobase domain, demo scenarios 2/3) changes nothing and gains no proxy hop; `start` is ready in seconds (artifacts are DB-independent, `reset` keeps them); behavior matches the official docker production shape. Dev-all mode (`yarn dev`) was rejected: the client rsbuild owns :13000 and proxies the API to a :13001 server — the whole REST track rides a proxy hop (edge risk for SSE/uploads), the first open waits on compilation (minutes), and three processes plus two watchers stay resident; using the system (rather than developing NocoBase plugins) needs no HMR.

### Setup script (examples/kb-agent/scripts/setup-nocobase.mts)

A new `build` step: idempotence marker is both `dist/client/index.html` and `dist/client/v/index.html` existing (legacy shell + modern client); `NOCOBASE_FORCE_BUILD=1` rebuilds anyway. The `all` chain becomes install → build → start → init → verify; `verify` asserts the full UI (`GET /` 200 html containing `__nocobase_public_path__` — not the 404 shell); `start` warns toward build when the artifacts are missing (REST still works; no failure). Measured full build ~23 min (per-package dts + tsup + two rsbuild passes; the client stage alone 1290s).

### Three iframe-proxy fixes (packages/host/webserver/src/nocobase-proxy.ts)

- `rewriteNocobaseHtml`: buffer and rewrite the HTML entry — `(href|src)="/x"` gains the `/nocobase` prefix (protocol-relative `//` untouched), and `__webpack_public_path__`/`__nocobase_public_path__`/`__nocobase_api_base_url__`/`__nocobase_ws_path__` re-root, so in-frame fetches, lazy chunks, and API calls all ride the proxy; content-length is recomputed.
- `rewriteNocobasePluginManifest`: a structural rewrite applied only to the JSON response of `/api/pm:listEnabled` (`data[].url`/`clientV2Url` prefixed when root-absolute); anything else passes through untouched — the module loader's URLs come from that one manifest, and no other surface emits root paths (the HTML is rewritten; the API base is re-rooted).
- Forward `x-forwarded-host` (the original request host) and `x-forwarded-proto: http`: standard proxy semantics; NocoBase's `getRequestOrigin` resolves same-origin from them, taking signIn from 403 back to 200. The request side strips `accept-encoding` (the rewrite needs plain text; the loopback cost is negligible).

### i18n template-title unwrap (`unwrapNbTitle` in connector-nocobase/src/client.ts)

System collections (roles/users) carry titles like `{{t("Roles")}}` that the NocoBase frontend renders through its translator; DSH has no translator, so the raw template leaked into the business-object switcher and nb_collections output. The unwrap matches only the exact template form (`{{t("X")}}` → `X`); other titles pass through. The apiproxy listMeta projection and tool-nocobase's collectionCards share the one function.

## Alternatives considered

**Rebuild with `APP_PUBLIC_PATH=/nocobase/` (NocoBase sub-path deployment).** Rejected: it needs a 20-minute rebuild under that config plus matching server runtime, moves `/storage/uploads` and other storage paths under the prefix (a REST and attachment-URL regression surface), and changes the direct `:13000` experience (root redirect). The proxy-side rewrite touches only the low-frequency iframe surface; direct `:13000` and REST stay untouched.

**`CORS_ORIGIN_WHITELIST` admitting the DSH port.** Rejected as the primary fix: the whitelist would drift with the configurable DSH web port (another deployment coupling), while `x-forwarded-host` states what a proxy should state anyway and holds for any port.

**Cross-origin iframe straight to :13000 (no frame-guard headers, renders fine).** Rejected: sign-in state rides third-party cookies, unreliable under Chrome defaults.

## Consequences

- `GET /` (effective immediately once artifacts exist — no dev-server restart needed) returns the full shell; after signing in as admin@nocobase.com/admin123 the workflow admin, manual-task todos, collections admin, the fields drawer, and UI Editor page creation all work (screenshots examples/kb-agent/demos/nocobase-ui/ 01–07).
- The DSH business-page iframe boots the full NocoBase, signs in, and renders a data page (screenshot 08); `/nocobase/api/pm:listEnabled` and the HTML entry both answer under the `/nocobase` prefix; the signIn probe went 403 → 200.
- The five-scenario demo passes on the real track (REST rides no new proxy hop); 128 partition tests green (covering the HTML/manifest rewrites, title unwrap, and non-HTML passthrough).
- A resident DSH web instance needs one restart to pick up the proxy fixes and the title unwrap (the running :3080 is user-managed).
- Leftover: a UI-Editor-created table's column values did not render (built-in schema pages like Users render fine) — NocoBase-snapshot frontend behavior; recheck on the next snapshot upgrade.
