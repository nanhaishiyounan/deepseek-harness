# Agent Note: kb 工作台 FIX-K 阻断批——lint 清零、共享 toast、浏览竞态、locale 诚实、窄视口、最近检索、用量口径、入库失败文案

Status: implemented

[English](2026-09-01-kb-workbench-fix-k.md) | 中文

## 问题

kb 工作台重构的统一验证得 75/100 FAIL（code-review 70、design-system-consistency 65 强制失败），十一类修复项 K1–K11，分布在 lint 欠账、手写 toast、浏览竞态、硬编码中文提示模板、把 composer 的 plan chip 挤出 800×720 视口的窄视口回归、缺失的产品面、不诚实的用量卡、以及永远起不来的闭环 e2e。

## 决策

### K1：lint 清零靠修八个错误加删六十个构建产物，不靠放宽规则

八个真实错误：`KbWorkbench.tsx:87`（`inputActions.setDraft` 裸引用）与 `client/index.ts:220`（`bridge.provide`）的 `unbound-method` 改为带显式参数类型的箭头包裹；fixture 的 `store.subscribe` 改 `.bind(store)`；四个 spec 的 `t` 桩把 `params` 从 `Record<string, unknown>` 收窄为 `Record<string, string | number>`，模板插值显式化；`skeleton.client.spec.tsx` 删一处冗余断言。其余 955 个错误来自十个目录下六十个未跟踪 tsc 产物（与存活 `.ts` 并排的 `.js`/`.d.ts`/`.js.map`）；逐个列出确认均为构建输出后删除，唯独 `ui-kb/src/css-modules.d.ts` 除外——那是其余三十个 client 包都在跟踪的 repo 级约定文件，保留。最终 `pnpm run lint`：0 warnings，0 errors。

### K2：工作台 toast 用共享 `Toast` 原语

手写的 `div.toast`（自带 `TOAST_MS` 定时器与样式规则）替换为 `ui-primitives` 的 body-portal `Toast`（WorkspaceBrowser 模式：`{seq, text}` state，`key={seq}` 重启周期）。原语经 body portal 渲染，入库成功 toast 不可能被入库 modal 的遮罩压住；浏览器取证（`light-ingest-toast.png`）显示横幅浮于已关闭的对话框之上。

### K3：浏览竞态用序号令牌守卫，经 StrictMode 测试

`browse()` 给每次派发打 `++browseSeq.current`，丢弃被更新浏览超越的过期应答（成功、失败都丢）；加载骨架替换层级行即为在途禁用。拒绝了纯在途拒绝标志：UI 本身已串行化用户派发（加载中可点击行卸载），唯一可达的并发派发是 React StrictMode 的双挂载 effect——回归测试正是驱动它：两个 listDirectory promise，较新者先 resolve，较旧的首个应答（一个测试里晚 resolve，另一个里晚 reject）不落地且失败文案不出现。

### K4：模型可见的提示模板入 locale 词典

carry-to-chat 草稿模板改为 `result.carryDraft`（`关于「{label}」：{query}，请结合上下文进一步说明` / `About "{label}": {query} — please elaborate with the retrieved context`）；各场景的 `probe` 拆为 `probeZh`/`probeEn`，dock 按当前语言取值。浏览器取证：en 界面点 Cite & ask 预填英文草稿。

### K5：窄视口回归有两个成因，都在 900px 以下修掉

验证者给的方案（≤900px 隐藏 KB header 入口按钮，保留 golden 契约）已应用——`entry.module.css` 加媒体查询——但 golden 仍红：800px 下的真实压力来自 portal dock 本身，其场景 rail 在 768–900px 无媒体查询的空档里把八个类别组竖着堆高，把 composer（连同 plan chip 与 model trigger）推出折叠线以下。`hero.module.css` 现在在该区间给 `.portal` 设 `max-height: 50vh` 并内部滚动。`plan-control-row.e2e.ts` 复绿且 golden 未改（两个控件 `fully in viewport: true`）。复现提示：web lane 服务构建产物，纯 CSS 改动需先跑根 build（client bundle 内联 CSS modules）再跑前端 vite build，e2e 才反映。

### K6：最近检索存于 localStorage，五条日志

新模块 `recentSearches.ts` 拥有该日志（去重、最新在前、上限五条、清空、损坏条目按空处理、localStorage 不可用时内存兜底——沿用 runtime store 的持久化契约）。工作台记录每次完成的检索；portal dock 把该栏渲染为第四区块，配 `hero.recent`/`hero.recentEmpty`/`hero.recentClear` 文案，挂载时读取（dock 与工作台从不同时挂载，挂载时读取永远新鲜）。

### K7：用量卡只声称它度量的东西

无依据的 `订阅：专业版 · 有效` 徽标删除（词典键、DOM、样式规则一并删），`usage.title` 改为 累计用量 / Total usage——网关的用量查询没有时间窗，"本月"是后端撑不起的声明。

### K8：入库失败原子性在两层被测试锁定，失败文案不再泄漏 transport 原文

seam 本就是先 embed 后 store 且 `putDocument` 事务化；本批补的是锁：runtime spec 加短向量 embed 失败用例（`putCalls` 与 `usageCalls` 皆空）并保留网络失败用例，apiproxy 域测试锁定 seam 拒绝的 `kb-ingest-failed` wire 形状。客户端 `classifyIngestFailure` 收拢为三类——未知与服务器故障统一读新增的 `ingest.failed` 文案而非原始拒绝串——且失败入库会重载共享计数（`onFailed`）。

### K9：检索与入库对称刷新用量，加同步双派发守卫

完成的检索调用 `refresh()`（检索计数在服务端递增）；`runWith` 在 `setBusy` 提交前先查 `busyRef`，同帧双派发无法重复计数。浏览器取证：一次检索后用量卡立即 49→50。

### K10：空库 CTA 说真话

`hero.emptyAction` 改为 试试检索 / Try a search，与按钮实际行为（把首个示例问题填进 composer）一致。行为不变；文案测试锁定配对。

### K11：闭环 e2e 重新可启动

`fixtures/kb-closed-loop.cordis.yml` 声明了 `dsh-web` 与 `dsh-web-fetch-http`，但 `kb-closed-loop.e2e.ts` 的进程内 import map 从未注册它们，任何带 key 运行都死在 `unexpected Loader import`。map（与 import）现在对齐本就正确的 `kb-closed-loop.spec.ts`。

## 备选方案

- **K3 纯在途拒绝标志**：拒绝——公开 UI 不可达（加载中行卸载）且对 StrictMode 双 effect 失明，而那才是实际发生的那个并发派发。
- **K8 把 transport 失败映射到既有 `urlUnreachable` 文案**：拒绝，不诚实——embed 故障或 500 不是网页不可达；新键 `ingest.failed` 只说已知的事。
- **K6 共享 store 订阅替代挂载时读取**：拒绝——dock 与工作台不同时挂载，挂载时读 localStorage 永远新鲜，无需事件管道。
- **K5 在 900px 下隐藏场景 rail**：拒绝——窄屏会失去 portal 的主导航；限高 dock 保持每个区块经内部滚动可达。

## 后果

- `packages/client/ui-kb/src/client/` —— `KbWorkbench.tsx`（共享 toast、`onFailed`、箭头包裹 `setDraft`）、`KbSearch.tsx`（locale carry 模板、`refresh`、`busyRef`、最近检索记录）、`KbIngestDialog.tsx`（序号令牌浏览守卫、三分类失败文案、`onFailed`）、`KbUsageCard.tsx`（删订阅行）、`hero/KbHeroDock.tsx`（双语 probe、最近检索栏）、`hero/scenarios.ts`（`probeZh`/`probeEn`）、`locales.ts`（五个新键、删两键、改两键）、新 `recentSearches.ts`；`workbench.module.css`/`hero.module.css`/`entry.module.css`。
- `packages/client/ui-kb/tests/` —— 五个 spec 跟随新行为，新 `recentsearches.client.spec.ts`；`client/index.ts` 箭头类型；`tests/kb-fixture.client.ts` bind。
- `packages/kb/kb/tests/runtime.spec.ts`（短输出原子性用例）、`packages/host/apiproxy/tests/kb-domain.spec.ts`（wire 错误形状）、`examples/kb-agent/tests/kb-closed-loop.e2e.ts`（import map）、`packages/client/ui-conversation/tests/skeleton.client.spec.tsx`（断言清理）。
- 聚焦套件绿：ui-kb（107）、ui-conversation + kb + apiproxy（1254）、examples/kb-agent（3）、web e2e kb-workbench + new-session-lifecycle + plan-control-row（12）；`typecheck`、`lint`（0/0）、`build`、`doc-sync`（28）、`duplication`（0 克隆）全过；改动 src 逐文件 100%（`client/ui-kb/src` 四列）。
- 浏览器取证在 `screenshots/kb-redesign/fix-k/`：亮色 hero（最近检索空态）与工作台、关闭对话框上方的入库 toast、暗色工作台、英文 carry 草稿、800×720（KB header 按钮隐藏、model trigger 完整在视口）、带记录查询的最近检索栏。
