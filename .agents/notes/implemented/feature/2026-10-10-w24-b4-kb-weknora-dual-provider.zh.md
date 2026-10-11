# Agent Note: W24-B4 WeKnora 双 provider 知识库——官方插件审计后自建 seam 适配层

Status: implemented

[English](2026-10-10-w24-b4-kb-weknora-dual-provider.md) | 中文

## 问题

W24 五源重构把 WeKnora（腾讯，MIT，v0.8.2 docker sidecar）定为知识库 seam 的主检索引擎，既有 `kb-sqlite` 存储保留为 fallback。集成路径有两条：官方 npm 插件 `@wxg-prc-cpg/dsh-weknora` v0.1.0（npm 已验证存在，MIT，零运行时依赖）或自建适配层。取舍必须按仓库插件规则裁决而非便利：`ctx.effect()` 注册、Config 字段化（而非仅 env 插值）、以及 kb seam 的 provider 注册表是工具面的硬依赖——`kb_search` 路由、租户隔离、`[n]` 引用协议与降级链全部骑在 `ctx.kb` 上，而不是一条平行工具行。

## 决策

### 官方插件未过 seam 审计；适配层自建

tarball 审计（`npm pack` 后审 dist）发现 `apply()` 以裸 `ctx.tools.register()` 注册四工具（`weknora_list_knowledge_bases` / `weknora_search` / `weknora_read_document` / `weknora_ask`）——无 `ctx.effect()` 处置、无 `ctx.kb` store 注册、配置仅经 `WEKNORA_*` env 插值。作为独立工具行可用，但无法承载 `storeProvider: 'weknora'`、fallback 契约与 seam 的选择语义。按 B4 决策树，集成落地为 `packages/kb/kb-weknora`（三文件 seam 适配层：REST client + `WeknoraKbStore` + 插件 apply），MIT 兼容地从审计过的 wire 契约复刻行为，不抄插件代码。

### 映射模型：分类知识库、标题编码身份

每个 `(租户, 分类)` 一个 WeKnora 知识库——分类取 source path 首个 `/` 段——首次入库幂等创建，语料组织因此直接呈现为 WeKnora 知识库列表，`tenantId` 过滤映射为 `tenant/…` 名称前缀扫描。文档身份经手工条目标题 `[docKind] sourcePath` 往返；WeKnora 的字符串 id 经 FNV-1a 哈希为 seam 的数字 chunk/doc id，两路检索（文本路 knowledge-search、向量路逐 KB hybrid-search 带 `query_embedding`——与 seam embed provider 计算的、WeKnora 内置模型存储的 MiniMax embo-01 向量同源）在 seam 的 RRF 融合中不变形。

### 降级契约：传输故障与拒绝分流，notice 全链上浮

故障（传输失败或 HTTP 5xx）以 `KB_WEKNORA_UNAVAILABLE` 响亮失败，除非同时配置 `allowFallback: true` 与 `fallbackPath`——`allowFallback` 缺路径在组合加载时失败，正是 seam 拒绝的静默降级误配置。被拒绝的请求（4xx——凭据错误、知识库越权）永不降级：fallback 会掩盖配置错误。内嵌 sqlite fallback 服务时每条命中携带 `notice`，seam 把它提升到 `KbSearchResult.notice`，`kb_search` 渲染降级检索行，工作台显示提示条——可观测链是一个可选字段穿透四个包，而非新事件或新模式。

### 语料与基准

46 篇存量语料从 `kb.sqlite` chunks 重建（`workspace/data/` 源文件已删，store 留有完整 chunk 文本）归入三大类：business-ops（29）、food-compliance（15）、system-guide（13，用真实 `docs/*.zh.md` 系统文档补齐）——57 篇对照 ≥30 篇/三分类门槛。自建基准 20 对 QA（业务 8、合规 8、系统 4），以 source path 精确匹配在 hit@1/hit@3 上计分，走 store 同款的 knowledge-search 端点。实测 hit@1 = 80%（16/20）、hit@3 = 90%（18/20）——超过 80% 门槛；match_count=10 复跑两项数字不变，两条 miss 属 gold 内容语义（生成式目录文档、近邻参观纪要）而非检索深度。

## 备选方案

- **官方插件与 seam 并装**：否决——两套检索工具行（kb_search 与 weknora_search）无共享 provider 选择、无 fallback 契约，且注册在卸载时泄漏。
- **kb-sqlite 保持主位、WeKnora 仅经其 MCP server 使用**：B4 否决——seam 的引用协议与租户绑定经 MCP 跳转无法存活，且 fallback 主次颠倒（有 rerank + ParadeDB 混合召回的 WeKnora 应为主）。
- **经 WeKnora 原生 provider 注册直连 MiniMax 嵌入**：受阻——WeKnora 的 minimax provider 只覆盖 KnowledgeQA/ASR，嵌入侧无论如何都需要 OpenAI 线协议代理。

## 后果

- `KbSearchHit.notice` / `KbSearchResult.notice` 是 seam 可选字段；store 可标注命中，seam 提升首条。工具与工作台渲染器按信息性提示处理，不当错误。
- `kb-sqlite` 导出 `openSqliteKbStore`（告警过滤的 node:sqlite loader 收敛到 `open.ts` 一处）；weknora fallback 与未来任何内嵌存储消费者复用它，不再复制 loader 对称段。
- weknora store 绑定租户：无租户过滤的 seam 检索与统计以 `KB_WEKNORA_TENANT_REQUIRED` 失败，因为作用域 API key 无法跨空间。`stats` 只报文档数（WeKnora 异步分块且无按租户 chunk 总数接口）；用量计量为空操作——WeKnora 在自己的审计面计量。
- `collectedAt` 与 provenance 不进标题编码；命中结果不带这两项（已记入文档限制）。
- 部署位于 `workspace/weknora/`（gitignored）：v0.8.2 compose + `builtin_models.yaml`（MiniMax-M3 chat + embo-01 embedding）；镜像经 CN 镜像加速（daocloud/1ms）拉取后回退原 tag；端口 18080（UI）/18081（API）；`JWT_SECRET`/`SYSTEM_AES_KEY` 每次安装生成；colima VM 家目录整体迁移至 /Volumes/ssd 并以软链回原路径（宿主盘约束）。MiniMax `/embeddings` 只说原生 `{model, texts, type}` 而 WeKnora 说 OpenAI 线协议——宿主上的 `embed-proxy.mjs`（:18082，`SSRF_WHITELIST_EXTRA` 加白 `host.docker.internal`）负责适配；超过 WeKnora manual 20 万字符上限的文档按 `path#N` 分段落库（decodeTitle 剥后缀）；manual 条目以 `status: "publish"` 创建——draft 默认态永不进入异步分块/嵌入管线。
- 降级双向实测：停掉 sidecar 后，web 组合的 `kb.search` 由 sqlite fallback 应答并携带提示（"WeKnora is unreachable; results come from the local fallback store"，hybrid 8 命中）；无 fallback 的直连客户端则以传输层 `WeknoraApiError` 响亮失败。
- kb-agent 示例的存量失败（connector-flow/data-routing 快照引用已退役的 `lakehouse_query`/`lakehouse_tables` 工具名、kb-presets 行激活）早于 B4——stash 掉本批 patch 改动后复跑同样失败，属 B2/B3 遗留债，不在本批范围。
