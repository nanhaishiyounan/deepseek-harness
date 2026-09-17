# Agent Note：market 页订单交付物——轮询订单区块、站内 PDF 预览、receipt 入口

Status: implemented

[English](2026-09-17-orders-deliverables-market-view.md) | 中文

## 问题

会话内的 agent 可下单专家服务（`order_create`），market 页也可经确认卡下单，但 PDF 交付物只落盘在宿主的 `workspace/deliverables/` 下：浏览器侧没有订单列表、没有状态推进、也没有预览或下载入口。receipt 徽章显示的是下单时刻的状态，已交付的 PDF 只能通过宿主文件系统触达——没有任何浏览器界面能观察 `pending → generating → delivered`，也拿不到这份文档。

## 决策

- market tab 在开放的 `orders.list` 读方法上渲染「我的订单」区块（读方法不受 `ordersEnabled` gate 约束；写方法保持原 gate）。存在 `pending`/`generating` 行时每 5 秒轮询一次，全部行进入终态（`delivered`/`failed`）即停，组件卸载即停：interval 只在 market tab 挂载期间存在，因此长期 pending 的订单只在用户盯着该 tab 期间每 5 秒付出一次 list 读。轮询 effect 依赖数组钉住 rows 引用，每次快照落地后重启计时节律。
- PDF 预览走既有的 `/api/orders.download` 路由加 `inline=1` 查询参数：同一文件、同一文件名，仅 `Content-Disposition` 从 `attachment` 切到 `inline`，使同源页内 `<iframe>` 在既有 ui-primitives Modal 里渲染 PDF。两种 disposition 都携带 `x-content-type-options: nosniff` 与 `cache-control: private, no-store`——交易文档绝不经过共享缓存——并且该路由不添加 `X-Frame-Options`/`frame-ancestors` 限制，同源预览正依赖于此。模态 footer 保留附件直链（`download`）与新窗口打开的 inline URL（iframe 无法承载 PDF 查看器的平台的降级路径）。
- receipt 卡携带「查看订单」入口，scroll-into-view 到区块锚点（`#market-orders`）；下单成功后在刷新 stats 与 catalog 缓存的同时刷新 orders 缓存。
- 会话流的 `order_create` 工具卡携带同一跳转：`order_create` 的 presentation meta 现恒投 `order_id`，存在时一并投出 `deliverable_path`/`deliverable_url`；行内渲染「查看订单」入口——仅当回放 meta 携带正整数 `order_id` 且行以 `ok` 收尾。入口经 keyed toolview hole 的注册方 inject face（ui-kb 自己的 `createKbViewBridge` 实例上的 `requestView`）把会话 view ring 切到 `market`，落到区块锚点；无发布方挂载（header 动作缺席）时降级为 bridge 的文档化 no-op。meta 的三个身份字段保持严格校验；后加的 `order_id`/交付物字段对回放宽容——缺这些字段的旧日志保留回执行、只是没有入口，tool-connector 与 ui-kb 两处 narrow 保持逐字段同步。

## 考虑过的替代方案

- **订单流转的服务端推送。** orders seam 没有变更流；为单用户本地界面的一张列表发明一个，等于给 seam 加一条广播契约。至终态即停的轮询在不触碰 seam 的前提下限住了开销。
- **单独的预览路由或 blob-URL 预览。** 下载路由已经在流式返回确切的字节与文件名；唯一差异是 disposition，一个查询参数保住一条路由与同一组加固响应头。
- **直接内嵌 NocoBase 的 storage url。** `deliverable_url` 是 NocoBase 部署上的 storage 相对地址，浏览器源不可达；网关路由才是每种组合（含 fixture 部署）都存在的同源路径。

## 后果

- 未组装 orders seam 的部署降级为区块的 `ErrorStrip`（`orders-not-composed`），与 market 既有降级语义一致；`ordersEnabled: false` 下 list/download 照常工作，仅拒绝下单。
- 长期 pending 的订单在 market tab 可见期间持续 5 秒轮询（未设重试上限）；全部终态即停，手动刷新按钮在每种状态下可用。
- 区块轮询是浏览器侧的进度视图；会话内的订单工具视图仍是另一个视图，不再是唯一一个。

## 验证

- `packages/host/apiproxy/tests/orders-domain.spec.ts`：inline/attachment disposition、共享的 `nosniff`/`no-store` 头、经 `toFetchHandler` 的 GET/HEAD 载体路由。
- `packages/client/ui-assets/tests/orderssection.client.spec.tsx`：状态矩阵、按状态的行内操作、fake-timer 轮询节律（5s 计拍、终态停、卸载停）、模态 iframe 与 footer 链接；`marketview.client.spec.tsx`：receipt→区块滚动入口；`apply.client.spec.tsx`：view face 的 `refreshOrders` 与下单后刷新。
- `apps/web/tests/market-pages.e2e.ts`（真实组合上的 keyless Chromium）：`MemoryOrdersService` 以真实计时器推进 `pending → generating → delivered` 并返回最小 PDF 字节；journey 断言区块列表、轮询到达已交付、inline 响应头、模态、附件下载的 `%PDF` 字节与手动刷新。
- `packages/connector/tool-connector/tests/tool-connector.spec.ts`：执行后的 `order_create` meta 携带 `order_id`/`deliverable_path`，`orderCreateMetaFromResult` 可回放仅有三字段的前投影 meta。`packages/client/ui-kb/tests/ordertoolrow.client.spec.tsx`：当前 meta 下入口渲染并调 `requestView('market')`，旧回放与错误行不渲染。`apps/web/tests/order-tool-row.snapshot.ts`（keyless、built bundles）：fixture 历史会话的两条 `order_create` turn pin 两种回放形态，点击入口后 market 视图挂载并出现 `#market-orders` 锚点。
