# 取证子任务 pt1：Odoo 与 ERPNext/Frappe 的 UI 模式（制造业全链平台 UIUX 重构调研）

> 取证日期：2026-09-29 | 方法：chrome-devtools 实浏览器访问官方文档站 + 官方源码仓库，正文全文提取
> DuckDuckGo（duckduckgo.com / html.duckduckgo.com / lite.duckduckgo.com）在本网络下全部触发人机验证（"Select all squares containing a duck" CAPTCHA），按回退策略改用：官方文档站内导航 + Sphinx 站内搜索 + GitHub 官方仓库 raw 源码。所有结论均来自一手官方来源。

---

## Odoo

### 1. 表单视图骨架：header（状态条+流转按钮）→ sheet（主体）→ chatter（右栏）

官方开发者参考《View architectures》定义了 form 视图的结构组件全集：`group, sheet, notebook, newline, separator, header, footer, Buttons container, Title container`；语义组件为 `field, label, button, Chatter widget, Attachments preview widget`。表单顶部 `<header>` 放状态流转按钮 + statusbar 字段，主体在 `<sheet>` 内，chatter 在 sheet 之外以 `<div class="oe_chatter">` 挂载：

```xml
<header>
  <button string="Reset" type="object" name="set_draft" invisible="state != 'done'"/>
  <field name="state" widget="statusbar" statusbar_visible="draft,posted" options="{'clickable': 1}"/>
</header>
```

原文："Form views are used to display the data from a single record. They are composed of regular HTML with additional semantic and structural components." 状态按钮用 `invisible="state != 'done'"` 这类 Python 表达式按当前状态显隐——按钮即流转（草稿→确认按钮只在草稿态出现，确认后出现 Reset 等）。
- 来源：https://www.odoo.com/documentation/18.0/developer/reference/user_interface/view_architectures.html

### 2. statusbar 控件（顶部状态条）

state 字段渲染为 `widget="statusbar"`：`statusbar_visible="draft,posted"` 控制显示哪些状态节点，`options="{'clickable': 1}"` 允许点击状态直接跳转；`<footer>` 用于对话框按钮（Save/Discard + `replace="0"` 追加模式）。字段级 widget 机制："The widget used to represent the field. The selected widget can change the way the field is rendered and/or the way it can be edited."
- 来源：https://www.odoo.com/documentation/18.0/developer/reference/user_interface/view_architectures.html

### 3. Ribbon 斜幅（Lost/Cancelled 视觉封印）

CRM 文档对 Lost 商机的描述（18.0 用户文档）："After clicking Mark as Lost, a red Lost banner is added to the upper-right corner of the opportunity."，恢复时 "click Restore in the upper-left corner. Doing so removes the red Lost banner from the opportunity form"。即：表单右上角红色斜幅 = 终态/异常态的永久可见标记；Lost 动作弹窗含 Lost Reason 下拉（可即时 Create 新原因）+ Closing Note，均非必填但推荐（traceability）。
- 来源：https://www.odoo.com/documentation/18.0/applications/sales/crm/pipeline/lost_opportunities.html
- 注：ribbon 的 XML 写法（`<widget name="web_ribbon" title="Archived"/>`）在 18.0 文档页未收录，此为源码层用法（odoo/addons/web ）；本条以用户文档的行为描述为准。

### 4. Chatter 聊天侧栏（消息/关注/活动计划）

官方定义："It is added with a div element with the class oe_chatter when the model inherits the mail.thread mixin"，结构为：

```xml
<div class="oe_chatter">
  <field name="message_follower_ids"/>
  <field name="activity_ids"/>
  <field name="message_ids" options="OPTIONS"/>
</div>
```

另有 `<div class="o_attachment_preview"/>` 附件预览 widget。活动（Activities）从 chatter 顶部按钮调度，弹窗字段为 Activity Type（Email/Call/Meeting/To-Do + 按安装应用扩展）/Summary/Due Date/Assigned to/Notes，按钮含 Schedule / Schedule & Mark as Done / Done & Schedule Next / Open Calendar；计划的活动进 chatter 的 **Planned Activities** 区，完成的进 **Today** 区。
- 来源：https://www.odoo.com/documentation/18.0/developer/reference/user_interface/view_architectures.html 、https://www.odoo.com/documentation/18.0/applications/essentials/activities.html

### 5. 列表视图：密度、可选列、批量动作、导出、分页、行内聚合

- 默认分页 `limit`：**80 行/页（列表）、40（表单内 x2m 子列表）**；分组时 `groups_limit` 同值。
- 就地编辑：`editable="top|bottom"`（新记录从顶/底插入），`multi_edit` 多选同字段批量改值；`export_xlsx` 开关导出。
- 行装饰：`decoration-<style>` 作用于整行/单元格，style 枚举 = `bf, it, info, warning, danger, muted, primary, success`，例 `<list decoration-danger="field_qty > field_limit">`；字段上 `<field name="quantity" decoration-info="state == 'draft'"/>`。
- 列底聚合：`<field name="sent" sum="Total"/>` / `avg="Average"`（仅对当前已加载记录计算）。
- 可选列：列表视图右上 `(settings adjust)` 图标显隐列（Activities 列即此法显示）。
- 批量动作：勾选行左侧复选框 → 顶部 **Actions 下拉** → 如 Unarchive。
- 根元素为 `list`（旧名 `tree`）；`default_order="sequence,name desc"`。
- 来源：https://www.odoo.com/documentation/18.0/developer/reference/user_interface/view_architectures.html 、https://www.odoo.com/documentation/18.0/applications/essentials/activities.html 、https://www.odoo.com/documentation/18.0/applications/sales/crm/pipeline/lost_opportunities.html

### 6. 搜索/过滤/分组面板（列表上方的全局搜索栏）

搜索栏位于视图顶部，下拉菜单为 **Filters / Group By / Favorites 三列**（"the Filter, Group By, and Favorites drop-down menus"）。关键行为：

- **预配置过滤器按横线分组，组内有语义**："Selecting preconfigured filters from the same group allows records to match any of the applied conditions. However, selecting filters from different groups requires records to match all of the applied conditions."（同组 OR、跨组 AND）。
- **自定义过滤器**：Match all/any of the following rules + 规则三段式（字段→操作符→值），`(plus)` 加规则、`(node)` 加嵌套规则组（子组可独立 any/all）、`(delete)` 删节点；含 Include archived records 开关；开发者模式可见字段技术名与 domain 代码。
- **分组可多级嵌套**："Several groups can be used at the same time. The first group that is selected is the main cluster, the next one that is added further divides the main group's categories"。
- **Favorites**：可把当前搜索存为收藏并设为视图默认过滤器（"or as the new default filter for the view"）。
- 报表类搜索栏另有 **Comparison**（Previous Period / Previous Year）区。
- 来源：https://www.odoo.com/documentation/18.0/applications/essentials/search.html

### 7. 看板视图（含制造单/车间场景）

官方定义："Kanban views are used as a kanban board visualisation: they display records as 'cards', halfway between a list and a form view. Records may be grouped in columns for use in workflow visualisation or manipulation (e.g., tasks or work-progress management)"；**最多加载显示 10 列**，之后列折叠可手动展开。列即 Stages：

- 列配置在 Configuration ‣ Stages，列表内拖把手排序、看板内直接拖列排序。
- **列顶进度条**："The progress bar is visible above each stage, displaying the percentage breakdown of every status type for all the cards within that stage. Each status type has an assigned color"；hover 色段显数量 tooltip；**点击色段即过滤该列**只显示该状态卡片。
- **折叠列（fold）**："Folded in Kanban" 复选框，Won/Closed 阶段默认折叠；"The name of the folded stages are still visible, but the cards in the stage are hidden"；卡片进入折叠列=关闭。临时折叠：列顶 `(gear)` → Fold。

制造/车间场景（Shop Floor 模块，18.0）：All MO 页 = 主仪表板，**信息卡片流**而非表格。卡片头=MO号+产品+数量+状态（Confirmed → In Progress → To Close）；卡主体=已完成工单**灰色+删除线**、当前工单为跳转按钮、Register Production 行（登记批次/序列号 + # Units 一键记产）；卡脚=Close Production（有整单质检时变 Quality Checks 按钮）；齿轮菜单=Scrap / Add Work Order / Add Component / Open Manufacturing Order / Log Note；关闭时卡片渐隐+Undo。左侧**操作员面板**（员工签到，可开关）；搜索过滤器**跨视图切换保持**；可作 PWA 安装到工位浏览器锁定用途。MO 表单上有 Shop Floor **smart button** 直达。
- 来源：https://www.odoo.com/documentation/18.0/developer/reference/user_interface/view_architectures.html 、https://www.odoo.com/documentation/18.0/applications/essentials/stages.html 、https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/shop_floor/shop_floor_overview.html

### 8. 状态色约定与导航 IA

- **全系统一致的活动色语义**（官方明文）："Activities that appear green have a due date in the future, activities that appear orange are due today, while activities appearing red are overdue. Activity colors, and their relation to an activity's due date, are consistent throughout Odoo, regardless of the activity type, or the view." —— 绿=未来/健康、橙=今天/注意、红=逾期/异常。
- 行/列装饰色枚举：`info, warning, danger, muted, primary, success, bf, it`（语义同 Bootstrap）。
- 顶部菜单栏右上 `(clock)` 图标 = 全局活动汇总，红气泡显示数量，按应用分组再按 Late/Today/Future 细分；表单自动保存（"The form automatically saves"，Save Manually 为云图标）。
- 导航 IA：应用切换器 + 应用内子菜单（文档通篇以 `CRM app ‣ Sales ‣ My Pipeline`、`Settings app ‣ General Settings ‣ Developer Tools`、`Home > Manufacturing > Production > Work Order`（此为 ERPNext 记法，见下）路径记法呈现两层 IA）；启用 Leads 后 "This adds a new Leads menu to the header menu bar at the top of the page"（顶部菜单栏动态扩展）。
- 面包屑：由 action 栈形成——Window/Client Actions 的 `target` 属性文档："Use main instead of current to clear the breadcrumbs. Defaults to current."（`current` 保留面包屑、`main` 清空、`new` 弹窗）。
- **未找到官方文档证据的项**：Odoo 18.0 用户文档中没有专门的「全局搜索/导航总览」页面（17.0 的 navigate 页已随文档重构移除）；全局搜索栏行为以 essentials/search.html 的搜索栏描述为准。
- 来源：https://www.odoo.com/documentation/18.0/applications/essentials/activities.html 、https://www.odoo.com/documentation/18.0/developer/reference/backend/actions.html 、https://www.odoo.com/documentation/18.0/applications/sales/crm/pipeline/lost_opportunities.html

---

## ERPNext / Frappe

### 1. Desk 骨架：常驻模块侧栏 → Workspace；Awesomebar 全局搜索

官方框架文档（docs.frappe.io）："When you login, you're presented with the Desk, it features a persistent sidebar with some standard items based on app modules. Each sidebar item links to a page called Workspace." 全局搜索/命令栏 Awesomebar："helps you to navigate anywhere in the system, create new records, search in documents and even perform math operations."（导航+建单+搜索+计算器四合一）。暗色主题一等公民：右上头像 → Toggle Theme → "Timeless Night"（快捷键 Ctrl+Shift+G）。
- 来源：https://docs.frappe.io/framework/user/en/desk

### 2. 列表视图：过滤器、保存方案（List Filter = 过滤器+列+排序的布局）、排序、分页

- Desk 生成规则："Frappe Framework comes with a rich admin interface called the Desk. It reads meta-data from DocTypes and automatically builds list views, form views, report views, etc."；列表特性清单官方原文："Filters / Sorting / Paging / Filter by tags / Switch view to Report, Calendar, Gantt, Kanban, etc."（列表页内置视图切换器）。
- **保存过滤方案（v16 源码级证据）**：列表的「Saved layout dropdown」把 filters+columns+sort_field+sort_order+route_signature 整体存为 **List Filter** DocType；`for_user=""` 为全局方案（仅 System Manager/Administrator 可建），`for_user=当前用户` 为个人方案；get_list_filters 拉取 "global and user-specific layouts"，支持 create/update/delete_layout_from_dialog。即：**一个方案 = 过滤条件 + 可见列 + 排序的完整布局**，而非仅过滤条件。
- 默认排序定制：Customize Form（Home > Customization > Form Customization > Customize Form）→ 选 DocType → **Sort Field + Sort Order（Asc/Desc）**。
- 源码细节：`count_upper_bound = 1001`（计数上限）、`is_large_table` 时刷新 debounce 15s（否则 2s）、`setup_column_resize()`（列宽拖拽）。
- 来源：https://docs.frappe.io/framework/user/en/desk 、https://raw.githubusercontent.com/frappe/frappe/develop/frappe/public/js/frappe/list/list_view.js 、https://raw.githubusercontent.com/frappe/frappe/develop/frappe/public/js/frappe/list/list_filter/list_filter.js 、https://raw.githubusercontent.com/frappe/frappe/develop/frappe/public/js/frappe/list/list_filter/list_filter_api.js 、https://docs.frappe.io/erpnext/customizing-sorting-order-in-the-list-view

### 3. 表单视图：侧栏（指派/共享/附件/标签）+ 底部时间线

官方："A document can be assigned to or shared with other users and it can have arbitrary attachments and tags, all of which can be seen in the form sidebar." 时间线（评论区）："When you scroll down to the bottom of the form, you will see the form timeline. The form timeline shows emails, comments, edits and other events in a reverse chronological order."（邮件/评论/编辑/事件统一逆时序流）。子表（Grid View）内：行尾铅笔图标打开整行编辑器（"open its full row editor...fields that are not visible as table columns"）；**行内库存点**："The dot before an Item Code shows stock availability at a glance: green means the Item is in stock, while red means it is out of stock."
- 来源：https://docs.frappe.io/framework/user/en/desk 、https://docs.frappe.io/erpnext/sales-order

### 4. Linked Documents（Connections 连接区）

框架文档（Actions and Links 页）原文："A standard navigation aid to the DocType view is the Connections section on the dashboard. This helps the viewer identify at a glance which document types are connected to this DocType and can quickly create new related documents."（表单 dashboard 区的 Connections：一眼看清上下游单据类型 + 计数 + 快速新建）。配置即代码：`<doctype>_dashboard.py` 的 `get_data()`，以 Sales Invoice 为例：

```python
"transactions": [
    {"label": _("Payment"),  "items": ["Payment Entry", "Payment Request", "Journal Entry", ...]},
    {"label": _("Reference"),"items": ["Timesheet", "Delivery Note", "Sales Order"]},
    {"label": _("Returns"),  "items": ["Sales Invoice"]},
    ...
],
"internal_links": {"Sales Order": ["items", "sales_order"]},
"non_standard_fieldnames": {"Delivery Note": "against_sales_invoice", ...},
```

即 Connections **按业务组（Payment/Reference/Returns/Subscription/Internal Transfers）分组**列出关联单据；`internal_links` 支持子表内链；`non_standard_fieldnames` 处理非标准外键。订单链全景（ERPNext 文档）："The standard order-to-cash flow is Quotation → Sales Order → Delivery Note → Sales Invoice → Payment Entry." Work Order 文档同样提到 "click on the plus sign next to Job Card on the Work Order dashboard"（dashboard 区可直接加建下游单据）。Actions 则是 DocType 视图上的按钮（Server Action / Route 两类）。
- 来源：https://docs.frappe.io/framework/user/en/basics/doctypes/actions-and-links 、https://docs.frappe.io/erpnext/sales-order 、https://docs.frappe.io/erpnext/work-order

### 5. Workflow 状态徽章与颜色映射

ERPNext Workflows 文档："The Workflow States can have different colors according to the state. Eg: Green for success."（Workflow State 主数据可为每个状态配色）。核心机制：

- 文档状态数值语义："Document statuses: Saved = 0, Submitted = 1, Cancelled = 2"；无自定义 workflow 时子mittable单据默认流 "Draft - Submitted - Cancelled"。
- Workflow 会接管按钮："Creating a Workflow in ERPNext essentially overrides the regular Save and Submit workflow... there might be no Submit button/option if you have not specified it in the Workflow"。
- 列表呈现："Don't Override Status: This Workflow's status will not override the status of the document in the list view"——默认 workflow 状态直接作为列表/表单的状态徽章。
- 多级审批样例：Draft → Approval Pending By Sales Manager → Approval Pending By Regional Manager → Approved/Rejected（按角色给 Approve/Reject 按钮）；Transition 可挂条件表达式（`doc.grand_total <= 100000`；v13 起支持 `frappe.db.get_value`/`frappe.session`/日期函数）。
- 状态字段：Update Field + Update Value 把状态写入指定字段（不填则自动建 'Workflow State Field' 自定义字段）。
- 来源：https://docs.frappe.io/erpnext/workflows

### 6. 业务单据状态模型（以 Sales Order 为例）

SO 状态为**复合计算状态**：Draft / To Deliver and Bill / To Deliver / To Bill / Completed / On Hold / Closed / Cancelled，另有独立过滤维度 "Use the separate Delivery Status, Billing Status, and Advance Payment Status filters for a more precise view"；ERPNext 自动更新 delivered/billed 百分比。提交后操作动词集：Update Items / Status > Hold / Resume / Close / Amend（取消后修订，生成链接新草稿）/ Cancel。下游创建走 **Create 菜单（条件化）**："From Create, ERPNext v17 can offer documents such as: Pick List... Delivery Note... Sales Invoice... Material Request or Purchase Order... Work Order, Production Plan, or Request for Raw Materials for manufacturing"。
- 来源：https://docs.frappe.io/erpnext/sales-order

### 7. 视图家族：Calendar / Gantt / Kanban / Report Builder / Tree（+状态色 style_map）

官方（框架 Desk 文档）：

- **Calendar**：需 start/end 日期字段，配置文件 `{doctype}_calendar.js` 的 `field_map`（start/end/id/allDay/title/status/color）+ **`style_map` 状态→颜色语义**：`style_map: { Public: 'success', Private: 'info' }`（复用 Bootstrap 语义色）。
- **Gantt**："Gantt view uses the same configuration file as calendar, so every DocType that has a Calendar view has a Gantt view too."（甘特与日历同源配置，可 `gantt: {...}` 覆盖如 order_by）。适用排产/项目。
- **Kanban**："Kanban view can be created for any DocType that has a Select field with options. These options become the column names for the Kanban Board."（**列 = Select 字段的选项**，任意单据皆可看板化）。
- **Report Builder**：选列/过滤/排序后 "save this configuration by giving your report a name"；支持子表数据展示与按子记录过滤、Group By + Count/Sum/Average 聚合。
- **Tree View**：Nested set 模型的树形（如客户区域、物料分组）。
- **Grid View**：表单内多行子表，"User can configure the columns of the grid view from the form."
- 来源：https://docs.frappe.io/framework/user/en/desk

### 8. 制造场景：Work Order / Plant Floor / Production Plan Visualizer

- **Work Order**（路径记法 `Home > Manufacturing > Production > Work Order` = 模块 > 功能组 > 单据的三层 IA）：四仓库语义（Source / Work-in-Progress / Target / Scrap Warehouse）；Required Items 表列 Required / Transferred / Consumed Quantity，保存后显示 Available Qty at Source/WIP Warehouse；Operations 表每行状态 Pending / Work In Progress / Completed（随 Job Card 更新）+ 计划/实际工时与成本对照；提交后 Start（生成 Job Card + 物料转移 Stock Entry）→ Finish（成品入库）动词驱动。
- **Plant Floor**："used to visualize the status of machines and workstations within the corresponding plant floor. This feature provides visual interface for processing job cards."——工作站可配 active/inactive 插图，车间布局可视化 + 库存可视化。
- **Production Plan Visualizer**（只读排产总览）：一屏回答 "How much of the plan has been produced / Whether the raw materials are available or something still needs to be ordered / Which Work Orders and Purchase Orders exist and which ones have not been created yet / **When each job is scheduled on the shop floor**"；官方强调 "Nothing on this screen changes your data. It is a read-only view"；入口：Production Plan → 右上 View 菜单 → Plan Visualizer。
- 来源：https://docs.frappe.io/erpnext/work-order 、https://docs.frappe.io/erpnext/plant-floor 、https://docs.frappe.io/erpnext/production-plan-visualizer

---

## 两家对照速览（供主任务综合）

| 维度 | Odoo 18 | ERPNext v15–v17 / Frappe |
|---|---|---|
| 全局导航 | Apps 切换器 + 应用内子菜单 + action 面包屑 | 常驻模块侧栏 → Workspace + Awesomebar 命令栏 |
| 表单骨架 | header(statusbar+按钮) + sheet + oe_chatter 右栏 | 标题区 + 字段区 + 侧栏(assign/share/附件/标签) + 底部 timeline |
| 状态条 | statusbar widget（节点可点击） | 状态徽章（workflow 配色 / Doc Status 0/1/2） |
| 异常态封印 | 右上角红 ribbon（Lost/Archived） | 状态徽章色（Green for success 等） |
| 列表 | 80/页、勾选→Actions 批量菜单、export_xlsx、decoration-*、列底 sum/avg | Filters/Sorting/Paging/标签、List Filter 保存「过滤+列+排序」布局（全局/个人） |
| 过滤器保存 | Favorites（可设为默认） | List Filter DocType（v16 起为 Saved layout 下拉） |
| 看板 | 列=Stages、列顶状态色进度条（点击过滤列）、折叠列、≤10 列 | 列=Select 字段选项，任意 DocType 可看板化 |
| 上下游链接 | chatter + smart button | Connections 区按业务组分组（Payment/Reference/Returns…）+ 计数 + 快捷创建 |
| 消息/协作 | chatter（消息/关注/活动计划） | form timeline（邮件/评论/编辑逆时序） |
| 排产视图 | Gantt 视图（scheduling）+ Shop Floor 卡片终端 | Gantt（与 Calendar 同源配置）+ Production Plan Visualizer 只读总览 + Plant Floor |
| 状态色语义 | 绿=未来、橙=今天、红=逾期（全系统一致）；decoration: info/warning/danger/muted/primary/success/bf/it | Workflow State 自配颜色；style_map: success/info（Bootstrap 语义） |

## 访问过的 URL 清单

以下为本任务实际导航并提取过正文的全部 URL（均经 chrome-devtools 实浏览器访问）：

1. https://duckduckgo.com/?q=odoo+documentation+form+view+statusbar+chatter&ia=web （连接超时，CAPTCHA）
2. https://html.duckduckgo.com/html/?q=odoo+form+view+statusbar+chatter+documentation （可达但触发鸭子 CAPTCHA）
3. https://lite.duckduckgo.com/lite/?q=odoo+form+view+statusbar+chatter+documentation （同样 CAPTCHA）
4. https://www.bing.com/search?q=odoo+documentation+form+view+statusbar+chatter&count=15 （泛化结果，未采用）
5. https://www.bing.com/search?q=site%3Aodoo.com+documentation+statusbar+view+attributes&count=15 （site: 被忽略，未采用）
6. https://www.odoo.com/documentation/18.0/developer/reference/user_interface/view.html （404，用于确认路径变化）
7. https://www.odoo.com/documentation/18.0/ （文档根目录，确认 18.0 结构）
8. https://www.odoo.com/documentation/18.0/developer.html （developer 目录）
9. https://www.odoo.com/documentation/18.0/developer/reference/user_interface/view_architectures.html ✅ 深读
10. https://www.odoo.com/documentation/18.0/applications/sales/crm/pipeline/lost_opportunities.html ✅ 深读
11. https://www.odoo.com/documentation/18.0/applications/essentials/search.html ✅ 深读
12. https://www.odoo.com/documentation/18.0/applications/essentials/activities.html ✅ 深读
13. https://www.odoo.com/documentation/18.0/applications/essentials/stages.html ✅ 深读
14. https://www.odoo.com/documentation/17.0/applications/general/navigate.html （404）
15. https://www.bing.com/search?q=%22odoo%22+documentation+%22breadcrumb%22+breadcrumbs+menu+apps+site%3Aodoo.com （未采用）
16. https://www.odoo.com/documentation/18.0/search.html?q=breadcrumb&check_keywords=yes&area=default （Sphinx 站内搜索）
17. https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing.html ✅ 深读（目录）
18. https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/manage_orders.html （404，链接勘误）
19. https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/shop_floor/shop_floor_overview.html ✅ 深读
20. https://www.odoo.com/documentation/18.0/developer/reference/backend/actions.html?highlight=breadcrumb ✅ 深读（面包屑段落）
21. https://docs.frappe.io/framework/user/manual/en/list-view （404）
22. https://www.bing.com/search?q=frappe+framework+%22list+view%22+documentation+filters+saved+filter （语义漂移，未采用）
23. https://frappeframework.com/docs/v15/user/manual/en/list-view （重定向 404）
24. https://docs.frappe.io/framework/user/en/manual/list-view （404）
25. https://docs.frappe.io/framework/user ✅ 深读（目录）
26. https://docs.frappe.io/framework/user/en/basics/doctypes/form_&_view_settings ✅ 深读（较薄）
27. https://frappeframework.com/docs/v14/user/manual/en/list-view （重定向 404）
28. https://api.github.com/repos/frappe/frappe_docs/contents/ 、https://api.github.com/repos/frappe/frappe_docs 、https://api.github.com/repos/frappe/frappe_docs/git/trees/develop?recursive=1 、https://api.github.com/repos/frappe/frappe_docs/git/trees/master?recursive=1 （确认仓库已归档 deprecated）
29. https://docs.erpnext.com/ （重定向至 docs.frappe.io/erpnext/introduction，全目录快照）
30. https://docs.frappe.io/erpnext/workflow ✅ 深读（索引页）
31. https://docs.frappe.io/erpnext/workflows ✅ 深读
32. https://docs.frappe.io/erpnext/sales-order ✅ 深读
33. https://docs.frappe.io/erpnext/work-order ✅ 深读
34. https://docs.frappe.io/erpnext/plant-floor ✅ 深读
35. https://docs.frappe.io/erpnext/production-plan-visualizer ✅ 深读
36. https://docs.frappe.io/framework/user/en/basics/doctypes/actions-and-links ✅ 深读
37. https://docs.frappe.io/framework/user/en/desk ✅ 深读（含 Calendar/Gantt/Kanban/style_map）
38. https://docs.frappe.io/erpnext/customizing-sorting-order-in-the-list-view ✅ 深读
39. https://raw.githubusercontent.com/frappe/frappe/develop/frappe/public/js/frappe/list/list_view.js ✅ 深读（源码）
40. https://raw.githubusercontent.com/frappe/frappe/develop/frappe/public/js/frappe/list/list_filter/list_filter.js ✅ 深读（源码）
41. https://raw.githubusercontent.com/frappe/frappe/develop/frappe/public/js/frappe/list/list_filter/list_filter_api.js ✅ 深读（源码）
