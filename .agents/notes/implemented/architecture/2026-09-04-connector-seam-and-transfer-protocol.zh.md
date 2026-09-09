# Agent Note：连接器缝——统一数据包、五步传输与同一路由真相

Status: implemented

[English](2026-09-04-connector-seam-and-transfer-protocol.md) | 中文

## 问题

食品 KB agent 需要把外部与专家数据源当作一等素材：专家画像（张会长）、业务后台数据集（NocoBase）、本地文件投放都必须可被模型发现、可预览、可落进本部署的两个数据面——文档与画像进 kb，表格数据进湖仓。N1/N2 建好了这两个落地缝和共享上传路由器，但若无连接器缝，每个外部源都要各自把 fetch/parse/store 管线接进工具层，路由决策与确权处理随上游数量翻倍。

## 决策

**一条能力缝，三角色。** `packages/connector/connector` 是 Service Definition（`ctx.connector`）：`ConnectorProvider` 注册表（注册即 effect；重复 id 抛错）、发现扇出、单 Provider 拉取解析，以及传输编排。Provider 自行注册——N3 随包发布 `dsh-connector-file`（投放目录）与 `dsh-connector-nocobase`（REST + Bearer token）——`dsh-tool-connector` 是唯一 Tool Consumer（`connector_discover` / `connector_fetch` / `connector_transfer`，部署侧绑定租户，generic 卡）。缝不拥有 Provider 也不拥有工具；下单工具（`order_create`/`order_status`）属 N5 下单批次，本批不存在。

**`ConnectorDataset` 数据包是以 `kind` 判别的闭 union**——`tabular`（已解析 `TabularData` 加可选的 Provider 提供的已净化 `tableName` 提示）、`file`（原始字节；路由延后）、`document`/`expert-profile`（kb ingest 形态文本）、`service`（引用形态的可服务化商品，无可载数据）。`file` 是对计划四类 union 的偏差增补：字节级数据集正是文件连接器实际供应、共享路由器所需要的形态；其余类型的分类由内容驱动，因此 Provider 只交字节、缝做决定。scope（`search`/`derive`/`share`）随 manifest 携带并在传输时继承为确权——与 kb/湖仓的 scope union 同构，下游授权无需翻译。

**传输是五步编排，两侧落地均为覆写语义：pull → classify → route → deliver → confirm。** 分类复用 `@deepseek-ai/dsh-lakehouse/data-router` 的 `resolveDataRoute`——连接器传输与工作台上传共用同一路由真相；csv/xlsx/json 经由从 apiproxy 上移到 `@deepseek-ai/dsh-lakehouse/tabular` 的解析器（`TabularData` 词汇只有一个家）。deliver 走目的地缝（`ctx.kb.ingest` / `ctx.lakehouse.load`），确权 `connector:<providerId>` 加命名空间化 source path。confirm 经新增的 `LakehouseRuntime.recordTransfer` 透传追加 catalog 传输记录——审计轨迹无论目的地都落在湖仓 catalog，因为 N1 已给该 catalog 建了传输表，且两个落地缝各自计量（`loadedTables` / `ingestedDocuments`）；专属连接器计数存储等待首个消费者。

**失败语义：每步 fail-loud，重试可收敛。** 落地成功但确认失败抛 `CONNECTOR_CONFIRM_FAILED`，点名已落地内容并说明重试可收敛——两侧落地均为覆写语义（`(tenantId, tableName)` 与 `(tenantId, sourcePath)` 身份），不存在需要补偿的半成品；这就是全部补偿方案。目的地缝缺失、路由拒绝（`CONNECTOR_ROUTE_<REASON>`）、target 钉死与分类不一致、非 UTF-8 文本、pdf/docx 的 kb 落地（其抽取今天归网关上传通道所有）各有独立机读错误码。

**Provider 可用性在加载期由凭据决定。** NocoBase Provider 在插件加载时一次性解析 baseUrl + token（凭据缝优先，启动环境回退）；两者不全时仍注册但 `available() === false`——发现跳过它（降级而非失败），直接拉取 fail-loud。`available()` 按契约不做 I/O，换 key 需重载组合；这一取舍被明确文档化，而不是藏进可重解析的缓存。

## 结果

kb-agent 示例组合全部四个包（patch overlay + enterprise-data-assistant 预设挂 `tool-connector` 并在 persona 写入连接器分支路由指引）；文件集投放目录为 `examples/kb-agent/workspace/data/connector-files`。三条证据线：keyless `connector-flow` 快照（mock NocoBase 起真实 HTTP + 文件连接器：discover → fetch → csv 落湖仓表并被 `lakehouse_query` 聚合、专家画像与走访纪要落 kb 被 `kb_search` 检索）、with-key e2e（真实传输 + 一条真实 MiniMax-M3 回答重述聚合数并点名来源表）、`connector-transfer-demo.mts` 脚本（转录含直接从 sqlite 读出的 catalog 传输记录）。工具输出 schema 把按类型的预览展平为可选字段（注册表会按 `output.schema` 校验输出值，只写公共字段的 schema 会拒绝 union 载荷）。mock NocoBase 夹具携带张会长骨架，N4 用播种的真实数据替换；N4 同时拥有增强专家卡，N5 下单工具，N6 真实实例附件路径——这些面在本批均不存在。

## 考虑过的替代方案

- **每上游各自工具管线**（每个源自带 fetch/ingest 工具）——路由、确权、降级处理随上游翻倍，模型面对的是一堆单源工具而不是三个稳定工具。
- **Provider 内解析**（文件连接器直接产出 `tabular`/`document`）——把路由决策搬进每个 Provider，分叉了上传通道已有的解析真相；`file` + 缝侧分类保住单一路由器。
- **连接器缝自建传输记录存储**——N1 的 catalog 已有表，确认轨迹与表元数据一次 join 即得，第二存储只会复制租户隔离。
- **带传输状态 API 的延迟/异步传输**——没有当前消费者等待；工具的 120 秒预算覆盖现实批量，覆写语义让重跑传输成为天然的幂等原语。
