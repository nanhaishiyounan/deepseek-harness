# Agent Note: M3 mobile client — /mobile as a second Vite entry over the same gateway

Status: implemented

English | [中文](2026-09-18-m3-mobile-client.zh.md)

## Problem

The kb-agent deployment is PC-only in the browser: the workbench's three-column layout collapses to a sidebar rail under 1024px and has no mobile surface at all, while the reference prototype (lzqz teardown, 2026-09-17) established the target shape — four tabs, messages-as-landing, AI-employee chat with tool-activity states, and AI form filling as a prefilled task card with a 驳回/推送 double action. The NocoBase-side mobile option is dead (plugin-mobile deprecated; plugin-ui-layout still in development), so the mobile client had to land on the DSH side without forking the data path.

## Decision

The mobile client is a **second Vite entry**, not a boot-graph plugin. `apps/web` builds `mobile.html` beside `index.html`; `packages/client/ui-mobile` (statically linked, `staticLinked` tsdown preset — the `dsh-client-web` pattern) exports `AppMobileEntry`, which the page boots against `#mobile-root`. The page reads no boot manifest: a ~40-line unary client speaks the same `/api/<method>` wire the PC fetch carrier speaks (`client-request` POST → `server-response` body), because importing the connection package's `./client` is impossible for a statically linked consumer — that export IS the module-system factory bundle. Serving is a web-app bundle concern: `mobileEnabled` (validated config, default off) registers a `/mobile` prefix route that serves `dist/mobile.html` raw — no index injections, because the mobile bundle self-contains its dependencies and injection rows would only prefetch boot machinery it never uses. The kb-agent patch opts in; the PC preview is a separate thin `dsh.client` plugin (`ui-mobile-preview`) whose phone bezel iframes `/mobile` same-origin, with a title-level view-context projection by design.

Chat freshness is **polled history, not streams**: the mobile stays off the mux/host WebSocket machinery entirely; `session.history` re-reads (1.2s while a turn runs, 5s idle) recompute the whole fold. That is the plan's risk-① resolution for this batch — the events domain was not extended. The fold itself taught two wire-shape lessons the PC runtime hides: an `assistant/message` event's content lives under `data.message.content`, and a `tool/result` correlates through the result block's provider-neutral `toolCallId` (there is no top-level `callId`) with `isError` on the same block — the mobile fold reads both.

AI form filling rides the agent, not the wire: the `mobile-form-assistant` preset emits one fenced-JSON draft per step; the mobile parses **every** draft into its own editable task card (a supplier→order→items chain renders three cards), and 推送 sends the go-ahead through the same session so the write goes through `nb_create`'s preview→go-ahead→receipt contract. The receipt is then re-verified by reading the landing row back (`nocobase.list` filter id) — the card shows the persisted record, not the agent's claim.

## Consequences

- `apps/web` is a true multi-entry Vite build: the mobile chunk graph shares the vendor split, and every future surface decides per entry whether it rides the boot graph or a static page. The scaffold's web-runtime restatement now carries `mobileEnabled` the way it carries `surfaceContext`, so overlays own the choice.
- The mobile fold is a second consumer of the raw session wire and documented two storage-format facts the PC runtime had internalized: assistant content lives at `data.message.content`, and tool results correlate by the result block's `toolCallId` + `isError`. Any future raw-wire consumer (an export tool, a CLI viewer) starts from `fold.ts` instead of rediscovering this.
- The form-assistant contract is now two-sided and testable: the preset emits one fenced draft per step, the client parses every draft into a card, and the durable log is the single audit of which fields the user actually confirmed — the task-card layer adds no client-side write path of its own.

## Alternatives considered

- **`/mobile` as a `dsh.client` row on the shared boot graph.** Every PC page load would fetch the mobile bundle, and the mobile page would boot the entire PC plugin tree (or need a manifest-filtering mechanism the graph does not have). A second static entry keeps both pages honest about what they load.
- **Serving /mobile through `frontend-static`'s renderIndex.** The injection table is path-independent; rendering it would prefetch the modules/runtime bundles the mobile page never materializes. Raw serving says exactly what the page needs.
- **A mobile `nocobase.update` fast path for the push.** Row creation is not on the RPC surface by design (reads-first); routing the push through the session keeps the confirmation contract identical to the PC and leaves the write audit in the durable log.
