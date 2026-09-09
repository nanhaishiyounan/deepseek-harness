# Agent Note：专家订单域与方案 PDF 生成管线 —— orders 状态机、双轨起草与 expert-pdf 排版

Status: implemented

[English](2026-09-05-expert-order-pdf-pipeline.md) | 中文

## Problem

用户核心诉求的收口批次（N5，plans/connector-lakehouse-nocobase/02-batches.md）：在 agent 会话里订购张会长的专家服务 → 得到真实排版的中文方案 PDF（指导货运、仓库、合规）→ 订单状态可查、文件可打开。要求真实生成、真实落库（NocoBase 行）、真实落盘（PDF 字节），不接受 mock-only 环节。计划把起草管道写在 apiproxy 的 `api-proxy.ts` 内聚、工具经网关转发，本批按现场事实调整为独立订单缝。

## Decision

### 订单编排独立成包（对计划的偏差）

计划 N5 的「apiproxy orders 域内聚起草管道」不可行：examples 的 keyless 快照与 with-key e2e 组合（expert-discovery 先例）直接经 Loader 组装工具与 llm/kb，不组 apiproxy；`ApiProxyService` 的 `static inject` 硬依赖 agent spine（agents/sessions/workspaceRegistry…），轻量组合无法承载。会话内下单是用户核心动线，而 headless `pnpm dsh` 组合无 api-gateway 行（patch 对 headless 只 warn）——订单逻辑只在 apiproxy 内聚时模型面工具不可达。订单逻辑同时有两个消费者（模型面工具 + 网关 RPC 域与 N6 workflow 回调），按「一个事实一个家」抽出共享：新包 `packages/expert/expert-orders`（`ctx.orders`，单体功能插件：订单真源读写 + fulfill 编排），apiproxy 的 orders 域薄转发 `ctx.get('orders')`（与 kb/lakehouse 缝在网关中的可选消费同构），tool-connector 的 order 工具同样 `ctx.get('orders')`。计划的「新包 1」实为「新包 2」（expert-pdf + expert-orders）。

### 订单状态机（闭集判别 tag）

`pending → generating → delivered`；`generating → failed`（订单行记录 500 字截断的失败原因）；`failed → generating` 为重试路径；`delivered` 终态（`canTransition` 转移表 + `assertOrderStatus` 收窄 + 闭集 `ORDER_STATUSES`）。不做 `cancelled`：N5 无取消动作的消费者（N6 workflow 驳回分支才有），按「公共选择需要证据」暂不进枚举。每次转移先写 NocoBase `orders` 行——DSH 不建平行订单表（D4 单一事实源），读取永远反映已存行。

### fulfill 编排（expert-orders 内聚）

`resolve service（expert_services/<id>）→ update generating → kb 检索 refs（title → headingPath）→ 起草 DraftSpec → renderPdf → 落盘 deliverablesDir/<orderNo>.pdf → update delivered(+path/generatedAt/note)`。失败 catch 写 `failed` 后重抛；写回自身的失败不掩盖管线根因。凭据解析复用 connector-nocobase 的模式（credentials 缝 → launch env → process.env），ensureClient 惰性解析以便测试经环境注入。

### 起草双轨

- 真实起草：llm 服务与 `draftApiKeyEnv`（默认 MINIMAX_API_KEY）同时可解析时，`ctx.llm.stream` 走配置路由（默认 minimax/MiniMax-M3）；system 固定严格 JSON 协议（title + sections[heading/paragraphs/refs]，章节模板：背景与问题/风险分析/解决方案（货运、仓库、合规）/实施路线图），响应剥一层 markdown 围栏后严格校验，非法输出 fail-loud 落 `failed`。辅助调用非会话回合（session-title-llm 先例），不进 session log。
- 具名模板兜底（keyless）：无起草 key 时五章固定模板出稿，订单行 note 落「未配置模型服务，按模板生成（非模型起草）」——降级可见，不伪装模型起草。双轨与 kb-closed-loop 的 keyless/with-key 快照双轨同构。

### expert-pdf（纯函数排版，pdf-lib + fontkit）

`DraftSpec`（orderNo/title/client/expert/date/sections/disclaimer）→ `renderPdf` → PDF 字节：封面页 + 章节正文（`wrapCjkText` 按实测宽度换行：CJK 逐字、拉丁词原子、显式换行硬断，拼接还原无损）+ 参考行 + 免责声明 + 正文页眉（orderNo/title）与页脚（第 x 页/共 y 页）。字体为包内 Noto Sans SC Regular（官方 Sans2.004 release，SIL OFL 1.1，约 8.3MB，LICENSE 随包分发），`embedFont(subset: true)` 每份文档子集嵌入——PDF 体积跟随实际用字。往返断言经 unpdf（pdf.js）抽取文本验证 ToUnicode 与中文无乱码；PDFDocument.load 验证可解析与多页。

### apiproxy orders 域（五处协同 + 写开关）

`api/orders.ts` + `orders.schema.ts` + rpc-map + UNARY_ROUTES + client valueSchemas/IApiClient + 两个 fake-api.client 面；`orders.download` 为 host-only GET 路由（`/api/orders.download?orderId=`，attachment 响应，downloads.sessionLog 先例；seam 的 MISSING/NOT_DELIVERED/DELIVERABLE_MISSING 码映射 404）。写方法（create/fulfill）由 `ordersEnabled` 显式开启——订单是对定价服务的真实交易，与 kbWriteEnabled 同门禁语义；读（get/list/download）放开。错误码三枚：orders-not-composed / orders-write-disabled / orders-rejected。

### order_create 一步闭环

`order_create` = create + fulfill 单次调用（60s 预算覆盖整条管线）——会话内「下单→等生成→拿 PDF」一次完成；`orders.fulfill` RPC 保留给 N6 的 workflow 回调。工具输出（订单号/终态/deliverable_path/note）与 order_status 的行投影均落 session log（模型可见⟺落日志经工具面天然成立）。

## Alternatives considered

- **tool-connector 依赖 apiproxy 转发订单**（计划原文方向）：被否——依赖方向（connector 组 → host 组）在依赖图不存在，apiproxy 重依赖会污染工具包，且 headless/轻量组合拿不到网关。
- **扩展 connector seam 加 order 能力**：被否——订单不是数据集发现/拉取能力，起草管线需要 llm+kb+落盘，不属于 provider 契约。
- **无 key 时静默走模板不标注**：被否——用户价值观与 D6 要求兜底必须显名（note 落订单行），不伪装真实起草。
- **`cancelled` 状态**：暂缓——无当前消费者（N6 驳回分支落地时再加）。

## Consequences

- 会话内全链路真实闭环：keyless 快照（模板兜底真实落盘 PDF 并断言字节/页数/章节）与 with-key e2e（真实 MiniMax-M3 起草 84s 跑通）双轨在案；既有 connector-flow/expert-discovery/data-routing/kb-closed-loop/kb-presets/scenarios 快照无回归。
- NocoBase client 新增按主键 `update`（mock server 同步语义）；dataset.json 权威真源新增空 `orders` 集合（seed 脚本类型不受影响）。
- N6 的附件挂载（`attachments:upload` → 订单行附件字段）与 workflow 审批回调（`orders.fulfill` 入口已就位）接续；当前交付物路径的本地落盘即事实源。
- `orders.list` 单页 100 行；超出该量的部署出现再做分页循环（README Known Limitations 登记）。
