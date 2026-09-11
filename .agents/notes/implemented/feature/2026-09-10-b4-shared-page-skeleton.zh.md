# Agent Note: B4 共享页面骨架——六页签视觉收敛到 ui-primitives 原子

Status: implemented

[English](2026-09-10-b4-shared-page-skeleton.md) | 中文

> 隶属 [plans/acceptance-fixes-2026-09-10/04-pages-visual.md](../../../../plans/acceptance-fixes-2026-09-10/04-pages-visual.md)。任务书强制要求的三个设计技能（high-end-visual-design、redesign-existing-projects、ui-ux-pro-max）已在动工前加载并驱动下述审计。

## Problem

六个视图页签各自持有页面骨架的私有副本（`hero/heroTitle/heroTagline`、`errorStrip`/`failure`、`emptyState/emptyTitle/emptyHint`、`*Skeleton`），且副本已经漂移：hero 标题 market/workbench 用 `--dsw-font-xl-24` 而 kg/business 用 `--dsw-font-l-20`；错误条四个域用 `label-primary` 文字、kb 工作台却另起 `failure` 配方（error-secondary 填充）；空态存在三种 padding/对齐版本。漂移之外，审计实证了用户拒绝的"AI 模板感"指纹：空态是虚线框里两行文字、无图标无行动位；骨架是单个纯色矩形；徽章全部 999px 圆 pill；卡片是无 hover 浮起的同构平面贴片；除 kg 分栏外布局全是 860px 单列。任务书"token 未充分消费"的前提已不成立——B2/B3 已把域 CSS 全部 token 化。

## Decision

### 四件共享原子落 ui-primitives，各域删除副本

`PageHero`（eyebrow → `h2` 标题 → tagline → tabular-nums 计数行 → 尾部插槽，持有统一的 `--dsw-font-l-20` 标题字阶）、`EmptyState`（business-teriary 方形容器承载细线图标 + 主文案 + 提示行 + 行动位）、`ErrorStrip`（`role="alert"`、警示图标、消息、重试插槽）、`PageSkeleton`（按内容形态做结构预视——列表行且首行更窄、卡格、整块——复用 ui-theme 相位相对的 pulse/shimmer 关键帧，自带 `aria-hidden`，`aria-busy` 由调用方包在自有包裹层）。全部取值为既有 `--dsw-*` token 的明暗两段；对五个域 module 的 grep 计数显示 hero/errorStrip/emptyState/skeleton 类定义已归零（此前每域四到六处）。

### 不新增主题 alias

任务书建议的 `--dsh-alias-surface-raised` 候选值在两主题均与 `bg-layer-1/2` 重复——新增只增加 token 数不增加语义。各域直接消费既有抬升面 token（`bg-layer-1/2` + `border-l1` + `--dsw-shadow-lv1-blur` hover 微升），正是设计方向要的抬升面观感。

### 逐页收口走共享语言

市场：精选栏与资产卡抬升面 + hover 微升、徽章方角化（5px）取代 pill、选中 kind chip 上底色。连接器：provider 行抬升 hover、接入引导用品牌色框。图谱：详情面板卡片化、未构建/空画布结构化带图谱图标。业务：实体卡多列网格、表格头 sticky + layer-2 底色。kb 工作台：命中卡抬升、用量指标以发丝线分隔、空文档态图标化。`PageHero.eyebrow` 复用各域既有 `view.*` locale key，零新增文案。tab ring（ui-conversation 装配与 ConversationSession 渲染）按任务书边界裁决不动。

### B3 遗留 token 修复

`hero.module.css` 引用了未定义的 `--dsw-font-xxxs-12`（字阶只有 xxxs-11/xxs-12），改为 `xxs-12` 后 css-tokens 门禁通过。

## Alternatives considered

- **只提取共享 CSS module 而不做组件**——否决：漂移同样存在于标记结构与字阶，纯 CSS 提取仍留六份 JSX 副本可继续漂移；原子把 DOM 约定一并钉死。
- **给 EmptyState 加 tone prop 支持各域着色**——否决：六个消费方全是中性引导，需求出现之前该轴是投机。
- **逐页大改版（非对称网格、入场动画）**——刻意排除在数据工作台之外：技能里的营销页手法（bento 破格、滚动揭示）与高密度企业数据相冲；方向选择结构层级与三态质感。

## Consequences

- 域 CSS 净减（market −70、connectors −42、kg −27、business −40、workbench −45 行），四件原子在 ui-primitives 新增约 120 行专注实现；六页签的页头/错误/空/加载呈现不再可能各自漂移。
- `verify-client-domain-graph` 保持全绿：共享只经 ui-primitives，无域间互引。
- 真实服务端取证：`examples/kb-agent/demos/acceptance-b4/b4-capture.mjs` → 13 张 PNG（六页签 × 明暗 + 上传对话框），console 与 page error 为零，暗色经真实设置面板外观方块切换；对真实组合服务端的上传链路渲染完成行（`done rows = 1`）。
- 已知既有失败、非本批引入：`kb-workbench.e2e.ts` 三个 "uploads…" 用例在 stash 本批前端改动并从源码重建 web 产物后同样失败（含/不含 B4 均 3 failed / 11 skipped），即失败先于 B4 存在于工作区（B1–B3 或环境），留给收口批次。
- `docs/web-styling.md` 新增规则：视图页签的页面四态由这些原子组合，不得在域内重复声明骨架类。
