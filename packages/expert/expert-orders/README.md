# @deepseek-ai/dsh-expert-orders

English | [中文](README.zh.md)

Expert-service order lifecycle over the NocoBase source of truth (`expert-orders` on `ctx.orders`): creation resolves the ordered service row and snapshots identity and pricing onto a `pending` order; fulfillment runs the whole deliverable pipeline — kb reference retrieval for the brief, model drafting of the strict-JSON `DraftSpec` through the configured route, `@deepseek-ai/dsh-expert-pdf` typesetting, the real PDF landing under the configured deliverables directory, and status write-back at the source. Consumers: `dsh-tool-connector`'s `order_create`/`order_status` (the model-facing order journey) and the gateway's orders domain (`dsh-host-apiproxy`: create/get/list/fulfill plus the host-only deliverable download).

## Order state machine

`pending → generating → delivered`, with `generating → failed` recording the failure cause; `failed → generating` is the retry (a new fulfill attempt), and `delivered` is terminal. Every transition lands at the NocoBase `orders` row first — DSH keeps no parallel order table (single source of truth), so a read always reflects the stored row.

## Drafting

- **Model drafting** (the configured `draftProvider`/`draftModel` route, default `minimax`/`MiniMax-M3`) runs when both the llm service and the draft credential (`draftApiKeyEnv`, default `MINIMAX_API_KEY`) resolve: kb hits for the brief become reference lines, the model returns strict JSON, and a malformed body refuses loudly (the order settles `failed` with the cause).
- **Named template fallback** (keyless): without the draft key, the five-chapter fixed template drafts the deliverable and the order row carries the note「未配置模型服务，按模板生成（非模型起草）」— degraded, never masquerading as model-drafted.

## Configuration (schemastery)

- `baseUrl?: string` — NocoBase server origin; omitted = the `NOCOBASE_BASE_URL` environment variable.
- `apiKeyEnv?: string` — credential reference for the NocoBase token (default `NOCOBASE_API_KEY`).
- `tenant: string` — kb tenant binding for reference retrieval (the deployment's shared tenant, mirroring the tool rows).
- `draftApiKeyEnv?: string` — credential reference the draft model key resolves through (default `MINIMAX_API_KEY`); unresolved = the named template fallback.
- `draftProvider?: string` / `draftModel?: string` — draft model route (default `minimax` / `MiniMax-M3`).
- `draftMaxTokens?: number` — draft output-token budget (default `4096`).
- `draftTimeoutMs?: number` — draft call deadline (default `55000`, sized under the order_create tool budget).
- `timeoutMs?: number` — per-request NocoBase timeout (default `15000`).
- `deliverablesDir?: string` — directory deliverables land under, workspace-relative or absolute (default `workspace/deliverables`).

## Model Experience

Indirectly, through `dsh-tool-connector`'s `order_create`/`order_status`: this service registers no prompt, schema, or tool of its own. The auxiliary draft call is not a session turn — it is an internal model request (the session-title precedent), so it never enters the session log.

#### KV Cache effect

The draft request carries its own system and user messages and shares no prefix with the session's conversation; it neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- `list` reads a single page of up to 100 rows; a paging loop waits for a deployment whose order volume exceeds it.
- The NocoBase attachment mount (`attachments:upload` + order-row attachment field) arrives with the N6 fusion batch; today the delivered order row carries the workspace file path (the local landing is the truth for the path).
- Fulfillment statuses live only in the orders row — no in-process event stream exists for workbench live progress (the tool result and `order_status` are the observation surfaces).
