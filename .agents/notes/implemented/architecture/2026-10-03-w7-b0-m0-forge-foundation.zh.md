# Agent Note: W7-B0+M0「铸造」设计语言基座（PC 主题行 + globalStyle + mobile 令牌双轨）

Status: implemented

[English](2026-10-03-w7-b0-m0-forge-foundation.md) | 中文

用户反馈：「生成的页面难看！原来的也难看！mobile也难看！！」W7 全站换肤；B0+M0 是杠杆最高的一批——一行主题 + 一个令牌文件，不动页面结构即重绘 114 个 PC 页面单元与 mobile 壳。

## Problem

全站 242 路由跑在 antd 默认蓝的 mfg-standard 基线（零品牌语言），mobile v6 审计记十项缺陷——任何页面开工前，需要先立一套设计语言与双端令牌基座。

## 决策

- **PC 层 1**（[`examples/kb-agent/scripts/w7b0-theme.mts`，套 w5b6-theme 三模式 `--apply/--assert/--rollback`）：新建 themeConfig 行 `w7-forge`（default）——普鲁士深蓝 `#1E4E8C` 主色带 hover/active 阶、Fiori Morning Horizon 语义五态、暖灰中性阶、`colorBgSider #16304F`、`colorBgLayout #F6F6F4`。`mfg-standard` demote 为 `default=false` 但保留 user-optional；内置主题不动。回滚快照：`research/2026-10-03-w7-rework/b0/w7-b0-theme-rollback.json`。
- **PC 层 2**（同一行的 `config.token.globalStyle`）：`--w7-*` 令牌全集（品牌/语义/中性/图表序列/几何/海拔/字阶/动效——后续 JSBlock 批次的引用锚点）+ 全站组件基底：表头 13/600 底 `#FAFAF9`、斑马 + hover tint、`tabular-nums`、Tag 胶囊化且 preset 类重映射为语义 soft 配对、卡片圆角 8 + 弥散阴影、按钮按压/focus 环、滚动条。
- **用户主题固化清除**：`systemSettings.themeId` 优先于 default 行（InitializeTheme 先读用户设置）。`nocobase` 与 `qc_inspector` 固化在 themeId 3（Compact）——新 default 到不了他们。读-改-写清除并保留其他键；前值存 `w7-b0-user-themeid-rollback.json`。
- **mobile M0**（[`packages/client/ui-mobile/src/client/tokens.css` 重写）：同源 `#1E4E8C` 品牌（暗轨 `#2A5FA6`）、brand2 撤换为同源序列第二阶 `#3A69A4`、语义五态对齐 PC（暗轨去饱和提亮）、三档海拔（画布 `#EAEBE8` / 白卡 + 弥散影 / 浮起影——实测 RGB 阶差 8.4%）、字阶五档 `--dshm-fs-*`、`--adm-font-size-1..10` 全映射、圆角 8/12/16。TabBar 标签 10.5px → `var(--dshm-fs-xs)`（12px 下限）。18 个 `*.module.css` 共 315 处字号/圆角硬编码收拢到令牌。每组改动后重跑构建链（`build:lib:client` + `build:web`）。

## 验证

- `w7b0-theme --assert` OK（uid/default/colorPrimary/globalStyle 令牌、唯一 default 行、mfg-standard 存活、4 内置主题）。
- PC DOM probe（5 代表页）：主按钮 `rgb(30,78,140)`、表头字重 600、Tag soft 底 + `999px` 胶囊、卡片圆角 8——全过；JSBlock/v1 页组件缺失处记 `n/a`。
- mobile DOM probe：Tab 12px/600、激活 Tab `#1E4E8C`、海拔阶差 8.4%、statValue 24px、statLabel 12px、暗轨重绘、375×667 四 Tab 无横向溢出。
- `pnpm vitest run packages/client/ui-mobile`：43 文件 / 668 测试全过。`tsc -b tsconfig.client.json` 干净；新脚本定点 oxlint 0/0。
- 证据：114 页 before 基线（`research/2026-10-03-w7-rework/b0/before/`，111 flowPage + 3 v1）、19 张 after（`after/`）、mobile 16 面 after（`../m0/after-mobile/`）、并排对比 `demos/acceptance-w7/w7-b0-01..11-*` 与 `w7-m0-01..08-*`。

## 坑位钉死

- **只切 default 行不等于全站换肤。** InitializeTheme（`plugin-theme-editor/src/client/components/InitializeTheme.tsx`）优先取 `currentUser.systemSettings.themeId`；选过主题的用户永远保留旧选。任何 default 切换后都要扫 `users:list` 的 `systemSettings.themeId`。
- **globalStyle 与 seed token 走独立生效路径。** 固化主题下页面会出现 w7-forge 的 globalStyle 覆写（卡片圆角 8）而 antd 仍渲染色固化行颜色——劈叉态会误导视觉检查。
- **admin 账号一直跑的是 Compact（themeId 3），不是 mfg-standard。** 两者都渲 antd 蓝 `#1677FF`，W5 审计「跑在 mfg-standard」的说法无法用颜色区分验证；同色主题在截图里不可区分。
- 审计路由 flat 清单的 uid 截断到 10 字符；以 `api-desktopRoutes.json`（或 live API）核对完整 uid。页面 census 只覆盖 flowPage——v1 `page` 路由要自带常量。
- 遗漏页的 before 基线纯净协议：`--rollback` → 截图 → `--apply` → `--assert`（三模式幂等脚本使该协议安全）。
- 换肤后 `#1677ff` 残留：样式表规则计数 13–15 → 9–12 但未清零；来源是 JSBlock 页内硬编码（层 3b，B5）与未渲染的库规则。断言落在可见面的 computed style，而非只扫规则文本。
- 复制研究脚本里的相对 playwright 导入：audit 目录深度（`../../apps/...`）在 `w7-rework/<batch>/` 下差一级——用 `../../../apps/...`。

## 备选方案

- **原地改 `mfg-standard` vs 新建 `w7-forge` 行**——新行保住 W5 行与回滚面；真正触达固化用户的是固化清除，不是行的选择。
- **逐页 CSS 补丁 vs 令牌基座**——计划的杠杆论证成立：一行 + 一串字符重绘了全部抽查面，未动 114 个页面 schema。

## 后果

- 后续批次读 `--w7-*`（PC JSBlock/schema heal）与 `--dshm-fs-*`/`--dshm-radius-*`（mobile M1/M2），不再写硬编码值；两个令牌文件是双端唯一色源。
- mobile 首页仍有 21 个品牌色元素（8 个 quickChip 主按钮，button+span 双计）——记为 M1 hero 减蓝基线，非 M0 失败。
- 字阶收拢放大的 hero 数字（22→24px）等 315 处合并值需要 M1/M2 视觉复核；vitest 对样式不可见。
