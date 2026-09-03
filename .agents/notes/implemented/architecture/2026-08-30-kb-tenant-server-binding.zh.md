# Agent Note：kb 工具的服务端租户绑定

Status: implemented

[English](2026-08-30-kb-tenant-server-binding.md) | 中文

## 问题

P0 已把 `tenantId` 落为 SQL 层硬隔离键，但模型可见工具（`kb_search`/`kb_ingest`/`kb_stats`）仍接受 `tenant` 参数并配组合级 `defaultTenant`。模型可在对话中途点名任意租户；seam 的 SQL 隔离是真的，但请求他租户的门敞开着。P1 计划（[`plans/food-kb-agent-plan.md`](../../../../plans/food-kb-agent-plan.md)，P1-1）要求租户来自部署侧，绝不来自模型。

## 决策

把租户绑定进 `tool-kb` 配置并从模型可见面移除：

- `Config.tenant` **必填**（`z.string().required()`）；无绑定的组合在插件加载时被 schemastery 校验拒绝——fail-loud 规则中"配置错误自包含"的情形。原可选 `defaultTenant` 移除。
- 三个工具的 schema、描述与 system prompt 指引全部去掉 `tenant` 参数。由于 `defineTool` 把参数编译为**隐式开放对象根**（未声明键能通过 schema 校验），每个工具的 parse 函数额外显式拒绝 `args.tenant !== undefined` 并 fail-loud——残留或伪造的租户参数无法静默回落到绑定值。
- `kb_stats` 只统计绑定租户。跨租户计数是管理面能力，模型从不需要；暴露他租户库规模本身就是信息泄露。
- 绑定机制选型：**cordis.yml 配置（单租户部署）**，而非会话→租户映射。

配置绑定优于会话/工作区→租户映射的理由：P1 部署形态是每企业独立部署（各自租户 slug 与数据目录，见计划 P1-1 条目），部署级常量覆盖当下全部真实组合（含 `examples/kb-agent`）。租户是部署事实而非会话事实，cordis.yml 是仓库既有的部署事实显式声明点（"包边界显式 > 隐式"）。共享多租户部署需要会话上下文插件与 `SessionEventMap` 成员（模型可见⟺已记录）；路线图上没有共享部署，这套机制现在不合理，未来可在工具内同一个"服务端解析租户"接缝后面替换实现。

## 备选方案

- **保留 `tenant` 参数、仅与绑定不一致时 fail-loud** —— 拒绝：保留参数等于向模型宣传租户概念，且"一致放行"分支信任模型诚实；移除参数加 parse 层拒绝严格更强。
- **会话/工作区→租户映射（多租户共享部署）** —— 推迟：P1/P2 规划无共享部署需求；映射需要单租户形态用不上的会话事件机制。
- **可选租户 + 执行时 fail-loud** —— 拒绝：缺失绑定是自包含配置错误，schemastery 的加载期失败更早更清晰。

## 后果

- 每个 kb 组合必须在 `tool-kb` 配置里设 `tenant:`；`examples/kb-agent` 及其测试 fixture 设 `tenant: demo-food-co`。
- seam（`ctx.kb`）仍收显式 `tenantId`——服务端调用方（脚本、未来管理面）保持完全控制；只有模型可见面被绑定。
- `KbSearchInput` 不再携带租户；工具把绑定值传入 `ctx.kb.search({ tenantId })`。

## 验证

- `packages/kb/tool-kb/tests/tenant-binding.spec.ts` —— 三工具均拒绝模型传入的 `tenant`（即使与绑定一致）、搜索与统计看不见他租户、无租户参数的入库落在绑定租户、`Config({})` 校验失败、无任何工具 schema 声明 `tenant` 参数。
- `kb-sqlite` 既有租户隔离 SQL 测试原样保持绿色；keyless 闭环快照以绑定租户通过。
