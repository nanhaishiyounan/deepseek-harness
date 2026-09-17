# 修复计划：food-kb-agent 工具调用失败 + 张红喜方案关联缺失

> 依据：会话 `session-80c1082c`（`/Users/mac/Downloads/session.jsonl 3`，cwd=`/Users/mac/Documents/github/deepseek-workspace`，preset=`enterprise-data-assistant`）取证 + 三路代码调研 + 运行时数据只读取证（`examples/kb-agent/workspace/kg-graph.sqlite`、`kb.sqlite`）。

## 目标摘要

让「俄罗斯仓库被炸了，有没有别的路径」这类问题在真实会话中一次答对：kb_ingest 路径解析与会话工作区一致、export-risk 语料可被检索、nb_list 支持受控模糊匹配、答案能通过 KG 把仓库应急场景关联到张红喜（专家）及其方案实体。

## 根因结论（四类失败）

### 失败 1：kb_ingest 三次 FS_NOT_FOUND（seq 306/329/331）——三层基准错位

| 层 | 事实 |
|---|---|
| 代码 | [`ingest.ts`](../packages/kb/tool-kb/src/ingest.ts:180) `ctx.fs.resolve(input.path, { signal })` 不传 cwd → [`fs-local`](../packages/fs/fs-local/src/index.ts:106) 落到 `config.cwd`，默认 `process.cwd()`（[`fs-local/src/index.ts:66`](../packages/fs/fs-local/src/index.ts:66)）。从仓库根启动（QUICKSTART 约定）→ 解析到 harness 根 `workspace/`。对照：read/write/edit 走 [`read-target.ts`](../packages/fs/tool-fs/src/read-target.ts:24) + [`session-cwd.ts`](../packages/fs/tool-fs/src/session-cwd.ts:23) 用 session header cwd——kb_ingest 是模型可见路径入参却用隐性进程基准，**与 fs 工具族不一致是缺陷** |
| 数据 | export-risk 语料（`examples/kb-agent/workspace/data/export-risk/`，9 个 md）从未入 KB：[`seed-kb.mts`](../examples/kb-agent/scripts/seed-kb.mts:23) 与 [`setup-dsh-data.mts`](../examples/kb-agent/scripts/setup-dsh-data.mts:48) 的 5 目录白名单（5+5+5+3+3=21 文档）漏 export-risk；而 KG corpus root（[`cordis.patch.yml:178-182`](../examples/kb-agent/cordis.patch.yml:178)）递归扫全 `data/` → KG 有 `kb:export-risk/*` 实体（141 个）、kb_search 永不返回——**两份硬编码清单无同步机制** |
| 诱导 | kb_search 空结果提示「ingest more documents」（seq 304）+ KG 实体 id `kb:export-risk/<file>.md` + kb_search 引用行格式 `workspace/data/...`（[`search.ts:119-121`](../packages/kb/tool-kb/src/search.ts:119)）→ 模型拼出 `workspace/data/export-risk/...`。即使改成 session cwd 解析，该相对路径在 `deepseek-workspace` 下也不存在（语料在 `examples/kb-agent/workspace/data/`）——进程 cwd / session cwd / 语料根三者互不相同 |

### 失败 2：kg_query 模板不匹配（seq 525）——设计行为，非 bug

[`kg-nl.ts:55-101`](../packages/kb/kb-graph/src/kg-nl.ts:55) 的 9 个硬编码模板闭集 + [`kg-query.ts:62-64`](../packages/kb/tool-kb/src/kg-query.ts:62) 的 fallback 提示。「备份启用流程」是流程性问句必然 miss；其答案在 export-risk 语料 `2026-08-backup-warehouse-network.md`（未入 KB）——失败 2 的实质痛点与失败 1 的数据层同源。小改进：错误消息 `slice(0,4)` 截断了支持句式列表。

### 失败 3：nb_list filter op `like` 三次被拒（seq 712/714/742）——受限词汇表缺模糊匹配

[`read.ts:364`](../packages/connector/tool-nocobase/src/read.ts:364) enum 只有 `eq/in/gt/lt`，[`json-schema.ts:477-478`](../packages/core/tools/src/json-schema.ts:477) 通用层在 execute 前拒绝；[`filter.ts:12`](../packages/connector/connector-nocobase/src/filter.ts:12) `NbFilterOp` 刻意排除包含语义。description 已写明支持的 op，但模型仍按 NocoBase 生态直觉三次用 `like`，且**没有任何模糊匹配替代**——最终全量分页绕过，`experts` 表信息永久丢失（答案断了人名的直接原因之一）。

### 失败 4：张红喜方案未关联（核心诉求）——KG 两个孤立连通分量 + 呈现层断名

数据取证结论（`examples/kb-agent/workspace/kg-graph.sqlite`）：

- **张红喜 = `nocobase:experts:1`，是专家（Expert）不是供应商**。持有 expert_services:1/2/3（中亚货运动线方案 ¥8,800 / 海外仓风险应对咨询 / 食品出海合规咨询），并被 orders:1/28/32/33/34 订购。最终答案推荐的 id:1、id:2 服务**实质上就是张红喜的方案**——「答案关联了但名字断了」。
- 断名机制：(a) `nb_list experts` 因 like 被拒后未重试，experts 行（人名）从未取回；(b) expert_services 行的 `name` 是服务名、`expertId` 是外键，工具无 join，模型未做二次查询；(c) KG 侧 **kb-doc 家族（708 节点）与 nocobase 家族（207 节点）之间跨家族边 = 0 条**（nocobase↔connector 也是 0）——kg_subgraph 从仓库实体走查在结构上不可能到张红喜。
- 代码级根因：[`alignEntity`](../packages/kb/kg-build/src/align.ts:136) 按 type 限定对齐候选 → doc 抽取实体落在内置本体类型（Region/Warehouse/Process…），NocoBase 行落在 collection 名类型（experts/expert_services/orders/datasets/customs_export），两套类型 id 永不相交 → 合并永不触发；kg-build 四条腿（nocobase/lakehouse/connector/corpus，[`index.ts:319`](../packages/kb/kg-build/src/index.ts:319)）之间**没有任何跨源建边 pass**。
- 语义桥已存在但未接线：doc 侧 Region「中亚」「莫斯科」「中亚五国」与 NocoBase 侧 `customs_export:1「中亚」`、`expert_services:1「中亚货运动线方案」`、`datasets:3「俄罗斯·中亚海外仓风险应对手册」`等**主题共指**（`customs_export:1` 名字与 doc Region「中亚」精确相等）。

### 附带发现的隐患（纳入修复）

- kg-build corpus 腿 [`index.ts:710-716`](../packages/kb/kg-build/src/index.ts:710) 按 mtime 降序 `maxDocuments=50` 截断，而 `data/` 下可扫描文件约 51 个——**临界截断风险**（某次构建可能悄悄丢文档）。
- corpus root 递归把非语料目录（`connector-files/`、`experts/`、`hub/`、`crm/` 的 json/样例）也当语料抽取，产生 `kb:connector-files/...#中亚市场`、`kb:export-compliance/...#OU`（type=experts 的认证机构噪音实体）。

## 关键文件

| 文件 | 角色 |
|---|---|
| [`packages/kb/tool-kb/src/ingest.ts`](../packages/kb/tool-kb/src/ingest.ts:180) | kb_ingest 路径解析改 session cwd |
| [`packages/fs/tool-fs/src/session-cwd.ts`](../packages/fs/tool-fs/src/session-cwd.ts:23) | session cwd 解析选项沉淀为共享导出 |
| [`packages/connector/connector-nocobase/src/filter.ts`](../packages/connector/connector-nocobase/src/filter.ts:12) | 新增 `includes` op（→ NocoBase `$includes`） |
| [`packages/connector/tool-nocobase/src/read.ts`](../packages/connector/tool-nocobase/src/read.ts:364) | nb_list schema enum + description |
| [`packages/kb/tool-kb/src/kg-query.ts`](../packages/kb/tool-kb/src/kg-query.ts:62) | 错误消息列全支持句式 |
| [`packages/kb/kg-build/src/index.ts`](../packages/kb/kg-build/src/index.ts:319) | 新增跨源共指边 pass + corpus 清单驱动 + 截断 fail loud |
| [`packages/kb/kg-build/src/align.ts`](../packages/kb/kg-build/src/align.ts:53) | 归一化复用（不放宽同类型合并） |
| [`packages/kb/kb-graph/src/ontology.ts`](../packages/kb/kb-graph/src/ontology.ts:79) | 注册 `corefers_with` 关系（宽松 domain/range） |
| [`examples/kb-agent/scripts/seed-kb.mts`](../examples/kb-agent/scripts/seed-kb.mts:23) / [`setup-dsh-data.mts`](../examples/kb-agent/scripts/setup-dsh-data.mts:48) / [`cordis.patch.yml`](../examples/kb-agent/cordis.patch.yml:178) | 改读单一语料清单 |
| 新 `examples/kb-agent/kb-corpus.yml` | 语料目录单一事实源（与 kg-mappings.yml 并列） |
| [`examples/kb-agent/scripts/kg-build.mts`](../examples/kb-agent/scripts/kg-build.mts:100) | 重跑 + 跨源可达断言扩展 |

## 实施批次

### 批次 P0-1：工具正确性（纯代码，最先落地）

范围与改动：
1. **kb_ingest 按 session cwd 解析**：把 [`session-cwd.ts`](../packages/fs/tool-fs/src/session-cwd.ts:23) 的解析逻辑沉淀为可复用导出（推荐：fs 包新增纯函数 `sessionResolveOptions(sessionCwd, requestedPath)`，tool-fs 与 tool-kb 共用；禁止复制粘贴），[`ingest.ts:180`](../packages/kb/tool-kb/src/ingest.ts:180) 改为与 [`read-target.ts`](../packages/fs/tool-fs/src/read-target.ts:24) 相同语义。显式 resolve 基准，不留隐性 `?? process.cwd()`。
2. **nb_list 新增 `includes`**：[`filter.ts`](../packages/connector/connector-nocobase/src/filter.ts:33) `NbFilterOp` +1 并映射 `$includes`；[`read.ts:364`](../packages/connector/tool-nocobase/src/read.ts:364) enum + description 首行写明「fuzzy match → includes」。不加 `like` 别名（`%` 通配语义有歧义）。保持受限词汇表设计：+1 受控 op，不开任意操作符树。
3. **kg_query 错误消息列全句式**：[`kg-query.ts:63`](../packages/kb/tool-kb/src/kg-query.ts:63) 去掉 `slice(0,4)`。

测试（失败测试先行）：
- `packages/connector/tool-nocobase/tests/tool-nocobase.spec.ts`：`includes` → 请求体 `$includes` 断言；`like` 仍被 enum 拒绝（错误消息含 `includes`）。
- `examples/kb-agent/tests/` 快照更新：工具 schema/description/错误消息是 model-visible 行为，随行为更新 keyless 快照（真 Loader 组合 + fixture）。
- tool-kb 新 spec：session cwd fixture 下 kb_ingest 相对路径解析到会话目录（而非 process.cwd()）。

验收：上述测试绿；`pnpm run typecheck && pnpm run lint` 过。同 PR 加 Agent Note。

### 批次 P0-2：语料单一事实源 + 数据补录

范围与改动：
1. 新建 `examples/kb-agent/kb-corpus.yml`：目录 + kind 清单（现有 5 目录 + export-risk + market/meetings/process/profiles/regulations/supply/cost/food-safety 等语料目录；显式排除 `connector-files/`、`experts/`、`hub/`、`crm/` 等非语料目录）。
2. [`seed-kb.mts`](../examples/kb-agent/scripts/seed-kb.mts:23)、[`setup-dsh-data.mts`](../examples/kb-agent/scripts/setup-dsh-data.mts:48)、[`cordis.patch.yml`](../examples/kb-agent/cordis.patch.yml:178)（kg-build corpus 配置）三处改读同一清单，删除双清单「keep in sync」注释依赖。清单解析 fail loud（未知键/缺文件报错）。
3. [`index.ts:710-716`](../packages/kb/kg-build/src/index.ts:710)：corpus 腿按清单目录扫描；`maxDocuments` 变为保护性上限——清单文档数超限时构建报错而非静默 mtime 截断。
4. 重跑数据（真实执行，需 `.env` MINIMAX_API_KEY）：
   - `seed-kb.mts`：KB 入库 ~48 文档（含 export-risk 9 篇），kb_search 可检索「备份启用/莫斯科主仓/阿拉木图」。
   - `kg-build.mts`：KG 重建（幂等：水位线 + sha256 跳过）。

验收：
- `sqlite3 examples/kb-agent/workspace/kb.sqlite "SELECT COUNT(*) FROM documents;"` ≈ 48，`source_path` 分布含 `workspace/data/export-risk/*`。
- spec 断言「KB documents 集合 ⊆ kb-corpus.yml 清单」。
- 真实 kb_search（或 e2e）「俄罗斯仓库 应急」命中 export-risk 文档。同 PR 加 Agent Note。

### 批次 P0-3：KG 跨源共指边（张红喜可达的结构性修复）

范围与改动：
1. [`ontology.ts`](../packages/kb/kb-graph/src/ontology.ts:79) 注册新关系 `corefers_with`：domain/range 宽松（Object/Object），语义「doc 抽取实体与业务数据行主题共指」。
2. [`index.ts`](../packages/kb/kg-build/src/index.ts:319) 新增第五条腿 `runCrossSourceAlign()`（或 corpus 腿后置 pass）：
   - 候选：doc 抽取实体（类型白名单：Region/Concept/Warehouse/Process/Company/Product/Risk 等内置域类型；name 归一化后长度 ≥2；排除人名类）× nocobase 节点。
   - 规则：[`normalizeName`](../packages/kb/kg-build/src/align.ts:53) 相等 → 必建边；nocobase 名归一化后包含 doc 名（前缀/包含）→ 默认建边、可配置。**不放宽同类型合并**（merge 风险高，本 pass 只建边不合并，确定性规则、无 LLM 依赖）。
   - 边：`src=doc 实体, dst=nocobase 实体, relation=corefers_with, source_system='kg-align', source_id=doc scope`（七列锚 UNIQUE 保证幂等重放）。
   - 开关与阈值进 kg-build 插件 Config（`crossSourceAlign: { enabled, exactOnly }`），cordis.yml 可调——「No hardcoded tunables」。
3. 重跑 `kg-build.mts`，扩展其验收断言。

验收（真实数据）：
- SQL 递归 CTE（无 hops 限制）断言：`kb:ecommerce/...#莫斯科主仓` 与 `nocobase:experts:1` 连通，路径含 `corefers_with`。
- `kg_query`「张红喜的供货链」返回含 export-risk 社区节点（中亚/莫斯科/备仓）。
- `kg_subgraph` seeds=["中亚"] hops=2 含 `expert_services:1 中亚货运动线方案`。
- 误连人工抽查：corefers 边抽样 ≤2 跳邻接无语义错配（如「中亚」→ 中亚相关服务/数据集，合理）。同 PR 加 Agent Note。

### 批次 P1：体验增强（可独立裁剪）

1. [`kg.ts`](../packages/kb/tool-kb/src/kg.ts:345) kg_subgraph hops 上限 2→3（schema max 放宽，让仓库种子 2-3 跳覆盖跨源桥）。
2. [`store.ts:731`](../packages/kb/kb-graph-sqlite/src/store.ts:731) `searchNodes` 读 `kg_aliases`——对齐别名对种子解析可见。
3. nb_list/nb_get description 补一句引导：「expert_services.expertId 需再以 `nb_list experts filter:[{op:"in"}]` 取人名」（P0-1 的 includes 已让这条路可走）。
4. 文档同步：QUICKSTART.zh.md / DEPLOY.zh.md 语料清单与启动说明、快照与 demos 证据（按仓库测试策略，model-user-visible 行为变化带 keyless 快照）。

## 最终回归（真实重放）

前置：`.env` 有 MINIMAX_API_KEY；按 [`QUICKSTART.zh.md`](../examples/kb-agent/QUICKSTART.zh.md:32) 从仓库根启动：

```sh
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless \
  --patch examples/kb-agent/cordis.patch.yml "俄罗斯仓库被炸了，有没有别的路径"
```

判定标准：
- (a) 会话日志无 kb_ingest `FS_NOT_FOUND` 连败（kb_search 直接命中 export-risk 文档，模型无需自行 ingest；若仍尝试，相对路径按 session cwd 解析，错误消息含正确基准绝对路径）；
- (b) nb_list 无 `INVALID_ARGS` op 连败：模型用 `includes`（或 eq/in）成功查 `experts`/`hub_inv_warehouses`；
- (c) 最终答案或其工具链中出现「张红喜」（experts:1 人名，经 includes 查表或 KG 走查），且其方案（中亚货运动线方案/海外仓风险应对咨询）与仓库应急场景以专家名义关联呈现；
- (d) 三批各自单测/快照/数据断言全绿。

## 技术决策

1. **session cwd 是模型可见路径的统一基准**：kb_ingest 与 read/write/edit 对齐；解析逻辑沉淀共享导出，不做 per-tool 复制。
2. **KB 与 KG 语料单一事实源**（kb-corpus.yml）：消灭「KG 有、KB 无」的双清单漂移；非语料目录显式排除；截断 fail loud。
3. **跨源桥用「共指边」而非「放宽合并」**：合并（merge）改 id 归属，误配代价高且不可逆；corefers_with 边独立、幂等、可墓碑，符合七列锚 provenance 设计。规则确定性、无 LLM 依赖（灰区 LLM 裁决只留在同类型 merge 路径）。
4. **nb_list 走受控扩展而非开放操作符树**：+1 `includes` 映射 NocoBase 原生 `$includes`，词汇表仍闭集。
5. **张红喜身份以真实数据为准**：他是 experts:1（专家），不是供应商；不新增 suppliers 导入，不篡改业务数据。

## 风险评估

| 风险 | 缓解 |
|---|---|
| corefers 包含匹配误连（短名如「中亚」连到所有含「中亚」的行） | 主题相关即合理；`exactOnly` 配置可收紧；验收含人工抽样 |
| kg-build 重跑依赖 MINIMAX_API_KEY（corpus LLM 抽取） | `.env` 已有；sha256 幂等，失败可续跑 |
| tool-kb 引入共享 session-cwd 导出的包边界 | 优先沉到 fs 缝纯函数（不依赖 agent 类型）；knip/hygiene 随 PR 跑 |
| 重建 KB/KG 后既有快照/演示数据变化 | 快照随行为更新（测试策略）；demos 重录证据 |
| 语料从 21→~48 文档后检索质量变化 | 重放回归 (a) 直接验证；必要时调 doc_kind 标注 |
| hops 放宽 2→3 引起子图爆炸 | 已有 maxNodes=200 裁剪兜底 |
