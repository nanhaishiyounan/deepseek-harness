# Agent Note: kb 工作台 FIX-L 打磨批——blank 会话工作台入口、跨视图最近检索 e2e、半角冒号 locale、超长检索词 chip 封顶、多标签降级文档

Status: implemented

[English](2026-09-02-kb-workbench-fix-l.md) | 中文

## 问题

FIX-K 复验 95/100 PASS 后留下五条带精确修法的 lessons（#9–#13）：blank 会话在首条消息前隐藏 view ring；hero 最近检索栏与工作台历史没有 e2e 锁定；场景确认框的冒号在词典里两种语言都是全角；任意长的已记录检索词可能把门户撑过 composer；多标签最后写入胜出的降级行为无处文档化。

## 决策

### L1：blank 会话以 additive 方式渲染 view ring；壳层不感知具体部署

lesson 建议弱化 `messages.length === 0` 守卫。落地的规则以 tab 数而非消息数表述：`ConversationSessionHeader` 仅在 `blank && composerPhase === 'blank' && tabs.length <= 1` 时隐藏，于是 chat 回退之外的 ring 让 header（连同 tab 行）在首条消息前保持挂载，而无 ring 部署保持与先前完全一致的姿态——ui-conversation 壳层永远不知道 kb 存在。body 侧配同款豁免：blank 阶段的 chat 视图仍把列让给 hero，但任何其他已解析视图（部署了的工作台 tab）通过正常的 `conversation.view` slot 渲染接管 body。`KbEntry` 按会话状态分发：有会话（含 blank）调用视图桥的 `requestKbView()`——桥发布者未挂载时是无操作，此时 tab 仍可手动点击；仅无会话页面回落为刷新门户统计。feature 判定走 view 台账的注册（slot 存在性），绝不硬编码 kb 常量。

### L2：跨视图最近检索流以存储级硬断言入 e2e

`kb-workbench.e2e.ts` 新增 "syncs the hero recent-search rail with the workbench history across views"：经工作台真实 gateway 面跑三个不同 query，回 chat tab 后 hero 栏必须按新到旧列出，且 `page.evaluate` 读 `localStorage('dsh-kb-recent-searches')` 必须等于精确数组——只看渲染文案证明不了任何事。

### L3：场景确认框的冒号成为 locale 键

JSX 拼接改为 `t('scenario.probeLabel') + t('scenario.probeColon')`；该键 zh 为 `：`、en 为 `: `，在 `KbKey` 联合类型与两本词典三处对称。

### L4：已记录检索词按行宽封顶并省略号截断

`.recentRow > button` 获得 `max-width: 100%` + `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`；FIX-K 的 `.portal { max-height: 50vh }` 兜底已覆盖 >900px 档，故不重复加帽。e2e 用例提交 81 字符 query 后证明几何：computed `text-overflow: ellipsis`、`white-space: nowrap`、chip 宽度不超行宽，同时完整原文仍整值存于 localStorage。

### L5：多标签降级被文档化而非静默丢弃

两份 kb-agent README 的 Known Limitations 新增条目：`dsh-kb-recent-searches` 整值持久化，两个标签页在同一写入窗口内各自完成工作台检索时写操作交错，可能丢失一条已记录检索词；单标签使用不受影响。e2e 文件带 `[skip-multitab]` 占位注释，说明无可运行用例的原因（one-world lane、无跨标签存储协调）并指向 README 条目。

### 重录 lifecycle-chrome goldens 属于本变更本身，不是附带品

L1 合法地改变了 blank hero 的无障碍树（带三 tab ring 的 header banner 与最近检索区现在渲染于此），故 `hero.expected.md`、`plan-active.expected.md`、`reloaded.expected.md` 以 `DSH_SNAPSHOT=refresh` 重录并在 replay 下复验。源码变更后的首次 replay 命中的是过期 goldens，因为 web lane 服务构建产物——重录跑在重建后的 bundle 上。

## 备选方案

- **L1 用 `messages.length` 作守卫键**：拒绝——header 不读消息列表；tab 台账是 ring 是否存在的权威信号，且让无 ring 部署逐字节不变。
- **L1 为 kb 入口挂自己的工作台路由**：拒绝——view ring 是壳层的导航契约；平行路由会分叉 e2e 锁定的回 hero 行为。
- **L4 在写入时截断已记录检索词长度**：拒绝——日志必须存用户实际检索的内容；呈现层在渲染时封顶。
- **L5 用 BroadcastChannel 做合并**：本批拒绝——正确的跨标签合并需要独立的协议与测试；文档化降级才是诚实的范围。

## 后果

- `packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx`（header 守卫、body 豁免）、`ui-kb/src/client/KbEntry.tsx`（会话状态分发）、`ui-kb/src/client/locales.ts`（`scenario.probeColon`）、`ui-kb/src/client/hero/KbHeroDock.tsx`（冒号走 `t`）、`ui-kb/src/client/hero/hero.module.css`（chip 封顶）。
- `apps/web/tests/kb-workbench.e2e.ts`（+3 用例：blank 入口往返、带 localStorage 硬断言的跨视图同步、超长 chip 封顶），重录 `snapshots/lifecycle-chrome/*.expected.md`；`examples/kb-agent/README.md` + `README.zh.md` Known Limitations 条目。
- 聚焦套件全绿：ui-kb + ui-conversation 单测（594）、kb-workbench e2e（8）、new-session-lifecycle + cold-blank + lifecycle-chrome e2e；浏览器取证在 `screenshots/kb-redesign/fix-l/`（六张：带 ring 与侧栏入口的 blank hero、自 blank 打开的工作台、跨视图最近检索栏、en/zh 场景冒号、封顶的超长 chip）。
