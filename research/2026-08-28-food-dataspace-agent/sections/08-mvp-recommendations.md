# 第 8 章 对 MVP 技术选型的影响（综合建议）

> 本章将第 2-7 章的发现收敛为"企业数据进 → agent 真实产出"最小闭环的工程决策。前提回顾：我方底座为 deepseek-harness（TypeScript 插件化微内核，SQLite 会话持久化先例见 [`packages/session/session-persistence-sqlite/README.md`](../../../packages/session/session-persistence-sqlite/README.md)，Node ^22，ESM）。

## 8.1 知识库存储与检索

**决策：SQLite（better-sqlite3）+ sqlite-vec 扩展，单文件嵌入式，不引入独立向量库服务。**

依据链：
1. 【实证】sqlite-vec 在 10 万×768 维规模暴力扫描 13.4ms、召回 100%（第 7.2 节）——MVP 切片量（单企业文档库 <10 万）完全在舒适区
2. 【实证】SQLite 官方已托管 Vec1 扩展（sqlite.org/vec1），路线有官方背书
3. 【实证】本仓库已有 SQLite 持久化工程先例（WAL/事务/模式版本管理），运维心智零新增
4. 【实证】MaxKB 证明"单库承载关系+向量"架构可支撑到 20k star 级产品

**表结构设计（融合 MaxKB+FastGPT 精华，SQLite 方言）**：

```sql
-- 知识库（多租户列预留）
CREATE TABLE knowledge (
  id TEXT PRIMARY KEY,            -- uuid
  workspace_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  type TEXT NOT NULL,             -- generic/web/file
  embedding_model_id TEXT NOT NULL,
  folder_id TEXT,                 -- 树形文件夹
  created_at INTEGER NOT NULL
);

-- 文档
CREATE TABLE document (
  id TEXT PRIMARY KEY,
  knowledge_id TEXT NOT NULL REFERENCES knowledge(id),
  name TEXT NOT NULL,
  char_length INTEGER,
  status TEXT NOT NULL,           -- embedding/generate_problem/sync 状态机
  hit_handling_method TEXT NOT NULL DEFAULT 'optimize',  -- optimize|directly_return
  directly_return_similarity REAL NOT NULL DEFAULT 0.9,  -- MaxKB 实证默认值
  hash_raw_text TEXT,             -- FastGPT 去重模式
  meta JSON
);

-- 切片（chunk）
CREATE TABLE chunk (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES document(id),
  q TEXT NOT NULL,                -- 问题/正文（QA 增强模式）
  a TEXT,                         -- 答案（可选）
  title TEXT,
  position INTEGER NOT NULL,
  hit_num INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  history JSON                    -- chunk 级修改历史（FastGPT 模式）
);

-- QA 增强（MaxKB Problem 模式：LLM 生成问题同建索引）
CREATE TABLE problem (
  id TEXT PRIMARY KEY,
  chunk_id INTEGER NOT NULL REFERENCES chunk(id),
  content TEXT NOT NULL
);

-- 元数据过滤标签
CREATE TABLE tag (id TEXT PRIMARY KEY, knowledge_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL);
CREATE TABLE document_tag (document_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(document_id, tag_id));

-- 向量（vec0 虚拟表，只存 id 引用回查 chunk——FastGPT dataId 模式）
CREATE VIRTUAL TABLE chunk_vec USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding float[1024]           -- BGE-M3 维度
);
CREATE VIRTUAL TABLE problem_vec USING vec0(
  problem_id TEXT PRIMARY KEY,
  embedding float[1024]
);
```

**检索管道（分层，行业共识模式）**：

```
三模式枚举（embedding/keywords/blend）
→ 向量预取 LEAST(topN*10, 500)
→ 段落级 DISTINCT 去重
→ 混合融合：加法融合 (1-cosine_distance) + FTS5 bm25（MaxKB blend_search.sql 移植）
→ 阈值过滤（默认 0.5）
→ TopK=3~5
→ 可选 rerank（bge-reranker-v2-m3，失败静默降级返回原序——FastGPT 模式）
→ directly_return_similarity ≥0.9 直接返回原文（MaxKB 模式）
→ 答案强制带引用溯源：文档名+页码/位置（食信平台实证的企业信任关键）
```

**切片参数默认值（行业交集）**：chunkSize 512-1024 token、overlapRatio 0.1-0.2（取上一块尾部）、lengthUnit 支持 char|token、CPU 密集切片放 worker_threads（FastGPT 模式）。

**术语库（Termbase）**：食品行业专业词（工艺术语/添加剂名/标准号）入库前替换归一——MaxKB 实证的垂直行业刚需。

## 8.2 Embedding 方案

**决策：硅基流动 BAAI/bge-m3 免费档（OpenAI 兼容 /v1/embeddings）为主，本地 ollama 离线备份。**

- 【实证】免费档 + 8192 token 上限 + 1024 维，MVP 入库成本 ¥0（10 万切片）
- 【实证】OpenAI 兼容协议 → 未来切换任何兼容服务商（智谱/火山/自建 vLLM）零代码改动
- 【实证】配套 bge-reranker-v2-m3 同平台免费，rerank 一站式
- 双配置模式（FastGPT db/query 分离）：入库与查询可用不同模型参数，为未来换模型留缝
- 向量维度 1024 硬编码进 vec0 表定义；换 embedding 模型=重建向量表（成本可控）

## 8.3 数据采集形态

**决策：MVP 以"文件上传 + 结构化导入"两通道起步，预留 ERP/IoT 连接器接口。**

依据：
1. 【实证】食信平台数据工具页的接入矩阵：ERP（用友/金蝶/SAP）/MES/WMS/Excel/IoT（PLC/工控机）/API——但这是终态，不是 MVP 态
2. 【实证】飞鹤场景选择标准"数据基础好"优先——设备文档/工艺标准/检测报告是企业现成数据，零改造成本
3. 【推断】中小食品企业 MVP 阶段最可能提供：产品标准（PDF/Word）、工艺规程、检测报告（Excel/PDF）、法规标准文件（国标/行标）

**MVP 采集清单**：
- 通道 1：文件上传（PDF/Word/Excel/txt/Markdown），解析用 Coze ParsingStrategy 两档模式（FastParsing 快速档/AccurateParsing 含 OCR 表格档）
- 通道 2：结构化导入（CSV/Excel 映射到 tag 元数据）
- 预埋：连接器接口（未来接 ERP/API），Coze 三策略结构体（Parsing/Chunking/Retrieval）直接抄成 TS 类型

## 8.4 Agent 服务形态

**决策：预设角色 Agent（"主管/管家"命名体系）+ 统一工作台入口 + 引用溯源强制。**

1. 【实证】Agent 命名沿用"AI 设备维护主管/AI 食安巡检 Agent"式拟人职位（食信平台与 HiAgent"数字员工"双验证，市场已教育）
2. 【实证】MVP 首发场景照抄飞鹤优先级：设备维保类第一（数据最全 ROI 最硬）→ 工艺参数第二 → 食安合规第三
3. 【实证】统一入口从第一天设计（HiAgent"1+N+X"与 130+ 智能体烟囱化教训）——MVP 即使只有 2-3 个 agent 也要一个工作台壳
4. 【实证】答案引用溯源（文档名+页码）是企业付费意愿的关键设计（食信平台演示实证）
5. 【推断】杀手级场景候选：对标"退税 3 天 vs 30-60 天"的数字对比强度，我方候选是"标准查引用时 2 小时→2 分钟"（食品企业查国标/行标/法规的合规问答）或"设备故障排查 47h→小时级"（飞鹤实证可复制）
6. 商业化分层预埋：免费层限"知识文档数+存储+积分"（Dify/RAGFlow 共识杠杆），多租户/RBAC 留企业版——与我方 harness 插件化能力对应（workspace 插件）

## 8.5 MVP 闭环路线图（建议）

```
第 1 步：知识库插件（dsh-knowledge）
  SQLite+sqlite-vec 表结构 + 文件上传 + 切片（worker）+ embedding（硅基流动）
第 2 步：检索工具插件（dsh-knowledge-tools）
  blend 检索管道 + 引用溯源格式化 → 注册为 agent 可调用工具
第 3 步：首发 Agent 预设（preset）
  "AI 设备维护主管"（设备手册+维修工单知识库）+ "AI 食安合规官"（国标法规库）
第 4 步：最小 Web 工作台
  统一入口 + 知识库管理页 + 对话页（引用溯源展示）
第 5 步：验证指标
  企业真实文档 1000 份入库；检索 Top5 命中率 ≥80%（人工标注 100 问）；
  agent 回答带有效引用率 ≥90%；单问答成本 <¥0.05
```

## 8.6 风险与对冲

| 风险 | 对冲 |
|---|---|
| sqlite-vec pre-v1 breaking change | 锁定版本；vec0 表结构简单可迁移；Vec1 官方扩展为后备 |
| 硅基流动免费档限流/停服 | ollama 本地备份（同模型）；OpenAI 兼容协议切换零成本 |
| 混合检索融合策略三家分歧无共识 | MVP 用加法融合（MaxKB 最简），预留 RRF 开关，用标注集实测裁决 |
| 食品文档解析质量（表格/扫描件） | ParsingStrategy 两档；Accurate 档接 OCR；MVP 先限 PDF/Word/Excel 数字原件 |
| 免费额度滥用 | 积分分级计价（食信模式：问答 1/分析 5/报告 20/视频 30） |

## 8.7 与终态（可信数据空间平台）的衔接

MVP 不做数据空间基础设施，但预留三个衔接点：
1. **workspace 多租户模型**从第一天就是 knowledge 表的一等公民（对标可信数据空间"多方主体联接"）
2. **数据资产化叙事接口**：文档/数据集的 hash+char_length+来源三元组记录（未来确权举证的字段基础）
3. **合规叙事**：产品文案引用第 6 章政策链（数据二十条→数据要素×→可信数据空间行动计划），MVP 即可挂"食品产业可信数据空间共建方"定位
