# Agent Note: 数据资产市场页 + 连接器页（V5）：BFF 域、下单确认卡、交付时间线

Status: implemented

[English](2026-09-07-market-and-connector-pages.md) | 中文

Date: 2026-09-07 · 范围：packages/host/apiproxy、packages/client/ui-assets、packages/client/ui-connectors、examples/kb-agent

## Problem

V5 页面波（plans/nocobase-native-integration/02-design.md §3.1/§3.2 与 03-batches.md 的 V5 节）要求两个会话页签及其网关域，且不建任何平行写路径：市场页（板块门户、目录、详情、下单走确认卡）与连接器页（数据源目录、交付跟踪、接入引导），全部数据经 BFF 读面，写复用订单域。

## What landed

- **assets 域**（list/detail/stats）：连接器缝发现的只读投影。目录=发现摘要（含可下单服务的定价/交付物/服务 id）；计数=发现 + 可选订单缝（本月成交）；典型产品位来自部署种子文件（assetsSeedPath——缺省无栏、坏文件以 assets-rejected 响亮失败）。
- **connectors 域**（list/connections/transfers）：provider 注册表实时可用性（连接器缝新增 describeProviders()）+ 湖仓目录交付记录（新增 listTransfers(limit)，接口/SQLite store/内存 fake 三面同步）。无湖仓缝读作空（"仅目录"降级，非错误）。
- **ui-assets**：侧栏入口 + `market` 页签（order 11）+ 会话头桥接。三层结构照设计——门户（板块文案/计数/典型位/标签云）、目录（搜索 + 类型筛选，客户端过滤全量列表）、详情（来源/定价/交付物/专家键值对）。下单动线即 AI 交互契约：确认卡=只读键值对 + 唯一可编辑的需求简述槽 + 确认/取消；回执带订单号与状态徽标，且挺过下单后的刷新（见 Decision）。问数/引用并提问预填输入框并切回对话页签。
- **ui-connectors**：侧栏入口 + `connectors` 页签（order 12）。数据源目录带健康/缺凭据文案、按源聚合的交付统计、带去向标签的运行时间线、纯会话接力的接入引导（预填草稿 + 切页签——页面无表单）。
- **组合**：web-app bundle 名册带两包（browser 行 + 依赖）；examples/kb-agent 开启网关域（assetsEnabled/connectorsEnabled/assetsSeedPath → workspace/data/market/seed.json，已提交语料）。运营文案在数据不在代码。

## Decision

- **下单完整复用订单域。** 确认卡是呈现（对资产行的 args 纯函数）；落单是 orders.create，回执状态是下单快照。客户端不轮询：演进经会话内的订单工具行可见——设计的异步状态卡活在会话里，不在页签里。
- **回执必须挺过刷新。** 下单会刷新双缓存；目录重载清空选中资产，而回执原本渲染在详情分支里——订单明明落了（stats 已计数）结果却消失了（浏览器 e2e 现场抓到）。回执现渲染在页签顶层：动线的结果不是详情面板的子节点。
- **交付读降级、目录读响亮失败。** 无连接器缝的 connectors.list 是结构化 connectors-not-composed 拒绝；无湖仓缝的 connections/transfers 答 空。对应设计矩阵"transfer 记录缺失=仅目录"行，缝可选的部署仍可浏览。
- **provider 可观察性需要缝的读面。** providerIds() 已存在但藏了可用性；describeProviders() 投影 id + available() + capabilities 供目录。不可用的 provider 以缺凭据说明渲染而非消失（设计的降级发现立场应用于目录）。
- **传输读需要目录读 API。** SQLite store 的 README 曾写"无传输读——列表 API 等待需要它的消费者"；连接器页就是那个消费者。listTransfers(limit)（最新在前）落进接口、SQLite store（select-transfers.sql）与内存 fake。
- **assets-not-composed vs assets-connector-missing。** opt-in 门（同 ordersEnabled/nocobaseEnabled）与缝缺失拒绝分开；部署能看出该拧哪个旋钮。七个新 wire 错误码进 rpc.schema.ts 判别联合。

## Build-plane fix that the batch forced

干净的 build:lib:host 从未产出 dsh-lakehouse 的子路径 bundle（lib/data-router.js、lib/tabular.js）——根 tsdown 的 entry glob 只覆盖 {index,invariant,startup}，任何消费已发布子路径的 built 消费者（apiproxy 的 lib 一直如此）只在盘上残留旧产物时才能工作。删掉 packages/lakehouse/lakehouse/lib 使之永久化。修复：包内 tsdown.config.ts 声明全部四个运行时入口（core/scope 模式）。这是仓库构建卫生，不是 V5 特性——在此记录是因为 web e2e lane 正是暴露它的面。

## Alternatives considered

- **平行的市场写面**（assets.order）：否——订单域已拥有下单/审批/交付管线；复制任何切片都会分叉工作台工具行渲染的状态机。确认卡改为递 orders.create。
- **在 tool.call.toolview 注册市场卡**（设计文档的"市场卡与工具行双呈现"）：暂缓——connector_discover key 已由 ui-kb 的 ConnectorToolRow 占用，同 key 二次注册是冲突；市场经 assets.list 消费发现，工具行保留自己的呈现。
- **回执卡内轮询订单状态**：否——演进（pending → delivered）经会话内的订单工具行已可见；页签本地轮询为一个消费者加第二条活性通道。回执钉住下单时刻快照。
- **专用 transfer 事件域**而非读湖仓目录：否——目录的只增 trail 就是确认步骤自己的回执；平行事件表需要在每条传输路径加写钩。listTransfers 投影缝已记录的东西。

## Consequences

市场与连接器页签随默认 web bundle 发货：每个 dsh web 部署都渲染它们（网关域未开前显示空态指引），`market`/`connectors` 视图 id 与侧栏 order 6/7 成为后续页面（kg order 13、business order 14）依序排布的组合事实。湖仓缝背上了目录 README 明确推迟给"需要它的消费者"的读 API——连接器页就是那个消费者，SQLite store 相应新增 select-transfers.sql。

## Verification map

- 单元：assets-connectors-domain.spec.ts（8 例：投影/详情缺失/stats+种子/opt-in 与缝拒绝/降级）；湖仓 listTransfers（runtime + SQLite）；连接器 describeProviders；两包 client spec（65 例：四态、筛选、确认卡走查、回执、会话接力、apply 面、错误传播）。
- 无 key 快照：examples/kb-agent/tests/market-pages.spec.ts 以 markdown 金样渲染双 wire 面（真连接器缝 + 内存湖仓 + 示例自带种子），外加 not-composed 拒绝。
- 浏览器 e2e（built lane）：apps/web/tests/market-pages.e2e.ts——真实 Chromium 走 市场 浏览→详情→确认卡→回执→计数刷新 与 连接器 目录/聚合/时间线/向导接力（本机 3/3 绿）。
- 真实轨道 e2e：examples/kb-agent/tests/market-track.e2e.ts——真实 NocoBase：种子目录带定价投影、orders.create 落 pending 行、真实表格数据集传输落湖仓且 trail 回读（3/3 绿；无后端自跳过）。

## Known gaps (deliberate)

- 详情样本/血缘保持在会话内（需带租户绑定的取数 API）；目录分页在客户端；回执状态是下单快照；接入向导仅会话接力。均已记入两包 README 的 deferred-work 节。
- kb-workbench 的三个上传用例在本机浏览器 lane 无论本批如何都失败（移除两条新名册行重跑仍红，二分证实）；CI 的 Linux lane 拥有该信号。
