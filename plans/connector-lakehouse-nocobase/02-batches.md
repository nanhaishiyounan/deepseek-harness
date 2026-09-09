# 02 分批实施详表（N0–N7）

> 每批 = 一个 code 子任务规模。统一遵循：注册即 effect、闭 union `assertNever`、request/spec split、Config 可从 cordis.yml 覆盖、fail-loud、新包 README 三件套、`pnpm run test:coverage` per-file 100%、每非平凡批同 PR Agent Note。
> 通用验证序列（每批必跑）：`pnpm run typecheck && pnpm run lint && pnpm vitest run <本批包> && pnpm run doc-sync`；涉及组合变更的批次加 keyless 快照与 with-key e2e。
> 通用开发提醒：服务端插件/网关改动后重启 `dsh web` 长驻进程（[BUG-4 模块图冻结契约](../../.agents/notes/implemented/architecture/2026-07-29-dsh-source-launch-tsx-esm.zh.md)）；`scripts/dev-web.ts` 与 `pnpm run build` 不并发。

---

## N0 上传链路债务清偿（"上传任何文件"的地基）

**依赖**：无。**改动面**：apiproxy kb 域 + ui-kb + web-fetch-http。

### 范围

1. **base64 栈安全验证**：[`kbUploadRequestSchema.data`](../../packages/host/apiproxy/src/api/kb.schema.ts) 的 canonical RFC-4648 正则（kb.schema.ts:82）在数 MB 输入上触发 V8 栈深度风险。替换为栈安全策略：先长度模 4 校验，再分段（4KiB/段）正则校验，或 `Buffer.from(...,'base64')` roundtrip 比对；保留"拒绝宽松解码静默丢字符"的既有语义（注释 :74-79）。同步审查 [`ingestUrl`](../../packages/host/apiproxy/src/api/kb.schema.ts) 同型字段。
2. **并发同名 crosstalk**：[`pick()`](../../packages/client/ui-kb/src/client/workbench/KbIngestDialog.tsx) 完成回调按 `row.name === file.name && row.status === 'busy'` 匹配（:142-144、:150-152）改为按行身份（uploadId/序号）匹配；同批两个同名文件状态各自独立。
3. **同名重传提示**：`kb.upload` 响应增加 `replaced: boolean`（[api-proxy.ts](../../packages/host/apiproxy/src/api-proxy.ts) 的 `storeKbDocument` 前检测既有 `(tenantId, sourcePath)` 文档）；[`uploadFile`](../../packages/client/ui-kb/src/client/index.ts) 透传，UI toast「已替换同名文档」。overwrite 语义本身保留（[putDocument 契约](../../packages/kb/kb/src/types.ts)）。
4. **DNS rebinding TOCTOU（债务 #1）**：[`url-policy.ts`](../../packages/kb/tool-kb/src/url-policy.ts) 校验时解析的 IP 随请求下发，[web-fetch-http](../../packages/web/web-fetch-http/src/provider.ts) 直连该 IP（SNI/Host 保持原域名）——按债务表既定 pin-IP 方案。

### 文件清单

- `packages/host/apiproxy/src/api/kb.schema.ts`（分段验证）
- `packages/host/apiproxy/src/api/kb.ts`（upload 响应类型 +replaced）
- `packages/host/apiproxy/src/api-proxy.ts`（upload 路径 replaced 检测）
- `packages/client/ui-kb/src/client/workbench/KbIngestDialog.tsx`（行身份匹配 + toast）
- `packages/client/ui-kb/src/client/index.ts`（uploadFile 透传）
- `packages/kb/tool-kb/src/url-policy.ts` + `packages/web/web-fetch-http/src/{provider,types}.ts`（pin-IP）
- 测试：`packages/host/apiproxy/tests/kb-domain.spec.ts` 扩大文件用例；ui-kb 对应 client spec；url-policy 重绑定用例

### 验收

- 5MB / 20MB 文件经 `kb.upload` 成功（64MiB 内不再栈溢出）；错误输入仍被 canonical 拒绝
- 同批选入两个同名文件：两行状态独立点亮；重传后 toast 显示「已替换」
- pin-IP 后重绑定域名（校验后 DNS 切换）不再可达内网地址
- 真实 key 冒烟：`examples/kb-agent/scripts/upload-real-key-smoke.mts` 扩大文件路径

### 验证策略

`pnpm vitest run packages/host/apiproxy packages/client/ui-kb packages/kb/tool-kb packages/web/web-fetch-http`；`pnpm run test:snapshot -t kb`；with-key 上传冒烟。Agent Note（bug-fix）：栈溢出根因 + 分段验证设计 + pin-IP 语义。

---

## N1 湖仓能力缝（Service Definition + catalog + DuckDB Provider）

**依赖**：无（可与 N0 并行）。**改动面**：新包 3 + tsconfig references + bundle 不动（examples 直接组合，llm-minimax 先例）。

### 范围与包设计

**`packages/lakehouse/lakehouse/`（`@deepseek-ai/dsh-lakehouse`，Service Definition，`ctx.lakehouse`）**

- [`types.ts`](../../packages/lakehouse/lakehouse/src/types.ts)：
  - `TabularData`（`columns: {name, sqlType}[]` + `rows: unknown[][]`）——共享词汇，connector 包依赖此类型
  - `LakehouseTable`（`tenantId` + `tableName` 身份；重载同对即替换，对齐 kb 的 `(tenantId, sourcePath)` 模型；`columns` / `format: 'parquet' | 'csv'` / `location` workspace 相对路径 / `rowCount` / `provenance?` 与 `KbProvenance` 同构 / 时间戳）
  - `CatalogStore` 契约：`id` / `available()` / `registerTable`（overwrite-shaped 事务）/ `listTables(tenantId)` / `describeTable` / `dropTable` / `recordTransfer` / `close`
  - `QueryProvider` 契约：`id` / `available()`（禁 I/O）/ `query(tenantId, sql, signal): LakehouseQueryResult`（rows + columns + `truncated`）/ `writeParquet(location, tabular)`（load 路径用）
  - `LakehouseQueryResult` / `LakehouseError extends HarnessError`（开放 string code）/ `LakehouseUsage`（loadedTables / lakehouseQueries 对称 [KbUsage](../../packages/kb/kb/src/types.ts)）
- [`index.ts`](../../packages/lakehouse/lakehouse/src/index.ts)：`LakehouseRuntime extends Service` 挂 `ctx.lakehouse`；`registerCatalogStore` / `registerQueryProvider`（注册即 disposer，重复抛 `LAKEHOUSE_DUPLICATE_PROVIDER`；选择规则照 kb 五分支错误码语义：缺失/不可用/歧义/无配置各自专属错误码）；`load(request)`：TabularData → `writeParquet` → catalog 注册 + usage 计量；`query(sql)`：catalog 校验表归属 → 引擎执行 → `maxRows`（默认 200，可配置）截断；`listTables` / `dropTable` / `stats` / `usage`。`LakehouseRuntimeConfig`：`catalogStore` / `queryProvider` / `dataRoot`（默认 `workspace/lakehouse`）/ `maxRows`——全部 cordis.yml 可覆盖
- [`invariant.ts`](../../packages/lakehouse/lakehouse/src/invariant.ts)（`exports["./invariant"]` 布线）

**`packages/lakehouse/lakehouse-sqlite-catalog/`（`@deepseek-ai/dsh-lakehouse-sqlite-catalog`，Catalog Provider）**

- [`schema.ts`](../../packages/lakehouse/lakehouse-sqlite-catalog/src/schema.ts)：`SCHEMA_VERSION = 1` + application id `"DSHL"`，照 [kb-sqlite schema](../../packages/kb/kb-sqlite/src/schema.ts) 模板（安全 PRAGMA → `BEGIN IMMEDIATE` → 初始化或拒绝异版本）
- [`store.ts`](../../packages/lakehouse/lakehouse-sqlite-catalog/src/store.ts)：`SqliteCatalogStore implements CatalogStore`——`node:sqlite` `DatabaseSync`（延迟动态 import 过滤 experimental warning，先例）；表 `lakehouse_tables`（`UNIQUE(tenant_id, table_name)`）+ `lakehouse_transfers`（transfer record：source/destination/datasetId/rows/时间）
- [`index.ts`](../../packages/lakehouse/lakehouse-sqlite-catalog/src/index.ts)：插件（`inject: ['lakehouse']`），Config：`path`（`:memory:` 支持）、`busyTimeoutMs`

**`packages/lakehouse/lakehouse-duckdb/`（`@deepseek-ai/dsh-lakehouse-duckdb`，Query Provider）**

- 依赖：`@duckdb/node-api`（官方 prebuilt；peerDeps+devDeps 镜像模式评估，若 knip/hygiene 报未用则按 optional 运行时动态 import 处理——设计原则：模块顶层不 import，`available()` 内动态探测，缺失=不可用降级）
- [`engine.ts`](../../packages/lakehouse/lakehouse-duckdb/src/engine.ts)：DuckDB 连接管理（`:memory:` + `ATTACH` parquet/csv 文件直查——湖上外表查询无需常驻库）；`query`（校验表归属后 `SELECT ... LIMIT maxRows+1` 判截断）；`writeParquet`（`COPY (VALUES ...)` 或 DataFrame API 写 parquet）
- [`index.ts`](../../packages/lakehouse/lakehouse-duckdb/src/index.ts)：插件（`inject: ['lakehouse']`），Config：`memoryLimitMb` / `threads`

### 测试要求

- lakehouse：runtime 选择规则五分支 / load→query 往返 / maxRows 截断 / 计量 / 降级（引擎不可用=查询 fail-loud `LAKEHOUSE_ENGINE_UNAVAILABLE`、listTables 仍可用）
- lakehouse-sqlite-catalog：`:memory:` 全路径（注册/替换/租户过滤/transfer record/版本拒绝）
- lakehouse-duckdb：真实 DuckDB 跑 csv/parquet 双格式（prebuilt 在 CI 三平台可用性验证：先本机 `pnpm vitest run packages/lakehouse`，CI 失败即触发 D1 回退决策点）

### 验收

- `load(csvTabular)` → parquet 落盘 + catalog 注册 → `query('SELECT ... ')` 返回行与截断标记；租户 A 查不到租户 B 的表；同表重载=替换（旧行数失效）
- `pnpm vitest run packages/lakehouse` 全绿，coverage 100%

### 验证策略

通用序列 + `pnpm run hygiene`（knip 对 duckdb 依赖的处理验证）+ `pnpm run check:windows-wine`（仅当怀疑 prebuilt windows 失败时）。Agent Note（architecture）：湖仓缝设计 + DuckDB 选型论证 + 降级语义。

---

## N2 工具面与数据路由（统一上传 + 查询路由）

**依赖**：N1。**改动面**：新包 1 + apiproxy 新域 + ui-kb 入口 + examples 组合。

### 范围

1. **`packages/lakehouse/tool-lakehouse/`（`@deepseek-ai/dsh-tool-lakehouse`，Tool Consumer）**
   - `lakehouse_tables`（参数无/`table?`；输出表清单+schema 摘要+行数；render generic 卡；timeoutMs 10s）
   - `lakehouse_query`（参数 `sql` 非空；执行前 catalog 校验表归属（防跨租户 SQL——引擎层以表名白名单过滤）；输出列元数据+行集+截断提示+「数据来源：湖仓表 <名>」溯源行；render generic 卡；timeoutMs 30s；`isConcurrencySafe: true`）
   - Config：`tables`/`query` 开关、`tenant` 必填（服务端绑定，照 [tool-kb](../../packages/kb/tool-kb/src/index.ts) 模式——parse 时拒绝 `tenant` 实参）
2. **apiproxy `data` 域（统一上传入口）**——按 [apiproxy 五处协同模式](../../packages/host/apiproxy/src/api/kb.ts)：
   - `api/data.ts`（`DataApi`：`data.upload` 单方法，响应 `{ destination: 'kb' | 'lakehouse', replaced?, table?, chunks?, document? }`）+ `api/data.schema.ts`（复用 N0 栈安全 base64）
   - `rpc-map.ts` / `fetch/handler.ts` / `fetch/client.ts` 注册；错误码 `rpc.ts`/`rpc.schema.ts` 登记（`data-unsupported-type` 等）
   - 实现（api-proxy.ts）：`DataRouter.resolve(filename, mime, bytes)` 显式判别（扩展名白名单 → 魔数嗅探 → 未识别 fail-loud 提示支持的类型）→ kb 路径复用既有 ingest 管线 / lakehouse 路径解析 csv/xlsx/json-array → `TabularData` → `ctx.lakehouse.load`（xlsx 解析依赖按「依赖优先于手搓」论证引入；csv 自写或依赖论证）
   - 写开关：Config `dataUploadEnabled`（独立于 `kbWriteEnabled`）
   - client fake 面同步（runtime/connection 两处，先例 [fake-api.client.ts](../../packages/client/runtime/tests/fake-api.client.ts)）
3. **ui-kb 上传入口切换**：[KbIngestDialog](../../packages/client/ui-kb/src/client/workbench/KbIngestDialog.tsx) 上传页签改走 `data.upload`；toast 按 destination 文案（「已入知识库」/「已入数据湖：<表名>」）；[kbStore](../../packages/client/ui-kb/src/client/kbStore.ts) records 区分两目的地
4. **查询路由（SKILL 层）**：[cordis.patch.yml](../../examples/kb-agent/cordis.patch.yml) insert `tool-lakehouse`；persona 增检索分工指引（文档片段→`kb_search`；数值/统计/清单→先 `lakehouse_tables` 再 `lakehouse_query`；专家/外部数据→`connector_discover`——第三项 N3 落地后补）

### 测试要求

- tool-lakehouse：工具面/schema 快照/租户绑定拒绝/截断/降级（引擎缺失=查询工具执行时结构化错误）
- apiproxy：data 域单测（csv/xlsx/json/md/pdf 五类判别、未知类型拒绝、dataUploadEnabled 门、replaced 透传）
- e2e/快照：`examples/kb-agent/tests/` 新增 `data-routing.spec.ts`（keyless：上传 csv+md → 两路各自可检索/查询；快照锁定 transcript）

### 验收

- 浏览器上传 csv → toast「已入数据湖」→ 会话问「这张表的行数/某列合计」→ `lakehouse_query` 带溯源回答；上传 md → 「已入知识库」→ `kb_search` 引用回答
- `pnpm run test:snapshot -t data-routing` 绿

### 验证策略

通用序列 + with-key e2e（真实 MiniMax-M3 混合问答）+ 真实上传冒烟。Agent Note（feature）：统一路由判别器设计（单一路由真相）+ 查询路由策略。

---

## N3 连接器能力缝 + NocoBase client（含 mock 基建）

**依赖**：N1（transfer 复用路由与 load）。**改动面**：新包 3 + credentials 接线 + examples 组合。

### 范围与包设计

**`packages/connector/connector/`（`@deepseek-ai/dsh-connector`，Service Definition，`ctx.connector`）**

- [`types.ts`](../../packages/connector/connector/src/types.ts)：
  - `ConnectorProvider`：`id` / `available()`（禁 I/O）/ `capabilities: ConnectorCapability[]`（`'discover' | 'fetch' | 'transfer'` 启动期声明）/ `discover(request: ConnectorDiscoverRequest): Promise<ConnectorDatasetSummary[]>` / `fetch(ref: ConnectorDatasetRef, signal): Promise<ConnectorDataset>`
  - `ConnectorDataset`：`id` / `title` / `kind: 'tabular' | 'document' | 'expert-profile' | 'service'`（闭 union + `assertNever`）/ `manifest`（来源 provider/更新时间/授权范围）/ content 判别 union：`{ kind:'tabular', tabular: TabularData } | { kind:'document'|'expert-profile', ingest: KbDocumentInput 同构 } | { kind:'service', service: ExpertServiceRef }`
  - `ConnectorTransferRequest/Result`（source providerId + datasetId + `target: 'auto' | 'kb' | 'lakehouse'`；结果含 destination/计数/transferRecordId）
  - `ConnectorError extends HarnessError`
- [`index.ts`](../../packages/connector/connector/src/index.ts)：`ConnectorRuntime`——`registerProvider`（disposer，重复抛 `CONNECTOR_DUPLICATE_PROVIDER`）；`discover`/`fetch` 路由到 provider（缺失 fail-loud）；`transfer` 五步编排（pull → `DataRouter` classify → route（kb.ingest / lakehouse.load，provenance 由缝自算 contentHash）→ deliver → catalog `recordTransfer` + usage 计量）；每步结构化可观测
- 依赖：`@deepseek-ai/dsh-lakehouse`（TabularData 类型）+ `@deepseek-ai/dsh-kb`（ingest 输入类型）——类型级依赖，包依赖方向单向

**`packages/connector/connector-nocobase/`（`@deepseek-ai/dsh-connector-nocobase`，Provider）**

- [`client.ts`](../../packages/connector/connector-nocobase/src/client.ts)：NocoBase REST client——`Authorization: Bearer <token>`；collections CRUD（`/api/<c>:list|:create|:get|:update|:destroy` + filter URL 编码 JSON）；附件（`attachments:upload` multipart `file` 字段 / `attachments:create` 外部 URL 免流注册）；超时/重试（kb-embed-shared 先例）
- [`provider.ts`](../../packages/connector/connector-nocobase/src/provider.ts)：`discover` 映射（experts → expert-profile 数据集；datasets → tabular/document；expert_services → service）；`fetch` 拉取并组装 ConnectorDataset
- Config：`baseUrl`（env `NOCOBASE_BASE_URL`）/ `apiKeyEnv`（默认 `NOCOBASE_API_KEY`，走 `ctx.credentials` + 环境回退，[llm-deepseek resolveApiKey 模式](../../packages/llm/llm-deepseek/src/index.ts)）；缺凭据 = `available()` false（降级不失败）
- [`tests/mock-server.ts`](../../packages/connector/connector-nocobase/tests/mock-server.ts)：本地 HTTP mock（experts/datasets/orders/attachments fixture 回放——[llm-minimax mock-server](../../packages/llm/llm-minimax/tests/mock-server.ts) 先例）

**`packages/connector/tool-connector/`（`@deepseek-ai/dsh-tool-connector`，Tool Consumer）**

- `connector_discover`（参数 `query`；输出数据集+专家清单，专家条目含姓名/机构/领域/服务；render intent `generic`，presentResult 专家卡；timeoutMs 15s）
- `connector_fetch`（参数 `dataset_id`；输出预览（tabular 前N行 / document 摘要+引用）；timeoutMs 30s）
- `connector_transfer`（参数 `dataset_id` + `target?`；输出入库结果 + transferRecordId；timeoutMs 120s）
- Config：三工具开关 / `tenant` 必填（服务端绑定）

### 测试要求

- connector：注册/discover/fetch 路由/transfer 五步（mock provider）/重复注册/计量
- connector-nocobase：mock-server 全路径（list filter 翻译/分页/token 头/附件两形态/凭据缺失降级）
- tool-connector：schema 快照/租户绑定/超时/降级（provider 不可用=工具执行时结构化错误）
- keyless 快照：examples 新增 `connector-flow.spec.ts`（mock NocoBase 起真实 HTTP + discover→fetch→transfer→lakehouse 可查）

### 验收

- mock 环境下 `connector_discover("专家 出海")` 返回张会长骨架条目（N4 充实真实数据）；`connector_transfer` 把 csv 数据集入湖仓后 `lakehouse_query` 可查（跨缝联动）
- `pnpm vitest run packages/connector` 全绿 coverage 100%

### 验证策略

通用序列 + `pnpm run hygiene`。Agent Note（architecture）：连接器缝 + 传输协议（五步编排）+ 数据包判别 union 设计。

---

## N4 专家数据集（张会长建模）+ 专家发现

**依赖**：N3。**改动面**：数据与呈现为主（少代码）+ eval 扩展。

### 范围

1. **专家数据建模**（结构先行，真实数据热替换）：
   - NocoBase collections 种子脚本 `examples/kb-agent/scripts/seed-experts.mts`（经 connector-nocobase client 建+灌数据，或直接 REST）：`experts`（张红喜/漯河电商协会会长/食品出海·中亚/履历要点）、`expert_services`（中亚货运动线方案/海外仓风险应对/出海合规咨询；交付物类型=PDF 方案；定价字段）、`datasets`（专家知识资产登记）
   - mock fixture 同步（[mock-server fixtures](../../packages/connector/connector-nocobase/tests/) 与种子脚本共享 JSON 真源，避免双源漂移——`examples/kb-agent/workspace/data/experts/` 放权威 JSON，脚本与测试都读它）
2. **KB 语料**：`workspace/data/export-risk/` 编写出海风险应对行业通识 6-10 篇（海运改道/中欧班列/海外仓备份与转移/保险理赔/中亚市场准入/关税与合规），docKind 覆盖 `report`/`regulation`；`import-real-docs.sh` 白名单扩目录
3. **专家卡片呈现**：[tool-connector presentResult](../../packages/connector/tool-connector/src) 专家卡（姓名/机构/领域标签/服务清单/「可下单」提示）；ui-kb toolview `connector_discover` 键注册（[KbToolRow 先例](../../packages/client/ui-kb/src/client/toolviews)）
4. **债务 #7 顺手启用**：[cordis.patch.yml](../../examples/kb-agent/cordis.patch.yml) kb 增 `minRelevanceScore`（用 [calibrate-relevance.mts](../../examples/kb-agent/scripts/calibrate-relevance.mts) 实测定值）；hit 分数进 [KbHitCard](../../packages/client/ui-kb/src/client/workbench/KbHitCard.tsx) 弱化展示
5. **eval 扩展**：`eval/questions.json` 增出海风险类 20 问（gold 指向新语料）

### 测试要求

- 语料入库 e2e（with-key hybrid + keyless text 双轨）；`eval-retrieval.mts --answers` 重跑达标记录（Top5 ≥80%/引用 ≥90% 延续线）
- keyless 快照：`expert-discovery.spec.ts`——「俄罗斯的仓库被乌克兰炸了怎么办」text 模式：kb_search 命中应对语料 + connector_discover（mock）返回张会长 + 回答含引用与专家提及

### 验收

- 真实 key 会话实跑：该问题回答 = 应对要点（带 [n] 引用）+ 张会长专家卡（可下单提示）
- 评测重跑不回退（新旧混合 120 问达标）

### 验证策略

通用序列 + with-key e2e + eval 重跑（真实 key）。Agent Note（feature）：专家数据集三合一建模（画像/资产/商品）+ 发现动线 + 相关性阈值启用记录。

---

## N5 订单域 + 方案 PDF 生成（DSH 内闭环）

**依赖**：N4。**改动面**：新包 1 + apiproxy orders 域 + tool-connector 增工具。

### 范围

1. **`packages/expert/expert-pdf/`（`@deepseek-ai/dsh-expert-pdf`，纯函数排版库，非插件）**
   - `DraftSpec` 类型（`title` / `client` / `expert`（署名+机构）/ `date` / `sections: {heading, paragraphs[], refs[]}[]`）
   - [`render.ts`](../../packages/expert/expert-pdf/src/render.ts)：`renderPdf(spec): Promise<Uint8Array>`——pdf-lib + fontkit，CJK 字体 `resources/fonts/NotoSansSC-Regular.otf`（OFL，subset 嵌入）；章节模板：封面/背景与问题/风险分析/解决方案（货运、仓库、合规）/实施路线图/参考来源；页眉页脚（订单号/页码）
   - 无 LLM 依赖（排版纯函数）；测试：生成→pdf-lib 读回断言页数/文本抽取含节标题/中文不乱码
2. **apiproxy `orders` 域**（五处协同模式）：
   - `api/orders.ts`：`orders.create`（service_id + brief → 转发 NocoBase `orders:create`，状态 `pending`）/ `orders.get` / `orders.list`；`orders.fulfill`（**workflow 回调入口**：起草→生成→落盘→挂附件→状态 `delivered`）
   - 起草管道（api-proxy.ts 内聚）：brief → kb_search 检索（引用入 refs）→ MiniMax-M3 起草 sections（`ctx.llm`，DraftSpec）→ `renderPdf` → `workspace/deliverables/<orderId>.pdf`
   - keyless 兜底：无 llm key 时固定模板 DraftSpec（明确标注 fallback，不伪装真实起草——「未配置模型服务，按模板生成」提示进订单备注）
   - 交付物下载：`orders.download`（读文件返回字节；复用 downloads 域先例鉴权口径）
3. **tool-connector 增工具**：`order_create`（参数 `service_id` + `brief`；输出订单号+状态；timeoutMs 60s）/ `order_status`（参数 `order_id?`；输出状态+交付物信息；10s）；persona/SKILL 增下单动线指引（发现专家→确认服务→下单→查询）

### 测试要求

- expert-pdf：DraftSpec→PDF 往返断言（多节/中文/引用列表/空段落边界）
- apiproxy orders 域：create/get/list/fulfill/download 全路径（mock NocoBase）；keyless 起草兜底分支；下载 404 分支
- keyless 快照：`expert-order.spec.ts`——mock NC + 固定 DraftSpec：下单→fulfill→PDF 真实生成落盘→order_status=delivered→下载字节为合法 PDF（快照锁定 transcript 与订单状态流转）

### 验收

- 会话实跑（真实 key + mock NC）：「请安排张会长出一份中亚货运风险应对方案」→ `order_create` → PDF 生成（>1 页、含「风险分析」「解决方案」节、引用 KB 语料）→ `order_status` 报 delivered → 下载成功
- 全程 session log 可回放（模型可见⟺落日志）

### 验证策略

通用序列 + with-key e2e。Agent Note（feature）：交付物生成管道（起草/排版/落盘/挂载）+ keyless 兜底语义。

---

## N6 NocoBase 融合实装（真源订单 + workflow + 附件交付）

**依赖**：N5。**改动面**：examples 脚本/组合 + 文档；DSH 侧小改（附件挂载路径）。

### 范围

1. **本地环境**：`examples/kb-agent/docker-compose.nocobase.yml`（postgres + create-nocobase-app 引导说明）；[QUICKSTART.zh.md](../../examples/kb-agent/QUICKSTART.zh.md) 增「NocoBase 业务后台」节（安装/初始化/API key/耗时预期）
2. **初始化脚本**：`examples/kb-agent/scripts/nocobase-setup.mts`——REST 建 collections（experts/expert_services/datasets/orders/deliveries；orders 含状态字段+附件字段）+ 角色与 API key 创建引导（界面步骤文档化）；`seed-experts.mts` 对真实实例灌张会长数据
3. **workflow 模板**（界面配置文档化 + 校验脚本）：orders `afterCreate` 触发 → `manual` 审批节点（会签/或签，可选旁路开关）→ 通过分支 `request` 节点回调 apiproxy `orders.fulfill`（出站白名单 `SERVER_REQUEST_WHITELIST` 增 DSH 地址）→ `update` 回写状态；驳回分支 `notification`。校验脚本 `verify-workflow.mts`（读 workflow 配置断言节点链）
4. **附件挂载**：N5 的 fulfill 管道补「`attachments:upload` multipart 流上传 PDF → 返回 attachment id → `orders/<id>:update` 挂附件字段」（真源在 NocoBase，DSH 本地文件为缓存副本）；`orders.get` 聚合返回 NocoBase 附件 URL
5. **多租户映射文档**：四级租户（平台/运营商/企业/用户）→ NocoBase roles + departments 树 + 行级 scope 的最小映射说明（MVP 单租户=单角色 key；不实现）

### 测试要求

- with-NC e2e（`NOCOBASE_BASE_URL` 存在才跑，否则自跳过）：真实实例全链路——agent 下单 → NocoBase 界面可见订单 → 审批通过 → workflow 回调 → PDF 生成 → 附件挂在订单 → `order_status` 报 delivered + 附件 URL → 下载与 NocoBase 附件一致（字节比对）
- keyless 全量快照保持绿（mock 路径回归）

### 验收

- 真实 NocoBase 实跑全链路一次成功并留实录（终端输出/订单截图说明）
- 附件双形态（upload 流 / create 外部 URL）至少 upload 形态实跑验证

### 验证策略

通用序列 + with-NC e2e + `verify-workflow.mts`。Agent Note（architecture）：NocoBase 融合（REST 为主 + workflow 回调 + 附件交付）+ 数据流与单一事实源决策。

---

## N7 端到端演示 + 文档 + 质量门总验

**依赖**：N6。**改动面**：examples 演示脚本 + 文档 + 收尾。

### 范围

1. **演示脚本** `examples/kb-agent/scripts/demo-full-journey.mts`（三场景串演，with-key + with-NC，逐场景断言+实录输出）：
   - 场景 1：问「俄罗斯的仓库被乌克兰炸了怎么办」→ 回答含应对要点引用 + 张会长专家卡
   - 场景 2：上传 csv（海关进出口样例）+ md（走访纪要）→ 双路由各就位 → 「上月出口额合计」湖仓答 / 「宏发风险点」KB 答
   - 场景 3：下单张会长方案 → （审批）→ PDF 交付 → 状态查询 → 下载
2. **文档**：[QUICKSTART.zh.md](../../examples/kb-agent/QUICKSTART.zh.md) 全面更新（新组合/新场景/NocoBase 节/演示命令）；`docs/subsystems/` 增 lakehouse/connector 双语页（若 doc-sync 判定为核心 seam，[docs/AGENTS.md](../../docs/AGENTS.md) 流程）；[cordis.patch.yml](../../examples/kb-agent/cordis.patch.yml) 最终组合（lakehouse 三包 + tool-lakehouse + connector 三包 + expert-pdf config + data/orders 域开关）
3. **收尾**：plans 本目录增「完成记录」节（验收轨迹/关键证据/新登记债务）；Agent Note 索引核对（N0-N6 每批一篇在位）

### 验收（总 DoD）

1. 三场景演示脚本真实跑通并留实录（无 mock-only 环节：真实 MiniMax-M3、真实 NocoBase、真实 PDF 文件）
2. 全质量门：`pnpm run typecheck && pnpm run lint && pnpm run test:coverage && pnpm run build && pnpm run hygiene && pnpm run doc-sync && pnpm run test:snapshot`（kb/data-routing/connector-flow/expert-discovery/expert-order 全绿）
3. keyless 快照覆盖全部新模型可见行为；with-key/with-NC e2e 自跳过逻辑验证
4. 评测不回退（120 问混合集）

### 验证策略

全门 + 真实演示实录。完成后 plans 完成记录 + attempt_completion 汇总。

---

## 附：批次依赖图

```
N0 (上传债务) ─────────────────────────────────┐
N1 (湖仓缝) ──→ N2 (工具+路由) ──┐              │
        └────→ N3 (连接器缝) ──→ N4 (专家数据集) │
                                    ↓           │
                                  N5 (订单+PDF) ←┘（expert-pdf 无依赖 N0，
                                    ↓             但上传稳定性受益）
                                  N6 (NocoBase 实装)
                                    ↓
                                  N7 (演示+总验)
```

---

## 完成记录（N0–N7 收口，2026-09-05）

| 批次 | 状态 | 关键交付与证据 | 对计划的偏差 |
|---|---|---|---|
| N0 上传债务清偿 | ✅ | DNS rebinding pin-IP、并发同名行身份、替换提示、大文件 e2e；Note `2026-09-03-upload-chain-debt-clearing` | 无 |
| N1 湖仓缝 | ✅ | lakehouse + sqlite-catalog + duckdb 三包；Note `2026-09-03-lakehouse-seam-duckdb-sqlite-catalog` | 无 |
| N2 工具+路由 | ✅ | tool-lakehouse、apiproxy data 域、DataRouter；Note `2026-09-03-unified-data-upload-routing` | 无 |
| N3 连接器缝 | ✅ | connector/connector-file/connector-nocobase/tool-connector 四包 + `connector-transfer-demo.mts` 真实跑通；Note `2026-09-04-connector-seam-and-transfer-protocol` | 无 |
| N4 专家数据集 | ✅ | dataset.json 真源 + 11 篇出海语料 + expert-discovery e2e/快照；债#7 阈值顺手启用（0.015） | 无 |
| N5 订单+PDF | ✅ | expert-orders + expert-pdf；order_create/order_status 工具 + apiproxy orders 域；Note `2026-09-05-expert-order-pdf-pipeline` | 计划「apiproxy 内聚起草管道」改为独立 expert-orders 包（apiproxy 硬依赖 agent spine，轻量组合无法承载；两消费者共享一缝） |
| N6 NocoBase 实装 | ✅ | setup-nocobase.mts（init/start/verify/stop/reset 幂等）+ workflow 四节点 + 附件挂载；nocobase-track e2e 全链路 PASSED；Note `2026-09-05-nocobase-real-track-integration` | docker-compose 改为外部源码仓 + 本地 postgres 引导（sqlite 方言缺原生包，官方安装路径）；mock wire 按真实 2.2.6 纠偏；多租户映射说明移至 N7 收口补齐（QUICKSTART「多租户映射（MVP 形态）」段） |
| N7 演示+总验 | ✅ | `demo-full-journey.mts` 三场景真实跑通（实录 `demos/full-journey-20260905-150321.md` + 浏览器层验证）；QUICKSTART/README 收口；全质量门矩阵见下；Note `2026-09-05-full-journey-demo-and-wire-normalization` | 演示场景 3 用 seam 直调下单（order_create 工具的同步闭环语义与真实审批轨道的 fulfill 回调相斥，如实呈现后者——Note 有论证）；顺带修复 orders wire 行归一（真实轨道 order_status 首调暴露 NULL 可选列/缺 createdAt 列） |

### N7 质量门结果矩阵（2026-09-05 实跑；R1 修复批 2026-09-05 晚复跑更新）

| 门 | 结果 | 证据与归类 |
|---|---|---|
| typecheck | PASS | R1 复跑：全仓 `tsc -b` 无错（含新增 scripts/nocobase-workflow.ts、scripts/resolve-env.ts 入 tsconfig.host.json） |
| lint（oxlint） | PASS | R1 复跑：0 warnings 0 errors / 2835 文件（`pnpm run lint` 尾行 `Found 0 warnings and 0 errors`） |
| doc-sync | PASS（28/28） | 首跑 27/28：doc-typecheck 报 FakeLlm options 的 exactOptionalPropertyTypes 违例，修为条件展开后单跑 `pnpm run doc-typecheck` 绿；R1 新增 Agent Note `2026-09-05-r1-verification-blockers` 三件套并经 `verify-translation-pairing --write` 登记 |
| build | PASS | tsc emits + tsdown 全量（202 client artifacts）；R1 未触碰构建面（未复跑，沿用本日实跑结论） |
| test（全量单测） | PASS（豁免外） | 两次全量：931/954 与 939/961 文件过；13–14 个失败文件全数归类——环境并发超时类（hooks-claude-code ×3、hooks-codex ×3、sandbox-local、bash-sandbox/partial-landlock、ui-trajectory 等，抽验 hooks-codex/bridge 单跑 2.36s 全绿）与既有生成物漂移（gen-third-party-notices、gen-tool-catalog，**本批已修复**：notices 再生成补 @duckdb/node-api/@pdf-lib/fontkit，catalog spec 期望补 order_create/order_status，单跑 36/36 绿）；examples/kb-agent 全部 spec 两轮全绿。R1 改动包 expert-orders 单测 32/32 过（`pnpm vitest run packages/expert/expert-orders`） |
| hygiene | PASS（既有豁免外） | 9/13 门过；4 失败均既有豁免：vendor rescape（基线）、constraints 版本漂移（基线）、ui-kb client packages（基线）、publint——**如实更正**：既有豁免基线为 225 处 `./src/*` exports 模式，本工作线（N1–N7 新增 10 包）以同模式新增约 10 处，合计约 235 处；R1 未新增包、未复跑 hygiene（沿用本日实跑结论） |
| test:coverage（分区 4 路） | 不回退（既有缺口登记） | N7：本批新增 src（normalizeOrderRow）100% 覆盖；expert-orders/src/index.ts branches 基线 76.36%（stash 对照）→ 78.18%。R1 复跑（`vitest run --coverage --coverage.include=packages/expert/expert-orders/src/**`）：draft.ts 新增修复层（repairDraftJson/stripProsePrefix）100% 覆盖（uncovered 行 68/70 为既有 buildDraftMessages 可选字段分支，160-171 为 shape 校验 throw，206 为模板兜底 templateDraftSpec 的可选 org 展开——均为既有缺口）；index.ts branches 78.18% → 78.94%（净改善），重试层新增分支全覆盖（超时回调/max-tokens finish/携错重试 prompt 各有专项测试）。9 个未达标文件仍为 N2–N6 既有缺口，登记为后续债 |
| test:snapshot | PASS（基线豁免外） | R1 复跑：118/128 tests 过、8 失败（`pnpm run test:snapshot` 汇总行 `8 failed | 118 passed | 2 skipped`），失败文件 sort -u 清单全数落在基线豁免的 6 个 prebuilt dist snapshot 文件（apps/cli web-browser-open ×3、acp assembled ×1、goal ×2、headless ×1、session-fixture-layout ×1），与 kb 工作线零交集；较 N7 基线 115/128 净改善。order_create 快照经订单号归一化（ORD-<date>-<no>）不受 8-hex 扩位影响 |
| test:e2e（真实轨道） | PASS（含 R1 修复后复跑） | 初跑 6/6 文件全绿（kb-closed-loop、data-routing、connector-flow、expert-discovery、expert-order、nocobase-track）。**R1 复跑实测**（验证报告曾判 nocobase-track 6/6 失败为模型 JSON 噪声）：`expert-order.e2e.ts` 1 test 17163ms 全绿（draftMaxTokens 16384 生效，DraftSpec 不再截断）；`nocobase-track.e2e.ts` 78s 全链路全绿（真实 NocoBase + 真实 MiniMax-M3，起草→审批→fulfill→PDF 附件字节比对一次通过）。keyless 全 SKIP 路径复跑（.env 移走 + `env -u MINIMAX_API_KEY -u NOCOBASE_BASE_URL -u NOCOBASE_API_KEY`）：demo-full-journey 4s 正常退出 EXIT=0、实录落盘 `demos/full-journey-20260905-224146.md`（修复前同路径永久挂死） |

### 遗留（全工作线合并视图）

- **R1（2026-09-05 终验修复批）交付与登记**：F-2 keyless 挂死（三处 `?.close` 短路 → `closeHttpServer` 显式守卫，keyless demo 4s EXIT=0 实证）；F-3 起草预算补配（expert-order-e2e fixture + cordis.patch.yml 对齐 16384/120000 样板）；F-4 审批流 WorkflowLease（暂停确认后才可恢复、restore 双动作皆执行不吞错、demo 恢复失败记 FAIL 场景）+ demo/e2e NocoBase workflow 操作与 resolveEnv 提取共享（`examples/kb-agent/scripts/nocobase-workflow.ts`、`resolve-env.ts`）；D-1 起草双防线（parseDraftResponse 修复层吸收前缀/尾随逗号/截断噪声 + 携错重试一次，两次失败仍 failed 不伪装成功）；D-2 QUICKSTART 阈值表述对齐实配 0.015 + 三条实测故障排查；D-3 订单号 8-hex（同日碰撞 2¹⁶→2³²，快照归一化同步）。Agent Note：`2026-09-05-r1-verification-blockers`。
- **订单状态机三缺口**（R1 登记技术债，本批不做）：`rejected` 终态（当前驳回分支复用 `failed` + error 文案，审批绕过防御缺一条显式不可恢复态）；`generating` 超时回收（fulfill 半途崩溃的订单停在 generating，无超时回收路径）；fulfill 的条件写（pending→generating→delivered 两段 update 无原子守卫，并发 fulfill 可交错）。演进时改 state-machine.ts + wire 断言一起动。
- **默认预设是否挂 connector 工具的决策**（R1 登记）：enterprise-data-assistant 预设当前不挂 connector/order 工具行（会话内下单动线仅生产 persona 文案 + 场景预设覆盖）；是否把 connector_discover/order_create 纳入默认预设待产品决策。
- **kb_search 文件名匹配通道**（R1 登记）：检索命中只走内容分块向量/文本通道，按文件名（如「宏发」「GB2760」）提问时依赖文档内容提及文件名才命中；文件名元数据通道为后续增强。
- **lakehouse 工具行标题本地化**（R1 登记）：lakehouse_tables/lakehouse_query 的呈现行标题未走 locale 字典。
- **工作线包 coverage 既有缺口**（分区 coverage 首跑暴露，N2–N6 批次未跑过 coverage 门）：expert-orders src（R1 后 index 78.94% / draft 96.05%）、expert-pdf render（branches 84%）、connector-nocobase client/provider、tool-connector order、apiproxy fetch ×2、ui-subagent——共 9 文件未达 per-file 100%；R1 改动本身净改善（draft 修复层与 index 重试层新增分支全覆盖，index branches 78.18%→78.94%）。补齐为后续测试工程。
- **N7 顺带修复的三处既有红**：THIRD_PARTY_NOTICES 缺 N1/N5 依赖条目（再生成）；gen-tool-catalog spec 期望缺 order_create/order_status（N5 后未同步）；expert-discovery.e2e 内嵌 mock 停在 v1 wire 信封（N6 wire 纠偏遗漏 examples 侧，stash 验证既有）。
- **order_create 工具语义与审批轨道的张力**：工具的 create+立即 fulfill 一步闭环服务 DSH 内轨道；真实审批轨道的下单由 seam + workflow 回调驱动（N7 演示与 e2e 的形态）。演进方向：工具按轨道分派（检测审批 workflow 在位时只 create 并告知等待审批），暂不实现。
- **connector_discover 子串检索的关键词引导**：web 会话中 agent 自选长尾关键词不命中 `$includes` 子串过滤；提示词层引导用确切领域词，后续优化。
- **R5 apiproxy 单文件膨胀**（4037 行+）：维持登记，域实现拆分为后续债务候选。
- **既有债务维持登记**：债#2 graph 零计量、债#3 场景填充、债#4 UI doc_kind 选择器、债#5 CI lane 复验、债#6 vendor rescape、债#8 大文档 embed 分批。
- **演示对环境的依赖**：`demo-full-journey.mts` 需 `.env` 三凭据 + NocoBase dev-server 在跑；SKIP 语义保证缺项时演示仍完整可跑（keyless 路径）。
