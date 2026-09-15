# 用户验收反馈修复计划（第六轮 G）：CRM Portal 吸收 Hub 全功能域 + logo 统一 + 全域 AI 化（2026-09-14 起）

> 面向下一位实施者（Loop 批次/code 模式）：本文回答"为什么与做什么裁决"，每批"怎么做"在 [01](01-brand-unify.md)~[08](08-closeout-regression.md)。所有根因结论附 `文件:行号` 或实机证据；调研经 3 路并行子任务 + 主任务亲证交叉完成，事实底座见 [00-research-notes.md](00-research-notes.md)。基线 HEAD=`74da6fff60`（F 轮终审 PASS 100/100，dev 分支 B~F 约 50 提交未推送）。

**目标一句话**：以 CRM Portal 为底座，把 Hub Portal 九个非销售功能域（projects/hr/inventory/procurement/helpdesk/assets/finance/knowledge/home）的完整功能逻辑（页面/表单/详情/工作流/仪表盘）整模块移植进来并全部 AI 化，菜单按 Hub 七组机制分组、首页升级为 Hub overview 仪表式设计，logo 一次修复对齐 Hub，UI 保持 CRM 侧栏形态但吸收 Hub 设计长处——最终 CRM Portal 成为唯一主入口，Hub Portal 保留降级为官方模板参考。

**北极星（用户原话）**：

1. 「crm系统的logo换成hub一样的」
2. 「感觉hub的功能要比crm多，把hub的功能都移植到crm系统，不仅是菜单级别，要尽可能的所有功能逻辑，而且要ai化，并且ui也要参考，要有设计感，hub虽多，但是不能像crm一样ui配置，基于crm改造为hub比较好」

解读要点：「不仅是菜单级别」= 表单/列表/详情/工作流都要在 CRM 内真实可用；「基于 crm 改造为 hub」= 最终单一 Portal 是 CRM 形态（侧栏壳），不是把 CRM 塞进 Hub。

---

## 1. 调研结论摘要

### 1.1 logo 差异根因：唯一分歧在 `Brand()` 组件结构（资产层已全同）

- 双 Portal `public/` 5 个品牌资产（favicon.ico/logo.png/logo-dark.png/logo-mark.png/logo-mark-dark.png）**逐字节相同**（shasum 亲证，见 [00 §1](00-research-notes.md)）；[`BrandLogo`](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/brand.tsx:12)（双 img 明暗槽）两边逐行一致；D 轮品牌链（C4/C6/C7/C8/D4）已统一 favicon overlay、title、og:image、文案。
- **唯一分歧**：CRM [`brand.tsx:52-58`](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/brand.tsx:52) 的 `Brand` 是「文字 XOR 图形」——`showText=true`（默认）只渲染 `<BrandWordmark>` 纯文字；Hub [`brand.tsx:50-59`](../../platform/nocobase-portals/demo-portal-hub/src/components/app-shell/brand.tsx:50) 无条件渲染 `<BrandLogo>` + 竖线分隔 + 文字并存。
- CRM 三个消费点全部命中缺陷分支：[sidebar.tsx:295](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/sidebar.tsx:295)（`showText={open}` 展开态）、[header.tsx:113](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/header.tsx:113)、[auth-layout.tsx:24](../../platform/nocobase-portals/demo-portal-crm/src/components/auth/auth-layout.tsx:24)（登录页）——CRM 用户全程看到纯文字，Hub 用户看到「徽标 | 文字」。**修复 = 把 CRM `Brand` 对齐 Hub 结构，一处改动自动修 3 个挂载点。**

### 1.2 移植可行性：两 Portal 同源 fork，域模块自包含，技术上直通

- **同源铁证**：双 Portal `src` 下共同 444 文件中 **403 个逐字节相同**（App.tsx、app 骨架、components/ui 63 件 shadcn、全部 14 个 `nocobase-*` 扩展骨架含 nocobase-ai 120 文件）；`package.json` 仅 name 不同；`App.tsx` 逐行相同；theme storageKey 同为 `"nocobase-theme-crm"`。
- **域模块自包含**：Hub 每域 `pages/<domain>/` 标准骨架（module.tsx 路由+resource 注册 / routes.ts 路径常量 / route-components.tsx lazy+ACL 守卫 / route-surfaces.ts / shared.tsx / locale.ts en-US+zh-CN / constants.ts / types.ts / pickers.tsx + 子实体 list/form/show 三件套）。聚合点 [`src/routes.tsx`](../../platform/nocobase-portals/demo-portal-hub/src/routes.tsx:15) 仅 26 行 `defineAppRoutes([...10 域 module.routes])`；CRM 同用 `defineAppRoutes`（789 行内联）——**Hub 域拷入后聚合点追加一行即注册**。
- **菜单分组机制现成**：Hub [`app/extensions.tsx:66-162`](../../platform/nocobase-portals/demo-portal-hub/src/app/extensions.tsx:66) 的 `sidebarGroups`（7 个 route-less 分组）/`resourceGroupParent`（~40 资源挂组映射）/`priorityOverride`/`groupedRouteResources` 四段——模板原生支持 parent-with-children 侧栏渲染，CRM [`app/extensions.tsx`](../../platform/nocobase-portals/demo-portal-crm/src/app/extensions.tsx:54) 现为无分组平铺，合并四段即得分组菜单。
- **共享基建**：Hub 各域列表页依赖 [`lib/table-kit/`](../../platform/nocobase-portals/demo-portal-hub/src/lib)（33 文件：format-currency/date、kpi-bar、bulk-bar、saved-views、csv、url-state、density 等）——CRM 侧缺失（CRM 用自有 [`pages/crm/list-toolkit.tsx`](../../platform/nocobase-portals/demo-portal-crm/src/pages/crm/list-toolkit.tsx)），移植必须连带拷入（纯新增，无冲突）。
- **后端零改动**：两 Portal 同用 `@nocobase/portal-sdk/data` dataProvider 直连 NocoBase REST（`window.NOCOBASE_API_URL="/api"`），27 个 `hub_*` collections 已在同一后端（F 轮 verify 的 15 条 `hub_*` list probes 全 200）——**移植域的表单提交/列表读取直接可用**。apiproxy BFF 无任何 hub/crm 域（Portal 不经 BFF）。

### 1.3 Hub 功能域全量清单与移植面（实测 wc -l）

| 域 | 文件 | 行数 | collections | 移植裁决 |
|---|---|---|---|---|
| helpdesk | 20 | 6,658 | hub_hd_tickets/replies/sla_policies/faqs | ✅ G2 试点 |
| projects | 25 | 9,247 | hub_pj_projects/tasks/milestones/checklist | ✅ G3（含 AI 挂载点×2） |
| hr | 25 | 8,648 | hub_hr_employees/departments/leave_requests | ✅ G3 |
| assets | 26 | 7,383 | hub_as_assets/assignments/maintenance | ✅ G4 |
| inventory | 26 | 7,262 | hub_inv_products/warehouses/stock_moves | ✅ G4 |
| finance | 22 | 6,870 | hub_fin_invoices/invoice_items/expenses/budgets | ✅ G5（含 AI 挂载点×1） |
| procurement | 21 | 5,997 | hub_po_purchase_orders/suppliers/items | ✅ G5 |
| knowledge | 22 | 7,251 | hub_kb_articles/categories/article_feedback | ✅ G5 |
| home | 10 | 3,062 | 跨域聚合（见 1.5） | ✅ G6 新首页 |
| sales | 40 | 13,096 | hub_sales_*（5 表） | ❌ 不移植（见 1.4） |
| **合计（不含 sales）** | **197** | **~62,000** | | |

### 1.4 sales 域不移植的裁决依据

Hub sales（accounts/activities/contacts/deals/grid/insights/leads）与 CRM crm 域（activities/contacts/customers/deals/follow-ups/leads/products/quotes/reports/targets）**重叠 4 子实体**，且 `accounts`≈`customers` 概念对应——但绑定**不同 collections**（`hub_sales_*` vs `crm_*`，两套独立数据）。整体拷入 = 双销售菜单 + 数据分裂，违背「以 CRM 为底座」。QUICKSTART:139（E3）已说明 Hub sales 域仅因「Hub 首页聚合需要」而存在。`insights`（销售预测，760 行 ECharts）是 CRM 缺失能力，列为 **G6 可选增强**（若做需改绑 crm_* 数据源，见 08 批）。home 域聚合中的销售 KPI 改绑 `crm_*`（见 1.5）。

### 1.5 home 域（overview/week-strip/quick-search）是设计感核心，作为 CRM 新首页

- [overview.tsx](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/overview.tsx:1)（1,142 行）：ECharts 九域 KPI 总览 + BuildStoryBanner + 可 Pin 模块九宫格（`hub.home.pinnedModules`）+ team/mine 双 scope；[week-strip.tsx](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/week-strip.tsx:1)（189 行）「未来一周」日程条（activities/tasks/deals 三源聚合）；[quick-search.tsx](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/quick-search.tsx:1)（594 行）cmdk 全域搜索（跨 8 collection）。
- **核心适配点**：`useOverviewData` 聚合钩子与 quick-search 的数据源含 `hub_sales_deals/accounts/leads/contacts` 4 个销售表——用户主销售数据在 `crm_*`，首页销售 KPI **必须改绑 crm_deals/customers**（字段对照先行，见 G6 批第 0 步）；其余域 KPI 保持 `hub_*`。
- CRM 现有首页 [dashboard.tsx](../../platform/nocobase-portals/demo-portal-crm/src/pages/crm/dashboard.tsx) 保留为「销售工作台」二级入口（菜单 priority 调整），新首页 = Hub overview 形态（priority 0）。

### 1.6 AI 面：悬浮球零成本，表单填充随域移植，G7 补挂新域

- **悬浮球**：`nocobase-ai` 扩展 120 文件两侧共有（Provider 级全局挂载，经 [`app/extensions.tsx` glob 自动收集](../../platform/nocobase-portals/demo-portal-crm/src/app/extensions.tsx:19)）——移植域页面**自动获得**悬浮球，零代码。
- **ai-employee-fill 表单填充**（组件绑定 AI 员工 dex，formFiller 自动批准 + 500ms 防抖）：Hub 挂 4 个 formId——sales/leads（随 sales 域不移植）、projects/projects、projects/tasks（G3 随域带来）、finance/expenses（G5 随域带来）；CRM 现挂 2 个（crm-deal-create、crm leads）。**G7 给新域补挂**：helpdesk tickets、assets、knowledge articles、hr employees 等（约 4-6 个 formId，参照 D 轮 E 批挂载模式）。
- **两套 AI 体系边界**：admin 后台 n18 脚本挂载（n18ai- ≥25 断言）是 NocoBase 侧 v2 页面表单，与 Portal 前端 ai-employee-fill 互不相干——G 轮不动 admin 侧。
- quick-search AI 化列为可选（悬浮球已能问答查数，优先级低）。

### 1.7 双 Portal 依赖面与 Hub 命运

- Hub 部署链：[`nocobase-portal-deploy.mts`](../../examples/kb-agent/scripts/nocobase-portal-deploy.mts:28) PORTALS 表（crm/hub 双 entry）→ 构建到 `platform/nocobase/storage/dist-client/{crm,hub}/` → :13000 直连 `/dist/{crm,hub}/` + :3080 网关 `/nocobase/dist/{crm,hub}/`（SPA fallback 支持深链）。
- 入口卡片：[`nocobase-n17-alignment.mts` ensureAppHub()](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:579)「应用中心」四卡（CRM/Hub/AI 工作台/DSH 工作台），幂等机制=页 title+卡片 marker+copy-fingerprint。
- **Hub 退役硬依赖共 6 处**（portal-deploy PORTALS、verify 双 Portal 探活/图标/品牌断言循环、网关三路 favicon、hub_* probes 15 条语义改写、n17 Hub 卡片）——G 轮**不退役**，理由见决策 6。
- 现有 verify 门禁（[`setup-nocobase.mts`](../../examples/kb-agent/scripts/setup-nocobase.mts)）：双 Portal 探活（:813-816）、AI 悬浮球图标 svg 断言（:823）、品牌资产字节级（:892）、网关三路 favicon（:939）、~30 条 list probes（crm_* 6 + hub_* 15+）——**全部继续有效**（测的是后端 API 合同，与 Portal 前端无关）。

---

## 2. 技术决策（已定，实施不再讨论）

1. **移植策略 = 渐进式按域整模块拷贝**（方案 b）：每域 `pages/<domain>/` 整目录拷入 CRM + 聚合点注册 + 菜单挂组 + locale 并入，**每域独立验收独立提交**。方案 a（一次性全拷）回归面不可控；方案 c（菜单挂 Hub 路由）不满足「不仅是菜单级别」且依赖 Hub 源存活，违背单一 Portal 目标。
2. **sales 域不移植**（1.4 节依据）；insights 列 G6 可选增强。Hub 源目录移植期间**冻结只读**（对照/回退用），不动 Hub 直到 CRM 侧全部验收过。
3. **CRM 壳形态不变**：保持侧栏导航（不用 Hub TopNav 顶栏）；十域菜单用 Hub 的 sidebarGroups 七组机制分组（模板原生 parent-with-children 渲染），CRM 域资源挂新增「销售」组（或保持顶层，G2 定稿）；CRM 现有 789 行 [`routes.tsx`](../../platform/nocobase-portals/demo-portal-crm/src/routes.tsx) 内联**不重构**，新域 module 追加进 `defineAppRoutes` 数组——最小侵入零回归。
4. **视觉统一成本极低**：双 Portal 同 token 体系（App.css oklch 变量/Tailwind v4/shadcn 63 件 ui 逐字节相同）——「以 CRM 风格为基准」= 默认态即达成；Hub 设计长处（overview 仪表式首页、week-strip、ECharts 图表）随域模块直接带入。
5. **logo 修复 = CRM `Brand` 对齐 Hub 结构**（1.1 节），G1 批一处改动；不动资产、不动部署链、不动 BrandLogo。
6. **Hub Portal 最终命运 = G 轮保留 + 叙述降级**：应用中心 Hub 卡片文案改为「官方模板参考（功能已并入 CRM Portal）」、QUICKSTART 改为「CRM Portal 为主要入口」；物理退役（6 处代码/门禁 + 目录删除）留 H 轮用户确认后执行。理由：移植期需 Hub 源对照；数据同源可并行验证；用户书签深链不破坏。
7. **AI 化 = 悬浮球零成本 + 表单填充随域移植 + G7 补挂**（1.6 节）；不新增 AI 基建。
8. **后端零改动**：全部 `hub_*` collections 已存在；不碰 `platform/nocobase` 快照；不碰 admin 后台 26 个 v2 页与 n18 挂载。
9. **幂等与部署**：每批 CRM Portal 重建走既有 deploy 链（`deploy 双跑树哈希一致` 惯例）；种子脚本无新增（无后端变更）；每批验收含 `portal tsc --noEmit`。
10. **验收基调延续 F 轮**：真实浏览器逐域实测（列表渲染真实数据/表单提交落库/详情工作流/悬浮球出现）+ CRM 原有域零回归抽查 + 门禁全绿 + `demos/acceptance-g<N>/` 截图证据 + QUICKSTART/handoff/Agent Note 同步。

---

## 3. 批次总览（8 批，顺序执行）

| 批次 | 一句话 | 文档 | 规模 | 依赖 | 预估 |
|---|---|---|---|---|---|
| G1 logo 统一 + 移植基建 | Brand 对齐 Hub + table-kit 33 文件拷入 + 拷贝链路验证 | [01](01-brand-unify.md) | 1 文件改 + 33 新增 | 无 | 半天 |
| G2 壳层扩容 + helpdesk 试点 | extensions 四段合并 + locale 聚合机制 + helpdesk 域整模块移植首验 | [02](02-shell-helpdesk-pilot.md) | ~25 文件 | G1 | 1 天 |
| G3 projects + hr 移植 | 两域整模块 + 2 个 AI 表单挂载点随域激活 + 组织架构图/日历 | [03](03-projects-hr.md) | 50 文件 / 1.79 万行 | G2 | 1 天 |
| G4 assets + inventory 移植 | 资产三件套 + 库存矩阵/补货/周转 | [04](04-assets-inventory.md) | 52 文件 / 1.46 万行 | G2 | 1 天 |
| G5 finance + procurement + knowledge 移植 | 财务六页 + 采购分析 + 知识库五页 + expenses AI 挂载点 | [05](05-finance-procurement-knowledge.md) | 65 文件 / 2.01 万行 | G2 | 1 天 |
| G6 home 域 + 新首页改造 | overview/week-strip/quick-search 移植 + 销售 KPI 改绑 crm_* + 首页裁决落地 | [06](06-home-dashboard.md) | 10 文件 + 适配 | G3（数据域齐） | 1 天 |
| G7 AI 化补挂 + UI 收口 + 叙述降级 | 新域表单 ai-employee-fill 补挂 4-6 个 + 视觉审查 + QUICKSTART/应用中心 Hub 降级 | [07](07-ai-ui-narrative.md) | ~10 文件改 | G2-G6 | 半天 |
| G8 终审回归 | 全量门禁 + CRM e2e 回归 + 截图全量重拍 + Agent Note + handoff | [08](08-closeout-regression.md) | — | G1-G7 | 半天 |

顺序理由：G1 最小批次先验证「拷贝→tsc→build→deploy→浏览器」全链路（table-kit 无业务依赖）；G2 壳层（分组/locale 聚合）是所有域批的公共前置，用 helpdesk（用户首个点名域、20 文件中等规模）试点打通「域移植全流程」；G3-G5 三批铺量（每批 50-65 文件，域间零耦合可独立 revert）；G6 home 依赖各域数据源就位（overview 聚合跨域）；G7/G8 收口。每批独立提交、可独立 revert（E/F 轮惯例）。

移植完成预期终态：CRM Portal = 1 个 crm 销售域 + 9 个 Hub 域（~263 文件新增）+ 分组菜单 + Hub overview 新首页 + 6-8 个 AI 表单挂载点 + 悬浮球全域覆盖；Hub Portal 保持冻结可用但叙述降级。

---

## 4. 验收标准（本轮完成定义）

1. **G1**：CRM 侧栏展开态/顶栏/登录页三处浏览器截图显示「图形徽标 | 竖线 | DSH食品业务平台」（与 Hub 同构对照截图）；deploy 双跑树哈希一致；既有品牌 verify 断言全绿；CRM Portal tsc EXIT=0。
2. **G2**：helpdesk 四页（tickets/dashboard/sla/faq）在 `:3080/nocobase/dist/crm/tickets` 等深链渲染真实数据（hub_hd_* 表）；ticket 新建表单提交落库；悬浮球出现；侧栏出现「Support」分组可折叠；CRM 原有菜单/页面零回归（dashboard/deals/leads 抽查）；tsc EXIT=0。
3. **G3-G5（每域）**：各域全部路由页面浏览器实测渲染 + 至少 1 个表单提交落库 + 1 个详情/工作流页可用 + 悬浮球出现；菜单分组正确（Delivery/People/Operations/Finance/Support/Knowledge）；CRM 原有域零回归抽查；tsc EXIT=0；每批独立提交。
4. **G6**：CRM 新首页 = overview 仪表式（ECharts KPI + 可 Pin 九宫格 + week-strip）；销售 KPI 数据来自 crm_*（与 CRM deals 页数字一致）；quick-search 可搜到新域数据；原 crm dashboard 保留可达；明暗主题切换图表跟随。
5. **G7**：新域表单（helpdesk tickets/assets/knowledge articles/hr employees 至少 4 个）出现 dex 头像 AI 按钮，实测一次中文描述流式填充成功；QUICKSTART :138/:139/:140 三处改写落盘；应用中心 Hub 卡片文案降级。
6. **G8**：幂等双跑全 kept（G 轮无新种子，重放 F 轮链 ×2）；`typecheck/lint/doc-sync` EXIT=0；CRM Portal tsc EXIT=0 + deploy 双跑树哈希一致；`setup-nocobase.mts verify` 全绿（≥25 n18ai- / 双 Portal 探活 / 品牌 / probes 全保持）；CRM Portal 既有 6 个 playwright e2e 全绿；证据归档 `demos/acceptance-g{1..8}/`；Agent Note（移植机制）+ handoff 0.g 节落盘。
7. **全局回归**：admin 后台 26 v2 页 + n18 挂载 + N22 AI 链路全部不回退（verify 覆盖）；Hub Portal 仍可访问（冻结态）；PG tail 无新增错误。

---

## 5. 硬约束（实施全程有效）

- **不动 Hub 源**：`platform/nocobase-portals/demo-portal-hub/` 移植期间只读对照，任何修改（含品牌）都等 CRM 侧验收完的用户确认。
- **不 reset 用户库 / 不碰 `hub_*` collections schema / 不碰 `platform/nocobase` 快照 / 不碰 admin v2 页与 n18**——G 轮纯 CRM Portal 前端工程。
- **sales 域不移植**（决策 2）；insights 仅在 G6 数据源对照通过后作为可选增强。
- **每批验收前探活**：:13000 NocoBase、:3080 网关、N22 `:13100/healthz`（悬浮球就绪前提）、admin 登录可用（admin@nocobase.com/admin123）。
- **拷贝保真**：域模块拷贝不改内部实现（import 路径 `@/` 别名两侧同构）；分叉文件（41 个清单见 [00 §6](00-research-notes.md)）只在批内确需时逐文件合并，CRM 侧现状优先；CRM 独有 `nocobase-mail` 扩展与 `pages/crm/` 永不覆盖。
- **提交链维持未推送基线**（`74da6fff60` 之上叠 G 轮提交）；每批独立提交、可独立 revert。
- 幂等：G 轮无新种子脚本；deploy 链每次重建重放品牌 overlay（既有机制）。

---

## 6. 风险总览

| 风险 | 等级 | 预案 | 所属批 |
|---|---|---|---|
| overview/quick-search 销售数据改绑字段不齐（`hub_sales_deals` vs `crm_deals` 金额/状态枚举字段名差异） | **中** | G6 第 0 步 dump 两表 fields 对照（NocoBase fields API）；不齐则该 KPI 卡降级保留 hub_* 数据源 + 卡面标注，或隐藏销售卡——不阻塞其余八域 KPI | G6 |
| 41 个分叉文件三方合并引入隐性回归（nocobase-mail Provider 剥离、use-chat-state 60 行差异、data-table 24 行差异等） | **中** | 分叉文件按需最小合并；CRM 侧现状优先原则；每批 CRM e2e（login/smoke/lists）+ 原有域抽查兜底 | G2-G5 |
| locale 词条键冲突（groups.* CRM 侧缺失；starter ns 聚合机制 CRM 侧需新建） | 中 | G2 建立 locale 聚合机制（对齐 Hub `locales/index.ts` 10 域聚合模式）+ 每批 tsc + 浏览器中文断言 | G2 |
| 单批 50-65 文件拷贝的遗漏/路径错误 | 低 | 域目录整拷（cp -R）+ `portal tsc --noEmit` 全量类型检查 + 深链逐页探活清单 | G3-G5 |
| ACL：新域 resource `meta.acl {type:"collection"}` 依赖后端角色权限（admin root 全通过；如有普通角色需配） | 低 | 当前仅 admin 使用（root 全权）；QUICKSTART 记录角色配置路径 | G2 |
| 移植期间 Hub 源漂移 | 低 | 硬约束冻结 Hub 只读；G8 终验 diff 确认 Hub 零改动 | 全 |
| overview ECharts 明暗联动/`hub.home.pinnedModules` localStorage 在 CRM 域名下的行为 | 低 | G6 浏览器实测明暗切换 + Pin 持久化；异常则 storage key 加域前缀 | G6 |
| 批量新增页面叠加 deploy 产物体积/构建时间增长 | 低 | G8 记录构建时长基线对比；超阈值再议 code-split 优化（不阻塞） | G8 |
