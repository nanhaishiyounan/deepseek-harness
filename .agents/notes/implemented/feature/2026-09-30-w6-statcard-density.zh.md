# Agent Note: W6 统计卡密度修复（131 卡 420px→146px）

Status: implemented

[English](2026-09-30-w6-statcard-density.md) | 中文

用户反馈「页面的统计卡片都太大」。实测确认：每张卡约 420px 高（占首屏 44%）、约 70% 为空白、表格被完全挤出首屏。

## Problem

W4 的统计卡墙（131 张）过疏：一屏装不下几张卡，密度是 W4 验证轮的头号可用性投诉。

## 根因（三层）

1. 图表渲染器（`plugin-data-visualization` 的 ECharts.tsx）在块未设 `heightMode` 时画布固定 `height: 400`，加卡头即 ~420px。
2. `flowModels` 行的顶层 `decoratorProps.heightMode`（平台的块高度机制）在前端装配层无消费者——运行链读 formily 的 `x-decorator-props`，`flowModels:save` 写入的 decoratorProps 不映射进去（psql/`flowSurfaces:get`/`flowModels:findOne` 三面均返回新值，浏览器仍渲染 400px）。
3. 平台前端产物是 9 月 8 日基线（`dist` 被 git ignore），改 `src` 不生效；须 `yarn build:client-v2` 重建并重启 dev-server（server 内存持有 chunk hash 清单，构建后不重启仍引用旧文件）。

## 修复

- **数据面自控通道**：`statCardRaw` 返回的 ECharts option 增加 `containerStyle: { height: 112 }`；平台 `Chart.tsx` 增加一行透传 `style={option?.containerStyle}`（ECharts.tsx 的 `...style` 展开本就在默认 400 之后，后者被覆盖）。不含该键的图表零影响。图内排版同步压缩（标题 13→12@top8、数字 34→24@top26、脚注 11→10@bottom4）。
- **`metricChart` 工厂**（`nocobase-flow-page-lib.mts`）：新卡默认紧凑（`STATCARD_CHART_HEIGHT = 112`）。
- **存量 131 卡**：`w6-statcard-density.mts`（--dry-run/--run/--assert/--rollback）按 marker 匹配批量重写 raw + 注入 containerStyle，幂等，rollback 快照落 `research/2026-09-29-w5-rework/w6-statcard-density-rollback.json`。
- **产物重建**：`yarn build:client-v2` + 重启 `yarn dev-server`。

## 验证

`demos/acceptance-w5/w6-shot.mjs`（headless CDP + admin 登录）四断言全绿：卡高 146×3、画布 `112px`、表格 top 684→396（进首屏）、首屏可见数据行 3→10；截图 `w6-01-bijia-dense.png` + `w6-shot-meta.json`（AI 目检确认三行层次完整、概览与明细同屏）。`w4-heal-b3 --assert`（94+37 卡 floors）零扰动；定向 oxlint 0 错。

## 固化坑

- 平台前端改动的生效链：`src` 改 → `yarn build:client-v2` → 重启 dev-server（否则页面仍加载旧 hash chunk，形似 BUG-4 模块冻结但根因不同：产物清单在 server 内存）。
- 块 `decoratorProps`（含 heightMode/height）对脚本写入是一条断链通道：数据三面可读、前端不消费；块内自控尺寸走 option `containerStyle`。
- headless 截图冷启动需按 `b8-walkthrough.mjs` 的 signInAs 重试模式等登录表单渲染（单次等待不足）。

## Alternatives considered

- **重做信息架构 vs 最小密度收紧**——IA 已在 W4 定型，投诉点只在密度，选收紧。

## Consequences

成本：收紧后个别卡文案换行。买到：一屏可读；W6 各批统计卡沿用同一密度。
