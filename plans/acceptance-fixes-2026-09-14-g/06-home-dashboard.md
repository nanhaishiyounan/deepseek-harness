# 批次 G6：home 域移植 + CRM 新首页改造（overview/week-strip/quick-search + 销售 KPI 改绑 crm_*）

> 隶属 [PLAN.md](PLAN.md)。前置：G3（overview 聚合的项目/任务数据域就位；G4/G5 提供其余 KPI 但非硬依赖——聚合钩子对缺数据域有容错则可提前，实施时以第 0 步探查为准）。本批是 UI 设计感的落点：Hub overview 仪表式首页成为 CRM 默认首页，原 CRM dashboard 降级为「销售工作台」二级入口。

## 改动面 1：home 域拷入

```sh
cp -R platform/nocobase-portals/demo-portal-hub/src/pages/home platform/nocobase-portals/demo-portal-crm/src/pages/home
```

10 文件 / 3,062 行：[overview.tsx](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/overview.tsx)（1,142 行：ECharts 九域 KPI + BuildStoryBanner + 可 Pin 模块九宫格 `hub.home.pinnedModules` + team/mine 双 scope）、[week-strip.tsx](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/week-strip.tsx)（未来一周日程条，activities/tasks/deals 三源）、[quick-search.tsx](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/quick-search.tsx)（594 行 cmdk 跨 8 collection）、data.ts（useOverviewData 聚合钩子）、theme.ts（useChartTheme 明暗联动）+ 骨架件。

路由聚合 + `home` resource meta（priority 0、acl:false、icon LayoutDashboard）照 [home/module.tsx](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/module.tsx) 注册；locale 并入。

## 改动面 2：第 0 步探查——销售数据源改绑裁决（先探查后动手）

**问题**：`useOverviewData`（data.ts）与 quick-search 的数据源含 4 个销售 collection（hub_sales_deals/accounts/leads/contacts）。sales 域不移植（决策 2），用户主销售数据在 `crm_*`——首页销售 KPI 若读 hub_sales_* 会显示「另一套销售的数字」，与 CRM deals 页数字不一致。

**第 0 步（必须先做）**：dump 两表 fields 对照：

```sh
# NocoBase fields API（或 psql \d）
curl -s "http://127.0.0.1:13000/api/hub_sales_deals:listFields" -H "Authorization: Bearer <token>"   # 按 verify probes 的取法
psql -c "\d crm_deals" -c "\d hub_sales_deals"   # 字段名/类型对照
```

**裁决分支**：
- **A（优先）字段可映射**（金额/状态/日期在两表都有，仅名字不同）：改 [data.ts](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/data.ts) 聚合钩子的销售数据源为 `crm_deals`（+ `crm_customers` 替 accounts、`crm_leads`），逐字段映射（如 amount→value、stage→status）；quick-search 同步改（sales 搜索源 crm_deals/contacts/leads）；
- **B 字段差异过大**：销售 KPI 卡保留 hub_sales_* 数据源，卡面 tooltip 标注「演示销售数据」，QUICKSTART 说明；或按 overview 的模块 Pin 机制默认隐藏销售卡。**不阻塞其余八域 KPI**。

week-strip 的 deals 源同裁决。**crm_* 侧字段以 [CRM routes.tsx](../../platform/nocobase-portals/demo-portal-crm/src/pages/crm/deals) 的 fields 引用为真源**（list/show/form 三处引用的字段即页面消费集）。

## 改动面 3：首页裁决落地

1. **CRM 根路径 `/` 重定向**：现 [`src/routes.tsx`](../../platform/nocobase-portals/demo-portal-crm/src/routes.tsx) 首页指向 crm dashboard——改为 `/overview`（home 域 priority 0 自动成为 useMenu 首项；Navigate 根路由改指 overview 路径）；
2. **原 crm dashboard 保留**：路由不动，resource meta 挂 group_sales、label 改「销售工作台」（locale 词条 `crm.resources.dashboard` 调整或新增 alias），priority 调低——零功能删减，纯入口降级；
3. **quick-search 入口**：Hub 的 quick-search 挂在 header 搜索位（Hub header.tsx 顶栏形态）——CRM header 现有 `CrmGlobalSearch`（CRM 单域搜索）。裁决：**保留 CrmGlobalSearch 不动**（CRM 风格基准），quick-search 以 `/overview` 页内入口 + cmdk 快捷键（Cmd+K）暴露（Hub 原生交互）；两者并存不冲突（CrmGlobalSearch 搜 crm_*，quick-search 跨全域）。若实施中发现 Hub quick-search 与 header 强耦合（检查 [quick-search.tsx](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/quick-search.tsx) 的挂载方式），则只在 overview 页内嵌入口。

## 验收断言（证据落 `examples/kb-agent/demos/acceptance-g6/`）

1. 新首页：登录 CRM 直落 `/overview`——ECharts KPI 网格 + week-strip + 可 Pin 九宫格全渲染（截图明暗两态，图表随主题联动）；
2. 销售 KPI 数据一致性（裁决 A 时）：overview 销售卡数字 = `/deals` 列表统计（如进行中商机数/金额），截图对照；裁决 B 时：标注与说明落 QUICKSTART；
3. Pin 持久化：隐藏两个模块 → 刷新仍隐藏（`hub.home.pinnedModules` localStorage）；
4. team/mine 双 scope 切换可用；
5. week-strip 显示未来一周 activities/tasks/deals（三源聚合）；
6. quick-search（Cmd+K 或页内入口）搜「项目/工单/文章」关键词命中 G2-G5 各域至少一条；
7. 原销售工作台（原 dashboard）仍可达：侧栏「销售」组内入口 + 原功能（KPI/最近记录）零回归；
8. CRM 零回归 + 前批域抽查（/tickets、/tasks、/expenses 各一页）；
9. `portal tsc` EXIT=0 + deploy 双跑树哈希一致 + verify 全绿。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| 字段映射后 KPI 计算口径不一致（枚举值域 crm stage vs hub_sales status） | 中 | 第 0 步 dump 值域一并对照；映射表写进本批提交信息；口径不符走裁决 B |
| overview ECharts 依赖域缺数据（某域表空） | 低 | data.ts 聚合对空表有默认 0/骨架（Hub 实况九域演示数据已在）；实测覆盖 |
| pinnedModules localStorage key 与 Hub 同 key 串值（同浏览器两个 Portal） | 低 | key 前缀加 `crm.`（一处常量改）；若实测 Hub/CRM 互不干扰则零改 |
| 根路由重定向影响既有书签（/ 直开） | 低 | Navigate 保持 SPA 内跳转，深链（/deals 等）不受影响 |

回滚：home 域拷贝与首页重定向独立提交；revert 后 crm dashboard 恢复首页即回 G5 终态。
