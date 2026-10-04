# Agent Note：W7-B5 —— W6 新页 21 页接入「铸造」令牌体系

Status: implemented

[English](2026-10-03-w7-b5-w6-pages-aesthetic.md) | 中文

用户反馈：W6 生成的页面难看。2026-10-03 审计将 W6 全部 21 页判为 A 级：JSBlock 面自成第二套视觉体系（antd 旧紫 #722ed1 / 默认蓝 #1677ff 内联字面量、伪零条形图、四套圆角并存、彩虹边框追溯 DAG、警示色语义倒置），iframe 侧页面又各持一套色板。

## Problem

W6 新建的 21 页把 v2 壳的缺陷继承到最重——双体系色板带退役紫、伪零条形、图例断链、DAG 彩虹边框，还有审计签不进去的 iframe 壳。

## 改了什么

plan-w7 的层 3b/3c（设计语言源文件为 `research/2026-10-03-w7-rework/b0/design-language.md`；令牌经 B0 globalStyle 的 `--w7-*` 全集下发）：

- JSBlock 源码 token 引用式重写。`w6b9-blocks.mts`（驾驶舱 / 财务工作台 / 三单匹配）、`w6b7-blocks.mts`（比价矩阵 / 采购订单泳道）、`w6b3-trace.mts`（效期看板 / 追溯 DAG）、`w6b8-aps.mts`（瓶颈热力 / what-if）、`w6b8-eam.mts`（维保日历）、`w6b3-recall.mts`、`w6b4-bomver.mts` 的全部内联 hex 改为引用 `var(--w7-*)`——inline `var()` 探针已验证 JSBlock 渲染面可达（块不在 shadow DOM，`:root` 令牌可继承）。SVG 表现属性无法解析 `var()``，因此 DAG 的 fill/stroke 移入 `style=` 属性。
- 伪零条形：驾驶舱月度趋势与两侧账龄桶在零值处渲染 3px 基线点而非 2% 细条；正值条下限收敛为 4%。
- 语义倒置按 STATUS_PALETTE 修正：催收 / 报价 / 匹配状态灯 soft 化（前景 + 8-10% 背景配对，不再实心）；维保 KPI 卡按 Negative/Critical 分层风险；比价矩阵紫系（定标 banner / 定标弹窗 / 等级徽标）全部换主色；`alert_rules.rule_type` 枚举 CCP 越限→red、质量预警→orange；EAM 设备 / 维保类型枚举去掉 purple/magenta。
- 圆角体系：全部 JSBlock 页按 卡 8 / 控件 6 / 徽标 4 / Tag 999 令牌化（触屏 iframe 页保留 8–14px 触控圆角体系）。
- 追溯 DAG 节点边框改同源蓝系（chart-1..4 + primary + informational + neutral；锚点 = primary 2.5px，召回高亮 = negative）；箭头 / 连线色随 border-strong/negative。
- APS 热力梯度改为 `color-mix(in srgb, var(--w7-{positive,critical,negative}-fg) N%, transparent)`，超载曲线更陡（100% 处 55%，接近 190%+ 时 90%），替换 antd rgba 字面量。
- 维保日历每日最多展示 2 条事件 chip，超出以「+N more」折叠（状态按 ISO 日期记忆）。
- iframe / 引擎侧页面内嵌 `--w7-*` 常量表（这些文档不继承 NocoBase 的 globalStyle）：`insp/index.html`、`crm/index.html`（引擎直接读盘服务）、insp 打印服务 CSS、`labels/index.html`，以及深色触屏终端调色板（`terminal.css` 的 `--primary/--ok/--bad/--warn` 换为 W7 三态同色相亮变体；cards.html 随之生效）。引擎进程需重启才能加载动态 import 的 server 模块。

## 重放过程中暴露并修复的问题

- `w6b3-recall` 缺 code-drift 升级：控制台块一次性挂载后即 kept，源码改动到不了页面。ensure 步骤在已挂块代码与导出不一致时销毁重建（w6b3-trace 的整页重建姿态；`flowModels:destroy` 走 `filterByTk`）。
- `w6b4-assert` 在工序级余量临界点破产：演练 MO 首个 open 工序 remaining=1 而 MO 级总和 ≥50，`good = max(1, floor(1/3))` 使 `qty_pending = -1`，被引擎三数等式拒绝。深重置触发条件补充「任一 open 工序 remaining < 3」。
- `w6b6-crm --assert` 需要 cleanup→seed→assert 编排（已转演练报价按设计拒绝二次转单）；部分唯一索引 `ux_crm_quotes_converted` 可能被 schema 同步删除，`--seed` 幂等重建。
- code-drift 重建轮换页面 uid：效期看板 → `w6b3v1vsyqj5u9a`、批次追溯 → `w6b3tctwuy6wn0d`、配方版本与变更 → `w6b4b2jezsof7xz`（审计清单记录的是旧 uid）。

## 证据

- `demos/acceptance-w7/w7-b5-01..26-*.png` —— 21 页 after 截图，外加两个 B5 改动挂载页（比价表 / 采购订单）与三张引擎侧签到态页面（insp qc_inspector、crm sales_rep、cards shop_lead——清偿 02 报告的局限声明）。
- `demos/acceptance-w7/w7-b5-dom-probe.json/.log` —— 逐页探针全绿：禁用内联 hex（#1677ff/#722ed1/#7C3AED/#ff4d4f/#faad14/#c41d7f/#13c2c2）零命中、伪零条形消失且基线点在位、DAG 边框色全在白名单内且锚点为主色、APS 格走 color-mix 且无旧 rgba、表格页 antd Tag soft 化 999px。
- `research/2026-10-03-w7-rework/b5/w7-b5-source-grep.log` —— 源码级清零断言（全部 w6b* 源 + iframe/SPA 面）。
- `demos/acceptance-w7/w7-b5-gates.log` —— W6 断言矩阵全量复跑：w6b2 / w6b3-labels / w6b3-trace / w6b3-recall / w6b4 / w6b5 / w6b6 / w6b7 / w6b8 / w6b9 改样式后全部 PASS（功能零回退）。改动脚本 oxlint 零告警。

## 已知遗留

- 深色触屏终端调色板使用未入册的亮变体（#5783BC/#6EB871/#C93A3A/#F09A4B，色相锚定 W7 三态）；B6 如需令牌化，可给终端样式表补一套暗轨 `--w7-*`。
- 引擎侧 SPA 中动态 import 的模块（`insp/src/server.ts`）改动需重启引擎生效；读盘直出的 index.html 即改即生效。
- 卡片流终端（cards.html）的深色视觉是 W2 既定姿态，维持深底；仅四态强调色换成 W7 色相。

## Alternatives considered

把八个 JSBlock 页重写成 v2 原生块 vs 页内 token 引用式 `<style>`——样式块不动 W6 已验证的逻辑、经共享令牌重上色，B6 库位图修复复用的正是这条路。

## Consequences

token 引用式 `<style>` 模板与引擎侧令牌孪生成为 B6 库位图修复后来复用的模式。
