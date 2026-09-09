# 03 分批实施详表（V1–V6）

> 每批 = 一个 code 子任务规模。统一遵循：注册即 effect、闭 union `assertNever`、request/spec split、Config 可从 cordis.yml 覆盖、fail-loud、新包 README 三件套、`pnpm run test:coverage` per-file 100%（platform/nocobase 除外——它不在 coverage glob 内）、每非平凡批同 PR Agent Note。
>
> 通用验证序列（每批必跑）：`pnpm run typecheck && pnpm run lint && pnpm vitest run <本批包> && pnpm run doc-sync`；涉及组合/模型可见面的批次加 keyless 快照与 with-key/with-NC e2e。
>
> 通用开发提醒：服务端插件/网关改动后重启 `dsh web` 长驻进程（BUG-4 契约）；`scripts/dev-web.ts` 与 `pnpm run build` 不并发；NocoBase 侧源码修改必须登记 MANIFEST local-modifications。

---

## V1 NocoBase 源码并入 + 轨道仓内化（地基批）

**依赖**：无。**改动面**：新顶级目录 platform/nocobase/ + 4 处门禁配置 + examples/kb-agent 脚本默认值 + 文档。

### 范围

1. **复制前检查**：`node examples/kb-agent/scripts/setup-nocobase.mts stop`（确保实例停止——storage 有活跃 gateway.sock 与密钥，A 报告 R2）。
2. **rsync 快照**（A 报告 §5.3 命令）：
   ```sh
   rsync -a \
     --exclude 'node_modules/' --exclude 'storage/' --exclude '.git/' \
     --exclude '.env' --exclude '.env.test' \
     --exclude 'dist/' --exclude 'coverage/' \
     --exclude '.turbo/' --exclude '.nx/' --exclude '.cache/' --exclude '.repo/' \
     --exclude 'tsconfig.paths.json' \
     --exclude 'docs/' \
     /Users/mac/Documents/github/nocobase-main/ platform/nocobase/
   ```
3. **MANIFEST.md + NOTICE**（platform/nocobase/ 下）：upstream（NocoBase 2.2.6，GitHub release URL/tag）、snapshot-date、来源路径、exclusions 清单、local-modifications（首sync为空）、license 立场声明（以正式 LICENSE.txt 为准；9450 文件头 AGPL 残留不可移除，Apache-2.0 + 补充条款为现行许可）。
4. **门禁免疫 4 处**（A 报告 §4.5 精确到行）：
   - `.oxlintrc.json` ignorePatterns 加 `"platform/**"`（注释仿 native/ 先例）；`.oxlintrc.staged.json` 同步；
   - `.gitignore` 加 `platform/nocobase/**/dist/`、`platform/nocobase/**/storage/`、`platform/nocobase/.repo/`；
   - `.gitattributes` 加 `platform/nocobase/** -text`（快照字节保真）；
   - `lefthook.yml` whitespace job 加 exclude `platform/nocobase/**`（免一次性清理上游尾随空白）。
5. **setup 脚本仓内化**：`examples/kb-agent/scripts/setup-nocobase.mts:35` 的 `ncHome` 默认值 `join(dirname(repoRoot), 'nocobase-main')` → `join(repoRoot, 'platform', 'nocobase')`；QUICKSTART.zh.md 的"外部源码仓"表述同步（引用仓内路径与 MANIFEST）。
6. **安装与首次安装验证**（不进 CI，开发者本机跑）：`cd platform/nocobase && yarn install`（约 15 分钟）→ `.env` 确认 `DB_DIALECT=postgres`（postinstall 自动从 .env.example 复制，默认即 postgres/localhost:5432/nocobase）→ `yarn nocobase install` → `yarn dev-server`（:13000 健康轮询）。
7. **发布防护**（可选进 V1 或顺延 V6）：`scripts/publication-payload.ts` 加拒绝规则——发布包含 `nocobase/` 路径或 `@nocobase/` 依赖即 fail。

### 文件清单

- 新增：`platform/nocobase/**`（快照）、`platform/nocobase/MANIFEST.md`、`platform/nocobase/NOTICE.md`
- 修改：`.oxlintrc.json`、`.oxlintrc.staged.json`、`.gitignore`、`.gitattributes`、`lefthook.yml`、`examples/kb-agent/scripts/setup-nocobase.mts`、`examples/kb-agent/QUICKSTART.zh.md`、（可选）`scripts/publication-payload.ts` + 其 spec

### 验收

- `platform/nocobase/` 存在且无 node_modules/storage/.env/docs（抽查）；lerna.json version=2.2.6
- `pnpm install` 在仓库根照常成功（platform 未被吸入——`pnpm ls -r --depth -1` 无 @nocobase 包）
- `pnpm run lint` / `pnpm run typecheck` / `pnpm run test`（抽样）/ `pnpm run doc-sync` 全绿（门禁免疫实证）
- `setup-nocobase.mts install/start/init/verify/stop` 六命令对新路径全跑通；`nocobase-track.e2e.ts`（with-NC）全绿
- git status 性能可接受（~14.7k 新文件的 status/add 实测）

### 验证策略

`pnpm run lint && pnpm run typecheck && pnpm run doc-sync`；`pnpm vitest run examples/kb-agent`；with-NC：`pnpm vitest run examples/kb-agent/tests/nocobase-track.e2e.ts`。Agent Note（process）：源码并入决策 + license 立场 + 门禁免疫设计（引用 A 报告）。

---

## V2 NocoBase 无头消费面：apiproxy nocobase typed 域 + agent 业务工具

**依赖**：V1（运行轨道仓内化）。**改动面**：apiproxy 新域（六触点）+ tool-connector 或新 tool 包 + persona/SKILL + mock 测试。

### 范围

1. **apiproxy `nocobase` typed 域**（B 报告 §2.4/B-5，六触点照 kb 模板）：
   - `src/api/nocobase.ts`：`NocobaseApi { listMeta(): RpcRequest→CollectionMetaView[]; list(collection, {page,pageSize,filter?,sort?,fields?}): RowPageView; get(collection, id, appends?): RowView }`——**读路径先行**（View 类型 zod 锁，filter 用受限子集：eq/in/gt/lt 组合，不透传任意操作符树）
   - `src/api/nocobase.schema.ts`；`api/index.ts` 加字段；`rpc-map.ts` 加行；`fetch/handler.ts` + `fetch/client.ts` 双端；实现复用 `NocoBaseClient`（packages/connector/connector-nocobase/src/client.ts）
   - Config：`nocobaseEnabled` 白名单开关（缺组合/未启用→`nocobase-not-composed` 结构化拒绝）；凭据走既有 `NOCOBASE_BASE_URL`/`NOCOBASE_API_KEY`（ctx.credentials）
   - client fake 面同步（runtime/connection 两处先例）
2. **agent 窄面业务工具**（新 `packages/connector/tool-nocobase/` 或并入 tool-connector——按包职责裁决，倾向新包保持 tool-connector 的"数据集"语义边界）：
   - `nb_list`（collection + filter 描述 → 行集摘要，timeoutMs 10s，generic 卡）/ `nb_get`（collection+id → 实体卡）/ `nb_create`（collection+props → 建行，60s）/ `nb_update`（collection+id+props → 改行，60s）
   - 写工具的确认语义：SKILL 指引 agent 先呈现 diff/预览再调用（对话内确认流，工具本身无 UI 状态）
   - 租户/权限：服务端绑定，parse 拒绝 tenant 实参（tool-kb 模式）
3. **persona/SKILL**：cordis.patch.yml 插入工具行；persona 增业务数据分工指引（业务记录→nb_*；文档→kb_search；统计→lakehouse_query；关联→kg_subgraph（V4 后补第三句））。
4. **webserver prefix 反代**（调试兜底，可选）：`packages/host/webserver` `register({kind:'prefix', path:'/nocobase', handler})` 转发 13000——默认关闭 Config 开关。

### 文件清单

- apiproxy：`src/api/{nocobase.ts,nocobase.schema.ts}`、`src/api/index.ts`、`src/api/rpc-map.ts`、`src/fetch/{handler,client}.ts`、`src/api-proxy.ts`（域实现）、`src/api/rpc.ts`/`rpc.schema.ts`（错误码）
- 新包 `packages/connector/tool-nocobase/`（src/index.ts + 测试）
- `examples/kb-agent/cordis.patch.yml`、`cordis.text-only.patch.yml`
- 测试：apiproxy nocobase 域 spec（mock NocoBase server 复用/扩展 nocobase-track 的 wire mock）；tool-nocobase 工具面 spec

### 验收

- 会话内"列出所有 pending 的订单"→ `nb_list` 返回实体卡；"帮我把订单 X 状态改为 shipped"→ 预览确认 → `nb_update` → 回执卡（with-NC 真实跑通）
- keyless：mock server 下 nb_* 全路径 + `nocobase-not-composed` 拒绝分支
- 浏览器端：`api.nocobase.listMeta` 经 fake/真实面可用（为 V6 ui-business 铺路）

### 验证策略

通用序列 + `pnpm run test:snapshot -t nocobase-tools`（新增 keyless 快照：mock 下对话 transcript 锁定）；with-NC e2e 扩一个业务读写场景。Agent Note（feature）：无头消费面设计 + 窄面工具与 MCP 通道的时序决策（B-6）。

---

## V3 kg-graph 注册表化 + kb-graph-sqlite v2（纯存储批，零 LLM）

**依赖**：无（与 V2 并行）。**改动面**：packages/kb/kb-graph + kb-graph-sqlite + tool-kb 两工具适配。

### 范围（C 报告 §6.2 十触点 + §2 schema）

1. **kb-graph 类型层**：`KbGraphEntityType`/`KbGraphPredicate` 字面量联合 → `Branded<string,'KgNodeTypeId'>`/`Branded<string,'KgRelationId'>`（dsh-brand）；常量数组 → built-in 种子注册（source:'builtin-food'，方向约束迁入 {domain,range}）；JSDoc 重写（"not a plugin extension"语义反转）；`KgNodeType`/`KgRelation`/`KgNode`/`KgEdge`/`KgOntologyRegistry` 类型（C 报告 §1.4 草案）；`KbGraphRuntime` 增 `registerNodeType/registerRelation`（ctx.effect + disposer + 重复错误码）。
2. **kb-graph-sqlite v2**：`SCHEMA_VERSION` 1→2（纯拒绝旧库——实测遇旧 graph.sqlite 报 incompatible + 指引删除重建）；七表 DDL（kg_node_types/kg_relations/kg_nodes+FTS5/kg_edges/kg_aliases/kg_source_runs/kg_usage_counters，C 报告 §2.2 完整 SQL）；Store 扩展 `upsertNode/upsertEdges/subgraph/expand/tombstoneBySource`（递归 CTE + ON CONFLICT MERGE 模板，C 报告 §2.3）；`putTriples` 保留兼容入口（内部转译 upsertEdges）；store.ts:46 强转 → 注册表校验。
3. **tool-kb 适配**：`kb_graph_query`/`kb_graph_add` 改读运行时注册表（行为等价）；工具 schema 枚举动态生成（会话启动物化快照——纯函数惯例）。
4. **既有等价验证**：30 食品场景 SKILL 流零改动；graph-smoke.mts 升级断言（重建后等价）。

### 文件清单

- `packages/kb/kb-graph/src/{types.ts,index.ts}` + tests
- `packages/kb/kb-graph-sqlite/src/{schema.ts,store.ts,index.ts}` + resources/sql（新 DDL/init）+ tests
- `packages/kb/tool-kb/src/graph.ts` + tests
- `examples/kb-agent/scripts/graph-smoke.mts`

### 验收

- 既有 kb-graph/kb-graph-sqlite/tool-kb 测试全绿（等价演进）；注册表 API：注册新类型→查询可见→disposer 移除→重复注册抛错
- sqlite v2：`:memory:` 全路径（upsert 幂等/子图 CTE/expand/tombstone/别名/水位/版本拒绝旧库）
- 覆盖率 per-file 100%

### 验证策略

`pnpm vitest run packages/kb/kb-graph packages/kb/kb-graph-sqlite packages/kb/tool-kb`；`pnpm run test:snapshot -t graph`。Agent Note（architecture）：注册表化推翻 D5 的论证 + SCHEMA_VERSION 2 拒绝重建裁决（C 报告引用）。

---

## V4 kg-build 管线 + agent 图谱工具面

**依赖**：V3。**改动面**：新包 kg-build + tool 工具 + apiproxy kg 域 + persona + e2e。

### 范围（C 报告 §3/§4）

1. **`packages/kb/kg-build/`（管线插件，node half）**：
   - 结构化路径：listMeta 拉取（过滤 hidden/inherits/loadedFromCollectionManager）→ R01–R13 映射（映射规则代码注释直接抄 C 报告 §1.3 checklist）→ 注册表 upsert（nocobase-derived，新类型 draft）→ 分页拉取（sort:-updatedAt, appends 关系字段, pageSize 100 循环）→ 节点/边生成（confidence 1.0，minting `<system>:<collection>:<pk>`）；湖仓源（listTables→类型推导+DuckDB 样本聚合下推）；连接器源（discover tabular 同构）
   - 非结构化路径：kb chunks（水位+内容哈希过滤）→ MiniMax 闭集抽取（pedantic prompt + ontology snippets 裁剪注入 + few-shot）→ 三级校验（JSON→zod→注册表+方向）→ 重试 1 次 → UNCLASSIFIED 降级桶
   - 实体对齐：标准化→精确别名+blocking→Jaro-Winkler≥0.85 AND 向量余弦（kb-embed-minimax）→灰区 LLM 终审→逻辑合并（kg_aliases）
   - 增量：watermark 轮询主通道（filter updatedAt；无 updatedAt 的 collection 回退快照 diff）+ NocoBase workflow 事件回调（collection trigger + request 节点 POST DSH `/kg-ingest`——复用 nocobase-workflow.ts 先例）+ 周期对账；删除 tombstone；文档 delete-then-re-extract；全部单事务（BEGIN IMMEDIATE）
   - 调度：Config（interval、 batchSize、 sources 白名单）；手动触发面（脚本 + 工具 `kg_rebuild`？——裁决：脚本先行，agent 触发工具列为演进）
   - 计量：extraction_calls/extracted_triples/merged_entities/subgraph_queries（meter 模式）
2. **agent 工具**（tool-kb 扩展或新 tool-kg——倾向并入 tool-kb 保持 kb 族聚拢，裁决留实施批）：
   - `kg_schema`（{layer?} → 注册表清单，generic）/ `kg_subgraph`（{seeds[], hops?≤2, max_nodes?=200, relation_types?} → 聚合 YAML + truncated 信号 + 来源表，generic + presentationMeta {seeds,hops,nodeCount,truncated}）
   - persona 分工指引补全（C 报告 §4.2 四句）
3. **apiproxy `kg` 域**（六触点）：`kg.schema/subgraph/expand/stats`（服务端绑定 tenant——`kgTenant` config，照 kb 惯例不进 wire）；`kg-not-composed` 拒绝码。
4. **setup 脚本扩展**：`setup-nocobase.mts init` 增 kg workflow 注册（orders/customers 等业务表 collection trigger → request 回调 DSH kg-ingest）。

### 文件清单

- 新包 `packages/kb/kg-build/`（src/{index.ts,mappers.ts,extract.ts,align.ts,incremental.ts,types.ts}）+ tests（mock NocoBase + mock llm）
- `packages/kb/tool-kb/src/{kg.ts}` 或新包 + 测试
- apiproxy `src/api/{kg.ts,kg.schema.ts}` 等六触点
- `examples/kb-agent/scripts/{kg-build.mts,setup-nocobase.mts 增量节}`；`cordis.patch.yml`
- e2e：`examples/kb-agent/tests/kg-pipeline.e2e.ts`（with-NC+with-key）

### 验收

- **真实跑通（with-NC + MINIMAX_API_KEY）**：setup 初始化业务 collections（含种子客户/供应商/商品/订单数据——seed 扩展）→ 跑 kg-build 全量 → 图谱含 nocobase-derived 类型 ≥4 个、节点 ≥ 数十、边含 belongsTo 派生关系 → 会话问"宏发食品的供应商有哪些"→ kg_subgraph 回答带来源
- KB 文档实体入图（11 篇语料的实体经 LLM 抽取入图，闭集校验拒绝率可观测）
- 增量：改一行订单 → watermark 轮询（或事件回调）→ 图谱节点 updatedAt 变化；删一行 → tombstone
- keyless：mock llm + mock NC 全管线快照

### 验证策略

通用序列 + `pnpm run test:snapshot -t kg`；with-NC e2e 全绿；kg-build 包 coverage 100%（mock llm 分支全覆盖）。Agent Note（architecture）：双路管线 + 增量三通道 + 幂等语义（C 报告引用）+ "结构化为主 LLM 为辅"成本立场。

---

## V5 页面第一波：数据资产市场 + 连接器（规格 = [02-design.md](02-design.md) §3.1/§3.2）

**依赖**：V1（V2 的 assets 数据面可选增强；无 V2 也可先以 connector 缝+orders 落地）。**改动面**：两个新 client 包 + apiproxy 两域 + 组合。

### 范围

1. **`packages/client/ui-assets/`**（照 02-design §3.1）：
   - 包骨架复制 ui-kb 模板（node half 空 apply + client half + CSS Modules + locale）
   - 槽位：`conversation.view`(id:market, order:11) + `sidebar.footer.action`(市场入口) + `tool.call.toolview` key `connector_discover`（市场卡与工具行双呈现）+ `settings.section`（市场设置：种子/刷新）
   - 组件：MarketHeroDock（板块门户：hero+计数行+典型卡+标签云）/ DatasetCardGrid / DatasetDetailTabs（六 Tab）/ RightPanel / OrderConfirmCard（确认卡基座——下单必经）/ AskDatasetBar
   - marketStore（snapshotStore）；问数/下单动作注入会话（view bridge）
2. **`packages/client/ui-connectors/`**（照 02-design §3.2）：
   - 槽位：`conversation.view`(id:connectors, order:12) + `sidebar.footer.action`
   - 组件：ConnectorCatalogGrid（四组筛选）/ ConnectionRow（六态枚举 StateDot）/ StreamStatusList / RunHistoryTimeline（扩展 ui-workflow-run 模式）/ ConnectWizard（AI 辅助=会话预填）
3. **apiproxy 域**：`assets.*`（list/detail/stats——聚合 connector.discover + lakehouse catalog + dataset.json 真源投影为商品视图）/ `connectors.*`（list/connections/transfers——connector 缝 + transfers 表投影）；六触点 + `*-not-composed` 拒绝码 + fake 面同步。
4. **种子运营位**：`examples/kb-agent/workspace/data/market/`（典型产品卡文案 + 板块定义）——数据与代码解耦。
5. **组合**：web-app cordis.patch.yml 名册加两包；examples/kb-agent cordis.patch.yml 开 assetsEnabled/connectorsEnabled。

### 文件清单

- 新包 ×2（src/client/** + tests client spec）；apiproxy 六触点 ×2 域；组合 yml ×2；种子数据；QUICKSTART 增节

### 验收

- 浏览器：市场页板块门户→目录→详情→下单确认卡→订单回执（真实 NC 审批轨道或 DSH 内轨道）全链路截图级可跑；连接器页目录+交付跟踪（至少一条 transfer 记录呈现）
- 无会话可浏览（no-session 分支）；四态矩阵各页可触发（拔凭据/停 NC 验证错误态文案）
- keyless 快照：market-browse / connector-track（fake 面驱动）

### 验证策略

`pnpm vitest run packages/client/ui-assets packages/client/ui-connectors packages/host/apiproxy`；`pnpm run test:snapshot -t market` / `-t connector-page`；with-NC：市场下单闭环（复用 nocobase-track 模式）。Agent Note（feature）：双页设计要点 + 确认卡模式 + 种子运营义务（D 报告引用）。

---

## V6 页面第二波 + 辅助通道 + 总收口

**依赖**：V2（nocobase 域）+ V4（kg 域）+ V5（页面模式）。**改动面**：两个新 client 包 + embed 辅助 + MCP 评估 + 文档演示收口。

### 范围

1. **`packages/client/ui-kg/`**（照 02-design §3.3）：
   - sigma.js 三件套动态 import 懒加载；KgGraphCanvas/KgSearchPhraseBox（3-5 内置短语）/KgLegend（类型过滤）/KgDetailsPanel（props/provenance/度数 + 问此实体）
   - 槽位：`conversation.view`(id:kg, order:13) + `tool.call.toolview` key `kg_subgraph`/`kg_schema`（"在图谱中查看"跳转注入 seeds）
   - 图例色板：ui-theme 新增 `--dsw-graph-node-*` 静态刻度提案
2. **`packages/client/ui-business/`**（照 02-design §3.4）：
   - BizCollectionSwitch（listMeta 动态清单）/ EntityCardStream（对话优先视图）/ BizTableView（辅助，hasNext 分页）/ EmbedAdminEntry
   - 编辑/新建注入会话（nb_* 工具承接）
3. **embed iframe 辅助**：DSH 后端代签服务（`nocobase.embedToken`——经 apiKeys 或 signIn 换 token，服务端直连无 Origin 问题）→ `/embed/<pageId>?token=xxx` iframe 呈现于 EmbedAdminEntry；webserver 反代兜底开关同批验证（X-Frame-Options 实测——B 报告遗留 #12）。
4. **MCP 通道评估**（决策批，非必实现）：NocoBase 启用 plugin-mcp-server + api-keys → DSH 侧 MCP streamable HTTP client 原型 → nb_* 与 resource_* 对照（工具描述质量/错误归一/上下文占用）→ 结论落 Agent Note；采纳则在后续批切主通道。
5. **收口**：QUICKSTART/README 全面更新（新组合/新页面/新动线/演示命令）；`demo-full-journey.mts` 扩场景 4（业务管理对话建单经 nb_*）与场景 5（图谱问答 kg_subgraph）；docs/subsystems 增 kg-build/ui 页（doc-sync 判定）；全门禁矩阵复跑。

### 文件清单

- 新包 ×2（ui-kg/ui-business）；apiproxy `nocobase.embedToken`（或独立 embed 域）；ui-theme 刻度提案；组合 yml；QUICKSTART/README；demo 脚本扩展；（评估产物）MCP 原型脚本 + Agent Note

### 验收

- 图谱页：进入→子图渲染→双击展开→点击详情→路径高亮→类型过滤全交互可用（真实 kg 数据）；万级节点不触发（max_nodes 保守默认）
- 业务管理页：collection 切换→实体卡流→"编辑（对话）"注入会话→确认→nb_update→卡片刷新；embed iframe 管理入口可打开（token 代签生效）
- demo-full-journey 五场景真实跑通（实录落盘）；全门禁矩阵（typecheck/lint/test/coverage/doc-sync/build/hygiene/snapshot/e2e）不回退

### 验证策略

`pnpm vitest run packages/client/ui-kg packages/client/ui-business`；`pnpm run test:snapshot`（全量基线豁免外不回退）；with-NC+key：demo 五场景；`pnpm run website:build`（若 docs 改动）。Agent Note（feature ×2 + process ×1：MCP 评估结论）。

---

## 批间依赖图

```mermaid
graph LR
    V1[V1 源码并入] --> V2[V2 nocobase 域+业务工具]
    V1 --> V5[V5 市场+连接器页]
    V3[V3 kg 注册表化<br>(零依赖)] --> V4[V4 kg-build+图谱工具]
    V2 & V4 & V5 --> V6[V6 kg/业务页+embed+收口]
```

- V3 可与 V2 并行（纯存储演进，不碰 apiproxy/NC 对接面）。
- V5 最低依赖 V1（connector 缝+orders 已在），V2 完成后资产数据面更实（nocobase 域可选增强）。
- 若单批上下文吃紧：V4 可拆 V4a（结构化路径+工具）/V4b（LLM 抽取+对齐+增量）；V6 可拆 V6a（ui-kg）/V6b（ui-business+embed+收口）。

## V0–V6 完成记录（2026-09-07 全批收口）

| 批次 | 状态 | 落地摘要 |
|---|---|---|
| V1 源码并入 | ✅ | `platform/nocobase/` 快照 + MANIFEST/NOTICE + 4 处门禁免疫 + setup 仓内化（Agent Note 2026-09-06） |
| V2 nocobase 域+业务工具 | ✅ | apiproxy nocobase typed 域六触点 + nb_collections/nb_list/nb_get/nb_create/nb_update + 对话内 diff 确认模式 |
| V3 kg 注册表化 | ✅ | KbGraphRuntime 注册表 + Branded ids + sqlite v2 七表（SCHEMA_VERSION 2）+ putTriples 兼容转译 |
| V4 kg-build+图谱工具 | ✅ | 双路管线（结构化 R01–R13 + MiniMax 闭集抽取）+ 实体对齐 + 增量水位 + `kg_schema`/`kg_subgraph` + with-NC 全量建图实跑 |
| V5 市场+连接器页 | ✅ | ui-assets（门户/目录/详情/下单确认卡）+ ui-connectors（目录/交付跟踪）+ `assets.*`/`connectors.*` 域 |
| V6 页面第二波+收口 | ✅ | 本批：apiproxy `kg.*` 域六触点 + ui-kg（sigma v3 画布/短语框/图例/详情）+ ui-business（对象切换/实体卡流/表格/embed 入口）+ webserver `/nocobase` 反代 + MCP 通道对照评估（REST 保持主通道）+ demo 五场景全 PASS + 全门禁总验 |

V6 实施偏差（现场裁决，详见 Agent Note `2026-09-07-kg-page-and-business-page`）：sigma 三件套砍为 sigma+graphology+FA2（不引 @react-sigma/core）；embed 代签后置（plugin-embed server 端为空壳、无公开页可指，2.2.6 实测无 framing 头，反代剥头为纵深防御）；FA2 同步布局不持续模拟。

## 全工作线遗留合并视图（V0–V6 之后）

- **embed 代签链接**：部署侧发布 plugin-embed 公开页后接「代签 token → /embed/<pageId>」（当前入口为反代 admin 根路径）。
- **图谱两点路径高亮/持续模拟/增量坐标保留**：见 `dsh-client-ui-kg` README 已知限制；随双节点选择交互与持久布局存储到来。
- **业务页列筛选/排序/行级变更通知**：随表头交互与 NocoBase workflow 事件通道到来。
- **MCP 通道**：REST 窄面保持主通道（评估结论 Agent Note `2026-09-07-mcp-channel-evaluation`）；多 MCP server 编排需求出现时重评。
- **apiproxy 域实现拆分**（v1 R5 债务）：V2/V4/V5/V6 已加 nocobase/kg/assets/connectors 四域，聚合模式一致性优先，拆分维持后续登记。
- **v1 订单状态机三缺口/coverage 9 文件/kb_search 文件名通道**：维持登记（与本工作线无触碰）。

## 与 v1 批次的衔接

- v1 遗留技术债（订单状态机三缺口/coverage 9 文件/kb_search 文件名通道等）不阻塞 V1–V6 主线，维持登记；演进批触及同文件时顺手清偿（如同 N5 订单域文件的状态机缺口可在 V5 下单确认卡批顺带）。
- v1 的 R5（apiproxy 4037 行+膨胀）在 V2/V4/V5 各加两域后会加剧——本计划新增域仍遵循现状聚合模式（一致性优先），"域实现拆分"维持后续债务登记，不在本阶段重构。
