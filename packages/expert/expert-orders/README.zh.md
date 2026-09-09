# @deepseek-ai/dsh-expert-orders

[English](README.md) | 中文

以 NocoBase 为事实源的专家服务订单生命周期（`ctx.orders` 上的 `expert-orders`）：下单解析被订购的服务行，把身份与定价快照落到 `pending` 订单；履约跑完整交付管线——按 brief 检索 kb 参考、经配置路由起草严格 JSON 的 `DraftSpec`、交给 `@deepseek-ai/dsh-expert-pdf` 排版、真实 PDF 落盘到配置的交付目录、状态回写真源。消费方：`dsh-tool-connector` 的 `order_create`/`order_status`（模型面的下单动线）与网关的 orders 域（`dsh-host-apiproxy`：create/get/list/fulfill 加 host-only 的交付物下载）。

## 订单状态机

`pending → generating → delivered`；`generating → failed` 记录失败原因，`failed → generating` 即重试（新的 fulfill 尝试），`delivered` 为终态。每次状态转移先落 NocoBase `orders` 行——DSH 不建平行订单表（单一事实源），读取永远反映已存行。

## 起草

- **模型起草**（配置的 `draftProvider`/`draftModel` 路由，默认 `minimax`/`MiniMax-M3`）：llm 服务与起草凭据（`draftApiKeyEnv`，默认 `MINIMAX_API_KEY`）同时可解析时运行——brief 的 kb 命中成为参考行，模型返回严格 JSON，非法输出大声拒绝（订单落 `failed` 并带原因）。
- **具名模板兜底**（keyless）：起草 key 缺失时以五章固定模板起草，订单行携带备注「未配置模型服务，按模板生成（非模型起草）」——降级而不伪装成模型起草。

## Configuration (schemastery)

- `baseUrl?: string` — NocoBase 服务源；缺省读 `NOCOBASE_BASE_URL` 环境变量。
- `apiKeyEnv?: string` — NocoBase token 的凭据引用（默认 `NOCOBASE_API_KEY`）。
- `tenant: string` — 参考检索的 kb 租户绑定（部署共享租户，与工具行同源）。
- `draftApiKeyEnv?: string` — 起草模型 key 的凭据引用（默认 `MINIMAX_API_KEY`）；不可解析即走具名模板兜底。
- `draftProvider?: string` / `draftModel?: string` — 起草模型路由（默认 `minimax` / `MiniMax-M3`）。
- `draftMaxTokens?: number` — 起草输出 token 预算（默认 `4096`）。
- `draftTimeoutMs?: number` — 起草调用期限（默认 `55000`，小于 order_create 工具预算）。
- `timeoutMs?: number` — NocoBase 单请求超时（默认 `15000`）。
- `deliverablesDir?: string` — 交付物落盘目录，workspace 相对或绝对（默认 `workspace/deliverables`）。

## Model Experience

间接生效：经 `dsh-tool-connector` 的 `order_create`/`order_status`——本服务自身不注册提示词、schema 或工具。辅助起草调用不是会话回合——它是内部模型请求（session-title 先例），不进会话日志。

#### KV Cache effect

起草请求携带自己的 system 与 user 消息，与会话对话无共享前缀；既不向任何可复用请求前缀追加内容，也不使其失效。

## Known Limitations and Deferred Work

- `list` 单页最多读 100 行；分页循环等真实订单量超过它的部署出现再做。
- NocoBase 附件挂载（`attachments:upload` + 订单行附件字段）随 N6 融合批次落地；当前已交付订单行携带 workspace 文件路径（本地落盘即路径事实源）。
- 履约状态只存在于订单行——没有进程内事件流供工作台实时进度（工具结果与 `order_status` 即观测面）。
