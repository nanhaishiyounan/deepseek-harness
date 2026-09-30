# kb-agent 快速上手

面向使用者的中文实操指南：每条命令都可在仓库根目录逐字复制执行（Node 22.19.0 实测验证）。能力细节见 [README.zh.md](README.zh.md)，生产部署见 [DEPLOY.zh.md](DEPLOY.zh.md)，运营站对接见 [WEBSITE.zh.md](WEBSITE.zh.md)。

## 这是什么

kb-agent 是一个食品产业知识库 agent：把走访食品企业得到的纪要、企业档案、法规标准等资料入库，然后向它提问，回答带 `[n]` 编号引用（文档名 + 标题路径），可回溯到原文。对话与向量化由 MiniMax-M3 / embo-01 驱动，知识库是本地一个 SQLite 文件（`workspace/kb.sqlite`），数据不出本机。检索带相关性阈值 `minRelevanceScore`（组合实配 `0.015`——2026-09-02 校准：保住全部单路金标命中、修剪 60 名外的融合噪声；设 0 可退回全量返回），乱码查询因此落到零结果空态，部署侧在 `cordis.patch.yml` 调整（权衡见 [DEPLOY.zh.md](DEPLOY.zh.md)）。PC 工作台首屏为经营概览，图谱页是可编辑的 KG 工作台（本体树/变更流/审核队列），另有移动端入口与 AI 填表助手（见对应节）。

## 一次性准备

```sh
# 1. Node 22.19.0（nvm；其他版本会在启动时报 node:sqlite 等内置模块缺失）
nvm use 22.19.0

# 2. 安装依赖（pnpm workspaces）
pnpm install

# 3. 在仓库根目录创建 .env（已配置过的跳过）；key 于 MiniMax 开放平台申请：https://platform.minimaxi.com/
echo 'MINIMAX_API_KEY=sk-xxx' >> .env

# 4. 连接器投递目录无需手动创建：组合挂载的 connector-file 提供程序首次启动自动建目录，且仓库自带三个 sample-*.csv/.md/.json 示例资产（examples/kb-agent/workspace/data/connector-files/，随 clone 即有）
```

`MINIMAX_API_KEY` 同时服务对话（MiniMax-M3）与向量化（embo-01）；可选 `MINIMAX_BASE_URL=https://api.minimaxi.com/v1`（默认值即此）。没有 key 时入库/检索/统计仍可完整运行（纯文本检索），对话请求会以 `MISSING_CREDENTIAL` 失败。`pnpm dsh` 从源码经 tsx 启动，无需先 `pnpm run build`；唯一例外是网页版的浏览器面产物（见下文「网页版工作台」的产物契约）。

## 5 分钟跑通

以下三条命令按顺序在仓库根目录执行。`DSH_HOME` 把会话与知识库都钉在 `examples/kb-agent/` 内，不污染主目录。

**第一步：入库示例语料**（六篇脱敏文档：会议纪要、企业档案、法规摘录）：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "用 kb_ingest 逐篇入库这六篇文档：examples/kb-agent/workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md 与 examples/kb-agent/workspace/data/meetings/2026-08-27-project-kickoff.md（doc_kind 取 meeting）、examples/kb-agent/workspace/data/profiles/hongfa-food.md 与 examples/kb-agent/workspace/data/profiles/lvyuan-ingredients.md（doc_kind 取 profile）、examples/kb-agent/workspace/data/regulations/gb2760-excerpt.md 与 examples/kb-agent/workspace/data/regulations/gb14881-excerpt.md（doc_kind 取 regulation），完成后用 kb_stats 报告覆盖情况"
```

预期输出报出 6 文档 / 38 chunks、全部已嵌入、检索模式 hybrid。

**第二步：提一个问题**：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "调味品企业的食品添加剂合规要点是什么？"
```

预期回答以 `[n]` 引用文档名与标题路径（GB 2760 摘录、走访纪要、企业档案），文末列出引用清单。

**第三步：查看用量**：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "用 kb_stats 报告知识库用量"
```

预期报出租户 `demo-food-co`、文档数、分块数、累计搜索/入库/嵌入计数。

## 导入我自己的资料

**上传本地文件（推荐，随时随地）**：打开 Web 工作台的「知识库」页签 → 文档区「添加文档」→「上传本地文件」，选择本机的 .md / .txt / .pdf / .docx 文件（可多选，单文件最大 64 MiB），选完即自动入库——每份文件一行进度，成功显示入库片段数；同名文件再次上传会替换旧文档（与 `kb_ingest` 同路径幂等语义一致），完成时的提示条会明确标注「已替换同名文档」。上传的文件会落在服务器工作区 `workspace/data/uploads/` 下，引用身份即文件名。浏览器能打开工作台就能上传，不需要在服务器上预先放置文件。

**网页**：工作台向导切到「网页链接」页签粘贴 URL（或让 agent 抓取一个 http(s) 页面入库），引用身份即 URL：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "用 kb_ingest_url 把 https://example.com/ 入库，doc_kind 取 other，然后 kb_search 查询它页面的用途"
```

**服务器文件（服务器管理员场景）**：文件已经在服务器磁盘上、又不方便走浏览器上传时，才用这条通道——由管理员把文件放进示例语料区再按确切路径入库。`import-real-docs.sh` 完成拷贝，`--kind` 白名单为语料目录名：

```sh
bash examples/kb-agent/scripts/import-real-docs.sh /path/to/真实纪要.md /path/to/标准目录/ --kind meetings   # 或 profiles | regulations
```

然后入库（agent 无法列目录，必须在指令里写出拷入后的确切文件名）：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "用 kb_ingest 把 examples/kb-agent/workspace/data/meetings/真实纪要.md 入库，doc_kind 取 meeting，然后 kb_search 查询它记录的成本口径"
```

语料目录结构即分类：`workspace/data/` 下 `meetings`（走访纪要）、`profiles`（企业档案）、`regulations`（法规标准）三类可经脚本拷入，目录名映射 `doc_kind`（meeting / profile / regulation）。真实纪要先脱敏再入库，绝不把含密文件拷进仓库。

私网/内网地址默认被拒绝。

## 上传表格数据（数据湖）

组合同时挂载了湖仓（SQLite catalog + DuckDB 引擎）与统一上传路由。工作台的「添加文档」上传 csv / xlsx / json 时会自动进入数据湖成为一张可查询的表（表名由文件名派生，同名重传即替换），md / txt / pdf / docx 仍进知识库：

- 上传 csv 后 toast 显示「已入数据湖：<表名> · N 行」；
- 在会话里问数值类问题（如「这张表按地区汇总出口额」），助手会先调 `lakehouse_tables` 看表结构，再用 `lakehouse_query` 执行 SQL 并在回答中注明来源表；
- 数据文件落在 `examples/kb-agent/workspace/lakehouse/`（Parquet），原始上传字节在 `workspace/data/uploads/`。

无 key 验证（纯路由与查询链路，不调模型）：

```sh
pnpm vitest run examples/kb-agent/tests/data-routing.spec.ts
```

真实 key 全链路（上传→湖仓→查询→MiniMax-M3 答数）：

```sh
node --env-file=.env -e "process.env.MINIMAX_API_KEY && console.log('key ok')"
pnpm exec vitest run --config vitest.e2e.config.ts examples/kb-agent/tests/data-routing.e2e.ts
```

## 专家数据集与出海风险问答（张会长）

组合同时挂载了连接器缝（`ctx.connector`）：NocoBase 业务后台作为一个外部数据源，`connector_discover` 能在其上发现**张红喜专家数据集**——漯河市电子商务协会会长、食品出海（中亚五国 + 俄罗斯）方向行业专家。其本人即一个高质量数据集：

- **专家画像**（`experts/1`）：机构、领域标签（食品出海/中亚五国/俄罗斯/跨境电商/海外仓）、履历要点；
- **可服务项**（`expert_services/1-3`，可下单、交付物为 PDF 方案）：中亚货运动线方案 ¥8,800/份、海外仓风险应对咨询 ¥6,800/份、食品出海合规咨询 ¥12,000/份；
- **知识资产**（`datasets/2-3`）：中亚市场准入指南、俄罗斯·中亚海外仓风险应对手册。

权威真源是 `workspace/data/experts/dataset.json`：连接器测试的 mock 服务与种子脚本（`scripts/seed-experts.mts`）都读这一份 JSON，真实 NocoBase 实例（N6 实装）经 `NOCOBASE_BASE_URL` + `NOCOBASE_API_KEY` 播种同一数据，双源不漂移。

配套的出海风险应对语料在 `workspace/data/export-risk/`（9 篇报告：仓库受损应急、中俄班列与改道、公路 TIR、一主两备仓储、货运保险与理赔、中亚清关、转口走廊、海运改道、风险总览）加 2 篇法规摘录（CIM/CMR 不可抗力条款、ICC 2020 合同条款），覆盖「俄罗斯的仓库被乌克兰炸了怎么办」这类不可抗力应急场景。

无 key 快照（语料入库 → kb_search 引用命中 → connector_discover 返回张会长专家卡，转录锁定）：

```sh
pnpm vitest run examples/kb-agent/tests/expert-discovery.spec.ts
```

真实 key 全链路（hybrid 检索 + 真实 MiniMax-M3 回答：应对要点带 [n] 引用 + 按专家卡字段推荐张会长）：

```sh
pnpm exec vitest run --config vitest.e2e.config.ts examples/kb-agent/tests/expert-discovery.e2e.ts
```

## NocoBase 业务后台（真实订单轨道）

订单的单一事实源在 NocoBase 2.x（DSH 不建平行订单表）。`scripts/setup-nocobase.mts` 一条命令把仓内 NocoBase 快照（`platform/nocobase`，隔离式上游副本——升级即重新快照，修改须登记其 MANIFEST）从零带到可用：依赖安装（yarn，首次约 15 分钟）、完整 UI 客户端产物构建（首次约 20 分钟，产物保留、之后秒级启动；`NOCOBASE_FORCE_BUILD=1` 强制重建）、本地 postgres 引导、后台启动 dev-server、应用初始化、五个 collections（`experts` / `expert_services` / `datasets` / `customs_export` / `orders`——orders 带 `deliverable` 附件字段）、张会长数据集播种、root 角色 API key，以及订单审批 workflow（collection 触发 → manual 审批 → 通过分支 request 回调 DSH `orders.fulfill` / 驳回分支回写 failed）。随后重放 `scripts/setup-dsh-data.mts`（DSH 侧数据面：connector-files 目录与示例资产、专家名册、湖仓三表、市场目录、本体知识图谱构建、KB 语料入库——见下文"图谱页与业务管理页"），最后 verify 断言含 `kg_nodes>0` 与专家名册行数下限。凭据写入仓库根 `.env`（`NOCOBASE_BASE_URL` / `NOCOBASE_API_KEY`），组合重启后 connector 与订单域即走真实后台。

浏览器打开 http://127.0.0.1:13000 即完整 NocoBase 业务系统（登录 → 数据管理、workflow、设置全部可用），与 DSH 工作台互为双入口——业务管理页「高级配置」的外链入口卡片在新浏览器窗口打开同一后台（经 DSH 网关 `/nocobase` 同源反代，登录态共享），首次打开需登录。初始管理员账号 `admin@nocobase.com` / `admin123`（由 install 时 `NOCOBASE_ROOT_*` 创建，可覆盖）。同一端口同时伺服 UI 与 `/api/*`，REST 轨道（connector、订单域、demo）不经过额外代理层。

功能导览（登录后即可走遍，2026-09-09 实配）：

- **十二组业务菜单（日常使用从左侧菜单进入；2026-09-28 W4-B5 信息架构重整：16 组并整为 12 组，顶级仅留 AI 工作台，组内排序「单据→报表→配置」）**：采购管理（申请/询价/报价/比价/订单/发票匹配/付款/看板）、销售管理（销售订单/报价单/订单/回款/发票/看板/交期与计划日历/仪表盘）、生产与计划（生产订单/MO 执行视图/排程明细与排产甘特/领料/退料/报工/完工/BOM/工作中心/主生产计划/MRP 快照/计划工作台/车间终端）、质量管理（质检单/检验读数/AQL 抽样方案/处置看板/绩效物化/质检工作台）、仓储管理（入库/出库/库存/盘点/移库/预留/补货/流水/收发存/批次/库区库位/收货终端）、供应链（供应商档案/准入/审核检查表与评分/评分卡/雷达/证照预警/整改跟踪）、经营分析（经营/供应链/生产/库存看板/应收应付对账）、项目与协同（任务四视图+甘特/项目/里程碑/工单/知识文章/审批中心/审批流配置）、组织与系统（员工/部门/请假审批/组织架构/权限矩阵）、基础数据（分类维护/应用中心）、CRM 客户（线索/客户/联系人/产品与服务/客户仪表盘）、资产管理（资产台账/维保服务商/维保记录——「供应商」页 W4-B5 改名「维保服务商」与供应链供应商档案消歧）+ 顶级 AI 工作台。除任务甘特与应用中心外**二十四个业务页全部为 v2**（客户/销售线索/联系人/订单/报价单/工单/资产台账/员工 + 项目/任务列表/里程碑 + 任务看板/任务日历 + 产品与服务/回款/发票/客户仪表盘/销售仪表盘 + 知识文章/维保记录/部门/请假审批/供应商/分类维护）：数据 + 「添加」/刷新操作栏 + **右下角 AI 员工悬浮球**（点开即 Atlas 中文对话；官方 v12 同款形态），每个「添加」弹窗旁都有 dex AI 填充按钮。项目与任务弹窗含 owner/assignee 关联下拉（可选九位 AI 员工）与日期选择器（里程碑数据模型无负责人概念，弹窗为里程碑/所属项目/到期日/状态/已达成）。任务看板/任务日历自 F1 起同为 v2（看板按状态分组 + 卡片含负责人/所属项目等六字段 + 拖拽排序；日历月视图 + 事件即任务标题）；回款/发票的「客户/订单」列、维保记录的「资产/服务商」列、请假审批的「员工」列、知识文章的「分类」列直接显示关联名称（v2 m2o 列读目标表 titleField）。两个「仪表盘」自 F4 起名副其实：表格区块下方各叠两个图表区块（客户仪表盘=客户按行业柱状图+按等级环形图，销售仪表盘=回款按状态柱状图+按方式环形图），双入口保留——「客户仪表盘」仍是客户域第二视角（与「客户」页同表），「销售仪表盘」仍是回款数据视角（与「回款」同表）；图表走 flow-engine 官方 authoring 通道（flowSurfaces:addBlock + settings，服务端规范化查询与映射校验），在表格终态上幂等叠加。复合页「分类维护」自 F3 起为 v2 多块页（「工作台」页 2026-09-28 W4-B4 退役：与 AI 工作台/工单三重叠且无独有职能，任务与工单数据见项目与协同组）：单页并列客户/工单/资产/产品四张分类表（编码前缀 C-/T-/A-/P- 区分）、AI 按钮 ×4。任务甘特保持 v1——甘特插件的客户端模型虽有注册，但未进入 flow-engine 的 server authoring 官方支持矩阵（无白名单/矩阵/fixture），程序化交付无合同保护，为已知边界（无悬浮球，AI 入口在同组其余五页）；应用中心为静态导航页（Markdown 卡片，无数据区块）不适用 v2 升级。自 F6 起看板卡片与日历事件点击打开任务详情 drawer（标题/状态/优先级/负责人/所属项目/三个日期，右侧抽屉渲染关联数据行）。表单 AI 按钮的渲染形态：它是「提交」按钮旁 40px 的员工头像球（ant-avatar，无文字无专属 class），点击打开内嵌聊天并自动携带当前表单上下文；flowModels uid 不会出现在运行时 DOM，验收请按「表单 footer 的头像球」或截图核对，不要在 DOM 里搜 n18ai（uid 不入 DOM 是平台行为；F6 实证渲染/点击开聊/workContext 绑定三环全通，见 demos/acceptance-f/ 的 f6-01/02/03 截图）。
- **AI 生成图表（F4 示范）**：任一 v2 页右下角悬浮球对话里用中文描述图表需求（如「按方式统计回款笔数，用饼图展示」）——AI 员工（Atlas/MiniMax-M3）理解后经 chart-config 工具卡生成图表配置并在对话中渲染图表，可直接对比页面上的种子图表。推理延迟约 40~240 秒，流式输出期间有逐字反馈。
- **应用中心（多应用入口，N17；W4-B4 归组「基础数据」，W4-B5 后为菜单第 10 组）**：「基础数据」组「应用中心」四张卡片直达 CRM Portal / Hub Portal / AI 工作台 / DSH 工作台——对齐官方 v12 multi-portal 入口页的 OSS 等价实现（该页在 v12 为商业插件）。
- **UI Editor（搭建态）说明**：顶栏「UI Editor」开关点亮时页面显示拖拽/配置把手（搭建态，用于改页面布局）；日常使用请点灭它——该状态只存在你自己的浏览器（localStorage），关掉后所有业务页即为干净的使用界面。
- **AI 雇员两个入口**：任一 v2 业务页或 AI 工作台（admin 菜单）右下角悬浮球——内嵌聊天框 + 表格区块，默认 Atlas / MiniMax-M3，中文问答可查业务数据源；或后台 :13000 设置 → AI employees 管理页（九位内置雇员已全中文化）。
- **Portal 进入路径（CRM 为主要入口）**：CRM Portal（主要入口）在 `http://127.0.0.1:3080/nocobase/dist/crm/`——九域合一（销售/项目/人事/库存/采购/财务/客服/资产/知识库），登录后直落仪表式首页 `/overview`，深链示例 `/nocobase/dist/crm/tickets`、`/nocobase/dist/crm/overview`；Hub Portal 保留为官方模板参考（`http://127.0.0.1:3080/nocobase/dist/hub/`），功能已全部并入 CRM，数据同源可并行对照。:3080 网关对 `/nocobase/dist/<portal>/<路由>` 做 SPA fallback，真实路由可直接深链/刷新；:13000 直连须从入口页进，深链直开 404。
- **CRM Portal 单主入口（G 轮定稿）**：CRM Portal = 销售作业 + 全域运营的单一入口——原 Hub 九域（项目/人事/库存/采购/财务/客服/资产/知识库）已整模块并入 CRM，菜单按交付/人事/运营/财务/支持/知识六组折叠，首页升级为 Hub 仪表式 overview（销售 KPI 直读 `crm_*`，与销售管道页数字一致）。Hub 的 sales 域不并入：那是官方模板的双销售演示（`hub_sales_*`），用户主销售数据在 `crm_*`——admin 后台「CRM 客户/销售流程」菜单读写 `crm_*` 表，「项目管理」等读写 `hub_*` 表，数据同源一套。
- **在 admin 配置业务数据与界面（E2）**：CRM Portal 右上角设置齿轮直达 admin **数据源管理器**（`/nocobase/admin/settings/data-source-manager/main/collections`）——`hub_*`/`crm_*` 全部 49 张表可配字段/编辑/删除，配置能力一直在 admin 侧；admin 顶栏「界面配置」开关可调 admin 业务页区块布局；用户和权限在设置抽屉（用户和权限/系统设置）。已知边界：CRM Portal 十域菜单分组结构在前端路由硬编码（CRM 原生 5 组：总览/客户/销售/产品/分析 + 移植域 6 组：交付/人事/运营/财务/支持/知识，共 11 组）；页面区块的数据/字段配置仍在 admin 数据源管理器，Portal 页面本身不开放运行时搭建。
- **AI 雇员对话附件与图片（上传即模型可见）**：任一 AI 雇员聊天输入框用回形针/拖拽/粘贴上传附件后直接提问——pdf/docx/xlsx/md 的文本内容与图片都会进入模型请求，模型能复述附件文字、描述图片内容。其中 pdf 依赖本地附件代理（`ai-proxy`，随 `all` 链自动启动）：代理把 llmService 指向的 `http://127.0.0.1:13100/v1` 请求里的 PDF file part 解析为文本注入，并默认过滤模型回复内联的 `<think>` 推理链（最终用户看不到推理过程，仅见正文）。代理启停：`ai-proxy start` / `ai-proxy stop`（stop 自动把 llmService 回切直连）；只想恢复 think 回显：`ai-proxy stop` 后 `N22_FILTER_THINK=0 ai-proxy start`，再不带该变量重启即恢复过滤。verify 会断言代理健康与 baseURL 指向。
- **Portal AI 智能员工（两套挂载体系）**：① admin 侧 n18 脚本挂载（11 个 v2 新建表单抽屉：CRM 的商机/客户/联系人/报价/线索，Hub 的工单/资产/员工，项目管理三页的 E1 弹窗）——dex 头像按钮 → 中文描述意图 → formFiller 流式填充；② **Portal 前端 ai-employee-fill 挂载（G7 后 11 个 formId）**：CRM Portal 内商机（crm-deal-create）、线索（crm-lead-create）、项目（hub-project-create）、任务（hub-task-create）、报销（hub-expense-create）、工单（crm-helpdesk-ticket-create）、资产（crm-asset-create）、知识文章（crm-kb-article-create）、员工（crm-hr-employee-create）、库存商品（crm-inv-product-create）、采购单（crm-po-create）——同样的 dex 面板与流式填充，提交直连 `crm_*`/`hub_*` 表落库。两套互不相干：n18 管 admin v2 页，ai-employee-fill 管 Portal 前端表单。
- **已知边界**：图片单张 ≤10MB（JPEG/PNG/GIF/WEBP），超大图上传时前端显式报错、不会静默丢图；MiniMax-M3 推理延迟在 40~240 秒间波动（表单填充与长问答都需等待模型思考，流式输出期间有逐字反馈）；PDF 走文本层解析，扫描件/纯图片 PDF 无法提取内容，代理会显式报错而不是让模型猜。Portal 库存/销售/财务/帮助台四域表（`hub_inv_*`/`hub_sales_*`/`hub_hd_*`/`hub_fin_*`）由种子链幂等补建并回填演示数据（2026-09-12 起，verify 断言 list/sort/append 全 200）。`users` 表含演示行：四位历史人名（陈立群/王一帆/林静怡/赵晓芳）与九位 AI 员工（阿特拉斯/达拉/得克斯等）均无密码、不可登录，任务/项目负责人下拉即取自该表（2026-09-12 起）；「我的任务」按登录者过滤，AI 员工不登录 Portal，该页只对人类有意义。hub_/crm_ 表的 id 引用列（`*_id`/`*Id`）由 `all` 链统一拓宽为 bigint，与 bigint 主键对齐（幂等：仅 integer 列触发 ALTER）。
- **商业版边界**：AI 知识库（RAG）、审批/子流程/Webhook workflow 节点、审计日志等商业插件未装，替代路径已在上文（DSH 知识库、manual+condition+request 节点链），明细清单见 plans/nocobase-full-features/PLAN.md §4。
- **品牌白标（N25 + C6）**：admin 侧栏 logo、登录页标题、浏览器标题后缀与站名走 `systemSettings`（`DSH食品业务平台` + DSH 自研 logo，真源 [workspace/assets/brand/](workspace/assets/brand/)；logo.url 存网关形路径 `/nocobase/dsh-brand-logo.svg`——用户真实入口是 :3080 同源代理，代理剥前缀后落到 client dist 根；:13000 直连是调试入口，读该前缀路径会落到 SPA HTML 兜底）；favicon 与 `nocobase.png` 兜底由品牌脚本在 `yarn build` 之后按字节比对覆盖（重建会还原官方资源，`all` 链内置重放自愈）；favicon 品牌源派生自 [dsh-favicon.svg](workspace/assets/brand/dsh-favicon.svg)（16/32/48 帧 ICO），verify 对其做上游默认摘要黑名单校验、并在 dsh web 网关存活时断言 `:3080` 三路径（`/nocobase/favicon.ico` 与 `/nocobase/dist/{crm,hub}/favicon.ico`）字节等于品牌源——上游默认图标会被显式拒绝。Portal 面（favicon/明暗 logo-mark/入口标题）由部署脚本在每次构建后覆盖为 DSH 品牌并 fail-loud 校验注入标记，运行时标题由 Portal 源码的 `appName` 承载。改品牌素材后重跑 `node --import tsx/esm examples/kb-agent/scripts/nocobase-n25-brand.mts`；改 Portal 品牌/前缀行为需重跑 `node --import tsx/esm examples/kb-agent/scripts/nocobase-portal-deploy.mts`（注入 `NOCOBASE_PORTAL_BASE` + `NOCOBASE_API_URL` 运行时定义——悬浮 AI 员工图标与 Portal API 探活依赖它们；:3080 网关的 `/nocobase` 代理会把两个根绝对值重写为代理前缀，Portal 经 `/nocobase/dist/{crm,hub}/` 可完整使用）。**许可合规边界**：NocoBase LICENSE §5.2 规定 OSS 版仅"页面左上角主 LOGO"允许更换，footer "Powered by NocoBase" 与其余品牌位**必须保留**（2026-09-12 运行时核实：上游 v2.2.6 登录页默认渲染该 footer，本部署未移除），Portal fork 文案（原 "Salesroom CRM"/"All in one"/displayName "CRM DEMO"）已于 2026-09-12 源码级统一替换为 DSH食品业务平台（portals 是自有 fork 应用模板，核心 MANIFEST 零涉及；displayName 经 vite define 进 bundle，post-build 替换不可达，必须源码改）；根路径 /favicon.ico 由品牌脚本覆盖到 client dist 根（admin 入口无 favicon link，浏览器回退请求 origin 根）。

```sh
# 从零到可用（可重复执行；已存在的构建产物/collections/种子/workflow/DSH 数据面跳过）
node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts          # = install → build → start → init → 模块重放 → DSH 数据初始化 → verify

# 分步执行 / 日常操作
node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts start    # 后台启动（健康检查）
node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify   # 断言 collections + 附件字段 + 种子 + workflow 节点链 + n18ai- 表单 AI 按钮 + 双 Portal 探活 + ai-proxy + API key
node --env-file=.env --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts "ai-proxy" start   # 启动本地附件代理（PDF 可见 + think 过滤；stop 自动回切直连）
node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts stop     # 停止 dev-server
node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts reset    # 停止 + 重建数据库 + 全新初始化
```

**重置数据（reset）**：`reset` 停止 dev-server、drop `nocobase` 库并全新重装；重置后**必须重启 dsh web 网关**（`Ctrl-C` 后重启下文「网页版工作台」一节的 `pnpm dsh web` 命令）——长驻网关进程持有已删除库文件的 inode，不重启的话此后经它的写入落在孤儿 inode 上全部丢失（进程内存 / 新库文件 / 旧 inode 三个世界不一致）。彻底重置顺序：停 dsh web → `rm -f examples/kb-agent/workspace/{kg-graph,kb,lakehouse-catalog}.sqlite*` → `setup-nocobase.mts reset` → 默认 `all`（重建 DSH 数据面）→ 再起 dsh web。

环境变量可覆盖：`NOCOBASE_HOME`（源码快照路径，默认仓内 `platform/nocobase`）、`NOCOBASE_BASE_URL`（默认 `http://127.0.0.1:13000`）、`NOCOBASE_ROOT_EMAIL` / `NOCOBASE_ROOT_PASSWORD`（默认 `admin@nocobase.com` / `admin123`）、`NOCOBASE_DSH_CALLBACK`（workflow 回调地址，默认 `http://127.0.0.1:3080`，即 `dsh web` 的 api-gateway）、`NOCOBASE_FORCE_BUILD`（=1 强制重建客户端产物）。

真实轨道全链路 e2e（无 NocoBase 或不可达时自跳过并说明原因）：

```sh
pnpm exec vitest run --config vitest.e2e.config.ts examples/kb-agent/tests/nocobase-track.e2e.ts
```

该测试走完整闭环：`connector_discover` 读真实 collections（张会长专家卡）→ 下单落真实订单行 → workflow 生成 manual 审批任务 → 测试以审批人身份 resolve → request 节点回调 DSH `orders.fulfill`（有 MINIMAX_API_KEY 时真实 MiniMax-M3 起草，否则模板兜底）→ PDF 经 `attachments:upload` 挂回订单行 `deliverable` 附件字段 → 断言本地 PDF 与 NocoBase 附件字节一致。审批驳回分支由 workflow 的 update 节点回写 `failed`（error=审批驳回）。

业务读写工具的真实轨道 e2e（同样自跳过）：

```sh
pnpm exec vitest run --config vitest.e2e.config.ts examples/kb-agent/tests/nocobase-business.e2e.ts
```

该测试验证 nb_* 工具组（nb_collections/nb_list/nb_get/nb_create/nb_update）：读真实 schema 与种子行（张红喜）→ UUID 标记的 create 落真实行并回读断言 → nb_update 以「改前→改后」diff 回执合并字段并经裸 client 回读验证 → 清理销毁测试行。写确认契约由 persona 承载（工具无 UI 确认状态）；keyless 快照 `pnpm exec vitest run examples/kb-agent/tests/nocobase-tools.spec.ts` 在 mock 后端锁定同一动线（确认步骤前零写请求）。

**多租户映射（MVP 形态）**：四级租户（平台/运营商/企业/用户）映射到 NocoBase 的 roles + departments 树 + 行级 scope——平台=superuser 角色、运营商=每运营主体一个 role、企业=department 节点（collections 行按 department scope 隔离）、用户=部门成员。本示例是 MVP 单租户：一个 root 角色 API key 服务全部连接器与订单读写（与 `kbWriteEnabled`/`ordersEnabled` 的单租户盘级访问控制同立场，见 [DEPLOY.zh.md](DEPLOY.zh.md) §3），不做行级隔离；多租户接入时按上述映射在 NocoBase 建 roles/departments 并为每个租户签发绑定 role 的 key，DSH 侧把 `DSH_KB_TENANT` 与 key 一并按租户部署。

## 制造业全链闭环：W 轮 9 步剧本（供应商→采购→质量→生产→销售→结算→看板→审计）

W 轮（B0–B9 十批）把平台升级为真实制造业闭环：通用审批引擎五表（`wfl_*`，双端同一入口）、采购全链（PR→RFQ→比价→PO→收货→IQC/AQL→入库→发票三方匹配→付款）、库存实务（移库/预留/ROP/盘点，`stock==Σmovements` 恒成立）、生产闭环（BOM/FCS 排产/齐套硬预留/领退料/报工/OQC/完工入库）、销售→MRP 联动（计划单 mobile 确认卡转单）、质量四路处置与供应商绩效、以及 B9 的真实数据看板（`kpi_snapshots` T+1 快照 + 90 天回算，四类看板页全部由真实单据聚合，每项 KPI 带 psql 口径）。

交付演示按 9 步走（真实服务、真实 key、双端取证；完整证据与逐步 psql 断言见 `research/2026-09-25-w-round/`）：

```
① 供应商：mobile 对话「登记一家新供应商：禾创源…」→ 草稿卡确认 → SUP-2026-1300 落库（potential）→ 准入审批 qualified
② 采购：mobile 建 PR（PR-B9F-0001）→ 审批 → RFQ 发三家 → 比价（最低价中标）→ PO 审批 approved
③ 收货质量：mobile 收货单挂 PO → 过账上待检区 → IQC 抽检（AQL 查表 J/80，d=2≤Ac5 → passed）→ 放行转合格库（批次四日期）
④ 销售：mobile 建销售订单（SO-B9F-0001）→ 审批 approved → 生效即成品预留
⑤ 计划：MRP 日结 → mobile 问「有什么计划建议」→ 计划卡 → 确认转单 MO（带 driver 链回 SO）
⑥ 生产：MO 审批 → 下达 → 排产 Preview/Apply → 齐套（组件硬预留）→ 领料 → 报工×3 → 完工 → OQC → 放行入库
⑦ 结算：SO 发货（shipped_at 回写）→ 发票三方匹配 confirmed → 付款审批 approved
⑧ 看板：KPI 快照重算 → psql 手算对账（OTIF/一次合格率/账实相符率逐项一致）→ 四类看板页真实图表
⑨ 审计：任一 PO/MO 双向追溯（`kpi-run.mts --trace po=<PO> mo=<MO>`，19/19 链路闭合：PO↑PR/RFQ/报价 ↓收货/IQC/批次/发票/付款；MO↑BOM/建议/SO ↓领料/报工/完工 + 批次三级追溯 成品→组件→供应商）
```

日常操作：mobile 端对话登记/审批/查 KPI（「这周 OTIF 多少」出报告卡）；平台侧各域页面照常使用。夜间任务（W2-B7 起两条路，二选一勿双跑）——

```sh
# 路 A（内置定时器，默认关）：env 开关让 approval-engine --serve 自己跑夜间链
#   腿序 scan-reorder → run-mrp →（月末）月度收发存快照 → calc-kpi，季初月每日幂等重算追加 calc-scorecard；
#   任一腿失败不阻断后续；POST :13110/run-nightly 随时手动触发一次（不占当日标记）。
W1_NIGHTLY_ENABLED=true W1_NIGHTLY_AT=02:30 node --import tsx/esm examples/kb-agent/scripts/approval-engine.mts --serve

# 路 B（W 轮形态，外部 cron 逐动词 curl；不带 env 起 serve 时与之完全一致，零漂移）：
node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --calc-kpi     # 或 POST :13110/calc-kpi
node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --selftest    # 纯公式断言
node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --trace po=PO-B9F-0001 mo=MO-2026-0009
```

## 审批流可视化设计器（W5：拖拽编排、发布与会签）

审批流不再手写 JSON：`approval-engine.mts --serve`（:13110）在 `/designer` 提供独立拖拽画布（React Flow），平台侧「项目与协同 → 审批流配置」页以 iframe 内嵌同源入口，打开即画布。链路铁律：`wfl_flow_configs.graph` JSONB 是编辑态唯一事实源，`states/transitions` 行表是发布期的单向编译产物——引擎运行时照旧行级读取，乐观锁/审计/探针零改动。

操作动线（全程无 JSON 文本输入）：

1. 左侧节点面板拖入节点——七类中已启用 start/approval/cc/handler/condition/parallel/end；画布拖拽定位、拖连线建边（自环与重边被拒）。
2. 点节点开右侧属性面板：审批人五类（成员/角色/部门主管/逐级主管/表单字段）、多人方式（依次/会签/或签）、空审批人策略（自动通过/拒绝/转管理员/指定人）、条件节点二层面板（字段/运算符/阈值行组）、回退白名单。
3. 「保存」只写 graph；「发布」先过门禁（孤立节点/缺终点/成环/审批人空/条件无 else 兜底逐类拒绝并给出行级错误列表），再以 CAS 原子替换派生 wfl 行（发布前行表快照进 config_note，可回滚重放）。发布前 round-trip 等价断言强制 diff=0——不等价即拒绝发布，旧行表继续生效。
4. 生效即时：发布后新提交的单据按画布流转（会签=扇出 k 个待办全过才过、或签=任一即过、回退走 allowReturn 边）；CLI/HTTP/移动端 nb_approve 三入口走同一 effect 层，移动端审批同样触发预留/MPS 生效钩子。

```sh
# 设计器（浏览器直开；token 鉴权与车间终端同一 W3_TERMINAL_TOKEN）
open "http://127.0.0.1:13110/designer?doc_type=pur_requests"
# 发布链路与高级节点回归（编译器矩阵 + 10 类型 round-trip + 会签/或签/回退/并行/抄送断言）
node --import tsx/esm examples/kb-agent/scripts/approval-engine.mts --selftest
node --import tsx/esm examples/kb-agent/scripts/w5b2-advanced.mts --migrate
```

W5 起新链路的自动推进语义（生效侧例外才人工）：IQC 判定 passed 即自动放行合格区（不再另跑放行命令）；OQC 放行自动给欠货 SO 补成品预留；ROP 建议确认自动建请购草稿并回链，ATP 回升的 open 行自动关闭；SO 发货自动落 `wms_shipments` 出库单台账；付款 paid、供应商四态升降级、MO 完工全部收进审批引擎词汇族终态（误付可经引擎 void）。库存台账恒等式不变：`stock == Σmovements`，且数量清零且无占用/锁定的库存行不再残留（`--sweep-zero-stock` 幂等清理存量）。

## 供应链双系统：SRM + WMS 完整闭环（H 轮）

五大企业系统（CRM ERP/MES/WMS/PLM/SRM）走「类似 admin、可 UI 配置」的单 NocoBase 应用路线，每系统一个菜单组、v2 flowPage 形态、工厂脚本幂等建成。H 轮交付**共享地基 + SRM + WMS 两个完整闭环**；PLM（含酱油山梨酸钾 GB2760 硬阻断场景）/MES/ERP+CRM 升级按 I/J/K 轮路线图分期（`plans/acceptance-fixes-2026-09-15-h/04-roadmap-five-systems.md`），未建系统的菜单组不出现。

- **共享地基**：`hub_inv_products` 增加五个可空食品列（保质期天数/温层/储存条件/GB2760 分类号/致敏原，后两项为 I 轮 PLM 预埋）；存量 7 行按真实 SKU 编码空值守卫回填，另有 4 个食品 SKU 种子。
- **SRM（「供应链」组，6 表 8 页）**：供应商档案（三套分级独立字段：监管风险/审核评级/IQC 严格度）、供应商准入（第二视角 + 双人工审批链：资质审核→现场审核评级→合格/已拒绝，生命周期状态机落库）、证照效期预警（30/60/90/过期分组）、审核检查表（GMP20+HACCP7+ISO220006 条款）、审核评分录入、绩效评分卡（五维+加权总分）、供应商绩效雷达（柱状图 + **五维雷达图**——图表 authoring 通道 `visual.mode='custom'` 原生 ECharts option）、整改跟踪看板（发起/供应商回复/验证/关闭四列）。低于 60 分的评分卡创建自动触发整改单（workflow `create` 节点）。
- **WMS（「仓储管理」组，9 表 9 页）**：仓库库区/库位（2 仓×3 温层区×12 位=72 库位，四状态分布）、**库位平面图**（A 路 JSBlockModel 自定义区块：runjs 白名单词汇 `ctx.makeResource` 读 `wms_bins` 渲染四色网格+悬停存货摘要——探针结论「完全可行」，B 路 GridCard 回退未启用）、入库单（过账自动按物料温层推荐空闲库位并按保质期推四日期）、出库单（**FEFO 推荐批次**列：按应下架日升序）、库存查询（SKU×库位×批次四数量+乐观锁版本列）、批次主数据（效期四日期+供应商追溯锚）、盘点管理（差异审批工作流）、移库管理、库存流水（append-only，`stock==Σmovements` 期初对齐恒成立）。
- **过账引擎**（脚本侧，`--post-receipt/--post-shipment`）：版本校验乐观锁（过期版本命中零行即 fail loud 拒双重扣减，已实测）+ 流水追加 + 单据状态单次翻转；`--fefo <sku> <qty>` 按应下架日升序给出批次分配建议。workflow update 节点做不了四数量读-改-写算术，故过账不进 workflow（决策记录见 `.agents/notes/implemented/process/2026-09-15-five-systems-factory-srm-wms.md`）。
- **AI 化**：全部 17 个新表单经 n18 自动挂载 dex 填充按钮（n18ai- 下限 25→42）；六张表单中文一句话流式填充实测（SRM 准入/审核/证照/CAPA + WMS 入库/出库，AI 能自主解析供应商/物料关联 ID）。
- **证据**：`demos/acceptance-h4/`、`demos/acceptance-h5/`（逐页截图、状态机/自动整改/过账/FEFO/乐观锁实录、gates.log）。

## 五条用户动线一串演示（demo-full-journey）

上面各节按能力分述；`demo-full-journey.mts` 把五条用户核心动线串成一次可复跑的真实端到端（with-key + with-NC，无前置的轨道自跳过并说明原因）：

| 动线 | 场景 | 真实轨道 |
|---|---|---|
| 上传任意文件自动路由 | 海关 csv → 数据湖、走访纪要 md → 知识库，数值问题湖仓答、文档问题 KB 答 | 真实上传通道 + 真实嵌入 + MiniMax-M3 双路回答 |
| 专家发现与咨询 | 问「俄罗斯的仓库被乌克兰炸了怎么办」→ 应对要点带 [n] 引用 + 张会长专家卡 | 真实 embo-01 检索 + 真实 NocoBase 发现 + MiniMax-M3 作答 |
| 会话内下单拿 PDF | 下单张会长方案 → 审批 → 交付 → 下载 | 真实 NocoBase 订单 + workflow 审批 + `orders.fulfill` 回调 + PDF 落盘与附件字节比对 |
| 业务管理对话改数据 | nb_collections 发现业务对象 → nb_create 建专家 → nb_update 改名 → nb_get 回读 | 真实 NocoBase 行级读写（业务管理页同一通道） |
| 图谱问答 | kg_schema 本体浏览 → kg_subgraph 实体邻域 → MiniMax 组织答案 | 真实 kg-graph v2 存储种子 + 图谱页同一读面（keyless 可跑，组织答案需 key） |

```sh
node --import tsx/esm examples/kb-agent/scripts/demo-full-journey.mts
```

前置即上文各节的环境（`.env` 里 MINIMAX_API_KEY；启用订单/业务动线需 NocoBase 已 start）。逐场景断言 + 实录输出，全程约 4–6 分钟；实录落 `examples/kb-agent/demos/full-journey-<时间戳>.md`（入库与湖仓/图谱数据都在独立临时工作区，不碰 `workspace/`）。任一场景断言失败则该场景记 FAIL 且退出码非零。一条说明：场景 3 用 seam 直调下单——`order_create` 工具的「一次调用完成下单+交付」语义服务 DSH 内同步闭环轨道，真实审批轨道的 fulfill 由 workflow request 回调驱动（NocoBase 节的 e2e 与本演示一致）。2026-09-07 实跑实录：`demos/full-journey-20260907-135731.md`（五场景全 PASS）。

## 换角色

网页版首屏的场景门户是换角色的首选入口：30 张场景卡按市场洞察、工艺、食品安全、成本、供应链、出海、设备、数据资产八类分组，点击卡片弹出角色确认框（描述 + 示例问题），点"开始会话"即以该角色开新会话，示例问题已预填输入框。2026-09-02 实测（Node 22.19.0）：点击"企业数据助手"卡并在确认框点"开始会话"，会话头部角色变为"企业数据助手"、输入框预填"水电气 单耗"。`cordis.patch.yml` 把 `examples/kb-agent/scenarios/` 挂为预设根，场景角色随组合自带可达——任何 `DSH_HOME` 下启动网页版都能选到全部 30 个场景，零复制。

`examples/kb-agent/agent-presets/` 另挂两个角色预设——**AI 食安合规官**（`food-compliance-officer`，依据 GB 2760/GB 14881 等法规作答并输出审核要点清单）与**企业数据助手**（`enterprise-data-assistant`，覆盖市场/工艺/食安/成本/供应链五类问答，网页版新建会话的默认角色）；门户里"AI 食安合规官"与"企业数据助手"两张同名场景卡就是这两个角色的点击入口。预设只在网页版工作台生效：命令行 headless 会话始终是 kb-agent 基础角色，不挂预设。

自建预设才需要复制——把它放进 `$DSH_HOME` 的预设可写根即可进入可选列表：

```sh
mkdir -p examples/kb-agent/.dsh/.agent-presets
cp -R <你的预设目录> examples/kb-agent/.dsh/.agent-presets/
```

默认角色可写入 `examples/kb-agent/.dsh/settings.yaml` 覆盖组合默认（取值为 roster 里的预设 id，场景卡对应场景 id，如 `food-compliance`）：

```yaml
agent-presets:
  default: food-compliance
```

## 网页版工作台

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml
```

启动后输出 `dsh web: http://127.0.0.1:3080` 并自动打开浏览器；追加 `--no-open` 关闭自动打开（完整命令：`DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml --no-open`）。注意 flag 顺序：`--patch` 是 dsh 启动器的 flag，必须写在 web 应用自己的 flag（如 `--no-open`、`--host`）之前——从第一个启动器不认识的参数起，其余参数全部原样交给 web 应用。工作台无鉴权，只在本机使用，不要暴露到公网。新建会话默认使用企业数据助手预设（见上节换角色）。暗色外观跟随系统设置。

**浏览器面产物契约**：host 侧代码经 tsx 走 src，但网页版两个浏览器面读的是磁盘构建产物——`/plugins/<id>/client.js` 读 `packages/client/*/lib/client.js`（tsdown 打包），`/assets/*` 读 `apps/web/dist`（vite 构建）。改了 `packages/client/*` 后跑 `pnpm run build:lib:client`，改了 `apps/web` 后跑 `pnpm run build:web`。`pnpm run clean` 会删掉 `lib/`；此时只复跑 `pnpm run typecheck` 不够（它只产 `lib/types`，不出 client bundles）——首页会报 `Failed to load plugins` + `client-modules: HTML did not preload @deepseek-ai/dsh-client-modules/client.js`（preload 脚本 404），重跑 `build:lib:client` 即恢复。新增或删除声明 `dsh.client` 的包后重启 dsh web：模块表在进程启动时扫描 `package.json`，长驻进程不会自己发现新包。

## 移动端与 PC 移动端预览

dsh web 启动后，手机浏览器（或桌面浏览器开 390×844 视口）打开 `http://127.0.0.1:3080/mobile`：手机号 + 6 位验证码登录（演示级鉴权——无防重放、无频控，仅本机使用，边界见 [DEPLOY.zh.md](DEPLOY.zh.md)），落首页（今日台账）。

- **四 Tab（v5）**：AI同事（首页：今日台账统计、快捷任务、同事横滑与最近对话）、对话（AI 员工会话与人类会话混排，AI 徽章区分）、工作（四态工作项：待处理/进行中/待确认/已完成）、我的。会话与 PC 端同一存储——PC 上问过的，手机上接着看。
- **AI 填表助手**：在移动端会话里说「登记一张采购单：向宏发食品采购棕榈油 2 吨」——AI 预填任务卡（字段可改、附支撑数据），卡上「确认写入 / 驳回」：确认经真实网关落业务表并给回执卡，驳回即作废；两种结果都落会话日志，可追溯。风险、汇总、对比类问题会给结构化报告卡，可一键创建任务跟进。
- **PC「移动端预览」**：PC 会话页签环的「移动端预览」tab 内嵌手机壳 + 同源 `/mobile` iframe，可在桌面直接登录操作移动界面，双端同数据。

## 数据资产市场与连接器页

会话页签环在「知识库」之后多了两页：**数据资产**与**连接器**（侧栏同款入口常驻）。

- **数据资产**：板块门户（商品/供方/本月成交计数 + 典型产品位，文案来自 `workspace/data/market/seed.json`，改文件即改运营位）→ 目录（搜索 + 类型筛选，卡片带定价与来源）→ 详情（价格/交付物/专家机构 + 「问数」「引用并提问」直接预填对话）→ **下单**：确认卡只读展示服务/金额/交付方式，唯一可编辑的是需求简述，确认后经订单域落真实订单并显示订单号与「待审批」徽标。
- **连接器**：数据源目录（正常/缺凭据状态）+ 交付跟踪（每个数据源的交付次数、行数、最近落库）+ 运行时间线（入数据湖/入知识库）；「接入新数据源」把需求预填进对话，由助手推荐数据源、补参数、测连接——页面无表单。

两页的数据来自 apiproxy 的 `assets.*` 与 `connectors.*` 域（组合已在 `cordis.patch.yml` 开启 `assetsEnabled`/`connectorsEnabled`）。真实轨道 e2e（无 NocoBase 时自跳过）：

```sh
pnpm exec vitest run --config vitest.e2e.config.ts examples/kb-agent/tests/market-track.e2e.ts
```

该测试走真实闭环：真实 collections 投影为市场卡（张会长可下单服务带价格）→ `orders.create` 落真实订单行 → 真实数据集 `connector.transfer` 落数据湖 → 连接器页读到交付聚合与时间线。

## 图谱页与业务管理页

页签环再添两页：**图谱**（`kg`）与**业务管理**（`business`），侧栏同款入口常驻。

- **图谱**：短语框把子图查询包装成自然语言（「宏发食品的供货链」「含棕榈油的商品」，其余文本按实体名直接游走）→ 实体搜索带别名解析 → sigma.js 画布（双击节点展开一跳邻居、单击选中、滚轮缩放）→ 类型图例点选过滤画布 → 详情面板（类型/关联数/业务键）与「问此实体」预填对话。节点语义着色按本体类派生（「按本体语义」一档），本体树改类即刻重着色。数据来自 apiproxy 的 `kg.*` 域（`cordis.patch.yml` 已开 `kgEnabled`/`kgTenant`）；画布渲染栈（sigma/graphology/force-atlas2）动态加载不进主包，无 WebGL 环境自动降级为同语义关系清单。
- **KG 工作台**（图谱页的模式切换）：**本体树**按类层级编辑——新增/改名/移动父类/废弃走 KGCL 原语，每次变更写 ontology revision 并在变更流留痕；**变更流**是 episode 时间线（每条记录指令原文、操作者与 diff），任意时刻可**回滚**（该 episode 新增的边失效、其恢复过的边还原）或**回放**该时刻的图状态；**共指审核队列**收纳 0.5–0.9 置信灰区的同义合并候选，人工判决合并或驳回。
- **语义化改图**：在会话里直接发自然语言指令（如「把宏发食品的供货关系改成由绿源提供」），agent 走 kg_edit 工具：先出修改提案与 diff 预览，确认后落库并记一条 episode，可随时在变更流一键回滚（`cordis.patch.yml` 已开 `kgEdit`）。
- **业务管理**：对象切换器按业务域分组导航（`nocobase.listMeta` 动态清单，隐藏表不露）→ 实体卡流（主标签 + 三对字段预览，「问此记录」「编辑（对话）」与对象级「新建（对话）」全部预填对话，页面零表单）→ 辅助表格视图（hasNext 翻页）→ **高级配置**：外链入口卡片经 `/nocobase` 同源反代在新浏览器窗口打开业务后台（低频管理：页面编辑器/角色权限细配；日常读写走对话）。数据来自 V2 的 `nocobase.listMeta/list` 域。

图谱数据随 `setup-nocobase.mts`（all 链）内置产出：链尾重放 `scripts/setup-dsh-data.mts`，其中 kg-build 管线综合三源建图（NocoBase 业务表结构化映射 + 湖仓表结构 + KB 语料闭集 LLM 抽取——无 `MINIMAX_API_KEY` 时语料腿跳过、确定性腿照跑），删除 `workspace/kg-*.sqlite` 后单跑 all 即重建；图谱页打开即自动加载默认子图。增量重建（数据变化后刷新图）仍可单独跑——重跑做五源增量 ingest：未变源按 scope 快照指纹跳过、消失的行落墓碑，本体层把 FoodOn 精选子树锚点幂等物化进注册表（类与实体可挂 FoodOn URI 对齐标准词）：

```sh
node --import tsx/esm examples/kb-agent/scripts/kg-build.mts
```

业务数据批量充实（批次五起，全部幂等、重跑不重复）：五个按域播种脚本把示例规模的演示面撑成有运营厚度的业务面——专家名册（32 位领域专家 + 可下单服务 + 知识资产，真源 `workspace/data/experts/roster-batch5.json`）、市场数据资产（63 条八域目录，真源 `workspace/data/market/assets-batch5.json`，`datasets` collection 自动扩展 domain/source/pricing/summary 字段）、历史订单（近 30 天 24 条，播种期间自动暂停审批 workflow）、湖仓三表（原辅料价格/进出口统计/冷链运价，经 `lakehouse.load` 正规入库并留 transfer 记录）、KB 语料入库（清单 kb-corpus.yml 登记的 14 个语料目录共 46 篇，真实 embo-01 嵌入；seed-kb、setup-dsh-data 与 kg-build 语料腿读同一份清单，新增语料目录只改清单一处）。五个播种步与图谱构建均已并入 all 链（`setup-dsh-data.mts` 编排，水位探测幂等——名册水位按 32 位专家名全在、订单水位按 `ORD-B5-` 前缀 24 条全在判定，缺则重放播种脚本）。单独充实后重建图谱跑上面的 kg-build，或重放整个数据面：`node --import tsx/esm examples/kb-agent/scripts/setup-dsh-data.mts`。

```sh
node --env-file=.env --import tsx/esm examples/kb-agent/scripts/seed-experts-roster.mts   # 专家名册 + 清理 e2e/demo 残留
node --env-file=.env --import tsx/esm examples/kb-agent/scripts/seed-market.mts          # 市场数据资产目录
node --env-file=.env --import tsx/esm examples/kb-agent/scripts/seed-orders.mts          # 历史订单
node --import tsx/esm examples/kb-agent/scripts/seed-lakehouse.mts                       # 湖仓三表 + 交付跟踪记录
node --import tsx/esm examples/kb-agent/scripts/seed-kb.mts                              # KB 语料（需 MINIMAX_API_KEY）
```

MCP 通道对照评估结论（REST 窄面保持主通道）见 Agent Note `2026-09-07-mcp-channel-evaluation`；探针 `scripts/mcp-probe.mts` 可复跑对照。

## 智能 tab 对话

会话页签环与侧栏 tab（图谱、数据资产、连接器、业务管理等）对助手可见：每轮提问前，当前所在 tab 的视图状态（选中实体、类型过滤、画布规模）自动注入对话上下文，输入框可以直接指挥当前页面（2026-09-16 真机验收：会话「把图谱过滤到只显示供应商」全链生效，证据 [demos/acceptance-j3/](demos/acceptance-j3/README.md)）。

- **切着图谱问**：切到「图谱」tab 后直接输入「把图谱过滤到只显示供应商」——助手调视图操控工具执行过滤，画布只剩供应商节点；接着问「当前图谱有多少实体」，答案直接来自视图快照，不再重复查询。
- **视图内问数**：「查宏发食品供货的所有产品」经短语查询在画布上直接渲染结果子图，回答与画面一致。
- **降级有兜底**：页面不可达或动作超出白名单时工具明确报错（30 秒超时/未知动作），助手自动改用数据面工具（kg_query、nb_list 等）作答并给出手动操作参数。

助手侧的三件工具：`switch_view`（切页签）、`view_apply`（执行页面动作，动作白名单与 30 秒超时保护）、`view_state_get`（回读当前视图状态确认生效）。kb、场景、连接器 tab 的操控动作与显式 @ 引用、文档型 patch（`apply_view_patch`）留待 K/L 轮分期（清单见 plans/handoff-2026-09-15.zh.md）。

首屏是经营概览首页：顶部 KPI 带直读湖仓关键数（零依赖数字卡），下方最近交付轨列出最新订单交付物；场景门户的 30 张场景卡按市场洞察、工艺等八类分组（点击卡片经确认框后以该角色开新会话，见"换角色"节），点 ★ 把常用场景置顶进前列，示例问题点击填入输入框。

![门户首屏（亮色）](../../screenshots/kb-redesign/01-hero-light.png)

发出第一个问题后，会话顶部出现"对话 | 知识库 | 轨迹"页签。**知识库**页签是检索工作台：输入关键词（如"山梨酸"）检索，每条结果卡带编号徽标、来源（文档名 — 标题路径）、命中高亮和"引用并提问"（把该来源带回对话继续问）；下方是文档区（本次会话入库记录与文档总数）与累计用量。

![知识库工作台检索结果](../../screenshots/kb-redesign/03-workbench-search-light.png)

文档区点"添加文档"打开入库向导：**上传本地文件**页签（默认）直接选本机文件即入库（可多选）；**网页链接**页签粘贴 URL；**服务器文件**页签浏览目录选中文件（桌面默认安装无法浏览服务器文件时，向导会引导改用上传或网页链接——需要服务器文件时把文件放进工作区后让 agent 以 `kb_ingest` 入库，见上节导入我自己的资料）。

![入库向导](../../screenshots/kb-redesign/05-workbench-ingest.png)

侧栏的**知识库**入口始终显示当前文档数徽标，有会话时点击直达知识库页签；设置里的**知识库**页展示用量明细。每条答案下方渲染来源轨迹（SourceTrail）：编号引用 chip 一行排开，点开知识库 chip 可核对原文摘录与命中词，湖仓答案的 chip 直接标注来源表名——跨源（知识库/数据湖/业务平台）答案一眼可溯。

![会话内编号来源卡](../../screenshots/kb-redesign/07-toolview-citations.png)

## 场景库

[scenarios/](scenarios/README.zh.md) 提供 30 个角色场景（AI 营销洞察主管、智能品控主管、AI 食安服务主管、AI 退税管家等），每个场景含角色预设、专用脱敏语料与技能说明。校验全部场景：

```sh
pnpm vitest run examples/kb-agent/tests/scenarios.spec.ts
```

试用某个场景：把它的语料入库后按场景问题提问。以"AI 营销洞察主管"（market-insight）为例：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "用 kb_ingest 把 examples/kb-agent/scenarios/market-insight/data/corpus.md 入库（doc_kind 取 report），然后回答：电商渠道 GMV 表现如何？"
```

预期回答按"品类规模—渠道结构—机会点"组织并带 `[n]` 引用。

## 质量评测

120 题检索评测（`eval/questions.json`，2026-09-05 实测混合模式 Top5 命中 98.3%，出海/工艺/市场/食安四类 100%），两种模式：

```sh
# 纯文本模式（无需 key）
node --import tsx/esm examples/kb-agent/scripts/eval-retrieval.mts

# 混合模式（需 .env 里的 MINIMAX_API_KEY）
DSH_EVAL_HYBRID=1 node --import tsx/esm examples/kb-agent/scripts/eval-retrieval.mts

# 混合模式 + 引用有效性（每题真实问答，约 7 分钟）
DSH_EVAL_HYBRID=1 node --import tsx/esm examples/kb-agent/scripts/eval-retrieval.mts --answers
```

2026-08-31 实测（Node 22.19.0）：纯文本 Top5 命中 71%，混合模式 Top5 命中 99%，引用有效率 96%。明细写入 `eval/results-text.json` / `eval/results-hybrid.json` / `eval/results-hybrid-answers.json`——三个结果文件由上述命令随时可再生，不入库（`.gitignore` 已忽略），`eval/questions.json` 随仓库分发。

## 常见问题

- **启动报 `No such built-in module: node:sqlite`**：Node 版本过低。执行 `nvm use 22.19.0` 后重试；本仓库要求 Node 22.19+。
- **启动报 `ENOENT ... scandir .../examples/kb-agent/workspace/data/connector-files`**：2026-09-10 起不再发生——connector-file 提供程序对缺失目录自动创建（以空数据集起步），运行中目录被删也只降级为空文件资产、不再打挂整个市场；目录被普通文件占据等真实配置错仍会 fail-loud。
- **拔掉 embed key 后还能用吗**：能检索。没有 `MINIMAX_API_KEY` 时每次 `kb_search` 以 `mode: 'text'` 纯文本运行、`embed_available: false`，入库/检索/统计闭环完整；仅对话请求以 `MISSING_CREDENTIAL` 失败。key 写入根 `.env` 或导出环境变量后两半都工作（仅经工作台 Models 页存入的 key 服务对话但不服务向量）。
- **换企业/换租户**：租户是部署配置不是对话参数——`cordis.patch.yml` 的 `tool-kb` 行读取环境变量 `DSH_KB_TENANT`（默认 `demo-food-co`），模型从不提供租户。一家企业一个部署，见 [DEPLOY.zh.md](DEPLOY.zh.md) §3。
- **升级后启动报 schema version 不兼容**：旧知识库文件被新构建拒绝（fail-loud），报错含盘上版本号。从源文档重新入库，或恢复同版本备份；不要手改 SQLite 文件。本示例的旧 v1 库已改名 `workspace/kb.sqlite.v1-backup` 留存（新库随后自动重建），旧库不会被新构建读取；升级与回滚的完整处理见 [DEPLOY.zh.md](DEPLOY.zh.md) §6。
- **下单后订单变 `failed`，error 提到 `max-tokens` 截断**：起草的方案 JSON 在输出预算内写不完（seam 默认 4096 token 不够真实方案）。生产组合已在 `cordis.patch.yml` 的 expert-orders 段配 `draftMaxTokens: 16384` 与 `draftTimeoutMs: 120000`；自建组合若漏配这两项会复现截断，补配后对 `failed` 订单重新发起交付即可。
- **订单 `failed`，error 是「起草输出不是合法 JSON」**：模型偶尔在 JSON 前后夹说明文字、留尾随逗号或提前截断。解析层会先自动修复这些常见噪声；修复不了时携带解析错误自动重新起草一次，两次都失败才把订单落 `failed`（不假装成功，可重新交付）。若频繁出现，检查起草路由是否偏离 MiniMax-M3。
- **无 key、无 NocoBase 时跑 `demo-full-journey` 会怎样**：三个场景各自自跳过（SKIP）并输出原因，进程正常退出（退出码 0），实录照常落 `demos/full-journey-<时间戳>.md`；只有某个场景的断言失败才以非零码退出。跳过不是失败——按实录里的提示补齐环境（`.env` 写入 MINIMAX_API_KEY、`setup-nocobase.mts start`）后重跑即可。
- **进程中途被杀或恢复失败后，订单停在审批前不动**：demo 与真实轨道 e2e 会临时停用生产审批流、用私有副本（标题带 `-demo` / `-e2e` 后缀）跑完再恢复；进程被强杀或恢复请求失败时，生产流停留在停用态，新订单不会触发审批。手动恢复：打开 NocoBase（默认 `http://127.0.0.1:13000`）→ 左侧「工作流」→ 列表中「专家服务订单审批交付」行启用；残留的私有副本可在同一列表删除。
- **对话报错 `duplicate tool_call id (2013)` 或工具调用显示 `unknown tool`？**：这是 2026-09-02 已修复的 MiniMax 并行工具调用聚合缺陷（模型并行调用多个工具时，流式续传片段的空 id/name 覆盖了正确身份）。修复后新会话的并行检索正常；**此前因此报废的旧会话在重启服务后也能继续使用**（发送端防线会自动修复历史中的空 id）。若仍遇此错，重启 Web 服务即可。
- **`dsh web --no-open --patch x` 报 `unknown option '--patch'`**：flag 顺序契约——`--patch`/`--profile` 等是 dsh 启动器的 flag，必须写在 `web` 之后、web 应用自己的 flag（`--no-open`、`--host`、`--port` 等）之前；从第一个启动器不认识的参数起，其余参数全部原样交给 web 应用。正确写法：`dsh web --patch x --no-open`。
- 更多细节：[README.zh.md](README.zh.md)（能力与已知限制）、[DEPLOY.zh.md](DEPLOY.zh.md)（私有化部署）、[WEBSITE.zh.md](WEBSITE.zh.md)（运营站对接）。

## 生产部署

单台 Linux 主机、systemd 守护、SQLite 单文件备份即可跑一个租户；网关无鉴权只留 localhost 或置于带鉴权的反向代理之后。完整步骤（安装、配置、备份恢复、升级、安全要点）见 [DEPLOY.zh.md](DEPLOY.zh.md)。
