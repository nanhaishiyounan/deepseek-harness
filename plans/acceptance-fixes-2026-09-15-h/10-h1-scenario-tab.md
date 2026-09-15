# 批次 H1：场景 Tab 独立化 + 全 tab UIUX 调整

> 隶属 [PLAN.md](PLAN.md)。主题一完整交付。前置：无。调研依据 [01](01-research-scenario-tab.md)。规模：ui-kb 包内为主，壳层零改动；~8 文件改 + 2 测试文件大改。

## 第 0 步（动手前探查，必做）

1. **view order 类型验证**：查 `conversation.view` slot 注册的 order 比较实现（[`ui-conversation/tests/views-type-chain.client.spec.tsx`](../../packages/client/ui-conversation/tests/views-type-chain.client.spec.tsx) 的排序语义）——浮点 10.5 可行则用之；不可行则业务 view 整体重排整数（kb=10, scenarios=11, market=12, connectors=13, kg=14, business=15, trajectory=16）并**同步更新 [`ui-trajectory/index.ts:46`](../../packages/client/ui-trajectory/src/client/index.ts:46) 的排序契约注释**与各包 apply 断言。
2. **bridge.workbench 消费方盘点**：全库搜 `bridge.workbench|settleWorkbench|KbHeaderButton`——若 workbench 让位是唯一用途，连同 [`kbStore.ts:140`](../../packages/client/ui-kb/src/client/kbStore.ts:140) 镜像整体退役；若 KbHeaderButton 等仍依赖 `setView`，保留 view 桥删让位镜像。
3. **stats 首载链核对**：列 [`createKbClientStore`](../../packages/client/ui-kb/src/client/kbStore.ts:74) 三消费点（侧栏入口/hero/工作台）迁移后的 refresh 触发时序，保证场景 tab 与工作台 tab 不重复请求不遗漏。
4. **真机基线**：:3080 登录后逐 tab 截图（chat 空白/kb/market/connectors/kg/business/trajectory）作 before 证据。

## 改动面 1：新增「场景」view（第七业务 tab）

- [`ui-kb/src/client/locales.ts`](../../packages/client/ui-kb/src/client/locales.ts)：新增 `view.scenarios`（zh「场景」/en「Scenarios」）；zh/en 双字典同步（[`locale-dictionary-parity.spec.ts`](../../scripts/locale-dictionary-parity.spec.ts) 门禁）。
- [`ui-kb/src/client/index.ts:205`](../../packages/client/ui-kb/src/client/index.ts:205) 旁新增 `conversation.view` 注册（id `scenarios`，order 第 0 步裁决，label 惰性求值），视图组件指向改造后的场景视图。

## 改动面 2：KbHeroDock → 场景视图组件

- 组件迁移改造（建议新文件 `ui-kb/src/client/scenarios/ScenarioView.tsx` + `scenarios.module.css`，原 [`hero/`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx) 骨架复用）：
  - props 从 `PropsRuntime<'conversation.input.dock'>` 换 `PropsRuntime<'conversation.view'>`（view 座位提供 `inputActions.setDraft`，[`KbWorkbench:66`](../../packages/client/ui-kb/src/client/workbench/KbWorkbench.tsx:66) 示范）；
  - **渲染条件放宽**：删除 `session.blank && composerPhase==='blank'`（[`KbHeroDock.tsx:86-87`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx:86)）——场景 tab 在任何会话状态渲染完整内容；删除 `workbenchMounted` 让位分支；
  - 页头改用 [`ui-primitives`](../../packages/client/ui-primitives) PageHero 骨架（对齐其他业务 tab），保留标题「食品产业知识库问答」语义迁移为「场景中心」定位（文案 zh/en）；
  - 内容重组为全页形态：用量 chips 行 + 精选 6 场景卡 + 8 分类浏览网格 + 实时搜索 + 最近搜索 rail；
  - 场景确认 Modal 与 `selectScenario`（[`index.ts:196`](../../packages/client/ui-kb/src/client/index.ts:196)）保持——第 0 步验证非 blank 会话选场景行为（`agentPresets.select` 对已有会话）。
- [`scenarios.ts`](../../packages/client/ui-kb/src/client/hero/scenarios.ts) **不动**（30 场景/8 分类/纯函数原样引用；[`scenario-catalog-sync.spec.ts`](../../scripts/scenario-catalog-sync.spec.ts) 门禁不受影响）。

## 改动面 3：退役 dock 挂载

- 删除 [`conversation.input.dock` 的 kb-portal 注册](../../packages/client/ui-kb/src/client/index.ts:187)（座位声明不动——queue/todo/goal 住户保留）。
- [`KbHeroHeadline`](../../packages/client/ui-kb/src/client/hero/KbHeroHeadline.tsx) **留守** chat hero（空白会话标题仍需）；blank chat 会话保留 headline+简洁引导（示例问题入口移除或保留一枚？裁决：保留 headline+tagline+示例问题两枚 ghost 按钮，移除场景门户整段——场景门户只属于场景 tab）。
- 原文件清理：[`KbHeroDock.tsx`](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx) 迁移后删除或收缩为 re-export（避免双份）；`hero.module.css` 拆分。

## 改动面 4：UIUX 收口（「uiux都调整下」）

- 各业务 tab（market/connectors/kg/business/kb）页头统一 PageHero 骨架与间距节奏（各包 `*.module.css` 微调，不改信息架构）；
- 图谱 tab 质量面板/规则清单在 [30-h3](30-h3-kg-quality-query.md) 批叠加，本批只做骨架统一；
- tab 条文案核对（zh/en）。

## 验收断言（证据落 `examples/kb-agent/demos/acceptance-h1/`）

1. **七业务 tab**（kb/场景/market/connectors/kg/business/trajectory，+chat 共 8 view）：tab 条顺序与文案正确（中文环境截图）；
2. **场景 tab 独立完整**：非 blank 会话（有历史的会话）切到场景 tab 仍渲染全量内容（chips/精选 6/分类 8/搜索/最近搜索）；精选卡「AI 营销洞察主管」可见；点击示例问题 composer 预填；场景确认 Modal 起场景成功；
3. **其他 tab 无 hero**：连接器/图谱/业务/资产 tab 截图证明无场景门户（用户核心诉求）；blank chat 保留 headline+示例问题但无场景门户整段；
4. **旧会话安全**：迁移前持久化的会话 `view` 字段（可能存 kb 等）正常回落渲染；无 console 报错；
5. **测试**：[`kbherodock.client.spec.tsx`](../../packages/client/ui-kb/tests/kbherodock.client.spec.tsx) 改写后全绿（渲染条件/四态 chips/Modal/精选/分类/搜索断言迁移）；[`kb-workbench.e2e.ts`](../../apps/web/tests/kb-workbench.e2e.ts) hero 断言段改写为场景 tab 断言后全绿；[`cold-blank-session`](../../apps/web/tests/cold-blank-session.e2e.ts) 快照更新后全绿；[`apply.client.spec.tsx`](../../packages/client/ui-kb/tests/apply.client.spec.tsx) 新增 scenarios 注册断言；kg-graph/market e2e 回归全绿；
6. **门禁**：`pnpm run typecheck && pnpm run lint` EXIT=0；doc-sync 涉及面（[examples/kb-agent/WEBSITE.md](../../examples/kb-agent/WEBSITE.md) 若提及 hero 位置则同步）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| 非 blank 会话 `selectScenario` 行为未验证 | 中 | 第 0 步真机实测；异常则场景 tab 对非 blank 会话先切新会话再 select（产品语义：场景=新会话起点） |
| stats 共享 store 首载时序 | 中 | 第 0 步清单核对；场景 tab 与 kb tab 各自挂载 refresh 一次（幂等） |
| 整数重排波及 5 包 apply 断言 | 低 | 仅浮点不可行时触发；一次性小批改完+回归 |
| 快照链遗漏 | 低 | 验收断言 5 逐条跑；sidebar.expected.md 双语两态核对 |

回滚：H1 单提交（含测试与快照），revert 即回「hero 挂 dock」基线。
