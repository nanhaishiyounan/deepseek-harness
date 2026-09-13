# 批次 E1：admin「项目管理」AI 关联——3 表格页 v2 flowPage 升级 + 工厂 m2o/date 扩展 + n18 自动挂 AI 按钮

> 隶属 [PLAN.md](PLAN.md)。前置：无（D 轮成果已入库存量：users 表 9 位 AI 员工、owner/assignee 已是 belongsTo）。改动面：新增种子脚本 1 个 + all 链挂载；**不改任何 vendored 源码、不改 n17/n18 既有脚本**。本批是用户同一诉求的第二次反馈修复，两个面证据链见 PLAN.md §1.1，此处不重复。

## 根因回顾（一段话版）

用户 popup（`dspbkroytnp`/`yotj60pajt7`，原文存档 [`research/e1-popup-full-api.json`](../../research/e1-popup-full-api.json)）=「项目管理 > 项目」v1 页上用户手配的 Add new 弹窗：**数据层无缺陷**（owner m2o→users 无 filter，`users:list` 实测返回 9 位 AI 员工），缺的是 **admin 面的 AI 体验组件层**——plugin-ai 的悬浮球与表单 AI 填充只存在于 v2 flowPage（悬浮球 [ChatButton.tsx:29](../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/ai-employees/chatbox/components/ChatButton.tsx:29) 对 v1 页 return null；表单填充 = `AIEmployeeButtonModel` 只挂 v2 弹窗），而项目管理组 6 页从未升级 v2。库内已有 8 页 v2 先例（N17d 工厂 + N18 按钮，CRM admin 域实测完整可用）——修复 = 把同一条链铺到项目管理组。

## 范围裁决（已定）

升级「项目管理」组 **3 个表格页**：

| 页面（desktopRoutes title） | collection | 关键关联字段 | 依据 |
|---|---|---|---|
| 项目 | hub_pj_projects | owner（m2o→users） | 用户证据链直指此页（dspbkroytnp） |
| 任务列表 | hub_pj_tasks | assignee（m2o→users，D1 迁移） | 任务四视图的表格版，与 D2 Portal 面修复对称 |
| 里程碑 | hub_pj_milestones | （实施时按字段清单） | 同工厂低成本顺带 |

**看板/日历/甘特 3 页保留 v1**：2.2.6 flowModel 体系只有 TableBlock 工厂先例，无看板/日历/甘特区块模型；强翻会丢视图能力。v1 页无悬浮球是 plugin-ai 客户端硬编码（不可配置），作为已知边界写入 QUICKSTART（E3 同步）。AI 能力入口收敛为：3 个表格页（弹窗 AI 按钮 + 悬浮球）。

## 改动面

### 0. 第 0 步探查（写 spec 前必须完成，结论决定 m2o/date 落地形态）

| # | 探查项 | 方法 | 产出 |
|---|---|---|---|
| 0-1 | flowModel 体系的 m2o 关联字段模型（表格列 display 侧 + 表单项 edit 侧的 model 名，如 `AssociationFieldModel` 类）与 date 字段模型名 | 两源交叉：① 快照源码 `platform/nocobase/packages/plugins/@nocobase/plugin-flow-model`（或 client-v2 对应目录）grep `FieldModel` 注册面/`fieldSettings` 分支；② 官方 v12 demo（N17/N18 当年的 dump 源，n18 头注释记录了方法）找一个含 m2o 字段的表单弹窗 dump 其 flowModels JSON | 每种 kind 的 `use` 模型名 + props/stepParams 形态（对照 n17 列工厂 [:460-477](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:460) 与表单工厂 [:521](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:521) 的 dual shape） |
| 0-2 | `fields` 表 `column "target" does not exist` 报错（E2 调研旁证，hub_pj_projects owner/customer/members 查询触发）影响面：报错端点是哪个、是否在 flowModel 字段挂载路径上 | 实机重放报错请求（PG 日志拿 SQL/API 路径），对照 0-1 的挂载路径 | 判定"阻塞/不阻塞/仅 admin 配置页展示问题"；不阻塞则 QUICKSTART 声明已知边界 |
| 0-3 | 3 个 collection 的完整字段清单（columns/formFields spec 的真源） | psql 直查 fields 表（collectionName in 三表）：name/interface/type/target/title；对照用户手配弹窗 11 字段（[`research/e1-popup-full-api.json`](../../research/e1-popup-full-api.json) 内 `x-collection-field` 全集）与 [`nocobase-hub-modules.mts:75-92`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:75) 定义 | 字段清单表（本批 spec 输入） |
| 0-4 | destroy v1 路由行后 uiSchemas 树是否保留（回滚可行性 + 孤儿判断） | 在「任务列表」页试点：destroy 前后 psql 数 uiSchemas 行数对照 | 回滚预案确认；若级联删除则回滚改为"从种子重建 v1 页" |
| 0-5 | N22 LLM 服务 configurationStatus（AI 按钮渲染前提，D2 已知静默隐藏行为） | verify/探活既有链路（[`nocobase-n22-llm-proxy.mts`](../../examples/kb-agent/scripts/nocobase-n22-llm-proxy.mts)） | ready 才进入浏览器验收；不 ready 先修 N22 |

**探查出口条件**：m2o 模型形态明确 → 写 spec；date 模型不可行 → spec 中 date 字段暂不进弹窗（QUICKSTART 声明），**owner/assignee 无退路**——若 2.2.6 确无 m2o 表单模型，本批暂停上报（不允许用 input 冒充关联字段交付）。

### 1. 新种子脚本 `examples/kb-agent/scripts/nocobase-e1-pj-v2.mts`

骨架复制 [`nocobase-n17-alignment.mts`](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts)（call/dataOf/signIn/ensureV2TablePage 模式，脚本间小段复制是本仓库种子脚本惯例）：

1. **PJ_PAGES: ReadonlyArray<V2PageSpec>**——3 页 spec，`columns`/`formFields` 来自探查 0-3 的字段清单表；kind 联合在 `input | select | number` 基础上按探查 0-1 结论扩展 `m2o`（及可行的 `date`）。
2. **工厂函数扩展**：`displayModelFor`/`editModelFor`（[:422-426](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:422) 同位）加 m2o/date 分支；m2o 列/表单项的 props 按 0-1 dump 形态（预期含 `fieldNames: {label: 'nickname', value: 'id'}` 类配置，以 dump 为准）。
3. **复用 n17 幂等骨架**：desktopRoutes 按 title 找同名行——已有 `flowPage` 即 kept（[:436-440](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:436) 同逻辑）；v1 行 destroy（[:444](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:444)）**前把 `{id,title,parentId,icon,sort,schemaUid}` 打进日志**（回滚数据源）；flowModels 节点树逐 save（RouteModel×2 → RootPageModel → BlockGridModel → TableBlockModel → TableColumnModel×N → AddNewActionModel（嵌套 ChildPageModel→ChildPageTabModel→BlockGridModel→CreateFormModel→formGrid）→ RefreshActionModel，形态照 [:446-516](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:446)）。
4. **uid 前缀**：`n17e1`（区分于 n17 的 `n17` 前缀；确定性不要求——幂等靠同名 flowPage kept）。
5. **不写 AI 按钮代码**：n18 幂等扫描所有顶层 `CreateFormModel`（[`nocobase-n18-form-ai.mts:72`](../../examples/kb-agent/scripts/nocobase-n18-form-ai.mts:72)）自动挂 `n18ai-<formUid>`（props：dex + workContext + size 40，[:86-99](../../examples/kb-agent/scripts/nocobase-n18-form-ai.mts:86)）——e1 建完表单后重跑 n18 即得按钮。

### 2. all 链挂载

[`setup-nocobase.mts`](../../examples/kb-agent/scripts/setup-nocobase.mts) 的 all 链在 `nocobase-n17-alignment` 之后、`nocobase-n18-form-ai` 之前插入 `nocobase-e1-pj-v2`（顺序：n17 建 8 页 → e1 建 3 页 → n18 统一挂按钮；实施时以链内实际排序为准，保持"建页在前挂钮在后"不变量）。

### 3. QUICKSTART 已知边界（随本批落，E3 同节扩写）

- 看板/日历/甘特页为 v1 页，无悬浮球与弹窗 AI 按钮（表格页两样都有）；
- admin 弹窗 AI 填充由 dex 提供（与 CRM 8 页同款）；owner/assignee 下拉直接可选 9 位 AI 员工。

## 实施步骤

1. 第 0 步探查（0-1 ~ 0-5），产出字段清单表与 kind 结论 → 定稿 PJ_PAGES spec；
2. 写脚本 + all 链挂载；
3. **现有库**跑 e1 → 跑 n18 → psql/flowModels:list 断言：3 页 flowPage 路由行存在、`AIEmployeeButtonModel` 新增 3 个（`n18ai-` 前缀、parentId 指向新 CreateFormModel）；
4. 真实浏览器验收（下节），截图落 `examples/kb-agent/demos/acceptance-e1/`；
5. 幂等二跑：e1 三页全 kept、n18 `already in place`、孤儿 0。

## 验收断言（真实浏览器，admin@nocobase.com 登录）

1. 「项目管理 > 项目」页（新 v2 路由）悬浮球出现（v1 时无）；
2. Add new 弹窗：AI 员工按钮（dex）出现，点击输入意图生成草稿值（N22 ready；对照 CRM 客户页同款行为）；
3. 弹窗含 owner 关联选择器（非文本框），下拉出现 9 位 AI 员工中文名（阿特拉斯…维兹），选 1 位提交 200；
4. 提交后表格行 owner 列显示所选 nickname（fieldNames 合同）；
5. 「任务列表」页同款断言 1-4（assignee 字段）；
6. 「里程碑」页打开正常、Add new 可用；
7. **回归**：看板/日历/甘特 3 页仍 v1 可用（有数据、可交互）；Portal 面 D2 成果仍在（`/nocobase/dist/hub/projects` 表单 AI 按钮 + AI 员工下拉）；
8. 幂等二跑全 kept（e1 3 页 + n18 kept + 孤儿 0）；all 链顺序重跑无重复挂载；
9. PG tail 无新 `column ... does not exist`（对照 E2 调研旁证项，若有则归档为已知边界或修复）；
10. 截图 ≥6 张（悬浮球/弹窗 AI 按钮/owner 下拉展开含 AI 员工/提交后表格行/任务列表同款/看板 v1 回归）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| m2o 表单模型在 2.2.6 不存在（探查 0-1 空手而归） | 中 | 暂停上报，不带 owner 的 v2 表单不允许交付（= 第二次"不能添加 AI 员工"） |
| m2o 模型存在但 dump 形态与 n17 工厂 dual shape 不兼容（save 报错/渲染坏） | 中 | 以单页（项目）试点迭代至可用再铺 3 页；仍不可用则回退方案：v2 页表格 + owner 列只读展示 + **保留一个 v1 任务列表页作录入口**（QUICKSTART 声明），悬浮球照常——能力下限不低于现状 |
| destroy v1 行后 uiSchemas 级联删除（探查 0-4） | 低 | 回滚改走"种子重建 v1 页"路径（hub-modules 可重放） |
| 用户手配 popup 字段集合 ⊄ 工厂 spec（二次"字段变少"反馈） | 低 | spec 合同：formFields 必含用户手配 11 字段中的全部核心字段（owner + 3 date + 名称/状态类），0-3 清单逐项勾对后才跑库 |
| N22 未 ready 导致按钮不可见误判 | 低 | 0-5 探活前置；不 ready 先修 N22（n22 链）再验收 |
| n18 孤儿自愈误删（若 e1 二跑重建表单 uid 变化） | 低 | e1 kept 分支保证表单 uid 稳定（同名 flowPage 整页 kept，不重建）；验收 8 显式断言孤儿 0 |

**回滚**：e1 脚本内置 rollback 分支——按 destroy 时日志记录的 `{title,parentId,icon,sort,schemaUid}` re-create 3 个 v1 路由行 + destroy 对应 flowPage 路由行与 `n17e1*`/`n18ai-n17e1*` flowModels 树；业务数据表全程未碰，天然无损。整体 revert 种子提交后重跑 rollback 分支即回到 D 轮终态。
