# W3「真实可用性」能力盘点（02-capability-inventory）

- 盘点时间：2026-09-27；盘点人：能力盘点研究员（project-research 模式，纯读）
- 对象：platform/nocobase 开源快照（2.2.6，yarn1 独立子树）+ examples/kb-agent/scripts 编程式先例 + research/ 取证存档
- 结论速览：W3 需要的能力快照里全部具备——kanban/calendar/gantt/departments/iframe/markdown/charts 全在且（除 gantt 的 v2 编程通道外）可编程式构建；行详情 drawer 有完整现成 wire 先例；部门员工权限不需要自建（plugin-departments 完整且 setup 已启用）；wfl 六表数据面足以支撑流程图渲染 + 表单化编辑直写。

## 1. 能力矩阵（W3 需要的能力 → 快照有无 → 先例/证据 → 风险）

| W3 能力 | 快照有无 | 编程式先例/证据路径 | 风险注记 |
|---|---|---|---|
| 看板块 | ✅ plugin-kanban 2.2.6，Apache-2.0，presets builtIn | v2：examples/kb-agent/scripts/nocobase-f1-view-v2.mts（任务看板）、nocobase-w8-quality.mts:464（B8 处置看板）、nocobase-h4-srm.mts:338（整改跟踪）；v1：nocobase-hub-modules.mts:779 kanbanBlock()、nocobase-crm-modules.mts:438 | 无；v2 白名单与 support-matrix 均可 createSupported |
| 日历块 | ✅ plugin-calendar 2.2.6，builtIn | v2：nocobase-f1-view-v2.mts（任务日历 CalendarBlockModel）；v1：f-round-inventory/v1-pages/任务日历.json（CalendarBlockProvider+CalendarV2） | 无 |
| 甘特块 | ✅ plugin-gantt 2.2.6 **Apache-2.0 完整源码**（src/client + client-v2 全在），builtIn；**非商业 stub，"商业版缺席"假设不成立** | v1 独有：v1-pages/任务甘特.json（GanttBlockProvider + fieldNames{id,start,end,title,range:'day'}）；官方工厂 platform/nocobase/packages/plugins/@nocobase/plugin-gantt/src/client/createGanttBlockUISchema.tsx | ⚠️ gantt 不在 flow-engine 白名单（node-use-sets.ts）与 support-matrix → **v2 flowSurfaces 通道不可用，只能 v1 uiSchemas 通道**（e1-pj-v2.mts:19-21 注释即此判定） |
| 行详情块（PC） | ✅ 非独立插件，v1 在 packages/core/client/src/modules/blocks/data-blocks/details-multi|single/，v2 DetailsBlockModel 在 packages/core/client-v2/src/flow/models/blocks/details/DetailsBlockModel.tsx:34；白名单 + support-matrix createSupported ✅ | **黄金先例**：nocobase-f1-view-v2.mts:509 drawerPageTree()（KanbanCardViewActionModel → ChildPageModel → DetailsBlockModel → DetailsGridModel → DetailsItemModel → Display*FieldModel 全链） | 无 |
| 行详情块（mobile） | ⚠️ 无独立 mobile-block-* 插件（快照 plugins 全目录无）；plugin-mobile 2.0 已 deprecated（package.json displayName "Mobile (deprecated)"，由 ui-layout 替代、开发中）；plugin-mobile-client 在 presets deprecated 列表 | plugin-mobile/src/client/mobile-blocks/ 仅 settings-block | mobile 端块能力受限；W3 若含移动端详情需另行验证 ui-layout 或复用 PC flowPage |
| 筛选表单块 | ✅ FilterFormBlockModel 在 v2 白名单（node-use-sets.ts:21）+ support-matrix createSupported（ownerPlugin @nocobase/core/client）；配套 FilterActionModel/FilterFormSubmitActionModel 等在 ACTION_BUTTON_USES | 白名单证据：plugin-flow-engine/src/server/flow-surfaces/node-use-sets.ts:12-104 | 无独立"插件目录"（内置于 core/client），盘点时勿按目录找 |
| Form 块 | ✅ CreateFormModel/EditFormModel createSupported ✅；普通 FormBlockModel topLevelAddable=false 且 createSupported=false | E1 弹窗链：nocobase-n17-alignment.mts:227-229（ChildPageModel→ChildPageTabModel→BlockGridModel→CreateFormModel→FormGridModel→FormItemModel）；f1-view-v2.mts:434-458 同款 | 普通表单块不要用 addBlock 建，用 create-form/edit-form |
| iframe/HTML/Markdown 块（承载流程图/自建甘特） | ✅ block-iframe/block-markdown 均 builtIn；v2 IframeBlockModel/MarkdownBlockModel 在 STATIC_CONTENT_BLOCK_USES + support-matrix createSupported | addBlock type 词汇表：'iframe'/'markdown'/'jsBlock'/'chart'/'actionPanel'…（authoring-validation.ts:231-234、blueprint/public-types.ts:238-241） | iframe 块 mode 支持 url/html（catalog.ts:1380 props url/html/mode） |
| JS 自定义块（自建 SVG 甘特/流程图） | ✅ JSBlockModel（ownerPlugin @nocobase/core/client），v2 白名单 + createSupported | **现成先例**：nocobase-h5-wms.mts:1366-1422 库位平面图——POST /api/flowSurfaces:addBlock {target:{uid:gridUid}, type:'jsBlock', settings:{code}}；code 内用 ctx.makeResource('MultiRecordResource')/setResourceName/refresh/getData 读集合（ctx.api.resource 被 runjs allowlist 拒绝），ctx.render(html) 输出 | 读写都走 FlowResource vocabulary，不能裸调 REST |
| 图表块（KPI/看板） | ✅ plugin-data-visualization(+echarts) builtIn；charts（v1）也在 setup PLUGINS 启用 | nocobase-w9-dashboards.mts:495-660（ChartBlockModel query builder：mode:'builder'、measures[{field,aggregation,alias}]、filter kpi_code、series 拆分）；h4-srm.mts 雷达走 visual.mode='custom' 原生 ECharts option | 无 |
| ACL / 用户 / 角色 | ✅ plugin-acl/plugin-users builtIn；API：users:list/create、rolesResources:list/create/update、apiKeys:create | b4guard 先例：nocobase-h5-wms.mts:3764-3782（users:create + roles:[{name:'admin'}] + 登录换 token + wms_stock:update 403 探针）；kpi_snapshots 只读守卫：nocobase-w9-dashboards.mts:139-153（rolesResources:create {role, name, usingActionsConfig:true, actions:[view/list/get/export]}）；admin→wms 守卫：setup-nocobase.mts:976-978 | 「member」角色无先例（现有 admin/root/b4guard），需新建角色时走 roles:create |
| 部门/组织架构 | ✅ **plugin-departments 完整且已启用**（presets dependencies:45；setup-nocobase.mts PLUGINS:89 含 'departments'）——不需要自建 org_departments/org_employees | 集合：departments（树 parent/children）、departmentsUsers（through，isOwner）、departmentsRoles（部门↔角色）、users 扩展 departments m2m + mainDepartment m2o（plugin-departments/src/server/collections/*.ts）；服务端 action：departments:setOwner/removeOwner/aggregateSearch、users:listExcludeDept（plugin.ts:57-62）；ACL snippet 自动注册（plugin.ts:65-75）；中间件 set-departments-roles.ts 会把部门映射角色写入 ctx.state.currentUser | 主部门维护、叶子更新、删除校验全部内建 |
| 审批流（wfl 自建六表） | ✅ wfl_flow_configs/states/transitions/approval_records/approval_todos/gate_configs（第六表 gate_configs 存在，不止五表） | 建表：nocobase-w1-approval.mts:70-123；引擎读写：approval-engine.mts（loadFlow/approversOfRole/seedDocFlow，含 approver_map 数组形、amount_threshold 阈值路由、config_note 审计） | approver_map 值=用户名/用户名数组，无部门维度；按部门路由需 engine 侧扩展（数据面已具备，见 §4） |
| 审批流可视化配置 | ✅ 数据面 + 渲染通道 + 编辑通道齐备 | 渲染：JSBlock 先例（h5 bin-map）读 wfl 表画 SVG/HTML；编辑：六表是普通 collection，EditFormModel/CreateFormModel 挂页直写 REST；approval-engine.mts seedDocFlow 已示范编程写 wfl_flow_configs | 无新增缺口 |

## 2. B8 看板先例：kanban 编程式 wire 要点

B8 = W 轮质量域批次（nocobase-w8-quality.mts），「处置看板」页 = qm_nc_dispositions 集合的 kanban（groupField 'action'）。同一工厂形状在 f1-view-v2（任务看板 hub_pj_tasks/status）、w8（处置看板）、h4-srm（整改跟踪 srm_capas/status）三处验证。

**v2 flowModels 通道（推荐）**，`flowModels:save` 逐节点：
- 主块：`{use:'KanbanBlockModel', parentId:<gridUid>, subKey:'items', subType:'array', sortIndex:1, props:{groupField, groupOptions, styleVariant:'color', quickCreateEnabled:false, dragEnabled:true, sortField:'sort'}, stepParams:{resourceSettings:{init:{dataSourceKey:'main', collectionName}}}}`（h4-srm.mts:990-996）
- 卡片链：`KanbanCardItemModel(subKey:'item') → DetailsGridModel(subKey:'grid', props.layout{version:2,rows…}) → DetailsItemModel(subKey:'items', stepParams.fieldSettings.init.fieldPath) → Display*FieldModel(subKey:'field', props.options)`（f1-view-v2.mts:319-357 kanbanCard()）
- 弹窗动作：`KanbanCardViewActionModel(subKey:'cardViewAction') + KanbanQuickCreateActionModel(subKey:'quickCreateAction')`，stepParams `{popupSettings:{openView:{mode:'drawer', size:'medium', pageModelClass:'ChildPageModel', collectionName, dataSourceKey:'main'}}}`（w8:751-759）
- 持久化前提：卡片视图动作是 load-only 路径，必须持久化 page 子树否则 drawer 空壳（f1-view-v2.mts:569-580）
- sort 列：`fields:create {name:'sort', type:'sort', interface:'sort', scopeKey:<groupField>}`，缺列则拖拽无组内落位（hub-modules.mts:936-943、crm-modules.mts:484-493）
- 拖拽落库机制：不是逐条 PATCH——`model.resource.runAction('move', {params:{sourceId, sortField, …moveParams}})` → 集合 `:move` 服务端动作；跨列时 moveParams 携带 groupFieldName/groupFieldScopeKey/targetColumnKey 由服务端一并更新分组字段 + 重排（plugin-kanban/src/client-v2/models/components/KanbanBlock.tsx:462-535；KanbanBlockModel.getConfiguredDragSortFieldName/canCrossColumnDrag :704-745）。UI 即「拖拽后状态列落库」。
- ACL：块级 `x-acl-action: <collection>:list`（v1）；写路径要求 `<collection>:move`；KanbanBlockProvider 用 useACLRoleContext 判拖拽权限（KanbanBlockProvider.tsx:87-92）
- v1 uiSchemas 通道（hub-modules.mts:779-802）：`KanbanBlockProvider` decorator-props {collection, dataSource:'main', action:'list', groupField, sortField:'sort', params:{paginate:false, sort:['sort']}} + `Kanban` array 节点 + 卡片在固定 `properties.card` 键下（renderCard 按名读取）且字段包 Grid.Row→Grid.Col；卡片链断言函数 kanbanCardKeyIntact 可作验证模板。

## 3. v2 行详情块编程式构建：三层 wire 清单

依据：research/e1-popup-schema.json、e1-popup-full-api.json（AddNew 正常工作 = 现成参照）、n17-addnew-action-dump.json、f-round-inventory/v1-pages/供应商.json；v2 先例 f1-view-v2.mts drawerPageTree()。

### 第一层：表格页 spine（flowModels:save 链）
`flowRoute(type:'flowPage') → RootPageModel(subKey:'page', props.title/displayTitle/enableTabs) → tabs 行(type:'tabs') → BlockGridModel(subKey:'grid', filterManager:[]) → TableBlockModel(subKey:'items', props, stepParams.resourceSettings.init{dataSourceKey:'main', collectionName})`
- 动作条：FilterActionModel/AddNewActionModel/RefreshActionModel 挂 subKey:'actions'（subType:'array'）
- AddNew 弹窗子树（e1/n17 实证）：`AddNewActionModel.stepParams.popupSettings.openView{collectionName,dataSourceKey}` → subModels.page `ChildPageModel(pageSettings.general{displayTitle:false,enableTabs:true})` → `ChildPageTabModel(pageTabSettings.tab.title:'{{t("Add new")}}')` → `BlockGridModel` → `CreateFormModel(stepParams.resourceSettings.init)` → `FormGridModel` → `FormItemModel`（n17-alignment.mts:227-229、f1-view-v2.mts:434-458）
- v1 对照（e1-popup-full-api.json）：`x-action:'create' x-acl-action:'create' x-component:'Action' x-decorator:'ACLActionProvider' x-component-props{openMode:'drawer', component:'CreateRecordAction'}` → properties.drawer `Action.Container` → tabs `Tabs` → tab1 `Tabs.TabPane` → grid `Grid(initializer popup:addNew:addBlock)` → FormBlockProvider(x-use-decorator-props useCreateFormBlockDecoratorProps)

### 第二层：行 view action → drawer/popup
- 通用：`ViewActionModel`（ACTION_BUTTON_USES 白名单 in node-use-sets.ts:54）；kanban 卡片：`KanbanCardViewActionModel`；calendar 事件：`CalendarEventViewActionModel`（stepParams.popupSettings.openView 加 `filterByTk:'{{ctx.record.id}}'`，f1-view-v2.mts:483）
- openView 必填：`{mode:'drawer'|'modal', size, pageModelClass:'ChildPageModel', collectionName, dataSourceKey:'main'}`
- ⚠️ load-only 契约：view action 必须带持久化 page 子树，否则 findOne?subKey=page|grid 204、drawer 空壳（f1-view-v2.mts:569-580）

### 第三层：DetailBlock + 关联子表块
主表详情（f1-view-v2.mts:518-557 原样可抄）：
`ChildPageModel(subKey:'page') → ChildPageTabModel(subKey:'tabs', title:'xx 详情') → BlockGridModel(subKey:'grid') → DetailsBlockModel(subKey:'items', subType:'array', stepParams{resourceSettings.init{dataSourceKey,collectionName}, detailsSettings.layout{layout:'vertical',colon:true}}) → DetailsGridModel(subKey:'grid', props.layout{version:2, rows:[{id, cells:[{id, items:[itemUid]}], sizes:[24]}], rowOrder}) → DetailsItemModel(stepParams{fieldSettings.init{fieldPath}, detailItemSettings.showLabel}) → Display*FieldModel(subKey:'field', props.options?, stepParams.fieldSettings.init)`

关联子表块（订单行/检验项/BOM 行）：
- 无现成"关联子表"专模型——做法 = 在同一 ChildPageTabModel 的 BlockGridModel 里并列第二个块，子表用 `TableBlockModel`（或 GridCardBlockModel），stepParams.resourceSettings.init 指向子集合并在 filter 里绑定父键（v1 等价物 RecordAssociationDetailsBlockInitializer / RecordAssociationBlockInitializer 在 core/client schema-initializer/items/）；数据侧先例：多块共存于一个弹窗已被 n17/f1 的 CreateFormModel+表单链证实，子表过滤参数走 block params.filter
- v1 对照：drawer 内 Grid 直接挂第二个 `TableBlockProvider(x-decorator-props{collection:<子表>, association…})`（供应商.json 的 TableBlockProvider 形状 + x-filter-targets）
- 必填属性速查：块 props/stepParams.resourceSettings.init 必带 {dataSourceKey:'main', collectionName}；字段必带 fieldSettings.init.fieldPath；Display 模型按 interface 选（select 带 props.options）

## 4. ACL / 组织接入点

- 快照 ACL API（全部有先例）：`roles:create/list`、`rolesResources:list/create/update`（usingActionsConfig + actions 白名单收窄）、`users:create`（roles 数组挂角色）、`apiKeys:create`（root 角色 365d，setup-nocobase.mts:387）、`pm:enable`
- 只读守卫模板（w9:139-153）：rolesResources:create {role:{name:'admin'}, name:<collection>, usingActionsConfig:true, actions:[{name:'view'},…{name:'export'}]}；守卫实测模板（h5-wms:3764-3782）：建 b4guard 用户→auth 登录→以受限 token 打 :update 期待 403
- **部门员工：无需自建**。plugin-departments 提供 departments 树 + departmentsUsers + departmentsRoles + users.mainDepartment；set-departments-roles.ts 中间件甚至支持「按部门授角色」（ctx.state.currentUser 注入部门角色）。「审批人按部门路由」数据面已具备：approver_map 现为 role→username/username[]（approval-engine.mts FlowConfig:98），扩展 = approversOfRole 解析时按 users.departments 过滤（users 表部门字段随插件启用即可用）；若确要独立 org_employees（部门专属花名册而非 NocoBase users），接入点 = setup-nocobase.mts 的 collections:create 通道（w1-approval.mts ensureCollections 同款）+ rolesResources 只读/读写挂法同 kpi_snapshots 模板
- 「member」角色：现有脚本无先例（只有 admin/root/b4guard/quality_lead 等用户名）；新建走 roles:create + rolesResources 逐集合授权

## 5. 日历/甘特结论与替代路径

- 任务甘特.json（v1 GanttBlockProvider，fieldNames{id,start:plan_start,end:plan_end,title,range:'day'}）所用插件在快照且 builtIn，**v1 页面继续可用**；但 v2 编程通道缺席（node-use-sets/support-matrix 无 gantt）→ 新建/重建甘特页只能走 v1 uiSchemas（nocobase-hub-modules.mts 的 v1 工厂通道）或：
- 替代路径排序：① calendar 块 v2 完整可用（仅月/时间维度，无条形图）；② 表格按工作中心分组 = TableBlockModel params.sort/filter 组合（弱甘特）；③ **自建 SVG 甘特嵌 JSBlock**——完整先例 h5-wms 库位平面图：flowSurfaces:addBlock type 'jsBlock'，code 用 FlowResource vocabulary（makeResource/setResourceName/refresh/getData）读排产数据、ctx.render 输出 HTML/SVG（可含 tooltip/分区着色）；④ iframe 块 mode:'html'（catalog props url/html/mode）承载独立甘特 HTML
- KPI 图表/对账自建先例：w9-dashboards ChartBlockModel（builder query：measures/aggregation/alias + kpi_code filter；series 每 code 一条）；h4 雷达 visual.mode='custom' 原生 ECharts option；应收应付对账页 = 双余额趋势 chart（W2-B7）

## 6. wfl 六表审批流可视化支撑结论

- 六表现有字段（w1-approval.mts:70-123）：flow_configs{doc_type,title,state_field,is_active,approver_map(JSON),extras(JSON: approved_by_field/approved_at_field/amount_field/amount_threshold/invoice_match_tolerance),config_note}；flow_states{flow_id,state,doc_status_anchor,allow_edit_role,update_field,update_value}；flow_transitions{flow_id,state,action,next_state,allowed_role,condition_expr,allow_self_approval}；approval_records{…from/to_state,attempt_no,node_seq,comment}；approval_todos{user,state,status,due_date}；gate_configs{upstream/downstream 链}
- 流程图渲染：节点=flow_states、边=flow_transitions（含条件/角色标注）、阈值=extras.amount_threshold、审批人=approver_map——一张 JSBlock 读两三个 MultiRecordResource 即可全量渲染（bin-map 先例可复制）；「节点/转移/阈值/审批人表单化编辑直写」= 六表是普通 collection：页面上挂 CreateFormModel/EditFormModel + FormItemModel（或直接表格编辑），REST create/update 直写，approval-engine.mts seedDocFlow 已示范编程写入 + 幂等修复 + config_note 审计
- 结论：数据面、渲染通道（JSBlock/Iframe/Markdown）、编辑通道（form 块 + REST）三者齐备，无缺口；注意保持「单据类型激活互斥」（loadFlow 已断言 rows.length===1）

## 附：关键证据文件索引

| 证据 | 路径:行 |
|---|---|
| v2 块白名单（权威） | platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/node-use-sets.ts:12-104 |
| v2 块支持矩阵 | 同目录 support-matrix.ts:46-273 |
| kanban 拖拽落库 | platform/nocobase/packages/plugins/@nocobase/plugin-kanban/src/client-v2/models/components/KanbanBlock.tsx:462-535 |
| kanban 详情 drawer wire | examples/kb-agent/scripts/nocobase-f1-view-v2.mts:509-559 |
| AddNew v1 弹窗取证 | research/e1-popup-full-api.json；research/n17-addnew-action-dump.json |
| v1 表格+drawer 存档 | research/f-round-inventory/v1-pages/供应商.json:25-120 |
| B8 处置看板 | examples/kb-agent/scripts/nocobase-w8-quality.mts:464,749-761 |
| ACL 守卫先例 | examples/kb-agent/scripts/nocobase-w9-dashboards.mts:139-153；nocobase-h5-wms.mts:3764-3782 |
| 部门插件集合/动作 | platform/nocobase/packages/plugins/@nocobase/plugin-departments/src/server/（plugin.ts:45-75、collections/、middlewares/） |
| wfl 六表建表 | examples/kb-agent/scripts/nocobase-w1-approval.mts:70-123 |
| wfl 引擎读写 | examples/kb-agent/scripts/approval-engine.mts:92-159,516-710 |
| JSBlock 自建图先例 | examples/kb-agent/scripts/nocobase-h5-wms.mts:1363-1422 |
| 插件启用清单 | platform/nocobase/packages/presets/nocobase/package.json:112-179；examples/kb-agent/scripts/setup-nocobase.mts:87-92,632-654 |
