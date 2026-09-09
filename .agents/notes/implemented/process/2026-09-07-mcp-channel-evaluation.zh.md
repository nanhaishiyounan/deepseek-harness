# Agent Note: MCP 通道对照评估——REST 窄面工具保持主通道

Status: implemented

[English](2026-09-07-mcp-channel-evaluation.md) | 中文

## Problem

PLAN 决策 B-6 把 agent 消费 NocoBase 的通道分两段：V1–V4 用自建窄面 REST 工具（nb_collections/nb_list/nb_get/nb_create/nb_update，复用 NocoBaseClient），V6 对照评估官方 plugin-mcp-server 的 MCP streamable HTTP 通道（`/api/mcp`，6 个 resource_* 工具）并按证据决定是否切换主通道（[plans/nocobase-native-integration/03-batches.md](../../../../plans/nocobase-native-integration/03-batches.md) V6 §4）。

## Decision

REST 窄面保持主通道，不切换。活探针（examples/kb-agent/scripts/mcp-probe.mts 对仓内 NocoBase :13000，2026-09-07）证实 MCP 端点活跃、resource_list/get/create/update/destroy/query 六工具在列、单次调用略快（31ms 对 65ms），但每个冻结产品面都要在 MCP 之上重建：写确认语义与 persona 分工住在 nb_* 工具描述里（02-design §2.2 确认分级表），错误归一要从 result 文本再解析业务失败，collection 枚举建议需要 schema 注入，MCP client 还要引入 initialize/session/心跳状态——延迟收益付不起协议成本。plugin-mcp-server 保持"可重评"项：当多 MCP server 编排需求出现或 resource_query 的通用查询显著强于窄面时重评；探针脚本即重评入口。

## Consequences

- nb_* 工具保持业务读写的唯一调优面；persona 与确认文案只有一个家。
- 后端 MCP 端点保持启用（零成本），未来重评只需复跑一个脚本而非先重建 client。
- 评估证据（延迟对照、工具清单）落在本 note 与探针输出，不进产品代码。

## Alternatives considered

- 现在切主通道到 MCP：否决——确认流语义与枚举建议是冻结产品面，生成的 resource_* 描述不承载。
- 后端禁用 plugin-mcp-server：否决——它是常驻重评探针靶，闲置零成本。

## Evidence

- 探针输出：REST 200/65ms；MCP 6 工具、resource_list ok/31ms（2026-09-07，:13000 实测）
- 源码在场：platform/nocobase/packages/plugins/@nocobase/plugin-mcp-server（快照自带，实例已启用）
