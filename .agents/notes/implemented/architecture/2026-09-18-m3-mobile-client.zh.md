# Agent Note: M3 移动端客户端 — 同网关之上的第二个 Vite 入口 /mobile

Status: implemented

[English](2026-09-18-m3-mobile-client.md) | 中文

## Problem

kb-agent 部署在浏览器里只有 PC 形态：工作台三栏布局在 1024px 以下只收成侧栏 rail，完全没有移动端表面；而参考原型（lzqz 实测拆解，2026-09-17）已确立目标形态——四 Tab、消息即首页、带工具进行时状态的 AI 员工对话、以及「AI 预填任务卡 + 驳回/推送双动作」的 AI 填表。NocoBase 侧的移动端路径已死（plugin-mobile 废弃、plugin-ui-layout 仍在开发），移动端必须落在 DSH 侧且不能分叉数据链。

## Decision

移动端是**第二个 Vite 入口**，不是 boot-graph 插件。`apps/web` 在 `index.html` 之外构建 `mobile.html`；`packages/client/ui-mobile`（静态链接，`staticLinked` tsdown 预设——`dsh-client-web` 的先例）导出 `AppMobileEntry`，页面在 `#mobile-root` 上启动。本页不读 boot manifest：一个约 40 行的 unary 客户端说与 PC fetch carrier 相同的 `/api/<method>` 协议（`client-request` POST → `server-response` body）——静态链接的消费方不可能 import connection 包的 `./client`，因为那个导出本身就是模块系统的 factory bundle。服务面是 web-app bundle 的事：`mobileEnabled`（校验过的配置，默认关）注册 `/mobile` 前缀路由，原样服务 `dist/mobile.html`——不做 index 注入，因为移动 bundle 自含依赖，注入行只会预取它永远不会物化的 boot 机制。kb-agent patch 显式开启；PC 预览是另一个薄 `dsh.client` 插件（`ui-mobile-preview`），手机壳 iframe 同源嵌 `/mobile`，view-context 投影按设计只有标题级。

对话新鲜度走**轮询 history，不走流**：移动端完全不占 mux/host WebSocket 机制；`session.history` 重读（turn 进行中 1.2s、空闲 5s）整段重算折叠。这是本批对计划风险①的裁决——events 域没有扩展。折叠本身教了两课 PC runtime 藏起来的 wire 形状：`assistant/message` 事件的 content 在 `data.message.content` 下；`tool/result` 靠结果块的 provider 中性 `toolCallId` 关联（事件顶层没有 `callId`），`isError` 也在同一块上——移动折叠两者都读。

AI 填表骑在 agent 上，不在 wire 上：`mobile-form-assistant` 预设每步输出一个围栏 JSON 草稿；移动端把**每一张**草稿解析成各自的可编辑任务卡（供应商→采购单→明细的链渲染三张卡），「推送」经同一会话发送放行消息，写入因此走 `nb_create` 的预览→放行→回执契约。回执随后用落地行复核（`nocobase.list` filter id）——任务卡展示的是落库的行，不是 agent 的口供。（W21 确定性批次起，模型侧的九类 assistant 载荷改走 `present_card` 工具调用、不再走围栏；围栏保留为读/回放通道与四类用户动作载荷的构造通道——该契约由[工具通道 note](2026-10-06-mobile-structured-cards-tool-channel.zh.md)持有。）

## Consequences

- `apps/web` 成为真正的多入口 Vite 构建：移动 chunk 图共享 vendor 切分，未来每个表面都要按入口决定自己骑 boot graph 还是静态页。e2e 脚手架对 web-runtime 的重述现在像携带 `surfaceContext` 一样携带 `mobileEnabled`，选择权在 overlay。
- 移动折叠是原始会话 wire 的第二个消费者，并固化了 PC runtime 内部化的两个存储格式事实：assistant 内容在 `data.message.content` 下，tool 结果靠结果块的 `toolCallId` + `isError` 关联。未来任何原始 wire 消费者（导出工具、CLI 查看器）从 `fold.ts` 起步，不必重新发现这些。
- 表单助手契约现在是双向可测的：预设每步输出一张围栏草稿，客户端把每张草稿解析成卡，持久日志是「用户实际确认了哪些字段」的唯一审计——任务卡层自身不开任何客户端写路径。

## Alternatives considered

- **把 /mobile 做成共享 boot graph 上的 `dsh.client` 行。** 每次 PC 页面加载都会拉移动 bundle，而移动页面要么启动整棵 PC 插件树、要么需要 graph 没有的 manifest 过滤机制。第二个静态入口让两个页面对自己的加载保持诚实。
- **用 `frontend-static` 的 renderIndex 服务 /mobile。** 注入表与路径无关；渲染它会预取移动页永远不会物化的 modules/runtime bundle。原样服务精确表达了页面需要什么。
- **给推送开一条移动端 `nocobase.update` 快路径。** 建行本来就不在 RPC 面上（读优先的设计）；推送经会话走让确认流与 PC 完全一致，写入审计留在持久日志里。
