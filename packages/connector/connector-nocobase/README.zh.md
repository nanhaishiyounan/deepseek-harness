# @deepseek-ai/dsh-connector-nocobase

[English](README.md) | 中文

NocoBase 连接器 Provider（`ctx.connector` 上的 `connector-nocobase`）：一个讲 resourcer 线上语义、带 `Authorization: Bearer <token>` 的极简 REST client（list、get、create），以及把三个 NocoBase collection 映射为连接器数据集的映射层——`experts` 行成为专家画像文档并携带该专家的服务目录（每项交付物与定价），`datasets` 行按行内 kind 成为表格数据集（行数据从其指向的源 collection 拉取）或内联文档，`expert_services` 行成为带公布定价的可服务化商品。发现清单携带结构化卡片字段：专家的机构与领域标签、每项服务的完整引用。

## 线上语义

- **`GET /api/<collection>:list`** —— URL 编码的 JSON `filter`、`page`、`pageSize`，以及可选的 `sort`（逗号连接，`-` 前缀 = 降序）、`fields`（列投影）与 `appends`（关系展开）；返回分页信封 `{count, rows, page, pageSize}`。发现阶段把自由文本查询翻译为各 collection 可检索字段上的 `$includes` 过滤。
- **`GET /api/collections:listMeta`** —— 一次不分页的应答，`data` 数组携带全部运行时 collection 定义（名称、标题、带关系目标的字段、`filterTargetKey`）；是 nb_* 工具与 apiproxy nocobase 域各自投影视图的 schema 发现面。
- **`GET /api/<collection>/<id>`** —— REST 式行读取，可选 `appends`；404 归一为 `CONNECTOR_DATASET_MISSING`。

本包还拥有所有 NocoBase 消费方共同接受的**受限筛选词汇**：扁平的 `{field, op: eq|in|gt|lt, value}` 条件加单一 and/or 连接，编译为 NocoBase filter 树（`compileNbFilter`）。任意操作符树绝不跨消费方边界。
- 超时与调用方 signal 合并；一次传输层重试（连接重置、DNS 抖动）之后才给出 `NOCOBASE_NETWORK_ERROR` 拒绝；HTTP 失败以 `NOCOBASE_HTTP_ERROR` 透出状态码与响应体摘录——绝不重试。

## 凭据与降级

base url 来自配置或 `NOCOBASE_BASE_URL`；token 先经凭据缝解析（`apiKeyEnv`，默认 `NOCOBASE_API_KEY`），再回退可信启动环境。两者不全时 Provider 仍注册但 `available() === false`——发现跳过它，直接拉取 fail-loud（`CONNECTOR_PROVIDER_UNAVAILABLE`）。可用性在加载期一次性解析（注册表的门禁按设计不做 I/O）；换 key 需重载组合。

## 配置（schemastery）

- `baseUrl?: string` —— 服务端 origin；缺省用 `NOCOBASE_BASE_URL` 环境变量。
- `apiKeyEnv?: string` —— token 的凭据引用（默认 `NOCOBASE_API_KEY`）。
- `timeoutMs?: number` —— 单请求超时（默认 `15000`）。
- `listPageSize?: number` —— 每个 collection 的发现页长（默认 `100`）。
- `fetchRowsCap?: number` —— 单次表格数据集拉取的行数上限（默认 `1000`）。

## Model Experience

经工具消费方 `dsh-tool-connector` 间接影响模型：本 Provider 不注册任何 prompt、schema 或工具，所映射 NocoBase 数据集的一切模型可见投影都归该包所有。

#### KV Cache effect

与模型请求流无关：REST list 与 get 产生的是后续请求消费的工具结果，本包既不向任何可复用请求前缀追加内容，也不使其失效。

## Known Limitations and Deferred Work

- client 覆盖 list、get、create 与按主键 update（播种与下单通道使用这些）：destroy、附件（`attachments:upload`/`attachments:create`）与 workflow 面随消费它们的批次落地（N6 附件交付）。
- 数据集 id 是 `<collection>/<row id>` 地址，仅限本 Provider 的映射范围；名字带 `/` 的 NocoBase collection 需要转义规则（今天不存在）。
- 表格拉取单页最多 `fetchRowsCap` 行；超上限的数据集在线上侧静默截断——分页循环等待真正超限的首个数据集。
- 夹具行（张红喜完整数据集）从权威 JSON（`examples/kb-agent/workspace/data/experts/dataset.json`）读入包内 mock server；种子脚本与真实实例共用同一真源，双源不漂移。
