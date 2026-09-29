# NocoBase plugin-workflow 调研（选型子任务 A）

> 研究日期：2026-09-29 | 来源：GitHub API + raw 源码 + docs.nocobase.com + npm registry + 本地 v2.2.6 快照交叉验证 | 深度：Thorough
> 用途：制造业全链平台「审批流可视化拖拽编排」组件选型，候选之一：NocoBase 官方 @nocobase/plugin-workflow

---

## 1. 画布图形库（Q1）

**结论：不使用任何第三方图形库（既不是 @xyflow/react 也不是 @antv/x6）。画布为自研 React DOM 组件树渲染（Branch/Node 组件 + CSS），形态为纵向节点卡片流（类钉钉审批流），"拖拽"能力仅限节点拖拽重排序（drag-to-reorder），不是自由画布拖放。**

证据链：

1. `package.json` 无图形库依赖：npm 上 `@nocobase/plugin-workflow@2.2.19` 无 `dependencies`，`peerDependencies` 全部为 `@nocobase/*` 系包（registry.npmjs.org/@nocobase/plugin-workflow/latest）
2. 源码文件 `packages/plugins/@nocobase/plugin-workflow/src/client/WorkflowCanvas.tsx` 导入仅为 React/antd/@ant-design/icons/@formily/react/@nocobase/client，无图形库（本地 v2.2.6 快照逐行核对；GitHub main 目录结构与本地一致）
3. `src/client-v2/canvas/` 目录（GitHub API 列表 + 本地快照双向核对）全部为 React 组件：`Branch.tsx`、`Node.tsx`、`CanvasContent.tsx`、`NodeConfigDrawer.tsx` 等，无 ReactFlow/X6 包装层
4. 拖拽语义源码注释（`src/client/NodeDragContext.tsx`）："The node drag-to-reorder provider now lives in client-v2 and is shared by both canvases (ADR-0003)" —— 拖拽=拓扑内重排序
5. `src/client-v2/canvas/dropImpact.ts` 纯函数沿 `node.downstream` 与 `branchChildrenMap: upstreamId → branch-head nodes` 做图遍历，计算拖放影响范围（防止成环等）

对选型的含义：若父任务需要"自由拖拽画布"（任意布局、贝塞尔连线、对齐线），NocoBase workflow 画布不提供；它提供的是结构化纵向流程树 + 分支列。

## 2. 节点类型清单（Q2）

### 开源（主仓库 nocobase/nocobase，社区版可用）

主插件内置 instruction（v2.2.6 源码 `src/server/instructions/` + `src/client/nodes/`）：

| 节点 | 说明 |
|---|---|
| 计算（calculation） | Formula.js 运算 |
| 条件（condition） | 单条件分支 |
| 多条件分支（multi-conditions） | 多条件 |
| 新增数据（create） | 数据表操作 |
| 更新数据（update） | 数据表操作 |
| 查询数据（query） | 数据表操作 |
| 删除数据（destroy） | 数据表操作 |
| 结束（end） | 终止流程 |
| 流程输出（output） | 子流程输出 |

内置触发器（triggers）：数据表事件（collection）、定时任务（schedule）。

独立扩展插件包（同在主仓库 `packages/plugins/@nocobase/`，GitHub API 目录列表证实，共 21 个）：延时（delay）、并行分支（parallel）、循环（loop）、变量（variable）、SQL 操作（sql）、HTTP 请求（request）、请求拦截器（request-interceptor）、JavaScript 脚本（javascript）、日期计算（date-calculation）、动态运算（dynamic-calculation）、聚合（aggregate）、JSON 计算（json-query）、JSON 变量映射（json-variable-mapping）、邮件发送（mailer）、通知（notification）、人工处理（manual）、抄送（cc）、操作事件触发器（action-trigger）、自定义操作事件触发器（custom-action-trigger）、响应消息（response-message）、测试（test）。

文档另有「调用工作流（subflow）」「数据库事务（transaction）」节点专页（docs.nocobase.com/cn/workflow/nodes/subflow、…/transaction），本地 v2.2.6 主仓库插件目录未见对应独立包名——归属包未逐一确认（标注：未确认）。

### 商业（Pro，主仓库中不存在）

- **审批节点 = @nocobase/plugin-workflow-approval，Edition: Professional Edition+，非内置、默认不启用**（docs.nocobase.com/cn/plugins/@nocobase/plugin-workflow-approval/）
- 审批触发器、审批中心（单据管理/追踪）同属该商业插件
- GitHub `nocobase/pro` 仓库 404（私有分发，无法审计源码）
- v2.2.18 release notes 出现 "workflow manual node form layouts"、"approval form sub-tables" 修复项（github.com/nocobase/nocobase/releases），说明审批功能在活跃维护，但代码不在开源仓库

### 开源 vs 商业审批能力边界（关键）

- 开源「人工处理」节点（社区版+，内置）：**负责人仅支持单用户**，文档明示"目前人工节点的负责人选项暂不支持针对多人处理，会在未来的版本中支持"（docs.nocobase.com/cn/workflow/nodes/manual）。提交按钮三态：继续流程/终止流程/暂存。可配待办界面（数据区块+表单区块）。
- 商业「审批」节点（专业版+）：多人会签/或签/投票、顺序/并行、退回/转签/加签（docs.nocobase.com/cn/workflow/nodes/approval）。

## 3. 数据结构（Q3）

**结论：每个节点一行记录（flow_nodes 表），adjacency list 模式——不是整图 JSON。**

`src/common/collections/flow_nodes.ts` 字段定义（本地 v2.2.6 源码 + GitHub main 路径对应）：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | snowflakeId 主键 | 雪花 ID |
| key | uid | 导入导出用 |
| title | string | 节点标题 |
| workflow | belongsTo | 所属工作流（workflows 表） |
| **upstream** | belongsTo flow_nodes | 上游节点 |
| **branches** | hasMany flow_nodes (foreignKey: upstreamId) | 分支子节点集合 |
| **branchIndex** | integer | 分支序号（仅条件/并行等分支型上游有效；源码注释：本可放 flow-links 模型但当前设计不需要） |
| **downstream** | belongsTo flow_nodes | 下游节点（源码注释：1. redirect 类型节点解决循环流；2. 分支汇合后识别真实下一节点） |
| type | string | 节点类型 |
| config | json | 节点配置（默认 {}） |

相关表：workflows（id/key/title/enabled…，repository: WorkflowRepository）、jobs（节点执行结果）、executions（执行计划）、workflowTasks/userWorkflowTasks（人工任务）、workflowStats/workflowVersionStats 等（`src/server/collections/` 目录，共 11 个 collection 文件）。

客户端拓扑重建与拖拽影响计算同样基于 upstream/downstream/branchIndex 邻接表（`dropImpact.ts` 的 `collectDownstreams`、`branchChildrenMap`）。

对选型的含义：与"每 node 一行 + 邻接指针"的自研方案同构；若复用 NocoBase 工作流引擎，数据模型可直接映射，无需整图 JSON 解析。

## 4. 版本 / license / 仓库活跃度（Q4）

| 项 | 值 | 证据 |
|---|---|---|
| 主仓库 | github.com/nocobase/nocobase | api.github.com/repos/nocobase/nocobase |
| Stars | 24,387 | 同上（2026-09-29 读取） |
| Forks | 2,894 | 同上 |
| Open issues | 308 | 同上 |
| pushed_at | 2026-09-29T04:36:15Z（当天仍在推送） | 同上 |
| 创建时间 | 2020-10-24 | 同上 |
| 最近 release | v2.2.19（2026-09-29）、v2.2.18（2026-09-25）、v2.4.0-alpha.8（2026-09-24，预发布） | api.github.com/repos/nocobase/nocobase/releases?per_page=3 |
| 主仓库 license（GitHub API） | NOASSERTION（自定义协议） | 同上 |
| 主仓库根 LICENSE.txt | "NocoBase License Agreement"，Updated 2026-02-24 | 本地快照 LICENSE.txt + www.nocobase.com/en/agreement |
| plugin-workflow license | **Apache-2.0**（package.json license 字段 + 插件目录 LICENSE 文件，npm 同） | github.com/nocobase/nocobase/blob/main/packages/plugins/@nocobase/plugin-workflow/package.json |
| 源文件头声明 | "dual-licensed under AGPL-3.0 and NocoBase Commercial License"（旧双许可头，仍存在于 2.x 源文件） | 本地快照各 .tsx 文件头 |
| plugin-workflow 版本 | 2.2.19（npm latest，与主仓库 release 同步） | registry.npmjs.org/@nocobase/plugin-workflow/latest |

协议要点（www.nocobase.com/en/agreement，2026-02-24）：
- 4.2：协议 = Apache-2.0 全文 + 本协议补充条款（不一致时补充条款优先）
- 1.1："Software"指内核+与内核同仓库的插件（即社区版范围，含全部开源 workflow 插件）
- 1.3：商业版分 Standard / Professional / Enterprise 三档
- 5.1：社区版可商用；5.2/5.3：不得移除品牌与版权声明（左上角主 LOGO 除外）；**5.4：不得用原版或修改版软件向公众提供 no-code/low-code/AI 平台类 SaaS/PaaS 产品**（企业自用不受限，做平台转售受限）
- 6.x：商业版永久许可、可换品牌、Professional/Enterprise 可售卖 Upper Layer Application

License 冲突说明：GitHub API（NOASSERTION/自定义）、根 LICENSE.txt（NocoBase License Agreement）、文件头（AGPL-3.0+商业双许可）、插件 package.json（Apache-2.0）四处并存——以根 LICENSE.txt/官网 agreement 为准（Apache-2.0+附加条款），文件头 AGPL 声明为历史残留表述（未确认官方是否另有解释）。

## 5. 文档质量与中文支持（Q5）

中文手册路径：https://docs.nocobase.com/cn/workflow （原生中文，非机器翻译痕迹）

结构完整度（侧边栏导航实测）：
- 概述 / 快速开始（创建→配置→触发→执行历史全流程教程）
- 触发器：数据表事件、定时任务、操作前/后事件、自定义操作事件、审批（商业）、Webhook、文本对话、多模态对话、结构化输出（AI 触发器）
- 节点：28+ 个节点专页（每个节点独立 URL，含配置项说明+截图）
- 使用变量 / 执行计划 / 版本管理 / 高级配置
- **扩展开发：扩展触发器类型、扩展节点类型、API 参考、v1→v2 迁移指南**（有面向开发者的 API 文档）

覆盖度评估：快速开始为"加号添加节点→点卡片开抽屉配置"教程式说明（无自由拖拽画布操作章节，与自研结构化画布一致）；每个节点有专页含配置截图；有执行历史查看说明。文档质量在同类开源项目中属第一梯队。

## 6. 会签/或签语义（Q6）

商业审批节点（docs.nocobase.com/cn/workflow/nodes/approval，专业版+）：

| 维度 | 支持的模式 |
|---|---|
| 协商模式 | **或签**（一人通过即通过，全员拒绝才拒绝）/ **会签**（全员通过才通过，一人拒绝即拒绝）/ **投票**（超过设定比例通过） |
| 处理顺序 | **并行**（任意顺序）/ **顺序**（按集合顺序依次处理） |
| 审批人来源 | 静态用户列表 / 变量（上下文与节点结果中用户主键/外键，数组自动合并）/ 用户表查询条件动态筛选 |
| 特殊操作 | **退回**（任一人退回→节点直接退出流程，可配置可退回节点）、**转签**（任务转交他人）、**加签**（前加签/后加签，指派范围可配） |
| 通过模式 | 直通（未通过直接结束）/ 分支（结果分支内继续执行其他节点） |
| 节点结果 | 审批状态枚举 + 审批后数据 + 审批记录数组（id/userId/status/comment/updatedAt，v1.8.0+） |
| 其他 | "我的审批"待办卡片自定义（2.0+）；单人时无论何种模式均由该人单独决定 |

「逐级上级」无专门模式——需通过变量（如发起人的部门主管字段）或查询条件间接实现（推断，未确认官方示例）。

开源「人工处理」节点：**无任何多人模式**（仅单负责人），无退回/转签/加签。

## 7. 优缺点清单（Q7）

### 优点

1. 与 NocoBase 深度一体化：变量系统、待办中心、区块体系、权限无缝衔接；触发器含 AI 对话类（docs.nocobase.com/cn/workflow）
2. 引擎+存储+执行记录+版本管理完整：flow_nodes 邻接表存储、executions/jobs 执行留痕、流程版本快照（docs + 源码 collections）
3. 开源部分可商用（Apache-2.0+附加条款，5.1 明示可商用）、插件独立 Apache-2.0，自托管无 License Server（www.nocobase.com/en/agreement）
4. 极高活跃度：24,387 stars、发版节奏数天一次（v2.2.18→v2.2.19 间隔 4 天），bug 修复含 workflow 专项（GitHub API）
5. 中文文档第一梯队：28+ 节点专页、扩展开发 API 参考、v1→v2 迁移指南（docs.nocobase.com/cn/workflow）
6. 扩展性设计：instruction/trigger 注册式扩展点，主仓库 21 个扩展插件全部开源可作参考实现（GitHub 目录列表）

### 缺点

1. **画布非自由拖拽**：自研 React 组件树（无 xyflow/x6），纵向卡片流+分支列，仅支持节点拖拽重排序——若需求是 BPMN 式自由画布则不满足（源码证据见 §1）
2. **多人审批（会签/或签/投票/转签/加签）全部锁定在商业插件 plugin-workflow-approval（Professional Edition+）**，开源人工节点仅单人（docs 证据见 §6）
3. 商业插件闭源分发（nocobase/pro 仓库 404），无法审计审批引擎源码与数据表结构（GitHub API）
4. license 表述混乱：根协议（自定义 NocoBase License Agreement，2026-02-24 更新）与源文件头（AGPL-3.0 双许可）并存，社区版 5.4 条款禁止用修改版做 SaaS/PaaS 平台转售（www.nocobase.com/en/agreement）
5. v1→v2 双画布并存（client 与 client-v2），源码自述"Delete on legacy-canvas retirement"，存在迁移期复杂度（NodeDragContext.tsx 注释）
6. 「调用工作流」「数据库事务」等文档节点在开源主仓库未见独立实现包，归属不透明（未确认）

## 8. 来源列表（访问日期均为 2026-09-29）

| # | 来源 | 类型 | URL |
|---|---|---|---|
| 1 | GitHub API 仓库元数据 | 一手 | https://api.github.com/repos/nocobase/nocobase |
| 2 | GitHub API 最近 releases | 一手 | https://api.github.com/repos/nocobase/nocobase/releases?per_page=3 |
| 3 | GitHub API 插件目录列表（workflow 家族 22 目录） | 一手 | https://api.github.com/repos/nocobase/nocobase/contents/packages/plugins/%40nocobase |
| 4 | plugin-workflow package.json（main 分支，v2.2.19，Apache-2.0） | 一手 | https://github.com/nocobase/nocobase/blob/main/packages/plugins/@nocobase/plugin-workflow/package.json |
| 5 | GitHub API client-v2/canvas 目录（main 分支，与本地 2.2.6 一致） | 一手 | https://api.github.com/repos/nocobase/nocobase/contents/packages/plugins/%40nocobase/plugin-workflow/src/client-v2/canvas |
| 6 | npm registry @nocobase/plugin-workflow/latest | 一手 | https://registry.npmjs.org/@nocobase/plugin-workflow/latest |
| 7 | 审批插件页（Professional Edition+，非内置） | 一手 | https://docs.nocobase.com/cn/plugins/@nocobase/plugin-workflow-approval/ |
| 8 | 审批节点文档（会签/或签/投票/转签/加签） | 一手 | https://docs.nocobase.com/cn/workflow/nodes/approval |
| 9 | 人工处理节点文档（社区版+，仅单负责人） | 一手 | https://docs.nocobase.com/cn/workflow/nodes/manual |
| 10 | 工作流概述（社区版+，内置插件） | 一手 | https://docs.nocobase.com/cn/workflow |
| 11 | 快速开始（画布操作教程） | 一手 | https://docs.nocobase.com/cn/workflow/getting-started |
| 12 | NocoBase License Agreement（2026-02-24） | 一手 | https://www.nocobase.com/en/agreement |
| 13 | nocobase/pro 仓库（404，私有） | 一手 | https://api.github.com/repos/nocobase/pro |
| 14 | 本地 v2.2.6 源码快照（flow_nodes.ts、dropImpact.ts、NodeDragContext.tsx、WorkflowCanvas.tsx、LICENSE 等） | 一手 | platform/nocobase/packages/plugins/@nocobase/plugin-workflow/（本仓库内，快照日期 2026-09-06，上游 v2.2.6） |

## 9. 方法论

- 搜索引擎：DuckDuckGo（chrome-devtools navigate + evaluate_script 提取 organic 结果，过滤广告）用于定位文档 URL；事实核验全部落到一手来源（GitHub API/raw、docs.nocobase.com、npm registry、官网 agreement）
- 交叉验证：GitHub main（v2.2.19）目录结构 × 本地 v2.2.6 源码快照逐文件比对，画布结论双向一致
- 限制：商业插件 plugin-workflow-approval 闭源无法审计；DuckDuckGo 一次超时后重试成功；subflow/transaction 节点归属包未确认（已标注）
