# Agent Note: mobile 结构化卡片走 present_card 工具调用——v:3 双通道契约

Status: implemented

[English](2026-10-06-mobile-structured-cards-tool-channel.md) | 中文

## Problem

移动端填表助手的每张结构化卡片（ask_choice / ask_field / form_draft / submit_receipt / report / approval_pending / approval_result / plan_suggest / plan_result）都是模型按 prompt 约定输出的 ```dsh 围栏 JSON 块。围栏没有任何机制保证：MiniMax-M3 有时不出卡、有时格式漂移（JSON 未闭合整卡降级、`type:"choice"` 拼写漂移让卡永久折叠）、出卡后同一回合还可能自答。W 轮反馈——「结构化输出要保证一致，不能是掷骰子一样概率出现」——指的就是这个。计划（[plans/2026-10-06-mobile-structured-output-determinism.md](../../../../plans/2026-10-06-mobile-structured-output-determinism.md)）选择了业界标准解法：卡片变成带 schema 校验与显式回合结束的工具调用。

## Decision

**v:3 envelope 从此有两个通道、权威分置。** `present_card` 工具（[packages/interaction/tool-present-card](../../../../packages/interaction/tool-present-card/src/index.ts)）是模型输出九类 assistant 载荷的唯一通道：oneOf 判别的 `payload` 参数（结构约束走 schema DSL；W21-R2 起被更正——参数改为普通 `type:'json'` 声明、判别由工具层 resolve 走查承担，见 [non-intercept note](2026-10-06-present-card-nonintercept-payload-and-mirror-alignment.zh.md)）、叶子条数上限走 `execute`（ask options ≥1；report metrics 1-6 / rows ≤8 / table ≤5×10 / actions ≤4），execute 成功即调用 `exec.concludeTurn()`——模型在自己的卡片之后机制上不可能再作答。校验失败返回错误结果让模型重试（最多两次），仍失败必须用业务语言如实说明卡片没发出来。客户端 fold（[fold.ts](../../../../packages/client/ui-mobile/src/client/fold.ts)）把 `present_card` tool/call 折叠成与围栏路径完全相同的 ChatItem 种类——两个来源是同一个纯函数的字节等价输入，实时与回放共用一条链路。

**围栏保留为只读通道。** 四类用户动作载荷（form_confirm / reject_flow / approval_confirm / plan_confirm）是客户端按钮点击时确定性构造的，从来不是模型输出；它们继续走围栏。历史会话永远经围栏解析器回放；fold 的双源合并由 P3 回放矩阵实证（旧围栏卡与新工具卡在同一屏渲染）。

**两套校验器、一个协议、fixtures 镜像。** 服务端走 schema DSL + execute；客户端保留手写校验器（围栏读路径与回放兜底都依赖它）。[tool-present-card/tests/fixtures](../../../../packages/interaction/tool-present-card/tests/fixtures) 是 ui-mobile protocol spec 的镜像源；任何协议变更必须在同一个 PR 双侧同改——这个同步义务是围栏兼容保证的既定代价。

## Alternatives considered

- **围栏 + 更强的 prompt 纪律** — 放弃：仍停留在调研报告记录的 <40% 遵循率曲线上；用户抱怨的正是这条路线。
- **provider structured output / JSON mode** — 放弃：MiniMax 无 strict、JSON mode 官方自认概率空返，且卡片是「呈现给用户的中间产物」不是最终答案；工具调用 → UI 组件才是 generative-UI 的标准模式。
- **复用 ask_user_question（userQuestions 暂停 seam）** — 放弃：那是 PC 的 composer 暂停式问答语义；移动端聊天是回合制、与围栏 UX 回放等价，强接需建平行的问答通道。若产品将来要阻塞式问答，此路线是记录在案的复活路径。
- **十三类载荷全部迁移** — 放弃：四类用户动作载荷是确定性客户端输出、从不是模型输出；工具化它们只是重复按钮已有的事。
- **schema 层容忍叶子值（数字 coerce 成字符串）** — 已由 W21-R1 实现（取代原延后决定）：P3 矩阵抓到的失败形态（裸数字如 `"value": 13` 被无路径的 `matched 0` 拒绝、重试循环无法自纠）以 tool-present-card 内 execute 侧 coerce + 中文字段路径化错误 + 双侧校验器放宽落地——机制与 exact-one 坑见[宽容叶子 note](2026-10-06-present-card-lenient-leaves-and-pathed-errors.zh.md)。

## Consequences

- 格式确定性由机制保证：schema + execute + concludeTurn。「卡片后自答」这类 bug 从机制上不可达。
- 回放与来源无关：三条回放腿（围栏时代、工具时代、混合）加 reload×3 字节一致性全部通过；围栏时代 `type:"choice"` 卡的降级折叠按历史原样保留。
- 多卡批次成立：实测两张 plan_suggest 卡同批并行、回合一次结束——persona 硬纪律②（并行 present_card 必须同批）与 concludeTurn 的批次语义吻合。
- 「该出卡时出卡」的决策可靠性是实测出来的、不是假设的：W21 P3 矩阵（demos/acceptance-w21/）存有诚实数字——S2/S4/S5b 100%，S1 合同断言 5/5，S3 4/5 带一次拒绝循环破口（叶子值类型），另有一次 prompt 强化尝试经 post-fix 采样证明补不上。残余缺口是「模型能力 × 错误信息质量」的交互，归上面的延后备选所有。
- persona 契约的「值一律字符串」与工具侧严格 schema 是同一条规则的两个视图；每次改 persona 必须重新同步 `.dsh/.agent-presets` 部署镜像（setup-nocobase verify 门禁校验字节一致——W2-B7 门）。

## Verification

- `pnpm vitest run packages/interaction/tool-present-card`（载荷校验 + concludeTurn）、`pnpm vitest run packages/client/ui-mobile`（镜像 fixtures）、`pnpm run test:web -- mobile-assistant`（旧围栏 golden，一字未动）与 `-- mobile-assistant-toolcard`（工具源 golden）。
- 活体确定性矩阵 + 回放腿 + GIF：[demos/acceptance-w21/](../../../../demos/acceptance-w21/)（p3-matrix-runs.jsonl、p3-replay-results.json、p3-s1-disambiguation.gif）。
