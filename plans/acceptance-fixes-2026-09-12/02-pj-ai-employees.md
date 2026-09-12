# 批次 D2：项目管理「添加 AI 员工」——AI 员工进负责人选项 + 表单 AI 代填挂载

> 隶属 [PLAN.md](PLAN.md)。前置：D1（assignee/owner belongsTo 迁移是本批的地基）。本批改种子脚本 + portal fork 源码（挂 ai-employee-fill），portal 侧改动后需重建部署（[nocobase-portal-deploy.mts](../../examples/kb-agent/scripts/nocobase-portal-deploy.mts)）。

## 根因（双重）

用户原话「项目管理的区块怎么不能添加ai员工」，两个独立缺陷叠加：

1. **PG 报错层**（D1 已修）：我的任务页/首页行动中心以 `hub_pj_task_assignee_id = currentUserId` 过滤（[my-tasks/index.tsx:85](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/my-tasks/index.tsx:85)、[home/data.ts:226](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/data.ts:226)），列不存在导致整页报错——用户感知为"项目区块坏了"。
2. **选项层（本批主修）**：任务/项目表单的负责人选择器 [UserPicker](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/pickers.tsx:195) 数据源是 `users` 全量无 filter（[:207-213](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/pickers.tsx:207)），而 **AI 员工只存在于 plugin-ai 的 `aiEmployees` 表**（[ai-employees.ts:10-80](../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/collections/ai-employees.ts:10)，username 主键 + nickname/position），**users 表只有 Super Admin**——下拉里根本没有任何 AI 员工可选。
3. **入口层（顺带补）**：表单 AI 代填组件 [ai-employee-fill](../../platform/nocobase-portals/demo-portal-hub/src/components/ai-employee-fill/ai-employee-fill.tsx:133) 只挂在 finance/expenses 与 sales/leads 两个表单，tasks/projects 表单没挂——用户在别的页面见过「AI 员工」按钮、项目管理里没有。

**范围界定**：AI 员工 = aiEmployees 的 9 位（Atlas/Dara/Dex 等，中文文案 [n17-alignment.mts:111-166](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:111)）。32 位领域专家在独立 `experts` 表（[seed-experts-roster.mts:94](../../examples/kb-agent/scripts/seed-experts-roster.mts:94)，服务市场模块），**不进 users**（范围控制，用户原话是"ai员工"）。ACL 不是当前失败原因（demo 登录者=admin=root，零角色定制），本批不动权限。

## 改动面

### 1. AI 员工幂等种进 users 表

落点：[nocobase-n17-alignment.mts](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts) 的 `CHINESE_EMPLOYEES` 段后追加一步（与 aiEmployees 同源数据，内聚）：

- 对 9 位员工各 ensure 一行 `users`：`username` = aiEmployees.username、`nickname` = 中文名、不发密码（本地 auth 无法登录）；幂等：`users:list?filter={username}` 存在即跳过（kept）；
- 断言 users 行数 ≥ 10（Super Admin + 9）；
- 二轮幂等：重跑全 skip。

### 2. tasks / projects 表单挂 ai-employee-fill（portal fork 源码）

复制 [finance/expenses/form.tsx:159-160](../../platform/nocobase-portals/demo-portal-hub/src/pages/finance/expenses/form.tsx:159) 挂载模式到：

- [tasks/form.tsx](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/tasks/form.tsx)
- [projects/form.tsx](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/projects/form.tsx)

复用默认 `FORM_FILL_EMPLOYEE = "dex"`（[ai-employee-fill.tsx:35](../../platform/nocobase-portals/demo-portal-hub/src/components/ai-employee-fill/ai-employee-fill.tsx:35)），不做参数化（YAGNI）。数据流已验证可用（依赖 N22 LLM 服务 ready；`configurationStatus !== "ready"` 时按钮静默隐藏——验收时确认 N22 状态）。

### 3. 语义确认项（不做改动，写入验收说明）

- AI 员工被指派任务后不登录 Portal，「我的任务」只对人类有意义（filter 按 identity.id）；
- workload 页按 `task.assignee?.id` 分桶（[workload/index.tsx:102-103](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/workload/index.tsx:102)）会把 AI 员工算作"人力"——符合"把任务分配给 AI 员工"的演示语义；
- users 用户管理列表会出现 AI 员工行（无密码）——demo 语义可接受，QUICKSTART 注明。

## 实施步骤

1. 种子段写入 n17 脚本并在现有库跑一遍（不 reset，D1 之后继续增量）；
2. portal fork 两处表单挂载 → `node --import tsx/esm examples/kb-agent/scripts/nocobase-portal-deploy.mts` 重建部署（双跑树哈希一致惯例）；
3. verify 追加断言：`users:list?filter={username.in [atlas,dara,dex…]}` 行数 = 9。

## 验收断言（真实浏览器，证据落 `examples/kb-agent/demos/acceptance-d2/`）

1. 任务表单（新建/编辑）负责人下拉出现 9 位 AI 员工（含中文名），选择「如 Dex（得克斯）」提交 200；
2. 提交后任务详情/看板卡片 assignee 渲染为该 AI 员工 nickname（不 N/A——fieldNames nickname 已由 D1 belongsToUser helper 保证）；
3. workload 页出现该 AI 员工分桶（至少 1 任务）；
4. tasks 与 projects 表单出现 AI 员工代填按钮（N22 ready 时）且点击可生成草稿值（expenses 页同款行为）；
5. PG 无新 `column ... does not exist`（tail PG 日志复核 my-tasks 动线）；
6. 截图：任务表单下拉展开（AI 员工可见）、任务详情 assignee、workload 分桶、表单 AI 按钮，共 ≥4 张；
7. 增量幂等：种子段二跑全 kept。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| users 混入 AI 员工的登录页/用户管理可见性 | 低 | 无密码不可登录；QUICKSTART 声明；如需隔离后续可建专用角色（超出本轮） |
| portal 重建后悬浮球/品牌面回归（C4/C6 修过的 PORTAL_BASE） | 低 | deploy 双跑树哈希一致 + verify 既有 Portal 断言组全绿兜底 |
| ai-employee-fill 在 tasks 表单的表单字段映射不适配 | 中 | 组件按 schema 驱动（expenses 先例）；验收第 4 条不通过则该子项降级为已知边界（主修复=选项层，不受影响） |
| UserPicker pageSize 200 溢出 | 低 | 现有 10 行远未达限；超限再做服务端搜索（登记不做） |

回滚：种子段与两处表单挂载各为独立小提交，git revert 即可；users 的 AI 员工行可按 username 过滤删除（幂等段提供删除分支或手工 psql）。
