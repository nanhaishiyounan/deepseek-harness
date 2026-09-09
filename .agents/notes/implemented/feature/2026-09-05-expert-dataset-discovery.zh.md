# Agent Note：张红喜专家数据集 —— 三合一建模、发现动线与相关性阈值启用

Status: implemented

[English](2026-09-05-expert-dataset-discovery.md) | 中文

## Problem

连接器线（N3）交付了缝、NocoBase Provider 与工具面，但夹具只是骨架：一条专家行、一项服务、两个数据集，发现清单把所有条目渲染成同一种单行要点。N4 批要把张红喜专家（漯河市电子商务协会会长，食品出海/中亚方向）变成 agent 可发现、可推荐的真实高质量数据集——验收场景即「俄罗斯的仓库被乌克兰炸了怎么办」：回答须带风险应对要点（含 [n] 引用）与张会长专家卡。债 #7（示例组合未配置检索相关性阈值）同批顺手启用。

## Decision

### 一份权威 JSON，三个消费方

`examples/kb-agent/workspace/data/experts/dataset.json` 是专家数据集的唯一真源：connector-nocobase 的测试 mock 在模块加载时读它，两个示例快照（connector-flow、expert-discovery）的规格内 mock 服务它，`scripts/seed-experts.mts` 经 client 新增的 `create` 动作（`POST /api/<collection>:create`，`{values}` body）逐行灌入真实 NocoBase（`NOCOBASE_BASE_URL`/`NOCOBASE_API_KEY`）。播种捕获服务器分配的专家 id，把 `expert_services.expertId` 重映射到新建专家上；mock 实现同一 wire 契约与 `$eq`/`$includes` filter 词汇，mock 路径与播种后的后端不会漂移。

### 缝词汇上的三合一建模

专家数据集是映射到连接器词汇的三个 collection：画像（`expert-profile` 数据集，其 kb 落地文档现在内嵌该专家的可下单服务目录，逐项交付物与定价）、服务（`service` 数据集；`ExpertServiceRef` 增 `price`）、知识资产（`datasets` 行，含专家自己的《俄罗斯·中亚海外仓风险应对手册》）。发现清单增加结构化卡片字段——`ConnectorDatasetSummary.expert`（机构 + 拆分后的领域标签）与 `.service`（完整 `ExpertServiceRef`）——由 NocoBase provider 在 JSON 边界投影、`connector_discover` 消费：清单现在渲染专家卡（机构、领域标签、折叠入卡的可下单服务清单）并带后续 dataset id；`presentationMeta` 携带专家名，UI 卡与回放可见。图谱本体不动（决策 D5）：专家发现走连接器缝，不走 kb-graph。

### 场景语料与评测线

落地 11 篇语料：`workspace/data/export-risk/` 下 9 篇 `report`（仓库受损应急指引、中俄班列与改道、公路 TIR、一主两备仓储、货运保险与理赔、中亚清关、转口走廊、海运改道、总览）加 2 篇 `regulation` 摘录（CIM/CMR 不可抗力、ICC 2020 合同条款）。评测集扩到 120 问（20 个出海风险问题，gold 指向新语料）；text 模式跑出 3 个 miss 后微调了两处语料措辞（「常见的拒赔原因」「增值税税率」）以兼容 FTS trigram。

## Alternatives considered

- **每个测试面各持一套夹具常量** —— 否决：三份手工维护的张红喜行会在第一次调价时漂移；一份 JSON、mock/快照/播种三个消费方，与场景语料既有模式一致。
- **解析清单文本得到卡片字段** —— 否决：发现清单是给模型的散文；反向解析它取数会让呈现措辞与数据抽取耦合。结构化 `summary.expert`/`summary.service` 字段携带卡片数据，清单由其派生。
- **扩展 kb-graph 加 person 实体（决策 D5）** —— 计划内不做：协调式本体变更的破坏面超出发现动线所需；`connector_discover` 的专家卡独立闭环。
- **双路确认阈值（0.017）** —— 本组合否决：清空全部乱码探针但砍掉 28% 单路 gold 召回，hybrid Top5 远低于评测线。

### minRelevanceScore 以 0.015 启用（深排名修剪）

2026-09-02 的校准表明不存在既清空乱码探针又保住单路召回的阈值；示例组合现在显式设 `minRelevanceScore: 0.015`——深排名修剪臂：保住全部 top-5 单路 gold（其融合分数 ≥ 1/66），修剪约 60 名以后的融合排名。双路确认替代值（0.017）会砍掉 28% 单路召回，维持不取。支撑债的运维侧：融合 RRF 分数随命中穿透——`KbSearchHit.score`（由 `search()` 在两种模式下附加——store 只排名不打分）经工具 value 与网关 wire 进工作台命中卡，以安静的等宽数字读数呈现。

## Consequences

- keyless 快照 `examples/kb-agent/tests/expert-discovery.spec.ts` 锁定场景转录（入库 → kb_search 带 [n] 引用命中应急指引 → connector_discover 返回带 ¥6,800 风险应对咨询的张会长卡）；`expert-discovery.e2e.ts` 以真实 embo-01 嵌入与一次真实 MiniMax-M3 回答跑同一场景，断言回答含 [n] 引用、应对要点（转移/备份仓、保险/报案/理赔）与按卡字段的专家推荐（张红喜、漯河、海外仓风险应对咨询）。
- 评测重跑 120 问：hybrid Top5 98.3%（出海风险 100%）、引用有效率 96.7%——高于 ≥80%/≥90% 达标线；两个 miss 已记录（一个长期存在的成本题；一个 gold 被新海运改道语料正当超越的供应链题）。
- ui-kb 注册 `connector_discover` toolview 行（查询摘要、计数 + 已发现专家、展开的专家卡清单原文）。
- 下单与 PDF 交付不进本批（N5）；卡上的「可下单」提示是服务交付物/定价字段的呈现，不是下单通道。
