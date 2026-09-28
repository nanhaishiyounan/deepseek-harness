# W4「全平台表单表格完备性」增量能力盘点（03-capability-supplement）

- 盘点时间：2026-09-28；盘点人：W4 块插件能力研究员（project-research 模式，纯读 + :3080 只读探针）
- 对象：platform/nocobase 2.2.6 快照（core/client-v2 flow models + plugin-flow-engine flow-surfaces + plugin-data-visualization/block-markdown/block-iframe client-v2）+ examples/kb-agent/scripts 先例
- 范围声明：W3 已盘点的六表结论（kanban/calendar/gantt/行详情 drawer/iframe/markdown/jsBlock/chart/ACL/departments/wfl，见 research/2026-09-27-w3-usability/02-capability-inventory.md）不在本文重复；本文只做 W4 增量——筛选、列级格式化、统计卡/汇总、表单增强、空状态、菜单通道。
- 线上探针（2026-09-28，:3080/nocobase，只读）：flowModels 全量 7222 中抽样 4000——TableBlockModel 51、FilterActionModel 23、ChartBlockModel 17、CreateFormModel 73、KanbanBlockModel 2；**FilterFormBlockModel / FilterFormItemModel / 非空 filterManager 均为 0**（页面级筛选全缺，动作条 Filter 按钮在用）。flowSurfaces:catalog 对现存表格块回读 blocks 词汇含 filterForm、actions 尾部含 submit/reset/collapse/js（filterForm 动作族）——服务端通道在线可用。

## 1. 筛选能力（表格筛选/搜索）

### 1.1 FilterFormBlockModel 完整 v2 编程契约

| 维度 | 内容 | 源码依据 |
|---|---|---|
| 白名单 | COLLECTION_BLOCK_USES 含 'FilterFormBlockModel' | plugin-flow-engine/src/server/flow-surfaces/node-use-sets.ts:21 |
| 支持矩阵 | key 'filterForm'，formalKey 'filter-form'，ownerPlugin @nocobase/core/client，topLevelAddable/createSupported 均 true | 同目录 support-matrix.ts:142-153 |
| 块级 props | {colon, labelAlign, labelWidth, labelWrap, layout}（FormComponent layoutProps） | core/client-v2/src/flow/models/blocks/filter-form/FilterFormBlockModel.tsx:633-644 |
| createModelOptions | {use:'FilterFormBlockModel', subModels:{grid:{use:'FilterFormGridModel'}}}；actions 子位挂 FilterFormActionGroupModel 族 | FilterFormBlockModel.tsx:685-695,670-677 |
| stepParams | formFilterBlockModelSettings.layout（use 'layout'）；formFilterBlockModelSettings.defaultValues = {value: rules[]}，rule = {targetPath 或 field(uid), value(支持 RunJS/ctx 日期表达式), mode:'default'|'assign'|'override', condition, enable}，挂载即应用并触发首筛 | FilterFormBlockModel.tsx:697-723,497-579,411-416 |
| 字段链 | FilterFormGridModel(subKey items) → FilterFormItemModel(subModels.field = filter 域字段模型) → 字段 use 按 CORE_FIELD_DEFAULT_BINDING_MATRIX.filter 映射（date→DateOnlyFilterFieldModel、datetime→DateTimeTzFilterFieldModel、select/number/input→Select/Number/InputFieldModel） | core-field-default-bindings.ts:79-103；filter-form/fields/date-time/ 目录 |
| 字段 stepParams | filterFormItemSettings.init = {filterField(字段元数据), defaultTargetUid(默认目标块), dataSourceKey?, collectionName?}；filterFormItemSettings.initialValue.defaultValue（legacy，会被迁移清除）；props 镜像 label/showLabel/tooltip/extra(=description) | FilterFormItemModel.tsx:573-575,692-694,587-603；flow-surfaces/service.ts:986-995(FILTER_FORM_ITEM_STEP_PARAM_MIRRORS) |
| 自动行为 | 值变更 300ms 防抖自动触发筛选（autoTriggerFilter，挂了 Submit 按钮则关闭）；回车立即筛选 | FilterFormBlockModel.tsx:246,331-334；FilterFormItemModel.tsx:585,700-705 |

### 1.2 与表格的连接机制（filter targets 在 v2 的表达）

- **不是** v1 的 x-filter-targets；目标是 **BlockGridModel 节点顶层 `filterManager` 数组**：`[{filterId: <FilterFormItemModel uid>, targetId: <TableBlockModel 等 uid>, filterPaths: [字段路径], operator?}]`。序列化/反序列化与脚本建 grid 时的 `filterManager: []` 同一键（core/client-v2/src/flow/models/base/BlockGridModel.tsx:49-54,122-126；先例 nocobase-w1-approval.mts:371）。FilterManager.addFilterConfig/saveConnectFieldsConfig 是读写方（filter-manager/FilterManager.ts:16-25,174-189,209-235）。
- 关联字段目标会自动拼 filterTargetKey（FilterFormGridModel.tsx:400-405）。
- **FilterActionModel 分工**：挂在表格动作条 subKey 'actions' 的「Filter」按钮（Popover + ConditionBuilder 临时条件，不落 filterManager），props {filterValue, defaultFilterValue, ignoreFieldsNames, filterableFieldNames}（actions/FilterActionModel.tsx:21-40）；FilterForm 是页面级持久筛选字段。二者可共存。

### 1.3 服务端高级通道（W4 推荐主通道，kb-agent 脚本从未用过）

| 操作 | REST 形状 | 证据 |
|---|---|---|
| 建筛选块 | POST /api/flowSurfaces:addBlock {values:{target:{uid:gridUid}, type:'filterForm', resourceInit:{dataSourceKey:'main', collectionName}, fields?:[...], fieldsLayout?}} | flow-surfaces.test.ts:7233-7236；chart-write.test.ts:1803；blueprint-contract.test.ts:435-437(applyBlueprint blocks 同形) |
| 加筛选字段 | POST /api/flowSurfaces:addField {values:{target:{uid:filterFormUid}, fieldPath:'status', defaultTargetUid:<tableUid>}} —— 服务端解析并写 filterManager 连接 | flow-surfaces.test.ts:7431-7438；service.ts:26443-26485 |
| 加动作 | POST /api/flowSurfaces:addAction {values:{target:{uid:filterFormUid}, type:'submit'|'reset'|'collapse'|'js'}} | flow-surfaces.test.ts:7238；catalog.ts:3917-3949 |
| 布局 | 省略 fieldsLayout 时自动紧凑布局：1 字段 span24 / 2 字段 12 / ≥3 字段 8，每行 3 个 | flow-surfaces/field-grid-layout.ts:49-50,78 |
| 回读 | POST /api/flowSurfaces:get {target:{uid}} → tree.subModels.grid.subModels.items[].stepParams.filterFormItemSettings | fixtures/filter-form-block-live.canonical.json:6-193 |

### 1.4 列级筛选 / 全局搜索

- **列级筛选：v2 无**。TableColumnModel 的 tableColumnSettings 步骤清单只有 init/title/tooltip/width/aclCheck/quickEdit/model(displayFieldComponent)/sorter/fixed/fieldNames(titleField)，无 filter/filterDropdown 步骤（table/TableColumnModel.tsx:393-596）；线上模型亦无列筛选节点。
- **全局搜索框：无 SearchActionModel**（node-use-sets.ts:52-104 无此名）。等价做法：FilterForm 加 input 字段（operator $includes，回车即筛）或用 FilterActionModel 条件构造器。
- 脚本先例：**无任何脚本建过 FilterFormBlockModel**（grep examples/kb-agent/scripts 全量仅命中 filterManager:[] 空数组）；W3 存档 api-flowModels-flat.json（3700 模型）同样 0 命中。
- 判定：**v2 通道就绪（服务端 addBlock/addField/addAction 全在），列级筛选缺口（以页面级 FilterForm 替代）**。

## 2. 列级渲染格式化（用户核心抱怨）

interface → Display 模型映射权威表：core-field-default-bindings.ts:13-45（select/multipleSelect/radioGroup/checkboxGroup→DisplayEnumFieldModel；number/integer→DisplayNumberFieldModel；date/datetime 族→DisplayDateTimeFieldModel；input 族→DisplayTextFieldModel…）。

| 能力 | v2 props 契约（Display*FieldModel props） | 源码依据 | 脚本先例 / 缺口 |
|---|---|---|---|
| select 彩色标签 | props.options（或 dataSource）= [{value, label, color, icon}]，渲染 `<Tag color icon>`；fieldNames 固定 {label:'label', value:'value', color:'color'}；dataSource 优先于 options；空值渲染 null（详情态 N/A） | fields/DisplayEnumFieldModel.tsx:41-45,65-77,168-174 | 先例丰富：nocobase-n17-alignment.mts:328（color green/default）、nocobase-w3-views.mts:121,141,164（OPS_STATUS 等五套状态色标）、nocobase-n13-rebuild.mts:185-186；字段 enum 兜底 enrichment：nocobase-w3-views.mts:346-359（fields:list → uiSchema.enum） |
| 日期格式 | props {dateOnly, picker, format, dateFormat, showTime, timeFormat}，resolveDisplayDateTimeFormat 推导最终格式；配置步骤 datetimeSettings.dateFormat（use 'dateDisplayFormat'） | fields/DisplayDateTimeFieldModel.tsx:19-41,60-70,75-87 | 先例：w3-views displayModelFor 'date'→DisplayDateTimeFieldModel（默认 YYYY-MM-DD）；显式 format 直写 props 无脚本先例（缺口：W4 首用，props 直写即可） |
| 数字千分位/精度 | props {separator:'0,0.00'|'0.0,00'|'0 0,00'|'0.00', numberStep(小数精度), formatStyle:'normal'|'scientifix', unitConversion, unitConversionType:'*'|'/'}；配置步骤 numberSettings.format（use 'numberFormat'） | fields/DisplayNumberFieldModel.tsx:34-39,140-161,163-178,225-235 | 先例：w3-views.mts:120（DisplayNumberFieldModel 默认）；separator/step 显式传参无先例（W4 首用） |
| 货币符号 | 无专门 currency prop；**addonBefore/addonAfter**（ReactNode 前后缀）是通道——addonBefore:'¥' | DisplayNumberFieldModel.tsx:163-178,187-201 | 缺口：无先例；字符串 addonBefore 经 flowModels:save 可序列化，可行 |
| 关联字段显示模式 | 表格/详情 m2o 显示走 DisplayTitleFieldModel：props.titleField（目标集合字段名）+ fieldNames.label；渲染 Typography.Text，多值逗号连接；overflowMode ellipsis/wrap；clickToOpen 打开行详情 | fields/DisplayTitleFieldModel.tsx:22-77,79-112 | 换绑先例机制：actions/titleField.tsx:76-110（切换即重建 subModels.field + fieldSettings.init{dataSourceKey,collectionName,fieldPath}）；TableColumn 的 fieldNames 步骤同款（TableColumnModel.tsx:574-620） |
| tag/marker 显示模式 | v2 无 v1 mobile 的 mode:'tag'/'marker' 枚举（全库 grep 0 命中）；关联字段=文本（可 clickToOpen），彩色标签只存在于 select 字段 | — | 缺口（弱）：需彩标关联时改用目标集合 select 字段或 JSColumn 自绘 |
| 列宽/固定/排序 | TableColumnModel props {width(50-500), fixed, sorter} | TableColumnModel.tsx:476-521,549-573 | w6-mfg-exec.mts:281-283（列工厂）等广泛在用 |

判定：**v2 通道就绪**（Display props 直写 + 服务端 updateSettings {target, props, stepParams} 统一改写通道，flow-surfaces.test.ts:7245-7268）；tag/marker 关联显示小缺口。

## 3. 统计卡片 / 汇总

| 能力 | 快照有无 | 依据 | 结论/绕行 |
|---|---|---|---|
| 独立 metric/stat 块（v2） | ❌ 无 | support-matrix.ts 全表无 metric/stat（chart 最接近，:214-225）；STATIC_CONTENT_BLOCK_USES 无（node-use-sets.ts:31-37） | v2 缺口 |
| 统计卡（v1） | ✅ antd.statistic | plugin-data-visualization/src/client/chart/antd/statistic.ts:17-19（name 'statistic'，antd Statistic 组件）；CardItem.tsx:46-48 识别 chartType 'antd.statistic'；迁移史 20240921214400-rename-charttype.ts:32-33 | 仅 v1 uiSchemas 通道可建；v2 新页面用不了 |
| ChartBlockModel 图表类型域 | line/bar/barHorizontal/pie/doughnut/scatter/area/funnel | client-v2/flow/models/ChartOptionsBuilder.service.ts:10（ChartTypeKey 联合类型，无 statistic） | v2 builder 模式无统计卡型 |
| 替代① Chart 单值聚合 + custom raw | settings.query {mode:'builder', resource, measures:[{field,aggregation,alias}], dimensions 可省, filter} + settings.visual {mode:'custom', raw: JS 字符串}（raw 内 ctx.data.objects 取数，ECharts option 全开放——graphic/text 可画大数字卡） | 先例：nocobase-w9-dashboards.mts:507-644（query/visual 形状）、476-500（RADAR_RAW custom 模式）、696-700（addBlock {target,type:'chart',settings}）；回读键 stepParams.chartSettings.configure.query（w9:441） | **推荐**：离统计卡只差一个 ~15 行 graphic text raw 模板（w9 已示范 custom 通道与取数）；成本最低 |
| 替代② JSBlock 自绘 | ctx.makeResource('MultiRecordResource')/getData + ctx.render（h5 库位平面图先例改造） | nocobase-h5-wms.mts:1363-1422（W3 已录） | 成本较高（~60 行）：需要布局/样式手写；仅在需要点击交互/多指标组合卡时用 |
| 表格聚合行（列合计 summary/footer） | ⚠️ 半缺口 | TableBlockModel 渲染 summary={model.props.summary}（antd Table summary，ReactNode；TableBlockModel.tsx:1171-1172），但 tableSettings 步骤表（:770-950）无 summary 配置项、无聚合计算逻辑；ReactNode 不可 JSON 序列化 → flowModels:save 不可达 | **缺口**：列合计无编程通道。绕行=块外挂 Chart 单值卡（同 grid 并列）或 JSBlock 读写 resource 自算 |

判定：**统计卡需绕行（Chart custom raw 优先，JSBlock 次之）；表格聚合行缺口**。

## 4. 表单增强可编程性

| 能力 | v2 契约 | 源码依据 | 先例/缺口 |
|---|---|---|---|
| required 必填 | FormItemModel props.required + props.rules.push({required:true, message})（collection 级 joi required 已含时不重复注入） | actions/required.tsx:51-69；formItemSettings.required 步骤（FormItemModel.tsx:424-427） | 编程式 props 直写可行；脚本先例：无显式 required（W4 首用） |
| defaultValue 默认值（字段级） | props.initialValue（nanoid 自动生成、m2o coerce）；UI 入口已迁移禁用但 handler 仍生效（兼容读取） | FormItemModel.tsx:372-418 | 编程式直写 props.initialValue 可行（服务端 catalog 镜像 initialValue） |
| defaultValue（表单级，推荐） | CreateForm/EditForm 的 formModelSettings.assignRules = {value: FieldAssignRuleItem[]}（**委托存储在 grid 子模型 stepParams**）；支持固定值/RunJS/ctx 日期表达式/条件；筛选表单同族键 formFilterBlockModelSettings.defaultValues | FormBlockModel.tsx:44-46(GRID_DELEGATED_STEP_KEYS),707-745；actions/formAssignRules.tsx:114-128(useRawParams)；FilterFormBlockModel.tsx:705-721 | 「新建时状态=草稿、日期=今天」走此通道；无脚本先例（W4 首用） |
| placeholder 占位 | 唯一显式步骤在 PasswordFieldModel（setProps placeholder）；其余字段模型 props.placeholder 直写透传 antd；collection 字段的 x-component-props.placeholder 会经 componentProps 自动注入 | fields/PasswordFieldModel.tsx:33-45；FormItemModel.tsx:101-107 | props 直写可行 |
| description 说明文字 | formItemSettings.description → props.extra（表单项下方灰字）；tooltip → props.tooltip（问号悬浮） | FormItemModel.tsx:343-371 | props 直写可行 |
| 多栏分组表单 | FormGridModel props.layout = {version:2, rows:[{id, cells:[{id, items:[uid], sizes:[12,12]}]}], rowOrder}（GridLayoutV2，与 DetailsGrid 同构）+ rowGap/colGap；sizes 即栏宽（24 栅格） | blocks/form/FormGridModel.tsx:23-29,100-110；Details 链同款 layout 先例 f1-view-v2.mts:518-557（W3 §3） | 两栏 sizes:[12,12] 直接可编程；w1/h4 等脚本已建 FormGrid 链 |
| 字段分组标题 | DividerItemModel（CREATABLE_STANDALONE_FIELD_USES，node-use-sets.ts:48）：props {label, orientation, dashed, color, borderColor}，stepParams markdownItemSetting | fields/DividerItemModel.tsx；flow-surfaces/catalog.ts:1862-1870 | 编程式直插 grid items；无脚本先例（W4 首用） |
| FormStepModel / 折叠分组 | ❌ 无（blocks 目录无 step 模型；FilterFormCollapseActionModel 仅筛选表单行折叠 :80） | blocks/ 目录全览 | 缺口（弱）：多步表单用多 ChildPageTab 或 Divider 分节替代 |
| CreateForm/EditForm 差异 | CreateFormModel scene=new、blockCapabilityActionName='create'、resource.isNewRecord=true；两者 createModelOptions 均 {use, subModels.grid:FormGridModel}；formSettings steps init/refresh | blocks/form/CreateFormModel.tsx:26-55,96-124 | 先例：n17-alignment.mts:227-229、f1-view-v2.mts:434-458 |

判定：**v2 通道就绪**（required/initialValue/assignRules/placeholder/extra/多栏 layout/Divider 全可编程）；FormStep 折叠分组缺口（弱需求，有替代）。

## 5. 空状态与页面说明

| 能力 | 结论 | 依据 |
|---|---|---|
| 块级/页面级空态文案定制 | ❌ 无编程通道。表格空态走 antd Empty 默认；SubTable/PopupSubTable 的 emptyText 分支（含「暂无数据/请选择记录」）硬编码在组件内 | SubTableFieldModel.tsx:250-262；PopupSubTableFieldModel.tsx:296-308；TableBlockModel 无 empty 步骤 |
| 绕行 | 页面说明用 MarkdownBlockModel 静态提示块；或 JSBlock 动态判断（resource 空时渲染引导文案） | — |
| MarkdownBlockModel content | props.content（markdown 字符串）直接渲染；catalog 契约 props ['content','value']，stepParams.markdownBlockSettings 允许路径 editMarkdown.content（STRING_SCHEMA） | plugin-block-markdown/src/client-v2/models/MarkdownBlockModel.tsx:16-26；flow-surfaces/catalog.ts:1358-1374 |
| 先例 | addBlock type 'markdown'（authoring-validation.ts:231-234 词汇表，W3 已录）；content 传法 = flowSurfaces:addBlock settings {content} 或 flowModels:save props.content | W3 §1 行 18；本库 catalog.ts:1368-1374 |

判定：**空状态定制缺口（Markdown/JSBlock 兜底）；Markdown content 通道就绪**。

## 6. 菜单/导航编程通道

| 操作 | 通道 | 先例（文件:行） | 幂等性/风险 |
|---|---|---|---|
| 建分组/页面/tab | REST POST /api/desktopRoutes:create {title, icon, type:'group'|'page'|'flowPage'|'tabs', parentId, sort, schemaUid, tabSchemaName} | nocobase-w1-approval.mts:335-363（group→flowPage→tabs 全链模板）；hub-modules.mts:656-691（v1 page+uiSchemas 挂载） | 先 list 再 create 即幂等；pageSize≥400（e1-pj-v2.mts:274-281 total 校验） |
| 服务端高级通道 | POST /api/flowSurfaces:createMenu {values:{title, icon, type:'group', ...}} / createPage | flow-surfaces.contract.helpers.ts:413-433 | kb-agent 未用过；W4 可选 |
| 重命名 | POST /api/desktopRoutes:update?filterByTk=<id> {title} | nocobase-w2-supplier.mts:240-241（legacy 页重命名 RETIRED 先例） | 可行；回滚同通道 |
| 排序 | update {sort} | nocobase-n13-rebuild.mts:115-117 | 可行 |
| 移动（换组） | update {parentId} | 同 update 通道（w2/f1 的 v1 row 保留 parentId 字段证据 :245-247） | 可行；子 tabs 随页走（parentId 指向 page） |
| 合并分组 | 批量 update 子页 parentId → 目标组 → destroy 空组 | destroy 先例 w1:564-565 | **先迁子页再删组**；desktopRoutes:destroy 级联删 flowModels 树（w3-views.mts:817-826 注释）——勿先删组 |
| 删除 | destroy?filterByTk=；tabs 子行必须先删（否则孤儿，page id 复用会撞 stale tabs） | nocobase-n14-fix.mts:1-9；n17-alignment.mts:617-627 | N14 修复经验固化 |
| 菜单 ACL | create 自动绑全部角色 → destroy 指定 role 的绑定行实现定向可见 | nocobase-w3-approval-visual.mts:13-14,575-577 | admin-only 模板已验证 |
| 现状探针 | 16 组在线（CRM客户5/销售流程5/项目管理6/工单中心2/资产管理3/人事管理4/基础数据1/供应链8/仓储管理14/采购1/协同办公3/采购管理8/生产制造13/销售管理7/质量管理7/经营分析5）；**「采购」(id 388679734198272, 1 子) 与「采购管理」(id 388751205138432, 8 子) 重叠**——合并/重命名需求实锤，children 计数可作迁移对账 | :3080 探针 2026-09-28 | — |

判定：**v2 通道就绪**（增删改排序重命名移动合并全可达，均有先例或同构 update 通道）。

## 附 A：三档判定总表

| # | 能力域 | 判定 | 绕行路径要点 |
|---|---|---|---|
| 1 | 筛选（页面级 FilterForm） | **v2 通道就绪** | flowSurfaces:addBlock 'filterForm' + addField{defaultTargetUid} + addAction submit/reset；连接自动落 BlockGridModel.filterManager |
| 1b | 列级筛选 / 全局搜索框 | **缺口** | FilterForm input 字段（$includes + 回车）替代；FilterActionModel 动作条条件构造器补充 |
| 2 | 列级渲染格式化（彩标/日期/数字/货币/关联名） | **v2 通道就绪** | Display* props 直写（options[].color、format/dateFormat、separator/numberStep、addonBefore、titleField）；updateSettings 统一改写 |
| 3 | 统计卡（v2 无 metric 块） | **需绕行** | 首选 ChartBlockModel 单值聚合 + visual.mode='custom' raw（graphic 大数字，~15 行模板）；次选 JSBlock 自绘（交互复杂时） |
| 3b | 表格聚合行（列合计） | **缺口** | props.summary 是 ReactNode 不可序列化且无配置步骤；绕行=同 grid 并列 Chart 单值卡 |
| 4 | 表单增强（required/默认值/占位/说明/多栏/分节） | **v2 通道就绪** | FormItem props + formModelSettings.assignRules（表单级默认值，存 grid）+ FormGrid layout rows/cells/sizes + DividerItemModel |
| 5 | 块/页面空状态定制 | **缺口** | MarkdownBlockModel 静态提示（props.content）或 JSBlock 动态空态 |
| 6 | 菜单分组增删改/排序/合并 | **v2 通道就绪** | desktopRoutes REST（create/update/destroy）+ create 前 list 对账；合并=先迁子页后删组 |

## 附 B：W4 可直接用的工厂函数清单建议（flow-page-lib 扩展草案）

1. `ensureFilterForm(token, spec: {gridUid, collection, fields: Array<{fieldPath, operator?, defaultTargetUid?}>, submit?: boolean, reset?: boolean}): Promise<string>`
   —— flowSurfaces:addBlock type 'filterForm'（resourceInit {dataSourceKey:'main', collectionName}）→ 逐字段 addField（defaultTargetUid 指向同 grid 的 TableBlock uid）→ 可选 addAction 'submit'/'reset'；存在性判定 = grid 子节点 use==='FilterFormBlockModel' 且 resourceSettings.collectionName 相符。
2. `metricChart(token, spec: {gridUid, title, collection, measure: {field, aggregation: 'count'|'sum'|'avg', alias}, filter?, unitPrefix?: string}): Promise<string>`
   —— addBlock type 'chart'，settings.query {mode:'builder', resource, measures:[measure], 无 dimensions, filter}，settings.visual {mode:'custom', raw: STAT_CARD_RAW}；STAT_CARD_RAW = graphic.text 大数字模板（ctx.data.objects[0][alias] 取值，unitPrefix 拼 ¥/% 等）。
3. `statusColumnOptions(defs: Array<[value, label, color]>): {value,label,color}[]`
   —— 纯函数，统一 w3-views 的 PUR_DOC_STATUS 形状（含 icon 可选第四元）。
4. `numberColumnProps(opts: {separator?: '0,0.00'|'0.00', step?: string, currency?: string}): Record<string, unknown>`
   —— 映射到 DisplayNumberFieldModel props（separator/numberStep/addonBefore:currency）。
5. `dateColumnProps(opts: {format?: string}): {format: string}`
   —— 映射到 DisplayDateTimeFieldModel props（'YYYY-MM-DD' 默认）。
6. `formItemExtras(props: {required?, initialValue?, placeholder?, description?, tooltip?}): {props, rules?}`
   —— 合入现有 column()/formField 工厂的增强参数（required 时附 rules[{required:true,message}]）。
7. `assignFormDefaults(token, formGridUid, rules: Array<{targetPath, value | {kind:'ctxDate', expr} , mode?}>): Promise<void>`
   —— 写 grid stepParams.formModelSettings.assignRules.value（FieldAssignRuleItem[] 形状，targetPath 字段路径、value 支持 'YYYY-MM-DD' ctx 表达式字符串）。
8. `ensureMenuGroupOps`（扩展现有 ensureMenus）：
   - `renameGroup(token, groupId|title, newTitle)`（update title）
   - `movePage(token, pageId, newParentId, sort?)`（update parentId/sort）
   - `mergeGroups(token, fromTitle, intoTitle)`（子页逐个 movePage → destroy from 组；对账 children 计数）
9. `ensureMarkdownHint(token, spec: {gridUid, content, sortIndex?}): Promise<string>`
   —— addBlock type 'markdown' settings {content}；空态引导/页面说明统一走此工厂。
