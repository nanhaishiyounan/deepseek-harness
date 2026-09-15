# 批次 G7：AI 化补挂 + UI 适配收口 + 叙述降级（Hub 命运落地）

> 隶属 [PLAN.md](PLAN.md)。前置：G2-G6（全部域就位）。三个收口面：① 新域表单补挂 ai-employee-fill（AI 化承诺的补齐）；② 视觉/交互统一审查（设计感收口）；③ QUICKSTART/应用中心叙述改写（CRM 为主要入口、Hub 降级为模板参考——决策 6 落地）。

## 改动面 1：AI 化补挂（ai-employee-fill formId 清单）

参照既有挂载模式（[ai-employee-fill.tsx:35](../../platform/nocobase-portals/demo-portal-hub/src/components/ai-employee-fill/ai-employee-fill.tsx:35) 绑定 dex + [deals/form.tsx:127](../../platform/nocobase-portals/demo-portal-crm/src/pages/crm/deals/form.tsx:127) 的 `useAiEmployeeFill({ formId: "crm-deal-create", ... })` 用法），给移植域的**新建表单**补挂：

| 域/表单 | formId（建议） | 文件 | 优先级 |
|---|---|---|---|
| helpdesk tickets 新建 | `crm-helpdesk-ticket-create` | pages/helpdesk/tickets/ 下 form 组件 | 必须 |
| assets 新建 | `crm-asset-create` | pages/assets/assets/ form | 必须 |
| knowledge articles 新建 | `crm-kb-article-create` | pages/knowledge/articles/form.tsx | 必须 |
| hr employees 新建 | `crm-hr-employee-create` | pages/hr/employees/ form | 必须 |
| inventory products 新建 | `crm-inv-product-create` | pages/inventory/products/ form | 可选 |
| procurement purchase-orders 新建 | `crm-po-create` | pages/procurement/purchase-orders/create-edit | 可选 |

挂载步骤（每表单）：import `useAiEmployeeFill` → 在表单组件内调 hook（formId + 表单字段集）→ 表单底部出现 dex 头像按钮。**注意**：这是 Portal 前端挂载（不动 admin 侧 n18；n18ai- ≥25 断言不受影响）。可选两条按时间裁剪，四条必须项保证每域至少一个 AI 表单（hr/helpdesk/assets/knowledge 四域 + 已随域激活的 projects×2/expenses + CRM 原有×2 = 挂载点总数 ≥10）。

## 改动面 2：UI 适配收口（视觉统一审查清单）

1. **分组菜单密度**：十域后侧栏 8 组 ~45 resource——检查折叠态 hover dropdown、小屏（<1024px）自动折叠（sidebar 模板原生能力，[sidebar.tsx](../../platform/nocobase-portals/demo-portal-crm/src/components/app-shell/sidebar.tsx)）；
2. **图标一致性**：各域 resource icon（lucide）与 CRM 域风格统一——抽查每组首个 icon 视觉和谐（不统一则换 lucide 同族 icon，仅 meta.icon 一行改）；
3. **明暗主题全域过一遍**：新域页面 dark 模式截图抽查（token 同源，预期零问题；ECharts 由 useChartTheme 覆盖——overview/dashboard 类页面重点）；
4. **菜单徽章（可选增强）**：CRM 的 [menu-badges.tsx](../../platform/nocobase-portals/demo-portal-crm/src/pages/crm/menu-badges.tsx) 机制扩到 helpdesk tickets（待处理数徽章）——时间盒半小时，不成即弃（不阻塞）；
5. **空组清理**：确认 8 组全部有成员（G2-G6 后应全满）。

## 改动面 3：叙述降级（QUICKSTART 三节 + 应用中心卡片）

1. **[QUICKSTART.zh.md:138](../../examples/kb-agent/QUICKSTART.zh.md)**（双 Portal 进入路径）：改写为「CRM Portal（主入口）在 `:3080/nocobase/dist/crm/`（九域合一：销售/项目/人事/库存/采购/财务/客服/资产/知识库）；Hub Portal 保留为官方模板参考（`:3080/nocobase/dist/hub/`），功能已全部并入 CRM」——深链示例换 crm 侧（`/nocobase/dist/crm/tickets`、`/nocobase/dist/crm/overview`）；
2. **[:139](../../examples/kb-agent/QUICKSTART.zh.md)（E3 定位分工）**：整节改写——旧「双 Portal 分工」叙述作废，改为「CRM Portal 单主入口：销售作业 + 全域运营（G 轮并入）；Hub sales 域未并入的原因（官方模板双销售演示，CRM 侧 crm_* 为真数据）」；
3. **[:140](../../examples/kb-agent/QUICKSTART.zh.md)（边界）**：「Hub/CRM Portal 页面为模板静态页，菜单不开放运行时配置」更新为「CRM Portal 十域菜单分组结构在前端路由硬编码（8 组）；数据/字段配置仍在 admin 数据源管理器」+ 新增「Portal AI 表单挂载点清单（G7 后 ~10 个）」；
4. **应用中心卡片**：[nocobase-n17-alignment.mts ensureAppHub()](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:579)——Hub Portal 卡文案改为「Hub Portal（模板参考）——功能已并入 CRM Portal」，CRM 卡提升为首位 + 文案「CRM Portal（主要入口）——九域合一」；幂等机制（title+marker+copy-fingerprint）会因文案变化整页重建（E3 先例），重放脚本 + 验证 stale tabs 清理；
5. **helpdesk 挂载点叙述对齐**：QUICKSTART:142 的「十一个表单挂载点」段落补 Portal 前端挂载点段（区分 admin n18 与 Portal ai-employee-fill 两套）。

## 验收断言（证据落 `examples/kb-agent/demos/acceptance-g7/`）

1. 四个必须 AI 挂载点：每表单 dex 按钮出现 + 至少一次中文流式填充实测（helpdesk ticket：「客户反馈到货破损，紧急工单」四张截图/录屏之一）+ 提交落库；
2. 挂载点计数：`grep -r "useAiEmployeeFill" platform/nocobase-portals/demo-portal-crm/src/pages` 输出行数 = 预期清单（≥8：crm×2 + projects×2 + expenses + G7×4）——记入 gates.log；
3. UI 审查：8 组菜单折叠/展开动图、小屏折叠截图、暗色主题三域抽查（overview/tickets/articles）截图；
4. QUICKSTART 三节改写落盘（diff 截图或 git diff 记录）；英文版如有对应段落同步（QUICKSTART 现为中文主文档，README 检查无 portal 段——C 路已确认零命中）；
5. 应用中心：admin 打开应用中心页截图——CRM 卡首位「主要入口」+ Hub 卡「模板参考」；旧卡文案清理（无 stale 重复卡）；
6. `portal tsc` EXIT=0 + deploy 双跑树哈希一致 + verify 全绿（n17 重放后应用中心断言若存在则过）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| AI 填充对中文表单字段的映射不准（Hub 表单字段注释是英文 prompt 线索） | 中 | formFiller 按字段 label/placeholder 推断；实测四表单各一次；个别字段不准在 formId 配置里补字段描述（ai-employee-fill 支持字段 hint——参照 deals 挂载的写法） |
| n17 应用中心整页重建误删手配内容 | 低 | 幂等机制设计即整页重建（E3 先例安全）；重放前 dump 现页 JSON 存档到 demos/ |
| QUICKSTART 叙述与实际能力不符（过度承诺） | 低 | 每句叙述以验收断言为据；G8 终审复读一遍 |

回滚：AI 挂载/叙述改写/应用中心三个独立提交；n17 叙述回滚需重放旧文案版本脚本（E3 模式）。
