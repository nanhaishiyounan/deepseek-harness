# kb-agent 快速上手（W24 五源架构版）

## 这是什么

一个跑在 DSH Web 工作台上的食品产业知识 agent 组合，背后是五个 LLM 数据源（W24「完完全全的重构」定型）：

| 源 | 载体 | 会话工具 |
|---|---|---|
| ① 湖仓 | DuckDB + DuckLake（进程内引擎，`workspace/lakehouse/`） | `lakehouse_list_tables` / `lakehouse_schema` / `lakehouse_query` |
| ② 业务系统 | carbon ERP dev 栈（ERP/MES/QMS，PostgREST Data API） | `cb_collections` / `cb_list` / `cb_get` / `cb_create` / `cb_update` |
| ③ 知识库 | WeKnora sidecar（主检索）+ kb-sqlite（降级 fallback） | `kb_search` / `kb_ingest` / `kb_stats` |
| ④ 图谱 | Neo4j 5.26（容器 `dsh-neo4j`） | `kg_graph_query` |
| ⑤ 本体 | registry v5 + JSON-LD/SHACL（LLM 自动生成管线） | `kg_ontology` |

会话与轨迹是工作台 tab，知识库/湖仓/连接器/图谱/业务/治理/移动预览全部在左侧边栏（豆包式主导航）。

## 一次性准备

```sh
# 1. Node 22.19.0（nvm；其他版本会在启动时报 node:sqlite 等内置模块缺失）
# 2. 安装依赖（pnpm workspaces）
pnpm install
# 3. 在仓库根目录创建 .env（已配置过的跳过）；key 于 MiniMax 开放平台申请：https://platform.minimaxi.com/
#    MINIMAX_API_KEY=...（对话与向量化共用；无 key 时检索仍可用，走 sqlite fallback）
```

## 五源服务启动（冷启动序列）

docker 运行时先起（本机为 colima；volume 已在 `/Volumes/ssd/colima`）：

```sh
colima start
```

五个 sidecar 各自幂等，顺序不敏感（dsh web 最后起）：

```sh
# ② carbon dev 栈：ERP UI :3000 / PostgREST :54321 / PostgreSQL :51538 / Mail :51541 / Inngest :51542
(cd /Users/mac/Downloads/carbon-main && bash packages/dev/bin/crbn up --no-portless)
#    初始账号 test@carbon.ms（dev 栈 magic-link 登录；PG 密码 postgres）

# ③ WeKnora：UI :18080 / API :18081 / embed-proxy :18082
bash workspace/weknora/up.sh up
#    健康检查 curl http://localhost:18081/health；租户 demo-food-co，scoped API key 在根 .env 的 WEKNORA_API_KEY

# ④⑤ Neo4j（图谱+本体物化）：HTTP :7474 / bolt :7687
docker start dsh-neo4j
#    首次创建：docker run -d --name dsh-neo4j -p 7474:7474 -p 7687:7687 \
#      -e NEO4J_AUTH=neo4j/neo4j-b5-graph \
#      -e NEO4J_server_memory_heap_max__size=1G -e NEO4J_server_memory_pagecache_size=512M \
#      -v dsh-neo4j-data:/data neo4j:5.26-community

# ①湖仓 Tier1（Gravitino :8090 + SeaweedFS S3 :9000 / 控制台 :9001）
(cd workspace/governance && docker compose up -d)
```

最后起工作台（源码直跑；客户端产物已随 `pnpm run build` 就绪）。carbon 与 Neo4j 的凭据走 **launching 环境变量**（app-boot 禁止 `DSH_*` 键写入 `.env`；`CARBON_*` 直读 `process.env`，也要 export）：

```sh
env CARBON_URL=http://127.0.0.1:54321 CARBON_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODE4OTUsImV4cCI6MjEwNjk0MTg5NX0.42nhGia5GsXBtJiW9aP12HCVwOoBmqwiZ3QZ060OU5o CARBON_EMAIL=test@carbon.ms CARBON_PASSWORD=password \
  DSH_NEO4J_URL=neo4j://localhost:7687 DSH_NEO4J_USER=neo4j DSH_NEO4J_PASSWORD=neo4j-b5-graph \
  DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml
# 输出 dsh web: http://127.0.0.1:3080 并自动开浏览器；--no-open 跳过
# 缺这些变量时 cb_* 与 kg_* 工具以结构化拒绝回答（kb/湖仓/MINIMAX 走根 .env 即可）
```

端口与凭据速查：

| 服务 | 端口 | 凭据/来源 |
|---|---|---|
| DSH Web | 3080 | 无鉴权，仅本机 |
| carbon ERP | 3000 / 54321 / 51538 | test@carbon.ms；PG supabase_admin/postgres |
| WeKnora | 18080 / 18081（health） | .env WEKNORA_API_KEY（租户 demo-food-co） |
| Neo4j | 7474 / 7687 | neo4j / neo4j-b5-graph |
| Gravitino | 8090（UI）/ 8181 | metalake `dsh` |
| SeaweedFS | 9000（S3）/ 9001（控制台） | compose 内置 |

湖仓业务同步（carbon PG → DuckLake）：gateway 配置 `DSH_LAKEHOUSE_SYNC_DSN`（默认指 carbon PG :51538）；老业务数据在 `legacy_nocobase` schema（138 表，B0 全量导出冻结，永久可查）。

## 5 分钟跑通（无 sidecar 也能跑的 kb 面）

```sh
# 入库示例语料（六篇脱敏文档）
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "用 kb_ingest 逐篇入库这六篇文档：examples/kb-agent/workspace/data/meetings/2026-08-20-supplier-visit-hongfa.md 与 examples/kb-agent/workspace/data/meetings/2026-08-27-project-kickoff.md（doc_kind 取 meeting）、examples/kb-agent/workspace/data/profiles/hongfa-food.md 与 examples/kb-agent/workspace/data/profiles/lvyuan-ingredients.md（doc_kind 取 profile）、examples/kb-agent/workspace/data/regulations/gb2760-excerpt.md 与 examples/kb-agent/workspace/data/regulations/gb14881-excerpt.md（doc_kind 取 regulation），完成后用 kb_stats 报告覆盖情况"

# 提一个问题（预期 [n] 引用 GB 2760 摘录/走访纪要/企业档案）
DSH_HOME=examples/kb-agent/.dsh pnpm dsh --profile headless --patch examples/kb-agent/cordis.patch.yml "调味品企业的食品添加剂合规要点是什么？"
```

## 五源会话示例

工作台「对话」页选 enterprise-data-assistant 预设，示例问题：

- 湖仓：`帮我查湖仓 legacy_nocobase 里 so_order_lines 一共有多少行，qty 总和是多少`
- 业务：`carbon 里客户 NovaSat 的销售订单有哪些？物料明细？`（cb_* 工具行 + companyId 租户注入）
- 知识库：`食品原料收货检验的 HACCP 要求有哪些？`（WeKnora 检索，[n] 引用 + chunk 溯源）
- 图谱：`NovaSat 在图谱里关联了哪些实体？`（kg_graph_query）
- 本体：`当前物料/订单域的本体 schema 是什么？`（kg_ontology）

五源串联（W24-B7 联合验收原题）见 `research/2026-10-09-w24-rebuild/b7-final/`。

## 导入我自己的资料

**浏览器上传（推荐）**：工作台「知识库」页 → 文档区「添加文档」→ 上传 .md/.txt/.pdf/.docx（单文件 ≤64 MiB，同名重传即替换）；csv/xlsx/json 自动进数据湖成为可查询表。

**网页**：向导「网页链接」页签粘贴 URL，或 `kb_ingest_url`。

**服务器文件**：`bash examples/kb-agent/scripts/import-real-docs.sh /path/to/文件 /path/to/目录/ --kind meetings|profiles|regulations` 后按确切路径 `kb_ingest`。私网/内网地址默认拒绝。真实纪要先脱敏再入库。

## 专家数据集与市场页

市场页（侧边栏「市场」）陈列 `workspace/data/` 真源资产：专家画像（experts/dataset.json，漯河张红喜会长·食品出海方向）、知识资产（中亚市场准入指南、海外仓风险手册）、配套出海风险语料（`workspace/data/export-risk/` 11 篇）。会话可 `connector_discover` 拿到专家卡；订单下单链已随 NocoBase 退役（W24-B7）。

## 常见故障

- **`pnpm run clean` 后 web 白屏/报 `dsh-client-modules/client.js` 未预载**：必须重跑 `pnpm run build:lib:client`（44 bundle 产物契约，QUICKSTART 历史教训，详见 `.agents/notes/` build-lib-client 相关 Note）。
- **改了 client 包后 :3080 不生效**：client 产物按构建产物伺服——重跑 `pnpm run build:lib:client && cd apps/web && npx vite build`；dev server 模块图冻结坑见 `.agents/notes/`（BUG-4 系列）。
- **WeKnora 检索返回 sqlite fallback 提示条**：sidecar 没起或 embed-proxy :18082 挂了——`bash workspace/weknora/up.sh status` 与 health 检查；内存预算 8G 起。
- **carbon 域全部 `carbon-not-composed` 拒绝**：carbonEnabled 未开或 dev 栈不在——`curl http://127.0.0.1:54321` 探 PostgREST。
- **kg 查询空图谱**：`docker start dsh-neo4j`；Neo4j 认证错误会 fail loud（连接拒绝）。
- **端口冲突**：3000/54321/51538（carbon）、18080-18082（WeKnora）、7474/7687（Neo4j）、8090/9000/9001（治理）、3080（web）——本机其他栈先停。
- **macOS 内存压力**：五 sidecar 峰值约 20G——按需启停（demo 全启 / 开发按源启）。

## 历史与证据

W24 各批证据与交付记录：`research/2026-10-09-w24-rebuild/`（B0 闸门/B1 侧边栏/B2 湖仓/B3 carbon/B4 WeKnora/B5 本体图谱/B6 治理/B7 退役收尾=本批）；W6~W23 制造业全链历史轮次见 `research/` 同级目录与 `.agents/notes/`。
