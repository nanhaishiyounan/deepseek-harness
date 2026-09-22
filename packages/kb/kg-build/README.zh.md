# @deepseek-ai/dsh-kg-build

[English](README.md) | 中文

知识图谱构建管线（`ctx.kgBuild`）：一个 Service 插件，把三个结构化源——NocoBase 业务集合（确定性 R01–R13 映射）、lakehouse 目录、connector 发现——转换为 kbGraph 属性图，再对语料文档跑闭集 LLM 抽取并把实体对齐到权威 NocoBase 行。每次运行幂等：按 scope 的快照指纹跳过未变源，合并在自然键与七列锚上收敛，消失的行落墓碑。每次 run 以本体 revision 审计开场（注册表相对内置种子的漂移在任何源腿运行前记一条 revision 行），FoodOn 导入把精选子树快照幂等物化进注册表。抽取走 Instruct-KGC JSON 协议（schema dict + 分批；`legacy` 保留 A/B 基线 prompt），经带解释性修复反馈的 SHACL 校验闭环门控（≤3 轮，幸存者进隔离区——绝不部分落库），未知实体类型降级进 `Concept` 桶，未知或方向违规谓词带计数原因丢弃。跨源 pass 把语料实体桥接到业务行：确定性名称归一化边保持召回下限，v2 灰区（包含对）交由逐对 LLM 判决，裁决按置信分层——达到或超过自动阈值的边落库，0.5–0.9 区间的同义裁决进人工审核队列，否定裁决写拒绝墓碑——每次 pass 以携带裁决的 ingest episode 留痕。

## 组合

`ctx.plugin(KgBuildRuntime, config)`——缝服务在运行时可选解析：kbGraph 缝与 v2 存储必需；lakehouse 与 connector 腿在其缝缺席时保持关闭；语料腿需要 llm 缝。NocoBase 凭据经与 tool-nocobase 相同的链解析（`baseUrl` 配置 → 启动环境 → `NOCOBASE_BASE_URL`；令牌经凭据缝或配置的环境变量）；映射文件是集合白名单的唯一归宿（`nocobase.mappingsFile`；内联 `collections` 键加载即拒绝）。默认手动调度（`intervalMs: 0`；正值按定时器重复 `run()`）。

## 配置

- `tenant`（必填）：每个图写入的部署侧租户绑定。
- `nocobase.mappingsFile`：kg-mappings.yml 白名单——集合带 `anchor`（派生类型所扩展的内置节点类型 id）、`titleField` 与 `fkLinks`（`plain-id` 或 `collection-address` 引用风格）。
- `lakehouse` / `connector`（默认 true）：数据资产腿；每张表/数据集各注册一个 `Dataset` 节点，基于指纹跳过。
- `corpus`：`root`（递归 md/txt）、`extensions`、`maxDocuments`、`maxChunksPerDocument`——闭集抽取，内容哈希跳过与删后重抽语义。
- `extract`（默认 minimax / MiniMax-M3）：`provider`、`model`、`maxChunkChars`、`protocol`（`instruct-kgc` | `legacy`）、`shaclGate`（默认 true——SHACL 修复闭环；关闭则直写不进隔离区）。
- `align`：Jaro-Winkler 自动阈值（默认 0.9）与灰区下限（默认 0.8，LLM 裁决）。
- `crossSourceAlign`：`enabled`（默认 true）、`exactOnly`（默认 false——包含对进入灰区）、`v2`（默认 true——逐对 LLM 判决；关闭保留确定性包含边）。
- `foodon`（默认 true）：把精选 FoodOn 子树快照导入注册表（幂等；锚与同义词随类落库，导入记一条本体 revision）。
- `pageSize`（默认 100）、`intervalMs`（默认 0）。

## 模型体验

间接：经由 kg 工具套件（`kg_schema` 按调用列出；`kg_subgraph` 聚合 YAML 应答，典型 3-6k token，由 `max_nodes` 封顶）。

#### KV 缓存效应

对话流无：语料抽取走代理循环之外的管线侧请求，kg 工具输出以普通工具结果加入对话。

## 已知限制与后续工作

- 变更检测基于快照指纹（种子 NocoBase 轨道无可用的 `updatedAt`——实测；见 Agent Note）；事件回调低延迟通道继续延后。
- 对账簿记（`run_config.knownIds`）随行数线性增长；单集合超过约 1 万行需要分块对账。
- connector discover 的合并输出不带 providerId，`connector:<id>` 节点有跨提供方 id 冲突风险；sourced_via 边等缝侧按提供方归因。
- 灰区审核队列经工作台人工裁决消化；批量裁决 API 是后续工作。
- Instruct-KGC 与 legacy 保持配置级 A/B（报告在 research/）；下一次语料刷新后再定只保留胜者。
