# N8 实施计划：NocoBase 官方 Demo 级完整功能复刻（2.2.6 快照）

> 面向下一位实施者（code 模式）：本文 + [批次详表 01-batches.md](01-batches.md) 是唯一动工依据，配套三份调研底稿可直接溯源。所有"为什么"都在本文，所有"怎么做"都在批次详表。

**目标一句话**：把 `platform/nocobase`（2.2.6 源码快照）从"基础插件 + 5 个业务 collections"提升到官方 demo 级完整功能——admin 侧 8 大业务模块（CRM/订单/项目/工单/资产/HR/主数据/工作台）、AI 员工真实对话（MiniMax）、CRM/Hub 双 Portal 前端——同时保证既有五场景 demo、DSH 双入口、setup 幂等链零回归。

**北极星（用户原话）**："NocoBase页面为什么和官方demo不一样，缺失很多功能，没有完整的crm，也没有ai功能……怎么也没见ai雇员，重新对NocoBase进行调研规划，我要完整功能"

---

## 1. 调研结论摘要（关键问题清单逐一回答）

### 1.1 官方 demo 里到底有什么

浏览器实探 17 个页面（详见 [research/2026-09-09-nocobase-official-demo-replication.md](../../research/2026-09-09-nocobase-official-demo-replication.md) §3.1，含每页 URL）：

- **demo 实例 = NocoBase v2.4.0-alpha.4**（`/api/app:getInfo` 实证），是"一个应用内的 8 大模块"，不是 CRM 单模板：Workbench（跨模块仪表盘）/ Customers CRM / Orders 销售流程 / Projects / Tickets 工单+知识文章 / Assets 资产 / Employees HR / Settings 主数据。
- **CRM 链路 = Leads 看板（7 阶段）→ 报价单 → 订单 → 回款 → 发票**，无"合同"实体；Customers 支持合并（自定义操作）。
- **Tasks 页四视图 tab**：Kanban（默认）/ Calendar / Table / Gantt——全部是 NocoBase 原生区块视图，非独立应用。
- 仪表盘 = 统计卡 + 趋势/分布图表（data-visualization）；文档指南页 = markdown/文档区块。
- **AI 入口**：顶栏 AI 聊天按钮（`ai-chat-button-badge`）+ 全区块 `ai-selectable`（可被 AI 选为上下文）。
- 官方 demo 本身数据不均：销售/工单有真实数据，Projects/Assets/HR 为 0 行——复刻需自行造数。
- demo 所需插件 2.2.6 快照内**全部内置或 pm enable 即得**（map/comments/echarts 等仅未启用），商业项见 §4。

### 1.2 demo-portal-crm / demo-portal-hub 的本质与复用方式

- **是独立前端应用**（Vite 6 + React 19 + Refine 5 + shadcn/ui + `@nocobase/portal-sdk` 2.1.0），**不是 NocoBase dump，无法 restore 导入**；通过 NocoBase REST API（`/api/<resource>:<action>`，带 X-Authenticator/X-Role/X-Portal 头）读写后端。
- 仓库内**不含后端 collections 定义与种子数据**——后端数据模型需我们自建。
- 部署通道（本地快照源码实证）：构建产物放 `storage/dist-client/<name>/`，经 gateway 的 `/dist/<name>/` 路径静态托管（[`gateway/index.ts`](../../platform/nocobase/packages/core/server/src/gateway/index.ts:499) `APP_PUBLIC_PATH + 'dist/'` → `storagePathJoin('dist-client')`）；同源 `/api` 直连、复用 NocoBase basic authenticator 登录。
- 依赖的后端 collections（仓库 grep 实证）：CRM = `crm_leads / crm_customers / crm_contacts / crm_deals / crm_quotes / crm_products / crm_activities / crm_follow_ups`；Hub = `hub_hr_* / hub_sales_* / hub_pj_* / hub_inv_* / hub_po_* / hub_as_* / hub_kb_* / hub_fin_*` 约 17 个。
- **风险点**：X-Portal 头/Portal 记录机制是 2.3/2.4 服务端能力，2.2.6 源码无 portal 插件、npm 无 `@nocobase/plugin-portal`——在 2.2.6 上部署 Portal 属未验证路径，须 PoC 先行（见 B5）。
- nocobase 组织 demo 仓库全集：`portal-template-default`（官方模板）+ demo-portal-{crm,hub,it,helpdesk,scm,sc,tasks,car-rental} 共 9 个（均 2026-08-14 前后批量更新）。

### 1.3 AI 功能与"AI 雇员"

- **AI 雇员 = 内置插件 [`plugin-ai`](../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/package.json)（displayName.zh-CN"AI 员工"，editionLevel 0 开源，2.0.0 起入 preset builtIn）**，无独立 ai-employee 包（npm E404 实证）。
- **本地实例已经启用且建全表**：DB 实查 `applicationPlugins` 含 `ai`（enabled=true），`aiEmployees` 表 8 名内置雇员（atlas 编排组长/nathan 前端/dara 数据可视化/dex 数据整理/ellis 邮件/lexi 翻译/vera 研究/viz 洞察，全部 enabled；docs 的 9 人名单含 lina/orin 是 2.3+）。
- **用户"看不见 AI 雇员"的根因**：`llmServices` 表为 0 条（`GET /api/llmServices:list` 实证）——没配任何 LLM provider，雇员无法对话。
- **补齐只需一步**：建 llmService `{provider: 'openai-completions', options: {baseURL: <MiniMax 端点>, apiKey: <MINIMAX_API_KEY>}, enabledModels: [Manual input 模型]}`。源码实证 `getResolvedBaseURL() = getServiceBaseURL(serviceOptions) ?? 默认`（[`provider.ts`](../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/llm-providers/provider.ts)）；provider 注册名全集：`openai / openai-completions / anthropic / deepseek / google-genai / dashscope / kimi / mimo / mistral / ollama / xai / orcarouter / shengsuanyun`（[`plugin.ts:177-192`](../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/plugin.ts:177)）。
- UI 路径：系统设置 → AI 员工 → LLM service（Add New → Provider/API Key/Base URL → Enabled Models Manual input → Test flight）。对话入口三个：右下角主入口、区块 Actions 入口、特定场景入口（Nathan→JS Block、Dara→图表）。
- 出站白名单：`SERVER_REQUEST_WHITELIST` 未设置时默认放行（[`server-request.ts:204`](../../platform/nocobase/packages/core/utils/src/server-request.ts:204)），当前未设 → MiniMax 端点直连无阻。
- 另有 `plugin-ai-gigachat`（快照内未启用）、`plugin-mcp-server`（已启用——NocoBase 可作为 MCP 服务端暴露给 DSH/外部 Agent）。

### 1.4 插件缺口与 2.2.6 兼容性

- 快照 `packages/plugins/@nocobase/` 有 91 个插件源码目录（workspace symlink 即用）；DB 实查当前启用 60 个（preset builtIn 集，含 ai/calendar/kanban/gantt/data-visualization/file-manager/workflow 全家）。
- **快照内源码在、只需 `pm enable` 的功能插件**：`map`、`comments`、`data-visualization-echarts`、`charts`、`public-forms`、`notification-email`、`departments`、`localization`、`graph-collection-manager`、`backup-restore`、`field-china-region`、`collection-fdw`、`ai-gigachat`、`audit-logs`（注：npm 无 2.x 版、docs 标 Enterprise，快照内源码在——启用实测为准，失败即降级标注）。
- **npm 不存在/装不了**（E404 实证）：`plugin-announcement`（2.x 无此包）、`plugin-files`（更名 file-manager）、`plugin-user-center`、`plugin-notification-mailer`、全部商业插件。
- 兼容策略：lerna 统一版本，npm 上开源插件均有精确 2.2.6 版本；本计划**优先用快照内置源码（零网络），npm 安装仅作补充通道**。

### 1.5 与既有 5 个业务 collections 的共存

- demo 的 `crm_*` / `hub_*` 前缀与既有 `experts / expert_services / datasets / customs_export / orders` **零命名冲突**；demo 模块数据独立成组，不覆盖现有表。
- 必须保护的三条既有契约：① 订单审批 workflow「专家服务订单审批交付」的 title 与四节点 wiring（demo-full-journey 场景 3 依赖）；② `dsh-harness` root API key 的 revoke-then-create 幂等；③ mock 同构清单 [`mock-server.ts:74-76`](../../packages/connector/connector-nocobase/tests/mock-server.ts:74)（新增 collections 不动这 5 个即无需同步）。
- 菜单结构：当前 `desktopRoutes` 仅 2 条（"专家数据"页 + tabs）——demo 模块作为新菜单组加入，不动既有菜单项。
- DSH :3080 的 iframe 反代与 `nb_*` 工具面只消费既有 5 collections，不受 crm_/hub_ 新增影响；但**新增插件会改变 :13000 插件清单 → webserver 反代的插件清单重写规则需复验**（[`nocobase-proxy.ts`](../../packages/host/webserver/src/nocobase-proxy.ts)）。

### 1.6 风险总览

| 风险 | 等级 | 预案 |
|---|---|---|
| 启用新插件后 v2 客户端缺 chunk（需 `yarn build` ~20 分钟） | 中 | B1 首批实测一个插件；需要则 `NOCOBASE_FORCE_BUILD=1` 重建一次，后续插件增量启用复用该结论 |
| Portal 的 X-Portal/SDK 版本检查在 2.2.6 失败 | 中高 | B5 PoC 先行（只验登录链路）；失败降级：portal 不部署，admin 原生页面已达 demo 外观（B2/B3 已覆盖），并在交付说明中明示 |
| UI schema 程序化搭建复杂度超预期 | 中 | 程序化优先（REST），复杂视图（看板/仪表盘 tab）浏览器手工配置并把操作记录写进验收实录；幂等由"存在即 kept"兜底 |
| audit-logs 实为 2.x 商业 | 低 | 启用实测；失败即从清单移除并标注（demo 的审计页本就属商业沙盒） |
| MiniMax 对话质量不达 demo 观感 | 低 | 验收锚点=真实对话往返+内容合理，不与官方 demo 效果对比；可配多模型（openai-completions Manual input） |
| dump 导入路径死路（版本约束高→低禁止 + 无官方 dump） | — | 已裁决放弃该路径，不做 |
| AGPL 双许可合规 | 低 | 内部使用无碍；若对外分发需读 `platform/nocobase/LICENSE.txt`（快照策略已在 MANIFEST 声明） |

---

## 2. 技术决策（已定，不再讨论）

1. **不升级 NocoBase 版本**：2.4-alpha 无稳定性承诺（demo 即 alpha + 全商业沙盒）；2.2.6 快照策略=重新快照+重放补丁，升级超出 N8 范围。所有目标功能经调研在 2.2.6 均可实现或明示替代。
2. **放弃 dump/restore 路径**：备份还原禁止"高版本备份→低版本实例"，且官方未发布 demo dump；复刻走"程序化重建 collections+页面"。
3. **collections 命名对齐 demo-portal 前端**（`crm_*` / `hub_*`）：为 B5 Portal 部署铺路（portal 前端硬编码这些资源名），同时与既有 5 collections 物理隔离。
4. **AI provider 走 `openai-completions` + MiniMax OpenAI 兼容端点**（`MINIMAX_API_KEY` 复用，`.env` 已有），Manual input 填模型 ID；不引入新供应商。
5. **页面搭建双轨**：collections/字段/关联/种子数据/菜单骨架全部程序化（REST，幂等，进 setup 链）；复杂视图（看板列、图表仪表盘、四视图 tab）浏览器手工配置，操作步骤写入批次验收实录（手工面不追求幂等重放，只要求可重复操作说明）。
6. **Portal 部署走快照内置 gateway 静态托管**（`storage/dist-client/<name>/` → `/dist/<name>/`），不引入 nb CLI 2.2.8（其 portal 命令族面向 2.3+）。
7. **快照源码零修改**：所有扩展走"运行配置 + REST + storage 产物"，不动 `platform/nocobase` 源码 → 无需登记 MANIFEST local-modifications；插件启用状态存 DB（运行时数据），不算源码修改。
8. **setup 链只扩不改语义**：新增阶段/函数，既有 install→build→start→init→verify 行为与幂等判据不变（详见批次详表每批的"setup 扩展点"）。

---

## 3. 批次总览（6 批，顺序执行，详见 [01-batches.md](01-batches.md)）

| 批次 | 一句话 | 主要交付 | 独立验收锚点 | 状态 |
|---|---|---|---|---|
| B1 插件全景启用 | 把快照内"源码在、未启用"的功能插件全部 enable + 重启 | [`setup-nocobase.mts`](../../examples/kb-agent/scripts/setup-nocobase.mts) 新增 `stepPlugins` | 浏览器：插件管理页全 enabled；区块菜单出现"评论/地图/echarts 图表"等新选项 | ✅ 2026-09-09（含 audit-logs，无需重建） |
| B2 CRM 业务模块 | 复刻 demo Customers+Orders 模块（leads 看板→报价→订单→回款→发票） | 新脚本建 `crm_*` 8 collections + 关联 + 种子 + 菜单组 + 页面 | 浏览器：CRM 菜单组逐页可开，Leads 看板 7 列、报价单表格有数据 | ✅（10 collections、区块全程序化；仪表盘图表降级记录） |
| B3 企业 Hub 模块 | 复刻 demo Projects/Tickets/Assets/HR/Settings + Workbench 工作台 | 新脚本建 `hub_*` collections + 种子 + Tasks 四视图页 | 浏览器：Tasks 页 Kanban/Calendar/Table/Gantt 四 tab 可切换 | ✅（四视图=四页面偏差记录） |
| B4 AI 员工接入 | 配 llmServices 接 MiniMax，8 内置雇员真实对话 | setup 新增 `ensureLlmService`；可选中文业务雇员 + workflow LLM 节点演示 | 浏览器：右下角 AI 入口 → 与 atlas 真实对话往返（真实 LLM 调用） | ✅（两轮真实对话 + aiMessages 实证） |
| B5 Portal 前端 | 部署 demo-portal-crm/hub 到 `/dist/crm|hub/`（PoC 先行） | 新脚本 vendor + build + 部署到 storage/dist-client | 浏览器：`/dist/crm/` 登录后看板页可交互（若 PoC 失败则降级明示） | ✅（双 Portal 全通，X-Portal 风险未触发） |
| B6 整合回归收口 | 双入口回归 + 五场景全绿 + setup all 幂等 + 文档/Agent Note | 回归清单执行记录 + 文档更新 | `setup-nocobase.mts all` 二连跑 EXIT=0；五场景 demo 全 PASS | ✅（双跑 EXIT=0、五场景 5/5、typecheck 绿） |

依赖关系：B1 → B2 → B3 → B4 严格顺序（B2/B3 页面依赖 B1 新区块插件；B4 独立于 B2/B3 但验收要用 B2 数据）；B5 依赖 B2（crm_* collections）+ B4（portal 内嵌 AI 聊天可选）；B6 收口全部。

## 4. 商业/不可得功能明示清单（对用户不隐瞒）

| 官方 demo 中的能力 | 状态 | 本计划处理 |
|---|---|---|
| AI: Knowledge base（RAG 知识库） | Professional 商业，npm E404 | 不装。替代：`plugin-mcp-server` 已启用，可把 DSH KB 经 MCP 暴露给 AI 员工（B4 可选任务） |
| Workflow: Approval / Subflow / Webhook | Professional 商业 | 不装。既有 manual+condition+request 节点链即审批式工作流（订单审批已在用）；Webhook 用 HTTP Request 触发器替代 |
| Audit logs（审计日志） | Enterprise（快照内有源码目录，npm 无 2.x） | B1 尝试 enable，失败即移除并标注 |
| SSO（OIDC/SAML/LDAP）、2FA | Professional/Enterprise | 不装。`idp-oauth`（已启用）可覆盖 OIDC 出方向 |
| 去品牌/自定义 Logo | Standard | 不做（AGPL 合规） |
| demo 的 alpha 特性（AI Portal `/x/` 路由、Lina/Orin 雇员等 2.3+ 内容） | 2.2.6 不具备 | 明示版本差；不追 alpha |
| 钉钉集成（demo-portal 依赖 dingtalk-jsapi） | 生态/商业 | Portal 部署不启用钉钉登录扩展 |

## 5. 验收标准（N8 完成定义）

1. **admin 完整度**：:13000 侧边栏含 CRM/订单/项目/工单/资产/HR/主数据/工作台模块组，逐页对照 [demo 页面清单](../../research/2026-09-09-nocobase-official-demo-replication.md) 可打开、有数据、视图类型一致（看板/日历/甘特/表格/图表）。
2. **AI**：`llmServices` ≥1 条 MiniMax 配置；右下角 AI 入口可与 atlas 完成≥2 轮真实对话（服务端 `aiMessages` 表有真实 LLM 往返记录）。
3. **Portal**（B5 成功时）：`http://127.0.0.1:13000/dist/crm/` 登录（admin@nocobase.com）后 dashboard/leads/quotes 页可交互；（B5 降级时）：交付说明明示原因与 admin 替代路径。
4. **零回归**：`demo-full-journey.mts` 五场景全 PASS；:3080 七页面 + `/nocobase` iframe 反代可用；`setup-nocobase.mts all` 连跑两次 EXIT=0。
5. **过程资产**：每批验收实录（浏览器截图/操作记录）+ Agent Note + 本 PLAN 的批次勾选更新。

## 6. 硬约束（不可破坏，实施全程有效）

- 既有五场景 demo（REST 轨道依赖 NOCOBASE_API_KEY + 5 collections + 生产 workflow title/wiring）不可破坏。
- DSH 双入口（:3080 与 :13000 + iframe 反代）不可破坏。
- setup 链幂等语义（存在即 kept / revoke-then-create / verify 收口）不可破坏。
- `platform/nocobase` 快照源码不修改（运行配置/storage 产物除外）。
- 每批动工前 `pg_dump nocobase > /tmp/nocobase-batch-N-backup.sql` 留快照点，回滚即 restore。

## 7. 调研底稿索引

| 底稿 | 内容 |
|---|---|
| [research/01-local-firsthand-facts.md](research/01-local-firsthand-facts.md) | 本仓一手验证：demo 仓库结构、plugin-ai 源码/DB/API 实证、gateway 托管、启用插件清单、setup 扩展点、DSH 集成面 |
| [research/2026-09-09-nocobase-official-demo-replication.md](../../research/2026-09-09-nocobase-official-demo-replication.md) | 官方 demo 17 页实探（每页 URL+视图+列头）、demo 仓库复用结论、备份版本约束、插件对照表 |
| [research/2026-09-08-nocobase-ai-plugins-and-commercial-boundary.md](../../research/2026-09-08-nocobase-ai-plugins-and-commercial-boundary.md) | AI 插件体系全解（provider/雇员/入口/MCP）、npm×2.2.6 兼容矩阵、四版商业边界清单、源码快照安装机制 |
