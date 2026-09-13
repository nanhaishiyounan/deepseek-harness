# 用户验收反馈修复计划（第四轮）：admin 项目管理 AI 关联（v2 升级）+ Portal 设置外链修复 + CRM/Hub 定位说明 + 收口回归（2026-09-13）

> 面向下一位实施者（Loop 批次/code 模式）：本文回答"为什么与做什么裁决"，每批"怎么做"在 [01](01-admin-pj-ai.md)~[04](04-closeout-regression.md)。所有根因结论附 `文件:行号` 或实机探测证据；调研经 3 路并行子任务完成（E1 debug 实机诊断 / E2 debug 实机诊断 / E3 project-research 域盘点），关键行号已人工抽查复核（n17 工厂、n18 挂载、SettingsLink）。基线 HEAD=`14fc2f01d6`（D 轮终审 PASS 95/100，提交链未推送）。

**目标一句话**：E1 把 admin 后台「项目管理」组的 3 个表格页升级为 v2 flowPage 并让 n18 自动挂上表单 AI 按钮（复刻 N17d/N18 已验证模式，扩展 m2o/date 字段支持）——补齐 D2 只修 Portal 面留下的 admin 面缺口；E2 修复两 Portal 设置外链的版本错配 404 并引导到 admin 原生配置能力；E3 用定位说明 + 卡片文案对齐回答「CRM 和 Hub 什么关系」；E4 幂等收口。

**北极星（用户原话）**：

1. 「http://localhost:3080/nocobase/admin/dspbkroytnp/popups/yotj60pajt7 这个项目管理里面还是不行 没有ai关联」——**同一诉求第二次反馈**（D2 修了 Portal 面，这次是 admin 面）
2. 「crm和hub什么关系，怎么有些功能重复」
3. 「hub的设置点进去404」
4. 「没有crm系统的可配置编辑的功能，ui配置开启等功能」

---

## 1. 调研结论摘要（四问题根因）

### 1.1 E1：「两个面」证据链（避免第三次返工的核心）

用户 URL 的每个 ID 已实机解析（存档 [`research/e1-popup-full-api.json`](../../research/e1-popup-full-api.json)）：`dspbkroytnp` = desktopRoutes「项目管理 > 项目」页 schemaUid（**type='page'，v1 页**）；`yotj60pajt7` = 该页内 Add new（create）drawer 弹窗（45 节点：Action → drawer → FormV2 → 11 CollectionField → createSubmit），绑定 `hub_pj_projects`。整棵树 **0 个 AI 组件、0 个 filter**。

| 面 | 机制 | AI 关联现状 | 归属 |
|---|---|---|---|
| **面1：Hub Portal**（`/nocobase/dist/hub/projects`） | 我们写死的 refined React 页 | ✅ D2 已修：UserPicker 数据源 users（9 位 AI 员工在表）+ tasks/projects 表单挂 [ai-employee-fill](../../platform/nocobase-portals/demo-portal-hub/src/components/ai-employee-fill/ai-employee-fill.tsx:1)（Portal 私有组件，275 行，**不可复用于 admin blocks**） | D 轮完成 |
| **面2：admin 后台**（`/nocobase/admin/...`） | NocoBase blocks 动态渲染，v1 uiSchema / v2 flowModel 两代页面体系 | ❌ 本轮修：「项目管理」组 6 页全是 v1 页；plugin-ai 的 AI 体验只存在于 v2 页 | E1 |

**admin 面缺失的精确机制（三层证据）**：

1. **数据层无缺陷**：users 表 14 行含 9 位 AI 员工（id 6-14：阿特拉斯/atlas … 维兹/viz，D2 种入）；popup 的 `owner` 字段是 m2o target=users、fieldNames nickname/id、无 filter；admin token 实测 `users:list` 全量返回——**用户在 owner 下拉里其实已能选到 AI 员工**。
2. **AI 体验组件层缺失**：plugin-ai ChatButton 悬浮球在 v1 页不渲染（[ChatButton.tsx:29](../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/ai-employees/chatbox/components/ChatButton.tsx:29) `isV1Page` → return null）；admin 表单 AI 填充 = `AIEmployeeButtonModel`（挂在 v2 弹窗 `CreateFormModel.actions`，dex + formFiller 前端工具写表）——v1 uiSchema 弹窗（FormV2 组件树）没有任何可挂的 AI 组件，plugin-ai 未注册任何 v1 SchemaComponent/Initializer（[client/index.tsx:67](../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client/index.tsx:67) `addComponents` 仅 1 项）。
3. **页面代际错位**：库内已有 **8 个 v2 flowPage 先例**（N17d 建：客户/销售线索/联系人/订单/报价单/工单/资产台账/员工，[nocobase-n17-alignment.mts:283-420](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:283)；N18 给每页弹窗挂 `n18ai-*` AI 按钮，实测 CRM admin 域 AI 填充完整可用）——**项目管理组的 6 页从未升级 v2、从未挂过 AI 组件**。

**popup 来源判定**：用户在 admin UI Editor 手工配置。种子脚本 [nocobase-hub-modules.mts:613](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:613) 只建菜单/页面/表格/看板/日历/甘特区块（ActionBar 仅空 initializer，:708/:736/:768/:786），从不生成 Add new 弹窗——种子里管不到用户手配的 popup，这就是 D 轮没发现此面的原因。

→ 修复路径裁决：**复刻 N17d v2 工厂升级项目管理表格页 + 跑 n18 自动挂 AI 按钮**，详见 [01](01-admin-pj-ai.md)。

### 1.2 E2：settings 404 = portal-sdk 与本地快照的版本错配（与 D3 fallback 无关）

Hub Portal 设置齿轮 [SettingsLink](../../platform/nocobase-portals/demo-portal-hub/src/components/app-shell/header.tsx:112) 经 portal-sdk@2.1.0 `resolveNocoBaseSettingsUrl()` 生成 `http://localhost:3080/nocobase/settings`（新标签页打开）。三层实机复现：网关 200（admin SPA 壳）→ NocoBase 200（同一壳）→ **admin SPA 客户端路由 miss 渲染 Not Found**——本地快照 NocoBase **2.2.6** 的 settings 路由实际挂在 `/admin/settings/*`（plugin-manager / data-source-manager / system-settings / users-permissions 实测全部 200），客户端路由表不存在裸 `/settings`（v2.13+ 形态）；运行时 89 个启用插件中无 plugin-settings-manager / plugin-multi-portal。D3 fallback 既不覆盖（`/nocobase/settings` 不在 `/dist/{crm,hub}` 前缀下且上游 200）也不可达（404 发生在客户端路由层）。CRM Portal 的 SettingsLink（[demo-portal-crm/header.tsx:125](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/header.tsx:125)）完全同构、同病同源。

「没有可配置编辑功能」的实情：**配置能力不缺失**——admin 数据源管理器里 hub_*/crm_* 全部 49 张表可见可配（配置字段/编辑/删除/图形化界面），顶栏有「界面配置」模式，settings 抽屉有用户和权限；缺的只是从 Portal 到 admin 配置中心的正确 URL 引导。Hub 菜单为纯前端写死（[extensions.tsx:66-140](../../platform/nocobase-portals/demo-portal-hub/src/app/extensions.tsx:66)），无运行时配置（模板设计，本轮不重构）。详见 [02](02-portal-settings-link.md)。

### 1.3 E3：CRM/Hub 重复 = 官方双 demo 模板的固有设计；重复感知的界面根源是卡片文案错位

两 Portal 是 NocoBase 官方两个 demo 模板的镜像（[replication 调研:154-169](../../research/2026-09-09-nocobase-official-demo-replication.md:154)）：CRM = 单销售链路门户（demo-portal-crm）；Hub = 九模块合一企业门户（demo-portal-hub，sales/finance/helpdesk/hr/assets/inventory/knowledge/procurement/projects 前端硬编码）。**Hub 自带完整 sales 域是模板固有设计而非本仓库选型**——其动机是 Hub 首页「全公司脉搏」聚合六域数据（[home/data.ts:122](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/data.ts:122)，运营视角）。

重复面盘点（49 表全量对照）：hub_sales_leads/accounts/contacts/deals/activities × crm_* 五对高重复（3 对菜单完全同名）；hub_fin_invoices × crm_invoices 撞名；hub 域内双轨（hub_tk_tickets × hub_hd_tickets、hub_as_vendors × hub_po_suppliers）。数据层完全隔离：零跨域外键、同名记录 0 条；**全库为可重放种子数据**（2026-09-13 03:28-03:33 D6 reset 批量重建，行数与 handoff 基线完全一致，无用户录入）。

**重复感知的直接界面根源**：应用中心 Hub 卡片文案（[nocobase-n17-alignment.mts:604](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:604)）沿用 B3 初建语义写「项目、工单、资产与人事一站式协作」，漏掉销售/采购/财务/帮助台/知识库五域——用户按文案理解 Hub，进去却看到第二套销售管道。QUICKSTART 只讲入口不讲分工（[QUICKSTART.zh.md:133-137](../../examples/kb-agent/QUICKSTART.zh.md:133)）。→ 裁决：**保留双域不删除**（前端 wire 硬编码 + 首页聚合依赖 + 官方双 demo 设计；删除=大改 vendored portal），以定位说明 + 卡片文案对齐收敛感知，详见 [03](03-crm-hub-positioning.md)。

---

## 2. 技术决策（已定，实施不再讨论）

1. **E1 修复形态 = v2 flowPage 升级**（不是给 v1 页开发 AI 组件）：v1 无 plugin-ai 官方挂载点（改 vendored plugin-ai 越界）；v2 工厂（N17d）+ AI 按钮（N18）是被 8 页实测验证的同一条链。AI 按钮不重写挂载代码——n18 幂等扫描所有新建顶层 CreateFormModel 自动挂 `n18ai-<formUid>`（[nocobase-n18-form-ai.mts:72-101](../../examples/kb-agent/scripts/nocobase-n18-form-ai.mts:72)），E1 只需把表单建出来。
2. **升级范围 = 「项目管理」组 3 个表格页**（项目 hub_pj_projects / 任务列表 hub_pj_tasks / 里程碑 hub_pj_milestones）：用户证据链直指表格型页面；看板/日历/甘特 3 个视图页保留 v1（2.2.6 flowModel 体系无对应视图区块模型，强翻会丢视图能力；AI 能力入口在表格页 + 悬浮球），QUICKSTART 声明已知边界。
3. **工厂字段 kind 扩展：m2o 必达、date 尽力**：n17 工厂现有 kind 仅 input/select/number（[nocobase-n17-alignment.mts:422-426](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:422)），owner/assignee（m2o→users，D1 迁移成果）不进表单=功能回退，**宁推迟不交付无关联字段的表单**；date 模型若快照不支持则该字段暂不进弹窗并声明。实施第 0 步先探查 2.2.6 flowModel 的 m2o/date 字段组件形态。
4. **用户手配 popup 被标准 v2 弹窗替代**（页面升级的必然结果）：工厂 spec 的 columns/formFields 必须覆盖用户手配弹窗的全部核心字段（以 collection 字段清单为准，含 owner 与 3 个 date），防"字段变少"二次反馈。
5. **E2 = portal fork 显式 URL 替换**：两 portal 的 SettingsLink 弃用 `resolveNocoBaseSettingsUrl()`，改为从运行时 `NOCOBASE_API_URL` 推导 admin 配置中心直达 URL（落 data-source-manager，最贴用户"配置编辑"诉求）；portal fork 源码级改合规（D4 文案先例）。
6. **E3 不删除任何域/表/菜单**：定位三层落地（QUICKSTART 定位节 + 应用中心卡片文案对齐 + 重复入口说明），数据层不动。
7. **验收基调延续**：现有库增量幂等双跑（**不 reset**，基调不变；E3 调研证实现库全是种子，但 reset 仍只属于未来明确需要的收口）+ 真实浏览器实测截图（admin popup 表单选 AI 员工）+ 文档同步 + 门禁全绿。

---

## 3. 批次总览（4 批，顺序执行）

| 批次 | 一句话 | 文档 | 依赖 | 预估 |
|---|---|---|---|---|
| E1 admin 项目管理 AI 关联 | 3 表格页 v2 升级（工厂复刻 + m2o/date kind 扩展）+ n18 自动挂 AI 按钮 + 浏览器验收 | [01](01-admin-pj-ai.md) | 无（D 轮已入库存量） | 大头（探查+脚本+验收） |
| E2 Portal 设置外链 + 配置引导 | 两 portal SettingsLink 显式 URL（data-source-manager）+ deploy 重建 + QUICKSTART 配置指引 | [02](02-portal-settings-link.md) | 无（与 E1 独立；排在后避免与 E1 会话交织） | 小 |
| E3 CRM/Hub 定位说明 | QUICKSTART 双 Portal 定位节 + 应用中心卡片文案对齐（幂等 update） | [03](03-crm-hub-positioning.md) | 无（与 E2 同碰 QUICKSTART，串行避免冲突） | 小 |
| E4 收口回归 | 增量幂等双跑 + 全量门禁 + 证据归档 + Agent Note + handoff/QUICKSTART 同步 | [04](04-closeout-regression.md) | E1-E3 | 中 |

顺序理由：E1 是用户核心诉求且工程量最大，先行；E2/E3 均触碰 portal/文档面且互有 QUICKSTART 交叠，串行；E4 收口。

---

## 4. 验收标准（本轮完成定义）

1. **E1（admin AI 关联）**：真实浏览器打开 `:3080/nocobase/admin/<项目页路由>`——悬浮球出现；Add new 弹窗有 dex AI 员工按钮且点击可生成草稿值（N22 ready 前提下）；弹窗含 owner 关联字段且下拉出现 9 位 AI 员工（选中提交 200，任务列表页同款验收 assignee）；里程碑页打开正常；看板/日历/甘特 3 页维持 v1 可用（回归无破坏）；种子段二跑全 kept；截图 ≥6 张落 `examples/kb-agent/demos/acceptance-e1/`。
2. **E2（设置外链）**：hub 与 CRM 两 Portal 点设置齿轮 → 新标签打开 admin 数据源管理器（hub_* 表可见）非 Not Found；curl 断言目标 URL 200；deploy 双跑树哈希一致。
3. **E3（定位说明）**：QUICKSTART 双语定位节落盘且 `doc-sync` 绿；应用中心 Hub/CRM 卡片文案与实际能力一致（截图）；卡片种子段二跑幂等。
4. **E4（收口）**：现有库增量幂等双跑全 kept（不 reset）；`typecheck/lint/doc-sync` EXIT=0、分区 test 绿；证据归档 `demos/acceptance-e{1..4}/`；Agent Note 落盘（E1 v2 升级机制）；QUICKSTART/handoff 同步。

---

## 5. 硬约束（实施全程有效）

- **不 reset 用户库**：全部种子操作幂等 ensure（同名 kept / 确定性 uid）；E1 升级页只动 desktopRoutes 路由行与 flowModels，不碰业务数据表。
- **不修改 `platform/nocobase` 快照源码**（vendored 核心）；portal fork 源码级改合规（模板预期用法，D2/D4 先例）但不得引入新依赖、不改 portal-sdk（node_modules）。
- E1 第 0 步探查结论决定 m2o/date 落地形态后方可写 spec——**禁止跳过探查直接套 input kind 冒充关联字段**（owner 变回文本框=第二次"不能添加 AI 员工"事故）。
- n18 的孤儿自愈逻辑（N25）保持原样；E1 新表单走 n18 原有匹配路径，不改 n18 脚本。
- 范围控制：不做看板/日历/甘特 v2 化、不做 hub 菜单运行时配置化、不做 CRM/Hub 域删除或数据打通、不做 member 角色权限体系。
- 提交链维持未推送基线（14fc2f01d6 之上叠 E 轮提交）；每批独立提交、可独立 revert。

---

## 6. 风险总览

| 风险 | 等级 | 预案 | 所属批 |
|---|---|---|---|
| 2.2.6 flowModel 体系 m2o/date 字段模型形态未知（工厂从未生成过） | **中** | 第 0 步源码/实机探查；date 不可行则降级声明，m2o 必达（阻塞则整批暂停上报） | E1 |
| admin 元数据版本错配报错（fields 表 `target` 列、aiEmployees `defaultModel` 列 does not exist——E2 调研旁证） | 中 | 探查确认影响面；若仅影响 admin 配置页展示则 QUICKSTART 声明已知边界，不阻塞 E1 主线（flowModel 字段走 stepParams init，不经该查询路径——探查验证） | E1/E4 |
| v1 页升级=删 v1 路由行（n17 工厂 :444 先例），用户手配 popup 不再可达 | 低 | 字段集合对齐合同（决策 4）；回滚分支 re-create v1 路由行（destroy 前读取 parentId/icon/sort/schemaUid 落日志） | E1 |
| v1 uiSchemas 树随路由 destroy 孤儿化/级联行为不确定 | 低 | 实施时先在任务列表页试点验证 destroy 后 uiSchemas 行仍在；回滚依赖该结论 | E1 |
| AI 按钮不可见（N22 LLM 服务未 ready 时按钮静默隐藏——D2 已知行为） | 低 | 验收前探活 N22 configurationStatus；不 ready 则先修 N22（n22-llm-proxy 链）再验收 | E1 |
| portal deploy 重建引发品牌/悬浮球回归（C4/C6 修过的 PORTAL_BASE 面） | 低 | deploy 双跑树哈希一致 + verify 既有 Portal 断言组兜底（D 轮惯例） | E2 |
| 卡片文案幂等 update 与 n17 既有 ensure 分支冲突（kept 分支跳过 update） | 低 | n17 卡片段补"文案漂移则 update"分支；二跑断言文案一致 | E3 |
| QUICKSTART 双语两份漂移 | 低 | 只在中英两版同步落节，`doc-sync`/i18n 校验兜底 | E3 |

---

## 附：调研证据存档索引

- E1 popup/page schema 原文：[`research/e1-popup-schema.json`](../../research/e1-popup-schema.json)、[`research/e1-page-schema.json`](../../research/e1-page-schema.json)、API 重组全树 [`research/e1-popup-full-api.json`](../../research/e1-popup-full-api.json)、[`research/e1-page-full-api.json`](../../research/e1-page-full-api.json)
- v2 工厂实现：[`nocobase-n17-alignment.mts:433-518`](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:433)（ensureV2TablePage：desktopRoutes destroy v1 → create flowPage → flowModels 节点树）；表单网格 [`formGrid:521`](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:521)
- AI 按钮挂载：[`nocobase-n18-form-ai.mts:63-104`](../../examples/kb-agent/scripts/nocobase-n18-form-ai.mts:63)（确定性 uid `n18ai-<formUid>`、props `{aiEmployee:{username:'dex'}, context:{workContext:[{type:'flow-model',uid}]}, style:{mask:false,size:40}, auto:false}`、孤儿自愈）
- plugin-ai 组件注册面：[`client/index.tsx:67`](../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client/index.tsx:67)（flowEngine.registerModels + model loader + ChatBoxLayout + pluginSettingsManager 五页）
- formFiller 链路：客户端 [`form-filler/tools/index.ts`](../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/ai-employees/form-filler/tools/index.ts:1)、服务端 [`formFiller.ts`](../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/ai/tools/formFiller.ts:1)
