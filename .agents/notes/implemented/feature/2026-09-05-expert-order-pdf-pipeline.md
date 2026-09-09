# Agent Note: Expert orders and the proposal-PDF pipeline — the order state machine, dual-track drafting, and expert-pdf typesetting

Status: implemented

English | [中文](2026-09-05-expert-order-pdf-pipeline.zh.md)

## Problem

The closing batch of the user's core request (N5, plans/connector-lakehouse-nocobase/02-batches.md): order the expert's service inside an agent conversation → receive a real typeset Chinese proposal PDF (freight, warehousing, compliance) → trackable order status and an openable file. Real generation, real persistence (NocoBase rows), real bytes on disk — no mock-only step. The plan located the drafting pipeline inside the apiproxy gateway with tools forwarding through it; this batch reshapes that into an independent orders seam based on what the codebase actually allows.

## Decision

### The order pipeline becomes its own package (a deviation from the plan)

The plan's "drafting pipeline inside api-proxy.ts" was not viable: the examples' keyless snapshots and with-key e2e compositions (the expert-discovery precedent) assemble tools and llm/kb directly through the Loader without the gateway, and `ApiProxyService` hard-injects the agent spine (agents/sessions/workspaceRegistry…), which those light compositions cannot carry. In-conversation ordering is the user's core journey, and the headless `pnpm dsh` composition mounts no api-gateway row (the patch only warns there) — order logic living solely inside apiproxy would be unreachable from the model surface. The logic also has two consumers (the model-facing tools and the gateway's RPC domain / the N6 workflow callback), so by one-home-per-fact it must be shared: the new package `packages/expert/expert-orders` (`ctx.orders`, a single functional plugin: source-of-truth order reads/writes plus the fulfill orchestration), the apiproxy orders domain forwarding thinly onto `ctx.get('orders')` (isomorphic to how the kb/lakehouse seams are optionally consumed by the gateway), and the tool-connector order tools doing the same. The plan's "one new package" became two (expert-pdf + expert-orders).

### The order state machine (closed discriminant set)

`pending → generating → delivered`; `generating → failed` (the order row records the truncated 500-char cause); `failed → generating` is the retry path; `delivered` is terminal (`canTransition` table + `assertOrderStatus` narrowing + the closed `ORDER_STATUSES`). No `cancelled`: N5 has no consumer of a cancel action (the N6 workflow rejection branch will be), so per choices-need-evidence it stays out of the enum. Every transition writes the NocoBase `orders` row first — DSH keeps no parallel order table (decision D4, single source of truth), and reads always reflect the stored row.

### The fulfill orchestration (inside expert-orders)

`resolve service (expert_services/<id>) → update generating → kb reference retrieval (title → headingPath) → draft the DraftSpec → renderPdf → land deliverablesDir/<orderNo>.pdf → update delivered(+path/generatedAt/note)`. The failure catch writes `failed` and rethrows; a write-back refusal of its own never masks the pipeline's root cause. Credential resolution reuses the connector-nocobase pattern (credentials seam → launch env → process.env), with a lazy ensureClient so tests inject through the environment.

### Dual-track drafting

- Real drafting: when both the llm service and `draftApiKeyEnv` (default MINIMAX_API_KEY) resolve, `ctx.llm.stream` runs the configured route (default minimax/MiniMax-M3); the system half fixes a strict-JSON protocol (title + sections[heading/paragraphs/refs], chapter template: background / risk analysis / solution (freight, warehousing, compliance) / roadmap), the response strips one markdown fence and validates strictly, and a malformed body fails loud into `failed`. The auxiliary call is not a session turn (the session-title-llm precedent) and never enters the session log.
- The named template fallback (keyless): without a draft key, the fixed five-chapter template produces the deliverable and the order row carries the note「未配置模型服务，按模板生成（非模型起草）」— visible degradation, never masquerading as model-drafted. The dual track mirrors kb-closed-loop's keyless/with-key snapshot pairing.

### expert-pdf (pure-function typesetting, pdf-lib + fontkit)

`DraftSpec` (orderNo/title/client/expert/date/sections/disclaimer) → `renderPdf` → PDF bytes: a cover page, body sections (`wrapCjkText` wraps by measured width: CJK per character, latin word runs atomic, explicit newlines hard; the wrapped lines join back to the input exactly), reference lines, the disclaimer, and body-page chrome (orderNo/title header, page-x-of-y footer). The font is the bundled Noto Sans SC Regular (the official Sans2.004 release, SIL OFL 1.1, ~8.3 MB, LICENSE shipped alongside), subset-embedded per document via `embedFont(subset: true)` so output size follows the glyphs actually used. Round-trip assertions extract text through unpdf (pdf.js) to prove the ToUnicode mapping and mojibake-free Chinese; PDFDocument.load proves parseability and page count.

### The apiproxy orders domain (five-point wiring + a write gate)

`api/orders.ts` + `orders.schema.ts` + rpc-map + UNARY_ROUTES + the client valueSchemas/IApiClient + both fake-api.client faces; `orders.download` is a host-only GET route (`/api/orders.download?orderId=`, an attachment response, the downloads.sessionLog precedent; the seam's MISSING/NOT_DELIVERED/DELIVERABLE_MISSING codes map to 404). The write methods (create/fulfill) require the explicit `ordersEnabled` opt-in — an order is a real transaction against a priced service, the same gate semantics as kbWriteEnabled; reads (get/list/download) stay open. Three error codes: orders-not-composed / orders-write-disabled / orders-rejected.

### order_create closes the loop in one call

`order_create` = create + fulfill in one call (the 60 s budget covers the whole pipeline) — the in-conversation "order → wait → receive the PDF" journey completes at once; the `orders.fulfill` RPC stays reserved for the N6 workflow callback. The tool outputs (order number / settled status / deliverable_path / note) and order_status's row projections land in the session log (model-visible ⟺ logged holds naturally through the tool surface).

## Alternatives considered

- tool-connector forwarding orders through apiproxy (the plan's literal direction): rejected — the dependency direction (connector group → host group) does not exist in the graph, the gateway's heavy dependency tree would pollute the tool package, and headless/light compositions have no gateway.
- Extending the connector seam with order capabilities: rejected — an order is not a dataset discover/fetch capability; the drafting pipeline needs llm + kb + a filesystem landing, none of which belong in the provider contract.
- A silent unannotated template without a key: rejected — the user's values and decision D6 require the fallback to name itself (the note on the order row), never pretending to be real drafting.
- A `cancelled` status: deferred — no current consumer (added when the N6 rejection branch lands).

## Consequences

- The in-conversation journey is really closed end to end: the keyless snapshot (template fallback with a real landed PDF asserted for bytes/pages/chapters) and the with-key e2e (real MiniMax-M3 drafting, 84 s) are both on record; the existing connector-flow / expert-discovery / data-routing / kb-closed-loop / kb-presets / scenarios snapshots show no regression.
- The NocoBase client gains primary-key `update` (the mock server mirrors the semantics); the authoritative dataset.json gains the empty `orders` collection (the seed script's types are unaffected).
- N6's attachment mount (`attachments:upload` → the order row's attachment field) and the workflow approval callback (the `orders.fulfill` entry is ready) follow; today the local landing is the truth for the deliverable path.
- `orders.list` reads one page of 100 rows; the paging loop waits for a deployment whose order volume exceeds it (registered in the README's Known Limitations).
