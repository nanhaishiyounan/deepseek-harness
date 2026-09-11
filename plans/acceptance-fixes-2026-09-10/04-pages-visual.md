# 批次 B4：全页面视觉提升（六页签 + 侧栏入口一致性）

> 隶属 [PLAN.md](PLAN.md) §1.3 根因、§4 决策 7/8。前置：B3（hero IA 已定，本批含 kb 工作台的视觉收口）。

**目标**：市场/连接器/图谱/业务/知识库/对话六页签整体提升设计感与一致性——共享页面骨架沉淀到 ui-primitives，六域样式收敛到 design tokens，空态/骨架/错误条达到统一质感；明暗两套主题均达标。

## ⚠️ 实施子任务强制要求：加载执行设计技能

同 [B3](03-scenario-ia.md)：动工前必须加载并遵循 **ui-ux-pro-max**、**high-end-visual-design**、**redesign-existing-projects**（~/.roo/skills/）。本批重点用 high-end-visual-design 的排版/间距/阴影/卡片结构标准与 redesign-existing-projects 的审计先行纪律；ui-ux-pro-max 提供表格/表单/图表/空态等组件级准则。

## 现状问题清单（证据，来自调研）

1. **六处复制的页面骨架**：`hero/toolbar/emptyState/errorStrip/*Skeleton` 同名 class 在 [ui-assets](../../packages/client/ui-assets/src/client/MarketView.tsx)/[ui-kb](../../packages/client/ui-kb/src/client/workbench)/[ui-connectors](../../packages/client/ui-connectors/src/client/ConnectorsView.tsx)/[ui-kg](../../packages/client/ui-kg/src/client/KgView.tsx)/[ui-business](../../packages/client/ui-business/src/client/BizView.tsx) 各自实现（域级 module.css 合计 ~2200 行：market 461 / workbench 532 / hero 296 / kg 422 / business 276 / connectors 242）——一致性靠约定，漂移已成事实。
2. **空态/骨架简陋**：空态两行文字（[BizView.tsx:146-149](../../packages/client/ui-business/src/client/BizView.tsx)）；骨架纯色 div（[MarketView.tsx:151-156](../../packages/client/ui-assets/src/client/MarketView.tsx)）。
3. **布局单一**：全部单列纵向流；唯 kg 有画布分栏（[KgView.tsx:174](../../packages/client/ui-kg/src/client/KgView.tsx) `mainSplit`）。
4. token 体系已就绪未充分消费：[design-platform.css](../../packages/client/ui-theme/src/styles/design-platform.css)（365 行，`--dsw-static-*` 静态色板+`--dsh-alias-*` 语义别名）。

## 设计红线（违反即返工）

- 禁组件库、禁 Tailwind（[docs/web-styling.md](../../docs/web-styling.md)）；CSS Modules + clsx + alias token。
- 域包之间禁互引（[verify-client-domain-graph.ts](../../scripts/verify-client-domain-graph.ts)）——共享件只能落 **ui-primitives**（或 ui-slots）；域内共享走 `contract/` 层。
- 明暗主题分支归 ui-theme owner，域内不得写死颜色（消费 alias token）。
- tab ring（[ui-conversation](../../packages/client/ui-conversation/src/client/apply.ts) 的 conversation.view 装配与 [ConversationSession.tsx](../../packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx) 渲染）**本批不动**——避免波及 navigation-panes 等 Chat/Trajectory 断言批次。
- 视觉主色系沿用 `--dsw-static-deepseek-*`（[design-platform.css:22](../../packages/client/ui-theme/src/styles/design-platform.css)）；品牌标识遵守 [BRAND_GUIDELINES.zh.md](../../BRAND_GUIDELINES.zh.md)（商标规范：可用"DSH"缩写，非视觉稿）。

## 改动面清单

| 层 | 改动 | 说明 |
|---|---|---|
| [packages/client/ui-primitives](../../packages/client/ui-primitives) | 新增共享页面骨架件：`PageHero`（标题+tagline+徽标位）、`EmptyState`（图标+主文案+行动位）、`ErrorStrip`（结构化错误呈现）、`PageSkeleton`（骨架屏）——API 为纯 props 展示件，随附 module.css（alias token） | 消除六处复制；各域替换消费 |
| ui-assets（MarketView） | 消费共享骨架；目录卡视觉升级（kind 徽标/定价/供方层级排版）；筛选 chips 与 load-more（[MarketView.tsx:25](../../packages/client/ui-assets/src/client/MarketView.tsx)）交互质感 | 下单确认卡/回执同步微调 |
| ui-connectors（ConnectorsView） | 消费共享骨架；通道卡与"文件投递目录"信息层级优化 | |
| ui-kg（KgView） | 消费共享骨架；图例/详情面板/短语框排版与画布分栏比例优化；空图态给引导（B2 已保证默认有图，此处为降级路径质感） | sigma 画布本身不动 |
| ui-business（BizView） | 消费共享骨架；卡片/表格切换（[BizView.tsx:155-156](../../packages/client/ui-business/src/client/BizView.tsx)）与对象切换器视觉升级 | |
| ui-kb（workbench + B3 后的 hero） | 消费共享骨架；检索结果/引用卡/用量卡排版统一 | hero 门户视觉由 B3 定，本批收口 workbench |
| 各域 module.css | 删除被共享件替代的重复规则；全部颜色/间距/圆角/阴影收敛 alias token | 目标域级 CSS 净减 |
| [ui-theme/src/styles](../../packages/client/ui-theme/src/styles) | 如需新增 alias（如 `--dsh-alias-surface-raised`）在此层加；明暗两套值 | token 所有权归 theme owner |
| 受影响测试 | [marketview.client.spec.tsx](../../packages/client/ui-assets/tests)/[kbworkbench.client.spec.tsx](../../packages/client/ui-kb/tests) 等域单测、[css-tokens.client.spec.ts](../../packages/client/ui-theme/tests/css-tokens.client.spec.ts)、[kb-workbench.e2e.ts](../../apps/web/tests/kb-workbench.e2e.ts) 与 [market-pages.e2e.ts](../../apps/web/tests/market-pages.e2e.ts) 的 class/文案断言（recentRow 等 [class*] 选择器若结构变化需同步） | 同 PR 更新 |

## 实施步骤（建议两刀）

1. **第一刀·骨架沉淀**：ui-primitives 四件 + 各域替换 + 域单测更新 → `pnpm run build:lib:client && pnpm run build:web` → test:web 全绿 → 截图六页签基线（明暗）。
2. **第二刀·逐页视觉**：按 市场 → 连接器 → 图谱 → 业务 → kb 工作台 顺序逐页升级（每页一提交，便于二分回滚）；每页完成即起服截图比对（明暗两套）。
3. 全程 dev server 实测：`DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml --no-open`（:3080）；源码迭代用 `pnpm run dev:web` HMR，提交前走完整 build（BUG-4）。
4. 截图脚本仿 [n17-capture.mjs](../../examples/kb-agent/demos/nocobase-full-features/n17-capture.mjs)：Playwright `shot()` ready-poll+settle，PNG 落 `examples/kb-agent/demos/` 本批目录，命名 `N<序号>-<页>-<light|dark>.png`。

## 幂等要求

纯前端改动，无数据/初始化面。

## 验收断言（可自动化，防假阳）

1. `pnpm run test:web` 全绿（六页签相关 e2e：kb-workbench / market-pages / navigation-panes 等全部不回归——tab ring 未动则 Chat/Trajectory 批次免改）。
2. `pnpm run verify-client-packages`（包边界）+ `pnpm run typecheck && pnpm run lint` EXIT=0；[css-tokens.client.spec.ts](../../packages/client/ui-theme/tests) 全绿（新增 alias 若改变 token 清单需同步该 spec）。
3. `pnpm run doc-sync` EXIT=0（ui-primitives 新增件 README、web-styling.md 若有规则更新）。
4. **截图证据**：六页签 × 明暗 = ≥12 张 PNG 落 demos/（真实 dev server，非 mock）；图谱页截图同时充当 B2"打开即有图"的视觉证据。
5. 视觉审查清单（实录勾选）：每页空态/加载态/错误态三态均有设计呈现（不再是两行文字/纯色块）。

## 测试与文档同步

- Agent Note：共享骨架沉淀决策（哪些 class 收敛、alias 新增清单、tab ring 不动的边界裁决）。
- ui-primitives README（三语）新增件契约；docs/web-styling.md 若新增页面骨架使用规范则同步。

## 回滚

按页分提交，可逐页 revert；ui-primitives 新增件独立无副作用（未被消费前不打包进产物）。
