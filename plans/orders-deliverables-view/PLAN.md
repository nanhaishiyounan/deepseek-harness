# 专家服务订单交付物页面展示/查看 — 实施计划

> **For agentic workers:** 本计划按批次执行（批次 1 → 2 → 3，各成一个 PR）。每批内步骤用 checkbox 跟踪。所有行号锚点已在 2026-09-17 对源码核实。

**目标：** 专家服务下单后的订单列表与 PDF 交付物在 DSH market 页可见、可预览、可下载，会话内的下单工具卡与 receipt 卡都能一键跳到订单区块。

**架构：** BFF 在既有 `/api/orders.download` 路由上增加 `inline=1` 查询参数（同一路由、同文件名，仅 `Content-Disposition` 切换）；market 页（`conversation.view` ring 的 `market` tab）新增「我的订单」区块，数据走已开放的 `orders.list` RPC，存在非终态订单时 ~5s 轮询；预览用站内 `Modal` + 同源 iframe；会话工具卡 `order_create` 的 `presentationMeta` 增投 `order_id` 与交付物字段，`OrderToolRow` 渲染「查看订单」入口，经 ui-kb 自己的 view bridge（`kbStore.ts` 的 `createKbViewBridge`，先例：`ScenarioView` 的 `requestView('chat')`）切到 market tab。

**技术栈：** Cordis slots 体系（React + CSS Modules）、apiproxy fetch carrier（`toFetchHandler`）、`@deepseek-ai/dsh-client-ui-primitives`（Button/PageSkeleton/ErrorStrip/EmptyState/Modal）。

---

## 调研核实修正（与任务书调研结论的差异，按实际代码执行）

1. **`MarketOrderReceipt` 已含 `id: number`**（`packages/client/ui-assets/src/client/marketTypes.ts:48`，`orders.create` 的 wire 返回 `OrderView` 含 `id` 并经 `unwrap` 原样透传）。决策 5 的「receipt 类型加订单 id」已天然满足——receipt 卡只需加 UI 入口，**不改类型**。
2. **`Modal` 已存在**（`packages/client/ui-primitives/src/Modal.tsx:30`，受控全屏对话、Escape/遮罩关闭、portal 到 body）。模态直接复用，不自建。
3. **浏览器侧 `api.orders.list` 已可用**：apiproxy fetch client 已暴露（`packages/host/apiproxy/src/fetch/client.ts:594`），rpc-map 已注册（`packages/host/apiproxy/src/api/rpc-map.ts:71`），读方法无 `ordersEnabled` gate（`packages/host/apiproxy/src/api-proxy.ts:4097` 仅查 seam 存在）。**connection 包无需改动**（fixture 的 not-composed 拒绝路径也已就位，`packages/client/connection/src/client/fixture.ts:3113`）。

## 范围界定

- **turn-deliverables 不纳入**：`packages/client/ui-deliverables/src/client/turn-deliverables.ts:43` 的 `producedPaths` 按 render intent（diff 卡 / generic `edit` 卡）识别产物，`order_create`（generic `execute`）不参与——这是设计而非缺口：产物条收「本 Turn 改动的文件」，PDF 交付物的入口由本计划的订单区块与工具卡覆盖。拍板决策未包含它，不在本计划内改动。
- market 页下单只调 `orders.create`（落 `pending`）；`delivered` 由 NocoBase workflow 回调 `orders.fulfill` 或会话内 `order_create` 工具推进，区块只负责轮询呈现。
- `ordersEnabled=false` 部署：读方法（list/download）开放，区块与查看/下载照常；仅 confirm 卡下单收到 `orders-write-disabled` 拒绝（现有错误态已覆盖）。

---

## 批次 1：BFF — orders.download 增加 inline 模式

一个 PR，独立可合（无前端依赖）。

### 改动文件

| 文件 | 改动 |
|---|---|
| `packages/host/apiproxy/src/api/orders.ts:72` | `OrdersApi.download` 请求参数 `{ orderId: number }` → `{ orderId: number; inline?: boolean }`；JSDoc 补一句 inline 时 `Content-Disposition: inline` 供站内 iframe 预览 |
| `packages/host/apiproxy/src/fetch/handler.ts:310` | `/api/orders.download` 路由解析 `url.searchParams.get('inline') === '1'` → 以 `{ orderId: rawOrderId, inline: true }` 调 `api.orders.download` |
| `packages/host/apiproxy/src/api-proxy.ts:4119` | `download` 实现按 `request.inline === true` 写 `content-disposition: inline; filename="..."`（默认仍 `attachment`，同 filename）；两种模式统一补 `x-content-type-options: nosniff` 与 `cache-control: private, no-store`（交易文档不经共享缓存；同源 iframe 不受影响） |
| `packages/host/apiproxy/tests/orders-domain.spec.ts` | 三组用例（见下） |

### 关键实现形态（api-proxy.ts download 内）

```ts
const filename = file.path.split('/').pop() ?? 'deliverable.pdf'
return new Response(file.bytes.slice(), {
  headers: {
    'content-type': 'application/pdf',
    'content-disposition': `${request.inline === true ? 'inline' : 'attachment'}; filename="${filename}"`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, no-store',
  },
})
```

### 步骤

- [ ] 1.1 `orders-domain.spec.ts` 加失败测试：`api.orders.download({ orderId: 7, inline: true }, signal)` → 200、`content-disposition` 以 `inline; filename="` 开头且 filename 与 attachment 路径一致；现有 200 用例（:168）补 `attachment` + `nosniff`/`no-store` 断言。
- [ ] 1.2 路由层用例（照 `tests/session-export.spec.ts:162` 的 `toFetchHandler(api).fetch(new Request('http://host/api/orders.download?orderId=7&inline=1'))` 模式，可加在 orders-domain.spec）：GET 带 `inline=1` → inline disposition；不带 → attachment；HEAD → 空体同头。
- [ ] 1.3 跑 `pnpm vitest run packages/host/apiproxy/tests/orders-domain.spec.ts` 确认先失败后通过。
- [ ] 1.4 实现三处改动（契约 → 路由 → 实现），测试转绿。
- [ ] 1.5 `pnpm run typecheck && pnpm run lint`；更新 apiproxy README 中 orders download 段落（`packages/host/apiproxy/README.md` 与 `README.zh.md` 的网关域描述处，如无专门段落则补一句 inline 用途）。
- [ ] 1.6 commit：`feat(apiproxy): orders.download inline mode for in-page PDF preview`。

---

## 批次 2：market 页「我的订单」区块 + 模态预览 + 轮询

一个 PR，依赖批次 1（预览 URL 用 inline 参数）。

### 改动/新增文件

| 文件 | 改动 |
|---|---|
| `packages/client/ui-assets/src/client/marketTypes.ts` | 新增 `MarketOrderRow`（见下）；`MarketClientState` 无关改动为零 |
| `packages/client/ui-assets/src/client/marketStore.ts:21` | `MarketClientState` 加 `orders: MarketCache<readonly MarketOrderRow[]> \| undefined`；`MarketClientStore` 加 `beginOrders()/setOrders(rows)/failOrders(message)`（照 stats/catalog 三连的现成模式，:68-85）；`INITIAL` 补 `orders: undefined` |
| `packages/client/ui-assets/src/client/index.ts:80` | apply 内新增 `refreshOrders()`：in-flight guard（`orders?.status !== 'loading'`）→ `api.orders.list({})` → `unwrap` → `setOrders` / `failOrders`；view face 注入（:118 inject）加 `refreshOrders`；`placeOrder` 成功回调（:127）在 `refresh()` 旁加 `refreshOrders()` |
| `packages/client/ui-assets/src/client/MarketView.tsx` | receipt 区块（:139-152）加「查看订单」按钮（key `order.receiptViewOrder`，用现有 `receipt.id`，`document.getElementById('market-orders')?.scrollIntoView({ behavior: 'smooth' })`）；在 receipt 区块之后、catalog 区块之前渲染 `<OrdersSection>` |
| `packages/client/ui-assets/src/client/OrdersSection.tsx` **新增** | 「我的订单」区块：挂载时 `orders === undefined` 则 `refreshOrders`；标题 + 手动刷新按钮；loading 骨架（`PageSkeleton`）/ `ErrorStrip`（含重试）/ `EmptyState` / 列表（行：order_no、service_name、价格、状态徽章复用 `css.statusBadge` 的 `data-status` 模式、created_at 前 10 位、failed 行展示 error 摘要；delivered 行渲染「查看方案」「下载 PDF」）；轮询 `useEffect`：`orders?.status === 'ready'` 且存在 `pending`/`generating` 行时 `setInterval(5_000, refreshOrders)`、全部终态清除（依赖数组钉住 rows 引用）；区块根 `<section id="market-orders">` |
| `packages/client/ui-assets/src/client/OrderDeliverableModal.tsx` **新增** | PDF 预览模态：复用 `Modal`（`title` = order_no + i18n 标题，`footer` = 下载 `<a href={'/api/orders.download?orderId=' + order.id} download>` + 「新窗口打开」`<a href={'/api/orders.download?orderId=' + order.id + '&inline=1'} target="_blank" rel="noreferrer">`）；body 为 `<iframe src={'/api/orders.download?orderId=' + order.id + '&inline=1'} title={...} className={css.previewFrame}>`；受控于 OrdersSection 的本地 state（`selected: MarketOrderRow \| undefined`） |
| `packages/client/ui-assets/src/client/locales.ts` | `MarketKey` 与 zh/en 字典新增（见下） |
| `packages/client/ui-assets/src/client/market.module.css` | `.orders` 区块、`.ordersRow`/`.ordersMeta`/`.ordersActions` 行布局、`.previewFrame`（`width: 100%; min-height: min(72vh, 640px); border: 0`）、模态窄屏（`max-width: min(920px, 92vw)`）与行窄屏折行的 media query |

### 新类型（marketTypes.ts）

```ts
/** One order row as the orders.list wire projects it (rendered subset). */
export interface MarketOrderRow {
  readonly id: number
  readonly order_no: string
  readonly service_name: string
  readonly price?: string
  readonly status: MarketOrderStatus
  readonly error?: string
  readonly generated_at?: string
  readonly created_at: string
}
```

（`unwrap<{ orders: readonly MarketOrderRow[] }>` 的返回与 `OrderView` 结构兼容——`api-proxy.ts` `orderViewOf` 已是 snake_case 投影；类型按渲染所需子集镜像，与 `MarketOrderReceipt` 同风格。）

### 新 i18n keys（zh / en 镜像，照现有双语结构）

```
orders.title              我的订单 / My orders
orders.refresh            刷新 / Refresh
orders.empty              还没有订单 / No orders yet
orders.emptyHint          在资产目录选择可下单的专家服务，或在对话中让助手下单 / Pick an orderable expert service in the catalog, or ask the assistant to order in chat
orders.viewDeliverable    查看方案 / View deliverable
orders.download           下载 PDF / Download PDF
orders.previewTitle       方案预览 / Deliverable preview
orders.openExternal       新窗口打开 / Open in new window
order.receiptViewOrder    查看订单 / View order
```

### 步骤

- [ ] 2.1 新增 `packages/client/ui-assets/tests/orderssection.client.spec.tsx`（jsdom），失败测试先行：
  - loading 骨架 / error + 重试调 `refreshOrders` / 空态文案；
  - ready 列表渲染行与状态徽章；delivered 行有查看/下载两个动作（断言 href 形态）；failed 行展示 error；
  - 轮询：`vi.useFakeTimers()`，rows 含 pending 时 5s 后再次调用 `refreshOrders`，全部 delivered 后不再调用；卸载清除 interval；
  - 「查看方案」打开模态（`role="dialog"`）且 iframe src 带 `inline=1`；Escape/关闭回调触发。
- [ ] 2.2 `marketview.client.spec.tsx` 扩展：receipt 卡出现「查看订单」按钮，点击触发 `scrollIntoView`（jsdom 下 mock `Element.prototype.scrollIntoView`）。
- [ ] 2.3 `apply.client.spec.tsx` 扩展：view face 暴露 `refreshOrders`；`placeOrder` 成功后 orders cache 进入刷新（断言 `api.orders.list` 被调，mock 与现有 `create` mock 同法）。
- [ ] 2.4 实现类型/store/apply/组件/样式/文案，包内测试转绿（`pnpm vitest run packages/client/ui-assets`）。
- [ ] 2.5 e2e 扩展（`apps/web/tests/market-pages.e2e.ts`）：
  - `MemoryOrdersService`（:129）升级：`create` 落 pending 并以真实 `setTimeout` 异步推进（约 100ms → `generating`，约 600ms → `delivered` 并写 `deliverablePath`/`generatedAt`）；实现 `fulfill`（同步推进到 delivered，供网关回调面）；`readDeliverable` 返回最小合法 PDF bytes（`%PDF-1.4 ... %%EOF` 字节串）；
  - journey 用例（:270）尾部追加验收断言（见「验收标准」）；
  - overlay（`market-pages.overlay.yml`）已含 `ordersEnabled: true`，无需改。
- [ ] 2.6 跑 `pnpm vitest run apps/web/tests/market-pages.e2e.ts`（keyless Chromium 真实组合）转绿。
- [ ] 2.7 文档：`packages/client/ui-assets/README.md:19` 改写「异步进度不经轮询、只在对话工具卡可见」的陈述为订单区块轮询语义；`README.zh.md` 同步；两份 README 各补一段「我的订单区块 + 预览/下载 + 轮询至终态即停」。
- [ ] 2.8 commit：`feat(ui-assets): market orders section with PDF preview and polling`。

---

## 批次 3：会话工具卡「查看订单」入口 + presentationMeta 增投

一个 PR，依赖批次 2（跳转目的地区块存在才有意义）。

### 改动文件

| 文件 | 改动 |
|---|---|
| `packages/connector/tool-connector/src/order.ts:312` | `presentationMeta` 投影增投 `order_id`（必有）与 `deliverable_path`/`deliverable_url`（有则投）——`OrderCreateToolValue` 本就携带，纯投影扩展 |
| `packages/connector/tool-connector/src/order.ts:169` | `OrderCreateMetaView` 加 `order_id: number`、`deliverable_path?/deliverable_url?`；`orderCreateMetaFromResult`（:181）narrow 同步（`order_id` 非正整数时忽略该字段——replay 宽松，其余字段照旧校验） |
| `packages/client/ui-kb/src/client/toolviews/order-tool-model.ts:16` | `OrderCreateMeta` 加可选 `order_id?/deliverable_path?`；`createMetaOf`（:29）字段级 narrow：`order_id` 为正整数才带上，旧回放（无 `order_id`）仍产出 receipt 文本，只是无按钮 |
| `packages/client/ui-kb/src/client/toolviews/OrderToolRow.tsx:46` | model 的 create meta 含 `order_id` 且 state 非 error 时，行尾渲染「查看订单」按钮 → `requestView('market')` |
| `packages/client/ui-kb/src/client/index.ts:300` | `order_create`/`order_status` 两个 toolview 注册加 `inject: () => ({ requestView: (view: string) => { bridge.request(view) } })`（bridge 即 apply 作用域的 `createKbViewBridge()` 实例，注入模式照 :236 scenario）；`OrderToolRowProps` 扩为 `ToolCallViewProps & PropsLocale<'kb'> & { requestView: (view: string) => void }` |
| `packages/client/ui-kb/src/client/locales.ts` | kb 命名空间新增 `tool.orderViewOrder`「查看订单 / View order」 |
| `packages/connector/tool-connector/tests/tool-connector.spec.ts:868` | `mountOrders` 用例追加断言：执行 `order_create` 后 `result.meta` 含 `order_id`（及 delivered 时的 `deliverable_path`） |

**前置验证（本批第一步）**：keyed toolview hole 是否向注册组件透传 `inject` face——渲染点 `packages/client/ui-tool/src/client/tool/ToolCallTree.tsx:40` `renderSlot('tool.call.toolview', owner, { entryKey, ... })`。现有 toolview 注册（web-row/todo-row 等）均未用 inject。若 ui-slots 的 keyed hole 不合并 inject face，fallback 落点：`ToolCallTree.tsx:40` 所在渲染链（ui-tool）把注册的 inject face 合入 props——一个受控小改，不改 slot 契约语义。先写一个最小 spec（注册带 inject 的 dummy toolview，断言组件收到 face）定方向，再动 OrderToolRow。

### 步骤

- [ ] 3.1 keyhole inject 透传验证（上述）；结论写进 PR 描述。
- [ ] 3.2 `ordertoolrow.client.spec.tsx` 失败测试先行：meta 含 `order_id` → 渲染「查看订单」且点击调 `requestView`（prop mock）；meta 无 `order_id`（旧回放）→ 不渲染按钮、receipt 文本照常；error 行不渲染按钮。
- [ ] 3.3 tool-connector spec 的 meta 断言（上表）；先失败后实现（order.ts 投影 + narrow）。
- [ ] 3.4 ui-kb 实现（model + row + index 注入 + locale），包内测试转绿。
- [ ] 3.5 快照义务（keyless、真实可运行例子）：`packages/client/connection/src/client/fixture.ts` 的「Fixture 历史会话」种子里加一条 `order_create` 工具 turn（`tool/call` + `tool/result`，meta 含 `order_id/order_no/status: delivered/service_name/deliverable_path`）；新增 `apps/web/tests/order-tool-row.snapshot.ts` 照 `todo-row.snapshot.ts` 模式（assembled boot + `mountAssembledApp`，pin 行的 title/summary/按钮文本到 `apps/web/tests/snapshots/order-tool-row/*.expected.txt`）。
- [ ] 3.6 SDK 影响检查：presentationMeta 随 `tool/result` 事件进 session log（model-visible⟺logged 不受影响——meta 只进 log 不进模型请求；输出 schema 与 render 文本不变）。跑 `pnpm run test` 确认 TS/Python SDK 期望输出是否打印该 meta，需要则同 PR 更新 `python/` 侧期望。
- [ ] 3.7 文档：`packages/connector/tool-connector/README.md` 与 `README.zh.md` 的 `order_create` 段补「presentation meta 携带 order_id 与交付物字段，供工具卡跳转订单区块」；`packages/client/ui-kb` 的 toolview 描述（若有 OrderToolRow 段落）同步。
- [ ] 3.8 commit：`feat(tool-connector,ui-kb): order_create card jumps to market orders`。

---

## 测试与快照义务清单

| 面 | 位置 | 批次 |
|---|---|---|
| BFF inline 单测 | `packages/host/apiproxy/tests/orders-domain.spec.ts`（api face + `toFetchHandler` 路由层 GET/HEAD/inline/attachment） | 1 |
| 路由层先例 | `packages/host/apiproxy/tests/session-export.spec.ts:162`（同构 fetch handler 直发 Request） | 1 |
| orders 区块组件单测 | `packages/client/ui-assets/tests/orderssection.client.spec.tsx`（新增；状态矩阵 + fake-timer 轮询 + 模态） | 2 |
| market view/receipt 入口单测 | `packages/client/ui-assets/tests/marketview.client.spec.tsx`、`branches.client.spec.tsx`（受既有用例牵动处同步） | 2 |
| apply face 单测 | `packages/client/ui-assets/tests/apply.client.spec.tsx`（refreshOrders、placeOrder 后刷新） | 2 |
| keyless e2e（验收主战场） | `apps/web/tests/market-pages.e2e.ts`（MemoryOrdersService 升级 + journey 追加断言）；overlay 不变 | 2 |
| 工具 meta 单测 | `packages/connector/tool-connector/tests/tool-connector.spec.ts:868`（execute 后 `result.meta` 断言） | 3 |
| 工具行单测 | `packages/client/ui-kb/tests/ordertoolrow.client.spec.tsx`（入口渲染/点击/旧回放降级） | 3 |
| keyless 快照（transcript 面） | `apps/web/tests/order-tool-row.snapshot.ts`（新增，todo-row 模式）+ `connection/fixture.ts` 历史会话种子加 order_create turn | 3 |
| SDK 期望 | `pnpm run test` 全量后核对 TS/Python SDK replay 期望（3.6） | 3 |
| 门禁 | 各 PR：`pnpm run typecheck && pnpm run lint`；文档批：`pnpm run doc-sync` | 全部 |

## 文档义务

- `packages/host/apiproxy/README.md` / `README.zh.md`：orders download 域补 inline 语义（批次 1）。
- `packages/client/ui-assets/README.md` / `README.zh.md`：**必须改 :19 的「进度不经轮询」陈述**；补订单区块/预览/轮询段（批次 2）。
- `packages/connector/tool-connector/README.md` / `README.zh.md`：order_create 的 presentation meta 描述（批次 3）。
- `packages/client/ui-kb` 的 toolview 文档段落（如存在；无则不新增专段）。
- **Agent Note（非平凡变更必须）**：批次 2 的 PR 内新增 `.agents/notes/`（按 `.agents/notes/README.md` 现有 area 目录归类，建议 `implemented/product/2026-09-17-orders-deliverables-market-view.md`），记录订单区块的轮询契约（5s、至终态即停、tab 卸载即停）与 inline 下载路由的缓存/安全头决策；批次 1、3 的机制若已在各自 README 完整陈述，随批次 2 的 note 一并引用即可。
- `pnpm run doc-sync` 全绿；涉及 README 若被 `website/docs.ts` 投影，跑 `pnpm run website:build` 验证死链。

## 风险与注意事项

1. **fulfill 长管线与轮询**：market 的 `orders.create` 只落 pending；delivered 依赖 NocoBase workflow 回调（`orders.fulfill`，`api-proxy.ts:4108`）或会话工具推进。区块轮询仅在 market tab 挂载时存在（切 tab 即组件卸载、interval 清除），全终态即停；拍板未设轮询上限——长期 pending 订单在 tab 可见期间持续 5s 轮询，读方法无 gate，负载可控（单页 list，pageSize 100）。
2. **ordersEnabled=false / 未组 seam**：list/download 开放（区块、预览、下载照常），仅 create/fulfill 拒绝（confirm 卡现有错误态）；无 seam 部署 list 返回 `orders-not-composed`，区块走 `ErrorStrip` 降级——与 kb/market 现有降级语义一致。
3. **inline 响应安全/缓存头**：固定 `content-type: application/pdf` + `x-content-type-options: nosniff` + `cache-control: private, no-store`；不加 `X-Frame-Options`/`frame-ancestors`（同源 iframe 预览需要）；同源路由无 CORS 面；PDF 渲染走浏览器原生 viewer，无脚本执行面。
4. **模态在移动/窄屏**：模态宽 `min(920px, 92vw)`、iframe 高 `min(72vh, 640px)`；iOS Safari 的 iframe-PDF 内嵌受限，footer 固定提供「新窗口打开」（inline URL 直开）降级，无需条件分支。
5. **i18n**：文案中文为主、en 镜像（market/kb 两个 namespace 各自字典结构）；不引入新 namespace。
6. **keyed toolview 的 inject 透传**（批次 3 前置）：若 ui-slots keyed hole 不透传 inject face，fallback 改 `ToolCallTree` 渲染点（见批次 3 说明）；两种落点都已限定，实现者不做方向决策。
7. **e2e 时序**：MemoryOrdersService 用真实 `setTimeout` 推进状态（不用 fake timers——scaffold 与浏览器同进程 Node 环境）；断言用 `expect.poll`（timeout 15s）覆盖 5s 轮询周期。
8. **快照稳定性**：order-tool-row 快照 pin 的是行文本字段（title/summary/按钮），不 pin 展开区 raw 文本，避免与模型输出耦合。
9. **归档纪律**：README 的「不轮询」旧陈述与 Agent Note 互相印证，禁止文档间一处说轮询一处说不轮询（one home per fact）。

## 验收标准（market-pages.e2e journey 追加断言草案）

前置：批次 2 的 MemoryOrdersService 已异步推进 pending → generating → delivered，readDeliverable 返回最小 PDF。

```ts
// — journey 用例（:270）尾部追加 —
// 1) 下单后订单出现在「我的订单」区块
await page.getByRole('region', { name: '我的订单' }).waitFor({ timeout: 15_000 })
await page.getByText(orderNoPattern).first().waitFor({ timeout: 15_000 })   // receipt 已有；区块内同号
// 2) 轮询推进到终态（MemoryOrdersService ~600ms 推进；区块 5s 轮询拾取）
await expect.poll(
  async () => page.locator('[id="market-orders"] [class*="statusBadge"]').first().innerText(),
  { timeout: 15_000 },
).toBe('已交付')
// 3) 点「查看方案」→ 模态 iframe 预览
const previewResponse = page.waitForResponse(r =>
  /\/api\/orders\.download\?.*inline=1/.test(r.url()) && r.request().method() === 'GET')
await page.getByRole('button', { name: '查看方案' }).click()
const inline = await previewResponse
expect(inline.status()).toBe(200)
expect(inline.headers()['content-disposition']).toMatch(/^inline; filename="/u)
expect(inline.headers()['content-type']).toBe('application/pdf')
await page.getByRole('dialog').waitFor({ timeout: 15_000 })                  // 模态出现
await page.getByRole('button', { name: /新窗口打开/u }).waitFor({ timeout: 5_000 })
// 4) 下载保持附件响应直链
const download = await page.request.get(`${scaffold.baseUrl}/api/orders.download?orderId=1`)
expect(download.status()).toBe(200)
expect(download.headers()['content-disposition']).toMatch(/^attachment; filename="/u)
expect((await download.body()).subarray(0, 4)).toEqual(new TextEncoder().encode('%PDF'))
// 5) 手动刷新按钮存在且终态后不再触发新请求（弱断言：按钮可点即可）
await page.getByRole('button', { name: '刷新', exact: true }).click()
```

批次 3 验收（并入 e2e 或以 `order-tool-row.snapshot.ts` 期望文件承载）：order_create 工具行渲染「查看订单」按钮，点击后 view ring 切到 `market` tab（断言 market 标题可见）。
