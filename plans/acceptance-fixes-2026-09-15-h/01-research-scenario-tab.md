# 主题一调研报告：场景 Tab 独立化（01）

> 隶属 [PLAN.md](PLAN.md)。调研模式：project-research（R1）+ 主任务亲证。事实底座见 [00 §2](00-research-notes.md)。批次实施方案见 [10-h1](10-h1-scenario-tab.md)。用户原话：「这个模块做成单独的tab，不要每次点连接器、图谱什么的都展示！！！！uiux都调整下」。

## 1. 现状盘点

### 1.1 hero 资产（[`packages/client/ui-kb/src/client/hero/`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx)）

| 文件 | 行数 | 职责 |
|---|---|---|
| [`KbHeroDock.tsx`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx) | 360 | 空白会话门户列：用量 chips（[`UsageChips`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx:321) `{n} 文档`/`{n} 次检索`/`{n} 个场景` 四态矩阵）、示例问题 ghost 按钮两枚（点击 [`fillDraft`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx:101) 填 composer）、场景门户（[`section.scenarios`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx:132)：精选 6 卡 [`featuredScenarios()`](../../packages/client/ui-kb/src/client/hero/scenarios.ts:373) +「按分类浏览」8 分组折叠 + 实时搜索 [`filterScenarios`](../../packages/client/ui-kb/src/client/hero/scenarios.ts:397)）、最近搜索 rail（localStorage 近 5 条，[`recentSearches.ts`](../../packages/client/ui-kb/src/client/recentSearches.ts)）、场景确认 Modal（[`startScenario`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx:106)） |
| [`KbHeroHeadline.tsx`](../../packages/client/ui-kb/src/client/hero/KbHeroHeadline.tsx) | 35 | hero 标题行（图标+「食品产业知识库问答」+tagline），占 `conversation.hero.headline` 座位（[`index.ts:182`](../../packages/client/ui-kb/src/client/index.ts:182)） |
| [`scenarios.ts`](../../packages/client/ui-kb/src/client/hero/scenarios.ts) | 402 | 30 场景静态目录 `KB_SCENARIOS`（30 条）+ 8 分类 `KB_SCENARIO_CATEGORIES` + 3 纯函数；精选 6 个 = `featured: true`（[`scenarios.ts:58,99,120,191,212,313`](../../packages/client/ui-kb/src/client/hero/scenarios.ts:58)）；与 `examples/kb-agent/scenarios/<id>/preset.yml` 的 id 一致性由 [`scripts/scenario-catalog-sync.spec.ts`](../../scripts/scenario-catalog-sync.spec.ts) 门禁强制（**hero 迁移不动 scenarios.ts，此门禁不受影响**） |
| [`hero.module.css`](../../packages/client/ui-kb/src/client/hero/hero.module.css) | — | CSS Modules 样式 |

### 1.2 数据流

```
统计 chips（21 文档/6 次检索）: api.kb.stats()（注册 [ui-kb index.ts:134-147](../../packages/client/ui-kb/src/client/index.ts:134)）
  → 共享缓存 createKbClientStore（[kbStore.ts:74](../../packages/client/ui-kb/src/client/kbStore.ts:74)，stats: loading/ready/error）
  → wire 面 api-gateway kb.stats（[cordis.patch.yml:283](../../examples/kb-agent/cordis.patch.yml:283)，租户 demo-food-co）
  三处共享一个 store：侧栏入口 / hero dock / workbench tab（[kbStore.ts:2-8](../../packages/client/ui-kb/src/client/kbStore.ts:2)）
选场景: selectScenario（[index.ts:196](../../packages/client/ui-kb/src/client/index.ts:196)）→ api.agentPresets.select({sessionId, agentPreset: scenarioId})
  → 成功后场景 probe 问题填入 composer 草稿（[KbHeroDock.tsx:113-115](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx:113)）
tab 间切换桥: createKbViewBridge（[kbStore.ts:147](../../packages/client/ui-kb/src/client/kbStore.ts:147)）: header 按钮发布 setView；
  workbench mount 镜像 bridge.workbench（[kbStore.ts:140](../../packages/client/ui-kb/src/client/kbStore.ts:140)）由 KbWorkbench settle(true/false)
```

### 1.3 用户痛点根因链

1. KbHeroDock 注册于 [`conversation.input.dock`](../../packages/client/ui-conversation/src/client/contract/slots.ts:213)（id `kb-portal` order 5，[`ui-kb index.ts:187`](../../packages/client/ui-kb/src/client/index.ts:187)）——这是**会话输入区座位**，与 view 环无关；
2. 宿主 [`ConversationRoot.tsx:173`](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:173) `{zone !== undefined && renderSlot('conversation.input.dock', zone)}` 在常驻 composer 堆栈里**无条件渲染**（对比：hero 壳受 `hero` 布尔控制，非 chat 视图关闭，但 dock 不受控）；
3. [`ConversationSession.tsx:216-218`](../../packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx:216)：非 chat 视图时 body 由视图占据（`heroOwnsBody=false`），连接器/图谱页 + composer + composer 上方整段场景门户同屏；
4. 唯一让位信号 `workbenchMounted` 只覆盖 kb workbench 一种视图——架构注释自我说明「mount 态是它唯一的 view 信号」，即当前实现只考虑了一种非 chat 视图。

### 1.4 tab 导航机制（第七 tab 的插入口）

- view 环纯 slot 名单表：[`apply.ts:158-171`](../../packages/client/ui-conversation/src/client/apply.ts:158) `viewTabs()` 遍历 `conversation.view` 条目投影 `ViewTab{id,label}`；**壳层零改动即可加 tab**（任一 ui 包 apply 里 `slots.register({name:'conversation.view', id, order, label})`）。
- 现有 8 个 view：chat(0，[`apply.ts:390`](../../packages/client/ui-conversation/src/client/apply.ts:390))/kb(10，[`ui-kb index.ts:205`](../../packages/client/ui-kb/src/client/index.ts:205))/market(11)/connectors(12)/kg(13)/business(14)/trajectory(15)。用户口中的「六 tab」= 6 个业务 view（不含 chat）。
- 排序契约：[`ui-trajectory/index.ts:46`](../../packages/client/ui-trajectory/src/client/index.ts:46) 注释明示「业务页 11-14、lens 收尾 15」——新 tab 插入需遵守或显式更新该约定。
- 选中态持久化于每会话 chatStore `view` 字段（未知 id 回落 `DEFAULT_VIEW_ID='chat'`，[`views.ts:7`](../../packages/client/ui-conversation/src/client/contract/views.ts:7)）——旧会话对新 tab id 安全。
- tab 条纯文字无图标；label 惰性求值 `() => bound('view.scenarios')` 跟随语言切换（[`apply.ts:126-129`](../../packages/client/ui-conversation/src/client/apply.ts:126)）。

### 1.5 测试覆盖（迁移必改清单）

| 文件 | 覆盖 | 迁移影响 |
|---|---|---|
| [`ui-kb/tests/kbherodock.client.spec.tsx`](../../packages/client/ui-kb/tests/kbherodock.client.spec.tsx) | 279 行：hero 阶段才渲染/chips 四态/示例问题/确认 Modal/精选 6 卡/分类展开/搜索过滤/`workbenchMounted` 让位（[:37](../../packages/client/ui-kb/tests/kbherodock.client.spec.tsx:37)） | **大改**（props/挂载姿态/渲染条件全变） |
| [`apps/web/tests/kb-workbench.e2e.ts`](../../apps/web/tests/kb-workbench.e2e.ts) | 699 行 Chromium 中文 e2e：blank-session portal hero（headline/chips/样例问题/scenario rail）+ workbench tab 检索/入库 | hero 断言段改写为「场景 tab」断言 |
| [`ui-kb/tests/apply.client.spec.tsx`](../../packages/client/ui-kb/tests/apply.client.spec.tsx) | ui-kb 注册断言（order/label/座位） | 新增 scenarios view 注册断言、删 dock 注册断言 |
| [`ui-conversation/tests/views-type-chain.client.spec.tsx`](../../packages/client/ui-conversation/tests/views-type-chain.client.spec.tsx) | view 环注册形态/order 排序/duplicate id fails loud | 回归 |
| [`apps/web/tests/cold-blank-session.e2e.ts`](../../apps/web/tests/cold-blank-session.e2e.ts) + `snapshots/cold-blank-session/sidebar.expected.md` | 空白会话姿态 | **快照更新**（blank chat 不再含场景门户） |
| [`apps/web/tests/kg-graph-page.e2e.ts`](../../apps/web/tests/kg-graph-page.e2e.ts) / `market-pages.e2e.ts` | 各业务 tab e2e | 回归（UIUX 调整波及） |

### 1.6 样式与 i18n 约定

无 tailwind（全仓 0 命中）；CSS Modules + `clsx` + CSS 变量；设计系统 [`ui-primitives`](../../packages/client/ui-primitives)（Button/Input/Modal/PageHero/PageSkeleton/EmptyState + 自绘 SVG 图标）；四个业务 tab 复用 PageHero 骨架——「uiux都调整下」在此体系内改各 `*.module.css` 与 primitives。i18n：每包 [`locales.ts`](../../packages/client/ui-kb/src/client/locales.ts) zh/en 双字典（key 联合类型约束）+ `declare module LocaleNamespaceMap` 声明合并；字典 parity 由 [`scripts/locale-dictionary-parity.spec.ts`](../../scripts/locale-dictionary-parity.spec.ts) 门禁。

## 2. 方案裁决（详见批次详档 [10-h1](10-h1-scenario-tab.md)）

1. **新增 view `scenarios`（第七业务 tab）**：ui-kb 内注册，order 取 kb(10) 与 market(11) 之间——优先尝试浮点 10.5（若 order 比较实现接受浮点），否则业务 view 整体重排整数并更新 trajectory 排序注释；label「场景/Scenarios」。
2. **KbHeroDock 改造为独立视图组件**（更名 `ScenarioView` 形态）：props 从 `PropsRuntime<'conversation.input.dock'>` 换 `PropsRuntime<'conversation.view'>`（view 座位同样提供 `inputActions.setDraft`，[`KbWorkbench:66`](../../packages/client/ui-kb/src/client/workbench/KbWorkbench.tsx:66) 已示范）；**渲染条件放宽**——去掉 `session.blank && composerPhase==='blank'`（否则有历史的会话里场景 tab 渲染空白），删除 `workbenchMounted` 让位逻辑。
3. **删除 `conversation.input.dock` 的 kb-portal 注册**（座位本身保留——queue/todo/goal 等住户不动）。
4. **KbHeroHeadline 留守 chat**（空白会话标题仍需），场景 tab 自建页头（PageHero 骨架对齐其他业务 tab——正是 UIUX 统一的一部分）；最近搜索 rail 随场景门户迁入场景 tab。
5. **UIUX 调整范围**（「uiux都调整下」落点）：场景 tab 升级为全页形态（分类网格+精选+搜索为页面主体而非 dock 卡片列）；各业务 tab 页头统一 PageHero 骨架；hero.module.css 拆分为场景页样式。
6. **bridge.workbench 退役评估**：第 0 步盘点 [`KbHeaderButton`](../../packages/client/ui-kb/src/client/kbStore.ts:147) 等消费方，若仅剩 workbench 让位一用则整体删除，简化为纯 `setView`。

## 3. 风险

| 风险 | 等级 | 预案 |
|---|---|---|
| 渲染条件语义变化：场景 tab 在非 blank 会话可见后，`selectScenario` 对已有会话调 `agentPresets.select` 的行为未验证 | 中 | H1 第 0 步真机实测（已有会话切场景→起场景→composer 预填）；异常则场景 tab 内对非 blank 会话走「新会话提示」分支 |
| 共享 [`createKbClientStore`](../../packages/client/ui-kb/src/client/kbStore.ts:74) 的 stats 首载触发者改变 | 中 | 迁移后场景 tab 与 workbench 各自 refresh 语义对齐——批次详档第 0 步列三消费点清单逐一核对 |
| [`fillDraft`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx:103) 用 `document.querySelector('textarea')` 全局查找 | 低 | view 座位下常驻 composer 仍可命中；顺手改为事件注入或保留并注明（不扩大改动面） |
| view order 浮点 10.5 不被排序实现接受 | 低 | 第 0 步验证 [`views-type-chain.client.spec.tsx`](../../packages/client/ui-conversation/tests/views-type-chain.client.spec.tsx) 的 order 语义；不接受则整数重排 |
| 快照/e2e 改写遗漏（cold-blank-session 侧栏、hero 断言段） | 低 | 验收断言逐条列在批次详档；doc-sync 联动检查 |
