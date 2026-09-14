# Agent Note: CRM Portal 吸收 Hub 全部功能域

Status: implemented

[English](2026-09-14-crm-portal-hub-domain-absorption.md) | 中文

## Problem

部署里同一份 NocoBase demo 模板跑着两个同源 Portal：CRM Portal 承载销售链路，Hub Portal 承载九个运营域（客服/项目/人事/资产/库存/财务/采购/知识库/首页）。用户要记两个书签、记哪个域在哪一侧，而且 Hub 首页的销售数字读的是另一套 `hub_sales_*` 数据，与 CRM 页面不一致。验收要求是单一主入口：CRM Portal 形态，Hub 的全部能力真实可用（页面/表单/详情/仪表盘），不是只挂菜单链接。

## Decision

每个 Hub 域以逐字节相同的 `pages/<domain>/` 拷贝落入 CRM Portal，并在三个聚合点注册——`src/routes.tsx` 的 `defineAppRoutes` 模块列表、`src/app/extensions.tsx` 的侧栏分组映射与 priority 覆盖、`src/locales/index.ts` 的 starter 词条合并。批次顺序（G2 helpdesk 试点 → G3 projects+hr → G4 assets+inventory → G5 finance+procurement+knowledge → G6 home）保证每批可独立 revert；Hub 源全程冻结只读，作 diff 真源。

偏差是登记过的分叉，每处文件内有一行注释说明：

- `pages/inventory/routes.ts` —— 库存商品挂在 `/inventory/products` 前缀下，因为裸路径 `/products` 属于 CRM 原生产品价格簿。
- `pages/home/data.ts` 与 `quick-search.tsx` —— overview 与全局搜索的销售查询改绑 `crm_deals`/`crm_activities`/`crm_customers`/`crm_contacts`/`crm_leads`，配字段适配（title→name、account→customer、subject→title），首页销售 KPI 与 `/pipeline` 数字同源。第 0 步字段对照确认 `amount` 与 `stage` 枚举两表同名同值，无需降级分支。
- `pages/home/module.tsx` —— overview 资源 priority 定为 -1，排在全部 `crm_nav_*` 组之前；根路径 `NavigateToAccessibleResource` 落 `/overview`，原销售仪表盘保留在 `/dashboard`，词条改为「销售工作台」作二级入口。
- 六个新建表单（客服工单/资产/知识文章/员工/库存商品/采购单）挂载 vendored `useAiEmployeeFill` 面板，连同 G3/G5 随域带来的与 CRM 原有的两个，Portal 前端挂载点共十一个。

拷贝暴露出的种子侧 schema 漂移全部在种子脚本里幂等修复，从不改动拷贝页面：`hub_as_assets` 补排序列 `tag` 与账面列 `value`；`hub_as_maintenance.vendor` 由 belongsTo 改 input（模板表单提交纯文本）；`crm_products` 补 `active`/`unit_price`/`sku`，`crm_quotes` 补 `quote_number`/`revision_note`/`createdAt` 并回填镜像值；`crm/global-search.tsx` 去掉种子表从未有过的过滤字段（customers 的 `phone`、leads 的 `email`、deals 的 `title` 改 `name`）。

Hub Portal 保留但叙述降级：n17 应用中心重建后 CRM 卡首位（主要入口）、Hub 卡为模板参考；QUICKSTART 的 Portal 三节改写为 CRM 单主入口叙述。物理退役（部署表、verify 探针、网关 favicon、`hub_*` probe 语义、n17 卡、目录删除）留待下一轮，六项依赖清单已登记。

## e2e 语言接缝

vendored Playwright 套件断言英文 UI，而部署把 `systemSettings.enabledLanguages` 钉在 `["zh-CN"]`（verify 门禁锁住），`app:getLang` 回显登录用户的 zh-CN。与其重写 74 处断言或动钉死的后端设置，不如只在 e2e dev server（`vite --mode e2e`）把浏览器钉成 en-US：index 文档在启动前种下 `NOCBASE_LOCALE=en-US`，两个决定语言的接口在飞行中被改写回报 en-US。生产构建不受影响。`auth.setup.ts` 跟随 G6 落点变化断言 `/overview`。

## Alternatives considered

**一次性全量拷贝。** 单批拷九域最快，但回归面不可评审；后续每轮验收都在自己域里发现漂移，逐批 revert 的余地不会存在。

**菜单挂 Hub 活路由。** CRM 菜单直挂 Hub 页面满足「一个书签」，但 Hub 构建仍是运行时依赖、数据叙事永不合并，也恰是验收原话否掉的「不仅是菜单级别」。

**拷贝时按 CRM 约定重写页面。** 边拷边归一化字段与共享组件会让每个文件都变成对移动目标的三方合并；逐字节拷贝加具名分叉保住 Hub 树的 diff 真源地位，偏差收敛到注释。

**overview 继续用 Hub sales 域做数据源。** Hub 首页聚合 `hub_sales_*`，不改就会在 CRM 管道旁边显示「另一套销售的数字」。字段对照发现同名同枚举，改绑（裁决 A）胜出；降级方案（演示数据标注或隐藏卡片）未启用。

**本轮就物理退役 Hub Portal。** 部署链、verify 探针、网关 favicon 规则都还引用它；验收进行中拆除会让冻结源真源失效并打断用户书签。先叙述降级，下一轮按六项清单物理移除。

## Consequences

CRM Portal 成为单一主入口：十域、八个侧栏分组、仪表式首页（销售 KPI 直读 `crm_*`）、十一个 AI 表单挂载点；Hub Portal 保留为冻结的模板参考。代价：两处登记的路由/源码分叉在 diff Hub 时要记在心上；若干只因模板期望而存在的种子列；一份延后的 Hub 退役清单。e2e 基线回到 59/22——schema 漂移族已清（PG 尾流无 `column … does not exist`）；剩余 22 个是既有的数据语义/UI 形态断言，记录在验收日志，不属于补列能解决的范围。
