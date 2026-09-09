# @deepseek-ai/dsh-kg-build

[English](README.md) | 中文

知识图谱构建管线（`ctx.kgBuild`）：一个 Service 插件，把三个结构化源——NocoBase 业务 collections（R01–R13 确定性映射）、湖仓 catalog、连接器 discover——写入 kbGraph 属性图，再对语料文档跑闭集 LLM 抽取，并把抽取实体对齐到权威的 NocoBase 行。每次运行幂等：按 scope 的快照指纹跳过未变源，MERGE 锚点收敛重复写入，消失的行 tombstone。注册表之外的任何东西都不会写入——未知实体类型降级 `Concept` 桶，未知或方向违例的谓词丢弃并计数。

## 组合

`ctx.plugin(KgBuildRuntime, config)`——各缝在运行时按需解析：kbGraph 缝与 v2 存储必需；湖仓/连接器腿在其缝缺席时自动关闭；语料腿需要 llm 缝。NocoBase 凭据与 tool-nocobase 走同一条解析链（`baseUrl` 配置 → 启动环境 → `NOCOBASE_BASE_URL`；token 经 credentials 缝或配置的环境变量）。调度默认手动（`intervalMs: 0`；正值时按定时器重复 `run()`）。

## 配置

- `tenant`（必填）：部署侧租户绑定，全部图写入落在其下。
- `nocobase.collections`：显式 collection 白名单——`anchor`（派生类型 extends 的内置节点类型）、`titleField`、`fkLinks`（`plain-id` / `collection-address` 两种取值形态；对"引用存为标量列"的 schema 是 R06 的显式扩展）。
- `lakehouse` / `connector`（默认 true）：数据资产腿；每表/数据集注册一个 `Dataset` 节点，指纹未变即跳过。
- `corpus`：`root`（递归 md/txt）、`extensions`、`maxDocuments`、`maxChunksPerDocument`——闭集抽取，内容哈希跳过，delete-then-re-extract 语义。
- `extract`（默认 minimax / MiniMax-M3）：provider、model、分块预算。`align`：Jaro-Winkler 自动合并阈值（0.9）与灰区下限（0.8，LLM 终审）。`pageSize`（默认 100）、`intervalMs`（默认 0）。

## 模型体验

间接经 kg 工具族（`kg_schema` 每调用一份小清单；`kg_subgraph` 聚合 YAML 回答，通常 3-6k token、受 `max_nodes` 约束）。

#### KV 缓存影响

对会话流为零：语料抽取走管线自有的请求流（不在 agent 循环内），kg 工具输出以普通工具结果进入会话。

## 已知限制与后续工作

- 变更检测基于快照指纹（种子 NocoBase 轨道的 `updatedAt` 实测不可用；见 Agent Note）。事件回调低延迟通道与 apiproxy `kg` 域按批范围顺延。
- 对账记账（`run_config.knownIds`）随行数线性增长，单 collection 超过约 1 万行后需要分块对账。
- 连接器 discover 的合并输出不带 providerId，`connector:<id>` 节点存在跨 provider 撞名风险；sourced_via 来源边等 seam 侧暴露 per-provider 归属后补。
- 实体对齐只在同 type 内、单用 Jaro-Winkler（embedding 余弦合取与跨型层次合并为后续工作）；语料抽取直读文件而非 kb 缝的 chunk 存储。
