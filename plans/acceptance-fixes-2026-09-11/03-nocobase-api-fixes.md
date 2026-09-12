# 批次 C3：NocoBase 平台接口报错修复（CRM Portal 400 回归 + hub 8 表 + query 授权 + 网关重启）

> 隶属 [PLAN.md](PLAN.md)。前置：建议在 C1/C2 之后（本批含网关重启，会打断进行中的浏览器会话）。改动面 = `examples/kb-agent/scripts/` 种子脚本 + 运维动作，**不改 platform/nocobase 快照源码、不改 vendored portal 源码**。回滚 = revert 脚本提交 + 数据面由 reset→all 链自愈重建。

**目标**：CRM Portal 四页面恢复有数据；Hub Portal 库存/销售/财务/帮助台页面有数据（或降级声明）；`crm_activities:query` 200；双网关与磁盘 sqlite 一致；全部修复幂等接入 `all` 链。

## 根因（诊断实录，2026-09-11 真实起服抓取）

完整证据链见 [PLAN.md §1.3](PLAN.md)。报错接口清单（root token 可复现）：

**A 类（回归主体，400）**：

| 接口 | 缺失列 | 实际列 |
|---|---|---|
| `GET /api/crm_contacts:list?sort=name&appends[]=customer` | `name` | `full_name` |
| `GET /api/crm_activities:list?sort=-date&appends[]=customer,contact` | `date` | `due_at` |
| `GET /api/crm_leads:list?sort=-score&fields[]=score,source` | `score`、`source` | 有 `sort` 列（不同义） |
| `GET /api/crm_quotes:list?sort=-issue_date&fields[]=root_quote_id,version&filter={"is_current":true}` | `issue_date`、`root_quote_id`、`version`、`is_current`、`total` | 均不存在 |

根因：官方 Portal 前端（[platform/nocobase-portals/demo-portal-crm](../../platform/nocobase-portals/demo-portal-crm)，硬编码于 `src/pages/crm/{contacts,leads,quotes,activities}/list.tsx` 的默认 sorters/fields）与自建 schema（[nocobase-crm-modules.mts](../../examples/kb-agent/scripts/nocobase-crm-modules.mts) 播种）字段名错配；NocoBase 将 sort 编译进 `ORDER BY`，列不存在即 400。引入点 = c8eaf64e76（N24 重建部署 Portal，09-10）；server log 时间线：09-09 旧代请求无 sort 参数全 200，09-10 起转 400。

**B 类（长期缺口，404）**：`hub_inv_products / hub_sales_deals / hub_sales_activities / hub_hd_tickets / hub_fin_invoices / hub_fin_expenses / hub_inv_stock_moves / hub_fin_invoice_items` 8 张官方域表从未被种子脚本创建（PG 实际只有 pj/tk/as/hr/kb/md 域 19 张 hub 表）——Hub Portal 对应菜单页无数据，[QUICKSTART.zh.md:139](../../examples/kb-agent/QUICKSTART.zh.md) 已声明为已知边界。

**C 类（权限，403）**：`POST /api/crm_activities:query` 返回 `No permissions`——root 角色对自建 collection 的 `query` action 未授权。

**D 类（环境，非代码）**：:3080 与 :3084 长驻网关持有已删 sqlite 旧 inode（lsof inode 三方不一致），`kg.stats` 三世界互不相通——今晨种子链重放后网关未重启，B6 警告机制（[setup-nocobase.mts:854](../../examples/kb-agent/scripts/setup-nocobase.mts)）针对模式的发生实例。

## 改动面

### 1. CRM Portal 字段适配（主路径：种子侧补列，不动 vendored portal）

在 [`nocobase-crm-modules.mts`](../../examples/kb-agent/scripts/nocobase-crm-modules.mts) 的字段 upsert 段（518 行附近已有 m2o fieldNames 修复先例，同一模式）幂等补齐 Portal 期望的字段：

| collection | 补充字段 | 实现优先级 |
|---|---|---|
| `crm_contacts` | `name`（string） | ① NocoBase 公式/虚拟字段 = `full_name`（只读别名，零数据迁移）；② 普通列 + 种子回填 `full_name` 值 |
| `crm_activities` | `date`（date） | 同上（= `due_at`） |
| `crm_leads` | `score`（integer）、`source`（string） | 普通列 + 种子数据回填（score 给分布值如 40-95，source 给渠道枚举值），排序才有意义 |
| `crm_quotes` | `issue_date`（date）、`root_quote_id`（integer/belongsTo 自引用按 portal 语义裁决）、`version`（integer）、`is_current`（boolean）、`total`（numeric） | 普通列 + 种子回填（is_current 首版 true、version 从 1） |

- `fields:create` 幂等（存在即跳过），重跑 `all` 链安全；
- 种子数据扩展同脚本内完成（现有行数下限断言不破坏，只增不改语义）；
- **实施第一步**：先在真实服上手工 `fields:create` 验证 sort 请求转 200，再固化进脚本（避免 API 能力误判返工）。

Fallback（仅当 NocoBase 字段类型能力不支持且普通列方案违反数据语义）：改 portal 部署侧源码字段名——属上游 fork 改动，须登记且侵入大，非必要不走。

### 2. hub 8 表补建（默认做，允许降级）

在 [`nocobase-hub-modules.mts`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts) COLLECTIONS 段幂等补 8 张官方域表 + 每表 5-20 行种子（对齐 Hub Portal 页面字段清单——从 [platform/nocobase-portals/demo-portal-hub](../../platform/nocobase-portals/demo-portal-hub) 页面源码反查所需字段，同 A 类方法论）。若官方域表结构考证成本超预期（上游 demo 数据集不在快照内），降级：QUICKSTART 已知边界节补「Hub Portal 库存/财务/帮助台菜单页为空属预期」并在收口报告向用户说明取舍。

### 3. query 授权（403）

init 链（或 n13 系列脚本同模式）为 root 角色对自建 collections 授权 `query` action（roles API 幂等 upsert，参照既有授权代码模式）。

### 4. 网关重启（运维步骤，写进批次执行序）

```sh
# 重启前记录：lsof 确认旧 inode；重启后 kg.stats 双网关一致且 == sqlite3 直查 kg_nodes
kill <3080/3084 的 dsh web PID>
DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml --no-open        # 3080
DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml --no-open --port 3084
```

不推翻 B6"不做自动 kill/restart"裁决；QUICKSTART reset 节已写明该义务。

### 5. verify 断言组扩展

[`setup-nocobase.mts`](../../examples/kb-agent/scripts/setup-nocobase.mts) verify（:660 起）新增断言组：
- A 类四接口（带 sort/filter 参数）200；
- hub 8 表 `list` 200 且行数 >0（若降级则断言改为探活）；
- `crm_activities:query` 200；
- （C4 批次会再追加品牌断言，本批预留结构）。

### 6. 文档

[QUICKSTART.zh.md](../../examples/kb-agent/QUICKSTART.zh.md) 已知边界节更新（hub 表状态、Portal 接口语义）；Agent Note 记录"Portal 前端硬编码字段 vs 种子 schema 错配"根因与适配裁决。

## 验收断言

1. 接口面（真实服 + root token）：
   ```sh
   curl 'http://127.0.0.1:13000/api/crm_contacts:list?page=1&pageSize=20&sort=name&appends[]=customer' -H "authorization: Bearer $TOKEN"   # 200
   # 同样断言 crm_activities:list?sort=-date、crm_leads:list?sort=-score、crm_quotes:list?sort=-issue_date&filter={"is_current":true}
   curl -X POST 'http://127.0.0.1:13000/api/crm_activities:query' ...   # 200
   curl 'http://127.0.0.1:13000/api/hub_inv_products:list?...' ...      # 200（或降级声明）
   ```
2. 浏览器实测：CRM Portal 四页面（`/dist/crm/` 联系人/活动/线索/报价单）有数据可排序；Hub Portal 库存/销售/财务/帮助台页有数据（或降级声明）；截图落 `examples/kb-agent/demos/acceptance-c3/`。
3. 一致性：重启后 `POST :3080/api/kg.stats` 与 `:3084/api/kg.stats` 返回一致且等于 `sqlite3 kg-graph.sqlite 'select count(*) from kg_nodes'`。
4. 幂等：`setup-nocobase.mts` 二跑全 kept/skip（新字段/新表/授权二跑零变更）；`verify` 新断言组两轮全绿。
5. `pnpm run test`（examples/kb-agent 分区 + 相关包）与 `doc-sync` EXIT=0。

## 风险与回滚

| 风险 | 预案 |
|---|---|
| 公式/虚拟字段在 sort 下行为不符（NocoBase 对虚拟字段 ORDER BY 编译差异） | 实施第一步真实验证；fallback 普通列+回填（已列） |
| `crm_quotes.root_quote_id` 语义（belongsTo 自引用 vs 裸 integer）考证 | 对照 portal `quotes/list.tsx` 对该字段的用法（append? 显示?）后定 |
| hub 8 表字段清单考证成本 | 降级路径已定义（文档声明 + 收口说明） |
| 种子数据扩展改变行数下限断言语义 | 断言只加下限不设上限；demo 增量语义（orders +1）不破坏 |
| 网关重启后端口语义变化（ws 会话重建） | 与 C1/C2 验收顺序解耦（本批排在后） |

回滚：revert 脚本提交；数据面 reset → `all` 自愈重建（幂等链语义）。
