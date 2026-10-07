# LLM Chat Agent 中交互式选择卡片/表单的确定性结构化输出：业界做法调研

> 研究日期：2026-10-06 | 来源：24 个来源（以厂商官方文档/发布博客等一手来源为主） | 深度：Thorough（聚焦选型）

**背景**：我们的现状是 agent 靠 system prompt 约定让模型在自由文本里嵌入 ` ```dsh ` JSON 块（`{"v":3,"type":"choice","options":[...]}`），客户端解析渲染卡片，但概率性出现"同样场景有时不输出/格式错"。本次调研为"改工具调用路线"的选型提供依据。Provider 层可配 DeepSeek API 或 MiniMax API。

---

## 执行摘要

业界在 2024–2026 年已完成从"prompt 约定自由文本嵌标记"到"结构化通道（tool call + provider 级 strict 约束）"的整体迁移，并且这不是风格偏好而是**概率对确定性的让位**：OpenAI 在 Structured Outputs 发布博客中给出了最直接的量化对比——复杂 JSON Schema 遵循评测中，纯 prompting 的 gpt-4-0613 合规率**不足 40%**，而开启 `strict: true`（底层是 constrained decoding）的 gpt-4o-2024-08-06 达到 **100%**（[OpenAI Blog](https://openai.com/index/introducing-structured-outputs-in-the-api/)）。这正好解释了我们 ` ```dsh ` 块"概率性不输出/格式错"的根因：任何依赖模型"自觉"在自由文本里嵌合法 JSON 的方案，都停留在那条 <40% 的旧曲线上。

对我们最关键的三个事实是：**（1）DeepSeek 已提供与 OpenAI 同构的 strict tool call（Beta）**，服务端用 JSON Schema 约束 tool call 参数输出，支持 enum/anyOf/pattern/format 等（[DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)）；**（2）MiniMax API 支持 OpenAI 兼容的 tool call 但无 strict 模式**，且其模型内部本质上仍是"文本里嵌 XML 标记、由推理引擎解析成结构化字段"（[MiniMax-M2 Tool Calling Guide](https://huggingface.co/MiniMaxAI/MiniMax-M2/blob/main/docs/tool_calling_guide.md)），所以 MiniMax 路线必须自建 validate-and-retry 兜底；**（3）主流框架（Vercel AI SDK、LangChain/LangGraph、OpenAI Agents SDK）都已把"tool call → 交互式 UI 组件"作为一等公民模式**，包括用户审批/选择这类人机交互工具的完整生命周期协议（[Vercel Tool Usage](https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-tool-usage)、[LangGraph Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)）。

结论先行：**改工具调用路线方向正确且时机成熟**。工具调用路线把"格式正确性"从概率问题（prompt 遵循）变成确定性问题（服务端 grammar 约束/客户端校验重试），把"何时出卡片"从"模型是否记得嵌块"变成"模型是否决定调工具"——后者才是模型被训练强化的原生能力，且有公开基准（BFCL 等）持续度量。

---

## 关键发现（Top Findings）

1. **概率 vs 确定的量化证据**：OpenAI 官方评测，复杂 JSON Schema 遵循率：纯 prompting <40%（gpt-4-0613）→ function calling 不开 strict 居中 → strict=true 100%（[OpenAI Blog](https://openai.com/index/introducing-structured-outputs-in-the-api/)）。
2. **DeepSeek strict tool call（Beta）已可用**：`strict: true` + beta base_url，服务端校验 schema 并约束输出；支持 object/string/number/integer/boolean/array/enum/anyOf、pattern/format、$ref/$def（[DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)）。
3. **DeepSeek 官方承认 json_object 模式概率性失败**："the API may occasionally return empty content"——这是我们当前痛点的厂商级镜像证据（[DeepSeek JSON Mode](https://api-docs.deepseek.com/guides/json_mode)）。
4. **MiniMax 无 strict，且模型内部就是 XML 文本标记**：`<minimax:tool_call><invoke name="...">` 由 vLLM/SGLang 或 API 服务端解析；官方手动解析示例中"无标记则返回空列表"（[MiniMax-M2 Tool Calling Guide](https://huggingface.co/MiniMaxAI/MiniMax-M2/blob/main/docs/tool_calling_guide.md)）。
5. **Vercel AI SDK 把"需用户交互的工具"作为一等执行模式**：tool call 流式协议包含 `tool-approval-request` / `tool-approval-response` / `tool-output-denied` 等人机交互事件（[Vercel Stream Protocol](https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol)）。
6. **validate-and-retry 是成熟模式**：Instructor 库（Pydantic 校验失败自动带错误信息重试）是该路线的代表实现，适用于所有无 strict 的 provider（[Instructor README](https://github.com/instructor-ai/instructor)）。
7. **strict 也不是无条件 100%**：两个程序可检测的失效边界——安全拒绝（`refusal=true`）与 max_tokens 截断（[OpenAI Blog](https://openai.com/index/introducing-structured-outputs-in-the-api/)）。
8. **"何时调工具"的触发可靠性有专门基准**：BFCL V4、τ²-Bench、ACEBench、IFEval-FC（参数描述内嵌格式指令的遵循度）（[BFCL](https://gorilla.cs.berkeley.edu/leaderboard.html)、[IFEval-FC (arXiv:2509.18420)](http://arxiv.org/abs/2509.18420)）。

---

## 详细分析

### 一、Tool calling 作为交互 UI 载体

**参数校验严格程度（三大家对比）**：

| 维度 | OpenAI | Anthropic | DeepSeek | MiniMax |
|---|---|---|---|---|
| tool call 参数约束 | `strict: true`（constrained decoding，schema 合规 100% 承诺） | `strict: true`（grammar-constrained sampling） | `strict: true`（Beta，需 beta base_url，服务端校验 schema） | 无 strict；参数靠模型生成+引擎解析 |
| schema 校验失败 | 不支持的关键字直接报错（如 strict 下的 pattern/format 等） | SDK 提供 `transform_schema()` 把不支持的约束挪进 description；远端报错 | 服务端校验，不合规 schema 返回错误 | 手动解析失败返回空列表 |
| 触发控制（tool_choice） | `auto/none/required/函数名` | `auto/any/tool` + `disable_parallel_tool_use` | 同 OpenAI 兼容格式 | 同 OpenAI 兼容格式 |

- OpenAI strict 模式是"工程化的确定性"：官方原话是"we took a deterministic, engineering-based approach to constrain the model's outputs to achieve 100% reliability"，原理是 constrained decoding 限制每步只能采样 schema 合法的 token（[OpenAI Blog](https://openai.com/index/introducing-structured-outputs-in-the-api/)）。strict 的代价是 schema 子集受限：字符串不支持 `minLength/maxLength/pattern/format`、数字不支持 `minimum/maximum/multipleOf`、对象必须 `additionalProperties: false` 且全字段 required，上限 5000 属性/10 层嵌套（[OpenAI Structured Outputs Docs](https://platform.openai.com/docs/guides/structured-outputs)）。
- Anthropic 的 strict tool use 明确承诺两项保证："Tool `input` strictly follows the `input_schema`" 且 "Tool `name` is always valid"，底层是 grammar-constrained sampling；首次请求有 grammar 编译延迟，编译结果缓存 24 小时（[Anthropic Strict Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use)、[Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)）。注意 Anthropic 的 strict 子集与 OpenAI **不同**（SDK 会把 `minimum/maximum/minLength/maxLength` 自动变换进字段 description——即承认这些约束在服务端不强制）。
- DeepSeek strict（Beta）与 OpenAI 同构（strict: true、服务端校验、additionalProperties: false、全字段 required），但子集**更宽**：支持 string 的 `pattern` 与 `format: email/hostname/ipv4/ipv6/uuid`、number 的 `minimum/maximum/multipleOf/const/default`、anyOf、$ref/$def（含递归）；不支持 minLength/maxLength/minItems/maxItems（[DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)）。
- **validate-and-retry 模式**：schema 校验失败或模型输出不合法时，把校验错误信息回传模型重试。代表实现 Instructor："Failed validations are automatically retried with the error message"，底层用 Pydantic 定义与校验（[Instructor README](https://github.com/instructor-ai/instructor)）。这套模式适用于所有 provider（包括 MiniMax），是无 strict 时的标准兜底。

**框架如何把 tool call 渲染为交互组件（generative UI）**：

- **Vercel AI SDK**：官方定义"Generative UI is the process of connecting the results of a tool call to a React component"（[Vercel Generative UI](https://sdk.vercel.ai/docs/ai-sdk-ui/generative-user-interfaces)）。关键的是它把工具分成三种执行模式：服务端自动执行、客户端自动执行、**"Tools that require user interaction, such as confirmation dialogs"**——第三种就是"选择卡片/表单"场景：tool call 流到客户端渲染成 UI，用户交互后 `addToolOutput` 回填结果，`sendAutomaticallyWhen` 配置在所有工具结果就绪后自动续跑下一轮 agent 循环（[Vercel Tool Usage](https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-tool-usage)）。其线协议（UI Message Stream）定义了 tool 的完整生命周期事件：`tool-input-start → tool-input-delta → tool-input-available → tool-approval-request → tool-approval-response → tool-output-available / tool-output-denied`——人机审批是协议级事件（[Vercel Stream Protocol](https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol)）。
- **LangChain/LangGraph**：官方前端模式文档标题即"Display agent tool calls with rich, type-safe UI cards"：`useStream` 把 tool call 流统一为 `toolCalls` 数组，按 `toolCall.name` 分派专属卡片组件，必须处理 `running/finished/error` 三态，未知工具渲染通用 JSON 折叠卡兜底（[LangChain Tool Calling UI](https://docs.langchain.com/oss/python/langchain/frontend/tool-calling)）。人机交互层面，LangGraph 提供 `interrupt()`：暂停图执行、持久化状态（checkpointer），payload 是任意 JSON 可序列化值（如待审批的动作描述），用户答复后用 `Command(resume=...)` 恢复执行——这正是"暂停等待用户从卡片上选择"的官方机制（[LangGraph Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)）。
- **OpenAI Agents SDK**：内置 "Human in the loop: Built-in mechanisms for involving humans during agent runs"，支持审查输出、运行中断与恢复状态（[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)）。
- OpenAI 在 Structured Outputs 发布时就把 "Dynamically generating user interfaces based on the user's intent" 列为官方用例之一（[OpenAI Blog](https://openai.com/index/introducing-structured-outputs-in-the-api/)）。

```mermaid
flowchart LR
    subgraph 旧路线["旧：prompt 嵌入式（概率性）"]
        A1[system prompt 约定] --> A2[模型自由文本生成]
        A2 --> A3["```dsh JSON 块（可能缺失/格式错）"]
        A3 --> A4[客户端正则/解析渲染卡片]
        A4 -.失败.-> X((概率性失败<br/>合规率 <40% 量级))
    end
    subgraph 新路线["新：tool call 通道（确定性）"]
        B1[工具定义+JSON Schema] --> B2[模型决定调用工具]
        B2 --> B3["tool call（strict=服务端约束<br/>无 strict=客户端校验+重试）"]
        B3 --> B4[流式 tool part 事件]
        B4 --> B5[渲染交互卡片]
        B5 --> B6[用户选择/填写]
        B6 --> B7["tool result 回传<br/>（addToolOutput / Command(resume)）"]
        B7 --> B2
    end
    旧路线 -.迁移.-> 新路线
```

*两条路线的本质差异：结构化产物从"文本流里的一个可能出错的片段"变成"协议里的一个独立消息类型"，格式责任从 prompt 遵循转移到服务端约束或客户端校验。*

### 二、Prompt 嵌入式标记为何概率性失败

- **最权威的公开数据**：OpenAI 官方评测图表"Prompting Alone vs Structured Outputs (strict=false) vs (strict=true)"——复杂 JSON Schema 遵循：纯 prompting 的 gpt-4-0613 不足 40%，gpt-4o-2024-08-06 开 strict 达 100%；function calling 不开 strict 介于两者之间（即"训练对齐但无硬约束"仍有残余失败率）（[OpenAI Blog](https://openai.com/index/introducing-structured-outputs-in-the-api/)）。机制解释也在同篇：默认采样时模型"entirely unconstrained and can select any token from the vocabulary"，这种自由度正是出错之源。
- **厂商对 JSON mode 概率性失败的一手承认**：DeepSeek 官方文档在 JSON Output 一节明确警示"When using the JSON Output feature, the API may occasionally return empty content. We are actively working on optimizing this issue."（[DeepSeek JSON Mode](https://api-docs.deepseek.com/guides/json_mode)）——json_object 这种"半结构化"通道连"稳定输出非空合法 JSON"都不能保证，更不用说匹配自定义 schema。
- **JSON mode 的结构性缺陷**：OpenAI 文档明确定位——"While both ensure valid JSON is produced, only Structured Outputs ensure schema adherence"，并建议"always using Structured Outputs instead of JSON mode"（[OpenAI Structured Outputs Docs](https://platform.openai.com/docs/guides/structured-outputs)）。即：保证"是合法 JSON"≠保证"是我们约定的那个结构"。
- **MiniMax 的镜鉴（标记嵌入的真实形态）**：MiniMax-M2 即使在 tool calling 场景，模型底层输出仍是文本里的 XML 标记（`<minimax:tool_call><invoke name="get_weather"><parameter name="location">...`），工具定义在内部也只是被拼成 prompt 文本；官方"strongly recommend using vLLM or SGLang for parsing tool calls"，手动解析示例的第一行就是"无标记则返回空列表"（[MiniMax-M2 Tool Calling Guide](https://huggingface.co/MiniMaxAI/MiniMax-M2/blob/main/docs/tool_calling_guide.md)）。这说明"嵌标记"层的概率性永远存在，成熟做法是**把它包进服务端/引擎解析层**而不是让客户端直接面对。
- **学术基准侧证**：SOB（2026-04）等基准专门把"schema compliance"作为独立维度评测，因为它是公认的质量短板（[SOB (arXiv:2604.25359)](http://arxiv.org/abs/2604.25359)）；IFEval-FC（2025-09）则证明即使在 function calling 里，"参数描述内嵌的格式指令"遵循度也需单独评测、并不完美（[IFEval-FC (arXiv:2509.18420)](http://arxiv.org/abs/2509.18420)）。

**迁移案例与历史消息兼容（旧格式如何回放）**：

- 业界没有公开的"某某产品从 XML 标记迁到 tool call"的完整案例复盘（这块公开资料稀缺，见 Open Questions），但各家协议都为"历史消息保真"给出明确要求，可作迁移设计的参照：
  - **MiniMax**：interleaved thinking 模型要求历史消息必须原样回传 `<think>...</think>`，"Do not remove the `<think>...</think>` part, otherwise the model's performance will be negatively affected"（[MiniMax-M2 README](https://github.com/MiniMax-AI/MiniMax-M2/blob/main/README.md)）——旧对话回放的第一原则是"按当时格式原样回放"。
  - **DeepSeek**：明确区分三种 API 的历史插入能力——Anthropic API 与 Responses API 支持在对话中段插入工具调用消息（含 system），Chat Completion API 不支持 mid-conversation 插入 tool call，需要插入时官方建议换用前两者（[DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)）——即"把客户端侧发生的交互回灌为 tool call/tool result 消息"是被协议支持的正式姿势。
  - **Vercel AI SDK**：提供 chatbot message persistence 机制，UIMessage（含 tool part）可持久化并在恢复会话时回放（[Vercel Message Persistence](https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence)）。
  - **Anthropic**：tool use 的历史是 `tool_use`（assistant content block）+ `tool_result`（user content block）配对，循环条件是 `stop_reason == "tool_use"`（[Anthropic How Tool Use Works](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)）。
- 对我们的直接含义：旧 session log 里的 ` ```dsh ` 块在回放给模型时，应投影为"assistant 曾发起 tool call + user 曾回 tool result"的标准消息对（DeepSeek 文档确认 Responses/Anthropic 格式支持此类插入），而客户端渲染层可同时兼容旧格式存量消息。

### 三、Provider 级 Structured Output 现状（2025–2026）

- **OpenAI**：Structured Outputs 覆盖 Responses/Chat Completions/Assistants/Fine-tuning/Batch API，两种形态——function calling 带 `strict: true`（我们场景的主用形态：卡片=工具）与 `response_format: json_schema`（最终答案整体结构化）；限制子集见第一节；首次请求处理 schema 有额外延迟（<10s，复杂 schema 最多 1 分钟），之后缓存复用无额外延迟（[OpenAI Blog](https://openai.com/index/introducing-structured-outputs-in-the-api/)、[OpenAI Docs](https://platform.openai.com/docs/guides/structured-outputs)）。JSON mode 仍存在但被官方降级为"旧模型/旧项目"选项。
- **DeepSeek**：(1) Tool Calls 全量支持（OpenAI 兼容 tools/tool_choice），V3.2 起 thinking mode 也支持 tool use；(2) **strict Mode (Beta)**：`base_url=https://api.deepseek.com/beta` + 每个 function `strict: true`，服务端校验 schema，支持类型见第一节；(3) json_object 模式：需 prompt 含 "json" 字样+示例、合理 max_tokens，官方承认偶发空内容；(4) Responses API 已上线（含 `function_call` 输出项与 `response.function_call_arguments.delta` 增量流、`response.incomplete` 截断事件）（[DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)、[DeepSeek JSON Mode](https://api-docs.deepseek.com/guides/json_mode)、[DeepSeek Responses API](https://api-docs.deepseek.com/guides/responses_api)）。
- **MiniMax**：国际平台提供双协议——`https://api.minimax.io/anthropic`（Anthropic 兼容，官方推荐，支持 thinking blocks 与 interleaved thinking）与 `https://api.minimax.io/v1`（OpenAI 兼容，thinking 走 `reasoning_content` 与 content 分离）（[MiniMax Text Generation](https://platform.minimax.io/docs/guides/text-generation)）。tool call 走 OpenAI 兼容 tools/tool_choice；模型权重开源且官方给了底层 XML 标记解析指南（[MiniMax-M2 Tool Calling Guide](https://huggingface.co/MiniMaxAI/MiniMax-M2/blob/main/docs/tool_calling_guide.md)）；**未见 strict/JSON Schema 硬约束模式**（截至本次调研）。
- **Anthropic**（作参照系）：strict tool use + structured outputs 双通道均基于 constrained decoding，与 tool_choice（`auto/any/tool`）、disable_parallel_tool_use 组合可精确控制"必须出结构化输出"的场景（[Anthropic Strict Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use)）。

### 四、Constrained Decoding 在 API 场景的可用性（一段话结论）

Outlines（dottxt）、llguidance（微软）、XGrammar（MLC）这类 grammar/logit 约束引擎的定位是**推理基础设施**：llguidance 已于 2025-05 被 OpenAI 用于其 Structured Outputs 的 JSON Schema 约束（[llguidance README](https://github.com/guidance-ai/llguidance)），XGrammar 集成进 vLLM/TensorRT-LLM/Modular MAX（[XGrammar README](https://github.com/mlc-ai/xgrammar)），Outlines 被 vLLM/NVIDIA 采用（[Outlines README](https://github.com/dottxt-ai/outlines)）——结论是：**闭源 API 场景下开发者无法自行施加 constrained decoding（没有 logits 访问权），它的可用形态只有两种——provider 内置的 strict 模式（OpenAI/Anthropic/DeepSeek），或自托管/开源权重场景下在推理引擎层开启（vLLM `structured_outputs`、SGLang 等；MiniMax-M2 开源权重 + vLLM 即可得到引擎级 grammar 约束）**；因此对我们这种"DeepSeek API + MiniMax API"双 provider 的 harness 而言，正确的抽象不是引入这些库，而是把"strict 可用性"建模为 provider 能力位，strict 缺席时用客户端 validate-and-retry 兜底。

### 五、工具调用路线下的决策可靠性

- **"tool call 作为唯一结构化通道"是业界默认实践**：Anthropic 对 tool use 的定位是"Tool use is a contract between your application and the model……makes the model behave less like a text generator and more like a function you call"——结构化输出走工具、自然语言走 text content，两个通道天然分离（[Anthropic How Tool Use Works](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)）。OpenAI 的函数式（strict）与文本式（json_schema response_format）分立也是同一思想。据此，"禁止在自由文本里再嵌入卡片标记"没有争议，风险在于迁移期新旧并存——业界做法是消息协议层区分（tool part vs text part），渲染端兼容旧块、生成端只走新通道。
- **工具描述写法（决定触发可靠性的最大因素）**：Anthropic 官方最佳实践——"Provide extremely detailed descriptions. This is by far the most important factor in tool performance"，每个工具描述至少 3–4 句，说清"做什么、何时用、返回什么、不返回什么、边界何在"；复杂工具用 `input_examples`（schema 校验过的输入示例，即"工具内置 few-shot"）（[Anthropic Define Tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)）。官方还给出好/差描述对照（好：解释适用时机与数据语义；差："Gets the stock price for a ticker."）。
- **强制触发手段**：需要"必须出卡片"的确定性场景可用 `tool_choice` 强制（OpenAI `required`/指定函数名，Anthropic `any`/`{"type":"tool"}`，DeepSeek/MiniMax 同 OpenAI 语义）+ `disable_parallel_tool_use` 收敛为单次调用（[Anthropic Tool Use Overview](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview)）。这相当于把"触发可靠性"也做成确定性的兜底开关。
- **触发可靠性有公开数据可参照**：Berkeley Function-Calling Leaderboard（BFCL）已迭代到 V4（从单轮函数调用测到多轮 agentic 评测），专测"该调工具时调对工具、参数正确"（[BFCL](https://gorilla.cs.berkeley.edu/leaderboard.html)）；τ²-Bench 用用户模拟器测对话中的工具使用（[MiniMax-M2 README 引用](https://github.com/MiniMax-AI/MiniMax-M2/blob/main/README.md)，其中列有各模型 SWE-bench/Tau-Bench/AgentCompany 等工具型基准横向分数）；IFEval-FC 进一步揭示：即使在工具调用里，**参数描述中的格式约束遵循**也不是 100%（750 个算法判分用例），说明工具描述里写的枚举/格式约束仍需客户端校验兜底（[IFEval-FC (arXiv:2509.18420)](http://arxiv.org/abs/2509.18420)）。
- **工具过多会伤触发质量**：Anthropic 给出阈值信号——工具集超过约 20 个时建议启用 tool search（工具按需加载而非全量注入），配合 prompt caching 与 context editing 管理 tool 定义与 tool_result 的上下文膨胀（[Anthropic Manage Tool Context](https://platform.claude.com/docs/en/agents-and-tools/tool-use/manage-tool-context)）。
- **"硬保证"的边界要有清醒认识**：Anthropic 明确提示工具级限制字段"not a hard API-level block……Do not rely on it as a security boundary"，客户端仍需防御性处理任何工具调用（[Anthropic Programmatic Tool Calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)）；OpenAI 也声明 strict 下模型选择 refusal 或触达 max_tokens 时仍会破坏 schema 输出（[OpenAI Blog](https://openai.com/index/introducing-structured-outputs-in-the-api/)）。**触发可靠性 ≫ 格式可靠性**：格式可以约束到 100%，"是否该调"永远是概率的，需用 tool_choice/规则/重试治理。

---

## 对我们的选型启示

1. **方向确认：卡片从"文本块"升格为"工具"**。定义 `ask_user_choice`（options 走 enum/数组 schema）与 `ask_user_form`（字段走 object schema）两类工具，system prompt 中删除 ` ```dsh ` 输出约定、明确"呈现选择/表单只能通过这两个工具"。这正是 Vercel AI SDK"需用户交互的工具"与 LangGraph `interrupt()` 的主流形态，客户端从"解析文本流"改为"消费 tool part 事件、用户答复后回填 tool result 再续跑"。
2. **Provider 能力分层设计：strict 是能力位，不是默认**。DeepSeek 侧开 beta strict tool call（注意其 schema 子集比 OpenAI 宽、支持 enum/pattern/format，卡片 options 用 enum 即可拿到服务端级约束）；MiniMax 侧无 strict，provider 抽象层必须内建 Instructor 式 validate-and-retry（Pydantic/zod 校验 tool args，失败把错误信息回传模型重试，设重试上限与降级路径）。可选增强：MiniMax 开源权重自托管 + vLLM 的 grammar 约束可消掉该层，但成本另计。
3. **历史消息兼容：投影而非重写**。旧 session log 里的 ` ```dsh ` 块回放给模型时，投影为标准 tool_use/tool_result 消息对（DeepSeek 文档确认 Responses/Anthropic 格式支持 mid-conversation 插入；Chat Completion 格式不支持，切换需注意）；客户端渲染层保留对存量旧格式块的兼容。MiniMax 要求 `<think>` 原样回传的教训：回放保真优先于"清洗美化"。
4. **触发可靠性治理三件套**：工具描述按 Anthropic 标准写足（3–4 句起步、说清"何时该出卡片/何时不该"、附 input_examples）；确定要出卡片的场景用 `tool_choice` 强制兜底；把"该出卡片时调工具"做成 IFEval-FC 式小型回归集（每类卡片若干必触发场景 + 若干不该触发场景），接入现有 snapshot 测试防回归——本项目"模型可见⟺已记录"的会话日志契约正好使这类回放测试成本很低。
5. **失效路径产品化**：strict/校验解决"格式错"，解决不了"安全拒绝（refusal）"与"max_tokens 截断"（OpenAI 明示的两个失效边界），也解决不了"用户不点卡片"——卡片交互需要超时/重发/降级为纯文本提问的产品路径（LangGraph interrupt 无限期等待 + 恢复、Vercel `tool-output-denied` 事件都是协议内的现成锚点）。

---

## 反方观点与风险（Contrarian Views & Risks）

- **strict 不是银弹，且有沉默降级风险**：两个官方承认的失效边界（refusal、max_tokens 截断）都发生在 strict 开启时，且 refusal 之外的场景错误可能被"合法但语义错"的 JSON 掩盖——schema 合规 ≠ 内容正确（SOB 基准专门区分 schema compliance 与 value correctness 两个维度，[SOB (arXiv:2604.25359)](http://arxiv.org/abs/2604.25359)）。卡片渲染层仍需业务级断言（options 非空、选项文案与上下文相关等）。
- **各家 strict 子集不兼容**：同一份 schema 在 OpenAI strict 会被 pattern/format 报错、在 DeepSeek strict 合法、在 Anthropic 会被 SDK 静默改写（约束挪进 description 后不再强制）。跨 provider 的"一份 schema 通吃"不存在，harness 需要按 provider 做 schema 适配层——这是工具调用路线新增的、我们现有 ```dsh 方案反而不存在的维护成本。
- **结构化通道可能伤害回答质量**：模型被约束"只出结构化输出"时，解释性/安抚性文本的缺失可能降低体验；Vercel 把 text part 与 tool part 并存作为默认消息模型正是为此。方案上应允许 assistant 在同一轮"文字说明 + 调卡片工具"（Anthropic 的 content block 序列、DeepSeek/MiniMax 的 content 与 tool_calls 并存均支持）。
- **"迁到工具调用"并不消灭概率性，只是把它移到触发层**：MiniMax 案例说明，底层永远存在"文本嵌标记"的实现层；区别只在于解析责任在谁（我们客户端 vs provider/引擎）。若 MiniMax 服务端解析在长上下文/多工具下漏出 XML 残片（工具指南的手动解析路径暗示这可能发生），客户端仍要做防御性正则清洗。
- **生态锁定与协议漂移风险**：tool call 的消息格式、流事件、strict 语义都在快速演化（DeepSeek strict 还是 Beta、Anthropic structured outputs 2025 年末才 GA、Vercel 协议 v2 仍在加 approval 事件）。harness 的 provider 抽象要预留版本演进空间，避免把某家 Beta 语义硬编码进核心循环。

---

## 未决问题（Open Questions）

- **公开的迁移复盘稀缺**：没有找到主流产品"从自由文本标记迁到 tool call"的官方工程复盘（各家只发布"新能力"，不发布"旧方案失败率"）——我们的量化对比只能依赖 OpenAI 40%→100% 这组官方数据外推。
- **MiniMax API 层 strict 的时间表**：M2 开源权重 + vLLM 可获得 grammar 约束，但托管 API 是否会跟进 strict 模式未知；若跟进，validate-retry 层可降级为纯防御。
- **多卡片并发的交互范式**：parallel tool use 下"同时出两张卡片等用户分别作答"的 UX 范式各家文档都未展开（Vercel 有 `sendAutomaticallyWhen` 处理多工具结果，但选择类卡片并排的实践案例少）。
- **"该出卡片时不出"的量化基线**：BFCL 等基准测通用工具触发，"对话式表单场景的卡片触发率"没有现成公开数字，需要我们在迁移时自建基线（建议随 PR 附回归集）。
- **DeepSeek strict Beta 的稳定性与配额**：文档未说明 Beta 的 SLA、beta base_url 与正式 URL 的合并时间表。

---

## 来源（Sources）

| # | 来源 | 类型 | 日期 | 链接 |
|---|------|------|------|------|
| 1 | OpenAI: Introducing Structured Outputs in the API | 一手（发布博客，经 Web Archive 存档） | 2024-08 | https://openai.com/index/introducing-structured-outputs-in-the-api/ |
| 2 | OpenAI: Structured Outputs 官方指南 | 一手（文档） | 持续更新 | https://platform.openai.com/docs/guides/structured-outputs |
| 3 | DeepSeek: Tool Calls 指南（含 strict Mode Beta） | 一手（文档） | 2025–2026 | https://api-docs.deepseek.com/guides/tool_calls |
| 4 | DeepSeek: JSON Output（含空内容警示） | 一手（文档） | 2025–2026 | https://api-docs.deepseek.com/guides/json_mode |
| 5 | DeepSeek: Using the Responses API | 一手（文档） | 2025–2026 | https://api-docs.deepseek.com/guides/responses_api |
| 6 | Anthropic: Strict Tool Use | 一手（文档） | 2025–2026 | https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use |
| 7 | Anthropic: Structured Outputs | 一手（文档） | 2025–2026 | https://platform.claude.com/docs/en/build-with-claude/structured-outputs |
| 8 | Anthropic: Define Tools（最佳实践） | 一手（文档） | 2025–2026 | https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools |
| 9 | Anthropic: How Tool Use Works | 一手（文档） | 2025–2026 | https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works |
| 10 | Anthropic: Manage Tool Context | 一手（文档） | 2025–2026 | https://platform.claude.com/docs/en/agents-and-tools/tool-use/manage-tool-context |
| 11 | Anthropic: Tool Use Overview | 一手（文档） | 2025–2026 | https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview |
| 12 | Anthropic: Programmatic Tool Calling | 一手（文档） | 2025–2026 | https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling |
| 13 | MiniMax: M2 Tool Calling Guide | 一手（官方指南） | 2025 | https://huggingface.co/MiniMaxAI/MiniMax-M2/blob/main/docs/tool_calling_guide.md |
| 14 | MiniMax: M2 README（模型卡+基准） | 一手 | 2025 | https://github.com/MiniMax-AI/MiniMax-M2/blob/main/README.md |
| 15 | MiniMax Open Platform: Text Generation | 一手（文档） | 2025–2026 | https://platform.minimax.io/docs/guides/text-generation |
| 16 | Vercel AI SDK: Generative User Interfaces | 一手（文档） | 持续更新 | https://sdk.vercel.ai/docs/ai-sdk-ui/generative-user-interfaces |
| 17 | Vercel AI SDK: Chatbot Tool Usage | 一手（文档） | 持续更新 | https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-tool-usage |
| 18 | Vercel AI SDK: Stream Protocol | 一手（文档） | 持续更新 | https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol |
| 19 | Vercel AI SDK: Chatbot Message Persistence | 一手（文档） | 持续更新 | https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence |
| 20 | LangChain: Tool Calling UI（前端模式） | 一手（文档） | 2025–2026 | https://docs.langchain.com/oss/python/langchain/frontend/tool-calling |
| 21 | LangGraph: Interrupts（HITL） | 一手（文档） | 2025–2026 | https://docs.langchain.com/oss/python/langgraph/interrupts |
| 22 | OpenAI Agents SDK（HITL 机制） | 一手（文档） | 2025–2026 | https://openai.github.io/openai-agents-python/ |
| 23 | Instructor（validate-and-retry 库） | 一手（项目 README） | 持续更新 | https://github.com/instructor-ai/instructor |
| 24 | llguidance / XGrammar / Outlines（constrained decoding 引擎） | 一手（项目 README） | 2024–2026 | https://github.com/guidance-ai/llguidance 、https://github.com/mlc-ai/xgrammar 、https://github.com/dottxt-ai/outlines |
| 25 | BFCL V4（Berkeley Function-Calling Leaderboard） | 一手（评测榜） | 持续更新 | https://gorilla.cs.berkeley.edu/leaderboard.html |
| 26 | IFEval-FC (arXiv:2509.18420) | 学术论文 | 2025-09 | http://arxiv.org/abs/2509.18420 |
| 27 | SOB: The Structured Output Benchmark (arXiv:2604.25359) | 学术论文 | 2026-04 | http://arxiv.org/abs/2604.25359 |

---

## 方法论（Methodology）

- **两层研究架构**：Layer 1 发现层因环境受限做了降级——chrome-devtools MCP 浏览器未连接，DuckDuckGo/Bing/Mojeek 均拦截 curl 抓取，故发现层改用"已知域名直取 + 站点 llms.txt/sitemap 索引递归 + arXiv API 检索"组合；Layer 2 深读层完整执行：全部 27 个来源经 curl 抓取原文、Python HTML 解析提取正文/关键段落、逐条核对原文措辞（如 DeepSeek 空内容警示、MiniMax XML 标记、OpenAI 40%→100% 数据均出自原文摘录）。
- **一手来源优先**：五节中所有关键结论均锚定厂商官方文档/发布博客/官方项目 README/arXiv 论文；OpenAI 发布博客正文经 Web Archive 2026-10-05 快照获取（原文站 403）。
- **检索路径**：DeepSeek sitemap → tool_calls/json_mode/responses_api；Anthropic llms.txt → strict-tool-use/structured-outputs/define-tools 等 7 页 .md 直出；Vercel llms.txt（4.6MB 全文）定位 generative-ui/stream-protocol/persistence；LangChain /llms.txt 递归索引 → tool-calling/human-in-the-loop/interrupts；GitHub raw（MiniMax/Instructor/三 decoding 引擎）；arXiv API（"JSON schema"+LLM+benchmark）。
- **局限**：(1) 未能获取 BFCL 具体分数表（排行榜为 JS 渲染），触发可靠性仅引用基准存在性与 MiniMax README 的横向基准表；(2) "迁移案例复盘"公开资料稀缺，相关结论以协议层的回放/保真要求替代（已在 Open Questions 中声明）；(3) 各厂商文档持续更新，本报告快照日期 2026-10-06，DeepSeek strict 仍为 Beta 状态。
