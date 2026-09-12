# Agent Note：hub schema 对齐——文本转关联迁移与 Portal 派生外键合同

Status: implemented

[English](2026-09-12-hub-schema-portal-contract.md) | 中文

## 问题

重建后的 demo-portal-hub 页面在 17 张集合上以 PostgreSQL `column ... does not exist` 失败。根因：Portal 把 NocoBase **默认派生的 belongsTo 外键名**当硬合同使用——`singular(collectionName) + '_' + associationName + '_id'`（如 `hub_pj_tasks`→`hub_pj_task_assignee_id`，里程碑的历史缩写 `hub_pj_ms_project_id`）——而种子侧每个 belongsTo 都用了显式短 FK（`project_id`），且 `assignee`/`owner`/`category` 建成了纯文本 input 字段。Portal 读取的六张整表（`hub_pj_checklist`、`hub_kb_categories`、`hub_kb_article_feedback`、`hub_po_purchase_orders`、`hub_po_items`、`hub_po_suppliers`）从未建过。CRM Portal 有三个同源残留：deals 抽屉两处 `dealId` filter 与缺失的 `crm_targets` 表。

## 决策

### 三态字段迁移，绝不破坏数据

`examples/kb-agent/scripts/nocobase-hub-modules.mts` 的 `migrateTextFieldToAssociation` 把旧的同名文本字段转换为 Portal FK 合同下的 belongsTo。同名字段在 NocoBase 中不能并存，文本列必须先 destroy 再 create 关联；`*_text` 备份列（`assignee_text`/`owner_text`/`category_text`）先行保留原值，并作为回滚通道长期保留。三个可观测状态使任意中断点都能安全重跑：`string` → 备份 + 拷贝 + destroy + create（拷贝无条件重放——重入重拷全部行、幂等覆盖，死在备份列落地与拷贝完成之间的运行不丢未拷到的行）；字段缺失（上次运行死在 destroy 与 create 之间）→ 只 create；`belongsTo` → kept。外键一律取 Portal 的派生合同名，任何安装都不会再派生出第二个名字。

### 一个种子，两条路径到同一终态

全新安装直接声明关联（`HUB_CORE_COLLECTIONS`/`D1_PORTAL_COLLECTIONS` 携带 `belongsToUser('assignee', …, 'hub_pj_task_assignee_id')` 与六张新表），`collections:create` 一次建成终态。存量安装跳过建表，经迁移段加 `ensurePortalFields`（纯 `fields:create` = ALTER ADD COLUMN，回填读 `*_text` 列）到达同一形态。两条路径共用终态断言：字段 type 为 `belongsTo` 且 FK 名匹配 Portal 合同（由 `setup-nocobase.mts` 的 `portalListProbe` wire 重放探测，缺列在那里就 400）。

### 四个旧人名成为无密码 users 行

迁移后的 FK 需要指向。`ensureLegacyUsers` 幂等 upsert 文本列出现过的四个名字（陈立群/王一帆/林静怡/赵晓芳，username 为 `chenliqun` 等），无密码——Portal 各处 append 关联时经 `nickname` fieldNames 渲染，且无法登录。

### 不能成为关联的 camelCase filter 列

CRM deals 抽屉按 camelCase `dealId` 过滤 `crm_follow_ups`/`crm_activities`。同名 belongsTo（`as === foreignKey === 'dealId'`）触发 Sequelize 命名冲突（`Naming collision between attribute 'dealId' and association 'dealId'`），而 `deal` 关联名在 activities 上已被种子的 `deal_id` FK 占用。裸 integer 列即可满足 filter——抽屉从不 append 该关联——并从 `deal_id`（activities）或客户的第一个 deal（follow-ups）回填。

### 枚举对齐只追加，绝不重写

六个 select 字段的词表与 Portal 筛选下拉不同（maintenance 的 `Preventive/Corrective/Inspection` 对 `repair/inspection/calibration`，另五组）。`alignPortalEnums` 向每个 `uiSchema.enum` 追加 Portal 的值，不改已有选项、不改种子行值；种子行保留原词表，筛选至少能列出 Portal 提供的每个值。

## 已考虑的替代方案

**重种修正值替代迁移。** 否决：用户在用库中有演示期数据，验收承诺无损；`fields:create` + 行回填按构造无损，`*_text` 列保留手工回滚通道。

**用 `fields:update` 把既有 `deal` 关联的 foreignKey 改名为 `dealId`。** 否决：NocoBase 不会重命名 PostgreSQL 列，字段元数据与存储会分叉；新建裸列加回填更显式且可逆。

**全量重写为 Portal 词表。** 否决：会让每个种子行的现值掉出自己的选项列表（标签消失）；追加让两套词表都可读。

## 后果

- 17 张错配 hub 集合与 3 处 CRM 残留在现库上不 reset 完成对齐：PG 断言 `hub_pj_task_assignee_id`/`hub_pj_task_project_id`/`assignee_text` 并存，行数不变（19 任务），`assignee_text` 保留全部 48 处原值，迁移 FK 全部回填。
- `setup-nocobase.mts` verify 新增 D1 探针组，重放 Portal 精确 wire 请求（`?sort=-updatedAt`、`?sort=-views`、`?sort=-assigned_date`、`?filter={"hub_pj_task_assignee_id":1}`、`dealId` filters、`crm_targets` period 排序）加七张新表的 rowFloor——缺列在那里失败，不在用户浏览器里。
- Portal 截图（`examples/kb-agent/demos/acceptance-d1/`）：my-tasks 为 Super Admin 渲染空态（此前 500）、采购仪表盘聚合新 `hub_po_*` 表、知识/领用页可排序。
- 四个人名行与（D2 的）九位 AI 员工无密码出现在 users 表——演示语义，QUICKSTART 已注明。
- 全新库安装（D6 reset）完全跳过迁移段转换（字段声明即 `belongsTo`）；两条路径上该步骤都记 `kept`。
