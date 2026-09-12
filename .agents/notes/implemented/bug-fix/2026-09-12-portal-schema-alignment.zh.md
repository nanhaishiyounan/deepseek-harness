# Agent Note: Portal 400 —— 种子 schema 必须满足 Portal 前端钉死的排序契约；四个缺失域补齐表

Status: implemented

[English](2026-09-12-portal-schema-alignment.md) | 中文

## 问题

NocoBase Portal 同时出现三类故障（2026-09-11 真实起服诊断）。（A）CRM Portal 四个列表页 400——`crm_contacts:list?sort=name`、`crm_activities:list?sort=-date&appends=customer,contact`、`crm_leads:list?sort=-score&fields=score,source`、`crm_quotes:list?sort=-issue_date&filter=is_current` 全部把 `ORDER BY` 编译到种子 collection 从未有过的列上（实际列名是 `full_name`/`due_at`；`score`、`source`、`issue_date`、`root_quote_id`、`version`、`is_current`、`total` 根本不存在）。回归引入点 = c8eaf64e76（N24 重建部署 Portal）：官方 Portal 前端硬编码默认排序、列集与 append 关联，而种子 schema 从未对齐扩宽。（B）Hub Portal 的库存/销售/帮助台/财务菜单无数据：种子从未建这些域的表（含关联闭包共 16 张——`hub_inv_stock_moves` append `product,warehouse`，因此 warehouses 也必须存在）。（C）09-11 抓包中的 `crm_activities:query` 403。

## 决策

### 修复落在种子侧；绝不改 vendored portal 源码

Portal 前端是部署脚本钉住的上游 fork；collection 是我们自己的。[`nocobase-crm-modules.mts`](../../../../../examples/kb-agent/scripts/nocobase-crm-modules.mts) 的 `ensurePortalFields`（N16 时代同形态先例）补上十个缺失字段与 `crm_activities.contact` belongsTo，并从语义孪生列回填（`name`←`full_name`、`date`←`due_at`、`total`←`total_amount`、`issue_date`←`valid_until`）或确定性分布（线索评分 40–95 轮转、来源按 Portal 五值枚举轮换、`is_current` 真、`version` 1、`root_quote_id` 指自身）。联系人回填写裸 `contact_id`——比较 append 出来的关联对象会让每行每次重跑都重新 update，破坏链的幂等契约。

### 字段可行性先在真实服上手工验证，再固化脚本

普通列 + `fields:create` 先手工验证通过（`crm_contacts` → sort 请求 200），履行计划的第一步门禁——没有赌公式/虚拟字段，没有 portal fork 改动，fallback 路径未启用。

### hub 四域拿到带页面精确 wire 契约的真实表

[`nocobase-hub-modules.mts`](../../../../../examples/kb-agent/scripts/nocobase-hub-modules.mts) 声明四域 16 张 collection：枚举镜像 Portal 常量（`TICKET_STATUSES`、`DEAL_STAGES`、`INVOICE_STATUSES`……）、渲染 `nickname` 的 `belongsToUser` 关联、`hub_hd_tickets` 上的 `hasMany` 回复对、以及每张被 Portal 排序的表都声明 `createdAt` 列——本快照中 `collections:create` 的表只有 `id` 加声明字段（`hub_kb_articles.createdAt` 先例）。种子落在 hub fixture；面向用户的引用经既有 refKey map 按 `users.nickname` 解析。m2o fieldNames 回填现在把 users 关联标注 `nickname`（users 无 `name` 列）。

### verify 重放精确的 wire 请求

[`setup-nocobase.mts`](../../../../../examples/kb-agent/scripts/setup-nocobase.mts) verify 重放四条钉死的列表请求（sort、fields、filter、appends）、带合法 measures/dimensions body 的 `crm_activities:query`、八张主域表的行数下限、以及每域一条 append 代表——未来的 schema 漂移在这里 400，而不是在用户浏览器里。

## 已考虑的替代方案

**公式/虚拟只读别名。** 手工验证已证明普通列充分后否决；公式给 ORDER BY 编译添风险、零收益。

**改 Portal 的默认排序字段。** 否决：上游 fork 扰动、部署脚本耦合，而种子 schema 才是我们拥有的一侧。

**hub 表降级（已知边界声明）。** 否决：schema 证据可从 Portal 的 TypeScript 类型与常量文件完整复原，计划的逃生通道没有必要。

## 后果

CRM 四列表页全部有数据且默认排序生效（contacts 10 行按 name 升序、leads 20 行按 score 降序、quotes 12 行过滤 is_current、activities 10 行按 date 降序）；hub 四域展示真实行（分仓库存 7、发票 5 行按 issue_date 排序、deals/tickets 看板承载种子卡）。403 在重建后无法复现——root token 带合法 body 的 query 返回 200——因此未加授权步骤；改由 verify 探针守住该类别。`crm_quotes` 的 Portal 列是种子侧拥有的展示镜像（`total` 跟随 `total_amount`），后续经 admin UI 的写入应同时设置两者；对话式流程（`nb_*`）已写规范列。网关 inode 漂移（D 类）由重启 `:3080` 清除（entities 1094 == 磁盘）——`:3084` 已自行退出。
