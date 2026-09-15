# G 轮调研事实底座（00-research-notes）

> 三路并行 project-research 子任务（A 路 Hub 全量域清单 / B 路 CRM 结构+品牌链 / C 路部署链+门禁+Hub 引用面）+ 主任务亲证交叉。所有结论附文件:行号或命令证据。基线 HEAD=`74da6fff60`（dev，未推送）。

## 1. logo/品牌资产链现状（主任务亲证 + B 路交叉）

### 1.1 资产层：两侧逐字节相同（shasum 实测）

```
SAME logo-mark.png      (26840f4cd6a4)  74487 bytes
SAME logo-mark-dark.png (3cfa587dbf2a)  75253 bytes
SAME favicon.ico        (a2a84b64043e)  15406 bytes
SAME logo.png           (cdf3a31e5cdd)  30490 bytes
SAME logo-dark.png      (68c6034d84e5)  30704 bytes
```

双 Portal `public/` 目录清单完全一致；`logo.png`/`logo-dark.png` 在两侧源码零引用（上游模板遗留死资产）。[`index.html`](../../platform/nocobase-portals/demo-portal-crm/index.html:5) 两侧逐行一致（favicon link / og:image → logo-mark.png / title）。

### 1.2 渲染层：唯一分歧 = `Brand()` 聚合组件结构

| 组件 | CRM | Hub | 判定 |
|---|---|---|---|
| [`BrandLogo`](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/brand.tsx:12) | 双 img 明暗槽 `assetUrl("logo-mark.png")`/`logo-mark-dark.png` | 逐行相同 | ★共有 |
| [`BrandWordmark`](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/brand.tsx:29) | 纯文字「DSH食品业务平台」 | 逐行相同 | ★共有 |
| [`Brand`](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/brand.tsx:47) | `showText ? <Wordmark/> : <Logo/>`（XOR，:52-58） | 无条件 `<Logo/>` + showText 时竖线分隔 + `<Wordmark/>`（[:50-59](../../platform/nocobase-portals/demo-portal-hub/src/components/app-shell/brand.tsx:50)） | **△唯一分歧** |

CRM 三个消费点全走缺陷分支（默认 showText=true）：[sidebar.tsx:295](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/sidebar.tsx:295)、[header.tsx:113](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/header.tsx:113)、[auth-layout.tsx:24](../../platform/nocobase-portals/demo-portal-crm/src/components/auth/auth-layout.tsx:24)。侧栏收起态（showText=false）两边反而一致（都显图形）——差异只出现在展开态/登录页/顶栏，恰是用户日常视角。

### 1.3 D 轮品牌链改了什么、漏了什么

已统一（C4/C6/C7/C8/D4）：`BrandLogo` assetUrl 运行时解析（portal-base-runtime Note）、部署链三资产字节覆盖（favicon + 明暗 logo-mark，[nocobase-portal-deploy.mts:62-72](../../examples/kb-agent/scripts/nocobase-portal-deploy.mts:62)）、`<title>`、DocumentTitleHandler appName、og:image/twitter:image 代理重写、fork 文案（Salesroom CRM/All in one → DSH食品业务平台，D4 清单 [04-brand-polish.md](../acceptance-fixes-2026-09-12/04-brand-polish.md)）。**漏了 `Brand` 聚合组件的 DOM 结构收敛**——D4 源码级清单只有 brand.tsx:3 的 APP_NAME 常量，没有 Brand 函数体。

## 2. Hub Portal 功能域全量清单（A 路 + 主任务 wc 实测）

### 2.1 pages/ 十域规模

| 域 | 文件/行数 | 路由 | collections | 核心组件 |
|---|---|---|---|---|
| home | 10 / 3,062 | /overview (priority 0, acl:false) | 跨域聚合 | overview.tsx 1,142 行（ECharts+Pin 九宫格）、quick-search 594（cmdk 跨 8 collection）、week-strip 189 |
| sales | 40 / 13,096 | /deals /accounts /contacts /leads /activities /sales-calendar /forecast | hub_sales_deals/accounts/leads/activities/contacts | pipeline 拖拽看板 812 行、grid/data-grid 400、insights/forecast 760 ECharts、calendar 431、lead convert 事务工作流 |
| projects | 25 / 9,247 | /projects /tasks /milestones /my-tasks /project-calendar /workload | hub_pj_projects/tasks/milestones/checklist | 任务看板 545 拖拽换 status、checklist 子 CRUD、timeline 310、workload 473、calendar 609、状态机 transitions.ts |
| hr | 25 / 8,648 | /employees /departments /leave /org-chart /leave-calendar /joiners-leavers | hub_hr_employees/departments/leave_requests | org-chart 438、leave-calendar 378、lifecycle 385、stats 369 |
| inventory | 26 / 7,262 | /inventory /products /warehouses /stock-moves /reorder /stock-by-warehouse /inventory-turnover | hub_inv_products/warehouses/stock_moves | dashboard 674、reorder 627、stock-matrix 392、turnover 405 |
| procurement | 21 / 5,997 | /procurement-spend /purchase-orders /suppliers | hub_po_purchase_orders/suppliers/items | spend-analysis 921、item-form 203 |
| helpdesk | 20 / 6,658 | /tickets /helpdesk/dashboard /helpdesk/agents /sla-policies /faq | hub_hd_tickets/replies/sla_policies/faqs + users | tickets list 1,092（最大单页）、agent-performance 730、sla 704、faq 562 |
| assets | 26 / 7,383 | /asset-registry /assignments /asset-maintenance /asset-ledger | hub_as_assets/assignments/maintenance | ledger 501 折旧账面、领用/退还状态机 |
| finance | 22 / 6,870 | /finance /finance/reports /cash-flow /budget /ar-aging /invoices /expenses | hub_fin_invoices/invoice_items/expenses/budgets | reports 559、aging 514、cash-flow 430、expenses decision 审批面 |
| knowledge | 22 / 7,251 | /kb-overview /articles /categories /kb-search /kb-tags | hub_kb_articles/categories/article_feedback | articles list 827 / show 695 / feedback 436、dashboard 545、search 478、category-tree 276 |

每域标准骨架：module.tsx（路由+resource meta）/ routes.ts / route-components.tsx（lazy+ACL）/ route-surfaces.ts / shared.tsx / locale.ts（en-US+zh-CN 对）/ constants.ts / types.ts / pickers.tsx + 子实体 list/form/show。认证页 4 目录（login/register/forgot-password/forgotPassword，后者为模板遗留双命名）为 5-6 行 re-export 壳，真实实现在 ★共有 components/auth/（15 文件）。

### 2.2 AI 面

- **悬浮球**（Provider 级全局）：[nocobase-ai/extension.tsx:14-16](../../platform/nocobase-portals/demo-portal-hub/src/extensions/nocobase-ai/extension.tsx:14) 注册 → `AppExtensionProviders` 包裹全应用；450px 边栏 + RouteOverlayViewportContext 避让 + 可拖拽悬浮球（未读角标）；就绪门槛 `configurationStatus==="ready" && employees.length>0`。两侧共有（nocobase-ai 120 文件骨架逐字节同源级）。
- **ai-employee-fill**：组件 ★共有（[ai-employee-fill.tsx:35](../../platform/nocobase-portals/demo-portal-hub/src/components/ai-employee-fill/ai-employee-fill.tsx:35) 绑定 AI 员工 dex、FormFillerAutoApprover、500ms 防抖、useAIFormRegistry+useAIPageElement 双注册）。Hub 挂载 4 formId：sales/leads `hub-sales-lead-create`（[form.tsx:111](../../platform/nocobase-portals/demo-portal-hub/src/pages/sales/leads/form.tsx:111)）、projects `hub-project-create`（[form.tsx:288](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/projects/form.tsx:288)）、tasks `hub-task-create`（[form.tsx:423](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/tasks/form.tsx:423)）、expenses `hub-expense-create`（[form.tsx:159](../../platform/nocobase-portals/demo-portal-hub/src/pages/finance/expenses/form.tsx:159)）。CRM 挂载 2 formId：deals `crm-deal-create`（[form.tsx:127](../../platform/nocobase-portals/demo-portal-crm/src/pages/crm/deals/form.tsx:127)）、leads。
- AI 后端链：nocobase-ai-service → portal-sdk client → NocoBase plugin-ai aiConversations SSE；vite dev proxy 有 SSE 响应头处理（identity/no-cache/x-accel-buffering）。

### 2.3 技术栈基座（两侧同源）

`@refinedev/core` ^5.0.8 世代、react-router ^7、React 19.1、Vite ^6.3.5、**Tailwind v4**（`@tailwindcss/vite`，token 在 App.css `@theme inline` + `:root`/`.dark` oklch 变量）、shadcn 新世代（`@base-ui/react`，components/ui 63 件）、echarts ^5.5、`@nocobase/portal-sdk` ^2.1.0（auth/data/acl/i18n/routing/extensions/runtime，npm 依赖）。theme-provider storageKey 两侧同 `"nocobase-theme-crm"`。i18n：configurePortalI18n 23 语言、defaultNS starter、zh-CN 主资源 + 各域 locale.ts 对；Hub 另有 ◆locales/pages/ 21 文件（34,062 行机翻产物，可选拷贝）。ACL：portal-sdk aclStore + RouteAccessGuard + resource meta.acl。

### 2.4 Hub↔CRM diff 总账（A 路）

Hub 740 vs CRM 554 文件；共同 444（**403 逐字节相同** + 41 分叉）；Hub 独有 296；CRM 独有 110（pages/crm/ 66 文件 20,316 行 + extensions/nocobase-mail 44 文件 9,298 行——**CRM 独有邮件域，移植时保留**）。

**41 个分叉文件**（差异行数，按重要性）：src/routes.tsx（783，结构性）、locales/en-US.ts（756）/zh-CN.ts（711）/21 语言（各 322）/generated.ts（42）/index.ts（17）、app/extensions.tsx（151）、route-surfaces/extension.tsx（139）、build-story/replicate-prompt.ts（89）、nocobase-ai/providers/use-chat-state.ts（60）、components/app-shell/header.tsx（32）、navigate-to-accessible-resource.tsx（28）、components/data-table/data-table.tsx（24）、sidebar.tsx（18）、brand.tsx（13）、layout.tsx/breadcrumb.tsx（6）、ui/select.tsx（3）、theme-provider.tsx/build-story-banner.tsx（1）。

### 2.5 菜单组织（主任务亲证）

无 menu provider，Refine useMenu + resource meta.parent/priority。Hub [app/extensions.tsx:66-162](../../platform/nocobase-portals/demo-portal-hub/src/app/extensions.tsx:66)：`sidebarGroups` 7 组（group_revenue/delivery/people/operations/finance/support/knowledge，priority 1-7）+ `resourceGroupParent` 映射（~40 resource）+ `priorityOverride` + `groupedRouteResources`（buildRouteResources().map 注入 parent/priority）→ `configuredResources = [...sidebarGroups, ...groupedRouteResources, ...resources]`。模板注释明确：parent-with-children 在侧栏展开时渲染 collapsible row、收起时 hover dropdown——**模板原生能力**。CRM [app/extensions.tsx:54-57](../../platform/nocobase-portals/demo-portal-crm/src/app/extensions.tsx:54) 现为无分组平铺。CRM 独有菜单徽章机制 [menu-badges.tsx:53](../../platform/nocobase-portals/demo-portal-crm/src/pages/crm/menu-badges.tsx:53)。

## 3. CRM Portal 现状（B 路 + 主任务）

单一 crm 域：子模块 activities(5)/contacts(3)/customers(5)/deals(6)/follow-ups(5)/leads(5)/products(4)/quotes(4)/reports(2)/targets(2) = 41 文件 + 域顶层 24 个（routes.ts/dashboard.tsx/global-search.tsx/list-toolkit.tsx/quick-create.tsx/ai-assistant.tsx/audit-trail.tsx/menu-badges.tsx/record-pager.tsx 等）= 65 文件 / 20,316 行。路由 [src/routes.tsx](../../platform/nocobase-portals/demo-portal-crm/src/routes.tsx:1) 789 行内联（defineAppRoutes + lazy route-components，deal drawer 嵌套路由结构复杂）。components/ 顶层目录与 Hub 完全同集（app-shell/auth/build-story/data-table/demo/development/notifications/resources/theme/ui/access-control/ai-employee-fill）。dataProvider：[App.tsx:14](../../platform/nocobase-portals/demo-portal-crm/src/App.tsx:14) `@nocobase/portal-sdk/data` 与 Hub 相同，NocoBase REST 直连，**无 apiproxy BFF 调用**（两侧源码 apiproxy 零命中）。

## 4. 部署链与暴露方式（C 路）

- 构建/部署：[nocobase-portal-deploy.mts](../../examples/kb-agent/scripts/nocobase-portal-deploy.mts:28) PORTALS 表 `{crm: /dist/crm/, hub: /dist/hub/}` → 每 Portal `pnpm build` + 注入 `NOCOBASE_PORTAL_BASE` → dist/ 整删整拷到 `platform/nocobase/storage/dist-client/<name>/` → 品牌字节覆盖（favicon + 明暗 logo-mark，`examples/kb-agent/workspace/assets/brand/` 真源）→ 注入 `window.NOCOBASE_PORTAL_BASE` + `window.NOCOBASE_API_URL="/api"`（fail-loud）→ title 改写 BRAND_TITLE。
- 暴露：无 Nginx 无子域。:13000 NocoBase gateway 直托管 `/dist/{crm,hub}/`；主链路 :3080 DSH 网关 `/nocobase/dist/{crm,hub}/`（SPA fallback 深链支持，D3 批）。**端口真相：:3080=DSH Web 网关、:13000=NocoBase、:5432=PG17、:13100=N22 LLM 代理 healthz**（QUICKSTART:225/:129）。
- 入口卡片：[nocobase-n17-alignment.mts ensureAppHub() :579-668](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:579)「应用中心」v1 顶层页四卡（CRM/Hub/AI 工作台/DSH 工作台），幂等=title+marker+copy-fingerprint，文案漂移整页重建。
- apiproxy BFF（packages/host/apiproxy/src/api/ 24 组域）无 hub/crm 域——Portal 不经 BFF。

## 5. 验证门禁现状（C 路）

主 verify：[setup-nocobase.mts](../../examples/kb-agent/scripts/setup-nocobase.mts)——n18ai- 挂载 ≥25（:767）、双 Portal 探活（:813）、AI 悬浮球图标 svg 断言（:823）、双 Portal 品牌资产字节级（:892）、网关三路 favicon sha（:939，含 /nocobase/dist/hub/）、~30 条 list probes（crm_* 6 + hub_* 15+，:947-999）。批次门禁惯例（[acceptance-e4/gates.log](../../examples/kb-agent/demos/acceptance-e4/gates.log)）：幂等双跑全 kept + typecheck/lint/doc-sync + **portal tsc ×2**（两 vendored Portal 各 tsc --noEmit）+ **deploy 双跑树哈希一致** + 网关 curl :3080 冒烟 + Agent Note 分类。截图证据：`examples/kb-agent/demos/acceptance-<批次>/`（`<批>-<序号>-<描述>.png` + gates.log）。CRM Portal 自带 6 个 playwright spec（e2e/：login/smoke/lists/metrics-charts/responsive/drawer-select/lead-conversion-guard）；Hub 无 spec；主仓 examples/kb-agent/tests/ 无 portal e2e。

## 6. QUICKSTART/文档叙述与 Hub 退役依赖面（C 路）

- 改写对象：[QUICKSTART.zh.md:138](../../examples/kb-agent/QUICKSTART.zh.md)（双 Portal 进入路径）、[:139](../../examples/kb-agent/QUICKSTART.zh.md)（E3 定位分工——含「Hub『营收』组与 CRM 菜单同名是官方双 demo 模板固有设计（Hub 首页聚合需要 sales 域）」）、[:140](../../examples/kb-agent/QUICKSTART.zh.md)（「Hub/CRM Portal 页面本身为模板静态页，菜单不开放运行时配置」边界）。
- Hub 退役硬依赖 6 处：portal-deploy PORTALS（:28-31）、verify 探活循环（:813）、C4/C6 断言循环（:823-903）、网关 favicon 三路（:939）、hub_* probes 15 条（:967-999，语义是 Portal 页面合同——G 轮后应改写为 CRM 新页面合同而非删）、n17 app-hub Hub 卡（:635）。另有 nocobase-hub-modules.mts 注释表述重审（collections 是 admin 26 v2 页数据源，**退役 Portal ≠ 退役 collections**）。
- git：dev 分支 HEAD `74da6fff60`；origin/master=b150a551（dev 从未推送，B~F 约 50 提交未推送）；最近提交链：74da6fff（docs F 终态）← 531db12c（F3/F6 截图）← 8966f5c9（F6 verify fixes）← 05b7e3b3（F5）← 3628a804（F4）← 97beba1b（F3）← f4543279（F2）← deda318b（F1）← 683d32a3（E6 基线）。

## 7. 主任务亲证命令记录

- 资产 hash：`shasum` 双 Portal public/ 5 文件全 SAME（§1.1）。
- 域规模：`find + wc -l` 双 Portal pages/（§2.1 表与 A 路报告交叉一致）。
- 结构亲读：双 brand.tsx 全文、Hub helpdesk/module.tsx（resource meta 含 acl/i18nKey/priority/icon/children 嵌套）、Hub home/module.tsx（注释「mirrors how crm's dashboard route is defined」同源佐证）、Hub app/extensions.tsx:40-169（分组四段）、CRM app/extensions.tsx 全文（97 行无分组 + nocobase-mail Provider 剥离逻辑 :31-32）、双 src/routes.tsx 开头。
- lib 对比：Hub `src/lib/`（field-validation + utils + **table-kit/ 33 文件**）vs CRM（仅 field-validation + utils）。
