# Agent Note：三动线端到端演示与真实轨道收口 —— demo-full-journey 串演设计、orders wire 行归一

Status: implemented

[English](2026-09-05-full-journey-demo-and-wire-normalization.md) | 中文

## Problem

工作线收口批次（N7，plans/connector-lakehouse-nocobase/02-batches.md）：三条用户核心动线（上传自动路由、专家发现与咨询、会话内下单拿 PDF）各要一次真实端到端实跑并留下可复跑的证据；期间首次在真实 NocoBase 轨道上调用 `order_status` 工具暴露了 seam 的 wire 行投影缺陷。

## Decision

### 演示脚本是「单脚本三场景串演」而非三脚本或纯 e2e 复用

`examples/kb-agent/scripts/demo-full-journey.mts` + 同名 `cordis.yml` 组合：一个 Loader 组合（kb + lakehouse + connector + expert-orders + agent/session 行，全量镜像 cordis.patch.yml 的产品面）跑三个场景，共享一个临时工作区（独立 kb/lakehouse/交付物目录经 `DEMO_*` 环境变量注入组合），逐场景前置检测（`MINIMAX_API_KEY`、`NOCOBASE_BASE_URL/NOCOBASE_API_KEY` 从环境或根 `.env` 解析 + NocoBase 存活探测）——缺前置记 SKIP 并说明，断言失败记 FAIL 且退出码非零，全部证据（问题、工具序列、断言、关键输出）实时累积写入 `demos/full-journey-<时间戳>.md`。三条理由：三条动线共享组合与租户状态，一次 boot 省两次 Loader 启动；SKIP 不是失败——真实轨道不可用时演示仍完整结束；实录即时落盘，失败场景也留有输出证据（断言顺序统一「先记录后断言」）。

### 场景 3 走 seam 直调下单而非 `order_create` 工具

`order_create` 工具的 execute 是 create + 立即 fulfill（N5 的 DSH 内同步闭环语义）；真实审批轨道上它会在 manual 任务 resolve 前把订单直接推进到 delivered，与 workflow 的 request 回调 fulfill 相互踩踏（后到的回调因 delivered→generating 非法转移而失败）。演示如实呈现真实审批轨道：`orders.create`（落 pending 行）→ 以审批人身份经 workflow-tasks API resolve → workflow request 节点回调脚本自起的 fulfill 服务（生产网关同款 client-request 信封）→ 交付。回调服务优先占 3080（生产网关端口），被占则退随机端口并重建私有 workflow 克隆（执行过的 workflow 节点不可变），结束后销毁克隆、恢复生产 workflow——与 nocobase-track e2e 同构。

### orders wire 行在 seam 边界归一（真实轨道缺陷修复）

首次真实轨道 `order_status` 调用报 `value is not lossless JSON`：NocoBase resourcer 对未设可选列回 SQL NULL（`error`、`note` 为 null 而非缺失），且 orders 表没有 `createdAt` 列（创建时间只随 create 载荷写入、行上只有交付后的 `generatedAt`）——`client.get/list` 把 wire 行直接断言成 `OrderRecord` 违反自身类型，`created_at: undefined` 显式进工具输出破坏无损 JSON 检查，`error: null` 违反输出 schema 的 string 约束。修复收在 seam 的读取边界（wire 边界归一，符合「信任同进程类型、校验跨越边界」）：`normalizeOrderRow` 把 null 可选列折叠为缺失、丢弃 wire 附带的 `deliverable` 附件行对象、`createdAt` 回退链 `createdAt → generatedAt → ''`；readOrder/list/create 三个出口统一过它。mock 轨道（orders.spec）的行是全字段 JSON，不受影响。

### connector-files 投递目录缺失是 fail-loud 不是降级

干净检出后首次 `dsh web`（或 headless patch）启动因 `workspace/data/connector-files` 不存在而 fail-loud（该目录在 `.gitignore` 的运行时排除内）。connector-file 的语义是 drop-in 目录：空目录 = 空数据集，目录不存在 = 配置错误。处置为部署准备步骤文档化（QUICKSTART 一次性准备第 4 步 mkdir + FAQ 条目），不改插件降级。

## 后果

2026-09-05 实跑（真实 MiniMax + 真实 NocoBase）：三场景 PASS，实录 `demos/full-journey-20260905-150321.md`（含浏览器层验证：`dsh web` 按 BUG-4 契约重启加载新组合后，web 会话经 connector-nocobase 命中张红喜专家卡）。orders.spec 新增 wire 归一 describe（13/13 绿）。现场观察：web 会话中 agent 自选的长尾关键词不命中 connector 的 `$includes` 子串检索——e2e/演示用确实出现在种子字段里的确切词（海外仓/中亚）命中；提示词层面的关键词引导列为后续优化，非缺陷。

## 考虑过的替代方案

- **三个独立脚本**——三次 Loader 启动、三份组合 yml、三份前置检测；共享组合的串演更接近「一个部署一次跑完三条动线」的产品叙事。
- **演示依赖长驻 `dsh web` 承接 fulfill 回调**——更「生产」，但演示可复跑性受 web 进程状态与组合新旧制约；自包含回调 + workflow 克隆与 e2e 同构且不依赖任何长驻进程。
- **工具侧（order.ts）对 null/undefined 做防御投影**——把 seam 的类型违约固化成两处契约；错在 seam 运行时违反自己声明的类型，修在 wire 读取边界。
