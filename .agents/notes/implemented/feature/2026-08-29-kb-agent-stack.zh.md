# Agent Note: kb embed providers、kb 工具套件、llm-minimax 与 kb-agent 示例

Status: implemented

[English](2026-08-29-kb-agent-stack.md) | 中文

## Problem

kb 能力缝（seam）与 SQLite store 落地后，闭环还缺四块：embed provider（任务假设 MiniMax `/embeddings` 是 OpenAI 兼容，模型名未证实）、模型可见的检索/入库/统计工具、MiniMax-M3 chat 适配器（wire 细节未证实）、以及把它们组装成"真实数据进、带引用产出出"的可运行示例。任何一块按假设而非实测实现，都会在 9 月底演示前才暴露协议误解。

## Decision

### 一切 wire 假设先实测再实现

用真实 key 对两个端点做了探测，结论直接写进实现与测试：

- **MiniMax embeddings 是原生协议而非 OpenAI 兼容**：请求体是 `{model, texts, type}`（`type` 必填，`db`/`query` 二选一），业务失败出现在 HTTP 200 的 `base_resp.status_code` 内（如 2013 参数错误、1004 鉴权失败），鉴权失败同时用 HTTP 401。可用模型是 **`embo-01`，固定 1536 维**（`embo-02` 不存在，`MiniMax-Embedding` 不存在）；批量实测 128 条通过。
- **MiniMax-M3 chat 的四个偏差**：思考以 `<think>…</think>` 内联在 `delta.content`（无 `reasoning_content` 字段，`enable_thinking: false` 不生效）；中间 chunk 携带 `finish_reason: ""`；流以 usage-only chunk（`choices: []`）加连接关闭结束，**没有 `[DONE]` 哨兵**；带 `<think>` 的助手历史回放被端点接受。usage 的 `prompt_tokens` 含缓存命中（与 DeepSeek 同语义）。

### 对称 `type: 'query'` 编码，不改缝接口

`EmbedProvider.embed()` 没有 文档/查询 角色参数，而 embo-01 要求每次请求声明 `type`。实测三种组合的相关/不相关区分度：标准非对称 db/query 为 0.784，对称全 db 为 0.818，**对称全 query 为 0.832**——对称使用不劣于标准用法。因此 kb-embed-minimax 固定 `type: 'query'`，零缝偏差；若日后实测召回要求非对称编码，升级路径是给缝加角色字段（README Known Limitations 记录）。

### llm-minimax 照 llm-deepseek 模板裁剪

保留连接快照/凭据分层/settings 卡片/重试策略结构，删除 Files API 与图像路径（M3 纯文本）。translate 层新增流式 `<think>` 拆分状态机（处理跨 chunk 断裂的标签与闭标签后跨 chunk 的空白），serialize 层把助手推理以 `<think>` 前缀回放，SSE 层以 EOF 为正常终止（接受可选 `[DONE]`）。推理力度请求抛 `UNSUPPORTED_REASONING_EFFORT`（模型思考不可关，无可选项可声明）。

### FTS5 中文检索改为 OR 短语组合

keyless 闭环首跑暴露了 kb-sqlite 的真实缺陷：`ftsMatchExpression` 把整段查询作为单个 FTS5 短语，而短语要求整串连续出现——自然语言问句永远无法命中散文。修复为：查询按非词字符切段，短段保持单短语，长段切为四字符滑动窗口（步长 2，尾部对齐），短语以 OR 连接（上限 12 个），引号内翻倍防注入；无有效短语的查询回退 LIKE。修复后同一问句从零命中变为命中 GB 2760 摘录与走访纪要的相关段落。

### 示例闭环与快照形态

`examples/kb-agent` 提供六篇脱敏语料（会议纪要/企业档案/法规摘录各两篇，内容取自项目计划与调研报告的事实）与真实文档导入脚本（复制进 gitignored workspace 再按路径入库，真实纪要绝不进仓库）。keyless 快照经真实 Loader 组合锁定工具层闭环（ingest 输出、stats、三个问句的编号引用、租户隔离、`mode: 'text'`）；with-key e2e 锁定 hybrid 入库与一次真实 M3 引用作答。测试 fixture 用环境变量钉住 SQLite 路径与 fs 根，并用 `KB_TEST_EMBED_ENV` 演示"拔掉 embed 凭据、chat 仍可用"的降级。

## Alternatives considered

- **给缝加 embed 角色参数以使用非对称编码**——被实测否决：对称 query 编码区分度最好，且改动冻结的缝接口波及四个包。
- **探测失败则默认让位 dashscope**——不需要：embo-01 探测成功，MiniMax 一把 key 通吃 chat+embedding 的计划成立。
- **kb_agent 快照走 headless 流式回放形态**——被否决：keyless 下 LLM 不可用，headless 形态锁定不了任何 kb 行为；工具层闭环经 Loader 启动已覆盖"invalid Loader exports"风险，模型层行为由 llm-minimax 自己的 mock 单测与 with-key e2e 锁定。
- **FTS5 检索引入中文分词依赖**——被否决：滑动窗口 OR 短语零依赖即达到演示所需召回，分词质量调优属 P1 评测线（100 问评测集）。

## Consequences

- MiniMax 两个端点的全部 wire 偏差都有 mock 单测锁定，端点行为漂移会在 keyless 测试里显形。
- 中文自然语言检索在 trigram 索引上可用；短语上限 12 保证长查询的 MATCH 成本有界。
- 演示路径成立：真实 key 实跑显示 hybrid 模式 3 文档 19 切片全部向量化、8 命中、M3 回答带 `[1][2][4]` 引用；拔掉 embed 凭据后 `mode: 'text'`、3 命中、回答仍带引用。
- 遗留：`truncated` 语义是"达到上限"而非"已知总数"（缝不报告总数）；M3 精确上下文窗口未披露，默认 200,000 为顾问值；思考不可关闭。

## Verification

- `pnpm vitest run packages/kb packages/llm/llm-minimax`：kb-embed-minimax 27、kb-embed-dashscope 25、tool-kb 44、kb-sqlite 42（含新增中文问句命中测试）、llm-minimax 45，全绿。
- `pnpm vitest run examples/kb-agent/tests/kb-closed-loop.spec.ts`：keyless 快照通过（`DSH_SNAPSHOT=refresh` 可重放刷新）。
- `MINIMAX_API_KEY=… pnpm vitest run --config vitest.e2e.config.ts examples/kb-agent packages/llm/llm-minimax`：真实 M3 流式与真实闭环问答通过。
