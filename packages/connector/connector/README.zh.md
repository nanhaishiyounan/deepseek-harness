# @deepseek-ai/dsh-connector

[English](README.md) | 中文

连接器能力缝（`ctx.connector`）：Provider 注册表、数据集发现与拉取路由，以及把外部数据集落进本部署的五步传输编排——pull → classify（文件字节走湖仓缝的共享数据路由器，其余按数据集类型）→ route → deliver（kb ingest 或湖仓 load）→ confirm（catalog 传输记录）。缝本身不内置任何 Provider：文件集、NocoBase 以及后续上游自行注册。

## 服务契约

- **`registerProvider(provider): () => void`** —— 注册一个 `ConnectorProvider`（`id`、不做 I/O 的 `available()`、启动期 `capabilities`、`discover(request)`、`fetch(ref)`）；重复 id 抛 `CONNECTOR_DUPLICATE_PROVIDER`。注册即 effect：返回的清理函数会移除注册，挂载 fiber 被 dispose 时同样移除。
- **`discover(request, signal)`** —— 把查询（自由文本加可选类型过滤）扇出到每个声明 `discover` 能力且可用的 Provider，按 Provider id 再按数据集 id 排序合并摘要。不可用的 Provider 被跳过——这是文档化的降级模式（缺凭据不能拖垮其余 Provider）；可用 Provider 在发现中途出错则整次调用 fail-loud。
- **`fetch(ref, signal)`** —— 精确解析到一个 Provider（否则抛 `CONNECTOR_PROVIDER_MISSING` / `CONNECTOR_PROVIDER_UNAVAILABLE` / `CONNECTOR_CAPABILITY_MISSING`），返回统一的 `ConnectorDataset` 数据包。
- **`transfer(request, signal)`** —— 下文五步编排；每一步都以机读错误码 fail-loud。

## 统一数据包

`ConnectorDataset` 是以 `kind` 判别的闭 union：`tabular`（已解析的 `TabularData`，可选的已净化 `tableName` 提示）、`file`（传输时才路由的原始字节）、`document`/`expert-profile`（kb ingest 形态的文本）、`service`（无可载数据的可服务化商品）。manifest 携带来源 Provider、更新时间、授权范围与描述。`ConnectorScope` 与 kb/湖仓的 scope union 同构：传输副本将其继承为确权 scope。

## 传输协议（五步）

1. **pull** —— 从 Provider `fetch` 数据集。
2. **classify** —— `tabular` → 湖仓，`document`/`expert-profile` → kb，`file` → 走 `@deepseek-ai/dsh-lakehouse/data-router` 的 `resolveDataRoute(filename, bytes, mime)`（与工作台上传通道共用同一路由真相；csv/xlsx/json 经共享的 `./tabular` 解析器），`service` → 拒绝 `CONNECTOR_TRANSFER_UNSUPPORTED_KIND`。显式 `target` 与分类不一致时拒绝 `CONNECTOR_TRANSFER_TARGET_MISMATCH`。
3. **route** —— 解析交付：湖仓 `load` 请求（表身份 + 确权 `connector:<providerId>` + collectedSource 数据集 id），或 kb `ingest` 请求（命名空间化的 source path、Provider 确权、继承的 scope）。
4. **deliver** —— 经目的地缝执行。两侧落地均为覆写语义：重跑传输是替换旧表或旧文档，而不是叠加。
5. **confirm** —— 追加 catalog 传输记录（`LakehouseRuntime.recordTransfer`），含落地目的地、行数与时间戳；用量计量走目的地缝自身（load 计 `loadedTables`，ingest 计 `ingestedDocuments`）。

**失败语义。** 落地成功但确认失败时抛 `CONNECTOR_CONFIRM_FAILED`，消息点名已落地内容并说明重试可收敛（两侧落地均为覆写语义）；目的地缝缺失抛 `CONNECTOR_LAKEHOUSE_MISSING`/`CONNECTOR_KB_MISSING`；路由拒绝以 `CONNECTOR_ROUTE_<REASON>` 透出；非 UTF-8 文本与 pdf/docx 文件（其抽取今天归网关上传通道所有）以独立错误码拒绝。

## 配置（schemastery）

无——本缝没有可调参数。Provider 各自携带配置注册（`dsh-connector-file`、`dsh-connector-nocobase`）；租户绑定归工具消费方 `dsh-tool-connector` 所有。

## Model Experience

经工具消费方 `dsh-tool-connector` 间接影响模型：本缝不注册任何 prompt、schema 或工具，连接器数据集与传输的一切模型可见投影都归该包所有。

#### KV Cache effect

与模型请求流无关：发现、拉取与传输产生的是后续请求消费的工具结果，本包既不向任何可复用请求前缀追加内容，也不使其失效。

## Known Limitations and Deferred Work

- file 类型的 kb 落地只解码 `.md`/`.txt`；pdf/docx 抽取在共享抽取器包出现前仍归网关上传通道（`CONNECTOR_FILE_HANDLER_MISSING` 会列出支持集）。
- 连接器操作计数（每租户的 discoveries/fetches）经由目的地缝自身的用量表计量；专属连接器计数存储等待首个消费者（N4/N5 带来订单计量时一并落）。
- 传输记录列表暂无缝面 API：`recordTransfer` 只追加并返回 id，审计轨迹直接从 catalog store 读取（kb-agent 演示脚本展示了 sqlite 读取）；列表 API 随首个 UI 消费者落地。
- 发现分页是 Provider 侧的（各 Provider 内部分页至其配置页长）；缝级游标协议等待真正超页的首个 Provider。
