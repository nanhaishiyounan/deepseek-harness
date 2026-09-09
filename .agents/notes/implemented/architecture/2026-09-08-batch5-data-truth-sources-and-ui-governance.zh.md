# 批次五数据真源扩充、workflow 触发残留清理与 UI 定向治理

Status: implemented

[English](2026-09-08-batch5-data-truth-sources-and-ui-governance.md) | 中文

## Problem

工作台的业务面单薄（市场 20 张卡大半是 e2e/demo 残留、真实专家画像仅一位、订单挤在四个高噪声的天里、语料 25 篇、图谱 567 节点），七页面又带着审计出的乱源：业务对象切换器混入系统表（Roles/Users）与未翻译的 `{{t("Roles")}}` 键、首项是占位 option、轨迹页签插在页签环中部违背设计基线、图谱图例 37 项平铺且"专家"重复无语境、连接器页交付跟踪裸露空态。

## Decision

三个决策，各自守住已经对的部分：

1. **扩充真源独立成文件，dataset.json 一字不动。** `workspace/data/experts/dataset.json` 是张红喜数据集的权威真源，被六个测试面消费——`seed-experts.spec.ts` 断言精确计数（`{ experts: 1, expertServices: 3, datasets: 3, sourceRows: 3 }`），三套 spec 的 mock 服务与快照直接吃它的行内容。批次五扩充因此走 `workspace/data/experts/roster-batch5.json`（32 位专家 + 49 项服务 + 23 份知识资产）与 `workspace/data/market/assets-batch5.json`（63 条八域资产），各配按域播种脚本（`seed-experts-roster.mts` / `seed-market.mts` / `seed-orders.mts` / `seed-lakehouse.mts` / `seed-kb.mts`），幂等键分别为 name / title / `ORD-B5-` 前缀 / 表名 / (tenantId, sourcePath)。市场资产元数据（domain/source/pricing/summary）落为一等字段：`seed-market.mts` 幂等扩展 `datasets` collection，connector-nocobase provider 把 `summary` 纳入 descriptionFields（卡面摘要）、新字段纳入 searchable。
2. **往 `orders` 直插历史必须清理 collection trigger 的残留。** NocoBase 2.2.6 实测：生产 workflow 被 toggle 关闭后，CREATE collection trigger 依然为每个新建行排 execution，停在 manual 节点。种子的 24 个 pending manual 任务随后被 `demo-full-journey` 前置的 `drainPendingApprovals` 连同自家任务一起 resolve，残留 execution 的 request 节点 POST 到 demo 已关闭的临时回调端口（ECONNREFUSED），场景 3 卡死在"订单状态 delivered"。`seed-orders.mts` 因此在播种后按 `ORD-B5-` 前缀 destroy pending executions 与 manual tasks；同因历史残留（kg-build 场景⑥）一并手工清理。任何批量插入 `orders` 的脚本都带同款清理。
3. **UI 治理对照 02-design 基线做最小定向修复**（审计项逐条"治理/不动+理由"）：切换器过滤 NocoBase 管理面 collection（listMeta 无系统表标志，名单放 ui-business 并引 02-design §3.4）、打开页面自动选中首个业务对象；轨迹页签 order 10→15 排到四个业务页之后；KG 图例按 source 分"通用类型/业务数据类型"两组；市场目录 24/页展开更多分页；domains 逗号串规整为分隔点。`Session log` 属共享插件 session-log-export——登记不动。

## Consequences

- 业务面有了运营厚度：市场 174 项（63 资产 + 23 知识资产 + 33 专家 + 52 服务）、46 篇真实 embo-01 嵌入语料、湖仓三表（240/120/108 行）各带交付跟踪记录、近 30 天 24 条历史订单、1280 节点 / 858 边图谱（张红喜 2 跳子图抽查返回 72 节点，含全部可下单服务与订单簇）。
- 钉住旧专家卡 description 格式（逗号串 domains）的测试随行为更新；locale 词条与分页文案双语落齐。
- NocoBase 行数与 DSH 页面一致（experts 33 / expert_services 52 / datasets 89 / orders 92），播种脚本重跑零重复。

## Alternatives considered

- 直接扩充 dataset.json：否——按构造必破六个测试面，且把演示规模样例与运营数据耦死。
- 播种订单期间暂停生产 workflow（WorkflowLease）：实测后否——trigger 照常排队，清理才是可靠闭环。
- BFF 侧做 `assets.list` 分页：暂缓——当前目录一页装得下，客户端展开更多即覆盖审计密度，不动 wire。
