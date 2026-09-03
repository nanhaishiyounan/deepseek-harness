# @deepseek-ai/dsh-kb-sqlite

[English](README.md) | 中文

知识库缝的 SQLite store provider：单个 `node:sqlite` 数据库，FTS5 trigram 全文索引加 JS 侧扫描的 BLOB 向量，加载时注册到 `ctx.kb`。

## 存储模型

Schema 2 包含四个结构：`documents`（身份 `UNIQUE (tenant_id, source_path)`，引用元数据）、`chunks`（`UNIQUE (doc_id, chunk_idx)`，`embedding BLOB` 存原始小端 `Float32Array` 字节）、`trigram` 分词器的 `chunks_fts` FTS5 虚拟表、以及 `usage_counters`（每租户一行，为 seam 的用量计量做原子 upsert 累加）。每条语句与固定 PRAGMA 都在打包的 `.sql` 资源中；取值走 SQLite 参数，运行时代码绝不拼接查询文本。

全新数据库在一个 `BEGIN IMMEDIATE` 事务内初始化，同时落 `user_version = 2` 与保留的应用 id（`"DSHK"`）。任何其他盘上版本（更旧或更新）、外来应用标识、或已拥有表的无版本数据库都会拒绝；本 pre-release provider 不提供迁移。连接建立时应用 `trusted_schema = OFF`、`foreign_keys = ON`、`synchronous = FULL`，文件路径启用 WAL 日志。

## 检索

`textSearch` 用修剪后的查询构造 FTS5 MATCH 表达式：引号短语字面量以 OR 连接（内部引号翻倍，查询语法无法注入）。短段落保持单个短语；长的自然语言段落切为重叠的四字符滑动窗口短语——FTS5 短语要求整串连续出现，完整问句即使每个词都在文中也无法命中散文。没有任何段落达到一个 trigram（三个 Unicode 码点）的查询回退到转义后的 `LIKE` 扫描。`vectorSearch` 载入全部带向量的候选行，跳过维度与查询不符的存储向量，其余按余弦相似度排名（平局按 chunk id 升序），再取 top-k 的引用元数据。零向量没有有限方向，跳过。

`putDocument` 事务化覆盖：已存在 `(tenantId, sourcePath)` 文档先删 FTS 行，再删文档行（级联 chunks），然后插入新行。事务中途失败回滚并保留旧文档。

## 配置（schemastery）

```ts
interface Config {
  path: string             // database path (":memory:" supported); relative resolves against cwd
  busyTimeoutMs?: number   // wait for another connection's lock; default 5,000 ms
}
```

打开是急切的：不可写路径或外来盘上 schema 在组合加载时失败，而不是首次工具调用时。插件 dispose 时注销 store 并关闭独占连接（幂等）。

## Model Experience

Indirectly, through the kb tool suite: this store registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of stored and retrieved content.

#### KV Cache effect

Independent of the model request stream: storage and retrieval produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- **每 store 实例单连接** —— 并发写者经 SQLite 锁与配置的 busy timeout 竞争；不提供连接池。
- **线性 JS 余弦扫描** —— 每次向量检索载入全部带向量候选；MVP 语料规模下可接受，原生向量索引（如 sqlite-vec）是文档化的升级路径。
- **Trigram 最小长度** —— 低于三个 Unicode 码点的查询走 LIKE 回退，无索引支持地扫描 chunk 内容。
