# Agent Note: kb blank 优先工作台入口——hero 上的 additive view ring 与跨入口桥挂载镜像

Status: implemented

[English](2026-09-02-kb-blank-first-workbench-entry.md) | 中文

## 问题

工作台在产品首屏不可达：blank 会话完全隐藏会话 header（`hideChrome = blank && composerPhase === 'blank'`），带 kb tab 的 view ring 只在首条消息后渲染，侧栏 KB 入口在 blank 会话的点击退化为无反馈的统计刷新。要到达工作台必须先输入一条消息——门户宣传着一个知识产品，其自己的工作台却打不开。另有三个小发现随行：场景确认框的 probe 分隔符是 JSX 硬编码全角冒号（英文界面渲染成 "Example question：…"）、任意长的最近检索 chip 可能撑开 hero 门户、最近日志的整值 `localStorage` 写入没有文档化的多标签降级。

## 决策

### 壳层以 additive 方式弱化两个 blank 阶段守卫

`ui-conversation` 保留常驻 hero 但不再把"blank"当作"无 ring"：`ConversationSessionHeader` 仅在 `tabs.length <= 1` 时隐藏整个 header，于是带部署 ring（对话 + kb + 轨迹）的 blank 会话把标题行、header 动作与 tabs 渲染为普通列 chrome——无 ring 的 blank 会话保持与先前完全一致的姿态。`ConversationSession` 只在 blank 阶段的 *chat* 视图会拥有 body 时返回 null；任何其他已解析视图直接渲染 view 区。两个守卫都读 slot 台账（`tabs.length`、`resolveActiveView`），绝不出现 kb 字面量——feature 判定保持"是否注册了第二个视图"，符合壳层的 additive 契约。chat 视图的稳定回退 id 移入 `contract/views.ts`（`DEFAULT_VIEW_ID`），因为 root 现在也要共享它。

### root 通过回报镜像得知活动视图

常驻 `ConversationRoot` 计算 hero 姿态但看不到 per-session chat store（root 作用域没有），因此 `apply.ts` 铸造一个 root 级 `createSnapshotStore<string | undefined>` 并双向接线：body 的 inject 增加 `reportActiveView`（body 在 `useEffect` 中发布其解析出的视图 id，卸载时撤回），conversation inject 把它暴露为 `useActiveView` 钩子。hero 条件现在额外要求镜像是 `undefined` 或 chat 回退：blank 会话停在非 chat 视图时，列取活动姿态（tabs + view body + 停靠 composer），切回 chat 恢复 hero。root 持有的镜像——而非 root 去读 session store——保住了作用域切分；回报由 effect 驱动，重挂载的 body 不会继承上一个会话的视图。

### 桥长出工作台挂载镜像；门户让位

kb 视图桥（`kbStore.ts`）现在携带 `workbench` 快照 store。`KbWorkbench` 在挂载/卸载时发布 `settleWorkbench(true/false)`，`KbHeroDock` 订阅：工作台 tab 拥有列期间 dock 保持挂载（input-dock 席位在会话区存在时就渲染）、对这次占用不渲染任何内容、tab 离开后回归。该占用恰好是工作台记录检索的窗口，所以最近检索栏在挂载时*且*在每次工作台停用后重读 `localStorage`——原先仅挂载读取的假设是"dock 在记录发生时未挂载"，常驻 dock 打破了它。侧栏入口按会话存在性而非 blank 性分发：任何会话（含 blank）请求 kb 视图——桥已武装，因为带 ring 的 blank header 保持着 header 动作发布器的挂载——而完全没有会话时保留门户刷新行为。

### 文案与裁剪跟随 locale 与行宽

probe 分隔符移入 `kb` 命名空间（`scenario.probeColon`：zh `：`、en `: `），恢复 en/zh/spec 三处 78→79 键对称。hero 最近行把每个 chip 封顶在 `max-width: 100%` 单行省略号（query 整值存储；只有 chip 裁剪），门户获得无条件的 `max-height: 50vh` 滚动兜底，吞并了原先仅 ≤900px 的规则——长 chip 换行而不是在任何宽度把 composer 的控件推出视口。`dsh-kb-recent-searches` 的多标签最后写入胜出降级连同触发条件文档化在 kb-agent README 的 Known Limitations（双语）；e2e lane 带 `[skip-multitab]` 注释说明确定性复现为何超出 one-world lane 的范围。

## 备选方案

- **在 hero 门户内渲染 ring 而非壳层 header**：拒绝——门户是 ui-kb 席位；只有壳层能渲染别的包的视图 tab，且门户局部"打开工作台"按钮会重编码壳层已拥有的 ring。
- **root 直读 chat store 做 hero 门控**：拒绝——root 是"可能有会话"，不拥有 per-session store；回报镜像既保住作用域切分又只给 root 恰好需要的那一个比特。
- **按工作台占用做 dock 卸载门控**（工作台活动时跳过渲染 dock 席位）：拒绝——input-dock 席位是其他条目（todo、queue）共乘的共享列表；kb 特定的卸载会与席位所有者打架。从 `KbHeroDock` 内部不渲染才是 additive 的做法。
- **对已存储 query 按字符截断**（存裁剪过的 query）：拒绝——日志的价值在精确重跑；渲染时裁剪保住存储的忠实与 chip 的廉价。

## 后果

- 无 ui-kb 的部署保持逐像素一致的 blank-hero 行为（单 tab 守卫），由无 ring 的 skeleton 用例钉住；kb 部署获得首屏工作台可达性、跨视图最近检索同步、locale 正确的 probe 标点、裁剪的长 chip、以及诚实的多标签限制记录。
- root 级视图镜像在挂载时落后 body 的 store 提交一帧（回报是被动 effect）；settling 窗口已覆盖该歧义，没有断言依赖过渡帧。
- 工作台镜像之所以让 dock 的最近栏正确，是因为重读监听停用；未来若 dock 自己记录检索，必须扩展重读触发器。

## 测试

- `packages/client/ui-conversation/tests/skeleton.client.spec.tsx`：带 ring 的 blank header 渲染；非 chat 视图接管列（`data-phase` active、hero 文案消失）且 chat 恢复 hero；无 ring hero 用例钉住不变姿态。
- `packages/client/ui-kb/tests/`：入口分发（blank 会话请求 tab、无会话刷新）、工作台 settle 发布、门户停用/回归与最近栏重读、两本词典中的 `scenario.probeColon`、apply 层桥镜像往返。
- `apps/web/tests/kb-workbench.e2e.ts`：经侧栏的 blank-hero 入口（检索、hero 回归）、带 `dsh-kb-recent-searches` 硬断言的跨视图最近同步、长 chip 几何用例（nowrap + 行内封顶 + 完整文本在 DOM）；`[skip-multitab]` 占位文档化未覆盖的降级。
