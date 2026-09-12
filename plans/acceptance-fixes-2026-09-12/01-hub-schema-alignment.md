# 批次 D1：hub 表 schema 与 Portal 前端合同全量对齐（含 PG 实锤四列 + 全量扫描清单）

> 隶属 [PLAN.md](PLAN.md)。前置：无。本批只动种子脚本与种子数据（零产品代码、零 portal 源码改动），**在用户现有库上无损增量**（本批验收不 reset）；收口批 D6 再做 reset 全链两轮幂等。

**根因一句话**：hub 32 表 schema 从 Portal TypeScript 类型反推建表时，漏/错了一批前端实际引用的列与关联——前端把 NocoBase belongsTo 的**默认派生 FK 名当作硬合同**使用（规则 `singular(collectionName) + '_' + associationName + '_id'`，如 `hub_pj_tasks`→`hub_pj_task_assignee_id`；里程碑历史缩写 `hub_pj_ms_project_id`），而种子侧 belongsTo 全部显式短 FK（`project_id`），且 6 张表从未建过。

**前端 schema 合同文档**（实施时对照）：[replicate-prompt.ts:62-68](../../platform/nocobase-portals/demo-portal-hub/src/components/build-story/replicate-prompt.ts:62)。

## 规模统计（全量扫描结论）

| 维度 | 数量 |
|---|---|
| 错配表 | 17（11 张已建表错配 + 6 张整表缺失） |
| 已建表列级错配 | 20 项（含 PG 实锤 4 条） |
| 已建表关联错配 | 17 项 |
| 缺表内待建关联 | 8 项 |
| 枚举值差异（不报错，仅过滤空结果/标签缺失） | 6 组（可选对齐） |
| CRM Portal 残留（顺带修） | 3 处 |

## A. 字段迁移：文本列 → belongsTo(users)（3 处，同名字段冲突必须走迁移）

旧文本列数据**不丢**：三步迁移 + 备份列续命。适用于前端以关联语义读写（appends/filter/表单提交 `<关联名>: <id>`）的同名字段：

| 表.字段 | 前端合同 FK（显式指定） | 前端证据 | 存量数据 |
|---|---|---|---|
| `hub_pj_tasks.assignee` | `hub_pj_task_assignee_id` | [my-tasks/index.tsx:85](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/my-tasks/index.tsx:85) filter、[home/data.ts:226](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/data.ts:226)、appends 9 处 | 48 处中文名（4 个不同人名） |
| `hub_pj_projects.owner` | `hub_pj_project_owner_id` | [list.tsx:241](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/projects/list.tsx:241) filter、[form.tsx:338](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/projects/form.tsx:338) 提交 `owner: owner_id` | 中文名 |
| `hub_as_assignments.assignee` | `assignee_id` | [assignments/list.tsx:289](../../platform/nocobase-portals/demo-portal-hub/src/pages/assets/assignments/list.tsx:289) appends、[replicate-prompt.ts:16](../../platform/nocobase-portals/demo-portal-hub/src/components/build-story/replicate-prompt.ts:16) | 中文名 |

**迁移幂等算法**（写进 [nocobase-hub-modules.mts](../../examples/kb-agent/scripts/nocobase-hub-modules.mts) 的 `ensurePortalFields` 前段，对每处独立执行）：

1. `fields:list?filter={collectionName,name}` 读当前 `assignee` 字段类型：
   - `type === 'string'`（旧状态）：`fields:create` 备份列 `assignee_text`（input，可空）→ `update` 全行 `assignee_text = assignee` → `fields:destroy assignee` → `fields:create` belongsTo `assignee`（target `users`，**foreignKey 显式取前端合同名**，uiSchema 用既有 `belongsToUser` helper 的 fieldNames nickname 形态，[nocobase-hub-modules.mts:43-46](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:43)）；
   - 字段不存在（上次中断在 destroy 后）：直接 `fields:create` belongsTo；
   - `type === 'belongsTo'`（已完成）：跳过（kept）。
2. 存量人名回填：为出现过的 4 个人名（陈立群/王一帆/林静怡/赵晓芳）按 `nickname` ensure users 行（幂等：`users:list?filter={nickname}` 缺则 create，无密码）→ `update` 全行 FK 指向对应 users.id（`row[foreignKey] !== value` 才写，幂等）。`assignee_text` 备份列**保留不删**（回滚通道）。
3. admin v1 侧同步：[nocobase-hub-modules.mts:624,629,630](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:624) 的任务/项目 blocks 里 assignee/owner 列的 uiSchema 换 AssociationField + fieldNames nickname（N16 教训：不做则 admin 表格全 N/A）。

## B. 已建表纯加列（`fields:create` 即 ALTER ADD COLUMN，无损）

沿用 C3 模板（[nocobase-crm-modules.mts:533-645](../../examples/kb-agent/scripts/nocobase-crm-modules.mts:533) `ensurePortalFields`；hub 侧同构函数在 [nocobase-hub-modules.mts:736-773](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:736)，直接扩展）。注：本表与下节按**实施动作**分组，与上方按「列级/关联级」的调研统计口径分组不同，逐项以本清单为准：

| 表 | 加列（类型） | 回填 | 前端证据（主引用点） |
|---|---|---|---|
| `hub_kb_articles` | `updatedAt`（dateOnly）、`views`（integer） | updatedAt←createdAt；views 确定性分布 10-200 | [search.tsx:93](../../platform/nocobase-portals/demo-portal-hub/src/pages/knowledge/search.tsx:93)、[dashboard.tsx:85,94](../../platform/nocobase-portals/demo-portal-hub/src/pages/knowledge/dashboard.tsx:85)（PG 实锤②） |
| `hub_as_assignments` | `assigned_date`、`returned_date`（dateOnly） | ←assigned_at / returned_at | [assignments/list.tsx:176,291](../../platform/nocobase-portals/demo-portal-hub/src/pages/assets/assignments/list.tsx:176)（PG 实锤③） |
| `hub_as_maintenance` | `scheduled_date`、`completed_date`（dateOnly）、`title`（input 可空）、`notes`（textarea 可空）、`assetId`（integer，camelCase 合同） | scheduled_date←scheduled_at；completed_date←status=done 行的 scheduled_at；assetId←asset_id | [assets/show.tsx:89,90](../../platform/nocobase-portals/demo-portal-hub/src/pages/assets/assets/show.tsx:89)、[maintenance/fields.tsx:85](../../platform/nocobase-portals/demo-portal-hub/src/pages/assets/maintenance/fields.tsx:85)（camelCase 先例：hd_tickets 的 `assigneeId`） |
| `hub_hr_employees` | `hire_date`（dateOnly）、`email`（input 可空）、`job_title`（input）、`updatedAt`（dateOnly） | hire_date 确定性分布；job_title←现有 title 值 | [employees/list.tsx:122,268](../../platform/nocobase-portals/demo-portal-hub/src/pages/hr/employees/list.tsx:122)、[employees/fields.tsx:64-73](../../platform/nocobase-portals/demo-portal-hub/src/pages/hr/employees/fields.tsx:64) |
| `hub_hr_departments` | `updatedAt`（dateOnly） | ←createdAt | [departments/show.tsx:382](../../platform/nocobase-portals/demo-portal-hub/src/pages/hr/departments/show.tsx:382) |
| `hub_hr_leave_requests` | `approved_at`（dateOnly 可空） | 已批行←createdAt | [leave/show.tsx:317-320](../../platform/nocobase-portals/demo-portal-hub/src/pages/hr/leave/show.tsx:317) |
| `hub_sales_leads` | `converted_at`（dateOnly）、`conversion_key`（input） | converted_at←status=converted 行的 createdAt | [leads/list.tsx:102](../../platform/nocobase-portals/demo-portal-hub/src/pages/sales/leads/list.tsx:102)（PG 实锤④）、[leads/show.tsx:393](../../platform/nocobase-portals/demo-portal-hub/src/pages/sales/leads/show.tsx:393) |
| `hub_hd_tickets` | `updatedAt`（dateOnly） | ←createdAt（SLA 停表依赖，[sla.ts:55-57](../../platform/nocobase-portals/demo-portal-hub/src/pages/helpdesk/sla.ts:55)） | [tickets/list.tsx:836-846](../../platform/nocobase-portals/demo-portal-hub/src/pages/helpdesk/tickets/list.tsx:836) |
| `hub_pj_projects` | `start_date`、`due_date`（dateOnly） | due_date←planned_end_date；start_date 无源置 null | [form.tsx:204,270](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/projects/form.tsx:204)、[list.tsx:446](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/projects/list.tsx:446) |
| `hub_pj_milestones` | `done`（checkbox）、`due_date`（dateOnly） | done←status=='reached'；due_date←due_at | [milestones/list.tsx:107-114](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/milestones/list.tsx:107) |
| `hub_pj_tasks` | `hub_pj_task_project_id`（integer，filter 合同列） | ←project_id | [projects/show.tsx:356](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/projects/show.tsx:356) filter、[my-tasks:112](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/my-tasks/index.tsx:112) 响应字段回退读取 |
| `hub_pj_milestones` | `hub_pj_ms_project_id`（integer，历史缩写合同列） | ←project_id | [milestones/list.tsx:101](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/milestones/list.tsx:101) |

## C. 已建表纯加关联（`fields:create` belongsTo/hasMany，显式 FK）

| 表.关联 | target | foreignKey | 前端证据 |
|---|---|---|---|
| `hub_kb_articles.author` | users | `author_id` | [articles/show.tsx:87](../../platform/nocobase-portals/demo-portal-hub/src/pages/knowledge/articles/show.tsx:87) 等 appends 6 处 |
| `hub_kb_articles.category` | `hub_kb_categories`（新表） | `category_id` | [articles/list.tsx:106,131](../../platform/nocobase-portals/demo-portal-hub/src/pages/knowledge/articles/list.tsx:106)、[form.tsx:44](../../platform/nocobase-portals/demo-portal-hub/src/pages/knowledge/articles/form.tsx:44) |
| `hub_hr_leave_requests.approver` | users | `approver_id` | [leave/show.tsx:54](../../platform/nocobase-portals/demo-portal-hub/src/pages/hr/leave/show.tsx:54) |
| `hub_hr_employees.manager` | `hub_hr_employees`（自关联） | `manager_id` | [lifecycle.tsx:72](../../platform/nocobase-portals/demo-portal-hub/src/pages/hr/lifecycle.tsx:72) 含嵌套 appends `employee.manager` |
| `hub_hr_departments.parent` / `children` | 自关联 belongsTo + hasMany | `parentId`（camelCase 合同） | [tree.tsx:62](../../platform/nocobase-portals/demo-portal-hub/src/pages/hr/departments/tree.tsx:62)、[org-chart.tsx:97](../../platform/nocobase-portals/demo-portal-hub/src/pages/hr/org-chart.tsx:97)；种子全顶级，回填 null |
| `hub_sales_leads.converted_account` / `converted_contact` / `converted_deal` | `hub_sales_accounts` / `hub_sales_contacts` / `hub_sales_deals` | `converted_account_id` / `converted_contact_id` / `converted_deal_id` | [leads/show.tsx:389-391](../../platform/nocobase-portals/demo-portal-hub/src/pages/sales/leads/show.tsx:389)（转化流程关联写入） |

## D. 补建 6 张缺表（幂等 create + 种子 fixture，`ensureCollections` 存在即跳过）

前端 schema 合同：[replicate-prompt.ts](../../platform/nocobase-portals/demo-portal-hub/src/components/build-story/replicate-prompt.ts)；页面引用如下。种子数据追加进 [dataset.json](../../examples/kb-agent/workspace/data/hub/dataset.json)（procurement 域当前 32 个 fixture key 全无 po_*，需新造；量级按 replicate-prompt 合同：po_items ~41 行、checklist 合计 ~484 项分布于小表）：

| 新表 | 字段要点 | 页面证据 |
|---|---|---|
| `hub_pj_checklist` | title(input)、done(checkbox)、task belongsTo→`hub_pj_tasks` **FK `hub_pj_checklist_task_id`**（合同列） | [tasks/checklist.tsx:133,209](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/tasks/checklist.tsx:133)、[tasks/show.tsx:203](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/tasks/show.tsx:203) |
| `hub_kb_categories` | name、description、parent_id 自关联；种子从 articles.category 四值派生 4 行 | [categories/list.tsx:113](../../platform/nocobase-portals/demo-portal-hub/src/pages/knowledge/categories/list.tsx:113)、[category-tree.tsx:15](../../platform/nocobase-portals/demo-portal-hub/src/pages/knowledge/category-tree.tsx:15) |
| `hub_kb_article_feedback` | rating(helpful/not_helpful)、comment、author belongsTo FK `author_id`、article belongsTo FK `article_id`、createdAt | [articles/feedback.tsx:63,75,79](../../platform/nocobase-portals/demo-portal-hub/src/pages/knowledge/articles/feedback.tsx:63) |
| `hub_po_purchase_orders` | po_number、status(draft/sent/received/cancelled)、total、order_date、supplier belongsTo FK `supplier_id`、owner belongsToUser、items hasMany→`hub_po_items` | [purchase-orders/list.tsx:309](../../platform/nocobase-portals/demo-portal-hub/src/pages/procurement/purchase-orders/list.tsx:309) 等 12 处 |
| `hub_po_items` | product_name、qty、unit_price、`purchase_order_id` | [purchase-orders/show.tsx:61,64,441](../../platform/nocobase-portals/demo-portal-hub/src/pages/procurement/purchase-orders/show.tsx:61) |
| `hub_po_suppliers` | name、email、contact_name、rating、status(active/inactive) | [suppliers/list.tsx:85](../../platform/nocobase-portals/demo-portal-hub/src/pages/procurement/suppliers/list.tsx:85) |

## E. CRM Portal 残留（顺带，同模板）

1. `crm_follow_ups` 补 `deal` belongsTo FK `dealId`（camelCase，同 hd_tickets 先例）——[crm/deals/show.tsx:427](../../platform/nocobase-portals/demo-portal-crm/src/pages/crm/deals/show.tsx:427) filter；
2. `crm_activities` 补 `deal` belongsTo FK `dealId`——[crm/deals/show.tsx:523](../../platform/nocobase-portals/demo-portal-crm/src/pages/crm/deals/show.tsx:523)；
3. `crm_targets` 整表缺失——[crm/targets/page.tsx:94-97](../../platform/nocobase-portals/demo-portal-crm/src/pages/crm/targets/page.tsx:94)（period sort + owner appends），建表 + fixture。

## F. 枚举可选对齐（不阻塞，可选降级）

6 组差异只造成筛选项空结果/标签缺失（hd maintenance type/status、pj status/priority 用词、hr status、leads status/source、projects status）。动作：`fields:update` 在对应 select 字段 uiSchema.enum **追加**前端使用的值（不改已有值、不改种子行）。时间不够可整体降级为 QUICKSTART 已知边界声明。

## 实施步骤

1. 扩展 [nocobase-hub-modules.mts](../../examples/kb-agent/scripts/nocobase-hub-modules.mts)：A 迁移算法 + `ensurePortalFields` 增量条目（B/C）+ 6 新表进 `HUB_*_COLLECTIONS` + `SEEDS` 追加；CRM 三处在 [nocobase-crm-modules.mts](../../examples/kb-agent/scripts/nocobase-crm-modules.mts) 同构扩展；
2. 扩展 [dataset.json](../../examples/kb-agent/workspace/data/hub/dataset.json)：6 新表 fixture（字段名用种子侧命名，`SEEDS.refs` 解析关联）；
3. verify 扩展（[setup-nocobase.mts](../../examples/kb-agent/scripts/setup-nocobase.mts)）：`portalListProbe` 新增精确 wire 重放——至少覆盖：`hub_kb_articles?sort=-updatedAt`、`hub_kb_articles?sort=-views`、`hub_as_assignments?sort=-assigned_date`、`hub_sales_leads?sort=-converted_at`、`hub_pj_tasks?filter=hub_pj_task_assignee_id eq 1`、`hub_pj_checklist?filter=hub_pj_checklist_task_id`、`hub_pj_projects?filter=hub_pj_project_owner_id`、6 新表 `list` 行数下限（`rowFloor` 模式）；
4. 在用户现有库跑（**不 reset**）：`node --import tsx/esm examples/kb-agent/scripts/nocobase-hub-modules.mts`（迁移+增量），随后 `setup-nocobase.mts` verify；
5. 再跑一遍断言全 kept（增量幂等）。

## 验收断言

1. **PG 层列存在**（用户点名）——psql 直查并落盘输出：
   ```sh
   psql -h localhost -p 5432 -U nocobase -d nocobase -c "SELECT table_name,column_name FROM information_schema.columns WHERE table_name='hub_pj_tasks' AND column_name IN ('hub_pj_task_assignee_id','hub_pj_task_project_id','assignee_text');"
   ```
   断言三条全返回；同型抽查 kb_articles(updatedAt,views)、assignments(assigned_date)、sales_leads(converted_at)；
2. **前端请求 200**：verify `portalListProbe` 新断言组全绿（缺列在此必 400，[setup-nocobase.mts:860-866](../../examples/kb-agent/scripts/setup-nocobase.mts:860) 注释语义）；
3. **数据无损**：迁移后 `hub_pj_tasks` 行数不变；`assignee_text` 列保留了原 48 处人名值（抽查 3 行）；assignee 关联 FK 已回填非空；
4. **浏览器实测**（真实 :13000 或 :3080）：Hub Portal 我的任务页有数据（不再 500/空）、知识库四页可按 updatedAt/views 排序、资产领用/维保/人事/销售线索页可排序过滤、procurement 采购单三页有数据、checklist 在任务详情可渲染；截图落 `examples/kb-agent/demos/acceptance-d1/`；
5. **增量幂等**：第 5 步二跑全 kept/skip；
6. `pnpm run typecheck && pnpm run lint` EXIT=0（脚本面）；受影响单测/golden 同步（种子脚本无单测依赖则记录说明）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| 迁移中途失败（destroy 后 create 前） | 中 | 幂等分支覆盖三种状态（string/缺失/belongsTo）可安全重入；assignee_text 备份列保证文本数据不丢 |
| 同名字段冲突（string assignee 与 belongsTo assignee） | 中 | 迁移算法严格先 destroy 后 create，不并存 |
| users 混入 4 个人名行的副作用 | 低 | 无密码不可登录；QUICKSTART 注明 demo 语义 |
| 新表 fixture 数据质量 | 低 | 按 replicate-prompt 合同字段构造，量小 |
| NocoBase fields:create 对已存在 collection 的行为差异 | 低 | C3 同通道已验证（CRM 10 列先例） |

回滚：脚本/fixture 改动 git revert 对应提交；数据面若需回到迁移前，`assignee_text` 列可手工恢复文本值（PG UPDATE）；最终兜底 reset→`all` 幂等链重建（D6 才做，会清用户演示数据——见 D6 说明）。
