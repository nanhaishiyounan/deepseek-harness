# 批次 G2：壳层扩容（分组菜单 + locale 聚合）+ helpdesk 试点域移植

> 隶属 [PLAN.md](PLAN.md)。前置：G1（table-kit 已就位）。本批是全部域批的公共前置：先搭「域模块接入」的壳层机制（菜单分组四段 + 路由聚合 + locale 聚合），再用 helpdesk 域（用户首个点名、20 文件中等规模）做整模块移植试点，打通「域移植全流程」并固化成后续批次的操作模板。

## 改动面 1：壳层——菜单分组四段并入 CRM extensions.tsx

**文件**：[platform/nocobase-portals/demo-portal-crm/src/app/extensions.tsx](../../platform/nocobase-portals/demo-portal-crm/src/app/extensions.tsx)（97 行 → ~200 行）

从 Hub [`app/extensions.tsx:42-162`](../../platform/nocobase-portals/demo-portal-hub/src/app/extensions.tsx:42) 移植四段并适配：

1. **`makeGroup` 工厂 + `sidebarGroups`**（Hub :49-74）：7 组照搬（group_revenue 不引入 sales 资源成员也保留组名——见下方裁决），icon/priority 不变；**新增第 8 组 `group_sales`（「销售」，priority 1，icon 用 CRM 现有 `TrendingUp` 或 `Target`）承载 crm 域资源**，原 7 组 priority 顺延 2-8；
2. **`resourceGroupParent` 映射**（Hub :77-129）：只拷本批涉及的 helpdesk 三键（`hub_hd_tickets: "group_support"`、`hd-sla`、`hd-faq`）+ CRM 侧映射：crm 域全部资源名挂 `group_sales`（deals/customers/contacts/leads/activities/products/quotes/reports/targets——具体 resource name 以 CRM [`routes.tsx`](../../platform/nocobase-portals/demo-portal-crm/src/routes.tsx) 中 defineAppRoutes 的 name 字段为准，实施时逐个抄录）；`helpdesk-dashboard` 挂 group_support；
3. **`priorityOverride`**（Hub :134-140）：本批不需要（helpdesk 单域无交错问题），机制随段带入、映射留空对象；
4. **`groupedRouteResources` + `configuredResources` 改写**（Hub :142-162）：CRM 现有 [:54-57](../../platform/nocobase-portals/demo-portal-crm/src/app/extensions.tsx:54) 的 `configuredResources = [...buildRouteResources(...), ...resources]` 改为 Hub 的 map 注入 parent/priority 模式 + `[...sidebarGroups, ...groupedRouteResources, ...resources]`。

**分组裁决**：group_revenue（Revenue）组在 sales 域不移植后无成员——**删除该组**，七组变「销售 + Delivery/People/Operations/Finance/Support/Knowledge」共 8 组（1 个 CRM 组 + 6 个 Hub 组沿用 + 后续域批逐批挂成员）。组名 i18nKey（`groups.*`）词条随改动面 2 并入。

保留 CRM 现有全部逻辑不动：`unavailableOptionalRuntimeExtensions`（OIDC/SAML）、nocobase-mail Provider 剥离（[:31-32](../../platform/nocobase-portals/demo-portal-crm/src/app/extensions.tsx:31)）、development 路由。

## 改动面 2：壳层——locale 聚合机制

**文件**：[platform/nocobase-portals/demo-portal-crm/src/locales/index.ts](../../platform/nocobase-portals/demo-portal-crm/src/locales/index.ts)

对齐 Hub [`locales/index.ts:16-25`](../../platform/nocobase-portals/demo-portal-hub/src/locales/index.ts:16) 的模式：聚合各移植域 `locale.ts` 的 en-US/zh-CN 词条对注册进 starter ns。本批并入 helpdesk 的 [`pages/helpdesk/locale.ts`](../../platform/nocobase-portals/demo-portal-hub/src/pages/helpdesk/locale.ts)（en-US + zh-CN）+ 分组词条（`groups.sales/delivery/people/operations/finance/support/knowledge`，zh-CN 从 Hub [`locales/zh-CN.ts`](../../platform/nocobase-portals/demo-portal-hub/src/locales/zh-CN.ts) 的 groups 段抄录、en-US 从 en-US.ts）。CRM 侧现有 `crm.*` 词条不动。其余 21 语言（Hub locales/pages/ 机翻产物）**不拷**——zh-CN/en-US 足够（QUICKSTART 用户面是中文；Hub 其余语言本就质量存疑，减小移植面）。

## 改动面 3：helpdesk 域整模块拷入 + 聚合点注册

```sh
cp -R platform/nocobase-portals/demo-portal-hub/src/pages/helpdesk \
      platform/nocobase-portals/demo-portal-crm/src/pages/helpdesk
```

- 20 文件 / 6,658 行（tickets list 1,092 + show/replies/status-change、dashboard 448、agent-performance 730、sla-policies 704、faq 562 + 骨架件）；
- 内部 import 全部走 `@/` 别名（`@/lib/table-kit`、`@/components/ui/*`、`@/components/data-table`、`@/components/resources/*`）——G1 已就位 table-kit，其余两侧逐字节相同；**拷贝零改写**（保真原则）；
- **data-table.tsx 24 行分叉**：helpdesk 页面若 import `@/components/data-table/data-table.tsx`，用的是 CRM 版（24 行差异——实施时 diff 双方该文件，若 Hub 版有 helpdesk 依赖的能力（如某 prop），以 CRM 版为基线合并 Hub 差异；否则零动作）；
- **路由聚合**：[CRM src/routes.tsx](../../platform/nocobase-portals/demo-portal-crm/src/routes.tsx) 顶部 `import { helpdeskModule } from "@/pages/helpdesk/module"`，`defineAppRoutes([...现有全部, ...helpdeskModule.routes])`——现有 789 行不重构；
- **route-surfaces.ts 分叉（139 行差异）**：helpdesk/module.tsx 若 import `./route-surfaces`（域内文件，随域拷贝）则无关；若引用全局 `route-surfaces/extension.tsx` 需检查（Hub 的 demo route-surfaces 是 ◆Hub 特有，CRM 侧无——tsc 会暴露，缺则从 Hub 拷 `src/route-surfaces/` demo 4 件或按需裁剪）。

## 实施步骤

1. 壳层两改动（extensions.tsx 四段 + locales/index.ts 聚合）——先不挂 helpdesk，tsc 通过后浏览器确认 CRM 原菜单已分组（「销售」组含 crm 全部资源、组可折叠）；
2. `cp -R` helpdesk 域 + routes.tsx 聚合点两行；
3. `pnpm tsc --noEmit` 迭代至 EXIT=0（预期暴露项：data-table/route-surfaces 分叉差异、locale 类型缺失——逐项处理）；
4. deploy 双跑 + 浏览器验收；
5. 独立提交（壳层与 helpdesk 可拆两提交，便于 revert 粒度）。

## 验收断言（证据落 `examples/kb-agent/demos/acceptance-g2/`）

1. 侧栏截图：8 组结构（销售/Delivery/People/Operations/Finance/Support/Knowledge——空组不渲染，本批仅「销售」「Support」有成员）+ 折叠展开动图或双截图；
2. helpdesk 四页浏览器实测（:3080/nocobase/dist/crm/）：`/tickets`（列表渲染 hub_hd_tickets 真实数据 + 筛选/分页）、`/helpdesk/dashboard`（KPI 图表）、`/sla-policies`、`/faq`；深链直开 200；
3. ticket 新建表单提交落库（浏览器操作 + psql `SELECT count(*) FROM hub_hd_tickets` 前后对照或列表刷新可见新行）；
4. ticket 详情/reply 线程页可用（打开一条 show，回复一条）；
5. 悬浮球在 /tickets 页出现且可打开（N22 就绪前提）；
6. CRM 零回归：dashboard/deals/leads 三页抽查 + 6 个 playwright e2e + 中文界面断言（helpdesk 页面标题/表头为中文——locale 聚合生效证明）；
7. `portal tsc` EXIT=0 + deploy 双跑树哈希一致 + verify 全绿。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| 分组后 CRM 原菜单排序变化（priority 语义在组内生效） | 低 | 验收步骤 1 截图对照；crm 资源原 priority 不变，仅多一层父组 |
| data-table/route-surfaces 分叉文件合并引入 CRM 回归 | 中 | 以 CRM 版为基线只增不改；CRM 6 e2e + 三页抽查兜底；必要时 helpdesk 域内自带私有副本（违背保真原则的例外需在提交信息记录） |
| locale 类型不匹配（starter ns 类型约束） | 低 | 对齐 Hub 聚合的类型写法；zh-CN/en-US 双语断言 |
| ACL：hub_hd_tickets 的 meta.acl collection 权限对 admin root 全通过 | 低 | 当前仅 admin 使用；QUICKSTART 记录普通角色配置路径（G7 文档节） |

回滚：壳层提交与 helpdesk 提交独立 revert；revert 后 redeploy 即回 G1 终态。
