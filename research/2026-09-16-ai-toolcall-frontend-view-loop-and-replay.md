# AI 工具调用驱动前端视图变更的事件回路与可重放性设计 — 深度调研报告

> 研究日期：2026-09-16 | 来源：19 个一手来源（官方文档为主） | 深度：Thorough
> 课题：AI 工作台（前端多 tab 视图 + 后端 agent loop）中，view 工具调用经 SSE/websocket 推送到前端执行、结果回传 agent loop 的闭环设计；会话日志可重放视图变更；用户手动改视图与 AI 改视图的冲突处理。

---

## 执行摘要

调研覆盖 Vercel AI SDK v7、CopilotKit/AG-UI 协议、LangGraph、OpenAI（SSE + WebSocket mode）、Anthropic streaming、VS Code LM Tool API 六类一手来源。**业界已经收敛出清晰的同构答案**：

1. **回路形态**：AI → 前端的视图变更走「流式工具调用事件」（start/delta/available 三段式）；前端执行结果**不是**在同一个流里反向上推，而是以「工具结果消息」形式通过**一次新的 HTTP 请求重提交**给 agent loop（AI SDK 的 `addToolOutput` + `sendAutomaticallyWhen`、AG-UI 的 `RunAgentInput.messages`、LangGraph 的 `Command(resume=...)`），触发下一轮模型调用。
2. **传输选择**：面向前端的推送层默认 SSE（AI SDK 官方理由：标准化、ping 保活、自动重连、缓存友好）；WebSocket 仅在「一次 run 内大量 model↔tool 往返」的 agent loop 内部通道上划算（OpenAI 实测 20+ 工具调用的 rollout 约 40% 端到端提速）。
3. **可重放性**：把「工具调用意图 + 执行结果 + 视图状态补丁」全部事件化记入会话日志（AI SDK 的 UIMessage parts 持久化 + `reset-step`、AG-UI 的 StateSnapshot/StateDelta JSON Patch、LangGraph 的 checkpointer thread + time travel），重放即重演事件流。
4. **冲突处理主流**：不是数据库式乐观锁，而是「事件序 + 审批门」——低破坏性 AI 视图操作即时生效且可撤销（reset-step），高破坏性操作以审批事件阻塞（`toolApproval: 'user-approval'`、AG-UI `interrupt`、VS Code `prepareInvocation`），并发合并规则显式声明（AG-UI metadata "last write wins"、StateDelta 补丁序）。

---

## 分产品/模式调研

### 1. Vercel AI SDK — 三种工具执行模式与 human-in-the-loop

**来源**：
- https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage

**核心机制**：
- `execute` 是可选字段，官方明确其可选原因："you might want to forward tool calls to the client or to a queue instead of executing them in the same process"——工具调用天然支持转发给客户端执行。
- 三种执行模式：(a) 服务端自动执行（结果转发给客户端）；(b) 客户端自动执行（`onToolCall` 回调中执行并**必须调用 `addToolOutput`** 提供结果）；(c) 需用户交互的工具（渲染到 UI，交互完成后同样用 `addToolOutput` 回填，state 可为 `output-error`）。
- 回传闭环：`sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` 在所有工具结果齐备后自动把更新后的消息数组重新 POST 到 API route，触发 agent loop 下一轮迭代。
- 工具部件状态机（前端渲染依据）：`input-streaming → input-available → approval-requested → approval-responded → output-available / output-error / output-denied`。
- 服务端工具审批：`toolApproval: { toolName: 'user-approval' }` 使流中出现 `tool-approval-request` 部件，前端调用 `addToolApprovalResponse` 后服务端才执行；重要细节——"generateText and streamText don't pause execution. Instead, they complete and return tool-approval-request parts"，即审批通过**两次模型调用**实现（第一次返回审批请求，第二次带审批响应续跑），而非长挂起。

**可迁移裁决**：工具结果回传用「消息级重提交 + 自动续跑条件」而非反向流，是 AI SDK 验证过的最稳形态；审批是显式协议事件而非隐式阻塞。

### 2. Vercel AI SDK — UI Message Stream Protocol（SSE 线缆协议）

**来源**：https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

**核心机制**：
- 官方选 SSE 的理由原文："The data stream protocol uses Server-Sent Events (SSE) format for improved standardization, keep-alive through ping, reconnect capabilities, and better cache handling."
- 完整事件类型（`data: {"type":...}` SSE 行）：`start`、`text-start/text-delta/text-end`、`reasoning-start/delta/end`、`source-url/source-document`、`file`、`custom`、`data-*`（自定义数据部件）、`error`、**`tool-input-start` / `tool-input-delta` / `tool-input-available`**、**`tool-approval-request` / `tool-approval-response`**、**`tool-output-available` / `tool-output-denied`**、`start-step` / `finish-step` / **`reset-step`**、`finish`、`abort`，终止标记 `data: [DONE]`。
- `tool-input-delta` 携带 `inputTextDelta` 增量字符串，前端可实时渲染「AI 正在填参数」。
- `reset-step`："Removes all message parts received since the most recent start-step part... useful when a streamed step is retried and partial output from the failed attempt must be invalidated"——协议级重试作废机制，直接可用于 AI 视图变更的撤销。
- `start-step/finish-step` 划分每次 LLM API 调用边界，支撑多步工具循环的正确拼接。

**可迁移裁决**：这份事件清单可直接作为多 tab 工作台 SSE 协议的蓝本；`reset-step` 是「AI 改错视图如何回滚」的现成协议原语。

### 3. Vercel AI SDK — 可恢复流与消息持久化（重放）

**来源**：
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence

**核心机制**：
- 恢复前提："client-side aborts are treated as disconnects. Closing a tab, refreshing the page, or calling stop() only closes the current HTTP connection and should not cancel the underlying generation"——断连≠取消，生成在服务端继续。
- 架构：Redis 存储 UIMessage 事件流（`resumable-stream` 包提供 pub/sub）+ 数据库记录「哪个 chat 活跃哪个 stream ID」+ 两个端点（POST 创建 / GET 恢复）；`useChat({ resume: true })` 挂载时自动 GET 重连。
- 持久化：UIMessage 数组（含全部工具部件）存库即「会话日志」；重放时服务端用 `validateUIMessages` 校验工具调用/自定义部件完整性后再送模型。

**可迁移裁决**：事件流本身落 Redis、消息快照落数据库的双层持久化，是「刷新页面恢复 AI 视图变更进度」的业界标准做法。

### 4. CopilotKit — 前端工具注册与 render prop

**来源**：
- https://docs.copilotkit.ai/frontend-tools
- https://docs.copilotkit.ai/generative-ui/interactive

**核心机制**：
- v2 API：`useFrontendTool({ name, description, parameters: zodSchema, handler })` 在 React 组件内注册前端工具，"execution happening entirely in the user's browser"，官方列举用途即"Reading or modifying React component state / Triggering UI updates or animations"——正是 view 工具。
- human-in-the-loop：`useHumanInTheLoop` 的 `render: ({ args, respond, status }) => JSX`——AI 发起工具调用时前端渲染审批 UI（`status === "executing"` 时），用户点 Approve/Deny 后调用 `respond(...)` 把决定作为工具结果回传 agent。
- handler / respond 的返回值即工具结果，进入下一轮 agent loop。

**可迁移裁决**：render-prop（args//respond/status 三参数）是「AI 工具调用→前端视图内嵌审批 UI」最简洁的交互封装，值得直接抄。

### 5. AG-UI 协议（CopilotKit 主导的开放标准）— 事件分类与状态同步

**来源**：
- https://docs.copilotkit.ai/agentic-protocols/ag-ui
- https://docs.ag-ui.com/concepts/events
- https://docs.ag-ui.com/concepts/tools
- https://docs.ag-ui.com/concepts/architecture

**核心机制**：
- 定位："a lightweight, event-based protocol that standardizes how AI agents connect to user-facing applications"，CopilotKit 用它"replace custom WebSocket formats and text parsing"。
- 事件体系（16+ 类型）：Lifecycle（RunStarted/RunFinished/RunError）、Text Message（start/delta/end）、**Tool Call（ToolCallStart / ToolCallArgs / ToolCallEnd / ToolCallResult）**、**State Management（StateSnapshot / StateDelta）**、MessagesSnapshot、Activity、Subagent、Custom/Raw。
- `ToolCallArgs` 的 delta 是 JSON 片段，"Frontends should concatenate these deltas in the order received"；`toolCallId` 贯穿全部关联事件。
- **StateSnapshot**（全量重建）+ **StateDelta**："incremental updates to the agent's state in the form of JSON Patch operations (as defined in RFC 6902). This approach is bandwidth-efficient"——视图状态同步被协议标准化为快照+补丁。
- 前端工具声明方向：客户端把工具 schema 放进每次 `RunAgentInput.tools`，agent 调用时经事件流下发到前端执行；执行结果以 tool 消息（带 toolCallId）回到后续 `RunAgentInput.messages`。
- 传输中立："Transport Agnostic: AG-UI doesn't mandate how events are delivered, supporting various transport mechanisms including Server-Sent Events (SSE), webhooks, WebSockets, and more"；核心抽象 `run(input: RunAgentInput) -> Observable<BaseEvent>`，`HttpAgent` 用 POST + 事件流响应。
- metadata 合并规则显式声明为 "last write wins"。

**可迁移裁决**：AG-UI 的 StateSnapshot/StateDelta(RFC 6902) 就是「视图变更事件化 + 可重放」的现成协议骨架，可直接作为工作台事件日志的 schema 参考。

### 6. AG-UI — Interrupt（标准化中断/审批/幂等）

**来源**：https://docs.ag-ui.com/concepts/interrupts

**核心机制**：
- 中断不是独立事件而是 run 终止语义：`RunFinished` 的 `outcome: { type: "interrupt", interrupts: [...] }`（向后兼容：省略 outcome 视为 success）。
- `Interrupt` 结构：`id`（"Correlation key across interrupt, resume, idempotency, and audit"）、`reason`（分类路由）、`message`（人类可读提示）、`toolCallId`（绑定先前的 ToolCall* 序列）、`responseSchema`（期望的 resume payload JSON Schema）、`expiresAt`（"Optional ISO-8601 TTL. Stale resumes produce RunError"）、`metadata`。
- 恢复走带 payload 的 resume 请求，stale resume 显式报错。

**可迁移裁决**：`id + toolCallId 绑定 + responseSchema + TTL 过期` 四件套是「审批/中断请求」的完备协议设计，比裸的 confirm 布尔强得多。

### 7. LangGraph — interrupt / checkpointer / 持久化回路

**来源**：
- https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/
- https://langchain-ai.github.io/langgraph/concepts/persistence/

**核心机制**：
- `interrupt(payload)` 在节点内任意位置暂停，payload（JSON 可序列化）经 `stream.interrupts` 浮出给调用方；恢复用 `graph.stream_events(Command(resume=...))`，**resume 值成为 interrupt() 调用的返回值**，节点从中断点继续。
- 持久化分工：**Checkpointer**（thread 级短期记忆，"including conversation continuity, human-in-the-loop workflows, time travel, and fault tolerance"）vs **Store**（跨线程长期记忆）；`thread_id` 是状态指针，生产要求持久 checkpointer（数据库）。
- 关键重放语义："the node re-runs from the beginning on every resume"——恢复即节点从头重跑，因此官方规则"**Side effects called before interrupt must be idempotent**"，且警告 while True + interrupt 会导致指数级重放。
- 人工编辑状态：`review_node` 用 `interrupt({"instruction","content"})` 把待审内容交给人工，人返回编辑后的内容直接覆盖 graph state（"Review and edit state... useful for correcting LLMs"）。

**可迁移裁决**：「interrupt 暂停 + checkpoint 落盘 + Command(resume) 续跑 + 副作用幂等」四条约束是 agent loop 侧支持前端回路的最小完备集；节点重跑语义意味着视图工具的实现必须幂等。

### 8. OpenAI — Chat Completions/Responses 流式工具调用协议

**来源**：
- https://platform.openai.com/docs/api-reference/streaming
- https://platform.openai.com/docs/guides/function-calling

**核心机制**：
- Chat Completions：`stream: true` 返回 "data-only server-sent events"；chunk 的 `choices[0].delta.tool_calls[]` 数组按 `index` 累积，`function.arguments` 是**字符串增量拼接**（官方示例 `final_tool_calls[index].function.arguments += tool_call.function.arguments`）。
- 官方对流式工具调用的定位："Streaming can be used to surface progress by showing which function is called as the model fills its arguments, and even displaying the arguments in real time"——流式工具参数的价值就是实时 UI。
- Responses API：`response.output` 中 `function_call` 项带 `call_id`（提交结果用）、`name`、JSON 编码 `arguments`；结果以 `function_call_output` 输入项回传。
- 流式指南明确分层："This guide focuses on HTTP streaming (stream=true) over server-sent events (SSE). For persistent WebSocket transport with incremental inputs via previous_response_id, see the Responses API WebSocket mode."

**可迁移裁决**：工具参数按 index + 字符串增量累积是两大厂商一致的底层形态；工作台的 SSE 解析器要按此建模。

### 9. OpenAI — WebSocket Mode（SSE vs WS 的一手裁决依据）

**来源**：https://developers.openai.com/api/docs/guides/websocket-mode

**核心机制**：
- 定位原文："WebSocket mode is most useful when a workflow involves many model-tool round trips (for example, agentic coding or orchestration loops with repeated tool calls). Because the connection stays open and each turn sends only incremental input, WebSocket mode reduces per-turn continuation overhead... For rollouts with 20+ tool calls, we have seen up to roughly 40% faster end-to-end execution."
- `stream_id` 多路复用：单连接并行多会话、fork 会话到新流；连接级内存缓存 previous-response 状态（兼容 store=false/ZDR）；`generate: false` 预热请求状态。
- 错误时驱逐缓存：同 lane 续跑 4xx/5xx 会 evict 引用的 previous_response_id（跨 lane fork 出错则保留共享父）。

**可迁移裁决**：WS 的收益边界非常明确——高频往返 + 增量输入 + 多路复用；单次「请求→流式响应」场景 SSE 即可。工作台前端推送层用 SSE，仅当 agent loop 与模型之间（若自建）才需要考虑 WS。

### 10. Anthropic — streaming 与 input_json_delta

**来源**：https://docs.claude.com/en/api/streaming

**核心机制**：
- SSE 事件骨架：`message_start` → 每个 content block 的 `content_block_start` → 若干 `content_block_delta` → `content_block_stop` → `message_delta` → `message_stop`，穿插 `ping`。
- 工具参数增量：`delta: {"type":"input_json_delta","partial_json":"{\"location\": \"San Fra"}`——**部分 JSON 字符串**，官方指引"You can accumulate the string deltas and parse the JSON once you receive a content_block_stop event"。
- 粒度说明："Current models only support emitting one complete key and value property from input at a time"，key/value 攒齐后切成多个 delta 发出，格式为未来更细粒度预留。

**可迁移裁决**：input_json_delta 证明「工具参数流式渲染」在模型 API 层就是一等公民；前端视图工具应保留 delta 级 UI（骨架/进度）而非等待完整参数。

### 11. VS Code — Language Model Tool API

**来源**：https://code.visualstudio.com/api/extension-guides/ai/tools

**核心机制**：
- `vscode.lm.registerTool(id, toolInstance)` + package.json `contributes.languageModelTools`（含 `inputSchema`、`when` 子句控制可用性）；agent mode 据对话上下文自动调用。
- 核心原则原文："**The LLM never actually executes the tool itself, instead the LLM generates the parameters that are used to call your tool**"——与全部其他来源一致的回路本质。
- 审批挂点：`prepareInvocation` 返回确认消息，"Note that the user can also select to 'Always Allow' a certain tool"；`invoke` 返回 `LanguageModelToolResult`。
- `when` 子句按上下文裁剪工具可见性（调试中才暴露 call-stack 工具）。

**可迁移裁决**：`when` 子句（上下文裁剪工具集）+ "Always Allow"（审批记忆降级）是工作台多 tab 场景控制 AI 可操作视图范围的低成本手段。

---

## 综合结论

### 推荐回路形态（事件序列）

```mermaid
sequenceDiagram
    participant U as 用户(前端多tab视图)
    participant FE as 前端运行时(useChat类)
    participant SRV as API/编排层
    participant LOOP as Agent Loop
    participant LLM as LLM(流式API)

    U->>FE: sendMessage(text)
    FE->>SRV: POST {chatId, messages}(含历史工具部件)
    SRV->>LOOP: streamText/agent run
    LOOP->>LLM: 请求(含前端view工具schema)
    LLM-->>LOOP: SSE: tool_use参数增量(input_json_delta类)
    LOOP-->>FE: SSE: tool-input-start/delta/available(view工具)
    FE->>U: 实时渲染"AI正在改视图"(骨架/参数预览)
    FE->>FE: 执行view工具(本地改tab状态)
    FE->>FE: addToolOutput({toolCallId, output})
    Note over FE: sendAutomaticallyWhen:<br/>全部工具结果齐备
    FE->>SRV: POST 重提交(messages含tool结果部件)
    SRV->>LOOP: 校验(validateUIMessages)后续跑
    LOOP->>LLM: 下一轮调用
    LLM-->>FE: 文本/新工具调用/finish
    Note over FE,LOOP: 高破坏性view操作时:<br/>tool-approval-request → 用户审批<br/>→ addToolApprovalResponse → 服务端执行
```

裁决依据：该序列即 AI SDK（`addToolOutput` + `sendAutomaticallyWhen` + `onToolCall`）与 AG-UI（`RunAgentInput.tools`/`messages` + `run() -> Observable<BaseEvent>`）两个独立实现收敛出的同一形态——**下行是 SSE 事件流，上行是消息级 HTTP 重提交**，而不是同一连接反向上推。

### SSE vs WebSocket 的业界选择依据

| 维度 | SSE（业界默认） | WebSocket |
|---|---|---|
| 官方表态 | AI SDK：标准化、ping 保活、重连能力、缓存处理（[stream-protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)） | OpenAI：仅限 "many model-tool round trips"（[websocket-mode](https://developers.openai.com/api/docs/guides/websocket-mode)） |
| 收益边界 | 单向推送足够覆盖「AI→前端视图变更」 | 20+ 工具调用 rollout 约 40% 端到端提速；stream_id 多路复用 |
| 断连语义 | AI SDK resume streams：断连≠取消，Redis+resumable-stream 恢复 | 连接级缓存、错误驱逐、需处理重连状态 |
| 适用位置 | **前端推送层（本工作台）** | agent loop ↔ 模型内部通道（OpenAI WS mode 场景） |

**裁决**：前端↔BFF 用 SSE + 可恢复流（Redis）；不要为「结果回传」升级成 WebSocket——业界用独立 POST 重提交解决上行。

### 工具执行结果回传 agent loop 的通道形态

三种实现，同一模式：

1. **AI SDK**：`addToolOutput` 把结果写入本地 UIMessage 工具部件 → `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` 自动 POST 整个消息数组 → 服务端 `convertToModelMessages` 转模型输入。审批用 `addToolApprovalResponse` 同通道。
2. **CopilotKit/AG-UI**：前端工具结果成为 tool 消息（带 `toolCallId`）→ 随下次 `RunAgentInput.messages` 进入 `run(input) -> Observable<BaseEvent>` 的 POST。
3. **LangGraph**：前端交互结果作为 `Command(resume=...)` payload 传入 `invoke/stream`，成为 `interrupt()` 的返回值。

**共同点**：无长驻反向通道、天然幂等可审计（每次回传即一次新请求，全部落日志）、与断线恢复兼容。OpenAI WebSocket mode 的反向发送只出现在「模型 API 层」而非「前端层」。

### 视图变更记入会话日志的重放要点

1. **记事件而非记快照**：`tool-input-start/delta/available`（意图与参数）+ `tool-output-available/error/denied`（结果）+ `tool-approval-request/response`（审批）全部作为消息部件持久化（AI SDK UIMessage parts 模式）。
2. **视图状态用快照+补丁双事件**：AG-UI `StateSnapshot`（重建基线）+ `StateDelta`（RFC 6902 JSON Patch 增量）；重放 = 基线 + 按序 apply patch。
3. **重试作废有协议原语**：AI SDK `reset-step` 作废当前 step 的全部部件——重放器必须实现同语义。
4. **三层持久化分工**（综合 AI SDK + LangGraph）：事件流（Redis，活跃 run 恢复）↔ 消息日志（数据库，会话重放/`validateUIMessages` 校验）↔ checkpoint（LangGraph thread 级 graph state，time travel/容错）。
5. **副作用幂等是硬约束**：LangGraph "Side effects called before interrupt must be idempotent" + 节点恢复从头重跑——view 工具实现必须幂等，否则重放会重复改视图。

### 冲突策略主流（用户手改视图 vs AI 改视图）

- **主流不是乐观锁/版本号**：19 个一手来源中无一家用 ETag 式乐观并发做 AI↔用户视图冲突；主流是三层组合：
  1. **事件序即真相**：AI 与用户的变更都进同一会话事件流，按到达序应用（AG-UI metadata 显式 "last write wins"；StateDelta 补丁序天然线性化）。
  2. **破坏性分级审批门**：低破坏性 view 操作即时生效；高破坏性操作用审批事件阻塞——AI SDK `toolApproval: 'user-approval'`（两次模型调用实现，非长挂起）、CopilotKit `useHumanInTheLoop` render-prop、AG-UI `interrupt`（id 幂等 + `expiresAt` TTL + `responseSchema`）、VS Code `prepareInvocation` + "Always Allow" 降级。
  3. **可撤销兜底**：AI SDK `reset-step` 作废重试输出；LangGraph checkpoint/time travel 回滚 graph 状态；AG-UI 跨 lane fork 保留共享父（出错不污染源会话）。
- **用户编辑作为事件回传**：LangGraph review_node 模式——把 AI 生成的视图状态交给人工编辑，编辑值经 resume 覆盖状态，用户修改与 AI 修复合一为同一事件流。

---

## 反共识/风险提示

- **「同一 WebSocket 双向闭环」是直觉陷阱**：所有主流框架（AI SDK、AG-UI、LangGraph）都选择了请求级重提交；WS 的收益（OpenAI 40% 数据）只存在于 model↔loop 的高频内部往返，且引入连接级状态（缓存驱逐、ZDR 兼容）复杂度。
- **审批不是挂起而是两次调用**：AI SDK 明确 streamText "don't pause execution... requires two calls to the model"——依赖长连接挂起等审批的架构与主流相悖，且不耐刷新。
- **重放 ≠ 无害**：LangGraph 的指数重放警告与幂等规则表明，任何带副作用的 view 工具（如触发导航、写 localStorage）在恢复/重放语义下都会重复执行，必须在工具设计时声明幂等性。
- **`tool-input-delta` 的粒度是承诺不是保证**：Anthropic 明说当前模型一次只产出一个完整 key/value，切 delta 只为格式兼容——不要把 UI 强绑定在细粒度 delta 假设上。

## 开放问题

- OpenAI WebSocket mode 的多路复用（stream_id）在「一个用户多个并行 agent 会话改同一组 tab」场景下的隔离语义，官方文档未给前端侧指引。
- 多 tab 视图的 StateSnapshot 粒度（每 tab 一快照 or 全局单快照）无框架直接答案，需按工作台信息架构自定。
- `reset-step` 与 AG-UI StateDelta 的组合（作废已发补丁）尚无标准事件表达。

## 来源清单

| # | 来源 | 类型 | 关键证据 |
|---|---|---|---|
| 1 | https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling | 一手/官方 | toolApproval 状态机、审批两次调用 |
| 2 | https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage | 一手/官方 | onToolCall/addToolOutput/sendAutomaticallyWhen、部件状态机 |
| 3 | https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol | 一手/官方 | SSE 完整事件清单、SSE 选择理由、reset-step |
| 4 | https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams | 一手/官方 | Redis+resumable-stream、断连≠取消 |
| 5 | https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence | 一手/官方 | UIMessage 持久化、validateUIMessages |
| 6 | https://docs.copilotkit.ai/frontend-tools | 一手/官方 | useFrontendTool |
| 7 | https://docs.copilotkit.ai/generative-ui/interactive | 一手/官方 | useHumanInTheLoop render({args,respond,status}) |
| 8 | https://docs.copilotkit.ai/agentic-protocols/ag-ui | 一手/官方 | AG-UI 定位与用途 |
| 9 | https://docs.ag-ui.com/concepts/events | 一手/规范 | 16+ 事件类型、ToolCall*、StateSnapshot/StateDelta、last-write-wins |
| 10 | https://docs.ag-ui.com/concepts/tools | 一手/规范 | RunAgentInput.tools 客户端工具声明 |
| 11 | https://docs.ag-ui.com/concepts/architecture | 一手/规范 | transport agnostic、run()->Observable |
| 12 | https://docs.ag-ui.com/concepts/interrupts | 一手/规范 | Interrupt{id,toolCallId,responseSchema,expiresAt} |
| 13 | https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/ | 一手/官方 | interrupt/Command(resume)、幂等规则、节点重跑 |
| 14 | https://langchain-ai.github.io/langgraph/concepts/persistence/ | 一手/官方 | checkpointer vs store、time travel |
| 15 | https://platform.openai.com/docs/api-reference/streaming | 一手/官方 | data-only SSE、WS 指引链接 |
| 16 | https://platform.openai.com/docs/guides/function-calling | 一手/官方 | delta.tool_calls 按 index 累积 arguments |
| 17 | https://developers.openai.com/api/docs/guides/websocket-mode | 一手/官方 | WS 收益边界、40% 提速、stream_id、缓存驱逐 |
| 18 | https://docs.claude.com/en/api/streaming | 一手/官方 | content_block_* 事件、input_json_delta 部分JSON |
| 19 | https://code.visualstudio.com/api/extension-guides/ai/tools | 一手/官方 | registerTool、prepareInvocation、Always Allow |

## 方法论说明

- chrome-devtools MCP 在本会话连接失败（协议级 Not connected），按兜底方案改用本机 headless Chrome（CDP 9222）+ `--dump-dom` 渲染抓取，DuckDuckGo 发现层经 html.duckduckgo.com（headless Chrome 路径）完成，广告/导航噪音在解析时过滤；所有 19 个来源均为全文深读（正文提取脚本剔除 script/style/nav），非摘要引用。
- 未读 ChatGPT canvas 官方博文（openai.com 被 Cloudflare 拦截），canvas 模式已由 VS Code LM Tool 与 AI SDK Generative UI 路径覆盖其等价形态。
- 局限：平台文档随版本演进（如 CopilotKit v1 useCopilotAction → v2 useFrontendTool），引用以 2026-09-16 版本为准。
