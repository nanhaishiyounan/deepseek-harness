# 官网对接：ftd.lzqz.cn 形态运营站与 kb-agent 的映射

[English](WEBSITE.md) | 中文

计划 P2"官网对接"条目（plans/food-kb-agent-plan.md §四.5）原文："官网对接：ftd.lzqz.cn 形态的运营站（企业注册/订阅/积分）为独立前端项目，通过 dsh sdk（JSON-RPC/ACP）驱动 harness。"本文档即该映射——不为它在本仓库新建 API 面。

## 产品映射

| 官网能力（ftd.lzqz.cn 形态） | kb-agent / harness 落点 |
|---|---|
| 企业注册（每企业一个租户） | 一个部署 = 一个租户（`tool-kb` `tenant` 绑定 + `DSH_KB_TENANT`；见 [DEPLOY.zh.md](DEPLOY.zh.md) §3）。注册流程起一个部署实例。 |
| Agent 订阅（按角色月费） | 角色预设（`agent-presets/` + `scenarios/`）：订阅哪个角色 = 会话挂载哪个预设。预设是纯组合文件，运营站按 SKU 列出即可。 |
| 积分计量（问答 1 / 分析 5 / 报告 20） | `ctx.kb.usage(tenantId)` 的每租户累计计数（searches / ingestedDocuments / embedTexts / embedTokens），`kb_stats` 与网关 `kb.stats` 已按租户汇报；积分分级定价是运营站侧对该计数的换算。 |
| 知识库管理（50GB 免费存储钩子） | Web 工作台 KB 面板（`dsh-client-ui-kb`：stats / 检索 / 入库）与网关 `kb.*` 域。 |
| 引用溯源（企业付费关键设计） | `kb_search` 编号引用（文档名 + 标题路径）与图谱 `source_path` 溯源，会话日志可回放。 |

## 驱动通道

运营站作为独立前端项目，通过 **dsh SDK**（JSON-RPC / ACP，`packages/sdk/`）驱动 harness：会话创建/提问走 SDK 的会话面；预设选择走 SDK 的 `agentPreset.select`；用量读取走网关 `kb.stats`。本仓库不新增面向运营站的私有端点——SDK 与网关域就是契约。

## 商业叙事锚点

对标研究报告（research/2026-08-28）第 2 章：免费引流（存储 + 每日积分）→ Agent 订阅（拟人职位命名，¥99-299/月）→ 数据资产化服务（确权→评估→入表，本仓库落点是文档级确权三元组与授权范围，见 docs/subsystems/kb.zh.md"可信数据空间衔接"）。
