# Agent Note: 五域工具面 —— 共享 kg-nl、kg_query、assets_browse 与场景全量挂载

Status: implemented

[English](2026-09-16-j2-five-domain-tool-surface.md) | 中文

## 问题

三十个场景 preset 只挂载 tool-kb 的六个工具；kg 短语编译器只服务图谱页搜索框（一个 apiproxy RPC，模型不可见）；资产市场目录没有任何面向模型的工具；默认 persona 的分流从未提及 kg 面。用户要求「知识库、数据湖仓、数据资产、连接器、业务系统的所有数据」，而场景会话够不到五个域中的四个。

## 决策

**一个编译器、两张面。** kg-nl 模板编译器原样从 apiproxy 迁至 `@deepseek-ai/dsh-kb-graph/kg-nl`（从包根再导出，apiproxy 改为 import 包根）。tool-kb 的新工具 `kg_query` 与 `kg.query` RPC 经同一个函数编译，RPC 行为无法与工具漂移——迁移后的 kg-nl spec（断言未改）锁住两者，另加根导出断言守护 RPC 解析的再导出路径。

**`kg_query`** 只收 `{ phrase }`。计划中可选的 `hops` 覆盖被裁掉：每个模板的 plan 自带 hops，覆盖会让不匹配的短语静默改变走查深度；不支持短语的错误报出支持的句式并指向 kg_schema + kg_subgraph 回退。注册走 tool-kb 配置（`kgQuery`，默认 true），因此每个已挂 tool-kb 的组装——三十个场景、两个角色 preset、host 工具行——零 yml 改动即获得该工具。

**`assets_browse`** 落在 tool-connector，作为市场目录的只读面（`list`/`detail`/`stats`，单工具 + action 枚举，即业界调研建议的合并方向）。数据面与网关 assets 域同为 `ctx.connector.discover`——计划中「从 apiproxy 抽共享 service」化简为 import 两个面早已共享的缝，因为 apiproxy 的 assets 投影（资产视图、精选栏、月订单数）是 UI 货币而非目录数据。`stats` 按类型与提供方计数；精选栏与订单计数保持 UI 专属。

**场景挂载。** 三十个 `agent.cordis.yml` 全部在 tool-kb 旁追加 tool-lakehouse、tool-connector、tool-nocobase 行（kg_query 与 assets_browse 随这些行到达），外加 persona 边界段：场景语料优先、跨域工具按需、回答注明来源域。场景快照从「6 kb tools」变为「20 tools (five-domain)」；kb-presets 快照列出默认会话的二十个工具。scenarios.spec.ts 的静态 yml 断言在任一场景丢失四个插件行之一时失败。

**persona 分流。** 默认 persona 的分流行现在把实体关系问题路由到 `kg_query`（带 kg_schema + kg_subgraph 回退），目录总览路由到 `assets_browse`。

## 影响

每个场景会话的系统提示随挂载工具的 schema 与 `tool:*` 段增长——persona 边界段是对冲；J4 观察实调质量，模型分散时 K 轮可加分组工具提示。输出 schema DSL 拒绝 map 形态的 `additionalProperties: { … }`，因此 `stats` 携带 `kinds: [{kind, count}]` 而非对象 map。连接器管理与 NocoBase workflow 工具按设计保持在外（凭据面；确认契约哲学）。

## 考虑过的替代方案

**新建 `packages/assets/tool-assets` 包** —— 否决。跨一个已被别的包拥有的缝的单个只读工具不是能力缝；tool-connector 的 order 工具已为同一缝落座于此。

**把 assets_browse 放进 apiproxy 或 examples 部署层** —— 否决。apiproxy 是 UI→BFF 面（AI 工具入内破坏分层）；example 没有 TypeScript 面。

**按 persona 精选场景工具子集** —— 否决。场景隔离已由聚焦 persona 与每场景语料承担；工具裁剪让矩阵翻倍并重新打开本轮要关闭的「够不到域 X」缺口。
