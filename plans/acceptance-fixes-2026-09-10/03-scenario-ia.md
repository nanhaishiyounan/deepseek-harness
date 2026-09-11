# 批次 B3：30 场景信息架构治理（hero 门户重设计第一刀）

> 隶属 [PLAN.md](PLAN.md) §1.3 根因、§4 决策 6/8。前置：无硬依赖（建议在 B2 后串行以控风险）。

**目标**：blank 会话 hero 门户的 30 个场景卡不再全量平铺——重新设计信息架构（精选 + 分类收纳 + 检索），保证任何视口首屏只呈现少量精选场景，其余经分组/搜索可达。

## ⚠️ 实施子任务强制要求：加载执行设计技能

动工前必须依次加载并遵循以下技能（位于 `~/.roo/skills/`）：

1. **ui-ux-pro-max**——信息架构与交互模式参考（本批重点：导航/分组/检索的 UX 准则、卡片设计规范）；
2. **high-end-visual-design**——视觉质感标准（排版层级、间距节奏、卡片结构；禁模板化默认样式）；
3. **redesign-existing-projects**——既有项目改造纪律（先审计现状、不破坏功能、渐进升级）。

技能工作流由实施子任务执行；本批验收同时校验设计产出质量（截图评审）与门禁全绿。

## 现状（证据）

- 30 条场景硬编码于 [`KB_SCENARIOS`](../../packages/client/ui-kb/src/client/hero/scenarios.ts)（:42-333），8 分类 `KB_SCENARIO_CATEGORIES`（:34）；与 `examples/kb-agent/scenarios/<id>/preset.yml`（30 个目录，实测确认）人工同步，双门禁锁死：[scenario-catalog-sync.spec.ts:37](../../scripts/scenario-catalog-sync.spec.ts)（AST 比对 id 集合）+ [scenarios.spec.ts:156](../../examples/kb-agent/tests/scenarios.spec.ts)（`toHaveLength(30)`）。
- 渲染：[KbHeroDock.tsx:109-148](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx) `scenariosByCategory()`（[scenarios.ts:350](../../packages/client/ui-kb/src/client/hero/scenarios.ts)）按 8 分类分组后**组内全量平铺**，无检索/分页/折叠；计数文案「{n} 个场景 · 滚动查看」（[locales.ts:139](../../packages/client/ui-kb/src/client/locales.ts)）；样式 [hero.module.css:118,273-288](../../packages/client/ui-kb/src/client/hero/hero.module.css)（flex-wrap 平铺，仅宽屏变横滚）。
- 点击链路：卡 → `agentPresets.select`（[ui-kb index.ts:196](../../packages/client/ui-kb/src/client/index.ts)）→ 确认 Modal → probe 填 composer——**此链路不得改变**。

## 信息架构设计要求（实施时由设计技能细化，以下为验收底线）

1. **精选区**：首屏 ≤6 张精选场景卡（按业务价值人工圈定，如 market-insight / food-safety-service / cold-chain / cost-pricing / export-compliance / supply-chain-finance；精选标记加在 scenarios.ts 数据结构上，如 `featured: true` 字段）。
2. **分类收纳**：其余场景按 8 分类收纳（可折叠分组 / 分类 chip 切换 / tab——形式由设计技能定夺，验收锁"默认视口内可见卡片数 < 10"）。
3. **检索**：提供场景搜索框（按名称/关键词前端过滤；中文输入即时过滤，断言输入关键字后可见卡数 < 30 且 > 0）。
4. **可达性不回退**：全部 30 个场景在 ≤2 次交互内可达；场景 id 集合与 preset.yml 对应关系不变（双门禁不破坏）。
5. **数据模型不动后端**：仍是静态 KB_SCENARIOS + agentPresets roster；本批不新增 API。

## 改动面清单

| 文件 | 改动 |
|---|---|
| [packages/client/ui-kb/src/client/hero/scenarios.ts](../../packages/client/ui-kb/src/client/hero/scenarios.ts) | 每条加 `featured` 标记（或独立 FEATURED_IDS 常量）；不改 id/分类结构 |
| [packages/client/ui-kb/src/client/hero/KbHeroDock.tsx](../../packages/client/ui-kb/src/client/hero/KbHeroDock.tsx) | 信息架构重构：精选区 + 收纳区 + 搜索状态（React state，纯前端） |
| [packages/client/ui-kb/src/client/hero/hero.module.css](../../packages/client/ui-kb/src/client/hero/hero.module.css) | 新布局样式；只消费 `--dsh-alias-*` token（[docs/web-styling.md](../../docs/web-styling.md) 红线） |
| [packages/client/ui-kb/src/client/locales.ts](../../packages/client/ui-kb/src/client/locales.ts) | 新文案键（精选/搜索 placeholder/分类计数）；更新「{n} 个场景 · 滚动查看」 |
| [apps/web/tests/kb-workbench.e2e.ts](../../apps/web/tests/kb-workbench.e2e.ts) | 更新受影响断言：:393/:407 hero 文案、**:412/:423/:454 '30 个场景' 字面**（改为新 IA 文案，如 `/30 个场景/` 保留总数语义但呈现于收纳区标题）、:416-431 场景卡交互（精选卡直达 + 收纳后经分类展开再点卡，两路径都断言）；新增检索交互用例（输入『食安』→ 可见卡数减少且含『AI 食安服务主管』） |
| [packages/client/ui-kb/tests](../../packages/client/ui-kb/tests) | 域单测同步（场景分组/过滤纯函数若有抽出则直测） |

## 实施步骤

1. 加载三个设计技能，产出审计+设计方向（落本批实录）。
2. scenarios.ts 加 featured 标记（跑一次 scenario-catalog-sync 确认门禁不涉新增字段）。
3. KbHeroDock 重构（精选/收纳/检索三区）+ hero.module.css + locales。
4. 同 PR 更新 kb-workbench.e2e.ts 断言 + 新增检索用例。
5. `pnpm run build:lib:client && pnpm run build:web`（BUG-4 契约）→ 起服实测。
6. 截图：改造前后对比 + 收纳展开态 + 检索过滤态（Playwright，仿 [n17-capture.mjs](../../examples/kb-agent/demos/nocobase-full-features/n17-capture.mjs) 的 shot() 模式，PNG 落 `examples/kb-agent/demos/` 本批目录）。

## 幂等要求

纯前端改动，无数据/初始化面。

## 验收断言（可自动化，防假阳）

1. `pnpm run test:web -- -t kb-workbench` 全绿（含更新后断言 + 新检索用例：**过滤后可见卡数 < 30 且 > 0**）。
2. `pnpm --filter @deepseek-ai/dsh-client-ui-kb test`（若域单测存在）+ `pnpm run typecheck && pnpm run lint` EXIT=0。
3. `node --import tsx/… scripts/scenario-catalog-sync.spec`（经 `pnpm run test` 跑）与 `examples/kb-agent/tests/scenarios.spec.ts` 双门禁全绿（id 集合 30 不变）。
4. 视口断言（e2e 内实现）：默认 1280×800 视口下 hero 区可见场景卡 ≤ 10（精选+收纳收起态）。
5. 截图证据 ≥3 张（前后对比/展开/检索）落 demos/ 目录，PLAN 勾选时引用路径。
6. 零 console error/warning（kb-workbench 全局门禁 :251-259 不变）。

## 测试与文档同步

- Agent Note：hero 信息架构重构决策（精选圈定依据、收纳形式选型）。
- ui-kb README（三语）「已知限制」中"静态展示表"条目更新（仍静态，但呈现 IA 已治理）。

## 回滚

前端 commit 还原即回滚（scenarios.ts 的 featured 字段可保留无害）。
