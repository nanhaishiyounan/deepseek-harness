# Agent Note: NocoBase demo-grade modules and portals — programmatic page blocks, portal field alignment

Status: implemented

[English](2026-09-09-nocobase-demo-grade-modules-and-portals.md) | 中文

## Problem

NocoBase 快照最初只用一张手工页面伺服五个专家数据集 collections，而官方 demo 带八个业务模块、四个任务视图、AI 雇员与独立 Portal 前端。弥合差距落成三条决策，值得记录——因为看似顺手的替代方案在这个 2.2.6 快照上都走不通。

## Decision

### 页面区块经 REST 插入，不在浏览器里配置

计划的双轨策略预期浏览器侧区块配置加程序化打底。实践结果是 `yarn dev-server` 下的 v2 客户端要等很长的插件 chunk 预热才渲染新页面，与重渲染竞速的 DOM 查询让浏览器自动化不可靠（页面在"已渲染/空白"间振荡，而截图其实有内容）。最终全部程序化：

- 表格/看板/日历/甘特的区块树复用快照内已验证的 wire 形状（手工 experts 表、官方插件 e2e 模板），经 `uiSchemas:insertAdjacent` 插到每页 Grid 子节点。
- 幂等按区块类型判定：Grid 已带配置的区块数/组件时保留既有区块；种子按业务唯一键 upsert；菜单按标题判重。
- 两个 wire 陷阱固化进脚本而非口口相传：单选字段是 `type: string` + `interface: select`（DB 层没有 select 类型）；名为 `type` 的列节点与 JSON-Schema 关键字冲突，静默渲染出空表。

### Portal 前端保持原版，后端生长出别名字段

计划里的 X-Portal/portal-sdk-2.1.0-on-2.2.6 风险没有触发：登录走同源 basic authenticator cookie，REST 直通。真实差距是字段命名——portal 聚合 `crm_leads.status`、`crm_customers.company_name`、`crm_deals.stage/expected_close_date/closed_date`、`hub_pj_tasks.due_date`、`hub_kb_articles.createdAt` 等，而 admin 侧模型用的是另一套名字。与其 fork portal（不可维护的漂移）或改 admin 字段名（破坏 admin 页面与种子 fixture），每个模块脚本长出 `ensurePortalFields`：加 portal 命名的列并幂等地从 admin 命名的值回填。两套词汇并存；`crm_deals` 刻意同时带履约 `status`（admin 语义）与管线 `stage`（portal 语义），因为它们回答不同的问题。

### setup 链重放建模，不重放 portal 构建

`setup-nocobase.mts all` 现在在 `plugins`/`ai` 之后以子进程重放两个模块脚本，清空的数据库仅靠 REST 即可恢复完整功能面。Portal 产物**不**进链重建：它们是 vendored checkout（`platform/nocobase-portals/`，上游 commit 记在批次实录）的静态构建产物，由 `nocobase-portal-deploy.mts` 部署，`stepVerify` 只探测（`/dist/crm|hub/` HTML 可达）。每次 `all` 都重建 vite bundle 会让数据库拉起耦合到依赖网络的安装，且没有重放价值。

## Alternatives considered

**demo 数据的 dump/restore。** 版本降级路径被禁止且无官方 dump；计划已排除。

**强推官方四 tab Tasks 单页。** tab wiring 只能交互式配置；四个同组页面经稳定的程序化路径交付同一视图集（记为批次偏差）。

**fork portal 或改名 admin 字段。** fork 会脱离上游不可维护地漂移；改名破坏 admin 页面与种子 fixture。别名列加回填让两套词汇以更低代价共存。

**AI 雇员自定义提示词 / workflow LLM 节点。** 验收锚点之外的可选增强；未取。

## Consequences

完整功能面（菜单、页面、区块、种子、portal）仅靠 REST 重放即可恢复，浏览器的不稳定不再把拉起卡成门禁。代价：浏览器配置的图表仪表盘（echarts 配置是纯交互面）——两张 CRM 仪表盘以表格底座交付，作为偏差记入批次实录。批次证据与逐页截图：[01-batches.md](../../../../plans/nocobase-full-features/01-batches.md) · plan [PLAN.md](../../../../plans/nocobase-full-features/PLAN.md)。
