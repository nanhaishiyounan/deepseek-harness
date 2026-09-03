# Agent Note：数据空间确权与知识图谱缝

Status: implemented

[English](2026-08-30-kb-dataspace-provenance-graph.md) | 中文

## 问题

P1-2/P2-1 把可信数据空间叙事落到仓库：文档级确权与检索侧授权范围（plans P2 §1、研究报告 §8.7 的确权三元组），以及面向食品产业本体、带模型可见查询工具的知识图谱（plans P2 §3）。

## 决策

- **确权三元组是缝自有的完整性事实**：每次 `ingest` 自算 SHA-256 内容哈希与字符长度（调用方给的值被覆写），与调用方声明的 provenance（provider/scope/采集来源）一同存储。调用方可伪造的确权不是确权。
- **scope 是 SQL 内执行的闭集，不是过滤层**：`search | derive | share`。两条检索路径（FTS 与向量候选）在租户谓词上统一追加 `OR d.scope = 'share'`——`share` 文档在其他租户检索中可见；`search`/`derive` 与一切历史文档（无 provenance）保持租户私有。三个资源文件里各一条谓词，胜过向量路径会绕过的后置过滤。
- **kb-sqlite `SCHEMA_VERSION` 2→3**（pre-release：拒绝旧库），documents 表新增 5 列，provenance 随每次命中返回，引用因此能指名提供方。
- **图谱是姊妹缝，不是 `ctx.kb` 里的 store**：三元组与检索命中契约不同（邻居/两跳/实体检索 vs 全文/向量检索），塞进 `KbStore` 接口只会长出破坏性扩展。`dsh-kb-graph`（Service Definition，`ctx.kbGraph`）+ `dsh-kb-graph-sqlite`（provider，独立 "DSHG" 库，租户隔离，幂等写入）+ `kb_graph_query`/`kb_graph_add`（tool-kb 内的 consumer）三角色完整。
- **本体两端皆闭**：实体类型（company/product/ingredient/additive/standard/process/risk）与谓词（produces/uses/contains/complies_with/follows/flags/supplies）是闭集，在工具边界校验；抽取绝不内置 LLM 调用——场景 SKILL 驱动 `kb_graph_add` 并以 `source_path` 引用，模型可见 ⟺ 已记录经工具结果保持成立。

## 备选方案

- **缝内后置 scope 过滤**——否决：向量路径在截断前排序候选；融合后过滤会静默缩小召回并翻倍查询面。
- **provenance 放独立元数据表按文档关联**——否决：三元组随它证明的文档行走；每次命中一次 join 毫无收益。
- **图谱三元组进 documents store**——否决：图谱的查询代数（路径 join）在 `KbStore` 里没有表达；第二条缝让两个契约都诚实。

## 后果

- `dataspace.spec.ts` 钉住五个授权行为（provenance 回流、share 跨租户、derive/legacy 私有、向量路径一致）；图谱两包 13 测试加工具级 spec。
- 真实 key 冒烟（`examples/kb-agent/scripts/graph-smoke.mts`）演示了预期的抽取流：MiniMax-M3 从三份语料抽取 24 条带来源引用的三元组，经缝入库并查询。
- docs/subsystems/kb.{md,zh.md} 承载政策链叙事（数据二十条 → 数据要素× → 可信数据空间）及其映射的机制。
- 已知缺口：`derive` 当前等同租户私有检索；派生工作产品追踪（哪些回答引用了 derive 文档）是未来的消费侧投影。
