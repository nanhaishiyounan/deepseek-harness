# M1：DSH Web 问数界面重设计——来源链、图表、概览首页、业务页、KG 时效

[English](2026-09-17-m1-web-ux-redesign.md) | 中文

## 背景

kb-agent 的 Web 工作台能用，但读起来是"工具面板"：答案看不到出处、数值结果只有 markdown 表格零图表、空会话门户是三十张无排序的场景卡、业务页把九十五个 NocoBase collection 压进一个 `<select>` 且每次提问都跳去 chat 页、图谱页从不说明数据新鲜度。[M1 计划](../../../../plans/2026-09-17-kg-mobile-ux/01-m1-dsh-web-ux-redesign.md) 针对[18 条 UX 痛点](../../../../research/2026-09-17-mobile-prototype-analysis.md)定了五个改造面。

## 决策

- **来源链从冻结的 turn 切片提取，不加新的 wire 元数据。** 收尾 turn-tail 下的 `SourceTrail` 聚合 kb 引用（`[n] …` 行）、lakehouse 表名（`Data source:` 行）、NocoBase collection（调用参数）、kg 溯源（YAML `sources:` 行），全部来自已落盘的工具结果——不动 session 事件，"模型可见⟺已记录"零宿主改动。宿主换措辞时丢的是那一枚 chip，不破卡。
- **图表自绘 SVG，落在 ui-tool。** 计划把图表放在 ui-conversation 下，但依赖方向相反（ui-tool 依赖 ui-conversation），因此 `LakehouseToolRow` 连同数字卡/折线/横条/表格切换/CSV 导出/SQL 折叠一起放进 ui-tool 的 keyed toolview 行体系。不引图表库；`chartPlanOf` 在首列读作时间轴时选折线，否则横条。
- **概览 KPI 是部署配置，不是代码。** 新的 `lakehouse.overview` 网关 RPC 读取 `{id, label, sql}` 的 JSON 种子并逐条在 lakehouse seam 上求值；单条 KPI 失败降级为错误文案，不空白整带。接线沿 `assets.stats` 的 rpc-map + fetch handler + IApiClient + fixture 全套模式。kb-agent 覆盖层的种子钉在 `examples/kb-agent/workspace/data/overview/kpis.json`。
- **内联编辑走网关快速通道；高风险改动仍走对话。** `nocobase.update` 是新的写 RPC，由 `nocobaseWriteEnabled` 门控（缺省即拒绝，与 `ordersEnabled` 同立场）。只有白名单字段（备注/数量/日期语义，`isInlineEditable`）提供内联编辑；其余改动保留 nb_update 的预览→确认→回执流程。"No forms" 收敛为"高危走对话"。
- **业务页提问永不跳页。** `askInPlace` 只填对话草稿并展示内联跳转链接，视图切换变成用户的点击。分组导航（域分桶 + 实时搜索 + localStorage 常用轨道）替换扁平 `<select>`；供应商类 collection 渲染 360 区（证照/审核 chip 带到期预警），订单类渲染状态徽标。
- **KG 时效与追溯短语。** 图谱页用已存在的 `kg.stats` 扩展显示 `数据截至 {last_run_at}`（不加新读），`kg-nl` 新增五个追溯模板（`X的原料来自哪些供应商`、`X批次流向哪些客户`、`X的供应商`、`X的客户`、`X由哪些原料制成`），ui-kg 的离线回落模板 3→8 同步镜像。

## 放弃了什么

- **assembled 多源混合 fixture turn。** 会话投影每 turn 只渲染一个根工具调用，"一轮四工具"的 fixture 渲染没有成行；assembled 快照钉单调用 turn（kb 来源链 + lakehouse 图表），四源聚合由 ui-conversation 单测套件按同一 wire 形状钉住。未来要真正的多调用 turn，先让投影支持兄弟调用。
- **跨包 KG 深链。** kg chip 的证据跳转只切视图环到 `kg`，种子定位（把 chip 实体在图上走出来）需要 ui-conversation 够不着的 ui-kg 桥；与 M2 的路径高亮一起后置。
- **独立文档页。** `docs/subsystems/web.zh.md` 是 web-fetch 能力文档而非工作台文档；本记录加 JSDoc 契约承载这些决策。

## 验证

逐包单测（source-trail、lakehouse 行、场景概览+钉选、biz 导航、kg 短语）、四个新的 assembled keyless 快照（`source-trail`、`lakehouse-row`、`overview-home`、`biz-navigator`）跑 fixture 传输、`doc-sync` 28 门全绿、改动树 oxlint 干净，以及批次报告里的真实服务器/真实 API 实跑。
