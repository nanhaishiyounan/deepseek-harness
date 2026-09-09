# @deepseek-ai/dsh-tool-connector

[English](README.md) | 中文

面向模型的 `connector_discover`、`connector_fetch`、`connector_transfer`、`order_create`、`order_status` 五工具，架在连接器缝（`ctx.connector`）与可选订单缝（`ctx.orders`）之上。本包拥有 schema、校验、prompt 指引、预算与呈现，不拥有任何具体 Provider。租户是部署侧绑定（`Config.tenant`，必填）：模型永不提供租户，任何调用带 `tenant` 实参都会被拒绝。开关控制工具注册；无可用 Provider 时已启用的工具保持可见，在执行时给出结构化错误——这是缝的文档化降级模式。

## 工具

- **`connector_discover`** —— 跨所有可用连接器 Provider 检索数据集、专家画像与专家服务。专家条目渲染为专家卡（机构、领域标签、该专家可下单的服务清单及交付物与定价）；关联到已发现专家的服务折叠进该专家卡，未关联的服务保留独立分组，数据数据集照常列出 provider 与 dataset id——即后续工具要用的地址。空结果显式说明而非空列表。默认预算 15 秒；并发安全（只读扇出）。
- **`connector_fetch`** —— 预览单个数据集：表格内容前 8 行加截断标记、文档/专家画像 400 字符摘录、文件回执与可解码文本头、或服务商品。把 dataset id 解析到唯一所属 Provider；多个 Provider 同 id 时要求 `provider_id`；未知 id fail-loud。默认预算 30 秒；并发安全。
- **`connector_transfer`** —— 为单个数据集在绑定租户下执行缝的五步传输并渲染落地回执：湖仓表（含替换事实与下一步 `lakehouse_query` 指引）或 kb 文档（含 `kb_search` 引用指引），外加 catalog 传输记录 id。`target` 可钉住目的地；与分类不一致时 fail-loud。默认预算 120 秒；非并发安全（写落地）。
- **`order_create`** —— 一次调用完成下单与整条交付管线（经 `ctx.orders` 的 create → fulfill）：service id 取自发现的专家卡，brief 复述客户需求，回执携带订单号、终态与方案 PDF 的 workspace 路径。默认预算 60 秒（含起草与排版）；非并发安全（交易写入）。
- **`order_status`** —— 按 id 读取一笔订单，未给 id 则列最近订单；已交付行携带交付物路径。默认预算 10 秒；并发安全（只读）。

## 配置（schemastery）

- `discover?` / `fetch?` / `transfer?: boolean` —— 各工具注册开关（默认 `true`）。
- `tenant: string`（必填）—— 每次落地操作的部署侧租户绑定。
- `discoverTimeoutMs?` / `fetchTimeoutMs?` / `transferTimeoutMs?: number` —— 协作预算（默认 `15000` / `30000` / `120000`）。

## Presentation（UI render intent）

三个工具都渲染 `generic` 卡：等待卡以查询词或 dataset id 为题；完成卡复述命中数（discover）、被预览的数据集（fetch）或落地目的地与表/文档（transfer）。呈现是 `args` + `meta` 的纯函数，可从会话日志回放。

## Model Experience

### System prompt

#### 模型所见

工具启用时三条指引进入 system prompt，逐字如下。

##### connector-discover 指引

```markdown
Use the connector_discover tool to search external and expert data sources (connector providers) for datasets, expert profiles, and expert services — for example when the question needs experts (出海、中亚), external structured data, or a serviceable offering. Expert cards carry the expert's affiliation, domains, and orderable services (deliverable + pricing); recommend a matching expert by these card fields when the question calls for one. Results carry a provider and dataset id: preview content with connector_fetch, and land a dataset into the knowledge base or the lakehouse with connector_transfer.
```

##### connector-fetch 指引

```markdown
Use the connector_fetch tool to preview one connector dataset before transferring it: the first rows of a tabular dataset, an excerpt of a document or expert profile, the receipt of a file, or a service offering. Pass the dataset id from connector_discover; add provider_id when several providers share the id.
```

##### connector-transfer 指引

```markdown
Use the connector_transfer tool to land one connector dataset into this deployment: tabular content and csv/xlsx/json files load as lakehouse tables, documents and expert profiles ingest into the knowledge base (auto-classified; target pins the destination and disagreements refuse). After a transfer, answer from the landing — lakehouse_query over the named table, or kb_search with [n] citations.
```

#### Token effect

三条固定成本指引（合计约 150 token），每组合注册一次。

#### KV Cache effect

按节名键控的静态文本；跨会话一致，位于每个缓存前缀的头部。

### Tool schemas

#### 模型所见

模型看到生成的 [`connector_discover`、`connector_fetch`、`connector_transfer`、`order_create`、`order_status` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-connector)。`connector_discover` 声明可选 `query` 字符串与可选 `kinds` 字符串数组（枚举闭集）；`connector_fetch` 声明必填 `dataset_id` 与可选 `provider_id`；`connector_transfer` 追加可选 `target` 枚举；`order_create` 声明必填 `service_id` 与 `brief` 及可选 `client_name`；`order_status` 声明可选 `order_id`。它们都不声明 `tenant`。

#### Token effect

三个 schema 合计约 180 token。

#### KV Cache effect

静态 schema 文本；缓存稳定。

### Tool results

#### 模型所见

discover 渲染带 id 的分组清单；fetch 渲染按类型的预览加下一步指引行；transfer 渲染落地回执——目的地、表或文档摘要、替换事实、传输记录 id，以及"从落地作答"（点名表名，或以 [n] 引用）的常设指令。

#### Token effect

discover 随命中数线性（通常 < 30 条）；fetch 有上限（8 行 / 400 字符）；transfer 是约 80 token 的固定回执。

#### KV Cache effect

工具结果是回合内容；从不进入缓存前缀。

## Known Limitations and Deferred Work

- 未点名 provider 的 fetch/transfer 每次都跑一遍发现扇出来解析 id；Provider 声明式的归属索引可省掉这一跳，等待发现成本显著的首个 Provider。
- 专家卡渲染（姓名/机构/领域/服务 + 可下单提示）属 N4 呈现批次；今天专家条目走通用分组清单。
