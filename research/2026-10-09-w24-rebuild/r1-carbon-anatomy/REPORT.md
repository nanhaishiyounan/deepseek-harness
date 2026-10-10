# R1｜carbon-main 深度解剖报告（W24 轮前置研究）

- 日期：2026-10-09
- 解剖对象：`/Users/mac/Downloads/carbon-main`（GitHub `crbnos/carbon` 源码 ZIP 快照，**无 .git 元数据**）
- 性质：只读研究，未修改 carbon-main 与本仓库任何既有文件
- 纪律执行情况：解剖前未预设 carbon 形态，以目录内证据裁决；预置的解读分支 A / B 已由证据定案（见 §1）

> 证据引用约定：carbon 侧一律给绝对路径 + 行号（或原文摘录）；本仓库侧给仓库相对路径。

---

## 0. 结论速览

| 问题 | 结论 |
| --- | --- |
| 它是什么 | **Carbon：开源制造业一体化业务系统（ERP+MRP+MES+QMS）**，定位 NetSuite/Epicor/SAP B1/Plex/Odoo/ERPNext 的替代品 —— 解读分支 A 定案 |
| 技术形态 | TypeScript/React Router 7 前端 + 单一 Postgres（RLS + PostgREST + Supabase 组件自组装）+ Inngest 后台作业 + Redis + Rust 几何服务（可选）；pnpm + Turborepo monorepo |
| 许可证 | **AGPL-3.0（主体）+ Carbon Commercial License（EE 文件）双许可 open core** |
| W24 头号风险 | ① 社区自托管版 **API keys / MCP / Webhooks / 审批规则 / RBAC 授权全部商业门控**；② AGPL 文件头明确「含移植版（ports）在内保持 AGPL，网络服务需开源」；③ EE 文件任何运行/测试/修改均需商业协议 |
| BLOCKER 判定 | **对"无修改整体部署"：非 BLOCKER（AGPL 内部使用可行）；对"API/MCP 驱动 + 功能改写"：条件 BLOCKER，需商业许可或另行设计**（详见 §13） |
| 推荐路径 | **路径 (b) 变体：carbon 作独立 sidecar 进程 + dsh 写 @deepseek-ai/dsh-carbon 插件（HTTP 驱动）**，前置两道闸门：PoC 验证社区版 Data API/Session 通路是否可用；不行则向 carbon.ms 询价。不建议 (a) 整树并入，不建议 (c) 整体重写（详见 §11/§12） |

---

## 1. 项目身份判定（分支裁决）

**分支 A 定案：它是一个业务系统（可整体替换 NocoBase 业务面）。**

证据链：

1. `/Users/mac/Downloads/carbon-main/README.md:9-14` — 「Build hardware at the speed of software」「**Carbon combines ERP, MRP, MES and QMS.** Plan materials, run the shop floor, manage quality and track actual costs in one system.」
2. `README.md:102-104` — 「Carbon puts ERP, MRP, MES and QMS in **one Postgres database you can inspect, own and extend**」，并自称 NetSuite / Epicor / SAP Business One / Plex / Odoo / ERPNext 的开源替代。
3. `README.md:29` — 上游仓库徽章指向 `github.com/crbnos/carbon`；官网 `https://carbon.ms`。
4. 版权主体：`/Users/mac/Downloads/carbon-main/LICENSE:1` — 「Copyright (C) Carbon Manufacturing Systems Corporation and contributors」。

排除另外两个同名项目：非 IBM Carbon Design System（无 carbon-components-react / SCC 库结构），非 Carbon Lang（无 LLVM/编译器主结构）。

**项目全名**：Carbon（Carbon Manufacturing Systems Corporation 出品）。
**上游 URL**：https://github.com/crbnos/carbon （快照内无 git 元数据，无法取 tag/commit hash；最新 migration 时间戳 2026-10-06，见 §10）。
**语言与框架**：TypeScript（前端+服务层，React Router 7 / Vite / Tailwind 4 / Radix / TanStack）+ SQL（Postgres，业务规则大量下沉数据库）+ Rust（仅 3D/CAD 几何服务，可选组件）。后端无独立框架进程：SSR 应用即后端（React Router loaders/actions + PostgREST + DB 内函数/触发器）。
**架构形态**：monorepo 单仓库、逻辑上前后端一体部署（SSR），数据层单库强约束；非微服务。

---

## 2. 许可证解剖（W24 第一优先级）

### 2.1 许可证结构（LICENSE 全文判定）

`/Users/mac/Downloads/carbon-main/LICENSE:1-24`（正文头部，其后为 AGPLv3 全文 687 行）：

> 1. Except as described in items 2 and 3, everything in this repository is licensed under the **GNU Affero General Public License, version 3 only ("AGPLv3")**.
> 2. **The Enterprise files** are (a) every file in the `packages/ee` directory … and (b) every file anywhere in this repository whose file name contains **".ee."** … licensed only under the **Carbon Commercial License** in `packages/ee/LICENSE`.
> 4. Neither license gives you any right to use the name "Carbon," Carbon's logos, or trademarks.

- 类型判定：**open core 双许可 = AGPL-3.0-only（社区主体）+ 自定义商业许可（EE 子集）**。
- 商标（名称/Logo）单独保留，不允许再利用其品牌。

### 2.2 Carbon Commercial License（EE 文件商业条款）

`/Users/mac/Downloads/carbon-main/packages/ee/LICENSE:12-29` 关键条款：

> 1. Viewing and sharing. You may view and download … copy and share them **only in source code form, only as part of a copy of Carbon's source code** …
> 2. **Use requires a commercial license. You may not use the Enterprise files in any other way, including running, testing, developing with, or modifying them**, unless you have a valid commercial license …（CCLA / ESA / 合作伙伴协议或在线点击达成）

即：EE 文件**看可以、跑不行**。任何对 EE 代码的运行（包括本地起栈联调时被依赖图拉起）在条款上都要求商业授权。

### 2.3 EE 文件物理范围（实测盘点）

- 整目录：`packages/ee/src/` 下含 `api-keys.server.ts`、`mcp/`、`sso/`、`two-factor.server.ts`、`webhooks.server.ts`、`workflows/`、`approvals/`、`audit/`、`customer-portals.server.ts`、`forecast.server.ts`、`backups.server.ts`、`entitlements.server.ts`、`plan.server.ts`，以及 integrations 全家（`onshape/ paperless-parts/ jira/ linear/ radan/ ramp/ rillet/ sage/ slack/ xero/ quickbooks/ stripe-connect/ sync/ spend/`）。
- 散布文件（SPDX 头 `LicenseRef-Carbon-Commercial`）：在 `apps/erp/app/modules/` 下检出至少 11 个 `.ee.` 文件，如 `settings/ui/Approvals/ApprovalRuleForm.ee.tsx`、`users/ui/EmployeeTypes/EmployeeTypeForm.ee.tsx`、`users/ui/Employees/EmployeePermissionsForm.ee.tsx`、`sales/ui/CustomerPortals/CustomerPortalForm.ee.tsx` 等——审批规则、员工类型权限矩阵、客户门户等 UI 均为 EE。

### 2.4 社区版功能门控（决定性证据）

`/Users/mac/Downloads/carbon-main/packages/ee/src/plan.ts:12-38` `FEATURE_PLANS` 全表 —— 仅 Business/Partner 计划可用的功能：

`API_KEYS`、`WEBHOOKS`、`MCP`（注释原文：The MCP server (POST /api/mcp) — machine/agent access to the ERP tools. **Off on Community/Starter**）、`INTEGRATIONS`、`SALES_RULES`、`AUDIT_LOG`、`EMAIL_NOTIFICATIONS`、`STORAGE_RULES`、`CUSTOMER_PORTALS`、`AI_AGENT`、`WORKFLOWS`、`FORECAST`、`TWO_FACTOR`、`PERMISSIONS`（注释原文：Community ships an "everyone is an admin" experience — 可加用户但**不能编排角色/权限**）、`APPROVAL_RULES`、`BACKUPS`。

`README.md:167` 佐证：「API keys and MCP are included with Business and Enterprise plans. **Using them in a self-hosted deployment requires a commercial license.**」

版本开关：`.env.example:11` `CARBON_EDITION="community"`（community | cloud | enterprise）。

### 2.5 AGPL 网络条款与「ports 传染」声明

社区代码每个文件头都有强化声明，例：`/Users/mac/Downloads/carbon-main/packages/api/src/index.ts:1-3`：

> SPDX-License-Identifier: AGPL-3.0-only
> Modified or adapted versions of this file, **including ports, remain AGPLv3; serving them over a network requires releasing their source.**

上游在 AGPL 之上显式声明：**修改版、适配版、移植版**均保持 AGPL，网络提供服务须发布对应源码。这直接约束 W24 路径 (c) 的"参考重写"边界（代码级翻译=port=传染；概念/数据模型思想借鉴不受版权约束）。

### 2.6 任务书许可证问题逐条回答

| 问题 | 回答 |
| --- | --- |
| 允许源码并入闭源/内部仓库吗？ | **AGPL 部分：可以**（内部持有不分发即无触发点；一旦对外分发或以网络服务对外提供，整仓对应源码须 AGPL 开源）。**EE 部分：不可以**——并入本身允许（源码形态随附许可），但运行/测试/修改均需商业协议 |
| 允许修改后内部再分发吗？ | AGPL 部分：公司内部再分发不受限；对外分发必须整包 AGPL（含你的修改）。EE 部分：禁止修改使用，除非购商业许可 |
| 商用限制？ | AGPL 无商用费，但有 copyleft + 网络服务开源义务；EE 功能商用需付费；商标禁用 |
| CLA 陷阱？ | 仓库未见 CLA 文件（贡献入口 `.github/CONTRIBUTING.md` 存在，快照未展开核验 CLA 细节）；上游采用 copyright hold by 公司+贡献者模式，对**使用**无 CLA 风险，对**回馈上游**的代码可能需签署授权（与 W24 无关） |

---

## 3. 技术栈与架构形态

`README.md:185-202` Tech Stack 表 + `README.md:171-177` Architecture：

- **Apps**：React Router 7（Vite SSR）+ TypeScript
- **UI**：Tailwind 4、Radix、React Aria、TanStack Table/Query
- **数据库**：Postgres（RLS、函数、触发器、物化视图）+ **PostgREST**（Data API）+ **Kysely**（TS 查询构建）
- **API**：**oRPC** + OpenAPI + MCP server（同一 manifest 双面）
- **后台**：Inngest（事件驱动作业，回调 ERP 执行）；**缓存/限流**：Redis
- **鉴权基建**：Supabase 组件自组装（GoTrue / storage-api / realtime / kong / edge-runtime / postgres-meta / studio），非托管 Supabase
- **AI**：Vercel AI SDK（Anthropic/OpenAI）
- **3D/CAD**：three.js + Rust（OpenCASCADE/FCL，crates/，可选服务）
- **i18n**：Lingui；**工具链**：pnpm@10 + Turborepo + Biome + Vitest
- **托管**：AWS via SST，或 Docker 自托管

架构哲学（`README.md:392-399`）：**安全与计算totals尽量下沉数据库**（RLS 租户隔离、计算列/视图、DB 内变更事件），应用层只做编排；后台作业通过 Inngest 回调 ERP。

---

## 4. 模块划分

### 4.1 顶层目录

`apps/`（5 应用）、`packages/`（28 包）、`crates/`（7 Rust crates）、`docs/`（Fumadocs 文档站）、`contrib/`（部署样例等）、`scripts/`、`ci/`、`.ai/`（AI 技能）。根级关键文件：`Dockerfile`（多阶段 APP=erp|mes）、`sst.config.ts`、`turbo.json`、`mise.toml`、`setup.sh`、`BACKWARD_COMPATIBILITY.md`、`AGENTS.md`/`CLAUDE.md`（AI 贡献者契约）。

### 4.2 apps（`README.md:218-226`）

| App | 职责 |
| --- | --- |
| `erp` | ERP 主应用：sales、purchasing、inventory、planning、quality、accounting（SSR，端口 3000） |
| `mes` | 车间触屏应用：数字工票、工位终端（端口 3001） |
| `assembler` | Rust 几何服务：STEP→GLB 转换 + 装配运动规划（可选，不装不影响主功能） |
| `academy` | 培训站 |
| `starter` | 基于 API 的示例应用 |

### 4.3 packages（`README.md:228-259`，28 个）

核心链：`@carbon/database`（schema/migrations/生成类型/客户端 + 种子）→ `@carbon/auth`（认证/RBAC/session/API key/OAuth）→ `@carbon/server-functions`（**事务性写操作**：posting/issuing/converting，为 apps/API/jobs 共用）→ `@carbon/api`（操作 manifest 契约）→ ERP/MES 应用。其余支撑：`react`（UI库）、`form`、`query`、`jobs`（Inngest）、`planning`（MRP+排程引擎）、`documents`（PDF/邮件/ZPL标签）、`printing`、`viewer`（3D）、`files`、`tiptap`、`onboarding`、`notifications`、`workflows-core`（社区侧 workflow 触发器契约）、`locale`、`lib`、`kv`、`env`、`logger`、`utils`、`stripe`（仅云）、`ee`（**商业**）、`checks`、`dev`（crbn CLI）、`harness`（AI 编码代理 harness）、`config`。

### 4.4 crates（Rust，`Cargo.toml:3` workspace）

`collision/ converter/ draco-bridge/ occt-bridge/ optimize/ planner/ thumbnail/` —— CAD 转换、碰撞检测、运动规划、缩略图。`Cargo.toml:8` 声明 crate 级 MIT（与仓级 AGPL 并存，Rust 侧独立服务）。

### 4.5 ERP 业务模块（`apps/erp/app/modules/`，17 个）

`account accounting agent documents inventory invoicing items people production purchasing quality resources sales settings shared users workflows`

其中 `agent/` 是内置 AI 助手（AGPL 侧）：`agent.kb.ts`（知识库）、`agent.tools.ts`、`agent.prompt.ts` + `kb/changelog/` **双周 changelog 作为 agent 知识库**（最新 `2026-09-28-ramp-batch-materials-and-community-planning.md`）；但功能本身被 `FEATURE_PLANS.AI_AGENT` 门控为商业计划。

---

## 5. 数据模型

### 5.1 数据库与 schema 管理

- 单一 Postgres 15（dev 镜像 `supabase/postgres:15.14.1.112`，`packages/dev/docker/docker-compose.dev.yml:14`）。
- **Migration 驱动**：`packages/database/supabase/migrations/` 共 **170+ 个** SQL 迁移，时间跨度 **2023-01-23（`20230123003711_xid.sql`）至 2026-10-06（`20261006221301_contracts.sql` 等 3 个）**。
- 迁移执行：`pnpm db:migrate` = `crbn migrate`（根 `package.json:53`）；自托管 bootstrap = Docker bootstrap 阶段跑 `supabase migration up` + `tsx src/seed.ts`（`Dockerfile:46-51`）。
- ORM 形态：**Kysely + 从 DB 反生成的 TS 类型**（`pnpm generate:types` → `scripts/generate-db-types.ts`；`README.md:129` "Generated types shared by the database, application and API"）。无 Prisma/TypeORM 实体声明——**数据库是唯一事实源**。
- 兼容契约：`BACKWARD_COMPATIBILITY.md:15-21` —— Database Schema **ADDITIVE-ONLY**（禁 rename/drop/收窄类型）；权限字符串 FROZEN；RLS policy 名 STABLE；service 函数签名 STABLE；路由 STABLE；edge function 名 FROZEN。**升级上游的摩擦被显式管理**。
- SQL 层测试：`packages/database/supabase/tests/*.test.sql`（pgTAP 风格，账务平衡/RLS/事件订阅鉴权等 21 个）。

### 5.2 业务域对象（表/实体）

无集中 ER 图文件；从 migrations + 模块目录还原的**核心实体族**：

- **基础**：company / companyGroup（多实体集团）/ companySettings / employeeType(+Permission) / user / invite / customField / auditLog（EE 审计）
- **物料与工程**：item / BOM（多级+版本+revision）/ 路由 routing（工序 BOP）/ 变更单 changeOrder / supersession 替代项 / 配置规则 configurationRule / 存储单位 storageUnit / 单位换算（`20261006220801_each-unit-of-measure.sql`）
- **销售**：customer / quote / salesOrder / shipment / salesInvoice / RFQ / opportunity / 合同 contracts + 收入确认 revenueSchedule（`2026-10-06` 新增）
- **采购**：supplier（含 approval）/ purchaseOrder / receipt / purchasingRFQ / supplierQuote / 预付款
- **库存**：itemQuantities / 库位 shelf/storage / 库存转移/盘点/调整/冲销 / pickingList（`20260601143527`）/ 批次与序列追踪 / 效期 shelf-life（`20260429120000`）
- **生产**：job / jobOperation / 生产事件 / backflush 倒冲（`20260511120000`）/ 需求与供应计划 / 有限产能排程 FCS（changelog 2026-09-04）
- **质量**：inspection（量具/判定/抽样 AQL 类 sampling）/ 不合格品 NCR / CAPA / FAI / 校准 / 风险
- **财务**：总账 ledger / 科目表 accountTypes / 凭证 journal / AR/AP 收付款 / 多币种 / 固定资产 fixedAsset / 集团内部往来 intercompany（`20260816144210`、`20260817012947`）/ 会计同步（QuickBooks/Xero/Rillet/Sage，EE）
- **运维**：设备维护 maintenanceEvent / 车队 fleet-rental-lease（`20261006220301`）/ 打印标签 / 文档模板 / 通知偏好 / 工作流引擎表（`20260810100100_workflows-foundation.sql`）

### 5.3 初始化/种子数据机制

- **12 层种子 tier**：`packages/database/src/datasets/tiers/index.ts:19-32` — Foundation → Item catalog+BOM/BOP → Inventory → Sales → Purchasing → Production → Quality → Change orders → Accounting+固定资产 → Ops → Workflows → Planning 前置。可 `--tiers` 选择层。
- **4 个行业故事数据集**：`satellite / robotics / precision / motor`（`README.md:282-286`、`datasets/index.ts`），目标是"每个列表页有数据、每个详情页打得开"。
- 灌入方式：**直连 SQL**（`packages/database/src/seed-dev.ts:31-79`：进程池 client.query，先 bootstrap 用户+公司，可 wipe 重建业务数据、保留配置数据；种子后自动跑 MRP+排程 `plan:company`）。
- 数据集代码与 **onboarding demo 模板共享**（seed-dev.ts:10-11 注释）——种子即产品功能。

---

## 6. 鉴权与多租户

- **认证**：Supabase GoTrue v2.189（dev compose `:79`）——email magic link（dev 免链接直登 `test@carbon.ms`）、Google/Azure OAuth、Passkey、TOTP MFA、SAML（`docker-compose.dev.yml:119-123`）；JWT（HS256 共享 `SUPABASE_JWT_SECRET`，1h 过期）+ 应用侧 SESSION_SECRET 会话 cookie（`packages/auth`：config/env、lib/supabase、services/users、utils/cookie、utils/http）。
- **用户/角色/权限模型**：三主体（employee / customer / supplier portal 用户）；**RBAC**：`module` ENUM 14 值（`migrations/20230123004409_permissions.sql:2-17`：Accounting/Documents/Invoicing/Inventory/Jobs/Messaging/Parts/Purchasing/Resources/Sales/Settings/Scheduling/Timecards/Users）× 4 动作（view/create/update/delete）× employeeTypePermission 表；**ABAC** 补充（`20230126050441_abac.sql`）；**实现方式 = Postgres RLS policy**（`permissions.sql:39-42`：`has_role('employee', …) AND has_company_permission('users_update', …)`）——应用、API、MCP 三面共用同一 DB 权限（`README.md:131-133`）。
- **社区版限制**：权限**编排**（建角色/改个人权限/控制台模式）是 EE（`plan.ts:29-33`）；社区版"everyone is an admin"。
- **API key**：哈希存储、显式 scope、per-key 限流（RLS 表 `20260624153000_api-key-rate-limit-rls.sql`）——**创建/使用门控在 EE**。
- **租户隔离**：每表带 companyId + RLS；公司集团 companyGroup 跨公司视图（`20260229000002`）；集团内部交易消除服务角色（`20260817012947`）。**多实体（multi-entity）+ 多币种**为产品原生能力。

---

## 7. 部署形态

### 7.1 本地开发（`crbn up` = `pnpm dev`）

Docker 栈 12+ 服务（`packages/dev/docker/docker-compose.dev.yml` 全文盘点）：

| 服务 | 镜像 | 端口/资源上限 |
| --- | --- | --- |
| postgres | supabase/postgres:15.14.1.112 | ${PORT_DB}→5432，1GB/2CPU |
| gotrue | supabase/gotrue:v2.189.0 | 96MB |
| postgrest | postgrest/postgrest:v13.0.8 | 256MB（pool 25） |
| realtime | supabase/realtime:v2.89.0 | 384MB |
| storage-api | supabase/storage-api:v1.58.4 | 2GB（CAD 大文件） |
| imgproxy | darthsim/imgproxy:v3.8.0 | 512MB（profile=full） |
| meta / studio | postgres-meta:v0.96.5 / studio:2026.04.28 | 128/384MB（可选） |
| inbucket | inbucket 3.1.1 | 9000（邮件捕获） |
| edge-runtime | supabase/edge-runtime:v1.74.0 | 1GB/3CPU |
| kong | kong:2.8.1 | ${PORT_API}→8000 API 网关 |
| inngest | inngest/inngest:v1.19.4 | 8288 dev server |
| redis | 宿主共享容器（每 worktree 逻辑 DB 0-15） | — |

- 应用端口：ERP 3000 / MES 3001 / API（kong）54321（README `:276-280`）。
- 前置条件：Docker + Node 22 + pnpm 10（corepack）；`pnpm dev` 一键起栈+迁移+生成类型+种子 `test@carbon.ms`。零外部账号依赖（邮件/OAuth/Stripe/AI 全可选）。
- worktree 隔离：`crbn` CLI（`@carbon/dev` 包）给每个 git worktree 独立栈 + portless HTTPS 域名（README `:290-301`）。

### 7.2 生产形态

- **样例 A：单 VPS Docker Swarm + Caddy**（`contrib/deploying/simple-docker-caddy/docker-compose.prod.yml`）：erp+mes（各 2GB 上限/512MB 预留，`pnpm run start`）+ Supabase 全家 + Redis + Inngest + Caddy 反代（**仅 80/443 对外**，其余 overlay 内网）；Swarm secrets 注入敏感值；`CARBON_EDITION` 默认 community（`:69`）。
- **样例 B：AWS via SST**（根 `sst.config.ts`，Carbon Cloud 自用托管路径）。
- 镜像：`docker build --build-arg APP=erp`（`Dockerfile:2`），多阶段（deps→build→bootstrap(迁移+首播种子)→runner 精简运行时）。
- **最小可跑资源**（dev 栈全上限合计）：≈ 6.5GB RAM / ~10 CPU 上限（多数服务 idle 远低于上限）；单 VPS 样例按 ERP+MES 各 2GB 预算 + 基础设施 ≈ **6-8GB RAM 起**。Node 22 + Docker 必备；Rust assembler 仅为可选 3D 功能（无它 `/convert`、`/plan` 404，其余正常，README `:331`）。

---

## 8. API 面

- **组织方式**：RPC 风格统一操作面 —— `POST /api/v1/{module}/{operation}`（`README.md:153`），body `{"args": {...}}`；同一 manifest 同时生成 **OpenAPI**（`pnpm generate:swagger`）与 **MCP tools**（`pnpm generate:mcp` → `scripts/generate-mcp.ts`）。
- **manifest 契约**：`packages/api/src/manifest-types.ts:48-93` `ManifestEntry`：name/module/**classification(READ|WRITE|DESTRUCTIVE)**/描述/JSON Schema 入参/**responseSchema（从 TS 返回类型反射）**/contextParams（dispatcher 从认证上下文注入 companyId/userId 等，杜绝越权传参）/injectAuth/upsert 语义/paginates。**操作 = `@carbon/server-functions` 的服务函数**（单事实源，生成而非手写清单）。
- **操作粒度示例**（`packages/server-functions/src/` 目录名）：`post-receipt post-shipment post-picking post-production-event post-nonconformance post-sales-invoice post-payment post-stock-transfer post-inventory-count close-job convert correct-stock-movement trigger-rework reschedule recalculate import-csv …` 30+ 事务操作 + 各模块 CRUD。
- **鉴权调用示例**（`README.md:158-163`）：`curl -X POST https://app.carbon.ms/api/v1/sales/getSalesOrders -H "Authorization: Bearer $CARBON_API_KEY" -d '{"args":{"limit":10}}'`；自托管同路径 `/api/v1`。
- **Data API**：PostgREST 直连表/视图（`README.md:165`），用于无操作面覆盖的场景，受 RLS 约束。
- **TS 客户端/SDK**：官方提供从 OpenAPI 生成客户端的文档（`docs.carbon.ms/api/sdks`）；仓库内 `apps/starter` 是 API 消费示例应用。无官方 npm SDK 包。
- **关键限制**：**API key 与 MCP 是商业功能**（§2.4），社区自托管下 HTTP API 面对机器调用的合法通路存疑（session/PostgREST 路径待 PoC，见 §11）。
- **Webhooks**：商业门控（`FEATURE_PLANS.WEBHOOKS`）。

---

## 9. 业务域覆盖对照（食品制造业场景）

### 9.1 Carbon 内置模块 vs 我们的食品制造业需求

| 我方业务域 | Carbon 覆盖度 | 证据/缺口 |
| --- | --- | --- |
| 采购 | ✅ 强 | PO/收货/RFQ/供应商资质审批/预付款（server-functions post-receipt 等） |
| 库存/进销存 | ✅ 强 | 批次+序列追踪、库位、盘点/调整/转移/冲销、倒冲、**效期 shelf-life 原生**（`20260429120000_rename-shelf-life-inherit…sql`、`packages/server-functions/src/shelf-life.ts`） |
| 生产（MES） | ✅ 强 | 独立 MES 应用：数字工票、工序终端、工时采集、条码；MRP+FCS 排程（changelog 2026-09-04） |
| 质量（QMS） | ✅ 强 | 检验/量具/抽样（`sampling.ts`、`inspection-verdict.ts`）/NCR/CAPA/FAI/校准 |
| 审批 | ⚠️ 社区版无 | `APPROVAL_RULES` 是 EE（分级审批规则全商业）；workflows 引擎表在社区但触发器契约 `workflows-core` + 执行在 EE |
| CRM | ⚠️ 弈 | 有 opportunity/quote/客户门户，但门户是 EE；无 SFA 线索池/营销自动化 |
| 财务 | ✅ 强 | GL/凭证/AR/AP/多币种/多实体/固定资产/收入确认/期间关闭与预算（changelog 2026-07-07）；会计同步集成全 EE |
| 食品特有：配方 formula/得率/投料 | ❌ | BOM 是离散制造零件表；无配方比例、得率损耗、投料单（process manufacturing 核心差异） |
| 食品特有：HACCP/GMP/温度冷链 | ❌ | QMS 面向机加工检验，无 HACCP 体系文件、无冷链温度记录 |
| 食品特有：营养标签/食品合规 | ❌ | 无 |
| 追溯/召回 | ✅ 强 | 双向 lot/serial 谱系图（README `:66-69`），满足批次正反向追溯 |

### 9.2 与现有 NocoBase 业务面的差距

- 现状：`platform/nocobase`（隔离子树）+ `platform/nocobase-portals/`（仅 `demo-portal-crm/`、`demo-portal-hub/` 两个门户演示）+ W4~W6 在 NocoBase 上配置的十大域（ERP/MES/WMS/PLM/SCM/QMS/APS/EAM/CRM/财务）。
- Carbon 相对优势：**产品级硬 schema**（170+ migration、ADDITIVE-ONLY 契约）vs NocoBase 低代码配置态；事务完整性（posting 引擎 + DB 内计算列）；真实 MRP/FCS 引擎（`packages/planning`）；RLS 级租户隔离；MES 独立触屏应用。
- Carbon 相对劣势：**无中文本地化验证**（Lingui 有多语言框架，未见 zh 词条——需 PoC）；**无低代码扩展面**（自定义字段有，但新业务模块=改源码发版）——W4~W6 大量 NocoBase 配置域（如食品合规四件套、审批配置中心）在 Carbon 没有对应物或为 EE；门户/portal 面（我方 ui-mobile、mobile 五页）需重建。
- 结论：**Carbon 不是 NocoBase 的超集**——它是更深的制造业内核，但我们的食品行业层、中文移动端、KB/agent 订阅产品面全部要自己长在它上面（通过其 API 或 UI 扩展点），且部分我方已有能力（审批配置、门户）恰落在它的商业区。

---

## 10. 版本与上游活跃度

- 快照无 `.git/`（ZIP 下载），无 tags/commit 可考。
- **活跃度极高**（本地时间戳证据）：migrations 最新 `2026-10-06`（快照日前 3 天仍在合入 schema 变更：contracts、fleet-rental-lease、each-unit-of-measure）；agent changelog KB 严格双周一篇，最新 `2026-09-28`；`BACKWARD_COMPATIBILITY.md` 的稳定性分级表明团队在高速演进同时管理兼容面。
- 含义：**跟随上游=持续追赶高频变更**；不跟随=安全补丁与 schema 修复断供。这对路径 (a)/(c) 的维护成本评估是决定性输入。

---

## 11. 三条嵌入路径评估（核心输出）

### 路径 (a)：整树源码并入仓库（platform/carbon，仿 platform/nocobase 隔离子树形态）

| 维度 | 评估 |
| --- | --- |
| 改动面 | 大：碳树 ≈ 数百 MB 源码 + 自带 pnpm@10/turbo/biome 工具链，与本仓 pnpm workspace 冲突 → 必须像 platform/nocobase 一样**隔离构建子树**（独立锁文件、独立 CI 面、排除出 dsh release）；须**剔除或冻结 packages/ee 与全部 `.ee.` 文件**（否则违反商业许可第 2 条"运行"）——剔除会改变依赖图，erp 应用构建大概率报缺模块，需要补 shim |
| 维护成本 | 高：上游 3 天前还在改 schema；隔离子树无 vendor manifest 机制（我们 vendor/ 有 SHA 锁定流程，carbon 无）；每次升级=手工 diff 大树 + 170+ migration 追跑 + EE 文件重新剔除 |
| dsh 插件化兼容度 | 零：carbon 是自包含应用，无 cordis 插件面；无法 ctx.effect 注册；与能力 seam 三件套无映射 |
| 升级上游成本 | 高（见维护成本）；且 fork 内任何修改都触发 AGPL"修改版"义务——只要该树+修改不对外网络服务即可内部消化 |
| 许可证 | AGPL 部分并入内部仓库 ✅；EE 剔除义务 ⚠️ 必须做到位（构建期扫描器防回归） |
| 判定 | **不推荐作为首选**：成本≈重造一次 platform/nocobase 的隔离负担，换来比 NocoBase 更深的黑盒 |

### 路径 (b)：独立 sidecar 服务 + dsh 插件作客户端/代理

carbon 以官方形态独立跑（dev 栈或 Swarm 样例），dsh 侧新增 `packages/<group>/carbon/`（如 `@deepseek-ai/dsh-carbon`）：Service Definition（碳操作面能力契约）+ Provider（HTTP 调 carbon `/api/v1`，持 API key 凭据）+ Consumer（web/llm 工具，暴露给 agent 的查询/开单工具），完全符合本仓能力 seam 约定、ctx.effect 注册、无硬编码可调参数（CARBON_URL/CARBON_API_KEY 走 env/cordis.yml config）。

| 维度 | 评估 |
| --- | --- |
| 改动面 | 小：dsh 一个新包 + 部署编排（docker stack）；carbon 侧零改动 |
| 维护成本 | 低：上游随便升级，dsh 只依赖稳定 API 面（其 API 是生成 manifest，操作名按 BACKWARD_COMPATIBILITY 的 STABLE 契约管理） |
| 插件化兼容度 | **完美**：这是 dsh 既有模式（web/subagent 均为远端能力 Consumer） |
| 升级上游成本 | 低 |
| 许可证 | 运行未修改的官方构建：EE 文件在官方镜像内随官方云许可运行（社区 edition 下 EE 代码路径不被激活使用——与"自行运行 EE 代码"的边界需在 PoC 确认：dev 栈 community 模式跑通即证明可用形态）；**真正 BLOCKER 是调用面**：API key/MCP 商业门控（§2.4）——机器调用通路只有 ① 商业许可 API key；② 模拟 session（灰色）；③ PostgREST Data API + RLS（ERP 前端自身通路，需 PoC 验证机器可用性）；④ 直连 DB（绕过应用层，丢失 posting 事务语义，不推荐） |
| 判定 | **推荐主路径**，但有两道前置闸门（见 §12 建议） |

### 路径 (c)：抽取核心设计重写为 dsh 原生插件

| 维度 | 评估 |
| --- | --- |
| 改动面 | 巨大：等于在 dsh 内重做一个制造业 ERP（W4~W6 在 NocoBase 上的配置工作全部翻译成代码并加深） |
| 维护成本 | 高但自主：无上游追赶，但全部质量责任自担 |
| 插件化兼容度 | 完美（原生） |
| 升级上游成本 | 无（但也没有上游红利） |
| 许可证 | **高危**：AGPL 文件头显式「including ports, remain AGPLv3」——代码级翻译/移植=AGPL 传染，网络服务须开源我方对应源码。**只有"借鉴数据模型概念、业务流程思想"（不受版权保护的表达除外）+ 100% 自写代码才安全**，而这在 ERP 这种重 schema 领域极难自证清白（clean-room 成本高） |
| 判定 | **整体不可行**；仅允许作为"局部补缺参考"（如参考其 shelf-life/批次谱系表设计思想补强我们自己的域） |

---

## 12. 复用/重写裁决

**值得直接复用（按路径 b 消费）：**
1. **完整业务系统本体**（ERP+MES+QMS+财务内核）——这是引入 carbon 的全部意义，自研不可及
2. **12 层 4 行业种子数据集机制**——demo/培训/测试数据的生产方式（satellite 等数据集虽为离散制造故事，机制可照搬）
3. **API 操作 manifest 设计**（READ/WRITE/DESTRUCTIVE 分类 + contextParams 注入 + responseSchema 反射）——dsh-carbon Consumer 工具设计可直接采纳该分类作为工具风险标注
4. **BACKWARD_COMPATIBILITY 稳定性契约**——作为 dsh-carbon 依赖面的版本兼容判据
5. **内置 AI agent 的 changelog-as-KB 模式**（`apps/erp/app/modules/agent/kb/changelog/`）——与我们 KB 产品方法论互证

**必须自建/重写（不可复用）：**
1. **中文本地化**（Lingui 词条 zh 提取/翻译全量补做）
2. **食品行业层**：配方/得率、HACCP、冷链、营养标签、食品召回模板——carbon 无此基因
3. **中文移动端**（现 ui-mobile/mobile 五页需对接 carbon 的 API/MES 面重写数据层）
4. **审批配置中心**（carbon 社区版无审批规则；自建或购许可）
5. **KB 订阅产品面**（dsh 侧资产，与 carbon 无关，继续持有）
6. EE 全部功能（portal/SO/同步/预测/审计）——除非购许可，否则需在 dsh 侧自建替代

**明确不碰**：任何 `.ee.` 文件与 `packages/ee/` 代码（读可以，禁运行/改/抄）；carbon 商标与品牌皮肤。

---

## 13. 适配策略建议

**推荐：路径 (b) —— carbon 独立 sidecar + `@deepseek-ai/dsh-carbon` 插件（能力 seam 三件套齐全），分两阶段推进：**

**阶段一（PoC，1-2 天）：**
1. `pnpm dev` 起社区 dev 栈（零外部账号可跑），灌 `--dataset satellite` 种子，验证中文可用的 UI 面
2. **决定性实验**：验证社区 edition 下机器调用通路——(a) Supabase session 登录后 PostgREST Data API 读写是否满足我们 agent 查询/开单场景；(b) 若不满足（或条款上不可接受），该路径降级
3. 用真实食品制造业单据（采购单/批次入库/检验）走通一个端到端故事，评估 schema 贴合度与中文界面工作量

**阶段二（若闸门通过）：**
- dsh-carbon 插件落包（Service Definition/Provider/Consumer），凭据走 `@deepseek-ai/dsh-credentials`，工具按 carbon manifest 的 classification 标注 risk
- NocoBase 退役策略：platform/nocobase 冻结（只读保留历史数据），W4~W6 配置域中 carbon 已覆盖者迁移，食品特有域（配方/HACCP 等）在 dsh 侧自建插件（参考 carbon 概念但 clean-room）
- 与 carbon.ms 商务接触（self-hosted 商业许可含 API/MCP 的报价）作为闸门失败时的 B 计划

**为什么不选 (a)/(c)：** (a) 的隔离维护成本复刻一次 platform/nocobase 负担且换来更深黑盒，EE 剔除工程量不可控；((c) 撞 AGPL ports 传染条款，整体重写等于放弃引入 carbon 的初衷。

**风险清单：**
1. **许可证风险（高）**：API key/MCP 商业门控若连 Data API 路径也被收紧（上游正在快速演进，`20260924192316_api-function-guards-not-revokes.sql` 表明他们在持续加硬 API 守卫），路径 (b) 可能被迫购许可——**建议把商务询价与 PoC 并行启动**
2. **行业贴合风险（中）**：离散制造内核 vs 食品流程制造，配方/得率/HACCP 缺口全自建
3. **中文化风险（中）**：全量 UI 词条翻译 + Lingui 管线接入我方翻译流程
4. **上游活跃风险（中）**：高频变更下锁定一个快照版本（记下当前快照日期 2026-10-06/08 基线），按月评估 rebase
5. **移动端重写风险（中）**：ui-mobile 数据层从 NocoBase API 切到 carbon API/PostgREST，五页×多场景回归
6. **退出成本风险（低-中）**：一旦业务数据沉淀进 carbon schema（170+ 表），再迁出代价高——决策前 PoC 要严肃

---

## 14. 许可证结论（BLOCKER 判定）

1. **对「以官方形态独立部署、人工使用、内部网络访问」**：**非 BLOCKER**。AGPL-3.0 允许内部使用与内部再分发；未修改版本对外（若发生）网络服务义务可通过指向公开上游源码满足；EE 代码在 community edition 不激活的形态下随官方构建分发的边界在 PoC 中确认。
2. **对「机器/agent 通过 API key 或 MCP 驱动」**：**条件 BLOCKER（当前社区许可下为 BLOCKER）**。`FEATURE_PLANS.API_KEYS/MCP` 明确 Business/Partner 专属，自托管使用需商业许可（README.md:167）。解除条件：① 购 Carbon 商业许可；② PoC 证明 Data API/session 通路在社区版对机器调用开放且条款可接受。
3. **对「源码并入仓库/修改 carbon 源码」**：**软 BLOCKER**。AGPL 修改版义务（内部使用不触发，对外分发/网络服务触发全量开源）；EE 文件剔除义务使整树并入工程上高摩擦；**移植（port）重写同样被上游声明保留 AGPL**——路径 (c) 的代码级翻译被许可证直接封死。
4. **对「借鉴其数据模型/业务概念自研」**：**非 BLOCKER**（思想不受版权保护），但须 clean-room 纪律：只读 schema 理解域结构，代码 100% 自写，保留设计过程记录自证独立创作。

**总判定：W24 可以继续，但「API 驱动形态」的可行性取决于两道 PoC 闸门 + 商业询价并行；在任何分支下都不得引入/运行/移植 EE 文件。**
