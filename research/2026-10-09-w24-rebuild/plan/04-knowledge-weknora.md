# 分域计划 04｜WeKnora 知识库（B4）

- Spec 溯源：主计划 §1.1 指令 4/6 + §3 选型表；[`r2b-kb-graph-ontology/sections/01-WeKnora深度解剖.md`](../../r2b-kb-graph-ontology/sections/01-WeKnora深度解剖.md:1) + [`sections/02-知识库对照系与库嵌入路线.md`](../../r2b-kb-graph-ontology/sections/02-知识库对照系与库嵌入路线.md:1) + [`sections/07-W24整合方案草案.md`](../../r2b-kb-graph-ontology/sections/07-W24整合方案草案.md:1)
- 架构决策：WeKnora v0.8.2（MIT）docker sidecar 为主 RAG 引擎；现有 kb-sqlite 缝保留为轻量 fallback provider（双 provider 注册——kb seam 本就是 provider 注册表形态，不算冗余；kb-sqlite 零依赖冷启动与 120 题 98.3% 基线资产不弃）。

## 现状基线（R3 §4.1）

- kb seam：chunker 结构感知切分 / RRF 融合 / 混合检索（[`packages/kb/kb`](../../../packages/kb/kb)）
- kb-sqlite：FTS5 trigram + BLOB 向量扫描；kb-embed-minimax（embo-01 1536 维）+ dashscope 双嵌入
- 工具行：tool-kb 的 ingest/ingest-url/search（[n] 引用）/stats + kg 系列
- 语料：46 篇 / 14 目录（kb-corpus.yml 单一真源）+ 120 题评测 98.3%

## WeKnora 接入

### 决策树（B4 内执行）

1. `npm view @wxg-prc-cpg/dsh-weknora`（官方 dsh 插件 v0.1.0，R2b 已验证存在）→ 审查源码：ctx.effect 注册？Config 字段化？SessionEventMap 落日志？seam 三件套？
2. 合格 → fork-patch 方式引入仓（MIT 允许）为 `packages/kb/weknora`（更名 dsh-weknora 对齐命名）；不合格 → 按 WeKnora REST/MCP 双通道自写同位置包
3. 无论哪条路：接入面 = `packages/kb/weknora`，向 kb seam 注册 provider

### 部署

- docker-compose（compose profile `kb`）：WeKnora v0.8.2 全套（8GB 起，macOS 多架构镜像）；端口独立段分配；与 Neo4j（B5）预留 GraphRAG 组件联动配置
- 配置：WeKnora 嵌入模型对齐现有 MINIMAX_API_KEY（embo-01）通道，中文检索原生

### Interfaces

```ts
// Consumes：kb seam 的 provider 注册表（packages/kb/kb）；WeKnora REST（session/知识库/文档/检索四组端点）
// Produces：
//   ctx.kb provider 'weknora'：search（混合检索+RRF+rerank，返回 chunk 溯源）/ ingest（md/txt/pdf/docx/url）
//   tool-kb 工具行路由：kb_search 主路由 weknora，fallback kb-sqlite（WeKnora 不可用降级，fails-loud 可观测）
//   SessionEventMap：检索往返（query/hits/chunk refs）落事件——模型可见⟺落日志
// Config：weknoraUrl / weknoraTenant / embedProvider / fallbackEnabled / topK / rerankEnabled
```

### 语料工程

- 迁移：46 篇既有语料（kb-corpus.yml 清单驱动）经 WeKnora ingest API 灌入；chunk 溯源对齐 [n] 引用协议
- 增补：食品制造业新语料（W6 合规四件套 / HACCP 体系文件 / 国标节选 / 供应商资质模板）——目标 ≥80 篇、覆盖 8 业务域各 ≥5 篇
- 知识库分层：业务规则库 / 行业标准库 / 企业文档库三 tenant 分区

### 自建中文基准（R2b 行动项）

- 沿用 eval/questions.json 120 题模式，新增 WeKnora 面向 60 题（检索/多跳/中文长尾）
- 达标线：混合 Top5 ≥ kb-sqlite 基线（98.3%）的 95% 或绝对值 ≥90%（以实测为准记录，不达标注明差距与改进项，不静默放水）

## 实施步骤

- [ ] docker-compose 起 WeKnora + 健康检查 + 端口/profile 登记
- [ ] 官方插件审查（决策树）→ 引入或自写 packages/kb/weknora
- [ ] kb seam 双 provider 注册 + 工具行路由 + 降级链
- [ ] 语料迁移脚本（kb-corpus.yml 驱动，幂等）+ 新语料增补
- [ ] GraphRAG→Neo4j 组件预启（为 B5 铺路：WeKnora GraphRAG 配置面打通，实体抽取通道就绪）
- [ ] 自建基准构建 + 实测记录
- [ ] Agent Note + doc-sync + lefthook

## 验收标准（R4 验证轮）

1. 会话 kb_search 真实路由 WeKnora（transcript：query→hits→[n] 引用→chunk 溯源可点开）
2. 停 WeKnora 容器 → kb_search 降级 kb-sqlite 可观测（事件记录降级原因），恢复后自动回主路由
3. 语料计数对账（46 旧 + 新增 N = WeKnora 文档列表计数）
4. 基准实测数据落盘（含与基线对比结论）
5. GraphRAG 组件可启用证据（配置面 + 一次实体抽取试跑）

## 风险

| 风险 | 缓解 |
|---|---|
| R-6 官方插件质量 | 决策树两分支；自写工作量 +30% 已预算 |
| 8GB 内存常驻 | compose profile 按需启停；开发态可离线用 kb-sqlite |
| 中文社区实践≈0（无第三方横评） | 自建基准是硬判据，不依赖口碑 |
| 语料版权 | 沿用既有语料合规边界（企业演示用途），新增语料优先公开标准节选 |
