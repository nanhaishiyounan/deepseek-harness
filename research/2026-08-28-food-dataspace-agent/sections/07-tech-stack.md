# 第 7 章 MVP 技术选型：向量检索与 Embedding（维度 E）

## 7.1 sqlite-vec：能力与限制

**【实证】**来源：https://github.com/asg017/sqlite-vec

- 纯 C、零依赖的 SQLite 扩展；`vec0` 虚拟表存 float/int8/binary 向量；支持 metadata、auxiliary 列（`+content TEXT`）、partition key
- KNN 查询语法：`WHERE embedding MATCH ? ORDER BY distance LIMIT k`
- pre-v1（v0.1.x）有 breaking change 风险
- **核心限制：只做暴力精确扫描，无 ANN 索引**——几十万向量内"够快"，1M+ 或高维时线性扫描到秒级；v0.1.10-alpha.4 正在落地 rescore/IVF/DiskANN
- 维护状态健康：Mozilla Builders 主赞助 + Fly.io/Turso/SQLite Cloud
- **官方生态信号**：作者 Alex Garcia 已进 SQLite 官方生态——sqlite.org 官方托管 Vec1 扩展（v0.7，IVFADC+OPQ，AVX2/NEON）：https://sqlite.org/vec1 ——证明 SQLite 向量路线是官方方向

### Node.js 绑定两条路【实证，官方 examples】

1. better-sqlite3：`sqliteVec.load(db)` 后直接用 `Float32Array` 传参
2. node:sqlite：需 Node ≥23.5.0 且 `{ allowExtension: true }`，BLOB 需包成 `new Uint8Array(new Float32Array(v).buffer)`

## 7.2 与专用向量库的临界规模对比

**【实证】**benchmark 数据：

| 方案 | 100K×768 维延迟 | 召回 | 来源 |
|---|---|---|---|
| Qdrant (HNSW) | 1.2ms | <1.0 | vucense.com/dev-corner/vector-databases-comparison-2026/ |
| pgvector (HNSW) | 3.1ms | <1.0 | 同上 |
| Chroma | 8.4ms | <1.0 | 同上 |
| **sqlite-vec（暴力扫描）** | **13.4ms** | **1.000（精确）** | stffns.github.io/snapvec/benchmarks/ |

**临界规模结论【实证+推断】**：<10 万切片（我方 MVP）在 sqlite-vec 舒适区——延迟十几毫秒级、召回 100%、零额外服务；>50 万~1M 或需要 P99/高并发时再迁 Qdrant/pgvector。

**【矛盾·已表征】**Tiger Data 称 pgvectorscale 吞吐 11 倍于 Qdrant，与 Qdrant 官方 benchmark 相反——双方都有利益立场；对 <10 万向量规模无影响。

## 7.3 BGE-M3 规格

**【实证】**来源：https://huggingface.co/BAAI/bge-m3

- 维度 1024；上下文 8192 token；100+ 语言；MIT 许可；查询无需加 instruction
- **三种检索模式**：dense（单向量）、sparse（lexical weights，类 BM25）、multi-vector（ColBERT）；官方推荐混合检索+rerank

## 7.4 调用方式与价格

### 7.4.1 本地（ollama）【实证】

`ollama pull bge-m3`（1.2GB，567m 参数，6.2M 下载，8K 上下文）；OpenAI SDK 指向 `http://localhost:11434/v1/` 即可用。来源：https://ollama.com/library/bge-m3

### 7.4.2 API 价格对比【实证】

| 服务商 | 端点 | 模型 | 价格（元/百万 token） | 备注 |
|---|---|---|---|---|
| 硅基流动 | api.siliconflow.com/v1/embeddings（OpenAI 全兼容） | BAAI/bge-m3 | **免费**；Pro ¥0.07 | 8192 token 上限 |
| 硅基流动 | 同上 | bge-reranker-v2-m3 | 免费；Pro ¥0.07 | 重排可配套 |
| 智谱 | open.bigmodel.cn/api/paas/v4/embeddings | embedding-3 | ¥0.5 | 256-2048 维可调，单条 3072 token×64 条 |
| Jina | jina.ai | jina-embeddings-v4 | ~$10（第三方聚合价） | 3.8B 多模态 |

来源：https://siliconflow.cn/pricing 、https://docs.siliconflow.com/cn/api-reference/embeddings/create-embeddings 、https://docs.bigmodel.cn/cn/guide/models/embedding/embedding-3

## 7.5 MVP 代码样例（可直接复用）

### 7.5.1 sqlite-vec 建表+写入+KNN（better-sqlite3）

```js
import * as sqliteVec from "sqlite-vec";
import Database from "better-sqlite3";

const db = new Database("kb.db");
sqliteVec.load(db);

db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  doc_id TEXT,
  +text TEXT,
  embedding float[1024]
)`);

const ins = db.prepare(
  "INSERT INTO chunks(chunk_id, doc_id, text, embedding) VALUES(?,?,?,?)"
);
ins.run(BigInt(id), docId, text, new Float32Array(vec)); // vec 来自 embedding API

// KNN + metadata 过滤同句完成
const hits = db.prepare(`SELECT chunk_id, doc_id, text, distance FROM chunks
  WHERE embedding MATCH ? AND doc_id = ? ORDER BY distance LIMIT 5`)
  .all(new Float32Array(qvec), "GB14881");
```

### 7.5.2 OpenAI 兼容 embedding 调用（硅基流动免费档）

```js
const r = await fetch("https://api.siliconflow.com/v1/embeddings", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${SILICONFLOW_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ model: "BAAI/bge-m3", input: texts }),
});
const vecs = (await r.json()).data.map((d) => d.embedding); // 1024 维
```

## 7.6 成本估算【推断，基于实证单价】

场景：10 万切片 × 512 token ≈ 5120 万 token 入库

| 项目 | 硅基流动免费档 | 硅基流动 Pro | 智谱 embedding-3 |
|---|---|---|---|
| 入库 embedding | ¥0 | ~¥3.6 一次性 | ~¥25.6 |
| 查询（1 万次×100 token） | ¥0 | ~¥0.07 | ~¥0.5 |
| 存储（float32） | ~400MB 单文件 | 同左 | 同左 |
| 存储（int8 量化） | ~100MB | 同左 | 同左 |

**迁移触发线**：切片 >50 万、P99 >100ms、或多 agent 共享检索服务时再评估 Qdrant。

## 7.7 选型决策

**知识库 = SQLite + sqlite-vec**（与现有会话持久化同构——本仓库已有 SQLite 会话存储先例，见 [`packages/session/session-persistence-sqlite/README.md`](../../../packages/session/session-persistence-sqlite/README.md) 的单文件嵌入式路线）；**Embedding = 硅基流动 BAAI/bge-m3 免费档**（OpenAI 兼容），本地 ollama 作离线备份；**MVP 不引入独立向量库**。
