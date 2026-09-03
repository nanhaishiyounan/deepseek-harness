# Agent Note: kb workbench hardening — design tokens, fixed panel placement, deployment single-source tenant, write opt-in, embed-fault degradation

Status: implemented

English | [中文](2026-08-30-kb-workbench-hardening.zh.md)

## Problem

The verification's Important findings clustered on the kb workbench's fit with the rest of the product: the panel styled itself with private `--color-*`/`--bg-*`/`--radius-*` variables (so dark mode never reached it), mounted in document flow where the sidebar's narrow footer column clipped it, leaked a module-level listener registration on every render, and double-clicks during a pending round trip double-metered usage. On the deployment side the tenant binding had split sources of truth, the gateway exposed kb write methods unconditionally, and a runtime embed outage took hybrid retrieval down with it.

## Decision

### H4: ui-kb joins the design system and the CordisPanel placement pattern

`KbPanel.module.css` now consumes only `--dsw-alias-*` semantic tokens (`bg-layer-1/2`, `label-primary/secondary`, `border-l1/inverted`, `state-error-*`) plus the theme's `--dsw-shadow-lv3`; radii are literal values, matching every other `ui-*` package (the theme owns no radius token). The panel is `position: fixed` with the offsets measured from the trigger in a `useLayoutEffect` — the CordisPanel precedent, because the sidebar clips overflow and a document-flow panel cannot escape the narrow footer column (`min-width: 280px` against a column narrower than that pushed the panel out of the viewport once stats loaded). Outside-pointer dismissal rides the shared `useDismissOnOutsidePointer` hook, which adds the `ui-primitives` peer dependency. In-flight guards disable the search and ingest buttons while their round trip is pending (the guard folds into the same condition as the empty-input check, mirroring the search side), and the module-level re-render listener set now registers in a `useEffect` with cleanup — double mount and unmount leaves zero net window/document listeners, asserted by a spy test.

### H5: one tenant env, writes opt-in, tenant binding fail-loud

`DSH_KB_TENANT` is now the single source of truth: `cordis.patch.yml` reads it for `tool-kb`'s `tenant`, the preset rows, and the api-gateway's `kbTenant` (all falling back to `demo-food-co`), replacing the hardcoded literal that silently diverged from the documented env binding. The gateway's kb write methods (`kb.ingest`, `kb.ingestUrl`) answer `kb-write-disabled` unless the deployment sets `kbWriteEnabled: true` — the gateway is unauthenticated and `kb.ingest` reads whatever path it is handed, so writes are a per-deployment decision; the generic web-app bundle pins `kbTenant: default` explicitly, and the kb-agent patch opts into writes for its single-tenant, disk-guarded deployment. `kbTenant` is required in the plugin schema (a missing binding fails load), and every kb method also refuses `kb-tenant-unbound` when a direct `createApiProxy` construction omits it — no silent fall-through to a default tenant. DEPLOY (both languages) states the no-authentication/no-public-network rule, the arbitrary-file-read chain, and the honest v2→v3 upgrade path (a v2 backup stays rejected; rebuild the corpus by re-ingesting; roll back code and database together).

### H6: a runtime embed fault degrades search, not ingest

`KbRuntime.search` now treats a runtime `embed()` failure (or an empty vector batch) the same as an absent provider: the text ranking answers with `mode: 'text'`, a warning names the provider and cause, and the degraded search still meters (`searches: 1, embedTexts: 0`). Ingest keeps failing loud with `KB_EMBED_FAILED` on the same fault — partial vectors must never enter the store, and a silent text-only ingest would poison hybrid recall invisibly. The DNS-rebinding TOCTOU in `kb_ingest_url` and the graph tools' zero usage metering are registered as debts in `plans/food-kb-agent-plan.md` with their fix directions (pin-IP into the `ctx.web` request fields; route graph executes through the recordUsage seam), not implemented in this batch.

## Alternatives considered

- **Panel placement via a portal**: rejected — a portal escapes the sidebar clip but loses the anchor's layout context; the measured fixed offset (the CordisPanel precedent, now the shared `useFixedPanelAnchor` hook) keeps one placement pattern across both panels.
- **Write opt-in per method** (separate ingest/ingestUrl flags): rejected — deployments decide "is this gateway writable", not which write verb they allow; one flag matches the threat (an unauthenticated reachable gateway).
- **Degrading ingest to text-only on embed faults too**: rejected — silently unembedded chunks poison hybrid recall invisibly; search degradation is observable per call, stored vectors are not.

## Consequences

- `packages/client/ui-kb/src/client/{KbPanel.module.css,KbPanel.tsx,KbEntry.tsx,index.ts}` + `package.json` (ui-primitives peer); tests `kbentry.client.spec.tsx`, `kbpanel.client.spec.tsx`, `apply.client.spec.tsx`, `invariant.client.spec.ts`.
- `packages/host/apiproxy/src/{api-proxy.ts,index.ts,api/rpc.ts,api/rpc.schema.ts}`; test `kb-domain.spec.ts`; `packages/bundle/web-app/cordis.patch.yml`; `examples/kb-agent/cordis.patch.yml`; `apps/web/tests/kb-workbench.{overlay.yml,e2e.ts}`.
- `packages/kb/kb/src/index.ts` + `tests/runtime.spec.ts`; `examples/kb-agent/DEPLOY.{md,zh.md}`; `plans/food-kb-agent-plan.md` (debt table).
