# Agent Note: W6-B2：平台规则引擎 + 预警中心（首批四路规则）

Status: implemented

[English](2026-10-02-w6-b2-alert-rule-engine.md) | 中文

W6 计划（plans/plan-w6.zh.md §B2）要求一次建成「规则 → 任务 → 通知」引擎供 B5/B9 复用。本批之前没有任何预警面：效期/资质/账期/质量四类事实躺在四张业务表里，无扫描、无通知。W6-R2 修复轮（16 维验证 FAIL 70/100 后）补齐了三端认领闭环、网关写通道收口与可观测性，本 Note 描述修正后的终态。

## Problem

四个域各需阈值预警（批次效期/供应商证照/AR 账期/质量异常），却没有共享引擎、没有统一收口页、通知无处落地。

## 落地内容

- **`examples/kb-agent/scripts/w6b2-rules.mts`** —— 引擎整体为一个模块，三个入口共用同一实现：引擎 serve 的小时级循环 + 夜间 `scan-alerts` 腿 + `POST /scan-alerts`（approval-engine.mts 动态 import `scanAlerts`），以及 CLI（`--seed/--scan/--act/--seed-ar/--assert`）。单条规则抛错只隔离该路（记 `wfl_alert_scan_failures` 审计行），其余规则照常扫描——一条坏阈值不再致盲全部四域。
- **两张集合 + 一张意图表**：`alert_rules`（配置中心——每行 rule_type/params/route_to/enabled；一切阈值在行上，绝不在代码里）、`wfl_alerts`（预警台账）与 `wfl_alert_acts`（PC 认领意图行——预警列表行内「认领 / 关闭预警」表单写入，collection workflow 回调引擎 `POST /alerts/act`，成功即消费该行，W1 意图行模式）。`wfl_` 前缀挂网关共享工作面，R2 起豁免按动词拆分：**读**（list/get）保持共享，**写**（update）默认 403，仅 `nocobaseWflWriteScopes` 显式白名单放行——预警状态机一律走 `/alerts/act` 单一入口。
- **首批四路规则**（每路一个 hitsSelect）：效期（wms_lots 四日期 × 双轨阈值——配置 warn_days 与监管保质期分档 45/20/15/10/3 天孰早，外加 Odoo 式 alert_date 腿）、资质（srm_certificates.expires_at）、账期（approved so_orders 余额 = amount − 已到账 crm_payments，need_date 前提醒、后逾期——B9 的催收复用此路）、质量（qm_nc_dispositions 未处置行，关联检验 defect_critical > 0 升 critical）。
- **幂等**：`dedup_key` 唯一索引 + 每规则一条 INSERT…SELECT…ON CONFLICT——同一对象恒为一行，级别升级改写原行，对象脱离范围自动关闭（`resolved_by='system'`），resolved 行再命中则重开并重新通知。R2 修正：INSERT 列清单补上 `reopen_count`（初值 0），重开腿 `COALESCE(reopen_count,0)+1`——此前该列恒 NULL，重开只翻状态不留次数。
- **通知**：经 seed 的 `alert-center` 渠道写 notificationInAppMessages（unread 计数按 channelName ∈ notificationChannels 过滤——渠道未注册则徽标静默为零，本批 seed 掉这个坑）。每行每级别只通知一次；路由把 `route_to.users` + 部门经 departmentsUsers 展开（效期→仓储部含 keeper、资质→采购部含 buyer、账期→finance/sales_rep、质量→质检部含 qc_inspector）。R2 修正：路由用户名在 users 表无对应行时不再静默 stamp——写 `wfl_alert_scan_failures` 审计行 + warn 日志，`notified_severity` 不落章，下一轮重试。
- **处理动作**：`actOnAlert`（claim/ack/resolve）以显式 `(from_state, action, actor_role)` 三元转换表断言（认领：路由人或 admin；关闭：owner 或 admin；越态/越权一律 0 行拒绝），条件 UPDATE 再钉一遍状态与白名单。三个入口共用：mobile 行内动作经网关 `nocobase.alertAct`（身份取自 B0 会话 token，客户端不可叙述）、PC 意图表单经 workflow 回调、CLI `--act`。
- **预警中心两页**（零插件源码修改）：菜单组「预警中心」+ 预警列表（四张 open 计数统计卡 + 红黄分级 wfl_alerts 表格 + rule_type/severity/status 筛选表单 + 认领意图表单）+ 预警规则（alert_rules 活配置表；每次改动经 PG 触发器落 `wfl_alert_config_audit`）。member/admin/root 已授 view，member 另授 wfl_alert_acts 的 view/create。
- **移动端**：`listMyAlerts` + `AlertsView`（`#/alerts`）+ 首页快捷 chip「我的预警」（带计数角标）。R2 起行级裁剪在网关服务端（wfl_alerts 匿名读拒绝；登录人只见 notify_users 含本人或 owner=本人的行，admin 全量）——移动端不再客户端过滤；行内「认领/关闭」直连 `nocobase.alertAct`，拒绝时透出引擎 403 事实。

## 验证

`w6b2-rules.mts --assert` 十腿全绿：两表列对 information_schema（date-only 纪律）、四路规则启用、每路两级分层有数据、幂等契约、效期对账（引擎行数 = 手写四日期×双轨 SQL）、阈值可配（放大/恢复 + 配置字节复原）、通知落库 + 路由覆盖、三元转换断言（越权认领/未认领关闭/非认领人关闭/已关闭再认领全拒 + 重开二轮 reopen_count=1）、两页 + 认领意图表单 + 回调 workflow 在库、单规则失败隔离（坏参数只隔离该路、审计行在库、复原归零）。证据：demos/acceptance-w6/w6-b2-01…07 与 w6-r2-01…07（文件均实测存在；对账 SQL 固化于 research/2026-10-01-w6-rework/b2/recon.sql）。门禁：typecheck 0 错、相关 vitest 套件绿、oxlint staged 对本批改动文件 0 error / 2 条 unused-disable warning（.oxlintrc.json 全量配置仍需要这两条指令，staged 配置下报 unused——如实计数，不宣称 0 warning）。

## 沉淀的坑

- `notify_users` 是 `json` 列（collections:create type json）不是 jsonb——`?` 成员运算符需显式 `::jsonb`；double precision 列上的 `round(x, 2)` 需 `x::numeric`。
- v2 页面 grid 的块序按插入序：psql 改写 `sortIndex`（1-4、15-18、NULL 三种都试过）都不能把统计卡移到表格上方；卡本身工作（交互式浏览器实测 canvas 884×224）但渲染在表格下方。留 B10 heal 批治理——比价表页是把卡放在独立的前置 grid。
- headless chrome（`--headless=new --disable-gpu`）在该页始终不挂载 ECharts canvas（交互式 DOM 显示 4 张、headless 为 0）——统计卡的证据对是 DOM 探针（w6-b2-cards-dom.json）加 flowModels 块断言，不是 headless 截图。
- 移动端 bundle 陈旧有两层：`build:lib:client` + `build:web`（vite）+ :3080 重启——只重启不重建 vite 会继续服务旧构建的同 hash 资产。
- 网关 nocobase.list 的 `page_size` 上限是 100（zod）——传 200 读回的是 bad-request 而非截断页。
- oxlint 的 staged 配置与全量配置规则集不同：为全量配置留的 disable 指令在 staged 配置下报「unused directive」warning——两套门禁的计数要分开如实报，不能拿 staged 的 0 warning 概括。
- NocoBase 的 json 列没有网关 filter 词汇可用的数组成员运算——行级 scope 只能在网关侧做（读后裁剪 + count 重述），psql 孪生对账以 `notify_users ? username` 为准。

## 供 B5/B9 复用的接口

`scanAlerts()`（含 failures 隔离清单）/ `actOnAlert()`（三元转换表）/ `scanState`（healthz 的 last_scan_at/last_scan_failures 指针）（w6b2-rules.mts 导出）、`alert_rules` 行形状（每 rule_type 的 params/route_to/actions；新规则类型扩展 `hitsSelect` + 一行 seed）、通知腿的渠道 + 级别级去重、`nocobase.alertAct` 网关方法（B9 催收可复用同一「token 身份 → 引擎单一入口」模式）。

## Alternatives considered

- **每域独立预警脚本 vs 一张规则表+一个扫描调度（ADR#3）**——选统一引擎：四域行级配置，阈值/路由改行即生效。

## Consequences

成本：多一个引擎循环要运维。买到：八路规则行级配置、幂等预警台账带审计、小时/夜间/手动三通道同构。
