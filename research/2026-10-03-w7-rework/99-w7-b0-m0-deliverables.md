# W7-B0+M0 交付索引：「铸造」设计语言全局基座（PC + mobile 双线首发）

> 批次：plan-w7.zh.md §4 B0（层 1+层 2）+ M0（mobile 令牌双轨）。实施 2026-10-03。

## 改动文件

| 文件 | 内容 |
|---|---|
| `examples/kb-agent/scripts/w7b0-theme.mts` | 新建：w7-forge 主题行三模式脚本（--apply/--assert/--rollback） |
| `packages/client/ui-mobile/src/client/tokens.css` | 重写：W7 双轨令牌（#1E4E8C 同源品牌 / 语义五态 / 三档海拔 / 字阶五档 / --adm-font-size 全映射 / 暗轨去饱和） |
| `packages/client/ui-mobile/src/client/shell/shell.module.css` | TabBar 标签 10.5px → var(--dshm-fs-xs)（12px 下限） |
| 18 个 `*.module.css`（agents/alerts/docs/files/forms×3/home/kg/login/messages×3/profile/tasks/todos/ui/work） | 315 处 font-size/border-radius 硬编码收拢到 --dshm-fs-*/--dshm-radius-* |
| `.agents/notes/implemented/architecture/2026-10-03-w7-b0-m0-forge-foundation.{md,zh.md,i18n.yaml}` | Agent Note 三件套 |

## 令牌清单摘要

- PC 层 1（themeConfig `w7-forge` seed token）：colorPrimary #1E4E8C（hover #2A5FA6 / active #173D70）、success #256F3A、warning #E76500、error #AA0808、info #0070F2、link=主色三阶、text #1F2630/#55606E/#8A94A0、border #D8D8D5/#E8E8E6、bgLayout #F6F6F4、bgSider #16304F、borderRadius 6、fontSize 14、fontFamily 系统栈。
- PC 层 2（globalStyle `--w7-*`）：品牌三阶+soft、语义五态 fg/bg、中性 8 值、图表序列 6+1、圆角 card8/control6/tag999/badge4、阴影 card/raised、字阶 12/13/15/18/28、动效 160ms + ease。组件基底：表头 13/600、斑马、hover tint、tnum、Tag 胶囊+preset soft 重映射、卡片 8px+弥散影、按钮按压/focus 环、滚动条、reduced-motion。
- mobile（tokens.css）：--dshm-primary #1E4E8C（暗轨 #2A5FA6）、brand2 #3A69A4、语义五态对齐 PC（暗轨 success #5BAE7D / warning #F2A93B / destructive #EF5F64）、背景 #EAEBE8（对白卡 RGB 阶差 8.4%）、radius 8/12/16、shadow-card/raised、fs-xs..xl 12/13/15/17/24 + num 26、--adm-font-size-1..10 = 9/11/12/13/14/15/17/20/24/28。

## 证据链

| 类别 | 路径 |
|---|---|
| 主题断言 | `w7b0-theme --assert` OK（uid=default、colorPrimary、globalStyle 令牌、mfg-standard 存活、4 内置） |
| themeId 固化清除 | `b0/w7-b0-user-themeid-rollback.json`（nocobase/qc_inspector，原值 themeId=3） |
| 主题回滚面 | `b0/w7-b0-theme-rollback.json` |
| PC before 基线 114 页 | `b0/before/`（111 flowPage + 112 应用中心 + 113 排产甘特 + 114 任务甘特） |
| PC after 代表页 19 | `b0/after/` + `.w7b0-shot-after-report.json` |
| PC DOM probe | `b0/w7-b0-dom-probe.json`（5 页×4 断言 ALL PASS：主按钮 rgb(30,78,140)、表头 600、Tag soft+999px、卡片 8px） |
| mobile after 16 面 | `m0/after-mobile/` |
| mobile DOM probe | `m0/w7-m0-dom-probe.json`（Tab 12px、active #1E4E8C、海拔 8.4%、375 无溢出、暗轨联动 ALL PASS） |
| 并排对比图集 | `demos/acceptance-w7/w7-b0-01..11-pc-*.png` + `w7-m0-01..08-mobile-*.png` |
| gates | vitest ui-mobile 43 文件/668 测试全绿；tsc -b tsconfig.client.json 干净；w7b0-theme.mts 定点 oxlint 0/0；build:lib:client + build:web ×2 exit 0 |

## 关键机制发现

1. **default 行切换 ≠ 全站换肤**：`systemSettings.themeId` 固化优先（InitializeTheme 逻辑）；admin 实际跑 Compact(3) 而非 mfg-standard——两者同为 #1677FF 色，W5 审计的「跑在 mfg-standard」按色不可验证。
2. **globalStyle 与 seed token 生效路径独立**：固化用户会出现「globalStyle 新 + 主色旧」劈叉态。
3. 审计 flat 清单 uid 截断 10 字符；census 只含 flowPage，v1 三页需单独补（uid 以 api-desktopRoutes.json 核对）。

## 遗留（进入后续批次）

- `#1677ff` 样式表残留 9–12 条/页（JSBlock 页内硬编码为主）→ B5 层 3b 清偿；B0 DOM probe 抽样 5 页（客户/员工/供应商档案/库存查询/经营总览）的主按钮 computed 背景已实测为 rgb(30,78,140)，全站 114 页 computed 层未逐页实测。
- mobile home 品牌色元素 21 处（8 个 quickChip 主按钮）→ M1 hero 减蓝（目标 ≤6）。
- 315 处收拢值（hero 数字 22→24px 等）需 M1/M2 视觉复核（vitest 样式不可见）。
- 工作树中存在本批之前遗留的未提交改动（TS 功能面 17 文件）——非本批所改，未触碰。
