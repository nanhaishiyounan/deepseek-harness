# Agent Note: MiniMax 并行 tool-call 流必须在空串重发中保住首个 delta 的 id

Status: implemented

[English](2026-09-02-minimax-parallel-tool-call-id-aggregation.md) | 中文

## Problem

MiniMax-M3 对每个并行 tool-call 在**首个 delta** 携带完整 `id` 与 `function.name`，随后在续传 delta 中把这两个字段**重发为空字符串**。llm-minimax 的聚合层以字段存在性为权威（`call.id !== undefined`），于是每个并行调用的续传 delta 都会冲掉已捕获的身份。聚合出的 block 以 `unknown tool ""` 分发失败；带空 id 的 `tool_calls` 条目回放到历史后，端点对之后的每个请求都返回 `400 duplicate tool_call id: "" (2013)`——会话永久报废。更早的 kb-agent 批量入库曾观察到偶发 2013、重跑即过；任一步骤出现并行 tool-call 即可确定性地复现该故障。

## Decision

`packages/llm/llm-minimax` 内两层防线：

1. `src/translate.ts` 仅在 delta 值**非空**时推进打开 block 的 `callId`/`name`，保住每个并行调用首个 delta 的身份。`closeBlock` 在整条流从未给出 id 时合成 `chatcmpl-tool-synth-<uuid>`，保证聚合出的 block 可分发、历史可回放；随机后缀使 id 跨 step 唯一。
2. `src/serialize.ts` 按请求修复**出站** tool-call id：`serializeMessages` 跟踪已占用的 id；空或已占用的 assistant tool-call id 换成新合成 id，合成 id 队列加按 id 的配对额度，按调用顺序改写后续 tool result 的 `tool_call_id`。修复前写入的历史因此可以无 2013 地回放，而不是继续毒化会话。没有任何 assistant 调用认领过的 result id 原样透传，让端点显式报告该错配。

wire 实测记录在 `src/types.ts`（`WireToolCallDelta`）：每个调用首个 delta 带完整 id/name，并行调用的续传 delta 重发空字符串——这是对 OpenAI「缺省即省略字段」约定的偏离。`llm-deepseek` 保留 `!== undefined`：DeepSeek 的 wire 在续传 delta 中省略这些字段，该 adapter 不在本次改动范围内。

## Alternatives considered

**只在 translate 合成 id，不加 serialize 防线。** 否决：已写入历史的空 id 会让之后的每个请求继续 2013；修复必须落在请求构建处才能救回既有会话。

**用 block 序号而非 id 配对 tool result。** 否决：wire 协议只以 `tool_call_id` 配对 `role: 'tool'` 消息；基于 id 的额度机制在不发明协议的前提下保住配对。

**在 serialize 层丢弃空 name 的 tool-call。** 否决：丢弃 assistant 调用会使其 tool result 悬空（端点拒绝悬空 tool 消息），且静默篡改历史。

## Consequences

- 并行调用正确分发；每个回放请求只携带唯一、非空且与结果配对的 tool_call id。
- serialize 修复仅作用于单个请求：会话日志保留其记录的 id（存储的历史不被改写）；单调计数器让相同请求的配对结果确定一致。
- 没有任何调用认领过的 tool result id 按设计原样转发。
- kb-agent 批量入库与任何触发并行 tool-call 的预设不再有偶发 2013 风险。

## Testing

`packages/llm/llm-minimax/tests/translate.spec.ts` 回放采集的 wire 序列（`tests/fixtures/parallel-tool-calls.events.json`，同目录留存故障会话的证据摘录），断言三个并行 block 全部保住首个 delta 的 id 与 name、没有任何续传 delta chunk 退化为空身份、wire 未给 id 的并行调用获得互不相同的合成 id。`tests/serialize.spec.ts` 覆盖空/重复 id 合成、按序结果配对、合成 id 防碰撞、孤儿透传、超额空结果铸造、已唯一 id 不被改写。`tests/adapter.spec.ts` 在 mock SSE 服务器上跑通流式组装到回放的全链路，断言第二个请求只含与 tool result 配对的唯一非空 id。`tests/adapter.e2e.ts` 对真实端点跑同样的两步流程，无 `MINIMAX_API_KEY` 时自跳过。在隔离端口与独立数据库副本上对 export-tax kb-agent 场景做了产品形态复验：两个 turn 完成、八个并行 tool-call 全部身份齐全、零次 2013。
