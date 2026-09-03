# Agent Note：kb seam 的每租户用量计量

Status: implemented

[English](2026-08-30-kb-usage-metering.md) | 中文

## 问题

食品行业知识库产品的订阅层按用量计价（问答/分析/报告积分制），P1 需要每租户用量计数作为基础设施——只做可观测计数，不做计费、限额或 UI（[`plans/food-kb-agent-plan.md`](../../../../plans/food-kb-agent-plan.md)，P1-5）。P0 完全没有用量记录。

## 决策

计数落在 kb store，经能力缝三角色各归其位：

- **`KbStore` 新增 `recordUsage(tenantId, delta)` 与 `usage(tenantId)`** —— store 拥有持久化，因此每个 store 实现（及每个测试替身）都携带计数。`KbUsage` 统计 `searches`、`ingestedDocuments`、`ingestedChunks`、`embedTexts`、`embedTokens`。
- **kb-sqlite 用 `usage_counters` 表持久化**（每租户一行）并把 `SCHEMA_VERSION` 从 1 升到 2——pre-release 立场：旧库直接拒绝，无迁移垫片。增量是 `BEGIN IMMEDIATE` 内单条 `INSERT … ON CONFLICT(tenant_id) DO UPDATE SET x = x + excluded.x`，并发写在写锁上串行化，不丢增量。
- **seam 只在成功路径计数**：ingest 记一篇文档、其切片数与已嵌入文本数（降级模式为零）；search 记一次检索加 hybrid 模式的查询嵌入文本。失败操作不计数。`ctx.kb.usage(tenantId)` 读租户计数；无行的租户读作全零。
- **计数写失败绝不连累数据操作**：seam 的 `meter()` 记一条警告即返回。计量是观测面；ingest 或 search 已经成功，为修计数重跑会双计数据面。该 catch 只吞 store 的 `recordUsage` 拒绝。
- **`kb_stats` 汇报计数**——canonical value 里的 `usage` 对象与模型可见文本里的累计用量句——一个读取面，不另做计量工具。

`embedTokens` 保留为零值占位：MiniMax 原生 wire 只返回向量（未解码 usage 块），在 provider 上报 token 用量之前按条数计量——即计划的"provider 无 usage 则按条数"。

## 备选方案

- **独立 metering 包自带存储** —— 拒绝：计数与知识库同生命周期（同库、同备份、同租户维度）；第二个持久化面只增部署负担而无第二个消费方。
- **在 `putDocument` 事务内计数** —— 拒绝：会让存储方法膨胀进计量语义，且 search 计数仍需独立路径；seam 是唯一知道"一次操作完成"的点。
- **计量失败时让数据操作失败** —— 拒绝：丢计数是可恢复的观测损失，丢入库不是；警告日志让损失可见。

## 后果

- 每个 `KbStore` 实现必须实现这两个方法；runtime 测试替身记录调用以便精确断言。
- 重摄入替换会再次计数（每次完成的 ingest 是一次用量事件）；限额消费方以后自定去重策略。
- P0 构建写的库（schema version 1）打开即拒——文档化的 pre-release 兼容立场。

## 验证

- `packages/kb/kb-sqlite/tests/usage.spec.ts` —— upsert 累加、未知租户零值读、租户行隔离、双连接 2×25 并发增量不丢、schema 版本降级拒绝、新 schema 含该表。
- `packages/kb/kb/tests/runtime.spec.ts`（`usage metering`）—— hybrid/降级 ingest、hybrid/text search 的精确 delta、失败 search 不计数、计量写失败时 ingest 存活、seam `usage()` 读取。
- 真实 key 冒烟（`examples/kb-agent/scripts/real-key-smoke.mts`）：2 次入库 + 1 次 URL 入库 + 2 次检索后，`kb_stats` 报 `2 searches, 3 documents ingested (4 chunks), 6 embed texts`——4 次入库嵌入加 2 次查询嵌入，分毫不差。
