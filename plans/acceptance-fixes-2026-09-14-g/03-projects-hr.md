# 批次 G3：projects + hr 两域整模块移植

> 隶属 [PLAN.md](PLAN.md)。前置：G2（壳层机制 + 域移植模板已固化）。按 G2 模板铺量：整目录拷贝 → routes.tsx 聚合两行 → extensions resourceGroupParent 挂组键 → locale 聚合 → tsc 迭代 → deploy → 浏览器逐域验收。本批含 Hub 的 2 个 AI 表单挂载点（projects/tasks）随域自动激活。

## 移植清单

| 域 | 文件/行数 | collections | 路由 | 菜单挂组 |
|---|---|---|---|---|
| projects | 25 / 9,247 | hub_pj_projects/tasks/milestones/checklist | /projects /tasks /milestones /my-tasks /project-calendar /workload | group_delivery |
| hr | 25 / 8,648 | hub_hr_employees/departments/leave_requests | /employees /departments /leave /org-chart /leave-calendar /joiners-leavers | group_people |

```sh
cp -R platform/nocobase-portals/demo-portal-hub/src/pages/projects platform/nocobase-portals/demo-portal-crm/src/pages/projects
cp -R platform/nocobase-portals/demo-portal-hub/src/pages/hr platform/nocobase-portals/demo-portal-crm/src/pages/hr
```

## 域特定改动点

1. **路由聚合**：CRM [`src/routes.tsx`](../../platform/nocobase-portals/demo-portal-crm/src/routes.tsx) 加 `import { projectsModule } from "@/pages/projects/module"` + `import { hrModule } from "@/pages/hr/module"`，数组追加 `...projectsModule.routes, ...hrModule.routes`；
2. **挂组**：extensions.tsx `resourceGroupParent` 追加（从 Hub [:84-90](../../platform/nocobase-portals/demo-portal-hub/src/app/extensions.tsx:84) 抄）：`hub_pj_projects/hub_pj_tasks/hub_pj_milestones → group_delivery`，`projects-my-tasks`/`projects-calendar` 同组；`hub_hr_employees/hub_hr_departments/hub_hr_leave_requests/hr-org-chart/hr-leave-calendar → group_people`；
3. **locale**：并入两域 locale.ts 的 en-US/zh-CN 对；
4. **AI 挂载点自动激活**：projects 新建表单（[form.tsx:288](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/projects/form.tsx:288) formId `hub-project-create`）与 tasks 新建表单（[:423](../../platform/nocobase-portals/demo-portal-hub/src/pages/projects/tasks/form.tsx:423) `hub-task-create`）的 `useAiEmployeeFill` 随域拷贝生效——验收实测；
5. **users collection 依赖**：helpdesk/projects 的负责人下拉取自 NocoBase 内置 `users` 表（[pickers.tsx](../../platform/nocobase-portals/demo-portal-hub/src/pages/helpdesk/pickers.tsx:21) 同款模式）——表已存在（F 轮含 4 位历史人名 + 9 位 AI 员工演示行），零改动。

## 验收断言（证据落 `examples/kb-agent/demos/acceptance-g3/`）

1. projects 六页浏览器实测：/projects 列表真实数据、/tasks 看板拖拽换 status（拖一张卡到另一列，刷新持久）、/milestones、/my-tasks（按登录者过滤）、/project-calendar、/workload；
2. project 新建表单：dex 头像 AI 按钮出现 + 一次中文描述流式填充实测（如「新建一个调味品旗舰店项目，十月上线」）+ 提交落库；task 新建同款断言（formId 两个都在验收记录里列出）；
3. checklist 子 CRUD：某 task 下增删一条 checklist 项；
4. hr 六页实测：/employees、/departments、/leave（请假审批流转一次）、/org-chart（组织架构图渲染）、/leave-calendar、/joiners-leavers；
5. 悬浮球在新域页面出现；
6. 侧栏分组：Delivery/People 两组出现成员并可折叠；
7. CRM 零回归（三页抽查 + 6 e2e）+ G2 helpdesk 域抽查一页（/tickets 仍正常——前批不回归）；
8. `portal tsc` EXIT=0 + deploy 双跑树哈希一致 + verify 全绿。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| tasks 看板拖拽依赖 Hub 版 data-table/useDnD 行为差异 | 低 | 看板是域内私有组件（board.tsx 545 行随域拷贝），不走共享 data-table；实测拖拽 + 持久化即覆盖 |
| 状态机 transitions.ts 与后端字段枚举不匹配（hub_pj_tasks.status 值域） | 低 | collections 由同一 Hub 种子链建表，值域同源一致；实测拖拽换 status 即验证 |
| AI 挂载点 formFiller 在 CRM 域名下的 CORS/端点差异 | 低 | ai-employee-fill 走 NocoBase plugin-ai 同源端点（两侧相同 dataProvider），无 CORS 面；实测兜底 |

回滚：两域各自独立提交（projects 一提交、hr 一提交），revert + redeploy 即回。
