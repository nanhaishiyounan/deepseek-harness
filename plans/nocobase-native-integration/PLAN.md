# 架构 v2 总计划：NocoBase 源码级融入 + 本体知识图谱 + DSH Web 全页面产品化

> **执行方式**：本计划供 Loop 引擎按批次（V1 → V6）迭代执行，每批 = 一个 code 子任务可完成的规模。批间依赖：V1 独立先行；V2/V3 可并行（V2 依赖 V1，V3 零依赖）；V4 依赖 V3；V5 依赖 V1（可选 V2）；V6 依赖 V2/V4/V5。
>
> **本计划是对 v1 计划（[plans/connector-lakehouse-nocobase/PLAN.md](../connector-lakehouse-nocobase/PLAN.md)，N0–N7+R1 已全部完成）的方向性修正**：用户否定"NocoBase 作为外部 REST 对接的独立部署后台"，要求 NocoBase 源码并入本仓库作为企业业务系统主体，湖仓/KB 从 NocoBase 取数建立本体知识图谱，数据资产/连接器/图谱/业务管理全部页面化整合进 DSH Web 端，且页面交互 AI 驱动。
>
> **调研底座**（四份，全部 2026-09-06 完成）：
> - 盲区 A（源码并入方式）：[research/2026-09-06-nocobase-integration/sections/01-nocobase-source-integration.zh.md](../../research/2026-09-06-nocobase-integration/sections/01-nocobase-source-integration.zh.md)
> - 盲区 B（UI 整合路径）：[research/2026-09-06-nocobase-integration/sections/02-nocobase-ui-dsh-integration.zh.md](../../research/2026-09-06-nocobase-integration/sections/02-nocobase-ui-dsh-integration.zh.md)
> - 盲区 C（本体知识图谱）：[research/2026-09-06-nocobase-integration/sections/03-ontology-kg.zh.md](../../research/2026-09-06-nocobase-integration/sections/03-ontology-kg.zh.md)
> - 盲区 D（产品 UI/UX 模式）：[research/2026-09-06-nocobase-integration/uiux-patterns.zh.md](../../research/2026-09-06-nocobase-integration/uiux-patterns.zh.md)
>
> **既有资产基线**：v1 的 N0–N7+R1 全部完成——湖仓三包（lakehouse/lakehouse-sqlite-catalog/lakehouse-duckdb）、连接器四包（connector/connector-file/connector-nocobase/tool-connector）、expert-orders/expert-pdf（下单→审批→PDF 闭环）、apiproxy data/orders 域、ui-kb 工作台、真实 NocoBase 轨道 e2e（外部目录运行方式）。完成矩阵见 [02-batches.md §N7](../connector-lakehouse-nocobase/02-batches.md)。

---

## 一、用户硬要求 → 方案映射

| # | 用户要求（原话要点） | 方案落点 |
|---|---|---|
| U1 | NocoBase 源码融入本仓库，作为部署企业的日常业务管理系统 | `platform/nocobase/` 隔离式源码快照（决策 A-1），setup 轨道仓内化 |
| U2 | 数仓和知识库从 NocoBase 拿数据，建立本体知识图谱（不是放服务器文件夹） | kg-build 管线：NocoBase collections + 湖仓表 + KB 文档三源直连，写入 kg-graph-sqlite v2 属性图（决策 C-1~C-4） |
| U3 | 数据资产 = 公共数据可查看可下单；连接器负责交付；页面整合到 DSH 端 | ui-assets（市场：浏览-详情-下单）+ ui-connectors（交付跟踪）+ 订单闭环复用既有 orders/expert-orders（决策 B-1、E-3） |
| U4 | 全部 AI 智能化，不需要用户手动填表 | 对话优先交互：槽位填充→确认卡→执行→实体卡回写；agent 经工具面直读直写 NocoBase（决策 B-2、D-2） |
| U5 | 先做产品 UI/UX 详细设计再实施 | [02-design.md](02-design.md)（信息架构+线框+组件清单+AI 交互模式+槽位映射）先于页面批次评审 |
| U6 | 不理解的不确定的东西充分调研，不留盲区 | 四份 L4/深度调研报告（A/B/C/D），证据落到文件行级 |
| U7 | 总体架构：NocoBase 管业务，agent 依业务建本体 KG，数据源 = NocoBase+湖仓+外部数据资产（数据空间+连接器），全部有页面 | §二 架构 v2 总图 + 三条动线重绘 |

---

## 二、总体架构 v2

### 2.1 架构总图

```mermaid
graph TB
    subgraph WEB["DSH Web（127.0.0.1:3080，唯一用户入口）"]
        NAV["侧栏模块分组<br/>知识库 · 数据资产 · 连接器 · 图谱 · 业务管理"]
        RING["conversation.view 页签环<br/>会话 / kb / market / connectors / kg / business"]
        AIUI["对话优先交互<br/>槽位填充→确认卡→实体卡回写"]
    end

    subgraph AGENT["会话 Agent（MiniMax-M3）"]
        TOOLS["模型可见工具面<br/>kb_search · lakehouse_query · connector_discover<br/>order_create/status · nb_list/get/create/update(新)<br/>kg_schema/kg_subgraph(新)"]
    end

    subgraph SEAMS["DSH 能力缝层（一切皆插件）"]
        KB["ctx.kb"]
        KG["ctx.kbGraph(注册表化演进)"]
        LH["ctx.lakehouse"]
        CONN["ctx.connector"]
        ORD["ctx.orders"]
        NBD["apiproxy nocobase typed 域(新)<br/>+ kg/assets/connectors 域(新)"]
    end

    subgraph BUILD["kg-build 管线插件（新，LLM 在这里）"]
        MAP["结构化路径<br/>R01–R13 确定性映射"]
        EXT["非结构化路径<br/>MiniMax 闭集抽取"]
        ALIGN["实体对齐<br/>blocking+相似度+LLM 终审"]
        INC["增量调度<br/>watermark+事件回调+对账"]
    end

    subgraph NC["platform/nocobase（源码快照，yarn1 隔离，:13000）"]
        REST["REST /api/*<br/>collections:listMeta / :list / :create<br/>uiSchemas / workflow / attachments"]
        WFLOW["workflow<br/>审批 manual + request 回调"]
    end

    subgraph DATA["数据层"]
        PG[("postgres :5432<br/>(NocoBase)")]
        SQLITE[("kb.sqlite / lakehouse-catalog.sqlite")]
        KGS[("kg-graph.sqlite v2<br/>节点/边/注册表/别名/水位")]
        LAKED[("lakehouse/*.parquet")]
    end

    WEB --> AGENT --> TOOLS
    TOOLS --> KB & KG & LH & CONN & ORD
    NAV & RING --> NBD
    NBD --> REST
    KB --> SQLITE
    LH --> SQLITE & LAKED
    ORD --> REST
    MAP & EXT --> ALIGN --> KGS
    INC -.驱动.-> MAP & EXT
    MAP <-. listMeta/:list .- REST
    MAP <-. listTables .- LH
    EXT <-. chunks .- KB
    CONN -.外部数据资产.-> MAP
    REST --> PG
```

### 2.2 三条动线重绘（v2）

**动线 A：业务数据 → 本体 KG → agent（U2/U7 核心）**

```
NocoBase collections（客户/供应商/商品/订单/物流/仓库/专家/服务/数据资产/连接器…）
湖仓表（parquet+catalog） · 连接器数据集（外部数据资产） · KB 文档（chunks）
  → kg-build 结构化路径：collections:listMeta → R01–R13 映射 → 注册表(nocobase-derived) → 分页拉取+appends → 节点/边(confidence=1.0)
  → kg-build 非结构化路径：KB chunk → MiniMax-M3 闭集抽取 → zod+注册表+方向校验 → 置信边
  → 实体对齐（别名/blocking/相似度/LLM 终审）→ 幂等 upsert（单事务 MERGE+provenance）
  → kg-graph-sqlite v2（UNIQUE 幂等锚点、双时态、来源三元组）
  → agent：kg_schema 探型 → kg_subgraph k-hop（YAML 序列化）→ 对话回答（与 kb_search/lakehouse_query 分工）
  → 用户：图谱页（sigma.js 子图浏览）或会话问答
```

**动线 B：数据资产 → 下单 → 连接器交付（U3）**

```
数据资产目录（连接器 discover 的数据集 + 专家数据集 + 湖仓衍生数据集 → 商品化视图）
  → 市场页浏览（板块门户/搜索/筛选/详情：元数据+样例+质量+授权条款）
  → AI 下单（会话槽位填充 → 确认卡[金额/条款/交付] → order_create）
  → NocoBase orders（审批 workflow：manual → request 回调 orders.fulfill）
  → expert-pdf 交付物 / 连接器 transfer 交付（pull→classify→route→deliver→confirm）
  → 连接器页交付跟踪（运行状态/历史/数据量）+ 会话内订单状态卡
```

**动线 C：上传 → 湖仓/KB → KG（既有动线 A 演进）**

```
浏览器上传 → apiproxy data.upload → DataRouter 判别（csv/xlsx→湖仓，md/pdf→KB）【v1 已实现】
  → 湖仓新表/KB 新文档 → kg-build 增量感知（水位/内容哈希）
  → 结构化映射（湖仓表）/ LLM 抽取（KB 文档）→ 图谱更新（v2 新增回路段）
```

### 2.3 关键边界

- **NocoBase 代码永不进 `@deepseek-ai/dsh-*` 发布包**（npm files 白名单 + publication-payload 门禁拒绝规则，A 报告 §3.4B）。
- **LLM 调用只发生在 kg-build 管线插件与会话 agent**，kb-graph 缝保持"纯存储/查询面"宪法（C 报告 §3.1）。
- **DSH Web 不引入 NocoBase 前端**（React18/antd5/formily 双树隔离）；业务管理高级配置经 plugin-embed iframe（DSH 后端代签 token）作低频辅助（B 报告 §2.5）。

---

## 三、盲区决策表（A–F，逐项定论）

### A. NocoBase 源码并入方式（依据：A 报告，证据级别 Critical）

| # | 决策 | 结论与证据 |
|---|---|---|
| A-1 | 并入形态 | **`platform/nocobase/` 顶级目录隔离式快照**（仿 `native/landlock-run`"独立子树自带 gates"先例）。保留其 yarn1 workspace 自洽与 `packages/*/*` 相对布局（genTsConfigPaths 依赖）。`pnpm-workspace.yaml` **零改动**——现有 glob（`packages/*/*` 两级锚定仓库根）天然不吸入 `platform/` 子树 |
| A-2 | 否决 vendor/ 化 | `vendor/*` 一级 glob 会吸成 workspace 成员 → allowBuilds 硬错（pnpm-workspace.yaml:35-39）+ constraints 的 private/workspace: 断言 + rescope 破坏 `@nocobase/plugin-*` 运行时解析（PLUGIN_PACKAGE_PREFIX） |
| A-3 | 否决 pnpm workspace 吸收 | 157/159 包 CJS vs DSH 纯 ESM；React18+antd5+formily 双树冲突；yarn1 lockfile 无法并入 pnpm |
| A-4 | 门禁免疫 | 仅 4 处小改：`.oxlintrc.json` + `.oxlintrc.staged.json` 加 `platform/**` ignore；`.gitignore` 加 `platform/nocobase/**/dist|storage` + `.repo` 三条；`.gitattributes` 加 `platform/nocobase/** -text`；可选 lefthook whitespace exclude。其余全部门（typecheck/test/coverage/doc-sync/hygiene/knip/publint/notices）白名单锚定天然免疫 |
| A-5 | License | **2.2.6 现行许可 = Apache-2.0 + NocoBase 补充条款（v2.0.3/2026-02-24 变更，非 AGPL）**。内部部署无网络源码披露义务；保留全部 LICENSE 与 9450 文件头注释（§5.3 禁移除）；§5.4 禁止对外提供 no-code/AI platform SaaS（DSH 卖 KB+agent 能力不触发；若未来托管 NocoBase 给租户搭应用需商业授权）；pro 插件永不复制 |
| A-6 | 复制范围 | 排除 node_modules/dist/storage/.git/.env*/tsconfig.paths.json；**docs/（94M/1.2 万文件）首期排除**；净复制 ≈14,750 文件/≈49MB。rsync 命令见 A 报告 §5.3。**复制前必须停掉本机在跑的 NocoBase 实例**（storage 含活跃 gateway.sock 与密钥） |
| A-7 | 构建启动 | `cd platform/nocobase && yarn install`（yarn1，勿用 pnpm --dir）→ `.env` 钉 `DB_DIALECT=postgres`（零缺件；sqlite 需补装 sqlite3@5.x）→ `yarn nocobase install` → `yarn dev-server`（:13000，tsx 直跑源码无需 build）。端口矩阵：DSH 3080/3081 vs NC 13000/13001/13002，postgres 5432 唯一共享 |
| A-8 | 升级路径 | 快照 + `platform/nocobase/MANIFEST.md`（upstream URL/tag/日期/排除项/本地修改清单）+ 定期 rsync 重同步；本地修改以独立补丁文件承载；不引入 submodule（zip 源无 git 历史） |

### B. NocoBase UI 与 DSH Web 整合（依据：B 报告）

| # | 决策 | 结论与证据 |
|---|---|---|
| B-1 | 整合主体 | **路径 3：DSH Web 原生页面消费 NocoBase 无头 API**。日常业务操作（查/改/审批）由会话 agent 经工具面直读直写 + 对话内 diff 审核；数据资产/连接器/KG/业务管理四页 = 新 ui-* 插件（槽位注入 + typed 域）。无头 API 面经 9 维度端点级验证充分（建表/建字段/建页面/摆区块/流程/审批全 REST 可达） |
| B-2 | 辅助通道 | **路径 1：官方 plugin-embed iframe** 承载低频管理（UI 编辑器拖拽搭页/角色权限细配）——`/embed/<pageId>?token=xxx`，token 由 DSH 后端经 `auth:signIn` 或 apiKeys 代签。仅三个真缺口：聚合依赖 charts 插件、无行级变更订阅（轮询补偿）、uiSchema 渲染语义前端库自建有限解释器（AI 主交互下表单渲染需求本身弱化） |
| B-3 | 否决路径 2 | 在 NocoBase 内开发 DSH 页面：页面住 NocoBase UI（/admin/*）与"整合到 dsh 端"硬要求相悖；client-v2 官方明示"not recommended for production"；formily 心智+双产物契约成本高。仅作后备（需全新区块类型时） |
| B-4 | 反代纠偏 | DSH **无 vite dev proxy**（apps/web vite.config 禁止 bare serve）；NocoBase 反代落点 = webserver `register({kind:'prefix', path:'/nocobase', handler})`（packages/host/webserver），仅作调试兜底，不进槽位/主题体系 |
| B-5 | BFF 模式 | apiproxy 新 `nocobase` typed 域（六触点：api/nocobase.ts 契约 + nocobase.schema.ts + ApiProxy 字段 + rpc-map 行 + fetch 双端 + 实现），**按 collection 粒度建 typed 方法**（nocobase.listMeta/list/get…，zod 锁），不开任意 method/path 透传域；实现复用 `dsh-connector-nocobase` 的 NocoBaseClient |
| B-6 | agent 通道 | **V1–V4 用自建窄面 REST 工具**（nb_list/nb_get/nb_create/nb_update，复用 NocoBaseClient，零新协议、复用既有认证/重试）；**V6 评估 MCP 通道**（NocoBase plugin-mcp-server `/api/mcp`，6 个 resource_* 工具，API Key 鉴权）对照评测，择优保留。理由：MCP 免 schema/错误归一化但需新实现 streamable HTTP client；REST 窄面直接复用已验证客户端，闭环更快（B 报告 §4.6 组合落地的时序重排） |

### C. 本体知识图谱（依据：C 报告）

| # | 决策 | 结论与证据 |
|---|---|---|
| C-1 | 本体范式 | **强类型属性图（LPG）为主**：TS 声明式 schema 表类层次/domain/range（借 OWL 思想不引推理机）；SHACL 语义自建闭集校验（validateEdge）；词表 SKOS 风格（aliases/broader）；保留 RDF 投影出口。三层：5 顶层类（Object/Process/Event/Role/Concept）+ 10 业务域 + 实例层；既有食品 7×7 并入 built-in 种子 |
| C-2 | 存储 | **续用 node:sqlite**（与 kb-graph-sqlite 同构）：kg_node_types/kg_relations 注册表 + kg_nodes（UNIQUE(tenant,type,natural_key)+FTS5 trigram+向量 BLOB）+ kg_edges（七元组 UNIQUE+双时态+provenance）+ kg_aliases + kg_source_runs 水位 + kg_usage_counters。`SCHEMA_VERSION` 1→2 纯拒绝旧库+全量重建（图谱是 provenance 可溯的派生数据；AGENTS.md "Backends reject old on-disk formats" 宪法）。Kùzu 已归档/Neo4j 违反无重型基础设施红线，双否决 |
| C-3 | 构建管线 | **kg-build 管线插件**（`packages/kb/kg-build`，inject=['kbGraph','lakehouse','connector','kb','llm']）：结构化路径（listMeta→R01–R13 映射→分页拉取+appends→确定性节点/边）+ 非结构化路径（KB chunk→MiniMax 闭集抽取→zod/注册表/方向三级校验→重试 1 次→降级 UNCLASSIFIED 桶）+ 实体对齐（别名 O(1)+blocking+Jaro-Winkler≥0.85 AND 向量余弦+LLM 终审，逻辑合并可逆）。**kg-build 是自己的取数 Consumer，直连 NocoBaseClient.list 分页循环，不受 datasets fetchRowsCap 约束**（正式回应"不是放服务器文件夹"） |
| C-4 | 增量语义 | **watermark 轮询主通道**（filter updatedAt>$gt，view collection 无 updatedAt 者回退快照 diff）+ **workflow 事件回调补充**（collection trigger + request 节点 POST /kg-ingest；bulkCreate 恒不触发已源码证实，不可作唯一通道）+ **周期对账兜底**。at-least-once + 幂等 upsert（UNIQUE 收敛）；删除走 tombstone（valid_until）；文档更新 delete-then-re-extract |
| C-5 | agent 消费 | **k-hop 子图工具为主**：`kg_schema`（探型）+ `kg_subgraph`（seeds/hops≤2/max_nodes 200 默认）+ 既有 kb_graph_add 保留；序列化 = **按实体聚合的结构化 YAML**（KG-LLM-Bench 实证准确率最优+token 中位）；**禁自由 Text2Cypher**（实测 ~30%）；**不预建社区摘要**（Community-GraphRAG 在 QA 上常败+索引成本，LazyGraphRAG 式懒摘要留扩展位）。分工指引：关联问题→kg_subgraph、原文细节→kb_search、数值聚合→lakehouse_query |
| C-6 | 可视化 | **sigma.js v3 + graphology + @react-sigma/core**（MIT 证伪变更传闻、WebGL、~42KB gzip、React18 peer、渲染上限余量最大）；react-force-graph-2d 备选。子图查询驱动按需加载（kg.subgraph/kg.expand BFF），双击展开/点击详情侧栏/路径高亮（graphology 最短路前端算）/类型过滤（reducer）。万级偶发场景后端预计算坐标+关持续模拟（布局是瓶颈非渲染） |
| C-7 | kb-graph 演进 | **注册表化**（推翻 v1 决策 D5"图谱本体不动"，保留两条内核：闭集校验移到注册表边界、抽取不进缝）。10 个精确触点（types.ts 字面量联合→Branded、常量数组→种子数据、JSDoc 重写、tool-kb 动态枚举、store 强转改注册表校验、SQLite v2……），分四阶段 PR（注册表 API→sqlite v2→kg-build+工具→ui-kg） |

### D. 产品 UI/UX（依据：D 报告 + [02-design.md](02-design.md) 详设）

| # | 决策 | 结论与证据 |
|---|---|---|
| D-1 | 信息架构 | 侧栏新增模块分组（知识库/数据资产/连接器/图谱/业务管理），各页以 `conversation.view` 页签呈现（复用 view ring，无会话时走 hero/独立面板分支，KbEntry no-session 先例）；**不引路由库、不动 apps/web 壳** |
| D-2 | AI 交互 | **对话优先**（非消灭表单）：槽位填充→确认卡（唯一"表单"：键值对只读+单槽内联编辑+确认/取消）→执行→实体卡回写→状态卡异步演进。确认分级：查询无确认/入库可撤销/下单必确认/支付二次确认/权限逐项勾选/批量列影响范围/简单过滤保留轻量控件 |
| D-3 | 市场页 | 板块门户（hero+计数行+典型产品卡+场景标签云，复用 KbHeroDock 场景卡栅格）+ 目录（搜索+四组筛选+计数行）+ 详情多 Tab（概览/Schema/样例/质量/血缘/授权条款，OpenMetadata+AWS DX 字段集）+ 下单走确认卡→order_create |
| D-4 | 连接器页 | 目录（Airbyte 四组筛选模式）+ 交付跟踪（连接/流两级六态枚举首版冻结、错误分色、运行历史趋势下钻，复用 StateDot/ui-workflow-run） |
| D-5 | 图谱页 | 力导向本体探索（sigma，Bloom 搜索短语模式：预定义图查询包装成自然语言短语+实体点击侧栏+逐跳展开）；血缘 DAG 后续按需（两种图不混做一个组件——DataHub/OpenMetadata 双 DAG vs Bloom 力导向的业界共识）；万节点硬上限内建 |
| D-6 | 样式 | 全部新页面只消费 `--dsw-alias-*` 语义令牌（docs/web-styling 宪法）；图谱节点类型色板提议为 ui-theme 新增静态刻度而非页面私有色；CSS Modules+clsx，禁组件库 |

### E. 既有 seams 演进映射（编排者综合 A/B/C 报告 + 仓库现状）

| 既有资产 | 处置 | 说明 |
|---|---|---|
| `packages/connector/connector-nocobase`（REST client） | **保留强化** | REST 五动作/Bearer/{data} 解包零改动；成为 apiproxy nocobase 域与 nb_* 工具、kg-build 取数的共享客户端底座（一 client 三消费） |
| `examples/kb-agent/scripts/setup-nocobase.mts` | **微改** | 仅 `NOCOBASE_HOME` 默认值从 `../nocobase-main` 改仓内 `platform/nocobase`；六命令/ensurePostgres/writeEnv 原样 |
| `docker-compose.nocobase.yml` | **确认不存在**（A 报告实证） | 无需改；官方 compose 模板在快照 `docker/app-postgres/` 备查 |
| orders 域 + expert-orders + expert-pdf | **保留复用** | 下单→审批→PDF 闭环已验证；数据资产下单 = 同一订单域的新 brief 类型（service_id 指向数据集商品） |
| apiproxy data 域 + DataRouter | **保留** | 上传统一入口；kg-build 增量感知其产物 |
| 湖仓三包 / kb 八包 | **保留** | 成为 KG 三源之二；kb-graph/kb-graph-sqlite 走 C-7 注册表化演进 |
| `tool-connector` 五工具 | **保留** | connector_discover/fetch/transfer/order_create/order_status 全部继续；资产市场页复用其数据面 |
| ui-kb | **保留扩展** | 门户/工作台/工具行不动；新四页是兄弟插件（ui-assets/ui-connectors/ui-kg/ui-business），market 下单复用其 OrderToolRow 模式 |
| kb_graph_query/kb_graph_add 工具 | **演进兼容** | Phase 3 后改读注册表（行为等价），kg_schema/kg_subgraph 为新增主面，kb_graph_query 保留兼容别名 |
| `research/2026-09-03.../nocobase.md` v1 结论 | **归档** | "路径 A 为主（REST 对接外部）"已被本计划取代；快照方式结论（A 报告）为现行权威 |

### F. 范围与分期

批次总表见 §四；详表（每批范围/文件/验收/验证策略）见 [03-batches.md](03-batches.md)。每批 = 一个 code 子任务规模，控制单批上下文。

---

## 四、批次总表（V1–V6）

| 批次 | 范围（一句话） | 依赖 | 核心交付物 | 对应研究 |
|---|---|---|---|---|
| V1 | NocoBase 源码并入 + 轨道仓内化 | 无 | `platform/nocobase/` 快照 + MANIFEST/NOTICE + 4 处门禁免疫 + setup 脚本仓内化 + 全门禁不红实证 | A |
| V2 | NocoBase 无头消费面：apiproxy nocobase typed 域 + agent 窄面业务工具 | V1 | `nocobase.listMeta/list/get` + `nb_list/nb_get/nb_create/nb_update` 工具 + 对话内 diff 确认模式 + mock/快照 | B |
| V3 | kg-graph 注册表化 + sqlite v2 | 无（可与 V2 并行） | 注册表 API（built-in 种子等价）+ 节点/边/别名/水位七表 + upsert/subgraph/expand/tombstone + putTriples 兼容 | C |
| V4 | kg-build 管线 + agent 图谱工具面 | V3 | 双路抽取 + 实体对齐 + 增量三通道 + `kg_schema`/`kg_subgraph` + 真实 NocoBase 全量建图实跑 | C |
| V5 | 页面第一波：数据资产市场 + 连接器 | V1（V2/V4 增强） | ui-assets（门户/目录/详情/下单）+ ui-connectors（目录/交付跟踪）+ assets/connectors BFF 域 | D |
| V6 | 页面第二波 + 辅助通道 + 收口 | V2/V4/V5 | ui-kg（sigma 子图浏览）+ ui-business（对话优先实体页）+ embed iframe 代签辅助 + MCP 通道评估 + 文档/演示全收口 | B/C/D |

---

## 五、风险清单（v2 新增；v1 遗留风险处置见 [02-batches.md §遗留](../connector-lakehouse-nocobase/02-batches.md)）

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| V-R1 | 复制时本机 NocoBase 实例在跑（storage 活跃 socket/密钥）；.env 含真实凭据 | 高 | 复制前 `setup-nocobase.mts stop`；rsync 排除清单强制（A 报告 §5.3）；绝不带入 storage/.env |
| V-R2 | 26.7k（排 docs 后 ~14.7k）文件入库对 git/lefthook 性能影响 | 中 | 首期排除 docs/；门禁免疫防扫描；如仍慢再评估 docs 永久外置 |
| V-R3 | License 解释分歧：9450 文件头残留 AGPL 文案 vs 正式 Apache-2.0+补充条款 | 中 | MANIFEST 显式记录"以正式许可文件为准"立场；保留全部头注释；对外 SaaS 前法务复核；dsh-* 发布包零 NocoBase 代码（publication-payload 拒绝规则） |
| V-R4 | `collections:listMeta` 是 plugin-data-source-main 内部端点，无公开稳定性承诺；NocoBase v3 在路上 | 中 | pin 2.2.6 快照；升级清单加端点冒烟三探针（listMeta/fields/触发器）；kg_source_runs 记录 run_config 可复现 |
| V-R5 | MiniMax 无 strict structured outputs 公开证据（闭集抽取格式保证） | 中 | 两级机制：prompt 约束 + 解码后 zod/注册表/方向校验 + 重试 1 次 + UNCLASSIFIED 降级桶 |
| V-R6 | 事件 CDC 不完备（bulkCreate 恒不触发、SQL 直改不触发）+ view collection 无 updatedAt | 中 | watermark 轮询主通道 + 周期对账兜底 + 逐 collection 判定 updatedAt 有无回退快照 diff（三通道架构即为此设计） |
| V-R7 | 实体对齐错合并污染下游 | 中 | 逻辑合并可逆（删 kg_aliases 行即回滚零边迁移）；灰区强制 LLM 终审留痕；新增/合并比值监控 |
| V-R8 | apiproxy 无用户级鉴权（config 白名单开关结构无用户承载点） | 中 | 短期共享服务账号 + NocoBase ACL 角色绑定；长期 idp-oauth per-user（B 报告遗留 #7）；V2 批登记决策而非实现 |
| V-R9 | 图谱首轮全量抽取 token 成本 | 低 | 结构化为主（NocoBase 直映射零 token）+ 增量水位 + 内容哈希跳过未变文档 |
| V-R10 | 大子图布局耗时（5k 节点自动布局 >15s 实测） | 低 | 按需加载使常规子图数百节点；万级偶发走后端预计算坐标+关持续模拟 |
| V-R11 | 市场页冷启动空目录（业界实证：空板块页真实存在） | 中 | 上线前种子数据集（张会长专家数据集 + 海关样例表 + 11 篇语料衍生）+ 人工撰写典型产品卡（D 报告反直觉 #3） |
| V-R12 | sigma.js @react-sigma 维护"稳定但低频" | 低 | API 面小且 React18 peer 明确；备选 react-force-graph-2d 随时可切（封装层隔离 sigma 依赖） |

---

## 六、开发注意事项（每批通用，v1 条款全部沿用）

- 服务端改动后重启 `dsh web` 长驻进程（BUG-4 模块图冻结契约）；`scripts/dev-web.ts` 与 `pnpm run build` 不并发。
- 全部注册走 `ctx.effect()`/`ctx.on()`；闭 union `assertNever`；request/spec split 显式 resolve；Config 可从 cordis.yml 覆盖；fail-loud。
- 新包 README 三件套 + `pnpm run doc-sync`；每非平凡批同 PR Agent Note。
- keyless 快照必须绿；with-key/with-NC e2e 无凭据自动跳过。
- 代理（外网需要时）：`export http_proxy=socks5://127.0.0.1:1087; export https_proxy=http://127.0.0.1:1087; export ALL_PROXY=socks5://127.0.0.1:1080`。
- NocoBase 侧任何源码修改必须登记 MANIFEST local-modifications（Apache §4(b) 义务），优先以补丁文件承载。
