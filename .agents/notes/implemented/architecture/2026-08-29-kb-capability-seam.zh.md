# Agent Note: 知识库能力缝（dsh-kb + dsh-kb-sqlite）

Status: implemented

[English](2026-08-29-kb-capability-seam.md) | 中文

## Problem

食品产业知识库产品需要对入库的走访纪要、企业档案、法规做 RAG，要求带编号引用与可离线检索。harness 此前没有知识库能力，且一个并行会话留下了构建残留（无源码的 `lib/` 编译产物），其 `.d.ts` 构成一份完整、符合仓库规范的 API 规格。完整计划与冻结规格见 [`plans/food-kb-agent-plan.md`](../../../../plans/food-kb-agent-plan.md) 与 [`plans/kb-frozen-spec.md`](../../../../plans/kb-frozen-spec.md)。

## Decision

按标准三角色缝构建，从冻结残留规格重建而非重新设计：

- **`@deepseek-ai/dsh-kb`**（Service Definition）—— `ctx.kb` 持 store/embed provider 注册表（fiber 作用域 disposer，冲突抛 `KB_DUPLICATE_PROVIDER`），执行时 store 选择为每种失败模式配专属错误码（`KB_STORE_CONFIGURED_MISSING` / `_UNAVAILABLE` / `KB_STORE_AMBIGUOUS` / `KB_STORE_UNAVAILABLE`），以及入库/检索/统计/删除编排：切片 → 向量化 → 存储，全文路径恒执行，向量路径追加第二排名，倒数排名融合合并。
- **`@deepseek-ai/dsh-kb-sqlite`**（Store Provider）—— 单个 `node:sqlite` 数据库，FTS5 `trigram` 全文索引配引号字面量 MATCH 表达式（查询语法无法注入）与低于三个 Unicode 码点时的 LIKE 回退，embedding 以原始 `Float32Array` BLOB 存储并在 JS 侧余弦排名，事务化覆盖语义的 `putDocument`，单调 `SCHEMA_VERSION = 1` 加保留应用 id，在组合加载时拒绝外来盘上数据库。

降级语义按成因切分：结构性缺失 embed provider（从未配置，或注册/配置但不可用）使检索降级为纯文本，`mode: 'text'` 可观测且每次转换记一条日志；运行时 embed 失败抛 `KbError` `KB_EMBED_FAILED`，provider 失败链在 `cause`。降级是配置状态，绝不是被吞掉的故障。

`tenantId` 是每条检索路径与计数上的硬隔离键；`(tenantId, sourcePath)` 是文档的引用与覆盖身份。不新增 `SessionEventMap` 成员：检索只经工具消费者的 tool result 到达模型，session log 已记录该结果。

## Alternatives considered

- **sqlite-vec 或其他原生向量扩展** —— 需要按平台（macOS/Linux/Windows+wine CI）分发 `loadExtension` 二进制；MVP 语料规模（<10 万切片）下 JS 余弦扫描足够。作为文档化的升级路径推迟。
- **独立向量数据库** —— 运维负担高于仓库会话持久化已在用的单文件 SQLite；缝的 `KbStore` 契约保留日后替换可能。
- **运行时 embed 故障静默回退纯文本** —— 拒绝：向量化过程中的网络故障是调用方必须看到的错误而非模式；与配置降级混同会把 provider 故障藏在"看似合理但未向量化"的结果后面。

## Consequences

- Embed provider（DashScope、MiniMax）与模型可见工具套件（`kb_search` / `kb_ingest` / `kb_stats`）是缝上的下一批包；其契约已冻结在残留规格中。
- 向量检索成本随带向量切片数线性增长；无法接受的 store 自担索引。
- 切片器 Markdown 优先（标题链、表格行完整、中文感知分隔符、尾部重叠）；其他格式需要上游解析 provider。
- 按冻结 `.d.ts` 重建使残留 API 面逐字保留；偏差仅限内部防护（embed 向量数校验）与测试工效。

## Verification

- `pnpm vitest run packages/kb` —— 两包 95 个测试（注册表、store 选择全部六规则、embed 两条降级路径、RRF 融合、切片器结构、SQLite 往返、覆盖与删除级联、schema 版本拒绝、事务中途失败回滚、关闭后拒绝使用）。
- `pnpm vitest run packages/kb --coverage.enabled --coverage.include='packages/kb/*/src/**'` —— 逐文件 100%（CI 门形态）。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run build` —— 绿。
