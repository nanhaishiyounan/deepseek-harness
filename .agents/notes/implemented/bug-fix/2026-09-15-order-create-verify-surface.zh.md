# Agent Note：order-create 验证面——轮询排序键、lease 覆盖与派生的预算守卫

Status: implemented

[English](2026-09-15-order-create-verify-surface.md) | 中文

## Problem

I0 的 order_create 修复之外存在三个验证面缺陷（生产代码实机健全，保持零改动）：

1. **分段计时被饿死。** 验证脚本的状态轮询把 `sort: '-id'`（裸字符串）传给了 `NocoBaseClient.list`，而该方法的 `sort` 选项是 `readonly string[]`（上线前按逗号拼接）。字符串没有 `join`，于是每轮轮询都在自己被吞掉的 catch 里抛错，timeline 恒为空，实录三段全部"未观测到"。最初的诊断（"硬编码状态键与轮询实际值脱节"）不成立：生产键正是 `pending`/`generating`/`delivered`。
2. **断言路径上的 lease 泄漏。** `check(timeoutMs === 180000)` 与 baseline 订单查询位于 `try/finally { lease.restore() }` 之外，此处断言失败或网络抖动会把生产 workflow #386331759214592 残留在 paused。
3. **无依据的预算余量。** `order-budget.spec.ts` 用裸常数守卫 `orderCreateTimeoutMs >= draftTimeoutMs + 30000`，没有任何推导。

## Decision

- 轮询改用 `sort: ['-id']`（client 的数组形式），节奏 60ms，通常能把一次响应落进 ~30-50ms 的 pending 窗口。窄窗配置回退锚定，保证每段都有毫秒值：回读时刻锚定 `delivered`，该订单任意状态的首见时刻锚定 `pending`，带锚定的段差以 `≤` 前缀输出。构建 timeline 前等待 120ms，让下一轮轮询看到终态 `delivered` 而非回退锚。
- `try` 块提前到 baseline 查询之前（`lease.pause()` 之后的全部路径都被覆盖）；`stopPoll` 闭包让 teardown 在任何路径停掉轮询，`lease.restore()` 失败以实录警告浮出而不阻断清理，null 守卫的 workflow 终态查询写入实录（成功时 `enabled=true`）。
- 预算守卫的余量从流水线的固定重试数学派生：一次满额 `draftTimeoutMs` 加 `REPAIR_RETRY_FLOOR_MS`（38900——`demos/order-create-verify-*.md` 实测的全长 MiniMax-M3 draft；JSON 修复重试重发同一份 JSON）加 `NON_DRAFT_FLOOR_MS`（1000——七次 NocoBase REST 往返按实测 12-21ms 计，加 kb 检索、PDF 渲染与上传，留两个数量级余量）。pin 的 180000 以 20100 的余量越过 159900 下界；`draftTimeoutMs` 超过 139100 或预算低于 159900 都会让守卫失败。
- orders.spec 的 mock 在 `orders:update` 应答里镜像真实 wire 的 NULL 可选列（对真实 resourcer 实证：`error`/`note`/`deliverablePath`/`deliverableUrl`/`generatedAt` 以 null 返回），model-drafting 用例的 `note` 断言因此在 fulfill 返回路径上测真实的 NULL 塌缩，而不是恰好缺失的字段。

## Alternatives considered

**按最坏超时派生余量**（七次 REST × 每请求 15s 超时，或第二次满额 `draftTimeoutMs`）。否决：两者都超过实机验证过的 180000/120000 pin（225000+ 与 240000+），与组合的既有立场矛盾——修复重试在剩余预算内运行。

**用行的 `createdAt` 锚定 pending 段。** 否决：orders 集合没有 `createdAt` 列（对实机行实证），无值可读。

## Consequences

分段计时重新成为轮询证据（153101 一跑：pending +185ms、generating +476ms、delivered +13004ms，总耗时 12985ms，在 180000ms 预算内）。一次实机跑在 MiniMax 慢 draft 上真实触发 180000ms TOOL_TIMEOUT，实战证明了 lease 覆盖：断言失败后 teardown 仍把 workflow #386331759214592 恢复到 `enabled=true`，终态写入实录。

观察到的生产边界（不在本修复范围，生产代码零改动）：TOOL_TIMEOUT 的 abort signal 同样中止了 `fulfill` catch 里的 `failed` 状态写回，订单滞留 `generating`（该跑的订单 #48 已人工标记 `failed` 并注明原因）。后续任务可考虑 catch 里用独立 signal 写回失败状态。

## Testing

`order-budget.spec.ts` 3/3、`orders.spec.ts` 18/18（model-drafting 用例在返回 NULL 的 mock 上断言 `'note' in delivered === false`）；typecheck 与 lint 干净。实机跑：`demos/order-create-verify-20260915-153101.md`（三段全部轮询实测，无回退锚）与 `demos/order-create-verify-20260915-152548.md`（delivered 走回退锚），均以 `enabled=true` 收尾，workflow 无残留。
