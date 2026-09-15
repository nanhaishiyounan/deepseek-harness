# Agent Note: order_create 同步管道预算与契约修复

Status: implemented

[English](2026-09-15-order-create-budget-and-contract.md) | 中文

## Problem

AI 对话下单 `expert_services/2` 报 `tool call timed out after 60000ms`。该症状背后藏了两个缺陷：

1. **预算错配。** `order_create` 在一次工具调用里同步跑完交付管道（NocoBase 读写、kb 检索、MiniMax-M3 流式起草、PDF 渲染、附件上传）。kb-agent 组合把 expert-orders pin 在 `draftMaxTokens: 16384` / `draftTimeoutMs: 120000`，却让 tool-connector 的 `orderCreateTimeoutMs` 落在 60000 的缝默认值上——内层起草死线超过外层工具预算，任何慢于约 52s 的起草都以 `TOOL_TIMEOUT` 收场，订单搁浅在 `generating`。实机计量：NocoBase REST 读写 12-21ms，真实 MiniMax-M3 起草提示词流式 38.9s（TTFB 0.9s）——不是报错，纯粹时间不够。e2e/demo 组合 pin 了同样的 120s 起草预算却同样没配工具预算覆盖；只有网关对话路径（bundle/base 的 timeout-policy 包装 `tools/execute`）会撞上限，这解释了 demo 从未复现。
2. **fulfill 返回未规范化。** `OrdersRuntime.fulfill` 把 delivered 状态 `update` 的 wire 原始行直接返回。resourcer 对未设置列服务 SQL NULL（模型起草时 `note` 为 NULL），执行一旦活过 60s，工具输出 schema 立即以 `"value.note" must be a string` 拒绝结果。其余读路径（`create`/`get`/`list`）早已过 `normalizeOrderRow`。

## Decision

- `cordis.patch.yml`、`demo-full-journey.cordis.yml`、`expert-order-e2e.cordis.yml` pin `tool-connector.orderCreateTimeoutMs: 180000`——起草死线（120000）加非起草环节与一次 JSON 修复重试窗口。nocobase-track fixture 不动：它直驱 `orders.fulfill`，从不挂订单工具。
- tool-connector 的 `Config.orderCreateTimeoutMs` JSDoc 写明约束：预算必须覆盖组合的 `draftTimeoutMs` 加管道非起草环节。
- `fulfill` 返回 `normalizeOrderRow(settled)`，调用方与工具输出 schema 看到与其他路径一致的契约形状记录；`deliverable` appends 字段只存在于 wire，不进返回记录（附件挂载改由 update wire payload 断言）。
- `examples/kb-agent/tests/order-budget.spec.ts`（keyless）守卫三个组合的关系：`orderCreateTimeoutMs` 覆盖 `draftTimeoutMs` 加修复重试与非 draft 下界（派生见 [2026-09-15-order-create-verify-surface.zh.md](2026-09-15-order-create-verify-surface.zh.md)）。
- `examples/kb-agent/scripts/order-create-verify.mts` 复现对话工具路径（含 timeout-policy 包装），对实机栈落证据到 `demos/order-create-verify-*.md`。

## Alternatives considered

**调高缝默认值 `DEFAULT_ORDER_CREATE_TIMEOUT_MS`。** 否决：对走模板兜底起草的组合，60s 是合理预算；与 expert-orders `draftTimeoutMs` 的关系是组合级事实，包默认值无从知晓。

**把 order_create 异步化（先返回订单号，起草后置）。** 否决：工具描述、系统提示引导与 demo-full-journey 先例都承诺一次调用完成交付；异步形态已由审批轨 workflow 覆盖。产品重设计超出缺陷修复范围。

**跨插件启动校验（tool-connector 读 expert-orders 配置）。** 否决：两插件按设计互不感知；keyless spec 断言 yml 关系可给同等回归防护而无运行时耦合。

## Consequences

代价：对话内 order_create 调用现在可以合法占住工具面最长三分钟等起草完成。收益：同步交付契约在慢起草与一次 JSON 修复重试下不再搁浅 `generating` 订单；预算关系成为被测试钉住的组合不变量而非口口相传；fulfill 返回遵守与其余 orders 读面一致的记录契约，note 空值拒绝输出的问题消失。

## Testing

实机分段计时（证据：`examples/kb-agent/demos/order-create-verify-*.md`）：两次运行工具总耗时 29162ms 与 25723ms——远在 180000ms 预算内，而此前 60000ms 必失败；两单均落 `delivered`，PDF 真实落盘，附件由 NocoBase 服务（`/files/main/main/attachments/…`）。独立探针：MiniMax-M3 起草提示词端到端 38.9s，NocoBase REST 单次 12-21ms。单测：`order-budget.spec.ts` 3/3；fulfill 契令断言更新后 tool-connector + expert-orders 套件 69/69。
