# N8 调研底稿 01：本地一手验证事实（loop-planner 自查，2026-09-09）

来源：直接 clone 官方仓库 + 读取 `platform/nocobase` 快照源码 + 查询运行中 PG17 DB + 实调 :13000 REST API。所有结论均为一手证据，未经二手转述。

## 1. 官方 demo 仓库的本质（决定复刻路径）

`nocobase/demo-portal-crm` 与 `nocobase/demo-portal-hub`（clone 自 GitHub，commit `bd7092c` 2026-08-14 "take the 3.1.1 base template"）：

- **是独立前端应用，不是 NocoBase dump**：Vite 6 + React 19 + Refine 5 + shadcn/ui + Tailwind 4，基于 `@nocobase/portal-sdk`（`defaultTemplateVersion: 3.1.1`）。
- **不含后端 collection 定义与种子数据**：仓库内没有 dump/schema JSON；`src/pages` 全是前端页面；只有 `scripts/verify-crm.cjs`（Playwright 截图验收脚本）与 e2e 测试。
- **部署通道**（`.env.example` + `verify-crm.cjs` 证据）：
  - 构建产物托管在 NocoBase 的 `storage/dist-client/<portal>/` 下；
  - 快照 `platform/nocobase/packages/core/server/src/gateway/index.ts`（L499-512）确认 gateway 把 `APP_PUBLIC_PATH + 'dist/'` 路径静态映射到 `storagePathJoin('dist-client')`（serve-handler, directoryListing: false）；
  - 官方 demo 的 `/v/admin/...` 是 NocoBase client-v2（`/v/` 前缀，gateway `isV2Request` 分支）路由；portal 类应用走 `/x/<name>/`（官方环境）或本快照等价的 `/dist/<name>/` 路径。
  - `NOCOBASE_API_URL=/api` 同源直连 REST；认证走 NocoBase 标准 `basic` authenticator（`NOCOBASE_AUTHENTICATOR=basic`），登录页内置于 portal。
- **CRM portal 页面模块**（`src/pages/crm/` 一手目录）：leads、customers、contacts、deals、quotes、products、activities、follow-ups、targets、reports、dashboard、ai-assistant.tsx（AI 雇员内嵌入口）、audit-trail、global-search、quick-create。
- **CRM portal 依赖的后端 collections**（grep resource 声明）：`crm_leads / crm_customers / crm_contacts / crm_deals / crm_quotes / crm_products / crm_activities / crm_follow_ups`（`crm_` 前缀，与既有 5 业务 collections 零命名冲突）。
- **Hub portal 依赖的后端 collections**（grep resource 声明，约 17+）：`hub_hr_employees / hub_hr_departments / hub_hr_leave_requests / hub_sales_deals / hub_sales_contacts / hub_sales_activities / hub_pj_projects / hub_inv_products / hub_inv_stock_moves / hub_po_suppliers / hub_as_assets / hub_as_assignments / hub_as_maintenance / hub_kb_articles / hub_kb_article_feedback / hub_fin_invoices / customers …`。
- **前端 AI 集成**：CRM package.json 含 `@ai-sdk/react 2.0.0`、`ai 5.0.0`、`@nocobase/ai-employee-avatars`、`eventsource-parser`（SSE 流）——AI 雇员对话组件内嵌 portal。
- **nocobase 组织 demo/模板仓库全集**（GitHub API 枚举）：`portal-template-default`（模板源仓库，含 sdk/、registry/、MIGRATION.md）、`demo-portal-crm`（"AI-built CRM portal (all-in-one demo)"）、`demo-portal-hub`（"9 modules unified"）、`demo-portal-it`、`demo-portal-helpdesk`、`demo-portal-car-rental`、`demo-portal-sc`、`demo-portal-scm`、`demo-portal-tasks`；另有 `ai-employee-avatars`、`skills`、`nocobase-ctl`、`mcp-server-nocobase`、`nocobase3`。

## 2. 快照内插件与当前启用状态（DB 实查）

- 快照自带 91 个 `@nocobase/plugin-*` 源码目录（`platform/nocobase/packages/plugins/@nocobase/`，workspace symlink 即用）+ 21 个 `@nocobase-example` 示例插件。
- **当前已启用 60 个**（`SELECT name FROM "applicationPlugins" WHERE enabled=true` 实查）：包含 **ai（AI 员工）**、calendar、gantt、kanban、data-visualization、file-manager、block-workbench、mobile、workflow 全家（21 个 workflow-*）、flow-engine、mcp-server、map 未启用、comments 未启用。
- **源码在快照内但未启用的功能插件**（`yarn nocobase pm enable <name>` 或 REST `POST /api/pm:enable` 即可启用，零网络）：`map`、`comments`、`public-forms`、`notification-email`、`audit-logs`、`departments`、`localization`、`charts`、`data-visualization-echarts`、`backup-restore`、`auth-sms`、`collection-fdw`、`graph-collection-manager`、`field-china-region`、`multi-app-manager`、`ai-gigachat`、`embed`、`snapshot-field`、`field-code`、`multi-keyword-filter` 等。
- 快照内**不存在**的插件名（需 npm 或不可得）：announcement（公告）等——待 deep-research 子任务确认 npm 可装性与 2.2.6 兼容版本。
- 快照内含 `plugin-disable-pm-add`（启用它会封死 pm add 通道；当前未启用，保持不启用）。

## 3. AI 员工：插件就绪，唯一缺口是 llmServices

- `plugin-ai` 即官方 "AI 员工" 插件：`displayName.zh-CN: "AI 员工"`，version 2.2.6，`supportedVersions: ["2.x"]`，`editionLevel: 0`（开源），基于 LangChain（`@langchain/openai`、`langgraph`、anthropic/deepseek/kimi/ollama/xai/mistral providers）。
- **已启用且已建全表**（DB 实查）：`aiEmployees`（8 名内置雇员，builtIn=true，enabled=true）、`aiConversations`、`aiMessages`、`aiSettings`（1 条：storage local）、`llmServices`、`aiSkills`、`aiMcpClients`、`aiUsageEvents`、lcCheckpoint* 等。
- **8 名内置雇员**（REST `GET /api/aiEmployees:list` Bearer 实调成功）：atlas（Team leader，编排组长，委派其他雇员）、nathan（前端）、dara（数据可视化）、dex（数据整理）、ellis（邮件）、lexi（翻译）、vera（研究分析）、viz（洞察分析）。
- **根因**：`GET /api/llmServices:list` 返回空（`totalPage: 0`）——未配置任何 LLM provider，雇员无法对话，UI 入口因此"看不见/不可用"。
- **LLM provider 可自定义**（源码证据）：
  - `src/server/collections/llm-services.ts` + `src/server/llm-providers/openai/completions.ts`：`OpenAICompletionsProvider.createModel()` 用 `new ChatOpenAI({ apiKey: this.serviceOptions?.apiKey, configuration: { baseURL: this.getResolvedBaseURL() } })`；
  - `provider.ts` 的 `getResolvedBaseURL() = getServiceBaseURL(serviceOptions) ?? this.baseURL`——**serviceOptions.baseURL 可覆盖默认**（默认 `https://api.openai.com/v1`）；
  - 即：在 `llmServices` 建一条 `{provider: 'openai-completions', options: {baseURL: <MiniMax OpenAI 兼容端点>, apiKey: <MINIMAX_API_KEY>}, enabledModels: [<model>]}` 即可接通。
- **provider 注册名全集**（`plugin-ai/src/server/plugin.ts:177-192` `registerLLMProviders()`）：`google-genai / openai(Responses API) / anthropic / deepseek / dashscope / kimi / mimo / mistral / ollama / openai-completions / xai / orcarouter / shengsuanyun`。MiniMax 走 `openai-completions`（标准 chat completions + 自定义 baseURL），嵌入走其 embedding provider。
  - 出站白名单：`@nocobase/utils` `checkUrlAgainstWhitelist`（`packages/core/utils/src/server-request.ts:204`）——`SERVER_REQUEST_WHITELIST` 未设置时默认放行（仅 SSRF 告警）；设置了则须包含 LLM host。当前 `.env` 未设 → MiniMax 端点默认放行。
- **工作流集成**：plugin-ai 自带 workflow 触发器 `ai-employee` 与 LLM/employee 节点（`src/server/workflow/`）——AI 可挂进订单审批等现有 workflow。

## 4. 当前业务数据面（与 demo 导入的冲突评估）

- REST `GET /api/collections:list` 实查：业务 collections 仅 `experts / expert_services / datasets / customs_export / orders`（+系统 roles/users）。`knowledge_assets` 是 `datasets` 的 title 而非表名（handoff 文档表述与代码不符，以代码为准）。
- `crm_*` / `hub_*` 前缀与既有 5 collections **零冲突**；demo 数据导入不会覆盖现有表。
- `dsh-harness` root API key 由 `setup-nocobase.mts init` 签发（revoke-then-create 幂等），`NOCOBASE_BASE_URL=http://127.0.0.1:13000`。
- 订单审批 workflow「专家服务订单审批交付」四节点链（manual→condition→request/callback→update）依赖生产 workflow title 与 wiring，demo 导入不得触碰。

## 5. setup 链扩展点（脚本一手分析）

`examples/kb-agent/scripts/setup-nocobase.mts`（525 行）命令：`all(默认) | install | build | start | init | verify | stop | reset`：

- `stepInstall`：`yarn install` → `ensurePostgres`（pg_ctl 拉起 PG17 + psql 幂等建 role/database）→ `yarn nocobase install`。幂等判据：`node_modules/.bin/nocobase-v1` 存在。
- `stepBuild`：`yarn build` 双产物 `packages/core/app/dist/client/index.html` + `dist/client/v/index.html`。幂等：双 index.html 存在即保留；`NOCOBASE_FORCE_BUILD=1` 强制。
- `stepStart`：detached `yarn dev-server`（日志 `/tmp/nocobase-dsh-server.log`），`serverUp/healthy/uiReachable` 三级探测。
- `stepInit`：5 collections（GET 存在即 kept）→ API key 签发 → 专家播种（`seed-experts.mts`）→ workflow（`ensureWorkflow`，含 2.2.6 已知坑：创建时 enabled 不挂 hook 需双 toggle）→ `writeEnv`。
- `stepVerify`：uiReachable + collections + 字段 wiring + 种子 + workflow + API key 实调，全量断言收口。
- **扩展方式**：新增 `stepPlugins`（`POST /api/pm:enable` 或 `yarn nocobase pm enable`，幂等判据 `pm:list`/`pm:get`）、`stepImport`（demo collections + 种子数据，幂等沿用 GET-存在-即-kept）、`ensureLlmService(token)`（与 `ensureWorkflow` 同级，复用 `call/dataOf`），`main()` switch（L506-522）加 case，`all` 链插入。

## 6. DSH 侧集成面（回归基线）

- apiproxy nocobase 域：`packages/host/apiproxy/src/api/nocobase.ts`（listMeta/list/get 三读）+ `nocobaseGates`（`nocobaseEnabled!==true` 全拒）。
- webserver `/nocobase` iframe 反代：`packages/host/webserver/src/nocobase-proxy.ts`（HTML 四注入点重写 + 插件清单重写 + WS upgrade + framing 剥离）；overlay 开关 `examples/kb-agent/cordis.patch.yml`（`nocobaseProxyOrigin` → :13000、`nocobaseEnabled: true`）。**新增插件会改变插件清单 → 清单重写规则需随插件数量增长复验。**
- ui-business 三 slot + iframe embed：`packages/client/ui-business/src/client/index.ts:116-147`、`BizView.tsx:227`。
- 五场景 demo：`examples/kb-agent/scripts/demo-full-journey.mts`（场景 1/3/4 触 NocoBase；场景 3 依赖 workflow title「专家服务订单审批交付」与四节点 wiring、`orders.fulfill` 回调信封）。
- mock 同构：`packages/connector/connector-nocobase/tests/mock-server.ts:74-76` 声明同 5 collections。
- kg-build 五 collection 映射：`examples/kb-agent/cordis.patch.yml:168-198`。

## 7. 商业边界（待子任务 #3 交叉验证的本地证据）

- 快照 `plugin-ai/package.json` `editionLevel: 0` ——插件内嵌的开源等级字段；`plugin-license` 已启用（商业授权管理器存在）。
- MANIFEST 声明商业插件"不在开源仓、本快照不包含、永不复制"；npm 凭据位 `NOCOBASE_PKG_USERNAME/PASSWORD` 为空。
