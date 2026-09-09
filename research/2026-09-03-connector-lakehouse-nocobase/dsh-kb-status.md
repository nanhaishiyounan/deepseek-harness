# deepseek-harness 食品 KB+Agent 实现现状与技术债务基线

> 调研日期：2026-09-03。用途：为「连接器 agent + 湖仓 + NocoBase 融合 + 专家数据集下单交付」新阶段规划提供代码级基线。
> 仓库状态：HEAD 为 `84c60f5a8e feat(kb): food-industry KB agent stack and workbench portal`，`git status` 干净（无未提交改动）。
> 体例：【确证】条目均附文件路径与行号（相对仓库根）；【推断】条目单独标注并说明依据。路径链接按 VSCode 可点击格式书写。

## 0. 执行摘要

【确证】食品 KB+Agent 产品以 8 个 `packages/kb/` 包 + `packages/client/ui-kb` + `packages/host/apiproxy` kb 域 + `examples/kb-agent`（30 场景、100 问评测）形态完整落地：capability seam 三角色齐备、上传/URL/服务器文件三采集通道、hybrid RRF 检索带编号引用、SQLite 确权（provenance 三元组 + scope 授权）与图谱姊妹缝、Web 工作台门户。真实 key 实测评测 hybrid Top5 命中率 99%、引用有效率 96%（[plans/food-kb-agent-plan.md](plans/food-kb-agent-plan.md) §九.2）。

【确证】仓库内不存在任何 connector / lakehouse / NocoBase 相关代码与提交（§11）；可信数据空间仅有 ingest 时静态声明的 provenance + scope 授权过滤，无资产登记、授权审批、撤销、审计流（§5）。

【确证】登记债务 9 项（1 项已清偿，[plans/food-kb-agent-plan.md](plans/food-kb-agent-plan.md) §十一.5），其中 4 项直接约束新阶段：DNS rebinding TOCTOU、graph 零计量、检索无相关性阈值、大文档 embed 稳定性。

## 1. packages/kb/ 包清单与契约

### 1.1 包清单（8 包）【确证】

| 包 | seam 角色 | src 文件 | tests 文件 |
|---|---|---|---|
| [packages/kb/kb](packages/kb/kb) | Service Definition（`ctx.kb`） | chunker / index / invariant / rrf / types | chunker / invariant / rrf / runtime / types（5 spec） |
| [packages/kb/kb-sqlite](packages/kb/kb-sqlite) | Store Provider | index / invariant / schema / sql / store | concurrency / dataspace / index / schema / sql-resource-boundary / store / usage / test-sql（8）+ tests/resources/sql 7 fixture + resources/sql 24 SQL |
| [packages/kb/kb-embed-minimax](packages/kb/kb-embed-minimax) | Embed Provider | index / invariant | index / provider（2） |
| [packages/kb/kb-embed-dashscope](packages/kb/kb-embed-dashscope) | Embed Provider | index / invariant | index / provider（2） |
| [packages/kb/kb-embed-shared](packages/kb/kb-embed-shared) | Embed 传输共享库（retry/backoff） | index / invariant | index / invariant（2） |
| [packages/kb/kb-graph](packages/kb/kb-graph) | 图谱 Service Definition（`ctx.kbGraph`） | index / types / invariant | runtime（1） |
| [packages/kb/kb-graph-sqlite](packages/kb/kb-graph-sqlite) | 图谱 Store Provider | index / invariant / schema / store | invariant / store（2） |
| [packages/kb/tool-kb](packages/kb/tool-kb) | Tool Consumer | extract / graph / index / ingest / ingest-url / invariant / search / stats / url-policy | extract / graph / ingest-url / ingest / presentation / search / stats-index / tenant-binding（8）+ fixtures（page.html / sample.docx / sample.pdf） |

### 1.2 核心契约（[packages/kb/kb/src/types.ts](packages/kb/kb/src/types.ts)）【确证】

- [`KbDocKind`](packages/kb/kb/src/types.ts:15)：7 值闭集 `'meeting' | 'interview' | 'report' | 'regulation' | 'profile' | 'table' | 'other'`。
- [`KbDocumentInput`](packages/kb/kb/src/types.ts:43)：`(tenantId, sourcePath)` 是文档身份；重摄入同对即替换（:39-42 注释）；`provenance?: KbProvenance`（:57）；`contentHash`/`contentLength` 由 seam 在每次 ingest 时计算填充、调用方值被覆盖（:59-65）。
- [`KbScope`](packages/kb/kb/src/types.ts:75)：闭集 `'search' | 'derive' | 'share'`；`share` 允许他租户检索（跨租户命中），`search`/`derive` 租户私有（:68-74）。
- [`KbProvenance`](packages/kb/kb/src/types.ts:86)：`provider / scope? / collectedSource?` 三元组，JSDoc 引用「数据二十条 三权分置；可信数据空间发展行动计划」（:80-85）。
- [`KbStore`](packages/kb/kb/src/types.ts:181)：`id`、`available()`（禁止 I/O）、`putDocument()`（事务性 overwrite-shaped）、`deleteDocument()`、`textSearch()`、`vectorSearch()`、`stats()`、`recordUsage()`、`usage()`（:181-255）。
- [`EmbedProvider`](packages/kb/kb/src/types.ts:263)：`id / modelId / dimensions / available() / embed(texts, signal)`，返回序一致的向量数组（:263-279）。
- [`KbUsage`](packages/kb/kb/src/types.ts:145)：租户级单调计数器 searches / ingestedDocuments / ingestedChunks / embedTexts / embedTokens——计量基础设施（:140-156）。
- [`KbSearchRequest`](packages/kb/kb/src/types.ts:298)：`query / tenantId? / docKind? / maxResults?`；[`KbSearchResult`](packages/kb/kb/src/types.ts:312) 以 `mode: 'hybrid' | 'text'` 暴露降级路径。

### 1.3 KbRuntime（[packages/kb/kb/src/index.ts](packages/kb/kb/src/index.ts)）【确证】

- [`KbRuntimeConfig`](packages/kb/kb/src/index.ts:52)：`storeProvider` / `embedProvider`（可选，单可用自动选）、`chunkMaxTokens`(512) / `chunkOverlapTokens`(50) / `rrfK`(60) / `minRelevanceScore`(0) / `vectorTopK`(32) / `textTopK`(32) / `maxResults`(8)（:32-45 默认值常量）。
- [`registerStoreProvider`](packages/kb/kb/src/index.ts:162) / [`registerEmbedProvider`](packages/kb/kb/src/index.ts:173)：重复 id 抛 `KB_DUPLICATE_PROVIDER`；disposer 随 fiber 释放（:178-187）。
- provider 选择语义：执行期解析、与注册顺序无关；store 五分支错误码（:109-127 类 JSDoc），embed 缺失=文档化降级模式（text-only），仅「配置了但未注册」抛错（:122-127）。
- [`ingest`](packages/kb/kb/src/index.ts:299)：sha256 contentHash + code-point contentLength 由 seam 强制重算（:304-311）；chunk→embed→putDocument；embed 失败 fail-loud `KB_EMBED_FAILED`（:328-334）；成功后 meter（:355-361，计量失败仅告警不回滚，:276-282）。
- [`search`](packages/kb/kb/src/index.ts:378)：text 路径恒跑；hybrid 时向量路径 + [`fuseRrf`](packages/kb/kb/src/rrf.ts) 融合；查询 embed 运行期失败降级 text 并 warn（:398-409）；`minRelevanceScore` 对两模式统一过滤（:386-388）。
- 降级模式转换日志（进入一次 warn / 恢复一次 info，:247-263）。

## 2. 上传链路全貌

### 2.1 wire 面（apiproxy）【确证】

- 路由清单 [`KbApi`](packages/host/apiproxy/src/api/kb.ts:59)：`kb.stats` / `kb.search` / `kb.ingest` / `kb.upload` / `kb.ingestUrl` 五个 unary 方法（:61-91）。kb seam 刻意不在 gateway inject 列表：未组合则全部方法答结构化 `kb-not-composed`（:5-9）；wire 永不携带 tenant（部署绑定，:7-9）。
- 路由接线：[rpc-map.ts:64-65](packages/host/apiproxy/src/api/rpc-map.ts:64)、[fetch/handler.ts:150-151](packages/host/apiproxy/src/fetch/handler.ts:150)、[fetch/client.ts:520-521](packages/host/apiproxy/src/fetch/client.ts:520)。
- **base64 正则**：[`kbUploadRequestSchema`](packages/host/apiproxy/src/api/kb.schema.ts:80) 的 `data` 字段钉死 canonical RFC-4648（`/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/`，:82）——Node 解码器宽松会静默丢非法字符，正则先行拒绝（:74-79 注释）；字节上限是业务拒绝不是 schema，客户端拿结构化 `kb-upload-too-large`（:77-78）。
- 错误码：`kb-upload-too-large`（[rpc.ts:107-108](packages/host/apiproxy/src/api/rpc.ts:107)）等 kb 域错误在 [rpc.schema.ts:68-70](packages/host/apiproxy/src/api/rpc.schema.ts:68) 登记。

### 2.2 服务端实现（[api-proxy.ts](packages/host/apiproxy/src/api-proxy.ts)）【确证】

- 上限常量 [`MAX_KB_INGEST_BYTES`](packages/host/apiproxy/src/api-proxy.ts:268) = `64 * 1024 * 1024`（64 MiB，与 tool 套件同限）。
- [`kb.upload`](packages/host/apiproxy/src/api-proxy.ts:3204) 全流程：`ingestGates()`（kb 未组合 / `kbWriteEnabled !== true` / tenant 未绑定三重门，:1178-1180、:1197-1201 `kb-write-disabled`）→ `sanitizeUploadFilename`（目录段/保留名拒绝，:3209-3216）→ 扩展白名单 `INGEST_EXTENSIONS`（:3217-3223）→ doc_kind 校验 → `Buffer.from(data,'base64')` → 超限拒绝（:3227-3234）→ `sourcePath = workspace/data/uploads/${sanitized}`（:3235）→ 落盘 `workspace/data/uploads/`（:3237-3239）→ md/txt 走 fatal UTF-8 解码（非法编码拒绝而非替换字符，:3240-3245）、pdf/docx 走 `extractPdfText`/`extractDocxText`（:3246-3248）→ `storeKbDocument`。
- **同名重传静默替换**：:3198-3202 注释明文「store it under the uploads-relative source path so re-uploads replace their prior document (the seam's same-path semantics)」；语义根在 [`KbStore.putDocument`](packages/kb/kb/src/types.ts:176-194)（overwrite-shaped，先删旧文档及 chunks/FTS 行再插入）。客户端 [`uploadFile`](packages/client/ui-kb/src/client/index.ts:208) 也写死 `workspace/data/uploads/${file.name}` 引用身份。
- 读通道 [`kb.ingest`](packages/host/apiproxy/src/api-proxy.ts:3158)：`fs.readBytes(target, signal, MAX_KB_INGEST_BYTES)` 同上限（:3181）。

### 2.3 客户端（ui-kb）【确证 + 推断】

- **base64 分块编码** [`base64Of`](packages/client/ui-kb/src/client/index.ts:101)：以 `CHUNK = 0x8000`（32768）分块拼接 binary string 再 `btoa`；注释（:93-100）说明原因：「`String.fromCharCode` spread is capped near the argument limit, and one giant template would double the peak memory for multi-megabyte files」。
  - 【推断】「≥3.5MB 栈溢出」机理：一次性 `String.fromCharCode(...bytes)` 会把每个字节作为独立函数实参压栈；V8 的单次调用实参数量上限在 6.5 万~12.5 万量级，3.5MB 字节（约 367 万实参）远超上限，触发 `RangeError: Maximum call stack size exceeded`。0x8000 分块恰在上限之下。3.5MB 是用户实测经验值，仓库内无该数字文本。
- **上传状态存储（内存）**：每文件行状态 [`UploadRow`](packages/client/ui-kb/src/client/workbench/KbIngestDialog.tsx:69)（`busy | done | failed` 联合）存于组件 `useState` 的 `rows`（:93），不持久化、不上服务端；服务端无逐文件状态（`kb.upload` 是无状态 unary）。
- **并发同名文件 status crosstalk 位置**：[`pick()`](packages/client/ui-kb/src/client/workbench/KbIngestDialog.tsx:127) 串行 for-await 逐文件上传；完成时按 `row.name === file.name && row.status === 'busy'` 匹配改行（:142-144，失败分支同构 :150-152）——同一批次选入两个同名文件时两行同为 busy、name 相同，前一个完成会把**所有同名 busy 行**一起点亮为 done/failed（按 name 而非按行身份匹配）。行 key `${row.name}-${index}`（:273）仅影响 React 渲染，不影响该匹配逻辑。
- 批次竞态守卫 `uploadSeq`（:102、:129、:141、:161-171 关闭对话框使在途批次静默）；浏览守卫 `browseSeq`（:98）。
- 上传交互：`<input type="file" multiple accept=".md,.txt,.pdf,.docx">`（:256-265）；失败分类 [`classifyIngestFailure`](packages/client/ui-kb/src/client/workbench/KbIngestDialog.tsx:56)（tooLarge/pathMissing/urlUnreachable/server，:56-66）。
- 客户端会话内存 store [`createKbClientStore`](packages/client/ui-kb/src/client/kbStore.ts:70)：stats 缓存 + 会话内文档 records，模块注释（:2-9）明言「Nothing here persists」。

## 3. 检索链路

### 3.1 kb_search 工具定义（[packages/kb/tool-kb/src/search.ts](packages/kb/tool-kb/src/search.ts)）【确证】

- 常量 `KB_SEARCH_MAX_RESULTS = 8`（:16）；参数 `query / doc_kind / max_results`，`tenant` 实参一律 parse 时拒绝（:21-22、:44-46——`defineTool` 参数根是隐式开放对象，须显式拒绝）。
- 注册 [`applyKbSearchTool`](packages/kb/tool-kb/src/search.ts:213)：systemPrompt section 指引先检索再作答、引用 [n]（:214-218）；schema（:223-237）；`render` → [`formatSearchOutput`](packages/kb/tool-kb/src/search.ts:130)（编号引用行 + 降级模式注记 + 截断提示 + 常驻引用指令，:130-152）；`presentationMeta`（query/mode/truncated/hits，:270-275）；`presentCall`/`presentResult` 为 generic 卡（`card:'generic'`、`kind:'search'`，:183-186、:194-202）——render intent 属 `generic` 家族。
- `timeoutMs` 30s 默认（[index.ts:49](packages/kb/tool-kb/src/index.ts:49)）；`isConcurrencySafe: () => true`（[search.ts:279](packages/kb/tool-kb/src/search.ts:279)）。
- 工具套件开关与预算（[tool-kb Config](packages/kb/tool-kb/src/index.ts:65)）：`search/ingest/urlIngest/stats/graph` 默认 true；`allowPrivateNetworks` 默认 false（SSRF 门）；`tenant` 必填（加载期校验失败）；各工具 timeoutMs（search 30s / ingest 300s / stats 10s / url 300s / graph_query 15s / graph_add 30s，:49-62）。`inject = ['tools','kb','fs','systemPrompt']`（:46）。

### 3.2 agent 组合（[examples/kb-agent/cordis.patch.yml](examples/kb-agent/cordis.patch.yml) 全文已核）【确证】

- disable base bundle 全部模型可见工具行（tool-bash/pwsh/jobs/fs/fs-search/str-replace-editor/skill/goal/ralph/subagent×4/workflow/todo/web，:21-76）→ 该组合内 agent 检索专用；会话基础设施（compaction/pruning/checkpoints/spill）保留（:15-20）。
- `agent-default-model` → provider `minimax` / `MiniMax-M3`（:78-81）；persona 要求 [n] 引用（:83-90）。
- insert：`llm-minimax`、`kb`、`web-fetch-http`（kb_ingest_url 的 fetch 通道）、`kb-sqlite`（`path: examples/kb-agent/workspace/kb.sqlite`，:102-105）、`kb-embed-minimax`、`tool-kb`（`tenant: !!js "process.env.DSH_KB_TENANT ?? 'demo-food-co'"`，:110-113）。
- `api-gateway` patch：`kbTenant` 同源 env + `kbWriteEnabled: true`（:120-123，单租户盘级访问控制下的显式 opt-in）。
- `agent-presets` patch：roots 挂 `examples/kb-agent/agent-presets`（2 角色）与 `examples/kb-agent/scenarios`（30 场景目录即预设目录形态），default `enterprise-data-assistant`（:137-144）。
- `llm-pi-ai` disabled：其 catalog 已声明 minimax provider 会与 llm-minimax 冲突（:5-9、:21-22）。

### 3.3 kb-graph 能力【确证】

- 闭集本体（[kb-graph/src/types.ts](packages/kb/kb-graph/src/types.ts)）：实体 7 类 `company/product/ingredient/additive/standard/process/risk`（:15-26）；谓词 7 个 `produces/uses/contains/complies_with/follows/flags/supplies`（含方向说明 :28-35）。
- [`GraphStore`](packages/kb/kb-graph/src/types.ts:82)：`putTriples`（幂等，重复 no-op）、`neighbors`（一跳）、`twoHopPaths`（两跳路径）、`searchEntities`（id 子串 + 类型过滤）、`stats`、`close`（:82-138）；`KbGraphTriple` 可带 `sourcePath` 引用溯源（:63-69）。
- [`KbGraphRuntime`](packages/kb/kb-graph/src/index.ts:39)：`registerStoreProvider`（:53，重复抛 `KB_GRAPH_DUPLICATE_PROVIDER`）+ 五个透传方法；store 选择与 kb 同款「无配置多可用→AMBIGUOUS」（:34-37）。
- **实体抽取不内置**：[tool-kb/src/graph.ts:2-9](packages/kb/tool-kb/src/graph.ts:2) 模块注释明言「add stores extracted triples idempotently so a scenario SKILL can drive entity extraction without a built-in LLM call」；`kb_graph_add` 每次上限 50 三元组（plans §九 P2-1 记载），`kb_graph_query` action 为 `neighbors | paths | search`（[graph.ts:21-29](packages/kb/tool-kb/src/graph.ts:21)）。
- kb-graph-sqlite：独立 SQLite（application id "DSHG"），twoHopPaths 经 FIX-H2 重写为「每分支单一方向组合 + 中点单一等式约束 + 直边折入」（[store.ts:151-157](packages/kb/kb-graph-sqlite/src/store.ts:151) 注释；回归测试 [store.spec.ts:82-137](packages/kb/kb-graph-sqlite/tests/store.spec.ts:82)）。

## 4. Web 工作台（packages/client/ui-kb）

### 4.1 组件结构【确证】

- `src/client/`：入口 [index.ts](packages/client/ui-kb/src/client/index.ts)、`KbEntry`（侧栏入口）、`KbHeaderButton`（会话头切换）、`KbSettingsSection`（设置页）、`kbStore`（内存 store）、`KbTypes`、`locales`、`recentSearches`；`hero/`：`KbHeroDock`（输入坞门户）、`KbHeroHeadline`、`scenarios`（静态场景目录）；`toolviews/`：`kb-tool-model`、`KbToolRow`；`workbench/`：`KbDocumentList`、`KbHitCard`、`KbIngestDialog`、`KbSearch`、`KbUsageCard`、`KbWorkbench`、`source`。tests 12 个 client spec。
- 五个 slot 注册（[index.ts:157-266](packages/client/ui-kb/src/client/index.ts:157)）：`sidebar.footer.action`（文档数徽标）、`conversation.hero.headline`（空会话 hero）、`conversation.input.dock`（id `kb-portal`，场景卡选择走 `api.agentPresets.select`，:183-188）、`conversation.view`（id `kb`，label「知识库」，:192-235）、`conversation.session.header.actions`；toolview 四键 `kb_search/kb_ingest/kb_ingest_url/kb_stats`（:249-254）；`settings.section`（:256-266）。`inject = ['slots','locale','connection']`（:80）。
- **hero 门户 30 场景**：[`KB_SCENARIOS`](packages/client/ui-kb/src/client/hero/scenarios.ts:42) 共 30 条（注释 :41「The thirty scenarios」）；8 分类 [`KB_SCENARIO_CATEGORIES`](packages/client/ui-kb/src/client/hero/scenarios.ts:34) = market/process/food-safety/cost/supply-chain/export/equipment/data-asset。与 `examples/kb-agent/scenarios/<id>/preset.yml` 的同步由 `scripts/scenario-catalog-sync.spec.ts` 门禁强制（:2-9 注释）；运行期 roster 来自 `agentPresets.list`，本表只管分组展示。
- 会话内工作台能力注入（[index.ts:198-234](packages/client/ui-kb/src/client/index.ts:198)）：`search`（api.kb.search）、`uploadFile`、`ingestFile`（host.listDirectory 浏览 + 手输文件名）、`ingestUrl`、`noteSearched` 折入 records。
- **与 apiproxy 的 API 约定**：全部走 `api.kb.*` 五方法 + `api.host.listDirectory`（目录浏览）+ `api.host.describe`（cwd 换算，:149-155）+ `api.agentPresets.select`（场景选择）；fake 面在 [packages/client/runtime/tests/fake-api.client.ts:285-287](packages/client/runtime/tests/fake-api.client.ts:285) 与 [connection fixture:3264-3266](packages/client/connection/src/client/fixture.ts:3264)。

### 4.2 dev server 与性能配置【确证】

- [`scripts/dev-web.ts`](scripts/dev-web.ts)：浏览器产物 watch-build，三段（tsc -b tsconfig.client.json → tsdown `lib/index.js`+`lib/client.js` → vite build `apps/web/dist`，:9-14）；缺段静默显示旧产物（:13-14）；**不得与 `pnpm run build` 并发**（同写 lib/ 与 dist/，:16-17）；`--poll`（网络挂载无 inotify，:21-25）；启动时扫描一次包集合，新增包须重启（:53-57）。reload 信号不属于本脚本——宿主 webserver stat-poll 并广播 `rebuilt`（:3-7）。
- [`vitest.web.perf.config.ts`](vitest.web.perf.config.ts)：手动高基数 perf 诊断（`apps/web/tests/**/*.perf.ts`），在 CI web gate 之外（:4-5），hookTimeout 180s / testTimeout 600s。
- **BUG-4（tsx dev server 模块图冻结契约）权威文档**：[.agents/notes/implemented/architecture/2026-07-29-dsh-source-launch-tsx-esm.zh.md:39](.agents/notes/implemented/architecture/2026-07-29-dsh-source-launch-tsx-esm.zh.md:39)（英文版 :38-39 同）。约束原文：「源码启动在进程启动时解析整个 workspace 模块图，此后不再重载：`packages/**/src` 下的服务端改动只有重启正在运行的 `dsh web`/TUI 进程才会生效，而 web 客户端产物按请求从磁盘读取。修改网关或服务端插件源码后两个平面因此分叉——新客户端调用旧网关尚未包含的方法时，会从 `toFetchHandler` 的方法表拿到纯 404（2026-09-02 的 `kb.upload` 404：dev server 先于代码落盘启动，一直以旧方法表应答）。服务端改动后要重启长驻 dev server；仅重新构建对运行中的进程没有任何影响。」【推断】"BUG-4" 这一编号不出现在仓库文本（`plans/` 与 `.agents/` 检索无命中），是项目沟通层的口头编号；权威落点即上述 Agent Note。
- e2e 回归：[apps/web/tests/kb-workbench.e2e.ts](apps/web/tests/kb-workbench.e2e.ts) + [kb-workbench.overlay.yml](apps/web/tests/kb-workbench.overlay.yml)（doc_kind 判别式修复 H1 的红→绿用例，plans §十一.2）。

## 5. 可信数据空间实现现状

【确证】确权/授权全部内嵌在 kb 主链路，**没有独立的数据空间包**：

- **确权（资产登记的事实载体）**：`KbProvenance`（provider/scope/collectedSource，[types.ts:86-93](packages/kb/kb/src/types.ts:86)）+ seam 强制自算的 `contentHash`（SHA-256）与 `contentLength`（[index.ts:304-311](packages/kb/kb/src/index.ts:304)，「the seam owns the integrity fact, not the caller」）——「确权三元组 = hash + 长度 + 来源」（plans §九 P2-1 原文）。
- **数据模型（SQLite）**：[schema.sql](packages/kb/kb-sqlite/resources/sql/schema.sql) `documents` 表新增 5 列 `provider/scope/collected_source/content_hash/content_length`（:8-12），`UNIQUE(tenant_id, source_path)`（:13）；`SCHEMA_VERSION = 3`（[schema.ts:10](packages/kb/kb-sqlite/src/schema.ts:10)，pre-release 拒绝旧库），application id "DSHK"（:12）。
- **授权执行点（store 层 SQL 强制）**：两路检索 SQL 统一追加 `OR d.scope = 'share'`——[text-search.sql:6](packages/kb/kb-sqlite/resources/sql/text-search.sql:6) 与向量候选 SQL 同款过滤；plans §十一.4 明言「不依赖工具层自觉」。provenance 回流见 [store.ts:62-82](packages/kb/kb-sqlite/src/store.ts:62)。
- **行为测试**：[kb-sqlite/tests/dataspace.spec.ts](packages/kb/kb-sqlite/tests/dataspace.spec.ts) 5 例——provenance 持久化回流（:32）、share 跨租户可检索（:49）、derive 保持租户私有（:63）、legacy 无 provenance 租户私有（:76）、向量路径同过滤（:86）。
- **与 kb 的关系**：provenance 是 `KbDocumentInput` 的可选字段（历史 ingest 缺省=租户私有、无归属，[types.ts:52-57](packages/kb/kb/src/types.ts:52)）；图谱 triple 另有 `sourcePath` 溯源（§3.3）。
- **政策叙事**：docs/subsystems/kb.{md,zh.md}「可信数据空间衔接」节（数据二十条→数据要素×→行动计划政策链，plans §九 P2-1）。

【推断】缺口（对新阶段关键）：无资产登记簿（asset registry）——scope 是 ingest 时一次性静态声明；无授权策略引擎/审批流/撤销/时效；无数据空间级审计日志（usage_counters 只记操作计量，schema.sql:29-36 无授权审计表）；`derive` 语义目前与 `search` 实际同构（仅 SQL 注释区分，未见派生工作产品的差异执行）。依据：schema 无相关表、kb seam 无相关方法。

## 6. seam 参考实现（连接器 agent 应照抄的模式）

### 6.1 packages/web/（检索/抓取 seam）【确证】

- Service Definition [packages/web/web/src](packages/web/web/src)：`types.ts`（契约词汇）+ `index.ts`（注册与执行）+ `invariant.ts`。
- 关键类型：[`WebSearchRequest`](packages/web/web/src/types.ts:16)（query + maxResults 透传上限）、[`WebSearchResult`](packages/web/web/src/types.ts:35)（content? + sources + truncated）、[`WebSearchSource`](packages/web/web/src/types.ts:50)（url 必有、title/snippet/publishedAt 可选——「forcing adapters to invent them would make the seam lie」:45-48）、[`WebFetchBody`](packages/web/web/src/types.ts:94) 闭集 discriminated union（html/text，新 kind 是协调变更非插件扩展 :85-93）、[`WebSearchProvider`](packages/web/web/src/types.ts:102) / [`WebFetchProvider`](packages/web/web/src/types.ts:114)（id + available() 禁网调用 + 单方法）、[`WebError`](packages/web/web/src/types.ts:130)。
- 注册与执行：[`registerSearchProvider`](packages/web/web/src/index.ts:103) / [`registerFetchProvider`](packages/web/web/src/index.ts:114)（返回 disposer）；[`search`](packages/web/web/src/index.ts:140) 解析 provider 后 `capSources` 截断强制 maxResults；[`fetch`](packages/web/web/src/index.ts:157)。
- Service Providers：[web-fetch-http](packages/web/web-fetch-http)、[web-search-deepseek](packages/web/web-search-deepseek)、[web-search-exa](packages/web/web-search-exa)、[web-search-perplexity](packages/web/web-search-perplexity)。Tool Consumer：[tool-web/src](packages/web/tool-web/src) = `fetch.ts / index.ts / invariant.ts / search.ts / turndown-plugin-gfm.d.ts`。

### 6.2 packages/subagent/（委派 seam）【确证】

- Service Definition [packages/subagent/subagent/src](packages/subagent/subagent/src)（17 文件）：types / index / child-agent / out-of-process / projection / lifecycle / continuation / depth / descriptor / run-settlement / client / assistant-output / list-children / error / activation-setup-registry / descriptor-seed / projection-types / invariant。
- 关键契约：[`SubagentProvider`](packages/subagent/subagent/src/types.ts:292) —— `name`（唯一注册名）、`capabilities`（启动期能力集）、`inheritsParentContext`（描述性而非服务端校验）、`start(request: ResolvedSubagentStartRequest): Promise<SubagentRun>`（一次性子代理；请求已被服务端校验并 resolved descriptor，:303-314）、可选 `prepareContinuable?`（continuable 能力即方法存在性，:315-330）。
- 注册：[`registerProvider`](packages/subagent/subagent/src/index.ts:385)，注册后 emit `subagent/provider-added`（:399）。
- Providers（7）：subagent-acp / subagent-claude-code / subagent-codex / subagent-dsh-sdk / subagent-fork-in-process / subagent-spawn-in-process / subagent-in-process-driver。Tool Consumers（3）：tool-subagent / tool-subagent-control / tool-subagent-report。

### 6.3 packages/shell/ 的 request/spec split（显式 resolve 模板）【确证】

- [`ShellExecRequest`](packages/shell/shell/src/types.ts:38)：调用方形态，`workdir/timeoutMs/stdoutMaxBytes/signal/stdin/env/dshEnv/sandboxPolicy` 全可选，由 `resolve()` 从实现 config 填充（:33-37 注释）。
- [`ShellExecSpec`](packages/shell/shell/src/types.ts:86)：resolved 形态，`workdir/timeoutMs/stdoutMaxBytes` 必填（:81-85 注释）。
- 抽象执行器（[index.ts:85-100](packages/shell/shell/src/index.ts:85)）：`abstract resolve(request): ShellExecSpec` / `abstract run(spec)` / `abstract start(spec)`——「默认值是 owning implementation 里显式的 `resolve(request): Spec` 步骤，绝不在 `run()` 里藏 `?? default`」（AGENTS.md 条款点名 dsh-shell 为 template）。
- 结构：Service Definition [shell/shell/src](packages/shell/shell/src)（index/types/render/invariant）；Providers：bash-local / bash-sandbox / pwsh-local / pwsh-sandbox + shell-env；Consumers：tool-bash(-persistent) / tool-pwsh(-persistent)。

### 6.4 对连接器 agent 的模式映射【推断】

新「连接器 capability」应按同构三件套落包：`packages/<group>/connector`（Service Definition：`ConnectorProvider` 契约 + 注册 + resolve）、`connector-<source>`（每数据源一个 Provider）、`tool-connector`（模型可见 Consumer，含 schema/render intent/timeoutMs/isConcurrencySafe 决策，模板即 [tool-kb/src/search.ts](packages/kb/tool-kb/src/search.ts)）；request/spec split 用于「连接参数显式解析」步骤。每工具的 UI render intent 依 [docs/cookbook/adding-a-tool.md](docs/cookbook/adding-a-tool.md) 设计期决定（generic/terminal/diff/locations）。

## 7. examples/kb-agent/

### 7.1 组合与启动【确证】

- [cordis.patch.yml](examples/kb-agent/cordis.patch.yml)（145 行，§3.2 已全述）；另有 [cordis.text-only.patch.yml](examples/kb-agent/cordis.text-only.patch.yml)（纯文本降级组合）。
- [QUICKSTART.zh.md](examples/kb-agent/QUICKSTART.zh.md) 启动命令：`nvm use 22.19.0`（node:sqlite 内置模块要求，:12）→ `pnpm install` → `.env` 写 `MINIMAX_API_KEY`；三步 headless：`DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "<指令>"`（入库 6 篇→ 提问→ kb_stats，:31-47）；Web 工作台：`DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml`（http://127.0.0.1:3080，无鉴权仅本机，:101-104）；评测：`node --import tsx/esm examples/kb-agent/scripts/eval-retrieval.mts`（text / `DSH_EVAL_HYBRID=1` / `--answers` 引用有效性，:144-150）。
- 实测口径：6 文档 / 38 chunks 全嵌入 hybrid（:34）；上传通道 64 MiB 单文件、同名替换语义（:54）；30 场景卡门户与换角色（:80-82、:106）；100 问评测双指标 99%/96%（plans §九.2）。

### 7.2 tests 快照场景【确证】

- [tests/](examples/kb-agent/tests)：`kb-closed-loop.spec.ts`（+ e2e + fixtures/kb-closed-loop.cordis.yml + snapshots/kb-closed-loop/expected.md）、`kb-presets.spec.ts`（+ fixtures + snapshots/kb-presets/expected.md：真实 Loader 组合、roster 发现、恰 4 个 kb 工具面、persona 覆盖、text 模式编号引用）、`scenarios.spec.ts`（+ snapshots/scenarios/expected.md：新场景自动纳入校验——结构完整/真实挂载/检索专用工具面/自有语料带引用检索）。
- scripts：[eval-retrieval.mts](examples/kb-agent/scripts/eval-retrieval.mts)、[calibrate-relevance.mts](examples/kb-agent/scripts/calibrate-relevance.mts)、[graph-smoke.mts](examples/kb-agent/scripts/graph-smoke.mts)（真实 key：M3 从 3 语料抽 24 三元组/30 实体，plans §九 P2-1）、[import-real-docs.sh](examples/kb-agent/scripts/import-real-docs.sh)（--kind 白名单 meetings/profiles/regulations）、real-key-smoke / upload-real-key-smoke。

### 7.3 workspace/ 数据目录（git 实查）【确证】

- `examples/kb-agent/workspace/`：`kb.sqlite`（+ -shm/-wal 运行库）、`kb.sqlite.v1-backup`（+ -shm/-wal，schema v2→v3 升级前备份）。
- `workspace/data/` 8 目录：cost / food-safety / market / meetings / process / profiles / regulations / supply；meetings、profiles、regulations 各 2 篇 md（2026-08-20-supplier-visit-hongfa.md、2026-08-27-project-kickoff.md；hongfa-food.md、lvyuan-ingredients.md；gb14881-excerpt.md、gb2760-excerpt.md），其余为 P1-2B 评测扩充语料所在；另有 `uploads/` 上传落盘。
- 场景目录 30 个（[scenarios/](examples/kb-agent/scenarios)，每场景 preset.yml + agent.cordis.yml + SKILL.md + data/corpus.md 四文件契约）+ agent-presets 2 角色（food-compliance-officer / enterprise-data-assistant）+ eval/questions.json（100 问，五类各 20，标注 gold 文档）。

## 8. llm-minimax 并行 tool-call id 聚合防御【确证】

- fixtures：[tests/fixtures/parallel-tool-calls.events.json](packages/llm/llm-minimax/tests/fixtures/parallel-tool-calls.events.json) + [parallel-tool-calls.session-excerpt.jsonl](packages/llm/llm-minimax/tests/fixtures/parallel-tool-calls.session-excerpt.jsonl)（真实日志回归样本）。
- 入站聚合（[translate.ts:305-330](packages/llm/llm-minimax/src/translate.ts:305)）：SSE 增量按 `call.index` 维护 `toolBlocks`；关键防御——「Each call's FIRST delta carries its full id and name; continuation deltas of parallel calls re-emit both as EMPTY strings (live-wire observation, 2026-09-02)，Only non-empty values advance the assembly」（[types.ts:114-121](packages/llm/llm-minimax/src/types.ts:114) WireToolCallDelta 契约注释）。
- 出站修复（[serialize.ts:47-113](packages/llm/llm-minimax/src/serialize.ts:47)）：`CallIdRepair`（seen/quota/pending/counter）对历史里空/重复 tool_call id 合成唯一 id 并按配额配对孤儿结果——「history that carries empty or repeated ids (e.g. written before the parallel-call aggregation fix) still replays instead of poisoning the session」（:8-10）。
- 债务表 #9 记录该缺陷已清偿（2026-09-02，根因=续传 delta 空串覆盖首 delta 的 id/name；真实 key 复现 export-tax 场景 2 轮 8 tool-call 全唯一 0×2013；Agent Note [2026-09-02-minimax-parallel-tool-call-id-aggregation.md](.agents/notes/implemented/bug-fix/2026-09-02-minimax-parallel-tool-call-id-aggregation.md)）。
- 包结构：src = adapter / index / serialize / sse / translate / types + invariant；tests 8 个（含 adapter.e2e、mock-server、dynamic-config）。

## 9. 债务登记（[plans/food-kb-agent-plan.md](plans/food-kb-agent-plan.md) §十一.5，行 409-423）【确证——全文摘录】

| # | 债务 | 修复方向 |
|---|---|---|
| 1 | `kb_ingest_url` 的 DNS rebinding TOCTOU：url-policy 校验时解析的 IP 与 `ctx.web.fetch` 实际解析分离 | pin-IP：校验时解析的 IP 随请求下发，fetch 直连该 IP（SNI/Host 保持原域名） |
| 2 | `kb_graph_query`/`kb_graph_add` 零 usage 计量：graph 查询不经 `ctx.kb` 的 recordUsage 缝 | graph execute 按 action 计量（graphQueries/graphAdds），与 `kb.search`/`kb.ingest` 的 meter 对称 |
| 3 | 19 个场景待内容填充 | 复制场景模板改写 preset/agent/SKILL/corpus 四文件，`tests/scenarios.spec.ts` 自动纳入校验 |
| 4 | UI doc_kind 选择器小增强 | ui-kb 检索面板 doc_kind 过滤交互增强（H1 后过滤链路已通） |
| 5 | CI coverage/snapshot lane 复验 | 本机 Node 22 抖动无法佐证，合并前在 CI 复验（P0 完成记录同项债务延续） |
| 6 | 预存 vendor rescape 红 | 与本批无关，随 vendor/ 同步流程处置 |
| 7 | 检索无相关性阈值：低分命中与高分命中同列，长结果列表混入弱相关片段 | 后端在 `kb.search` 融合后按分数门过滤（RRF 分数下限可配置），hit 携带分数供前端弱化展示 |
| 8 | 大文档 embed 稳定性：单次全量 embed 在超大切片数下超时/失败面大 | embed 分批（chunk 数上限 + 批间退避），失败批次重试，仍失败才整体 fail-loud（FIX-K 已锁 embed 失败不落库的原子性） |
| 9 | ✅ 已清偿（2026-09-02）：MiniMax 并行 tool-call id 聚合缺陷（会话永久 2013）…（双层修复 + fixture 回归 + 真实 key 复现） | Agent Note：[2026-09-02-minimax-parallel-tool-call-id-aggregation.md](.agents/notes/implemented/bug-fix/2026-09-02-minimax-parallel-tool-call-id-aggregation.md) |

注：`minRelevanceScore` 配置项与 `calibrate-relevance.mts` 校准脚本已存在（[kb/src/index.ts:63-70](packages/kb/kb/src/index.ts:63)、[examples/kb-agent/scripts/calibrate-relevance.mts](examples/kb-agent/scripts/calibrate-relevance.mts)），债务 #7 指部署默认未启用（QUICKSTART.zh.md:7「默认 0 不启用」）及 hit 不携带分数。

P0 阶段另登记过高/中/低分级债务（§八.5，:312-317），其中「多企业租户深度隔离（tenant 参数目前模型可传）」「100 问评测集」「PDF/Word 采集通道」三项已分别由 P1 租户服务端绑定、P1-2B 评测、P1 ingest 通道解决（§十一.4 :404-407）；仍开放的剩「深度隔离」中更深的面（如 per-tenant 凭据/配额执行）——【推断】依 §十一 现状描述（单租户盘级访问控制 + env 绑定）。

## 10. 新增 capability 的规范入口

### 10.1 [docs/architecture.md](docs/architecture.md) 关键条款【确证】

- 事件三域（:55-59）：Session events（durable、落日志、`session/event` 广播）/ Agent events（`agent/*` 活代理）/ Capability events（`fs/*`、`tools/*`、`telemetry/*` 挂策略与适配器、不 import loop）。
- waterfall 语义（:84）：`agent/pre-step`、`agent/request`、`llm/stream`、三个 `tools/*` 是 waterfall，监听者必须调 `next()`；`agent/turn-stopping` 串行无 next。
- **模型可见⟺落日志**（:96 原文）：「**Model-visible means logged.** Anything that reaches a model request must be reconstructable from the log, and a runtime invariant asserts it. This is why a new model-visible input requires a new session event: extend `SessionEventMap` and render from the log.」
- **capability seam 定义**（:100 原文）：「A **seam** is a swappable capability with three roles: a **Service Definition** declaring the interface, a **Service Provider** implementing it, and a **Consumer** using it, commonly a model-facing tool. A package may combine roles, but one role alone is not a seam; adding a capability means designing all three.」
- 「Where new behavior goes」表（:106-124）：新行为挂已文档化扩展点；改 loop 本身必须更新本图（:108）。
- 事件声明合并的成文条款在 [AGENTS.md](AGENTS.md)（Typed events use declaration merging and merge-extensible maps；`SessionEventMap` 成员 required-on-read，仅带 `ignorable: true` envelope 的未知事件可被旧构建读；结构性格式变更才 bump `SESSION_FORMAT_VERSION`）；注册即 effect（每项贡献走 `ctx.effect()`/`ctx.on()`，register() 返回 disposer）。

### 10.2 cookbook 清单（[docs/cookbook/](docs/cookbook)）【确证】

现有指南 7 篇：adding-a-conversation-node、**adding-a-package**、adding-a-settings-card、**adding-a-tool**、adding-a-vendored-package、**adding-an-llm-adapter**、extension-cookbook（另有 maintaining-dsh-code-review、responding-to-pr-review-on-a-stack 两篇流程篇）。

### 10.3 apiproxy 结构与 API 面扩展模式【确证】

- [src/api/](packages/host/apiproxy/src/api) 域模块（成对 `<域>.ts` 类型 + `<域>.schema.ts` zod wire 校验）：agent-presets、approvals、credentials、downloads、events、goals、host、jobs、**kb**、llm、questions、rpc（+ rpc.schema + rpc-map）、session-search、sessions、settings、skills、subagents、workspace + index。
- 扩展模式（以 kb 为样板）：域接口（[api/kb.ts](packages/host/apiproxy/src/api/kb.ts)）→ wire schema（[api/kb.schema.ts](packages/host/apiproxy/src/api/kb.schema.ts)）→ [rpc-map.ts](packages/host/apiproxy/src/api/rpc-map.ts) 方法注册 → [fetch/handler.ts](packages/host/apiproxy/src/fetch/handler.ts) invoke 表 → 错误码登记 [rpc.ts](packages/host/apiproxy/src/api/rpc.ts)/[rpc.schema.ts](packages/host/apiproxy/src/api/rpc.schema.ts) → 实现集中于 [api-proxy.ts](packages/host/apiproxy/src/api-proxy.ts)（4037 行单文件聚合）→ 客户端 fake 面同步（runtime/connection 两处 fake-api）。

## 11. 近 30 天 git 提交【确证：git log 实跑 + .git 引用交叉验证】

- `git log --oneline --since="30 days ago"` 实跑（约 200 条）中关键词 kb/nocobase/connector/lakehouse/graph/dataspace/scenario（大小写不敏感）仅 3 行命中：`84c60f5a8e feat(kb): food-industry KB agent stack and workbench portal`（唯一真正的 kb 主题提交）与两条 module graph 文档提交；`git log --oneline -- packages/kb examples/kb-agent packages/client/ui-kb` 亦仅 `84c60f5a8e` 一条；`git status --short` 为空（工作区干净）。
- `.git/logs/refs/heads/master` 仅两行：(1) clone from github.com:nanhaishiyounan/deepseek-harness.git（b150a55，时间戳 1787795598 ≈ 2026-08-26）；(2) `84c60f5 commit: feat(kb): food-industry KB agent stack and workbench portal`（时间戳 1788421579 ≈ 2026-09-02）。`.git/packed-refs` 仅 origin/master=b150a55，无其他分支。
- `git log --oneline -15 -- packages/kb examples/kb-agent packages/client/ui-kb`：仅 `84c60f5a8e` 一条——**整个食品 KB 产品线已以单提交入库**，之后无后续演化提交。
- **无任何 nocobase / connector / lakehouse / dataspace 主题提交**——连接器与湖仓在新阶段属于从零起步。
- `git status --short` 为空：工作区干净（P0/P1/P2 完成记录中「全部改动未提交待 review」的状态已成历史，均已随 84c60f5a8e 落库）。

## 12. 对新阶段的基线判断

【确证】可直接复用的地基：capability seam 三角色模式与 6 个样板 seam（web/subagent/shell/fs/kb/kbGraph）；租户服务端绑定 + store 层 SQL 授权过滤的确权雏形；`ctx.kb.usage` 计量（官网「积分」映射点，plans §九 P2-2）；30 场景预设根机制（`agent-presets.roots` 显式挂载，零复制）；上传/URL/服务器文件三采集通道与 64MiB 上限；100 问评测 harness 与真实 key 双指标达标记录。

【确证】新阶段从零面：连接器（无任何 connector 代码）、湖仓（检索仅 SQLite FTS5 trigram + 1536 维向量 BLOB，无列式/外部引擎）、NocoBase（无集成；WEBSITE.md 的「运营站」映射走 dsh sdk 而非 NocoBase）、专家数据集下单交付（无订单/交付模型；usage 计量是唯一现成的计量底座）。

【推断】进入新阶段前建议先清偿的债务优先级：#1 DNS rebinding（连接器抓取外源数据时同型风险放大）、#7 相关性阈值（专家数据集检索质量门）、#2 graph 计量（数据集计费口径）、#8 大文档 embed（数据集体量）；以及 §5 所列数据空间缺口（资产登记簿/授权审批/审计）是「可信数据空间」叙事与 NocoBase 融合的前置硬缺口。

## 附录：确证 vs 推断汇总

- 【推断】仅 3 处：§2.3 的 ≥3.5MB 栈溢出具体机理（代码注释佐证、数字来自用户实测）；§4.2 的 "BUG-4" 编号出处（权威文档为 Agent Note 2026-07-29-dsh-source-launch-tsx-esm）；§5 的数据空间缺口清单与 §6.4/§12 的模式映射及优先级建议（基于代码现状的规划判断）。
- 其余全部条目均有文件路径+行号级代码证据或 git/实查输出支撑。
