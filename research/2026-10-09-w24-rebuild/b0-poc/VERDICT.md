# W24-B0 VERDICT：carbon PoC 三态结论

- 判定时刻：2026-10-10（本地 05:4x~06:0x，证据文件时间戳为准）
- 判定人：B0 批实施者（本会话）；验证轮 R0 由独立 verify-executor 复核
- 结论：**GO（带边界注记）——按主计划 B3 全量实施，connector-carbon 以 PostgREST session 通路为主面**

## 0. 一句话结论

社区版（CARBON_EDITION=community）下，**经 GoTrue 密码会话 + kong :54321 的 PostgREST Data API，对核心业务表的完整 CRUD 机器调用可用且条款可接受**（README 官方背书"Data API 受 RLS 约束"，AGPL 内部使用无网络服务开源触发）；`/api/v1` oRPC 面对非 API-key 凭证显式拒绝（401 实证），API key 创建入口在社区版 UI 中只渲染"升级到 Enterprise"链接——该面维持商业门控，不阻塞 B3 主线。

## 1. 判定依据（逐条对应决定性实验）

### 实验 (a)：session 登录后经 kong :54321 的 PostgREST Data API 对核心表 CRUD

| # | 操作 | HTTP | 结果 | 证据文件 |
|---|---|---|---|---|
| a-1 | GET `/rest/v1/item?select=…&limit=3`（Bearer session JWT） | **200** | 3 行真实 satellite 数据（ADCS-001 姿态确定控制系统等） | [`exp-a1-rest-item-read.json`](exp-a1-rest-item-read.json) |
| a-2 | GET `/rest/v1/customer?…` | **200** | ORBSEC Defense / NovaSat Networks / Apex Space Research | [`exp-a2-rest-customer-read.json`](exp-a2-rest-customer-read.json) |
| a-3 | GET `/rest/v1/salesOrder?…` | **200** | SO000001~3（In Progress/Confirmed/Needs Approval） | [`exp-a3-rest-salesorder-read.json`](exp-a3-rest-salesorder-read.json) |
| a-4 | 无认证 GET（对照） | 200 + `[]` | anon 角色被 RLS 过滤为空集（安全模型生效） | [`exp-a4-rest-noauth.json`](exp-a4-rest-noauth.json) |
| a-5 | POST `/rest/v1/customer`（缺 companyId） | 403 | `new row violates row-level security policy`（42501） | [`exp-a5-rest-customer-create.json`](exp-a5-rest-customer-create.json) |
| a-5b | POST 同表**带 companyId** | **201** | 创建 `cust_KqhuyKUPix2wTiN146F7gt`（return=representation 回显全行） | [`exp-a5b-rest-customer-create2.json`](exp-a5b-rest-customer-create2.json) |
| a-6 | PATCH seed 行（写回原值） | **200** | 完整行回显（RLS UPDATE policy 放行 authenticated employee） | [`exp-a6-rest-customer-update.json`](exp-a6-rest-customer-update.json) |
| a-7 | DELETE PoC 行 | **204** | PG 侧 `after-delete-count=0` 复核 | [`exp-a7-rest-customer-delete.json`](exp-a7-rest-customer-delete.json) |

**结论 (a)**：CRUD 四面全通。INSERT 的 403→201 分野证明 RLS `WITH CHECK` 要求 companyId 匹配（租户上下文注入是调用方职责——ERP 前端经应用层 contextParams 注入，程序化客户端自带给定值即可）。customer 表四类 policy 齐备（[`exp-rls-policies-customer.txt`](exp-rls-policies-customer.txt)：SELECT/INSERT/UPDATE/DELETE × role=public，条件在 WITH CHECK/USING 内部）。

**条款评估**：Data API 是 carbon README 明示的三条官方访问路径之一（"用于无操作面覆盖的场景，受 RLS 约束"，r1 报告 §8 引 README :165）；session 是 ERP 前端自身通路；全程零 EE 代码路径（CARBON_EDITION=community，entitlements 不激活）。AGPL 侧：内部持有、不分发、不对外提供网络服务→无 13 条触发。**可接受**。

### 实验 (b)：`/api/v1` oRPC 面在无 API key 时的行为

| # | 调用 | HTTP | 响应体 | 证据文件 |
|---|---|---|---|---|
| b-1 | POST `/api/v1/sales/getSalesOrders` 无 Authorization | **401** | `Unauthorized: send your API key as \`Authorization: Bearer crbn_…\`.` | [`exp-b1-orpc-noauth.json`](exp-b1-orpc-noauth.json) |
| b-2 | 同调用 + Bearer session JWT | **401** | `The Carbon API v1 accepts API keys only. Use the MCP endpoint for OAuth connectors.` | [`exp-b2-orpc-session.json`](exp-b2-orpc-session.json) |
| b-3 | GET `/api/v1`（面存在性） | 405 | Method Not Allowed（路径存在，只收 POST） | [`exp-b3-orpc-openapi-head.json`](exp-b3-orpc-openapi-head.json) |

**结论 (b)**：oRPC 面只认 `crbn_` 前缀 API key；session JWT 被显式拒绝（不是权限不足，是凭据类型白名单）。API key 创建在社区版 UI 中被 EE 门控（[`ui-03-apikeys-ee-gate-zh.png`](ui-03-apikeys-ee-gate-zh.png)：页面仅有"API密钥用于以编程方式访问您的Carbon数据。**升级到 Enterprise**"文案与 carbon.ms/pricing 链接，无创建入口）。**不可申请（自助路径不存在），只能购商业许可**——与 r1 报告 §2.4 FEATURE_PLANS.API_KEYS 判定一致，实测坐实。

### 附加探查

| 探查项 | 结果 | 证据 |
|---|---|---|
| session 维持机制 | GoTrue v2.189 JWT（HS256，**1h 过期**）+ refresh_token；`POST /auth/v1/token?grant_type=password` 200、`grant_type=refresh_token` 200（长寿命程序化会话成立）；浏览器侧另有 ERP 应用层 session cookie（/callback 建 session） | [`exp-login-password.json`](exp-login-password.json)、[`exp-login-refresh.json`](exp-login-refresh.json) |
| magic link 无邮件获取 | `POST /auth/v1/admin/generate_link`（service_role key）200 返回 action_link，浏览器走 /verify → /callback 建立登录态（UI 截图由此取得） | [`exp-generate-link.json`](exp-generate-link.json) |
| WebSocket/realtime | kong `/realtime/v1/` 路由存在（ws + rest 双形态）；REST 探针 403（需鉴权）——**面开放、需带 JWT 握手，未做深测**（B3 需要时再评） | [`exp-realtime-probe.json`](exp-realtime-probe.json) |
| token 复用给程序化客户端 | 本次实验全部用 curl 以浏览器无关方式完成（password grant → Bearer → CRUD），**已证明可复用** | 实验 (a) 全系 |
| UI 中文化（R-4 预检） | 登录页/仪表盘/销售订单列表/设置页**全部原生中文**（Lingui 按浏览器 locale 渲染：采购/车间/工作流/…/"2025年12月11日"日期格式）——r1 报告"未见 zh 词条"的悲观预判被实测推翻，中文化风险降级 | [`ui-01`](ui-01-login-zh.png)/[`ui-02`](ui-02-dashboard-zh.png)/[`ui-04`](ui-04-sales-orders-zh.png) |
| dev 栈形态 | 9 容器 26 分钟稳定（postgres/gotrue/postgrest/realtime/storage/kong/inbucket/inngest/redis），kong `0.0.0.0:54321->8000`、PG `:51538`、ERP dev server `:3000`（302→/login 会话保护 + 登录后 24 行真实销售订单 US$11,758,690 总额） | [`docker-ps.txt`](docker-ps.txt)、[`carbon-status.json`](carbon-status.json)、[`carbon-stack-up.log`](carbon-stack-up.log) |

## 2. 「社区版可用能力」vs「EE 门控能力」（黑盒实测版）

**社区版实测可用（黑盒 API 面）**：
- PostgREST Data API 全表 CRUD（RLS 约束下；INSERT 需自带 companyId）
- GoTrue 密码/magic-link 会话 + refresh token 生命周期
- ERP/MES 全部人工 UI 功能（14 模块中文界面、销售订单/采购/库存/生产/质量/会计…）
- Realtime WebSocket 面开放（需 JWT）
- 种子数据机制（satellite 数据集 12 层 tier 经 `crbn up` 自动完成）

**EE 门控实测确认（社区版不可用）**：
- API keys（`/api/v1` 唯一凭据类型；UI 无创建入口，只有"升级到 Enterprise"）
- MCP server（POST /api/mcp，"machine/agent access"——r1 §2.4 FEATURE_PLANS.MCP；b-2 响应亦提示 MCP endpoint 是 OAuth connectors 的另一形态）
- 设置页 EE 菜单族（审批规则/审计日志/备份/集成/Webhooks——列表可见，预期同 API keys 式门控，未逐一深测）

## 3. 对 B3 的直接指令

**总指令：GO——按主计划 [`00-master-plan.md`](../plan/00-master-plan.md) §5 B3 全量实施，以下边界裁决并入 03 分域计划：**

1. **connector-carbon Provider 通路定型**：不实现 `/api/v1` API-key 客户端；Provider = PostgREST session 通路——`CARBON_URL`（kong 基址）+ `CARBON_EMAIL`/`CARBON_PASSWORD`（password grant 换 JWT，1h 过期由 Provider 自动 refresh；凭据走 dsh-credentials env 链，Config 字段化）。请求双头：`apikey: <anon key>` + `Authorization: Bearer <session JWT>`（anon key 也是 Config）。
2. **INSERT 语义**：写操作自动注入 companyId（首登录时从用户上下文解析一次并缓存；RLS WITH CHECK 强校验兜底）。
3. **工具行 risk 标注映射**：carbon manifest 的 READ/WRITE/DESTRUCTIVE 三分照采；但 DESTRUCTIVE 级的复合事务操作（post-receipt/post-shipment/close-job 等 30+ server-functions）**无 API 面**——B3 工具行只映射"实体 CRUD 级"操作（查/建/改单据头行），复合过账动作不进工具行，留三条后路：UI 人工操作（webserver /carbon 代理已排）、等询价结果购 API key、湖仓承担分析面。
4. **webserver /carbon 代理与 ui-business 换轨照常**（人工 UI 使用是社区版最强面）。
5. **R-1 残余风险处置**：上游正加硬 API 守卫（r1 §13 风险 1 引 20260924192316 migration）——**询价邮件（[`inquiry-draft.md`](inquiry-draft.md)）建议由编排者尽快发出**（含 Data API 机器调用的条款书面确认，见草稿第 1.2 问），作为 PostgREST 面未来收紧时的 B 计划。
6. **R-4 中文化降级**：UI 层原生中文已实测（零翻译工作）；B3 的 zh 校验记录按"抽查 API 返回的业务枚举值英文位（状态枚举 In Progress 等）+ 自定义词条"收窄。

## 4. 边界注记（GO 的限定语）

- GO 的判据是主计划 §5 B0 行的"`Data API/session 机器调用实测记录落盘`"——(a) CRUD 全通 + (b) 401 实证恰好构成"Data API 可用且合规、API-key 面关闭"的完整拼图；**不依赖 /api/v1 可用**。
- 若未来需要复合过账动作的 API 化（agent 直接收货/过账），则必须购商业许可——那是 W25 题目（O-7），不阻塞本轮。
- 本机环境注记：Docker Desktop 缺失，改用 colima VM（8G/6CPU/60G，Virtualization.Framework）；carbon-main 为无 .git 的 ZIP 快照，为满足 crbn 的 repo 探测补了 `git init`（空仓库，零源码文件改动）与本地 `.env`（community edition + 随机 SESSION_SECRET，无真实密钥）。

## 5. 证据索引

见 [`README.md`](README.md)（本目录 27 个证据文件的分型清单）。
