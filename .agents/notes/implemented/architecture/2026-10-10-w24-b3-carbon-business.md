# Agent Note: W24-B3 carbon 业务批——PostgREST session 能力缝 + cb_* 工具行 + UI/网关换轨

Status: implemented

English | [中文](2026-10-10-w24-b3-carbon-business.zh.md)

日期：2026-10-10 ｜ 批次：W24-B3（业务系统，五源②） ｜ 证据目录：[research/2026-10-09-w24-rebuild/b3-carbon/](../../../../research/2026-10-09-w24-rebuild/b3-carbon/README.md)

## Problem

B3 是「用 carbon 替换 nocobase 业务系统」的落地核心：会话工具行、网关业务域、业务页数据面、湖仓同步四层都要从 NocoBase 换到 carbon 的 PostgREST session 通路上，且 carbon 的真实 schema（ENUM 列、应用层维护的游标）会撞穿 B2 同步管线的假设。

## Decision

### 1. connector-carbon 是 `ctx.carbon` 服务，不是 connector-registry provider

carbon 的调用面是业务表 CRUD（目录/查询/单表写），不是 connector seam 的「数据集发现/搬运」语义；塞进 `registerProvider` 会造出一个假 discover 面。缝的形态是自注册 Service（`super(ctx, 'carbon')`），tool-carbon 与 apiproxy carbon 域都是它的 Consumer——能力三角色仍完整（契约=服务声明，Provider=PostgREST 会话客户端，Consumer=工具行+网关域）。

### 2. 会话生命周期的三层回退

GoTrue password grant（首次）→ refresh grant（到期前 120s 主动刷新）→ password grant（refresh 被服务端拒绝时整层回退）。401 数据响应触发一次完全重认证重试；`ensureSession` 的 in-flight 去抖让并发调用共享一轮 grant。密码拒绝（`CARBON_AUTH_REJECTED`）是唯一不上抛后回退的错误——凭据错误重试无意义。

### 3. 租户注入的解析锚是 employee.id = GoTrue sub

carbon 的 employee 表主键就是 GoTrue user id（无独立 userId 列）。INSERT 的 `companyId` 从 `employee?id=eq.<sub>` 解析一次并缓存；RLS `WITH CHECK` 仍是执行层（伪造租户的写被 42501→403 拒，结构化为 `CARBON_RLS_VIOLATION` 并携带服务端错误体）。Config `companyId` 可 pin（部署侧覆盖，跳过探测）。

### 4. 工具行按 catalog risk 三分，companyId 永不接受模型输入

`CARBON_TABLES` 目录给每表 `risk: read|write`：全部进 cb_list/cb_get 读面，write 层进 cb_create/cb_update；过账类表（receipt/shipment/库存数量）只读——复合过账 server-functions 无 Data API 面（B0 VERDICT 指令③），留给 carbon UI/商业许可。cb_create/cb_update 显式拒绝 `companyId` 参数（租户是部署侧绑定，模型叙述无效）。

### 5. carbon→湖仓同步的两个真实边界（产品级修复）

- **ENUM 列**：carbon PG 大量 ENUM 列（itemType/status…），postgres ATTACH 后 DuckDB 读作 ENUM，DuckLake 无 ENUM 存储→同步失败。lakehouse-engine 新增 `sourceProjection()`：探测 `information_schema` 的 USER-DEFINED 列，SELECT 投影 CAST AS VARCHAR（无 ENUM 列保持 `*` 零开销）。SELECT 投影是唯一同时覆盖 CREATE TABLE AS 与 INSERT SELECT 的位置。
- **全 NULL 游标**：carbon 的 `updatedAt` 仅应用层维护（server-functions 写），经 PostgREST 落的行游标全 NULL——watermark 模式下每轮全量重append。lakehouse-sync 的 `syncOne` 现在探测 max 游标，全 NULL 回退 replace 模式（幂等替换，诚实语义：无变化信号就是快照同步）。job 表有应用层游标，仍走 watermark 增量。

### 6. B1 座位债的清偿顺带完成

ui-business 换轨撞上 B1 未完成面：`sidebar.nav.host` 座位声明（ui-sidebar）、`NavState` 导出（ui-view-context，含 navStore 快照）、slot `hidden` 选项（ui-slots list kind——hidden 条目不进 tab 环但仍可被 nav 激活）。B3 一并补齐；conversation tab 环的 hidden 过滤在 ui-conversation 的 tab 装配处。

### 7. nocobase 读路径退役的分寸

cordis.patch.yml 摘除：tool-nocobase、connector-nocobase、expert-orders（下单链的 NocoBase 真源）、api-gateway 的 nocobase 五键（换 `carbonEnabled`/`carbonWriteEnabled`，`ApiProxyService` 构造透传补齐）、webserver `nocobaseProxyOrigin`（换 `carbonProxyOrigin`）。kg-build 的 nocobase mappings 段保留（B5 映射广度数据源，非会话面）。代码全部保留（B7 序删）。

## Consequences

- 业务问答路径全面切 carbon：会话工具面（cb_*）+ 网关业务域（carbon.*）+ 业务页数据面三层同源 `ctx.carbon`；nocobase 读路径退役后 B7 的删除面缩小为纯代码删除（运行时引用已断）。
- carbon 成为湖仓的业务真源（`synced_carbon` schema），`legacy_nocobase` 138 表冻结历史；分析面（lakehouse_query）同时覆盖两个时代的数据。
- replace 模式（无游标表）的湖仓侧是当前快照而非 append-only 历史——与 B2 决策 4 的 append 语义在 carbon 源上有分野；触发条件（游标列全 NULL）已记录，若需要行级历史需上游 DB trigger 补游标。
- ui-slots 的 `hidden` 是所有 list 座位的新通用能力：nav 激活的功能页不再占用 tab 环视觉位。

## Alternatives considered

- **connector-registry provider 形态**：被否——造假 discover 面（决策 1）。
- **/api/v1 oRPC 客户端**：被 B0 否决（API-key 商业门控，session JWT 被显式 401）。
- **ENUM 列建表后 ALTER 转换**：被否——append 路径比建表路径多（决策 5）。
- **同步游标用 createdAt 兜底**：carbon 的 createdAt 同样仅应用层维护，兜不住 PostgREST 行（决策 5）。
- **cb_create 接受模型给的 companyId**：被否——租单是部署侧绑定，RLS 兜底之外的显式拒收把越权企图变成可读错误（决策 4）。

## Testing

- 单测：connector-carbon 12/12（会话生命周期/RLS 结构化/租户注入/受限过滤器）、tool-carbon 13/13（三分门控/companyId 拒收/degraded 模式）、ui-business 69/69、apiproxy+connection+runtime+ui-nav 定向 454 全绿、lakehouse-sync+engine 44 绿。
- 门禁：`pnpm run typecheck` 0、`pnpm run build` 全绿、`verify-cordis-config` 181 文件过、`verify-agent-note-format` 过。
- 真实实跑：灌数对账全 ✓（01-seed-run.txt）、湖仓三轮同步 delta 精确（02-lakehouse-sync.txt）、LLM 会话 cb_list/cb_create 往返（03-acceptance-run.txt + PNG×6）。

## Follow-ups

- carbon UI 深度截图（登录后 parts 列表含 LLM 行）：dev 栈 magic-link 的 SPA hash 建链在 headless 下未完成（07-erp-double-sided.txt）；行级证明走了 PG 实查 + API 201 回执。人工路径 B0 已证。
- /carbon 代理的 vite HMR 与 /_data 客户端路由在前缀下不可达：整页导航（SSR）可用；生产构建 asset base 可闭合（carbon-proxy.ts 头注记录）。
- carbon `updatedAt` 应用层维护意味着 replace 表没有行级历史：需要历史时上游补 DB trigger（与 R-5 关联）。
