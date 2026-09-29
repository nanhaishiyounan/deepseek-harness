# PT2 取证：SAP Fiori 设计规范 + 金蝶云星空界面惯例（红字/审批/过滤/主控台）

> 取证日期：2026-09-29 | 深读页面：SAP Fiori 官方规范 9 页 + 金蝶云官方产品手册 8 页 | 用途：NocoBase 制造业全链平台 UIUX 重构的模式清单
>
> 环境备注：DuckDuckGo 主站（duckduckgo.com）在本网络不可达（chrome-error），html/lite 变体均触发人机验证码，按降级策略改用 Bing/百度做发现层，随后全部深读改为官方站点直连。SAP 旧站 experience.sap.com/fiori-design-web/* 现已整体重定向到新站 sap.com/design-system/fiori-design-web/*（规范正文未变，URL 前缀变更）。

---

## SAP Fiori

官方来源：SAP Design System（Fiori for Web 规范，当前版本 v1-151），新站根：https://www.sap.com/design-system/fiori-design-web

### 1. List Report 页模式：dynamic page 三段式结构
布局 = **动态页头**（页面标题/变体 + 页头工具栏全局操作 + 筛选条）+ **内容区**（可选 icon tab bar / 每标签一个表格工具栏 + 表格）+ **页脚工具栏**（消息按钮）。内容区有三种基本布局：simple content（单表）、multiple views（同数据多视图：≤3 个视图用分段按钮、>3 个用下拉）、multiple content（多表格各占一个标签）。
> 原文："The list report page is based on the dynamic page, and is divided into a header area and a content area"；"Use tab navigation if… all views show different states of the same data… allows you to offer different actions on the table toolbar for each view."
- URL: https://www.sap.com/design-system/fiori-design-web/v1-151/page-types/floorplans/list-report-floorplan-sap-fiori-element

### 2. 操作三级放置 + 批量操作惯例
操作分三层：**全局操作**（页头工具栏，影响整页，如 Share/Show Filters）→ **表格操作**（表格工具栏，如 Delete）→ **行内操作**（line item）。批量语义：选择依赖型操作（如 Delete）在无选中时**禁用**而非隐藏；选择无关型操作（如 Add）始终可用；相似操作用菜单按钮归组（如 Release / Release with Conditions）。表格工具栏不提供额外筛选设置，排序/分组/列设置统一走 Settings 按钮打开 P13n 对话框。
> 原文："Disable selection-dependent actions (such as Delete) if no items are selected… Always enable selection-independent actions (such as Add)."
- URL: https://www.sap.com/design-system/fiori-design-web/v1-151/page-types/floorplans/list-report-floorplan-sap-fiori-element

### 3. 列表默认行为：滚动加载 + sticky + 标签计数
响应式表格**必须启用 "scroll to load"**（滚动加载而非分页）；icon tab bar 必须用**纯文本标签**并在每个标签上显示该表项目数（count）；滚动时 icon tab bar、表格工具栏、所有表类型的**列头必须 sticky**；页头随下滚收起、上滚展开（snap on scroll），可 pin 固定——但 grid/analytical/tree table 等桌面型表格场景例外（改为手动 Show/Hide Filters 按钮）。
> 原文："If you are using a responsive table, always enable 'scroll to load' behavior." / "The icon tab bar, table/chart toolbar, and column headers of all table types must be 'sticky'."
- URL: https://www.sap.com/design-system/fiori-design-web/v1-151/page-types/floorplans/list-report-floorplan-sap-fiori-element

### 4. 筛选条 Filter Bar：收起/展开 + Adapt Filters 分工
展开态组成：视图（Views，可选）+ 基础搜索框（可选，占位符而非标签）+ 筛选输入控件（标签在上方，必填加星号）+ Go 按钮（仅手动模式）+ **Adapt Filters 按钮**（括号内显示激活筛选数）。两种更新模式：**live update（推荐，逐字触发）**与 **manual update（Go 按钮触发，仅大数据量/多条件时用）**。收起态只留一行摘要："No filters active / 1 filter active: / n filters active:" + 逗号分隔最多 5 个筛选，超出加省略号。**Adapt Filters 对话框**负责全部筛选器的可见性/顺序/赋值（含未显示在筛选条上的），预置 Basic 组不可移除，Reset 有即时生效警告。响应式：桌面默认展开或收起、**平板默认收起、手机不显示**（走筛选对话框）。
> 原文："In most cases, only a subset of all available filters is visible in the filter bar. Users can control the visibility and order of the filters and assign values to them in the Adapt Filters dialog."
- URL: https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/filter-bar

### 5. 语义色（Morning Horizon 默认主题，含完整色值）
**前景**：Negative `#AA0808`、Critical `#E76500`、Positive `#256F3A`、Neutral `#788FA6`、Informational `#0070F2`。**背景**：Negative `#FFEAF4`、Critical `#FFF8D6`、Positive `#F5FAE5`、Neutral `#EFF1F2`、Informational `#E1F4FF`。辅助令牌：品牌/高亮 `#0070F2`、正文 `#131E29`、副标题/标签 `#556B82`、边框 `#758CA4`、应用背景 `#F5F6F7`；另有 sapIndicationColor_1–10 行业惯例色板（全部可主题化，含义由业务上下文定义）。所有主题满足 WCAG 2.2 AA（正文对比度 ≥4.5:1，大字/图形 ≥3:1）。
> 原文："Semantic colors can be used to represent a negative, critical, positive, neutral, or information status."
- URL: https://www.sap.com/design-system/fiori-design-web/v1-151/foundations/visual/colors/morning-horizon （配色体系总览：…/foundations/visual/colors-overview）

### 6. 状态字段控件：表格内小号 Tag / 对象头部大号 Tag（+语义色）
**Tag** 是状态/类别/KPI 的紧凑呈现控件："Small is the default size, and is often used in tables and lists to indicate a general status. Large is typically used in object headers."——支持语义着色（value states）、图标+文本、图标专用；忌过多文本、忌单字母/数字、忌页面滥用。表格单元格中的状态数据点也可用文本型 ObjectStatus（响应式表格规范明确将 object status 列为 data point 控件之一；旧版独立 ObjectStatus 规范页在新站未迁移，以 Tag + 语义色 + 响应式表格规范共同覆盖）。**状态列对齐方式 = 左对齐**（与文本同类）。
- URL: https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/tag-web-component 、https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/responsive-table

### 7. 表格排版惯例：数字/金额右对齐、空态双文案
对齐三分法：**左对齐** = 文本、ID、电话、URL、密码、邮箱、**状态信息**；**右对齐** = 日期时间（保证多数 locale 可比性）与**数字/金额（ID 除外）**"to ensure figures are comparable"；**居中** = 图标、图片、头像（列名尽量短或留空+读屏文本）。垂直方向尽可能 top 对齐。布尔值用只读复选框+文字。行内按钮紧贴内容、不加单独列、每行最多 2 个、按重要性左→右。空态区分两种：未设筛选 → "To start, set the relevant filters."；筛选无结果 → "No data found. Try adjusting the filter settings."；零项目时移除标题里的 item count。
> 原文："Right-align: Numbers and amounts, except IDs, to ensure figures are comparable."
- URL: https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/responsive-table

### 8. Object Page：动态页头 facets + 锚点/标签导航
动态页头（强制，取代旧 object page header）：面包屑（可选）+ **标题（必须）+ 副标题（可选，位于标题下方）** + header content facets + object marker + 页头工具栏全局操作（Edit/Delete 等）+ 展开指示。**header facets 七种**：Form（一组 label-text ≤5 对）、Plain text（默认宽 320px）、Image（avatar，固定最左）、**Key value（KPI/状态，大字号数值+可选状态图标）**、Micro chart（bullet/column/line/comparison/delta/Harvey ball/radial）、Progress indicator、Rating indicator；facet 左浮动 inline 排布、放不下换行。内容区导航两种：**锚点栏（默认**，水平锚点+子节下拉+溢出菜单，点击滚动到节）与标签导航（不同主题且内容复杂时用，一次显示一节）。
> 原文："The anchor bar is the default navigation control for the object page… Clicking a link makes the screen scroll to the corresponding section while the anchor bar remains visible."
- URL: https://www.sap.com/design-system/fiori-design-web/v1-151/page-types/floorplans/object-page

### 9. 变体管理（Views）= 整页一份
推荐**整页只用一个 variant 管理控件**，保存/恢复的内容覆盖筛选、所选标签、全部表格与图表设置；用户可设默认 variant、可配置"选中即执行"（仅手动更新模式有意义）。无变体需求时显示描述当前视图的静态标题。这对应金蝶"过滤方案"的保存/复用语义（见下节），可互为印证。
> 原文："we recommend using one variant management control for the whole page… save and restore all settings for filters, selected tabs, all tables, and all charts."
- URL: https://www.sap.com/design-system/fiori-design-web/v1-151/page-types/floorplans/list-report-floorplan-sap-fiori-element

---

## 金蝶云星空（官方产品手册）

官方来源：金蝶云产品手册（DokuWiki 标准手册站）https://help.open.kingdee.com/dokuwiki_std/ ；社区/帮助中心 https://vip.kingdee.com 。手册页 URL 形如 `doku.php?id=页面名`。

### 1. 主控台导航：全局功能菜单（按领域/子系统）+ 常用功能收藏
**主控台系统菜单是"全局的功能菜单窗口，方便按领域、子系统查找对应的单据和基础资料"**，入口在【首页】右上角"田"字按钮，按当前用户功能权限（按业务对象授权）显示。首页**常用功能**卡片最多显示 7 个菜单，超出走【更多】；在主控台菜单里光标定位菜单名点【+】添加、在【更多】里点【X】删除。门户管理覆盖：数据中心、组织、搜索、消息、用户 + 全功能菜单（支持自定义显示/隐藏）。菜单收藏带灰色星标（可跨卡片调整归属）。
> 原文："主控台系统菜单是个全局的功能菜单窗口，方便按领域、子系统查找对应的单据和基础资料。" / "最多显示7个菜单；超出7个点击【更多】查看。"
- URL: https://help.open.kingdee.com/dokuwiki_std/doku.php?id=主控台系统菜单 、…?id=主控台常用功能 、…?id=门户管理

### 2. 列表过滤：四页签过滤对话框（过滤/排序/显示隐藏列）+ 过滤方案保存
列表工具栏【过滤】按钮调出过滤界面，包含：**过滤条件**（字段/比较/值/逻辑四列表格；可选组织默认当前组织；过滤字段默认单据头字段可选单据体字段）、**排序**页签（【加入】将字段加入排序列表，上移/下移调序，支持双击添加）、**显示隐藏列**页签（设置列显示/隐藏、**列宽**、显示位置，支持手动输入行数）。**单据状态/关闭状态/作废状态三个筛选字段默认值为"全部"**——单据三态筛选是列表标准配置。方案保存：工具栏【保存】保存过滤方案，支持【下次以该方案字段进入】；报表过滤额外有"快捷设置"（组织维度/日期范围/其他条件）与"分组汇总"页签。列表另有**冻结列**设置、多列表展示（同时展示多个子单据体）。
> 原文："列表过滤界面提供过滤方案、过滤条件、排序方式、显示隐藏列等设置。" / "单据状态（默认值为全部）、关闭状态（默认值为全部）、作废状态（默认值为全部）。"
- URL: https://help.open.kingdee.com/dokuwiki_std/doku.php?id=通用过滤 、…?id=bos通用操作列表

### 3. 单据状态机与操作映射（BOS 通用操作全集）
状态流转：**暂存**（不校验）→ **创建**（保存，含编码唯一/必录/合法性校验）→ **审核中**（提交，先保存再提交进审批流）→ **已审核**（审核）→ **关闭**/**作废**（终态，支持多选批量）；逆向：**反审核**（已审核→重新审核）、**撤销**（审核中→重新审核）。操作可用性绑定状态：删除仅暂存/创建；修改仅暂存/创建/重新审核。另有"状态转换"操作：状态字段自定义业务操作（如冻结、终止），可加在单据头/单据体。
> 原文："提交后状态由'创建'刷新为'审核中'"；"反审核：将已审核的单据/基础资料刷新为重新审核"；"关闭…操作成功后单据的状态由'已审核'刷新为'关闭'"。
- URL: https://help.open.kingdee.com/dokuwiki_std/doku.php?id=bos通用操作列表

### 4. 审批可视化与单据链操作族（上查/下查/下推/选单/流程图）
列表/单据工具栏预置一整族流程操作：**查看流程图、查看审批路线（图）、查看审批结果、待办任务处理、全流程跟踪**（业务全流程跟踪图）、**上查/下查**（按过滤方案查上下游单据）、**下推/选单/联查单据**（单据转换链）。审批处理结果固定三态：**审批同意、驳回重审、终止流程**；审批节点执行**不改变单据状态**，只有终审节点通过后单据才从"审核中"变"已审核"；每条路线有且只有一个终审节点；**驳回不需要在设计图上画专门连线**，运行时由选项决定可选择驳回到的节点；审批模式分**顺签/会签**（会签投票按票数/人数 × 确定/比例四象限控制）。设计器：默认开始/结束节点不可删，拖拽加节点，双击节点/连线/空白分别弹属性窗；发布生成流程版本；消息节点支持"{"智能感应插入流程上下文动态文本（流程信息/单据字段/系统变量/流程变量）。
> 原文："审批节点的执行不改变单据状态，终审节点…审核通过后，单据状态从'审核中'变为'已审核'"；"审批流程若需要驳回，在设计时不需要添加驳回连线，在流程运行时，由选项决定是否可以选择驳回的节点。"
- URL: https://help.open.kingdee.com/dokuwiki_std/doku.php?id=审批流设计 、…?id=bos通用操作列表

### 5. 红字/蓝字单据：工具栏显式红蓝切换 + 报表"负数红字"渲染惯例
单据工具栏预置成对操作：**【红字】"设置单据为红字单据"** 与 **【蓝字】"设置单据为蓝字单据"**——红/蓝字是单据级显式标记（工具栏切换），不是仅靠负号。报表/账表渲染侧：单元格属性对话框提供"**是否负数红字**"开关（负数金额以红色显示），同窗还可设前景色/背景色/对齐方式/数值显示格式/边框——负数红字是金蝶报表的标准单元格属性。冲销惯例：凭证查询界面工具栏"凭证冲销"生成**红字冲销凭证**，摘要系统默认"冲销XX字XX号凭证"；蓝字专票跨月红冲需先申请**红字专票信息表**（审核状态强校验），再创建红字销售发票并与信息表关联。
> 原文："红字：设置单据为红字单据 / 蓝字：设置单据为蓝字单据"；"单元字体可设置字体的格式和大小，单元前景色、背景色、是否负数红字，数据在单元格中的水平、垂直的对齐方式、数值的显示格式"。
- URL: https://help.open.kingdee.com/dokuwiki_std/doku.php?id=bos通用操作列表 、…?id=报表基本操作 、…?id=凭证查询 、…?id=发票管理

### 6. HMI 主控台九宫格（车间触屏终端范式）
车间用户登录后**自动进入该用户对应的 HMI 主控台九宫格**；功能清单在 PC 端【车间管理】→【基础设置】→【HMI界面配置】里绑定 HMI 登录用户 + 增加内置配置项，用**上移/下移调整功能显示顺序**。即：车间终端 = 按用户定制的大按钮九宫格，配置权在 PC 管理端。
> 原文："用户登录后，自动进入该用户对应的HMI主控台九宫格（在PC上车间管理下HMI界面配置设置每个用户所对应的功能列表）。"
- URL: https://help.open.kingdee.com/dokuwiki_std/doku.php?id=主控台

### 7. 主页数字卡片 ↔ 过滤方案直跳
角色主页（如计划员主页）的数字卡片**点击数字直接进入带预设过滤方案的列表**，且卡片可通过主控台编辑改绑其他自定义过滤方案；过滤范围即单据状态组合（如"已审核未关闭"、"创建/审核中/重新审核"）。这是"KPI 卡片 → 列表"的标准联动范式。
> 原文："用户点击数字，可直接进入过滤方案为'待运算'的预测单列表；可通过主控台编辑修改为其他自定义的过滤方案。"
- URL: https://help.open.kingdee.com/dokuwiki_std/doku.php?id=计划员主页

### 8. 列表工具栏操作密度（对照中国 ERP 用户预期）
BOS 通用操作列表预置 100+ 个列表级操作（引出/引入模板、按列表引出所选单据/分录、合并套打/连续套打/分批打印、批量填充/批量修改、附件快传、暂存/刷新、首页常用等），工具栏是**主操作面**；"刷新"= 按当前过滤条件重新取数。对中国制造业用户，密集工具栏 + 过滤对话框 + 右键/双击行习惯是基线预期，与 Fiori 的"表格工具栏收敛 + P13n 设置"路线相反——重构时可取 Fiori 的信息架构 + 保留金蝶式高频操作可发现性。
- URL: https://help.open.kingdee.com/dokuwiki_std/doku.php?id=bos通用操作列表

---

## 用友（U8C/U9C/YonSuite）

**未找到可访问的官方文档证据**：用友帮助中心域名（help.yonyousoa.com 等）在本网络环境 DNS 解析失败；百度搜索触发安全验证码；Bing 中文精确匹配失效无法定位 yonyou.com 帮助文章。按任务书"任选命中证据最多的"原则，本报告以金蝶云星空为中国制造业 ERP 惯例代表（8 页官方手册深读）。建议后续补查：用友 YonSuite 帮助中心（yonyou.com 子域）的"单据列表/审批流/红字冲销"专题，验证其与金蝶在"三态过滤字段（提交/审核中/已审核）+ 红蓝字标记 + 上查下查"上的惯例一致性（业内普遍认为两家在这些基础单据惯例上高度趋同，但本次无 URL 证据，不作断言）。

---

## 对本平台重构的直接映射（简表）

| 平台现状痛点 | Fiori 模式 | 金蝶模式 | 建议 |
|---|---|---|---|
| 列表页信息架构乱 | List Report 三段式 + sticky 工具栏 | 工具栏【过滤】+ 四页签过滤对话框 | 顶部筛选条（收起/展开）+ 表格工具栏（标题+计数+设置）+ scroll-to-load |
| 状态字段呈现不统一 | 语义色 5 态 + 小号 Tag（表格）/大号 Tag（头部） | 单据状态枚举（创建/审核中/已审核/重新审核/关闭/作废） | antd Tag + 语义色映射：positive/critical/negative/neutral/informational |
| 筛选无方案保存 | Variant management 整页一份 + Adapt Filters | 过滤方案保存 +【下次以该方案进入】 | 过滤方案（含默认方案）+ 列设置持久化 |
| 审批不可视 | — | 查看审批路线/流程图/全流程跟踪 + 三态处理结果 | 审批历史时间线 + 流程图 + 同意/驳回重审/终止三动作 |
| 红冲单据无区分 | 负数可用语义色 negative | 【红字】/【蓝字】工具栏标记 + 报表"负数红字" | 单据级红字标记（角标/标签）+ 金额负数红色渲染 |
| 车间终端 | — | HMI 九宫格按用户绑定 | 触屏大按钮九宫格，PC 端配置 |

---

## 访问过的 URL 清单

### SAP Fiori（官方，均提取过正文）
1. https://www.sap.com/design-system （旧 experience.sap.com 重定向落地页）
2. https://www.sap.com/design-system/fiori-design-web/ui-elements （UI 元素索引，v1-151）
3. https://www.sap.com/design-system/fiori-design-web/v1-151/page-types/floorplans/list-report-floorplan-sap-fiori-element
4. https://www.sap.com/design-system/fiori-design-web/v1-151/page-types/floorplans/object-page
5. https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/filter-bar
6. https://www.sap.com/design-system/fiori-design-web/v1-151/foundations/visual/colors-overview
7. https://www.sap.com/design-system/fiori-design-web/v1-151/foundations/visual/colors/morning-horizon
8. https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/responsive-table
9. https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/status-indicator （注：为仪表盘图形控件，非单据状态文本控件）
10. https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/tag-web-component
11. https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/object-status （404——旧 ObjectStatus 规范页未迁移到新站，已用 Tag+语义色+Responsive Table 规范替代覆盖）

### 金蝶云星空（官方产品手册/社区，均提取过正文或搜索摘要）
12. https://vip.kingdee.com/ （金蝶云社区首页）
13. https://vip.kingdee.com/knowledge/atlas （帮助中心知识地图）
14. https://help.open.kingdee.com/dokuwiki_std/doku.php?id=通用过滤
15. https://help.open.kingdee.com/dokuwiki_std/doku.php?do=search&id=红字 （搜索结果页：含发票管理/报表基本操作/凭证查询/bos通用操作列表等条目摘要）
16. https://help.open.kingdee.com/dokuwiki_std/doku.php?id=bos通用操作列表
17. https://help.open.kingdee.com/dokuwiki_std/doku.php?do=search&id=审批流程 （搜索结果页）
18. https://help.open.kingdee.com/dokuwiki_std/doku.php?id=审批流设计
19. https://help.open.kingdee.com/dokuwiki_std/doku.php?do=search&id=主控台 （搜索结果页：含 html5卡片主页/用户/门户管理/计划员主页/单据参数配置等条目摘要）
20. https://help.open.kingdee.com/dokuwiki_std/doku.php?id=主控台
21. https://help.open.kingdee.com/dokuwiki_std/doku.php?id=主控台常用功能
22. https://help.open.kingdee.com/dokuwiki_std/doku.php?id=主控台系统菜单
23. https://help.open.kingdee.com/dokuwiki_std/doku.php?id=报表基本操作

### 搜索引擎/发现层（仅用于发现，未作为证据来源）
- https://www.bing.com/search?q=… （SAP Fiori list report / 金蝶过滤方案 site:，中文精确匹配效果差）
- https://www.baidu.com/s?wd=金蝶云星空 过滤方案的基本操作 （命中 dokuwiki_std 手册站的关键一步；第二次搜索触发验证码）
- https://html.duckduckgo.com/html/ 、https://lite.duckduckgo.com/lite/ （均触发人机验证码，未产出结果）
